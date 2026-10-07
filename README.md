# Space Junk Rain

Every catalogued object that has reentered the atmosphere, 1957 to today, on its real decay date.
Successor to the 2019 SuperCollider piece (ATLS 4519, Gerald Robinson & Alan Tett).

## Run

1. `copy .env.example .env` and add your space-track.org login.
2. `python tools/spacetrack_fetch.py` pulls SATCAT + historical decay messages into `data/raw/` (cached 24 h).
3. `python tools/build_data.py` writes `web/data/decays.json`.
   Without a fetch: `python tools/build_data.py --legacy "F:\DellCaptainTofu2023\Space\SatelliteDecay"`.
4. `python -m http.server 8174 --directory web`, then open http://localhost:8174.

Two views: **By source** (one row per major breakup, debris on its reentry day, share down on the
right) and **Time in orbit** (decay date vs. lifespan, log scale). A row appears for any launch
with 150+ reentered debris pieces, plus every launch linked in `data/events.json`.

No third-party packages; Python 3.8+ standard library only.

## Data notes

- One row per object from SATCAT. Where a historical decay message carries a precise epoch that
  agrees with SATCAT (within 2 days), that epoch wins. Date-only decays sit at 12:00 UTC.
- Families are launch designators (`1993-036` = everything from the Cosmos 2251 launch).
- `data/events.json` is the hand-edited collision table: kind = bump | crash | explosion | fragmentation.
- space-track's user agreement limits redistribution - keep `data/raw/` and the built JSON
  private until that's checked.
