"""Join offline orbital inputs to the existing timeline; export one event or a small sample."""
import argparse
import datetime as dt
import hashlib
import json
import math
import pathlib
import sys

from event_time import EPOCH, POLICY, display_anchor, event_id, iso
from spacetrack_fetch import read_snapshot
from representative_orbit import RADIUS_KM, representative_loop

ROOT = pathlib.Path(__file__).resolve().parents[1]


def stamp(value):
    instant = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    return instant.replace(tzinfo=dt.timezone.utc) if instant.tzinfo is None else instant.astimezone(dt.timezone.utc)


def unknown(note):
    return {"value": None, "basis": "unknown", "note": note}


def load_gp_snapshot(path):
    metadata = json.loads(path.with_name("metadata.json").read_text())
    rows = read_snapshot(path.parent, metadata["query"])
    label = str(path.resolve().relative_to(ROOT)) if path.resolve().is_relative_to(ROOT) else str(path.resolve())
    return rows, {"path": label, **{k: metadata[k] for k in
                  ("query", "sha256", "retrievedAt", "source", "rowCount")}}


def build_fallback_manifest(norad_id, rows, catalog, sources):
    c, meta = catalog["cols"], catalog["meta"]
    query = sources.get("gpHistory", {}).get("query")
    if query and ("/class/gp_history/" not in query or f"/NORAD_CAT_ID/{norad_id}/" not in query):
        raise ValueError("GP query does not match the requested NORAD ID/history class.")
    if (meta["epoch"] != iso(EPOCH) or meta.get("presentationTime", {}).get("policy") != POLICY
            or c["id"].count(norad_id) != 1):
        raise ValueError("Fallback must join one object in the normalized timeline.")
    i = c["id"].index(norad_id)
    anchor = EPOCH + dt.timedelta(days=c["d"][i])
    day = anchor.date().isoformat()
    identifier = event_id(norad_id, "reentry", day)
    if c["p"][i] == 0:
        expected = display_anchor(identifier, day)
        if abs((expected - anchor).total_seconds()) > 0.001:
            raise ValueError("Timeline anchor disagrees with the date-only timing policy.")
        anchor = expected
        start = stamp(day)
        interval = [iso(start), iso(start + dt.timedelta(days=1))]
    elif c["p"][i] == 1:
        interval = [iso(anchor), iso(anchor)]
    else:
        raise ValueError("Unknown timeline time precision.")
    if any(int(r["NORAD_CAT_ID"]) != norad_id for r in rows):
        raise ValueError("GP snapshot contains a different NORAD ID.")
    # Date-only cutoff is the start of the reported day, not the arbitrary display time.
    cutoff = stamp(interval[0])
    eligible = sorted((r for r in rows if stamp(r["EPOCH"]) < cutoff),
                      key=lambda r: (stamp(r["EPOCH"]), int(r["GP_ID"])), reverse=True)
    row = eligible[0] if eligible else {}
    epoch = iso(stamp(row["EPOCH"])) if row else None
    unavailable = None
    geometry = None
    if row:
        try:
            geometry = representative_loop(row, identifier, norad_id, epoch)
        except ValueError as exc:
            unavailable = str(exc)
    # Missing fields remain null. The reference orbit is never labeled near-event evidence.
    attributes = attributes_from_gp(row, epoch, strict=False)
    attributes["orbitReference"] = attributes.pop("orbitNearEvent")
    attributes["orbitReference"]["meaning"] = "Historical reference descriptors only; not reentry conditions."
    attributes["orbitRegimeReference"] = attributes.pop("orbitRegimeNearEvent")
    attributes["orbitNearEvent"] = unknown("No accepted near-event orbit in this fallback input.")
    attributes["orbitRegimeNearEvent"] = unknown("Reference orbit does not establish the event-time regime.")
    # Object class and radar-size proxy are already present in the normalized catalog.
    attributes["objectType"] = {"value": meta["types"][c["k"][i]], "basis": "reported", "source": "catalog:cols.k"}
    rcs = c["r"][i]
    if 0 <= rcs < len(meta["rcs"]):
        attributes["radarSize"] = {"value": meta["rcs"][rcs], "basis": "proxy", "source": "catalog:cols.r",
                                    "note": "Radar size class, not diameter or mass."}
    family_index = c["f"][i]
    family = catalog["families"][family_index]["key"] if 0 <= family_index < len(catalog["families"]) else None
    return {
        "schemaVersion": 2, "eventId": identifier, "eventKind": "reentry",
        "object": {"noradId": norad_id, "objectId": row.get("OBJECT_ID"),
                   "name": catalog["names"][c["nm"][i]], "launchFamily": family},
        "representation": {"kind": "individual", "noradIds": [norad_id], "representedObjectCount": 1},
        "eventTime": {"date": day, "precision": "day" if c["p"][i] == 0 else "reported-time",
                      "intervalUtc": interval, "basis": "reported", "source": "catalog",
                      "intervalMeaning": "Reported time support from the normalized catalog, not a confidence interval."},
        "attributes": attributes,
        "orbitalData": {"reference": {"asset": f"trajectories/{norad_id}-representative.json"}} if geometry else {},
        "bounds": {"eventTime": interval, "referenceRadiusKm": RADIUS_KM if geometry else None,
                   "sourceElementAgeAtReportedDecayHours":
                       [(stamp(t) - stamp(epoch)).total_seconds() / 3600 for t in interval] if epoch else None,
                   "meaning": "Source age only, not physical error bounds."},
        "sources": sources,
        **({"orbitalDataUnavailableReason": unavailable} if unavailable else {}),
        "geometryProvenance": {"gpId": row.get("GP_ID"),
                               "elementSha256": hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest() if row else None},
    }, geometry


