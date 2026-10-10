# One launch and one shared configuration (2026-10-10)

The default April 2–9 passage now contains 12 catalog reentries and one selected launch.
The full catalog reentry charts still show reentries; the small sequence adds a Launches
lane. All use the same SimulationClock. No audio or solar-weather data layer is added.

## Launch evidence and limits

Dragon CRS-14 is NORAD 43267 / 2018-032A, an intact spacecraft payload rather than a
fragment whose launch date was inherited from a parent. The normalized catalog supplies
its name, object class and radar-size proxy. Early GP rows were still named TBA, so they
do not override catalog identity/class. Physical dimensions, institutional ownership and
lifetime orbital regime remain unknown. Mission/operator are sourced separately.

NASA's [post-launch report](https://www.nasa.gov/image-article/falcon-9-lifts-off-spacex-crs-14/)
places liftoff at 4:30 p.m. EDT on April 2, 2018 from SLC-40, Cape Canaveral. The display
anchor is 20:30:00 UTC; this means the start of a reported minute, not observed second
precision. Source support is represented as [20:30, 20:31), not a confidence interval.
The [SpaceX Falcon User's Guide](https://www.spacex.com/assets/media/falcon-users-guide-2025-05-09.pdf),
version 8, printed p.58 (PDF page69), supplies pad coordinates 28.5620°N, 80.5772°W.
These are facility reference coordinates from a later guide, not a recovered 2018 track.
Curated facts and citations are kept in `data/launch-example.json`.

One GP_HISTORY request covered launch through +48 hours and returned 11 rows. The earliest
usable epoch in **that retrieved interval** is **2018-04-02T20:54:48.108096Z**, 24m48.108096s
after the reported-minute anchor. Duplicate epoch ties use the largest GP_ID (119065128).
This does not establish the earliest record in all possible archives. The selected record
reports inclination 51.6437°, perigee 203.778 km, apogee 356.600 km and period 90.117 min.
The raw response and query/checksum sidecar remain immutable in the ignored raw cache.

A pulse at the documented pad begins at launch. A **separate reference ellipse** begins
at the selected orbital epoch; no geometry appears during the gap. The existing offline
reference-ellipse builder uses the heights, inclination and period while assigning node,
periapsis direction and phase illustratively. It repeats without drag, rendezvous,
insertion or subsequent orbital evolution. There is no line connecting the pad to the
orbit, no powered-ascent reconstruction, and no claim that the head is at a true geographic
position. The pulse's apparent size/duration is a display choice. Its location is sourced;
missing-orbit reentry pulses retain their distinct random-location policy and key.

## Reproduce

Preview works with included derived JSON and requires no Space-Track account. To rebuild,
use the existing fetcher once with your local credentials (never commit them):

```bash
python tools/spacetrack_fetch.py gp_history --norad-id 43267 \
  --start 2018-04-02T20:30:00Z --end 2018-04-04T20:30:00Z
python tools/build_launch.py \
  --gp-history data/raw/gp_history/43267/c8f00f4d2a11f0a5/response.json
```

Use the response path printed by your fetcher if it differs. `build_launch.py` is offline:
it verifies the snapshot checksum, NORAD/designator join, catalog launch day, class, source
time and site bounds. It selects the earliest valid post-launch geometry within 48 hours,
records rejected candidate rows, and fails if none is usable. The existing catalog launch
column remains day-level parent/launch chronology; it is not overwritten by this example.

Outputs in `web/data/samples/april-2018-launch/`:

- `launch.json`: standalone launch manifest.
- `tracers.json`: schema-2 composition of the launch and original reentry passage.
- `trajectories/43267-launch-reference.json`: compact reference ellipse.

Reentry geometry is referenced by relative paths in the original sample; it is not copied
or recomputed. Reentry time support and anchors stay unchanged. Sample coverage records
12 complete-interval reentries plus one selected launch, never complete launch coverage.
Event identity includes kind as well as NORAD ID, allowing launch and reentry of one object
in a future collection. Current browser collections remain capped at 50, pending profiling.

## Configuration contract

`web/PresentationConfig.js` is the editable source of defaults, bounded control definitions,
versioned preference migration, immutable snapshots and subscriptions. `app.js` creates
one store. `ConfigurationPanel.js` generates one menu; the page/timeline and OrbitPanel
subscribe to the same store. Earth passes its current snapshot to future `draw(frame)`
layers as `frame.settings`. Add a uniquely named field/group to the schema and read that
field in a layer to extend it. No second clock or settings menu is needed.

Current controls: page theme, timeline notes, reentry lead time, launch follow time,
trail history, width, marker/pulse size, tracer opacity, width/opacity taper, pulse
duration/opacity, Earth brightness, city lights and decorative atmosphere. Playback speed,
selection and data filters retain their existing controls. Color has no picker: the
`eventAppearance(event)` boundary currently returns amber and can later derive color
from sourced object/event attributes. The decorative atmosphere is separate from the
solar collaborator's eventual data-driven overlay.

Defaults: four-hour launch/reentry windows; five-minute trail history; pulses up to four
hours; width and marker scale 3×. A pulse's full fade fits inside the shorter of its own
duration and the event window. Reference-orbit history remains at most one revolution;
Tiangong's SGP4 samples are never stretched. The source epoch and event anchors never move
when settings change. Launch loops anchor phase to the reference epoch. A launch window
shorter than the source gap shows only the pad pulse. Settings do not seek or change the
clock; Replay uses the selected interval, including a new launch endpoint.

One localStorage key `sjr-presentation-v1` now serves all previews. Migration prefers the
old passage values, otherwise the old single-event values, plus the legacy page theme.
Legacy values are read only during initial migration; defaults fill new fields. Reset
writes a complete default snapshot so stale keys cannot reappear. Invalid/unsupported
values fall back or clamp; denied storage permits session-only changes. Legacy per-event
style fields are ignored by the browser; the new composition omits them. Geometry and
raw snapshots do not store user preferences. Future defaults do not override explicit
saved preferences until reset or an explicit version migration.

## Verification

Offline Python tests cover source support, deterministic epoch/tie selection, unusable
records, identity/debris rejection, day/site validation and immutable composition.
JavaScript tests cover the delayed forward orbit, pulse-only short windows, phase
invariance, backward seek, inherited settings across previews, invalid manifests,
persistence/migration/reset, blocked storage and schema extension. Browser checks cover
the generated controls, short launch windows, shared-clock playback, preview switching,
Earth settings, page theme and reload persistence. Original numerical, geographic,
clock and reentry tests remain part of the full suite.

The static page versions its entry script, stylesheet and changed-module import map
in `web/index.html` together. Bump that release token when publishing a code update so
cached previous modules cannot mix with a newer page. No bundler or new runtime is needed.
