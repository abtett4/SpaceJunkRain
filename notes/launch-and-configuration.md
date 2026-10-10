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

Launches are cyan; reentries remain amber. A pulse marks the sourced pad, and the
launch head starts at that same geographic point. A smooth **illustrative ascent arc**
joins the reference ellipse over the gap to the selected orbital epoch (about 25 minutes).
That gap is a display transition interval, **not an observed ascent or insertion duration**.
The pulse fades within this interval, or sooner if the selected display window is shorter.

The browser selects an illustrative northbound phase and node orientation compatible
with the pad latitude when possible. It preserves the reference ellipse's inclination,
heights and period after the transition. A spherical directional blend and radial rise
avoid a chord through Earth; angular travel accelerates smoothly into the reference rate.
For a pad outside the reference inclination range, the same blend remains an explicitly
illustrative connection, without changing the final orbit's inclination. Direction, phase,
acceleration and ascent geometry are display choices, not launch azimuth or powered-flight
observations. The existing reference asset and its source evidence remain untouched.

Launch history is drawn relative to the rotating Earth: a visible tail reaching back to
liftoff stays attached to the pad. Trail length can remove that older endpoint; it never
moves the head. This trail is a visual motif, not an observed inertial flight track.
Windows shorter than the transition show a clipped ascent, not an accelerated insertion.
Missing-orbit reentries still use labeled random-position pulses without tracers.

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
- `tracers.json`: schema-3 composition of the launch and original reentry passage.
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
`eventAppearance(event)` in `DisplayPolicy.js` maps launch to cyan and reentry to amber.
It can later derive color from other sourced attributes. The decorative atmosphere is separate from the
solar collaborator's eventual data-driven overlay.

Defaults: four-hour launch/reentry windows; five-minute trail history; pulses up to four
hours; width and marker scale 3×. A pulse's full fade fits inside the shorter of its own
duration and the event window. Reference-orbit history remains at most one revolution;
Tiangong's SGP4 samples are never stretched. The source epoch and event anchors never move
when settings change. Launch position is anchored to launch time and independent of window clipping. A launch
window shorter than the source gap shows the beginning of the illustrative ascent. Settings do not seek or change the
clock; Replay uses the selected interval, including a new launch endpoint.

One localStorage key `sjr-presentation-v1` now serves all previews. Migration prefers the
old passage values, otherwise the old single-event values, plus the legacy page theme.
Legacy values are read only during initial migration; defaults fill new fields. Reset
writes a complete default snapshot so stale keys cannot reappear. Invalid/unsupported
values fall back or clamp; denied storage permits session-only changes. Event records no longer include presentation fields; the browser requires the updated schema. Geometry and
raw snapshots do not store user preferences. Future defaults do not override explicit
saved preferences until reset or an explicit version migration.

## Event / visualization separation

Collections now use schema 3 and individual events use schema 2. Each event contains
identity, event kind, reported time support, sourced/proxy/unknown attributes, numerical
bounds and provenance. `orbitalData` describes **available derived products**:

```json
"orbitalData": {
  "propagated": {"asset": "trajectories/37820.json"},
  "reference": {"asset": "trajectories/37820-representative.json"}
}
```

Either product may be absent. An empty object means no prepared orbital geometry in
this input; source metadata distinguishes unqueried history from an empty query. Asset
headers retain frames, units, original sample times and construction limitations.
These links are input availability, not a requested rendering mode. A future renderer
can ignore them or use the reference descriptors directly without rewriting events.

- Python exporters produce evidence records and separate derived geometry. They do not
  choose colors, pulses, rendering modes, display windows or random surface locations.
- `PresentationConfig.js` owns appearance defaults and the menu's control schema/store.
- `DisplayPolicy.js` resolves event facts + available geometry + shared settings into a
  transient rendering specification. It also owns deterministic timing/location policies.
- `EventSequence.js` validates joins and assets, owns immutable copies of event records,
  and applies the resolver to create/configure renderer objects. It never adds view state
  to an event. Alternate policies can be supplied to `configureSequence`.
- `LaunchTracer`, `Tracer`, `SurfacePulse` and `EarthScene` consume rendering specifications.
  The configuration menu updates the shared settings; it does not edit the event data.

Changing the visuals means editing/replacing the resolver and renderer or changing shared
settings. Re-export event records only when evidence, source data or orbital products change.
The geometry assets are still computed offline; there is no browser SGP4 or data acquisition.
SHA-256 assignment matches the existing Python rules byte-for-byte, so migrating the schema
preserves all assigned times and symbolic surface locations. It also works over plain HTTP
LAN previews, without requiring Web Crypto in a secure context. Existing raw files and the
full timeline catalog are unchanged. Older manifests must be rebuilt with the documented
commands; silently guessing old presentation fields is deliberately unsupported.

## Verification

Offline Python tests cover source support, deterministic epoch/tie selection, unusable
records, identity/debris rejection, day/site validation and immutable composition.
JavaScript tests cover pad coincidence, continuous ascent/orbit joins, reference dimensions,
Earth-fixed tail attachment, short-window clipping, phase
invariance, backward seek, inherited settings across previews, invalid manifests,
persistence/migration/reset, blocked storage and schema extension. Browser checks cover
the generated controls, short launch windows, shared-clock playback, preview switching,
Earth settings, page theme and reload persistence. Original numerical, geographic,
clock and reentry tests remain part of the full suite.

The static page versions its entry script, stylesheet and changed-module import map
in `web/index.html` together. Bump that release token when publishing a code update so
cached previous modules cannot mix with a newer page. No bundler or new runtime is needed.
