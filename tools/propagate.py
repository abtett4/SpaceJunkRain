"""Offline one-object SGP4 diagnostic from checksum-verified Space-Track snapshots.

This estimates a last-known orbit. It does not model atmospheric reentry or impact.
DECAY records at midnight are conservatively treated as date-only. No network I/O.
"""
import argparse
import datetime as dt
import hashlib
import importlib.metadata
import json
import math
import pathlib
import re
import sys

from sgp4 import omm
from sgp4.api import Satrec, SGP4_ERRORS, WGS72, jday

from spacetrack_fetch import read_snapshot

ROOT = pathlib.Path(__file__).resolve().parent.parent
UTC = dt.timezone.utc
NOTICE = "SGP4 estimate of a last-known orbit; not an observed reentry or impact trajectory."


def timestamp(value):
    """Space-Track times are UTC; accept its single-digit midnight hour unchanged."""
    text = str(value).strip()
    text = re.sub(r"[ T](\d):", lambda m: "T0" + m.group(1) + ":", text)
    instant = dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
    return instant.replace(tzinfo=UTC) if instant.tzinfo is None else instant.astimezone(UTC)


def iso(instant):
    return instant.isoformat().replace("+00:00", "Z")


def norm(vector):
    return math.sqrt(sum(v * v for v in vector))


def load_source(path):
    path = pathlib.Path(path).resolve()
    meta = json.loads(path.with_name("metadata.json").read_text())
    rows = read_snapshot(path.parent, meta["query"])
    try:
        label = str(path.relative_to(ROOT))
    except ValueError:
        label = str(path)
    return rows, {"path": label, **{k: meta[k] for k in
                 ("query", "sha256", "retrievedAt", "source", "rowCount")}}


def decay_context(rows, norad_id):
    historical = [r for r in rows if int(r["NORAD_CAT_ID"]) == norad_id
                  and r.get("MSG_TYPE") == "Historical"]
    if not historical:
        raise ValueError("No historical DECAY record for this NORAD ID.")
    ranked = sorted(historical, key=lambda r: int(r.get("PRECEDENCE") or 99))
    best = ranked[0]
    best_rank = int(best.get("PRECEDENCE") or 99)
    tied = [r for r in ranked if int(r.get("PRECEDENCE") or 99) == best_rank]
    if len({timestamp(r["DECAY_EPOCH"]) for r in tied}) > 1:
        raise ValueError("Conflicting equal-precedence DECAY records require manual review.")
    instant = timestamp(best["DECAY_EPOCH"])
    if any(timestamp(r["DECAY_EPOCH"]).date() != instant.date() for r in historical):
        raise ValueError("Historical DECAY records disagree on the date; inspect before propagation.")
    day_only = instant.time() == dt.time(0)
    end = instant + dt.timedelta(days=1) if day_only else instant
    info = {
        "reportedEpoch": best["DECAY_EPOCH"], "date": instant.date().isoformat(),
        "precision": "day" if day_only else "reported-time",
        "intervalUtc": [iso(instant), iso(end)],
        "intervalMeaning": "Reported UTC calendar day [start,end); not a confidence interval."
        if day_only else "Reported timestamp; physical timing uncertainty is not supplied.",
        "source": best.get("SOURCE"), "precedence": best_rank,
        "historicalMessages": historical,
    }
    return info, instant, end


def state_at(sat, instant):
    jd, fraction = jday(instant.year, instant.month, instant.day, instant.hour,
                        instant.minute, instant.second + instant.microsecond / 1e6)
    error, position, velocity = sat.sgp4(jd, fraction)
    return error, position, velocity


