"""Normalize SATCAT (+ historical decay messages) into the compact file the viz loads.

    python tools/build_data.py                  # data/raw/satcat.json (+ decay.json)
    python tools/build_data.py --legacy DIR     # the 2019 collision*.json files

Output: web/data/decays.json. Every decayed object keeps its exact decay
time, in days since 1957-01-01 UTC. No smoothing, no resampling.
"""
import argparse
import collections
import datetime as dt
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "web" / "data" / "decays.json"
EPOCH = dt.datetime(1957, 1, 1, tzinfo=dt.timezone.utc)

TYPES = ["DEBRIS", "ROCKET BODY", "PAYLOAD", "UNKNOWN"]
RCS = ["SMALL", "MEDIUM", "LARGE"]
DESIG = re.compile(r"^(\d{4}-\d{3})")


STAMP = re.compile(r"^(\d{4})-(\d\d)-(\d\d)(?:[ T](\d{1,2}):(\d\d)(?::(\d\d))?)?")


def to_day(s):
    """'2009-02-10', '2009-02-10 0:00:00', '2026-09-13T21:13:00Z' -> fractional days since EPOCH.
    Space-track writes date-only decays as midnight; those sit at midday instead,
    since the time within the day is unknown."""
    m = STAMP.match((s or "").strip())
    if not m:
        return None
    y, mo, d, hh, mm, ss = (int(g) if g else 0 for g in m.groups())
    t = dt.datetime(y, mo, d, hh, mm, ss, tzinfo=dt.timezone.utc)
    if (hh, mm, ss) == (0, 0, 0):
        t += dt.timedelta(hours=12)
    return round((t - EPOCH).total_seconds() / 86400, 4)


def family_key(rec):
    m = DESIG.match(rec.get("INTLDES") or rec.get("OBJECT_ID") or "")
    return m.group(1) if m else f"#{rec['NORAD_CAT_ID']}"


def object_name(rec):
    return (rec.get("SATNAME") or rec.get("OBJECT_NAME") or "").strip()


def parent_name(members):
    """Name a family after what actually fell: the commonest decayed name with DEB / R/B
    stripped. (Piece A misleads on multi-payload launches - 1997-051A is Iridium 29,
    but the debris is Iridium 33's.)"""
    names = collections.Counter(
        re.sub(r"\s+(DEB|R/B|AKM|PKM|COOLANT|PLAT)\b.*$", "", object_name(r)) for r in members)
    return names.most_common(1)[0][0] or members[0].get("INTLDES", "?")


def find_raw(name):
    for p in (RAW / name, ROOT / "data" / name, ROOT / name):
        if p.exists():
            return p
    return None


def load_decay_rows():
    """Historical decay messages, best (lowest PRECEDENCE) per object. Predictions are dropped."""
    path = find_raw("decay.json")
    best = {}
    if path:
        for r in json.loads(path.read_text(encoding="utf-8")):
            if r.get("MSG_TYPE") != "Historical":
                continue
            nid = int(r["NORAD_CAT_ID"])
            prec = int(r.get("PRECEDENCE") or 99)
            if nid not in best or prec < best[nid][0]:
                best[nid] = (prec, r)
    return {k: v[1] for k, v in best.items()}


def guess_type(name):
    if re.search(r"\bDEB\b|COOLANT|\bPLAT\b", name):
        return "DEBRIS"
    if re.search(r"R/B|\bAKM\b|\bPKM\b", name):
        return "ROCKET BODY"
    return "PAYLOAD"


def satcat_from_decay(decay_rows):
    """Stand-in SATCAT rows when only the decay class is available. Object type is guessed
    from the name and launch is pinned to mid-year of the designator; both are flagged."""
    rows = []
    for nid, r in decay_rows.items():
        m = DESIG.match(r.get("INTLDES") or "")
        rows.append({
            "NORAD_CAT_ID": nid, "INTLDES": r.get("INTLDES"), "SATNAME": r.get("OBJECT_NAME"),
            "OBJECT_TYPE": guess_type(r.get("OBJECT_NAME") or ""), "RCS_SIZE": r.get("RCS_SIZE"),
            "LAUNCH": f"{m.group(1)[:4]}-07-02" if m else None, "DECAY": r.get("DECAY_EPOCH"),
        })
    return rows


