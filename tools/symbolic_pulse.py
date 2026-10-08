"""Stable presentation locations only; never estimates of reentry geography."""
import hashlib
import math

POLICY = "sha256-equal-area-surface-v1"


def surface_pulse(event_id):
    # Independent draws for sin(latitude) and longitude give equal area on a sphere.
    digest = hashlib.sha256(f"{POLICY}:{event_id}".encode()).digest()
    u = int.from_bytes(digest[:8], "big") / 2**64
    v = int.from_bytes(digest[8:16], "big") / 2**64
    return {
        "basis": "illustrative",
        "locationPolicy": POLICY,
        "latitudeDeg": math.degrees(math.asin(2 * u - 1)),
        "longitudeDeg": 360 * v - 180,
        "durationSeconds": 600,
        "timing": "single-pulse-ending-at-display-anchor",
        "note": "Persistent random display point, uniform by spherical surface area. "
                "Not a reentry location, orbital constraint, or physical probability model. "
                "Duration is a presentation choice, not atmospheric descent time.",
    }