def initialize(row):
    for field, expected in (("CENTER_NAME", "EARTH"), ("REF_FRAME", "TEME"),
                            ("TIME_SYSTEM", "UTC"), ("MEAN_ELEMENT_THEORY", "SGP4")):
        if row.get(field) != expected:
            raise ValueError(f"Unsupported {field}; expected {expected}.")
    fields = ("MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE",
              "ARG_OF_PERICENTER", "MEAN_ANOMALY", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT")
    values = {k: float(row[k]) for k in fields}
    if not all(math.isfinite(v) for v in values.values()):
        raise ValueError("Non-finite orbital elements.")
    if not (values["MEAN_MOTION"] > 0 and 0 <= values["ECCENTRICITY"] < 1
            and 0 <= values["INCLINATION"] <= 180
            and all(0 <= values[k] < 360 for k in ("RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY"))):
        raise ValueError("Orbital elements outside supported ranges.")
    epoch = timestamp(row["EPOCH"])
    fields = dict(row)
    fields["EPOCH"] = epoch.strftime("%Y-%m-%dT%H:%M:%S.%f")
    sat = Satrec()
    omm.initialize(sat, fields, WGS72)
    error, position, velocity = state_at(sat, epoch)
    if error or not all(math.isfinite(x) for x in (*position, *velocity)):
        raise ValueError(f"Invalid state at element epoch: {SGP4_ERRORS.get(error, 'non-finite state')}")
    return sat


def choose_element(rows, norad_id, cutoff, max_age_hours):
    if not rows or any(int(r["NORAD_CAT_ID"]) != norad_id for r in rows):
        raise ValueError("GP snapshot is empty or contains a different NORAD ID.")
    eligible = [r for r in rows if timestamp(r["EPOCH"]) < cutoff]
    eligible.sort(key=lambda r: (timestamp(r["EPOCH"]), timestamp(r["CREATION_DATE"]),
                                 int(r["GP_ID"])), reverse=True)
    rejected = []
    for row in eligible:
        age = (cutoff - timestamp(row["EPOCH"])).total_seconds() / 3600
        if age > max_age_hours:
            raise ValueError(f"Newest remaining element is {age:.2f} hours old at cutoff; "
                             f"exceeds the {max_age_hours:g}-hour screening limit.")
        try:
            sat = initialize(row)
        except (ValueError, KeyError, TypeError, OverflowError) as exc:
            rejected.append({"gpId": row.get("GP_ID"), "reason": str(exc)})
            continue
        return row, sat, rejected
    raise ValueError("No numerically usable pre-cutoff element set; inspect the raw snapshot.")


def sample_orbit(sat, start, end, step_seconds):
    """Stop at the first numerical failure; never bridge failed samples or extend to impact."""
    duration = (end - start).total_seconds()
    if not math.isfinite(step_seconds) or step_seconds <= 0 or duration <= 0:
        raise ValueError("Need an increasing time window and positive finite sampling step.")
    if duration / step_seconds > 100000:
        raise ValueError("Requested sampling exceeds the one-object diagnostic limit.")
    count = math.ceil(duration / step_seconds)
    trace, diagnostics = [], []
    termination = {"reason": "requested-cutoff", "time": iso(end)}
    for i in range(count + 1):
        instant = start + dt.timedelta(seconds=min(i * step_seconds, duration))
        error, position, velocity = state_at(sat, instant)
        if error or not all(math.isfinite(v) for v in (*position, *velocity)):
            termination = {"reason": "sgp4-error" if error else "non-finite-state",
                           "time": iso(instant), "code": error,
                           "message": SGP4_ERRORS.get(error, "Non-finite state")}
            break
        trace.append([iso(instant), *position])
        diagnostics.append({"time": iso(instant), "radiusKm": norm(position),
                            "radiusMinusReferenceKm": norm(position) - sat.radiusearthkm,
                            "speedKmS": norm(velocity)})
    if len(trace) < 2:
        raise ValueError("Fewer than two valid samples; no trajectory exported.")
    return trace, diagnostics, termination


def compare_neighbors(rows, selected, norad_id, cutoff, instant, position):
    """Sensitivity check, not an uncertainty estimate or comparison to measurements."""
    epoch = timestamp(selected["EPOCH"])
    alternatives = [r for r in rows if int(r["NORAD_CAT_ID"]) == norad_id
                    and r["GP_ID"] != selected["GP_ID"]
                    and timestamp(r["EPOCH"]) < cutoff
                    and abs((timestamp(r["EPOCH"]) - epoch).total_seconds()) <= 3600]
    comparisons = []
    for row in alternatives:
        entry = {"gpId": row["GP_ID"], "epoch": iso(timestamp(row["EPOCH"])),
                 "creationDate": iso(timestamp(row["CREATION_DATE"]))}
        try:
            sat = initialize(row)
            error, r, v = state_at(sat, instant)
            if error or not all(math.isfinite(x) for x in (*r, *v)):
                raise ValueError(SGP4_ERRORS.get(error, "Non-finite state"))
            entry["separationKm"] = norm([a - b for a, b in zip(r, position)])
        except (ValueError, KeyError, TypeError, OverflowError) as exc:
            entry["error"] = str(exc)
        comparisons.append(entry)
    return {"at": iso(instant), "epochNeighborhoodSeconds": 3600, "alternatives": comparisons,
            "interpretation": "Differences between model inputs, not a calibrated error bound."}


def build_trajectory(gp_rows, decay_rows, norad_id, duration_minutes=120, step_seconds=30, max_age_hours=24):
    if any(not math.isfinite(v) or v <= 0 for v in (duration_minutes, step_seconds, max_age_hours)):
        raise ValueError("Duration, step, and maximum element age must be positive finite numbers.")
    decay, cutoff, day_end = decay_context(decay_rows, norad_id)
    row, sat, rejected = choose_element(gp_rows, norad_id, cutoff, max_age_hours)
    epoch = timestamp(row["EPOCH"])
    start = max(epoch, cutoff - dt.timedelta(minutes=duration_minutes))
    trace, samples, termination = sample_orbit(sat, start, cutoff, step_seconds)
    last_time = timestamp(trace[-1][0])
    neighbors = compare_neighbors(gp_rows, row, norad_id, cutoff, last_time, trace[-1][1:])
    warnings = [NOTICE, "An SGP4 success code does not establish physical accuracy near decay.",
                "Element-age screening is a prototype policy, not a validated accuracy bound."]
    if decay["precision"] == "day":
        warnings.append("Decay time is date-only. Trace stops at the start of that UTC day; midnight is not a reentry claim.")
    if any(timestamp(r["CREATION_DATE"]) > timestamp(row["CREATION_DATE"])
           for r in gp_rows if timestamp(r["EPOCH"]) < cutoff):
        warnings.append("Latest element epoch and latest publication differ. Selection is by epoch; see alternative-set comparison.")
    if termination["reason"] != "requested-cutoff":
        warnings.append("Trajectory was truncated at the first invalid sample.")
    result = {
        "schemaVersion": 1, "id": norad_id, "name": row["OBJECT_NAME"],
        "type": row["OBJECT_TYPE"], "objectId": row["OBJECT_ID"],
        "launchFamily": row["OBJECT_ID"][:8], "decay": decay,
        "frame": "TEME", "units": "km", "timeSystem": "UTC", "model": "SGP4", "gravityModel": "WGS72",
        "software": {"python": sys.version.split()[0], "sgp4": importlib.metadata.version("sgp4")},
        "element": {"epoch": iso(epoch), "gpId": row["GP_ID"],
                    "creationDate": iso(timestamp(row["CREATION_DATE"])),
                    "sha256": hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest(),
                    "ageAtReportedDecayHours": [(cutoff - epoch).total_seconds() / 3600,
                                                (day_end - epoch).total_seconds() / 3600],
                    "selection": "Latest usable EPOCH strictly before cutoff; ties by CREATION_DATE then GP_ID.",
                    "rejected": rejected},
        "startTime": trace[0][0], "endTime": trace[-1][0], "requestedEndTime": iso(cutoff),
        "stepSeconds": step_seconds, "trace": trace, "termination": termination,
        "diagnostics": {"sampleCount": len(trace), "referenceSphereRadiusKm": sat.radiusearthkm,
                        "radiusMinusReferenceRangeKm": [min(s["radiusMinusReferenceKm"] for s in samples),
                                                       max(s["radiusMinusReferenceKm"] for s in samples)],
                        "speedRangeKmS": [min(s["speedKmS"] for s in samples), max(s["speedKmS"] for s in samples)],
                        "neighborComparison": neighbors},
        "warnings": warnings,
    }
    return result, samples


def plot_diagnostics(result, samples, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.dates as mdates
    import matplotlib.pyplot as plt
    import numpy as np

    fig = plt.figure(figsize=(13, 8), layout="constrained")
    grid = fig.add_gridspec(2, 2, width_ratios=[1.2, 1])
    orbit = fig.add_subplot(grid[:, 0], projection="3d")
    radius_ax = fig.add_subplot(grid[0, 1])
    speed_ax = fig.add_subplot(grid[1, 1], sharex=radius_ax)
    xyz = np.array([p[1:] for p in result["trace"]])
    sphere_radius = result["diagnostics"]["referenceSphereRadiusKm"]
    u, v = np.meshgrid(np.linspace(0, 2 * np.pi, 48), np.linspace(0, np.pi, 24))
    orbit.plot_surface(sphere_radius * np.cos(u) * np.sin(v), sphere_radius * np.sin(u) * np.sin(v),
                       sphere_radius * np.cos(v), color="#bcc6cc", alpha=0.18, linewidth=0)
    orbit.plot(*xyz.T, color="#206f9f", linewidth=1.1)
    orbit.scatter(*xyz[0], color="#1d875b", s=35, label="Start")
    orbit.scatter(*xyz[-1], color="#a64b37", s=45, marker="x", label="End (time cutoff)")
    limit = float(np.max(np.linalg.norm(xyz, axis=1))) * 1.05
    orbit.set(xlim=(-limit, limit), ylim=(-limit, limit), zlim=(-limit, limit),
              xlabel="TEME x (km)", ylabel="TEME y (km)", zlabel="TEME z (km)")
    orbit.set_box_aspect((1, 1, 1))
    orbit.set_title("Equal-scale inertial orbit; reference Earth sphere", fontsize=10)
    orbit.legend(loc="upper left", fontsize=9)
    times = [timestamp(s["time"]) for s in samples]
    radius_ax.plot(times, [s["radiusMinusReferenceKm"] for s in samples], color="#206f9f")
    radius_ax.set(title="Geocentric radius minus 6378.135 km", ylabel="km (not geodetic altitude)")
    speed_ax.plot(times, [s["speedKmS"] for s in samples], color="#63529a")
    speed_ax.set(title="TEME speed", ylabel="km/s", xlabel="UTC (month-day hour:minute)")
    for ax in (radius_ax, speed_ax):
        ax.grid(alpha=0.22)
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%m-%d\n%H:%M", tz=UTC))
        ax.tick_params(labelsize=9)
    age = result["element"]["ageAtReportedDecayHours"]
    fig.suptitle(f"{result['name']} / NORAD {result['id']}\n"
                 f"Last-known orbit before reported decay date {result['decay']['date']}", fontsize=15)
    comparisons = result["diagnostics"]["neighborComparison"]["alternatives"]
    distances = [c["separationKm"] for c in comparisons if "separationKm" in c]
    comparison = f"Alternate near-epoch sets differ by up to {max(distances):.1f} km at the last sample." if distances else "No usable near-epoch alternatives."
    timing_note = ("Date-only decay: midnight is a conservative cutoff, not an observed reentry."
                   if result["decay"]["precision"] == "day" else
                   "Reported decay timestamp: physical timing uncertainty is not supplied.")
    if result["termination"]["reason"] != "requested-cutoff":
        timing_note += " Trace truncated at a propagation failure."
    fig.supxlabel(f"Element epoch: {result['element']['epoch']} | GP_ID {result['element']['gpId']}\n"
                  f"Element age at reported decay: {age[0]:.2f}–{age[1]:.2f} h. {comparison}\n"
                  f"{timing_note}\n"
                  "SGP4 success and model agreement do not establish physical accuracy. USSPACECOM via Space-Track.org.", fontsize=9)
    fig.savefig(path, dpi=160)
    plt.close(fig)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--gp-history", required=True, type=pathlib.Path, help="immutable response.json with metadata.json beside it")
    ap.add_argument("--decay", required=True, type=pathlib.Path, help="immutable historical DECAY response.json")
    ap.add_argument("--norad-id", required=True, type=int)
    ap.add_argument("--duration-minutes", type=float, default=120)
    ap.add_argument("--step-seconds", type=float, default=30)
    ap.add_argument("--max-age-hours", type=float, default=24, help="prototype screening policy, not an accuracy guarantee")
    ap.add_argument("--output-dir", type=pathlib.Path, default=ROOT / "data" / "processed" / "trajectories")
    args = ap.parse_args(argv)
    gp_rows, gp_source = load_source(args.gp_history)
    decay_rows, decay_source = load_source(args.decay)
    result, samples = build_trajectory(gp_rows, decay_rows, args.norad_id, args.duration_minutes,
                                       args.step_seconds, args.max_age_hours)
    result["sources"] = {"gpHistory": gp_source, "decay": decay_source}
    output = args.output_dir.resolve()
    if (ROOT / "data" / "raw").resolve() == output or (ROOT / "data" / "raw").resolve() in output.parents:
        raise ValueError("Processed output must not be written into data/raw.")
    output.mkdir(parents=True, exist_ok=True)
    plot_path = output / f"{args.norad_id}-diagnostic.png"
    plot_diagnostics(result, samples, plot_path)
    target = output / f"{args.norad_id}.json"
    target.write_text(json.dumps(result, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"id": result["id"], "element": result["element"],
                      "diagnostics": result["diagnostics"], "termination": result["termination"],
                      "json": str(target), "plot": str(plot_path)}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError) as exc:
        sys.exit(str(exc))
