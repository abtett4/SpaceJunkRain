"""Join one validated offline trajectory to the existing timeline; export web assets."""
import argparse
import datetime as dt
import hashlib
import json
import math
import pathlib
import sys

from event_time import EPOCH, POLICY, SEED, display_anchor, event_id, iso
from spacetrack_fetch import read_snapshot

ROOT = pathlib.Path(__file__).resolve().parents[1]


def stamp(value):
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))


def unknown(note):
    return {"value": None, "basis": "unknown", "note": note}


def build_manifest(trajectory, trajectory_sha, gp_rows, catalog):
    t, c = trajectory, catalog["cols"]
    if (t["frame"], t["units"], t["timeSystem"]) != ("TEME", "km", "UTC"):
        raise ValueError("Only TEME / km / UTC geometry is supported.")
    matches = [r for r in gp_rows if str(r["GP_ID"]) == str(t["element"]["gpId"])]
    if len(matches) != 1:
        raise ValueError("Selected GP record missing or duplicated.")
    row = matches[0]
    if hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest() != t["element"]["sha256"]:
        raise ValueError("Selected GP record does not match the trajectory hash.")
    if int(row["NORAD_CAT_ID"]) != t["id"] or c["id"].count(t["id"]) != 1:
        raise ValueError("Trajectory must join exactly one timeline object by NORAD ID.")
    i = c["id"].index(t["id"])
    day, precision = t["decay"]["date"], t["decay"]["precision"]
    identifier = event_id(t["id"], "reentry", day)
    anchor = (display_anchor(identifier, day) if precision == "day"
              else stamp(t["decay"]["intervalUtc"][0]))
    timeline_anchor = EPOCH + dt.timedelta(days=c["d"][i])
    if (catalog["meta"].get("presentationTime", {}).get("policy") != POLICY
            or abs((timeline_anchor - anchor).total_seconds()) > 0.001
            or c["p"][i] != (0 if precision == "day" else 1)):
        raise ValueError("Timeline timing/precision mismatch; run build_data.py --retime-existing.")
    trace = t["trace"]
    if len(trace) < 2 or any(len(p) != 4 or not all(math.isfinite(v) for v in p[1:]) for p in trace):
        raise ValueError("Need at least two finite XYZ samples.")
    times = [stamp(p[0]) for p in trace]
    if any(b <= a for a, b in zip(times, times[1:])):
        raise ValueError("Geometry sample times must strictly increase.")
    radius = t["diagnostics"]["referenceSphereRadiusKm"]
    if not math.isfinite(radius) or radius <= 0:
        raise ValueError("Invalid reference sphere radius.")
    duration = (times[-1] - times[0]).total_seconds()
    # Replay ends at the shared event anchor. Original source times are never shifted.
    start = anchor - dt.timedelta(seconds=duration)
    geometry_name = f"trajectories/{t['id']}.json"
    geometry = {"schemaVersion": 1, "id": t["id"], "frame": "TEME", "units": "km",
                "timeSystem": "UTC", "referenceSphereRadiusKm": radius,
                "trace": trace}
    reported = lambda field: ({"value": row[field], "basis": "reported", "source": f"gpHistory:{field}"}
                              if row.get(field) else unknown(f"No {field} in selected GP record."))
    orbit = {"epochUtc": t["element"]["epoch"], "frame": "TEME", "basis": "reported",
             "source": "gpHistory", "meaning": "Mean-element descriptors at source epoch, not measured reentry conditions."}
    for key, field in (("inclinationDeg", "INCLINATION"), ("raanDeg", "RA_OF_ASC_NODE"),
                       ("perigeeKm", "PERIAPSIS"), ("apogeeKm", "APOAPSIS"),
                       ("eccentricity", "ECCENTRICITY"), ("periodMinutes", "PERIOD")):
        orbit[key] = float(row[field]) if row.get(field) is not None else None
        if orbit[key] is not None and not math.isfinite(orbit[key]):
            raise ValueError(f"Non-finite {field}.")
    leo = all(orbit[k] is not None and 0 < orbit[k] < 2000 for k in ("perigeeKm", "apogeeKm"))
    attributes = {k: unknown(note) for k, note in {
        "structure": "Catalog object class alone does not establish physical intactness.",
        "debrisOrigin": "No sourced collision or fragmentation link in these inputs.",
        "parentNoradIds": "No established parent-object link.",
        "breakupEventId": "No sourced breakup association.",
        "physicalSize": "No sourced dimensions or mass; radar size is a separate proxy.",
        "orbitRegimeLifetime": "A terminal orbit does not establish lifetime regime.",
        "eventLocation": "These inputs do not constrain reentry geography to a point or region.",
        "owner": "Catalog country is not institutional ownership.",
        "operator": "Not established by selected records.",
        "missionType": "Requires a sourced mission lookup.",
        "functionalStatus": "No event-time operational state established.",
        "reentryControl": "No sourced controlled/uncontrolled determination.",
    }.items()}
    radar = reported("RCS_SIZE")
    if radar["value"] is not None:
        radar.update(basis="proxy", note="Radar size class, not diameter or mass.")
    attributes.update(objectType=reported("OBJECT_TYPE"), radarSize=radar,
                      catalogCountry=reported("COUNTRY_CODE"), orbitNearEvent=orbit,
                      launchSite={"code": reported("SITE"), "coordinates": unknown("Site lookup not yet added.")},
                      orbitRegimeNearEvent=({"value": "LEO", "basis": "derived", "source": "gpHistory",
                                             "rule": "positive-perigee-apogee-below-2000km-v1"}
                                            if leo else unknown("Not classified by the initial LEO rule.")))
    manifest = {
        "schemaVersion": 1, "eventId": identifier, "eventKind": "reentry",
        "object": {"noradId": t["id"], "objectId": t["objectId"], "name": t["name"], "launchFamily": t["launchFamily"]},
        "representation": {"kind": "individual", "noradIds": [t["id"]], "representedObjectCount": 1},
        "eventTime": {k: t["decay"][k] for k in ("date", "precision", "intervalUtc", "intervalMeaning")},
        "attributes": attributes,
        "presentation": {
            "mode": "illustrative-replay-of-propagated-orbit", "displayAnchorUtc": iso(anchor),
            "anchorBasis": "illustrative" if precision == "day" else "reported",
            "anchorPolicy": {"policy": POLICY, "seed": SEED} if precision == "day" else {"policy": "reported-time"},
            "startTime": iso(start), "endTime": iso(anchor),
            "geometryAsset": geometry_name, "geometryFrame": "TEME", "geometryUnits": "km",
            "geometrySourceIntervalUtc": [trace[0][0], trace[-1][0]],
            "timeMapping": "Source samples replayed at 1:1 simulation duration, ending at the display anchor.",
            "locationClaim": "none", "geographicEndpoint": None,
            "style": {"color": "#70e1bc", "trailSeconds": 1200, "markerRadiusEarth": 0.012},
            "styleMeaning": "Fixed prototype style and exaggerated marker size; no physical size/brightness claim.",
        },
        "bounds": {"eventTime": t["decay"]["intervalUtc"],
                   "sourceElementAgeAtReportedDecayHours": t["element"]["ageAtReportedDecayHours"],
                   "sampledRadiusMinusReferenceKm": t["diagnostics"]["radiusMinusReferenceRangeKm"],
                   "referenceRadiusKm": radius,
                   "meaning": "Reported time support and model sample range, not physical error bounds."},
        "sources": t["sources"],
        "geometryProvenance": {"gpId": t["element"]["gpId"], "elementSha256": t["element"]["sha256"],
                               "trajectorySha256": trajectory_sha},
        "diagnostics": t["diagnostics"]["neighborComparison"],
    }
    manifest["eventTime"].update(basis="reported", source="decay")
    return manifest, geometry


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--trajectory", required=True, type=pathlib.Path)
    ap.add_argument("--gp-history", required=True, type=pathlib.Path)
    ap.add_argument("--catalog", type=pathlib.Path, default=ROOT / "web/data/decays.json")
    ap.add_argument("--output-dir", type=pathlib.Path, default=ROOT / "data/processed/browser")
    args = ap.parse_args()
    output = args.output_dir.resolve()
    if output == ROOT / "data/raw" or ROOT / "data/raw" in output.parents:
        raise ValueError("Processed output cannot be written into data/raw.")
    payload = args.trajectory.read_bytes()
    trajectory = json.loads(payload)
    metadata = json.loads(args.gp_history.with_name("metadata.json").read_text())
    rows = read_snapshot(args.gp_history.parent, metadata["query"])
    if metadata["sha256"] != trajectory["sources"]["gpHistory"]["sha256"]:
        raise ValueError("GP snapshot hash differs from trajectory provenance.")
    manifest, geometry = build_manifest(trajectory, hashlib.sha256(payload).hexdigest(), rows,
                                        json.loads(args.catalog.read_text()))
    asset = output / manifest["presentation"]["geometryAsset"]
    if asset.resolve() == args.trajectory.resolve():
        raise ValueError("Use a separate output directory; preserve the diagnostic trajectory.")
    asset.parent.mkdir(parents=True, exist_ok=True)
    geometry_bytes = (json.dumps(geometry, separators=(",", ":"), allow_nan=False) + "\n").encode()
    manifest["geometryProvenance"]["assetSha256"] = hashlib.sha256(geometry_bytes).hexdigest()
    asset.write_bytes(geometry_bytes)
    target = output / "tracers.json"
    target.write_text(json.dumps({"schemaVersion": 1, "events": [manifest]}, indent=2, allow_nan=False) + "\n")
    print(f"{manifest['eventId']} -> {target}\nDisplay anchor: {manifest['presentation']['displayAnchorUtc']}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError) as exc:
        sys.exit(str(exc))