def load_satcat(args, decay_rows):
    if args.legacy:
        rows = []
        for p in sorted(pathlib.Path(args.legacy).glob("*.json")):
            doc = json.loads(p.read_text(encoding="utf-8"))
            rows += doc["allMyDicts"] if isinstance(doc, dict) else doc
        return rows, f"legacy 2019 files ({args.legacy})", False
    path = find_raw("satcat.json")
    if path:
        return json.loads(path.read_text(encoding="utf-8")), "space-track.org SATCAT + decay", False
    if decay_rows:
        print("No satcat.json - using decay.json alone (types guessed, launch dates approximate).")
        return satcat_from_decay(decay_rows), "space-track.org decay class only", True
    sys.exit("No satcat.json or decay.json - run tools/spacetrack_fetch.py or pass --legacy DIR.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--legacy", help="folder of 2019 collision*.json files")
    args = ap.parse_args()

    decay_rows = {} if args.legacy else load_decay_rows()
    rows, source, approx = load_satcat(args, decay_rows)
    epochs = {k: r.get("DECAY_EPOCH") for k, r in decay_rows.items()}

    by_id = {}
    for r in rows:
        by_id[int(r["NORAD_CAT_ID"])] = r  # dedupe, last wins
    rows = list(by_id.values())

    decayed, on_orbit = [], collections.Counter()
    for nid, r in by_id.items():
        t = to_day(r.get("DECAY"))
        precise = to_day(epochs.get(nid))
        # take the decay-message epoch when it agrees with SATCAT (or SATCAT has none)
        if precise is not None and (t is None or abs(precise - t) <= 2):
            t = precise
        otype = (r.get("OBJECT_TYPE") or "UNKNOWN").upper()
        otype = otype if otype in TYPES else "UNKNOWN"
        if t is None:
            on_orbit[otype] += 1
            continue
        decayed.append((t, r, otype))
    decayed.sort(key=lambda x: x[0])

    ev_doc = json.loads((ROOT / "data" / "events.json").read_text(encoding="utf-8"))
    ev_fams = []
    for e in ev_doc["events"]:
        fams = list(e.get("families", []))
        fams += [family_key(by_id[n]) for n in e.get("norad", []) if n in by_id]
        ev_fams.append(list(dict.fromkeys(fams)))

    fam_all = collections.defaultdict(list)
    for r in rows:
        fam_all[family_key(r)].append(r)
    fam_count = collections.Counter(family_key(r) for _, r, _ in decayed)
    fam_keys = [k for k, _ in fam_count.most_common()]
    # event families with nothing down yet (e.g. a fresh breakup) still get a slot
    fam_keys += [k for fs in ev_fams for k in fs if k in fam_all and k not in fam_count]
    fam_keys = list(dict.fromkeys(fam_keys))
    fam_index = {k: i for i, k in enumerate(fam_keys)}
    fam_decayed = collections.defaultdict(list)
    for _, r, _ in decayed:
        fam_decayed[family_key(r)].append(r)
    decayed_ids = {int(r["NORAD_CAT_ID"]) for _, r, _ in decayed}
    families = []
    for k in fam_keys:
        members = fam_all[k]
        launches = [d for d in (to_day(r.get("LAUNCH")) for r in members) if d is not None]
        families.append({
            "key": k,
            "name": parent_name(fam_decayed[k] or members),
            "n": fam_count[k],
            "orbit": sum(1 for r in members if int(r["NORAD_CAT_ID"]) not in decayed_ids),
            "launch": round(min(launches) - 0.5, 1) if launches else None,
        })

    names, name_index = [], {}
    cols = {k: [] for k in ("d", "l", "f", "k", "r", "id", "nm")}
    for t, r, otype in decayed:
        nm = object_name(r)
        if nm not in name_index:
            name_index[nm] = len(names)
            names.append(nm)
        rcs = (r.get("RCS_SIZE") or "").upper()
        cols["d"].append(t)
        cols["l"].append(to_day(r.get("LAUNCH")))
        cols["f"].append(fam_index[family_key(r)])
        cols["k"].append(TYPES.index(otype))
        cols["r"].append(RCS.index(rcs) if rcs in RCS else -1)
        cols["id"].append(int(r["NORAD_CAT_ID"]))
        cols["nm"].append(name_index[nm])

    events = []
    for e, fams in zip(ev_doc["events"], ev_fams):
        events.append({
            "t": to_day(e["date"]) if "T" in e["date"] else to_day(e["date"][:10]) - 0.5,
            "date": e["date"], "name": e["name"], "kind": e["kind"], "source": e.get("source"),
            "alt": e.get("alt_km"),
            "families": [fam_index[f] for f in fams if f in fam_index],
        })

    meta = {
        "source": source,
        "legacy": bool(args.legacy),
        "approxLaunch": approx,
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "epoch": "1957-01-01T00:00:00Z",
        "types": TYPES,
        "rcs": RCS,
        "decayed": len(decayed),
        "onOrbit": None if approx else {"total": sum(on_orbit.values()), **{t: on_orbit[t] for t in TYPES}},
        "preciseEpochs": sum(1 for t, *_ in decayed if t % 1 != 0.5),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"meta": meta, "families": families, "names": names,
                               "cols": cols, "events": events}, separators=(",", ":")),
                   encoding="utf-8")
    orbit = f"{meta['onOrbit']['total']:,}" if meta["onOrbit"] else "unknown (no SATCAT)"
    print(f"{len(decayed):,} decays, {len(families):,} families, "
          f"{orbit} still in orbit -> {OUT.relative_to(ROOT)} "
          f"({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
