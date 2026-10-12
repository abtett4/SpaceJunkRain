# The Earth view (sheet 3)

*By Tyler Griffith. What the globe shows, how it is built, and how to rebuild its data. The
detailed history of the tracer model and every rebuild command are in
[orbital-tracers.md](orbital-tracers.md).*

## What the marks mean

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

**Show / hide:** click a lane name on the strip to show or hide launches, payloads, rocket bodies,
debris or unknown objects; the orbit-height range shows only reentries whose recorded orbit
(perigee to apogee) overlaps the chosen band. Both are saved settings (`showLaunches` …
`showUnknown`, `minHeightKm`, `maxHeightKm`) that collaborators can read; the event feed itself
is not filtered.

4,108 reentries have a time of day from GCAT, used only where GCAT and Space-Track agree on the day. The other date-only reentries get stable random display times within their reported UTC day. These are
animation anchors, not estimated reentry times. Missing size, owner, mission, location and
lifetime-orbit data stays explicitly unknown.

**Layout (sheet 3).** The site's shared controls drive the globe like every sheet: **Animate**
plays month by month on the globe (the sheet's `play` hook), Speed sets the rate, and the monthly
chart below follows the same clock. Above the globe: the date (year set large, then the day in
words and UTC time), the running count of objects down, and **Skip quiet intervals** (description
on hover). Beside the globe, **Now** lists the events in progress and the next one with a short
card for the selected one, and **Appearance** holds the saved display settings, scrolling in place
so changes are visible on the globe. Directly under the globe, the **event strip** shows every
reentry and launch of the year, one lane per kind, on a month axis: drag it to move the clock,
click a tick to jump to that object, ◀ year ▶ to change year. **Fine time** below it moves the
clock by the minute within the day, or ±10 min / ±1 h. Hour-scale speeds play month by month and
continue automatically; at year-scale speeds the globe waits and only the charts move. Collapsed
sections underneath hold the events-reached log, **About this view** (a known-versus-illustrative
table and the limits), and **Other examples** (the April 2–9, 2018 sample with Dragon CRS-14,
Dragon alone, Tiangong-1, and two Iridium 33 debris fallbacks).

**Globe.** Zoom out to 70 Earth radii for high orbits; markers keep their screen size, and active
objects can draw a faint full orbit (Appearance). A caption box in the globe's corner says what
each active object is and whose, from GCAT's payload, owner and site tables.

## Code map

| File | Role |
| --- | --- |
| `web/js/sheets/earth.js` | Sheet 3: mounts the panel the first time the tab opens; routes Animate to it. |
| `web/js/SimulationClock.js` | The one simulation clock (UTC ms, rate, play/pause/seek, playback windows). |
| `web/js/PresentationConfig.js`, `ConfigurationPanel.js` | Settings schema, defaults, persistence; controls generated from the schema. |
| `web/js/DisplayPolicy.js` | Chooses a representation from event facts, available orbital inputs and settings. |
| `web/js/OrbitalEventFeed.js`, `EventPlaybackLog.js` | Launch/reentry crossings for collaborators; the "events reached" list. |
| `web/js/earth/OrbitPanel.js` | Orbital view controller: shared Play, month loading, now list, event card. |
| `web/js/earth/EventStrip.js`, `web/js/DateText.js` | The year event strip and its axis; readable UTC dates. |
| `web/js/earth/EarthScene.js` and neighbours | Renderer (p5/WebGL), shader, camera, tracers, pulses. |

The full design notes are in [`notes/`](), above all
[the tracer model](tracer-model.md), [historical loading](historical-loading.md),
[launch and configuration](launch-and-configuration.md) and
[the Earth renderer](earth-renderer.md). Detailed per-preview behaviour, limits and every
rebuild command are in [the orbital tracer notes](orbital-tracers.md).

## Shared interface for collaborators

`mountOrbitPanel()` resolves to an `experience` object; `web/js/sheets/earth.js` exports it as
the promise `earthExperience` (it resolves the first time someone opens the Earth view):

| Interface | Purpose |
| --- | --- |
| `experience.clock` | The shared SimulationClock. |
| `experience.events.subscribeCrossings(fn)` | Launch/reentry batches reached during forward playback. |
| `experience.events.subscribeState(fn)` | Snapshots for cancelling queued work on seek, pause or collection change. |
| `experience.settings` | The shared settings store. |
| `experience.earth.addLayer(layer)` | Draw hook on the globe (e.g. a solar-weather layer). |

The orbital sound and solar-weather work build on these, so **treat them as a stable,
backward-compatible API**. Add to them, but don't rename or remove members. See the
[integration contract and adapter examples](collaborator-integration.md).

## Rebuilding data

The derived assets are committed. Rebuild only to change them. Orbital tools need Python 3.11+:

```sh
python -m venv .venv
.venv/bin/python -m pip install -r requirements-orbit.txt
```

| Output | Command / where documented |
| --- | --- |
| Timeline catalog `web/data/decays.json` | `python tools/build_data.py` (`--retime-existing` re-derives display times only) |
| Full-catalog passages `web/data/history/all/` | `python3 tools/build_history_chunks.py --all-history` · [historical loading](historical-loading.md) |
| April 2018 sample | `python tools/build_tracers.py --sample data/samples/april-2018.json --output-dir web/data/samples/april-2018` |
| Dragon CRS-14 launch | `tools/build_launch.py` · [launch and configuration](launch-and-configuration.md#reproduce) |
| GCAT launches `web/data/launches.json` (+ in the passages above) | `python tools/fetch_gcat.py` (snapshot in `data/raw/gcat/<date>/`), then `python tools/gcat_launches.py` and rebuild the passages |
| GCAT object facts: decay times in `decays.json`; orbits, mass, owner in the passages | `python tools/gcat_objects.py` (after `build_data.py`, before rebuilding the passages; idempotent) |

Full order after fresh downloads: `spacetrack_fetch.py` → `build_data.py` → `fetch_gcat.py` →
`gcat_objects.py` → `gcat_launches.py` → `build_history_chunks.py --all-history`.
| Tiangong-1 and Iridium fallbacks | `tools/propagate.py`, `tools/build_tracers.py` · [orbital tracer notes](orbital-tracers.md) |
| Geography `web/data/geography.json` (not used by the page since the place lookup was removed) | `tools/fetch_geography.py`, `tools/build_geography.py` · [credits](../web/assets/earth/README.md) |

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

