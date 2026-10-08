# Space Junk Rain

Every catalogued object that has reentered the atmosphere, 1957 to today, on its real decay date.
Successor to the 2019 SuperCollider piece (ATLS 4519, Gerald Robinson & Alan Tett).

**Live site:** https://abtett4.github.io/SpaceJunkRain/

## Run locally

1. `copy .env.example .env` and add your space-track.org login.
2. `python tools/spacetrack_fetch.py` pulls SATCAT + historical decay messages into `data/raw/` (cached 24 h).
3. `python tools/build_data.py` writes `web/data/decays.json`.
4. `python -m http.server 8174 --directory web`, then open http://localhost:8174.

Two views: **By source** (one row per major breakup, debris on its reentry day, share down on the
right) and **Time in orbit** (decay date vs. lifespan, log scale). A row appears for any launch
with 150+ reentered debris pieces, plus every launch linked in `data/events.json`.

No third-party packages; Python 3.8+ standard library only, and plain ES modules in `web/js/`
(no build step). Pushing to `main` redeploys the site from `web/` (see `.github/workflows/pages.yml`).

**Want to help?** See [CONTRIBUTING.md](CONTRIBUTING.md): setup, code layout, adding a sheet or a dataset,
and the checklist for pull requests.

## Data and citation

Data: U.S. Space Command (USSPACECOM), via [Space-Track.org](https://www.space-track.org):
satellite catalog (SATCAT) and satellite decay and reentry data. USSPACECOM gives blanket approval
to redistribute this basic SSA data, and to publish analysis based on it, on condition of
appropriate citation. Keep this citation with any copy of `web/data/decays.json` or work built on it.

- One row per object from SATCAT. Where a historical decay message carries a precise epoch that
  agrees with SATCAT (within 2 days), that epoch wins. Date-only decays sit at 12:00 UTC.
- Families are launch designators (`1993-036` = everything from the Cosmos 2251 launch).
- `data/events.json` is the hand-edited collision table: kind = bump | crash | explosion | fragmentation.
- Raw downloads (`data/raw/`, `data/decay.json`) stay out of git for size; each person fetches their own.

## Other files

- `2023/SatelliteDecay/`, `explode-6.scd`: the original 2019 SuperCollider and Max files.
- `ExplosionSounds.zip`, `FenderBender.zip`, and the `.wav` files: collision SFX from Freesound
  (the number in each file name is its Freesound ID); check each sound's license before reuse.
- Licensed under MPL-2.0 (see `LICENSE`).
