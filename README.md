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
2. **Orbital view.** A textured 3D Earth replays reentries (amber) and every orbital launch attempt
   since 1957 from GCAT (cyan; failed attempts small and red)
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
| **Reference loop** | 35,140 of 35,692 reentries: GCAT's recorded orbit, or Space-Track element history for the curated examples | Real inclination and perigee/apogee. Node, periapsis direction and phase are illustrative. GCAT's orbit is dated and often operational, not near reentry; the card shows its date. No drag or descent is modelled. |
| **Surface pulse** | No usable orbit (552 reentries) | A stable, randomly chosen display point (uniform over the sphere). Not a reentry location. |
| **Launch** (cyan) | Every GCAT orbital launch attempt (7,191) | A ring at the GCAT pad, site or air-launch drop zone, at GCAT's time (usually to the minute or second). 6,642 successful launches also get an illustrative 9-minute ascent onto the orbit GCAT records for the launch (or its upper stage or a payload), through the pad at launch time; heading north/south by a stated rule. |
| **Failed launch** (small, red) | GCAT attempts that did not reach orbit (524) | Same placement as launches. |

Launch locations carry GCAT's own coordinate uncertainty: 4,753 within 1 km, 1,253 within 5 km,
1,181 within 25 km and 4 coarser. Air launches (57) sit at GCAT's drop zone, not the carrier's
runway. The event card states each launch's precision, and **About this view** on the page has a
full known-versus-illustrative table.

**Globe:** zoom out to 70 Earth radii for high orbits; markers keep their screen size and active
objects draw a faint full orbit. A caption box in the globe's corner says what each active object
is and whose (e.g. "Commercial communications satellite · USA", "Launch from Jiuquan, China"),
from GCAT's payload, owner and site tables. **Fine time** under the strip moves the clock within
the day by the minute, or in ±10 min / ±1 h steps.

**Show / hide:** click a lane name on the strip to show or hide launches, payloads, rocket bodies,
debris or unknown objects; the orbit-height range shows only reentries whose recorded orbit
(perigee to apogee) overlaps the chosen band. Both are saved settings (`showLaunches` …
`showUnknown`, `minHeightKm`, `maxHeightKm`) that collaborators can read; the event feed itself
is not filtered.

4,108 reentries have a time of day from GCAT, used only where GCAT and Space-Track agree on the day. The other date-only reentries get stable random display times within their reported UTC day. These are
animation anchors, not estimated reentry times. Missing size, owner, mission, location and
lifetime-orbit data stays explicitly unknown.

**Layout.** The orbital view sits above the timeline charts. A sticky bar drives both, since
they share a clock: Play/Pause, the date (year set large, then the day in words, then UTC time),
the running count of objects down, and Speed. Beside the globe, **Coming down now** lists the
events in progress and the next one, and a short card describes the selected (or next) event.
Directly under the globe, the **event strip** shows every reentry of the year, one lane per
object class, on a month axis. Drag it to move the clock; click a tick to jump to that object.
◀ year ▶ changes year. Hour-scale speeds play month by month and continue automatically. At
year-scale speeds ("Charts only") the globe waits and only the charts and strip move.
Collapsed sections underneath hold the events-reached log, **Settings**, **About this view**
(evidence and limits), and **Other examples** (the April 2–9, 2018 sample with Dragon CRS-14,
Dragon alone, Tiangong-1, and two Iridium 33 debris fallbacks). Drag, pinch, scroll, the arrow
keys and +/− turn and zoom the globe.

### Code map

| File | Role |
| --- | --- |
| `web/app.js` | Timeline charts, shared clock and Speed; mounts the orbital view. |
| `web/SimulationClock.js` | The one simulation clock (UTC ms, rate, play/pause/seek, playback windows). |
| `web/PresentationConfig.js`, `ConfigurationPanel.js` | Settings schema, defaults, persistence; controls generated from the schema. |
| `web/DisplayPolicy.js` | Chooses a representation from event facts, available orbital inputs and settings. |
| `web/OrbitalEventFeed.js`, `EventPlaybackLog.js` | Launch/reentry crossings for collaborators; the "events reached" list. |
| `web/earth/OrbitPanel.js` | Orbital view controller: shared Play, month loading, now list, event card. |
| `web/earth/EventStrip.js`, `web/DateText.js` | The year event strip and its axis; readable UTC dates. |
| `web/earth/EarthScene.js` and neighbours | Renderer (p5/WebGL), shader, camera, tracers, pulses. |

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
| GCAT launches `web/data/launches.json` (+ in the passages above) | `python tools/fetch_gcat.py` (snapshot in `data/raw/gcat/<date>/`), then `python tools/gcat_launches.py` and rebuild the passages |
| GCAT object facts: decay times in `decays.json`; orbits, mass, owner in the passages | `python tools/gcat_objects.py` (after `build_data.py`, before rebuilding the passages; idempotent) |

Full order after fresh downloads: `spacetrack_fetch.py` → `build_data.py` → `fetch_gcat.py` →
`gcat_objects.py` → `gcat_launches.py` → `build_history_chunks.py --all-history`.
| Tiangong-1 and Iridium fallbacks | `tools/propagate.py`, `tools/build_tracers.py` · [orbital view reference](notes/orbital-reference.md) |
| Geography `web/data/geography.json` (not used by the page since the place lookup was removed) | `tools/fetch_geography.py`, `tools/build_geography.py` · [credits](web/assets/earth/README.md) |

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

The page lists every source in a **Data sources** section directly under the summary tiles.

**Launches:** J. McDowell, *GCAT: General Catalog of Artificial Space Objects*,
[planet4589.org](https://planet4589.org/space/gcat/), CC BY 4.0. `launch.tsv`, `lp.tsv` and
`sites.tsv`; orbital attempts only (LaunchCode `OS`/`OF`). Pads resolve through GCAT's site
renames (e.g. NIIP-5 → GIK-5); the record states whether a launch sits at its pad or its site.
Keep this citation with `web/data/launches.json` and the history passages. GCAT's `satcat.tsv` and
`orgs.tsv` also supply recorded orbits (35,374 objects), decay times of day, mass/length and owner
for catalogued objects, joined by NORAD number; Space-Track stays the record of which objects
reentered and on which day. The 14 hand-curated objects keep their prepared evidence unchanged.

**Reentries:** 
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
