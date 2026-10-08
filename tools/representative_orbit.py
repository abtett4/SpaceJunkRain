"""Offline geometric motifs, not SGP4 propagation or event-time state estimates."""
import hashlib
import math

RADIUS_KM = 6378.135
MU = 398600.8  # WGS72; used only if a reference period is absent.
MAX_DISPLAY_SECONDS = 48 * 3600  # Presentation limit, never an accuracy window.
POLICY = "reference-ellipse-v1"


def representative_loop(row, identifier, norad_id, epoch):
    """Use reference height/tilt; deliberately choose node, periapsis direction and phase."""
    if row.get("CENTER_NAME", "EARTH") != "EARTH" or row.get("REF_FRAME", "TEME") != "TEME":
        raise ValueError("Unsupported reference frame or central body.")
    try:
        inc, low, high = (float(row[k]) for k in ("INCLINATION", "PERIAPSIS", "APOAPSIS"))
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("Need reference inclination, perigee and apogee for an orbital motif.") from exc
    if not all(math.isfinite(x) for x in (inc, low, high)) or not (0 <= inc <= 180 and 0 < low <= high):
        raise ValueError("Reference tilt or heights are invalid or intersect the reference Earth.")
    a = RADIUS_KM + (low + high) / 2
    eccentricity = (high - low) / (2 * a)
    if eccentricity >= 0.9:
        raise ValueError("This initial geometric sampler supports eccentricity below 0.9 only.")
    period = row.get("PERIOD")
    if period in (None, ""):
        period = 2 * math.pi * math.sqrt(a**3 / MU)
        period_basis = "two-body-derived-from-reference-heights"
    else:
        period = float(period) * 60
        period_basis = "reported-reference-period"
    if not math.isfinite(period) or period <= 0:
        raise ValueError("Invalid reference period.")
    phase = int.from_bytes(hashlib.sha256(f"{POLICY}:{identifier}".encode()).digest()[:8], "big") / 2**64 * math.tau
    tilt = math.radians(inc)
    trace = []
    for k in range(512):
        mean = (phase + math.tau * k / 512) % math.tau
        eccentric = mean if eccentricity < 0.8 else math.pi
        for _ in range(30):
            change = (eccentric - eccentricity * math.sin(eccentric) - mean) / (1 - eccentricity * math.cos(eccentric))
            eccentric -= change
            if abs(change) < 1e-13:
                break
        else:
            raise ValueError("Geometric ellipse solver did not converge.")
        x = a * (math.cos(eccentric) - eccentricity)
        y = a * math.sqrt(1 - eccentricity**2) * math.sin(eccentric)
        trace.append([period * k / 512, x, y * math.cos(tilt), y * math.sin(tilt)])
    trace.append([period, *trace[0][1:]])
    # The browser linearly interpolates samples; screen out any chord through Earth.
    for left, right in zip(trace, trace[1:]):
        v = [b - a for a, b in zip(left[1:], right[1:])]
        denominator = sum(x*x for x in v)
        f = max(0, min(1, -sum(a*b for a, b in zip(left[1:], v)) / denominator)) if denominator else 0
        if math.hypot(*(a + f*b for a, b in zip(left[1:], v))) <= RADIUS_KM:
            raise ValueError("Interpolated geometric loop intersects the reference Earth.")
    return {
        "schemaVersion": 1, "id": norad_id, "frame": "illustrative-equatorial", "units": "km",
        "timeSystem": "loop-seconds", "referenceSphereRadiusKm": RADIUS_KM,
        "periodSeconds": period, "referenceEpochUtc": epoch, "trace": trace,
        "construction": {"policy": POLICY, "basis": "illustrative", "inclinationDeg": inc,
                         "perigeeKm": low, "apogeeKm": high, "eccentricity": eccentricity,
                         "periodBasis": period_basis, "nodeDeg": 0, "periapsisDirectionDeg": 0,
                         "phaseAtAnchorRad": phase,
                         "meaning": "Reference heights and inclination only. Node, periapsis direction and phase are illustrative. No event-time position, drag, precession or descent is modeled."},
    }
