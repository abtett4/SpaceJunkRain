"""Assemble a small, complete catalog interval from explicit offline input choices."""
import copy
import hashlib
import json
import pathlib

from build_tracers import ROOT, build_fallback_manifest, load_gp_snapshot, stamp
from event_time import EPOCH, POLICY, event_id, iso


def encoded(value):
    return (json.dumps(value, separators=(",", ":"), allow_nan=False) + "\n").encode()


def import_event(path, norad_id):
    doc = json.loads(path.read_text())
    if doc.get("schemaVersion") != 1 or len(doc.get("events", [])) != 1:
        raise ValueError("Imported input must contain exactly one event.")
    event = copy.deepcopy(doc["events"][0])
    if event["object"]["noradId"] != norad_id:
        raise ValueError("Imported event NORAD ID does not match sample input.")
    assets = {}
    for field, checksum in [("geometryAsset", "assetSha256"), ("representativeOrbitAsset", "representativeAssetSha256")]:
        name = event["presentation"].get(field)
        if not name:
            continue
        relative = pathlib.PurePosixPath(name)
        if relative.is_absolute() or ".." in relative.parts or relative.parts[0] != "trajectories":
            raise ValueError("Imported asset must be inside trajectories/.")
        data = (path.parent / name).read_bytes()
        if hashlib.sha256(data).hexdigest() != event["geometryProvenance"][checksum]:
            raise ValueError("Imported geometry checksum mismatch.")
        if json.loads(data)["id"] != norad_id:
            raise ValueError("Imported geometry NORAD ID mismatch.")
        assets[name] = data
    return event, assets


def build_sample(spec, catalog, catalog_source, root=ROOT):
    """No network or output writes. Validate every input before publishing a manifest."""
    if spec.get("schemaVersion") != 1:
        raise ValueError("Unsupported sample specification.")
    if catalog["meta"]["epoch"] != iso(EPOCH) or catalog["meta"].get("presentationTime", {}).get("policy") != POLICY:
        raise ValueError("Sample requires the normalized catalog clock policy.")
    sample = copy.deepcopy(spec["sample"])
    start, end = map(stamp, sample["intervalUtc"])
    if not 0 < (end - start).total_seconds() <= 31 * 86400:
        raise ValueError("A small sample needs an increasing interval of at most 31 days.")
    ids = [i["noradId"] for i in spec["inputs"]]
    if not 2 <= len(ids) <= 50 or len(set(ids)) != len(ids):
        raise ValueError("A sample needs 2–50 distinct NORAD IDs.")
    cols = catalog["cols"]
    selected = {nid for nid, day in zip(cols["id"], cols["d"])
                if (start - EPOCH).total_seconds() / 86400 <= day < (end - EPOCH).total_seconds() / 86400}
    if set(ids) != selected:
        raise ValueError("Sample inputs must include every catalog event in the selected interval, exactly once.")
    if sample["playbackRate"] != 7200 or sample["surfacePulseSeconds"] != 14400:
        raise ValueError("This sample policy uses 2 h/second and a 4 h illustrative pulse.")
    if sample["defaultLeadSeconds"] != 86400:
        raise ValueError("This sample policy starts with 24 h of reference orbit.")
    assets, events = {}, []
    coverage = {"propagatedInput": 0, "referenceInput": 0, "symbolicInput": 0,
                "historyNotQueried": 0, "historyQueryEmpty": 0}
    for item in spec["inputs"]:
        nid = item["noradId"]
        if sum(key in item for key in ("manifest", "gpHistory", "catalogOnly")) != 1:
            raise ValueError("Each sample object needs exactly one explicit input choice.")
        if "manifest" in item:
            event, imported = import_event(root / item["manifest"], nid)
            if assets.keys() & imported.keys():
                raise ValueError("Duplicate geometry asset in sample.")
            assets.update(imported)
        else:
            if "gpHistory" in item:
                rows, source = load_gp_snapshot(root / item["gpHistory"])
                source["path"] = item["gpHistory"]
                coverage["historyQueryEmpty"] += not rows
            else:
                if item["catalogOnly"] is not True:
                    raise ValueError("Catalog-only input must be explicit.")
                rows, source = [], {"status": "not-queried", "note": "Orbital history not fetched for this small sample."}
                coverage["historyNotQueried"] += 1
            event, geometry = build_fallback_manifest(nid, rows, catalog,
                                                      {"gpHistory": source, "catalog": catalog_source})
            if source.get("status") == "not-queried":
                event["presentation"]["modeReason"] = "Catalog-only input: orbital history was not fetched for this sample; it may exist."
            if geometry:
                name = event["presentation"]["geometryAsset"]
                assets[name] = encoded(geometry)
                event["geometryProvenance"]["assetSha256"] = hashlib.sha256(assets[name]).hexdigest()
        p = event["presentation"]
        index = cols["id"].index(nid)
        anchor = stamp(p["displayAnchorUtc"])
        if (event["eventKind"] != "reentry" or event["eventId"] != event_id(nid, "reentry", event["eventTime"]["date"])
            or abs((anchor-EPOCH).total_seconds()-cols["d"][index]*86400) > 0.001
            or p["endTime"] != p["displayAnchorUtc"] or not start <= anchor < end
            or event["eventTime"]["date"] != anchor.date().isoformat()
            or event["eventTime"]["precision"] != ("day" if cols["p"][index] == 0 else "reported-time")
            or event["attributes"]["objectType"]["value"] != catalog["meta"]["types"][cols["k"][index]]):
            raise ValueError("Sample event disagrees with catalog identity, class, or shared clock.")
        mode = p["mode"]
        if mode == "symbolic-event":
            p["surfacePulse"]["durationSeconds"] = sample["surfacePulseSeconds"]
            p["surfacePulse"]["note"] += " In this passage the 4 h display pulse lasts 2 s at the preset speed."
            coverage["symbolicInput"] += 1
        elif mode == "representative-orbit":
            coverage["referenceInput"] += 1
        elif mode == "illustrative-replay-of-propagated-orbit":
            coverage["propagatedInput"] += 1
        else:
            raise ValueError("Unsupported sample representation.")
        events.append(event)
    events.sort(key=lambda e: (e["presentation"]["displayAnchorUtc"], e["eventId"]))
    sample.update(intervalUtc=[iso(start), iso(end)], eventCount=len(events), coverage=coverage,
                  objectTypes={kind: sum(e["attributes"]["objectType"]["value"] == kind for e in events)
                               for kind in catalog["meta"]["types"]},
                  selection="All catalog reentries in this UTC interval; orbital coverage is deliberately partial.",
                  timeMeaning="Reported days retain their spacing. Times within date-only days are stable assigned display times, not observations.")
    return {"schemaVersion": 1, "sample": sample, "events": events}, assets
