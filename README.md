# Space Junk Rain

Every catalogued object that has reentered the atmosphere, 1957 to today, on its real decay date.
Successor to the 2019 SuperCollider piece (ATLS 4519, Gerald Robinson & Alan Tett).

- **Live site (timeline):** https://abtett4.github.io/SpaceJunkRain/
- **Orbital prototype (`tyler/orbital-earth` branch):** https://tyler-the-griffith.github.io/SpaceJunkRain/

The page has two parts that run on one shared simulation clock:

1. **Timeline charts.** **By source** puts one row on each major breakup, with debris on its
   reentry day and the share already down shown on the right. **Time in orbit** plots decay date
   against lifespan on a log scale. A row appears for any launch with 150+ reentered debris
   pieces, plus every launch linked in `data/events.json`.
2. **Orbital view.** A textured 3D Earth replays reentries (amber) and one sourced launch (cyan)
   as tracers or surface pulses. By default it steps through the **full historical catalog**:
   35,692 reentries in 1,132 passages (1957–2026), each passage at most 50 events, at three
   simulated hours per second, skipping quiet gaps.

## Run locally

1. `cp .env.example .env` and add your space-track.org login.
2. `python tools/spacetrack_fetch.py` downloads SATCAT and historical decay messages into
   `data/raw/` (cached 24 h).
3. `python tools/build_data.py` writes `web/data/decays.json`.
4. `python -m http.server 8174 --directory web`, then open http://localhost:8174.

All derived browser assets (`web/data/`) are committed, so step 4 alone works if you are not
changing data. The site is static, with no build step. JavaScript modules and JSON requests need
HTTP serving, so opening `index.html` as a file does not work. The timeline tools use only the
Python 3.8+ standard library. The optional orbital tools have their own dependencies (below).

**Deployment.** A push to `main` publishes `web/` through `.github/workflows/pages.yml`.
`publish-prototype.yml` publishes the `tyler/orbital-earth` branch to the same Pages
environment, so in a fork that has both workflows, a push to `main` replaces the prototype until
the branch is pushed again. Remove `publish-prototype.yml` once the branch is merged.

## Orbital view

Every orbital mark says what kind of evidence is behind it:

| Representation | When it is used | What it claims |
| --- | --- | --- |
| **SGP4 replay** | Tiangong-1 (NORAD 37820), event windows ≤ 2 h | Last-known orbital estimate from prepared element sets. Not an observed descent or impact path. |
| **Reference loop** | An object with a usable reference orbit | Real inclination and perigee/apogee. Node, periapsis direction and phase are illustrative. No drag or descent is modelled. |
| **Surface pulse** | No usable orbital history | A stable, randomly chosen display point (uniform over the sphere). Not a reentry location. |
| **Launch** (cyan) | Dragon CRS-14, the one curated launch | Sourced pad and minute. The ascent arc into a reference orbit is illustrative. |

Date-only reentries get stable random display times within their reported UTC day. These are
animation anchors, not estimated reentry times. Missing size, owner, mission, location and
lifetime-orbit data stays explicitly unknown.

**Preview input** selects the full catalog (pick a year and passage) or one of the smaller
fixed examples: the April 2–9, 2018 sample with Dragon CRS-14, Dragon alone, Tiangong-1, and
two Iridium 33 debris fallbacks (stale reference orbit / empty near-event query).
**Configure visualization** holds the shared, saved appearance settings: theme, event windows,
trail length, width, size, opacity, pulses and Earth lighting. The globe supports drag, pinch,
scroll, arrow keys and +/− zoom. Hovering or clicking gives an approximate geographic reference.

### Code map

| File | Role |
| --- | --- |
| `web/app.js` | Timeline charts, shared clock, Speed/Animate controls; mounts the orbital view. |
| `web/SimulationClock.js` | The one simulation clock (UTC ms, rate, play/pause/seek, playback windows). |
| `web/PresentationConfig.js`, `ConfigurationPanel.js` | Settings schema, defaults, persistence; controls generated from the schema. |
| `web/DisplayPolicy.js` | Chooses a representation from event facts, available orbital inputs and settings. |
| `web/OrbitalEventFeed.js`, `EventPlaybackLog.js` | Launch/reentry crossings for collaborators; the "events reached" list. |
| `web/earth/OrbitPanel.js` | Orbital view controller: preview loading, passages, inspector, scrubber. |
| `web/earth/EarthScene.js` and neighbours | Renderer (p5/WebGL), shader, camera, tracers, pulses, geography. |