def attributes_from_gp(row, epoch, strict=True):
    reported = lambda field: ({"value": row[field], "basis": "reported", "source": f"gpHistory:{field}"}
                              if row.get(field) else unknown(f"No {field} in selected GP record."))
    orbit = {"epochUtc": epoch, "frame": row.get("REF_FRAME", "TEME") if row else None, "basis": "reported" if row else "unknown",
             "source": "gpHistory" if row else None, "meaning": "Mean-element descriptors at source epoch, not measured reentry conditions."}
    for key, field in (("inclinationDeg", "INCLINATION"), ("raanDeg", "RA_OF_ASC_NODE"),
                       ("perigeeKm", "PERIAPSIS"), ("apogeeKm", "APOAPSIS"),
                       ("eccentricity", "ECCENTRICITY"), ("periodMinutes", "PERIOD")):
        try:
            orbit[key] = float(row[field]) if row.get(field) not in (None, "") else None
            if orbit[key] is not None and not math.isfinite(orbit[key]):
                raise ValueError(f"Non-finite {field}.")
        except (TypeError, ValueError):
            if strict:
                raise
            orbit[key] = None
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
    return attributes


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
    # Original source sample times stay unchanged; replay mapping belongs to the browser.
    geometry_name = f"trajectories/{t['id']}.json"
    geometry = {"schemaVersion": 1, "id": t["id"], "frame": "TEME", "units": "km",
                "timeSystem": "UTC", "referenceSphereRadiusKm": radius,
                "trace": trace}
    attributes = attributes_from_gp(row, t["element"]["epoch"])
    manifest = {
        "schemaVersion": 2, "eventId": identifier, "eventKind": "reentry",
        "object": {"noradId": t["id"], "objectId": t["objectId"], "name": t["name"], "launchFamily": t["launchFamily"]},
        "representation": {"kind": "individual", "noradIds": [t["id"]], "representedObjectCount": 1},
        "eventTime": {k: t["decay"][k] for k in ("date", "precision", "intervalUtc", "intervalMeaning")},
        "attributes": attributes,
        "orbitalData": {"propagated": {"asset": geometry_name}},
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
    choice = ap.add_mutually_exclusive_group(required=True)
    choice.add_argument("--trajectory", type=pathlib.Path, help="validated propagated trajectory")
    choice.add_argument("--norad-id", type=int, help="build a representative/symbolic fallback from cached inputs")
    choice.add_argument("--sample", type=pathlib.Path, help="small mixed sample specification (offline)")
    ap.add_argument("--gp-history", type=pathlib.Path)
    ap.add_argument("--catalog", type=pathlib.Path, default=ROOT / "web/data/decays.json")
    ap.add_argument("--output-dir", type=pathlib.Path, default=ROOT / "data/processed/browser")
    args = ap.parse_args()
    if bool(args.sample) == bool(args.gp_history):
        ap.error("Single-object exports require --gp-history; --sample specifies its own inputs.")
    output = args.output_dir.resolve()
    raw = (ROOT / "data/raw").resolve()
    if output == raw or raw in output.parents:
        raise ValueError("Processed output cannot be written into data/raw.")
    catalog_bytes = args.catalog.read_bytes()
    catalog = json.loads(catalog_bytes)
    if args.sample:
        from mixed_sample import build_sample
        spec = json.loads(args.sample.read_text())
        doc, assets = build_sample(spec, catalog, {
            "sha256": hashlib.sha256(catalog_bytes).hexdigest(),
            "source": catalog["meta"]["source"], "generated": catalog["meta"]["generated"],
        })
        output.mkdir(parents=True, exist_ok=True)
        for name, data in assets.items():
            target = output / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        (output / "tracers.json").write_text(json.dumps(doc, indent=2, allow_nan=False) + "\n")
        print(f"{len(doc['events'])} events -> {output / 'tracers.json'}\nCoverage: {doc['sample']['coverage']}")
        return
    rows, gp_source = load_gp_snapshot(args.gp_history)
    if args.trajectory:
        payload = args.trajectory.read_bytes()
        trajectory = json.loads(payload)
        if gp_source["sha256"] != trajectory["sources"]["gpHistory"]["sha256"]:
            raise ValueError("GP snapshot hash differs from trajectory provenance.")
        manifest, geometry = build_manifest(trajectory, hashlib.sha256(payload).hexdigest(), rows, catalog)
    else:
        manifest, geometry = build_fallback_manifest(args.norad_id, rows, catalog, {
            "gpHistory": gp_source,
            "catalog": {"sha256": hashlib.sha256(catalog_bytes).hexdigest(),
                        "source": catalog["meta"]["source"], "generated": catalog["meta"]["generated"]},
        })
    output.mkdir(parents=True, exist_ok=True)

    def write_geometry(name, value):
        asset = output / name
        if args.trajectory and asset.resolve() == args.trajectory.resolve():
            raise ValueError("Use a separate output directory; preserve the diagnostic trajectory.")
        asset.parent.mkdir(parents=True, exist_ok=True)
        data = (json.dumps(value, separators=(",", ":"), allow_nan=False) + "\n").encode()
        asset.write_bytes(data)
        return hashlib.sha256(data).hexdigest()

    if geometry:
        manifest["geometryProvenance"]["assetSha256"] = write_geometry(next(iter(manifest["orbitalData"].values()))["asset"], geometry)
    if args.trajectory:
        row = next(r for r in rows if str(r["GP_ID"]) == str(trajectory["element"]["gpId"]))
        try:
            loop = representative_loop(row, manifest["eventId"], trajectory["id"], trajectory["element"]["epoch"])
        except ValueError as exc:
            manifest["orbitalDataUnavailableReason"] = str(exc)
        else:
            name = f"trajectories/{trajectory['id']}-representative.json"
            manifest["orbitalData"]["reference"] = {"asset": name}
            manifest["geometryProvenance"]["representativeAssetSha256"] = write_geometry(name, loop)
    target = output / "tracers.json"
    target.write_text(json.dumps({"schemaVersion": 3, "events": [manifest]}, indent=2, allow_nan=False) + "\n")
    print(f"{manifest['eventId']} -> {target}\nAvailable orbital products: {list(manifest['orbitalData'])}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError) as exc:
        sys.exit(str(exc))
