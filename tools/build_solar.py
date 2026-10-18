"""Compact monthly sunspot numbers for the site: data/observed-solar-cycle-indices.json -> web/data/solar.json.

    python tools/build_solar.py

Input: NOAA SWPC's observed solar cycle indices
(https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json, from
https://www.spaceweather.gov/products/solar-cycle-progression). Its sunspot numbers are the
International Sunspot Number from WDC-SILSO, Royal Observatory of Belgium (CC BY-NC 4.0).

Output, one value per month from 1957 on (the timeline's span):
  t       day of the month's start, in days since 1957-01-01 UTC (as in decays.json)
  ssn     monthly mean sunspot number
  smooth  13-month smoothed sunspot number; where SWPC hasn't published it yet (the most recent
          months) it continues from the last published value, following the change in a trailing
          13-month mean of the monthly values, flagged in `est`
SWPC writes missing values as -1; they're kept out (null), never treated as zero.
"""
import datetime as dt
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "observed-solar-cycle-indices.json"
OUT = ROOT / "web" / "data" / "solar.json"
EPOCH = dt.date(1957, 1, 1)
FIRST = "1957-01"


def value(v):
    return None if v is None or v < 0 else round(float(v), 1)


def main():
    rows = sorted(json.loads(SRC.read_text(encoding="utf-8")), key=lambda r: r["time-tag"])
    monthly = [value(r.get("ssn")) for r in rows]
    def trailing(i):  # mean of the last 13 monthly values up to month i
        window = [v for v in monthly[max(0, i - 12): i + 1] if v is not None]
        return sum(window) / len(window) if window else None

    t, ssn, smooth, est = [], [], [], []
    anchor = None  # (last published smoothed value, trailing mean at that month)
    for i, r in enumerate(rows):
        if r["time-tag"] < FIRST:
            continue
        y, m = map(int, r["time-tag"].split("-"))
        s = value(r.get("smoothed_ssn"))
        estimated = 0
        if s is not None:
            anchor = (s, trailing(i))
        elif anchor and trailing(i) is not None:
            # not published yet: carry on from the last published value, following only the change
            # in the trailing mean, so the curve doesn't jump where SWPC's smoothing stops
            s = round(max(0.0, anchor[0] + trailing(i) - anchor[1]), 1)
            estimated = 1
        t.append((dt.date(y, m, 1) - EPOCH).days)
        ssn.append(monthly[i])
        smooth.append(s)
        est.append(estimated)
    meta = {
        "source": "NOAA Space Weather Prediction Center, Solar Cycle Progression (observed solar cycle indices)",
        "url": "https://www.spaceweather.gov/products/solar-cycle-progression",
        "sunspots": "International Sunspot Number: WDC-SILSO, Royal Observatory of Belgium, Brussels (CC BY-NC 4.0)",
        "sunspotsUrl": "https://www.sidc.be/silso/datafiles",
        "note": "SWPC marks the most recent 6 months preliminary; smoothed values not yet published are estimated (est = 1) from the last published value and the change in a trailing 13-month mean.",
        "first": rows[[r["time-tag"] for r in rows].index(FIRST)]["time-tag"], "last": rows[-1]["time-tag"],
        "maxSmooth": max(v for v in smooth if v is not None),
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    }
    OUT.write_text(json.dumps({"meta": meta, "t": t, "ssn": ssn, "smooth": smooth, "est": est},
                              separators=(",", ":")), encoding="utf-8")
    print(f"{len(t)} months {meta['first']}..{meta['last']}, {sum(est)} smoothed values estimated "
          f"-> {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e3:.0f} KB)")


if __name__ == "__main__":
    main()
