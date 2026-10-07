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

The timeline tools need no third-party packages; Python 3.8+ standard library only. The optional
orbital tools below have separate dependencies. Pushing to `main` redeploys the site
from `web/` (see `.github/workflows/pages.yml`).

## One-object orbital prototype

The first offline trajectory uses **TIANGONG 1, NORAD 37820**, already present in the
timeline, with reported decay **date 2018-04-02**. It is a last-known orbital estimate,
not an observed atmospheric reentry or impact path. The original candidate, IRIDIUM 33
DEB (38023), was rejected because its last available pre-decay element was over a year old.
See [the evidence and limitations](notes/orbital-prototype.md).

The downloader uses the same `.env` credentials as the timeline. Add `--dry-run` to either
command to inspect its URL without authentication, writes, or network requests:

```sh
python tools/spacetrack_fetch.py decay --norad-id 37820
python tools/spacetrack_fetch.py gp_history --norad-id 37820 \
  --start 2018-03-30T00:00:00Z --end 2018-04-03T00:00:00Z
```

Historical requests are limited to one object and GP windows of at most seven days, with
inclusive endpoints. Response bytes and metadata (query, retrieval time, SHA-256, row count)
are saved in `data/raw/<class>/<NORAD ID>/<query-hash>/`. Identical requests reuse the
snapshot indefinitely, including empty responses; `--force` is unavailable in targeted
mode. Corrupt/incomplete snapshots stop instead of triggering a download. Existing full
DECAY files are reused if they contain the object. Consult saved windows before changing
query bounds: a different window creates a new request. Space-Track asks that
[downloaded histories be stored and reused](https://www.space-track.org/documentation).
The legacy full-catalog commands retain their existing replaceable 24-hour cache.

Set up the optional orbital tools (Python 3.11+ for the pinned plotting dependencies):

```sh
python -m venv .venv
.venv/bin/python -m pip install -r requirements-orbit.txt
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python tools/propagate.py --norad-id 37820 \
  --gp-history data/raw/gp_history/37820/6c2ffa38f41e5d8e/response.json \
  --decay data/raw/decay/37820/f0e22da9e3871b49/response.json
```

Use the paths printed by the downloader if they differ. If it reuses a full DECAY file,
this first propagator requires a targeted snapshot with its metadata sidecar; it does not
yet read the legacy bulk format. Do not refetch just to change formats.

The offline propagator verifies snapshot checksums, retains original UTC times, selects
the latest numerically usable element epoch before the cutoff, and uses the full OMM
record including BSTAR. The default 24-hour age limit is a screening policy, not an
accuracy guarantee. It plots the last two hours (or the shorter available interval) at
30-second spacing, stops on an SGP4 failure, then exports JSON. It compares nearby
element sets to reveal sensitivity; this comparison is not a calibrated error bound.

Outputs are `data/processed/trajectories/37820-diagnostic.png` and `37820.json` (Git-ignored).
JSON positions are `[UTC timestamp, x, y, z]` in **TEME kilometers**, with NORAD identity,
source hashes, element age, decay precision, numerical diagnostics, and warnings. The
radius plot subtracts a WGS72 reference sphere; it is not geodetic altitude. Earth-fixed
coordinates would require a separate frame conversion before rendering geographic detail.

The retrieved DECAY records only support a calendar day, so this trajectory stops at the
**start** of April 2 UTC. Midnight is not promoted to an exact decay time. No ground
intersection or atmospheric descent is synthesized. The existing timeline dataset and
browser remain unchanged; Earth/clock/audio integration is a later step.

Without orbital dependencies, `python -m unittest discover -s tests -v` still runs the
acquisition checks and explicitly skips the orbital checks.

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
