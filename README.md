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

No third-party packages; Python 3.8+ standard library only. Pushing to `main` redeploys the site
from `web/` (see `.github/workflows/pages.yml`).

## One-object orbital prototype: acquisition

The orbital contribution starts with historical data acquisition; no Earth renderer or
propagation is implemented yet. It uses the same credentials and downloader as the timeline.
Do not put credentials in the browser or commit `.env`.

The initial candidate in `web/data/decays.json` is **IRIDIUM 33 DEB, NORAD 38023**, launch
family `1997-051`, with decay **date 2024-01-05**. Its noon timestamp is a plotting convention,
not a verified reentry instant. The committed dataset currently has `preciseEpochs: 0`.

First inspect the query, then fetch this object's historical DECAY messages:

```sh
python tools/spacetrack_fetch.py decay --norad-id 38023 --dry-run
python tools/spacetrack_fetch.py decay --norad-id 38023
```

The downloader reuses an existing local full DECAY file if it contains this object's
historical messages. Otherwise it saves the original response bytes and a `metadata.json`
sidecar under `data/raw/decay/38023/<query-hash>/`. Inspect `DECAY_EPOCH`, `MSG_EPOCH`,
`PRECEDENCE`, and any uncertainty fields before choosing the GP_HISTORY interval. Lowest
PRECEDENCE wins in the existing builder, but conflicting/tied messages need inspection.
Timestamp formatting alone does not establish its accuracy; midnight may be date-only.
If only a date is supported, retain that uncertainty or choose another candidate.

Then query a narrow interval of **element epochs**, using explicit UTC bounds. This is
an illustrative dry run; its end is not a verified decay time:

```sh
python tools/spacetrack_fetch.py gp_history --norad-id 38023 \
  --start 2024-01-02T00:00:00Z --end 2024-01-05T00:00:00Z --dry-run
```

After establishing the appropriate bounds, omit `--dry-run` to fetch. This prototype limits
requests to one object and at most seven days; endpoints are inclusive. The complete JSON
records, including the propagation fields supplied by Space-Track, are preserved under
`data/raw/gp_history/38023/<query-hash>/`. Acquisition validates object IDs and epochs; it
does **not** establish that an element set is physically trustworthy or propagable.

Each new historical snapshot records the query, retrieval time, row count, and SHA-256 of
the untouched response. Identical requests reuse that snapshot indefinitely, including
empty responses, without logging in. `--force` is unavailable in targeted mode. Corrupt or
incomplete snapshots stop the command instead of causing another download. Consult saved
windows before choosing a different query; changing the window produces a new request.
Space-Track asks that [downloaded histories be stored and reused](https://www.space-track.org/documentation).
The original full-catalog commands still use their existing 24-hour, replaceable cache.

Run the offline checks without credentials or third-party packages:

```sh
python -m unittest discover -s tests -v
```

Next: select a usable pre-decay element set, record its age relative to the reported decay,
and propagate offline with SGP4. Preserve the full source OMM/TLE, including BSTAR; the
timeline's date parser is unsuitable because it shifts midnight to noon and rounds times.
The diagnostic should show a reconstructed last-known orbit, not claim an observed
atmospheric reentry or impact path. Trajectory exports will specify UTC times, TEME
coordinates, kilometer units, source provenance, and any propagation failures. Derived
diagnostics belong in `data/processed/`; browser-ready exports can later go in
`web/data/trajectories/` without changing the existing deployment structure.

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