The full design notes are in [`notes/`](notes/), above all
[the tracer model](notes/tracer-model.md), [historical loading](notes/historical-loading.md),
[launch and configuration](notes/launch-and-configuration.md) and
[the Earth renderer](notes/earth-renderer.md). Detailed per-preview behaviour, limits and every
rebuild command are in [the orbital view reference](notes/orbital-reference.md).

## Shared interface for collaborators

`mountOrbitPanel()` resolves to an `experience` object. `web/app.js` keeps it as
`experienceReady`, with a commented integration point for collaborator adapters:

| Interface | Purpose |
| --- | --- |
| `experience.clock` | The shared SimulationClock. |
| `experience.events.subscribeCrossings(fn)` | Launch/reentry batches reached during forward playback. |
| `experience.events.subscribeState(fn)` | Snapshots for cancelling queued work on seek, pause or collection change. |
| `experience.settings` | The shared settings store. |
| `experience.earth.addLayer(layer)` | Draw hook on the globe (e.g. a solar-weather layer). |

The orbital sound and solar-weather work build on these, so **treat them as a stable,
backward-compatible API**. Add to them, but don't rename or remove members. See the
[integration contract and adapter examples](notes/collaborator-integration.md).

## Rebuilding data

The derived assets are committed. Rebuild only to change them. Orbital tools need Python 3.11+:

```sh
python -m venv .venv
.venv/bin/python -m pip install -r requirements-orbit.txt
```

| Output | Command / where documented |
| --- | --- |
| Timeline catalog `web/data/decays.json` | `python tools/build_data.py` (`--retime-existing` re-derives display times only) |
| Full-catalog passages `web/data/history/all/` | `python3 tools/build_history_chunks.py --all-history` · [historical loading](notes/historical-loading.md) |
| April 2018 sample | `python tools/build_tracers.py --sample data/samples/april-2018.json --output-dir web/data/samples/april-2018` |
| Dragon CRS-14 launch | `tools/build_launch.py` · [launch and configuration](notes/launch-and-configuration.md#reproduce) |
| Tiangong-1 and Iridium fallbacks | `tools/propagate.py`, `tools/build_tracers.py` · [orbital view reference](notes/orbital-reference.md) |
| Geography `web/data/geography.json` | `tools/fetch_geography.py`, `tools/build_geography.py` · [credits](web/assets/earth/README.md) |

`tools/spacetrack_fetch.py decay|gp_history --norad-id N` does targeted historical downloads.
It saves immutable, hash-checked snapshots under `data/raw/<class>/<NORAD>/<query-hash>/` and
reuses them indefinitely, as Space-Track asks. Add `--dry-run` to see the URL without
downloading anything. The builders are offline and fail explicitly on corrupt inputs or
mismatched joins.

## Tests

```sh
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
for t in tests/*.test.mjs; do node "$t" || echo "FAILED: $t"; done
```

Without the orbital dependencies, `python -m unittest discover -s tests` still runs the
acquisition tests and skips the orbital ones.

## Data and citation

Data: U.S. Space Command (USSPACECOM), via [Space-Track.org](https://www.space-track.org):
satellite catalog (SATCAT) and satellite decay and reentry data. USSPACECOM gives blanket
approval to redistribute this basic SSA data, and to publish analysis based on it, on condition
of appropriate citation. Keep this citation with any copy of `web/data/decays.json` or work
built on it.

- One row per object from SATCAT. Where a historical decay message carries a precise epoch that
  agrees with SATCAT (within 2 days), that epoch wins. Date-only decays receive stable random
  display times within their UTC day. Source precision is kept in `cols.p` (0 = reported day,
  1 = reported timestamp).
- Families are launch designators (`1993-036` = everything from the Cosmos 2251 launch).
- `data/events.json` is the hand-edited collision table: kind = bump | crash | explosion | fragmentation.
- Raw downloads (`data/raw/`, `data/decay.json`) stay out of git for size; each person fetches their own.
- Earth imagery, map data and the bundled renderer have their own credits:
  [imagery/map](web/assets/earth/README.md), [renderer](web/vendor/README.md). The Earth
  components are adapted from Cosmic Clock.

## Other files

- `2023/SatelliteDecay/`, `explode-6.scd`: the original 2019 SuperCollider and Max files.
- `ExplosionSounds.zip`, `FenderBender.zip`, and the `.wav` files: collision sound effects from
  Freesound (the number in each file name is its Freesound ID). Check each sound's license
  before reuse.
- `notes/`: design principles, roadmap ([next steps](notes/next-steps.md)) and technical notes.
- Licensed under MPL-2.0 (see `LICENSE`).
