"""Presentation timing shared by the catalog builder and tracer exporter (no I/O)."""
import datetime as dt
import hashlib
import math

UTC = dt.timezone.utc
EPOCH = dt.datetime(1957, 1, 1, tzinfo=UTC)
POLICY = "sha256-utc-day-v1"
SEED = "SpaceJunkRain"


def event_id(norad_id, kind, date):
    return f"{int(norad_id)}:{kind}:{date}"


def display_anchor(identifier, date):
    """Stable pseudorandom second in [00:00, next 00:00); not a reentry estimate."""
    day = dt.datetime.combine(dt.date.fromisoformat(date), dt.time(), UTC)
    digest = hashlib.sha256(f"{POLICY}:{SEED}:{identifier}".encode()).digest()
    seconds = int.from_bytes(digest[:8], "big") % 86400
    return day + dt.timedelta(seconds=seconds)


def iso(instant):
    return instant.isoformat().replace("+00:00", "Z")


def apply_event_times(doc):
    """Retime compact decay columns together, retaining source precision and UTC day.

    Old files can only be upgraded if they explicitly report zero precise epochs and
    every decay uses the old noon convention. Mixed/ambiguous files need rebuilding.
    """
    cols, meta = doc["cols"], doc["meta"]
    if meta["epoch"] != iso(EPOCH):
        raise ValueError("Unsupported catalog epoch.")
    count = len(cols["id"])
    if any(len(v) != count for v in cols.values()) or len(set(cols["id"])) != count:
        raise ValueError("Catalog columns must align and NORAD IDs must be unique.")
    if any(not math.isfinite(d) for d in cols["d"]):
        raise ValueError("Catalog decay times must be finite.")
    if "p" not in cols:
        if meta.get("preciseEpochs") != 0 or any(d % 1 != 0.5 for d in cols["d"]):
            raise ValueError("Cannot infer precision; rebuild from source records.")
        cols["p"] = [0] * count
    if any(p not in (0, 1) for p in cols["p"]):
        raise ValueError("Unknown time precision code.")
    for i, (nid, day, precise) in enumerate(zip(cols["id"], cols["d"], cols["p"])):
        if precise:
            continue
        date = (EPOCH + dt.timedelta(days=math.floor(day))).date().isoformat()
        anchor = display_anchor(event_id(nid, "reentry", date), date)
        cols["d"][i] = (anchor - EPOCH).total_seconds() / 86400
    # The timeline binary-searches d. Always move ALL parallel columns together.
    order = sorted(range(count), key=lambda i: (cols["d"][i], cols["id"][i]))
    doc["cols"] = {k: [values[i] for i in order] for k, values in cols.items()}
    meta["preciseEpochs"] = sum(cols["p"])
    meta["timePrecision"] = ["day", "reported-time"]
    meta["presentationTime"] = {
        "policy": POLICY, "seed": SEED,
        "meaning": "Date-only d values are stable random display times inside their UTC day; p preserves source precision.",
    }
    return doc
