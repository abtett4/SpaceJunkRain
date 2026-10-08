# Tracer model: useful attributes with bounded approximation

This is the visualization direction agreed on 2026-10-07. The goal is a recognizable,
plausible tracer for each catalogued event, carrying useful attributes even when timing,
location, or orbital history is incomplete. Missing exact reentry times are not blockers.
This design extends SpaceJunkRain's existing event data; it does not create another app.

The numerical proof of concept remains useful as a geometry source and diagnostic. Its
24-hour element-age screen applies to that propagation mode, not to whether an event
deserves a visual representation. For example, NORAD 38023 can still receive an
illustrative or symbolic tracer even though its final known elements are too old for the
current near-decay propagation test.

## Keep evidence and presentation separate

1. **Event:** what happened, to which object(s), and on which reported day or interval.
2. **Attributes:** source facts, derived estimates, sourced proxies, and unknowns, each
   with its own provenance and relevant epoch. Avoid one overall confidence score.
3. **Presentation:** geometry mode, chosen animation anchor, phase, duration, size, and
   other stylistic choices. These can be approximate without becoming source facts.

Use `reported`, `derived`, `proxy`, `illustrative`, or `unknown` as field-level evidence
labels. `reported` means the source says it, not that it is an exact measurement. A
missing value is `null` with a reason, not zero, a random country, or an invented location.

The timeline, Earth, and audio must consume the same event ID and presentation anchor
from the shared clock. Source timestamps remain separate. An orbit segment can be
replayed on the event day without claiming its original sample times are reentry times.
Do not relabel inertial coordinates as Earth-fixed or claim a ground location from this
replay. The renderer receives the frame and the explicit presentation mapping.

## Attribute contract

| Attribute | Representation and initial source | Meaning / bounds |
| --- | --- | --- |
| Launch or reentry | `eventKind`; reported date plus precision and interval | Date-only is sufficient. Preserve whether a launch date describes this object's deployment or its parent launch. |
| Object identity | NORAD ID, international designator, name, launch family | Event ID additionally distinguishes launch, reentry, and later possible event kinds for one object. |
| Object class | Catalog PAYLOAD / ROCKET BODY / DEBRIS / UNKNOWN | Preserve source classification rather than deriving it from apparent size. |
| Intact or fragmented | Separate `structure`: intact / fragment / unknown | A large fragment is possible; payload class alone does not establish physical intactness at reentry. |
| Functional / control state | Optional functional / nonfunctional / unknown, and controlled / uncontrolled / unknown reentry | An intact derelict can still be space junk. Do not equate intact with active, intentional, or controlled. |
| Debris origin | Collision / explosion / intentional destruction / mission-related / unknown, plus parent or breakup IDs | Use an explicit source or curated link. A shared launch family alone does not prove a specific breakup origin. |
| Physical size | Optional dimensions, mass, and sourced ranges; separately, catalog RCS size | RCS is a radar proxy, not object diameter. Visual width is an additional display choice. |
| Multiplicity | Individual or group; catalog IDs and represented count | One glowing mark need not mean one object, but the mapping and count must be explicit. Group totals must not double-count member events. |
| Orbit plane near event | Inclination, ascending-node angle, coordinate frame, source epoch | Inclination alone gives a tilt family, not a fully oriented plane. An old node angle is not asserted to be current. |
| Orbit height / shape near event | Perigee, apogee, eccentricity, period, source epoch; optional propagated samples | Source mean-element quantities and sampled radius above a reference sphere are distinct. Neither is a measured uncertainty interval. |
| Launch / reentry location | Optional site code, sourced point/region, location kind and bounds | A launch-site pulse can be grounded in a site. Unknown reentry geography remains unknown; a symbolic surface pulse stores its illustrative location separately in presentation. |
| Affiliation | Catalog country/responsible entity, separately owner and operator/institution | The catalog code is attribution, not a complete ownership record. Names and organizations may require enrichment. |
| Mission type | Optional sourced mission category; parent mission separately for debris | Do not infer a mission from country or assign a fragment an active mission. |
| Orbit regime | `nearEvent` and separately `lifetime`/`operational` history | A terminal low orbit does not establish the lifetime regime. Preserve coverage and gaps in historical summaries. |

For regimes, retain LEO/MEO/GEO labels, allow mixed/transfer/other/unknown, and store
eccentricity independently. Spell out **highly elliptical** versus **high Earth** rather
than using ambiguous `HEO` alone. A GEO assignment needs more than an altitude label.
Classification rules should be explicit and versioned when implemented; the example only
derives LEO at the selected epoch from positive perigee/apogee below 2000 km. It makes no
claim about the full lifetime. See [ESA orbit types](https://www.esa.int/Enabling_Support/Space_Transportation/Types_of_orbits)
and [ESA's statistical regime definitions](https://sdup.esoc.esa.int/discosweb/statistics/).

The Space-Track schemas provide catalog type, country/site codes, radar size, and orbital
elements, but not a complete physical-size, institutional ownership, or mission taxonomy:
[SATCAT fields](https://www.space-track.org/basicspacedata/modeldef/class/satcat/format/html),
[GP fields](https://www.space-track.org/basicspacedata/modeldef/class/gp/format/html).
If TIP is later used for geography, its coordinates describe a prediction at 10 km
altitude, not a ground impact point. See [Space-Track definitions](https://www.space-track.org/documentation).

## What the bounds mean

Distinguish three types rather than manufacturing a confidence interval:

- **Reported support:** a calendar day, provided uncertainty, site region, or time span
  actually covered by orbital observations. Preserve any uncertainty the source supplies.
- **Model domain:** element epoch/age, frame, propagation interval, valid samples, and
  diagnostics. Alternate-element spread is a sensitivity check, not an error radius.
- **Visual freedom:** documented choices within a display policy, such as placing an
  event at a stable random time within its known day, choosing phase on a representative orbit, shortening
  a trail, or exaggerating marker width. These are not physical measurements.

Date-only reentries now receive a **reproducible random time within their UTC day**.
`tools/event_time.py` hashes `sha256-utc-day-v1:SpaceJunkRain:<eventId>`, takes the first
eight digest bytes as an unsigned big-endian integer, then takes modulo 86400 seconds.
The resulting anchor lies in `[00:00, next 00:00)`. It is illustrative, not a reentry
estimate or evidence of within-day ordering. The seed and policy are versioned; neither
input order, browser refresh, nor adding other objects changes an existing assignment.
Reported times are retained. `cols.p` records day-only versus reported-time precision;
`meta.preciseEpochs` counts source precision, never assigned random times.

`build_data.py` applies this policy before publishing, sorting all columns together.
`--retime-existing` upgrades the current processed catalog without changing or downloading
raw data. It refuses ambiguous legacy files that lack per-event precision flags. Launch
tracers are not implemented yet; their eventual event IDs can use the same timing helper.
The existing launch-date column still describes catalog/parent-launch chronology, not a
separate launch animation. Curated collision annotations retain their source dates.

An unknown location has no invented small numeric bound. A day alone does not identify
one longitude or a point on the orbit. If only inclination is supported, render a tilted
orbital motif or broad band; selected phase/node orientation belongs to presentation.
Do not turn that band into a claimed reentry corridor. If no defensible orbital values
exist, use a neutral symbolic mark rather than assigning a factual LEO/MEO/GEO value.

## Geometry choices as data becomes sparser

| Mode | Available evidence | Allowed representation |
| --- | --- | --- |
| Propagated orbit | Usable historical elements and a bounded propagation interval | Reuse numerically valid orbital samples, with epoch and frame preserved. Show the event on its reported day; any replay mapping is explicit. |
| Representative orbit | Useful inclination/height/shape, but stale or inadequate phase/time information | Build a geometric arc from supported attributes; phase or orientation may be illustrative. Keep its reference epoch. Do not propagate a year-old set to manufacture a current endpoint. |
| Symbolic event | Date/type and little defensible geometry | Abstract pulse or streak; unavailable orbital attributes remain null. Visibility does not imply invented precision. |

Mode selection is independent of mission/owner/size completeness. A missing institution
must not suppress a good orbit, and a missing orbit must not suppress a known event.
An intact object and a fragment can use different visual treatments without pretending
their marker width is literal physical diameter.

Launch presentation starts with a sourced site pulse and, if available, a separate
first-known orbital arc. A connecting swoop can be explicitly illustrative; later orbital
elements alone do not reconstruct powered ascent. A fragment's parental launch is not its
creation date; breakup/deployment metadata should prevent this conflation.

Reentry presentation can fade or brighten an orbital arc on the reported day. A guessed
geographic impact pin or an invented descent-to-ground is unnecessary. Any future stylized
descent would belong to the illustrative layer, with location claims kept separate.

## Implemented Tiangong-1 preview

`tools/build_tracers.py` joins one processed trajectory and checksum-verified GP snapshot
to `web/data/decays.json` by NORAD ID. It rejects mismatched source hashes, geometry frames,
time order, timeline dates or precision. `web/data/tracers.json` is the consumed event
manifest; `web/data/trajectories/37820.json` is its compact geometry asset. The snapshot
in `data/examples/tracer-37820-reentry.json` mirrors that event with a relative asset path.
Unknown attributes remain explicit; the adapter performs no speculative mission or owner
classification. Its default output directory is `data/processed/browser`; pass
`--output-dir web/data` to regenerate the checked-in browser assets.

Tiangong-1's display anchor is **2018-04-02 15:35:52 UTC**. The two-hour geometry replays
from 13:35:52 through 15:35:52 that day, while retaining the source samples from April 1
at 22:00 through April 2 at 00:00 UTC. This mapping is a presentation choice. It does not
propagate the object to 15:35:52 or assert its position at reentry. Source plane and height
descriptors retain their April 1 epoch. Alternate element sets' 145 km sensitivity is
available in diagnostics without becoming a calibrated error radius.

The existing `web/app.js` owns one `SimulationClock`. Both chart scrubbing and the orbit
slider seek it. `OrbitPanel` adapts the event to `EarthScene.addTracer()`; the scene only
accepts positions, timing and style, with no Space-Track or catalog knowledge. Replay
uses 300 simulated seconds per real second and stops at the shared event anchor. The
Earth view interpolates the 30-second samples; it performs no SGP4 propagation.

The plain sphere and camera were adapted from Cosmic Clock. Propagated coordinates remain
inertial TEME, mapped to scene axes `[x, -z, y] / 6378.135`, a length- and handedness-preserving
rotation. North is screen-up in the default orientation. The equator is shown; there are
no longitude lines, surface imagery, geographic endpoint or atmospheric descent. Sphere
lighting and marker width are presentation choices. The scene redraws on clock, camera,
or size changes, without a separate simulation timer.

Phase 2 adds representative-orbit and symbolic fallbacks, described below. Launch tracers,
a broader mixed sample, and audio remain later increments. One object is exported per
adapter run; this is not a bulk manifest merger. The original numerical diagnostic and
immutable raw caches remain unchanged.


## Phase 2: reference loops and symbolic events

The existing page now has a **Preview input** selector for three bounded demonstrations:
Tiangong-1's propagated samples; NORAD 38023's stale historical reference; and the same
38023 event using its empty near-event GP query. These are alternative single-event
inputs, not additional counted events. Each joins the same timeline by NORAD ID. The
38023 alternatives share event ID `38023:reentry:2024-01-05` and assigned anchor
**2024-01-05T22:11:53Z**. Selecting an input pauses without moving the clock; Replay
focuses its selected event.

`build_tracers.py --norad-id` consumes the normalized catalog and a checksum-verified
GP_HISTORY snapshot. It selects the latest element epoch strictly before the start of
the reported event day (or before a reported precise timestamp). In this initial policy,
if that selected row cannot support a geometric loop, the event becomes symbolic;
no older row is silently substituted. Empty snapshots are retained as evidence of that
query's coverage, not a claim that no history exists elsewhere. Identity/hash/clock
mismatches fail instead of becoming a silent fallback. Raw inputs remain immutable.

The cached 38023 reference is **2022-11-08T12:05:40.667424Z**, GP_ID **217563156**,
422.5 days before the start of its 2024-01-05 decay day. Its inclination is 86.4116° and
reported perigee/apogee are 623.269/753.367 km. Those fields live in `orbitReference`;
`orbitNearEvent`, the near-event regime, and the lifetime regime remain unknown. A
reference LEO classification is explicitly separate from those unknown regimes.

`representative_orbit.py` constructs an ellipse from positive ordered reference heights
and inclination. Its eccentricity is derived from those heights, not treated as a new
observation. Node and periapsis directions are chosen as zero; the event phase uses a
stable hash of the event ID and `reference-ellipse-v1`. Missing node or anomaly does not
block a motif. Mean-anomaly sampling and a small Kepler solver provide 512 segments over
one fixed reference period; if the period is absent, it is derived from height using
WGS72's Earth parameter and explicitly labeled. The initial domain excludes eccentricity
≥ 0.9 and geometry whose interpolated chords intersect the reference sphere. Unsupported
geometry becomes symbolic rather than inventing a height or clamping a trajectory.

These are **illustrative reference ellipses**, not propagation of mean elements across
an observation gap. Assets use frame `illustrative-equatorial`, units km, and
`timeSystem: loop-seconds`, with rows `[elapsedSeconds, x, y, z]`. They contain no invented
UTC sample times or event-time velocity/position estimates. Geometry retains its reference
epoch and construction policy. No drag, precession, descent or geographic endpoint is
modeled. The raw mean elements remain unchanged. Formula context:
[orbital-element geometry](https://orbital-mechanics.space/classical-orbital-elements/orbital-elements-and-the-state-vector.html)
and [SGP4 mean-element context](https://pypi.org/project/sgp4/).

A representative loop repeats at that fixed period, with phase anchored to the shared
event time. Changing its visibility window cannot speed it up or move its phase. The
trail crosses the loop seam along the orbit and is capped at one revolution to avoid
stacking repeated paths. Width/opacity taper, amber styling and large marker defaults
remain presentation choices. The 48-hour display maximum is an interface policy, not
an accuracy window. For Tiangong-1, windows above the prepared two hours switch the
**whole window** to its separately generated reference loop; no long orbit is claimed
by stretching or looping the original SGP4 samples. Returning to two hours restores
the original replay, so a mode change may change geometry at the same clock instant.

### Missing-orbit surface pulses

With no usable geometry, one amber ring expands and fades on the Earth's surface,
with **no tracer**. A key beside the globe says **No orbital data representation**
and **Surface pulse · illustrative location, no reentry position claim**. Labels remain
outside the visual model. The globe stays interactive;
selecting this preview or choosing Replay pulse turns the camera toward the assigned
point without relocating it. Ordinary depth testing hides marks on the far hemisphere.

`tools/symbolic_pulse.py` assigns a stable point from SHA-256 of
`sha256-equal-area-surface-v1:<eventId>`. Independent hash fractions set uniform longitude
and uniform sine of latitude, giving equal area on a sphere rather than overpopulating
the poles. The generated coordinates, policy, illustrative basis and duration are saved
under `presentation.surfacePulse`; `attributes.eventLocation` remains unknown and
`geographicEndpoint` remains null. Rebuilds, reloads, settings and camera changes do not
rerandomize the point. The position is only a display convention on this untextured globe,
not an Earth-fixed measurement, reentry prediction or a claim of surface impact.

There is **no single physical distribution** justified for these missing-data events.
Orbital inclination limits the latitude band of an uncontrolled reentry. In the simple
near-circular orbit model, an object spends more time near its extreme latitudes, as
[ESA explains for Tiangong-1](https://blogs.esa.int/rocketscience/2018/03/26/tiangong-1-frequently-asked-questions-2/).
Actual reentry distributions can also depart from simple orbital residence-time models;
see [NASA's empirical study](https://ntrs.nasa.gov/api/citations/20110016363/downloads/20110016363.pdf).
Controlled reentries can target particular regions. The empty query supplies neither
inclination nor control information, so the equal-area placement is a neutral visual
choice, **not a reentry probability model**. It also does not use catalog country or
launch site to guess reentry location. A future model using partial orbital metadata
must explicitly record its constraints and assumptions rather than treat this policy as
physical evidence.

One pulse fades in and out over **600 simulated seconds ending at the event anchor**;
this is display timing, not atmospheric descent duration. Replay pulse focuses just that
interval (two seconds at 300×), while the shared scrubber retains the selected context
window. A longer window cannot repeat the pulse; a shorter one clips it without changing
its phase. The pulse vanishes at the anchor, including when playback stops there.
`SurfacePulse.sample()` depends only on shared-clock time; pause/backward seek reproduce
the same appearance with no independent timer. Surface rings follow the sphere even at
the poles. Only visibility and marker size apply; trail history and width are disabled.
The empty-query example retains object class and radar-size proxy from the catalog,
while unavailable orbit, actual location and country data stay unknown.

Validation adds analytic circular and inclined-ellipse checks, height limits, deterministic
phase, missing/invalid inputs, source immutability, identity/anchor checks, seam continuity,
loop period/closure, clipping, and explicit mode switching. Browser checks compare all
three inputs, 48-hour windows, shared-clock scrubbing, and the symbolic display.


## Configuration menu and next milestones

User requirement: the final application must expose a configuration menu controlling
how long tracers appear **before a reentry** and **after a launch**, plus other tracer
attributes. Phase 1 is complete for the Tiangong-1 reentry preview. **Configure tracer**
exposes reentry lead time, trail history, width, and marker size. The launch-follow
control will be added alongside the first launch tracer in phase 4.

Keep three independent temporal controls:

- **Event visibility window:** reentry lead time and launch follow time, measured in
  simulation time relative to the shared event anchor.
- **Trail history:** how much of the moving object's recent path remains visible.
- **Playback speed:** simulation time per real second, still owned by the shared clock.

Changing these controls must not rerandomize event anchors, rewrite source times, alter
reported orbital elements, or introduce a second clock. A shorter window clips the
existing replay. A longer requested window must use additional prepared geometry where
supported, or an explicitly illustrative representative-orbit loop; it must not silently
stretch two hours of source samples into a longer purported reconstruction. Record the
geometry mode and time mapping independently of the selected display duration. Browser
settings changes should not trigger Space-Track requests or heavy propagation.

Initial appearance controls cover trail width and marker size. Color is derived from
event presentation data, with amber as a placeholder until its object/event-data mapping
is decided; users do not choose individual tracer colors. Later controls may include
opacity/fade, launch/reentry visibility,
object-class filters and representation-mode filters. Unknown attributes must remain a
selectable, recognizable category. Start with global settings, persist them locally,
and provide Reset defaults; per-object overrides can wait.

The implemented reentry window spans 30 seconds to 48 hours, in 30-second
steps; windows beyond prepared SGP4 coverage use the representative mode. Trail history ranges from zero (head only) to two hours and is also clipped to
the selected visibility window. The marker and trail each allow 0.5–3× their default
size. Defaults are two hours before the event, 20 minutes of trail, and large 3× width/size.
The trail tapers to zero width and opacity at its oldest end. Preferences use payload
version 2 under the existing local key `sjr-tracer-settings-v1`; reset removes only that
key. Reading version 1 retains its timing choices, drops its color preference and adopts
the large size defaults. Subsequent edits save version 2 and retain user size adjustments.
Invalid or unsupported saved
values fall back to defaults or are bounded by available geometry. Blocked storage
leaves the controls usable for the current visit.

The renderer retains the full original geometry and fixed endpoint. Clipping to 30
minutes therefore shows source samples from **2018-04-01 23:30 through 2018-04-02 00:00
UTC**, mapped to display time **2018-04-02 15:05:52–15:35:52 UTC**. Interpolated trail
boundaries prevent hidden pre-window geometry from appearing. Changing preferences
does not seek or pause the clock; a clock outside the new window simply hides the
tracer. Replay focuses the selected window and retains the existing 300× rate.

Validation covers clipping and interpolation, unchanged source samples and endpoint,
clock independence, invalid settings, persistence, reset, and unavailable storage.
Browser checks also cover changes while playing and paused, backward scrubbing,
the shared endpoint, saved preferences after reload, and Reset defaults. The original
raw data, diagnostic output, and original SGP4 geometry are unchanged. Separate reference
loop assets are added for longer windows and stale inputs. The event's presentation color
is now amber, matching the exporter and portable example.

Recommended sequence:

1. **Configurable Tiangong-1 preview — complete.** The collapsible panel supports
   reentry lead time, trail history, width, marker size, saved preferences and
   reset, bounded by the existing two-hour segment. Launch-follow remains reserved
   for the launch example.
2. **Explicit geometry fallbacks — complete.** Representative loops and symbolic events
   now handle stale/partial and empty input cases, demonstrated with cached NORAD 38023
   inputs. Windows up to 48 hours use an explicit fixed-period looping policy; original
   SGP4 samples are never stretched or looped.
3. **Small mixed event sample — complete.** Twelve events from April 2–9, 2018 share
   one scene and the existing clock. Six have orbital inputs and six are surface pulses,
   with missing-query and not-yet-queried inputs distinguished. Details below.
4. **One launch example.** Add a sourced launch-site lookup, site pulse and first-known
   orbital arc. Distinguish parental launch from fragment creation/deployment; any connecting
   arc is illustrative rather than a reconstructed powered ascent. Test launch-follow time.
5. **Unified presentation and audio contract.** Refine Earth presentation with explicit
   coordinate-frame/time handling before adding geographical imagery. Connect event selection,
   filters and configuration across views. Define forward-play event crossings, pause, seek
   and replay behavior with the colleague's audio layer so scrubbing does not accidentally
   fire a backlog of sound events.
6. **Broader coverage after profiling.** Measure the small batch, then introduce time-window
   loading and caching only where needed. Report missing geometry/metadata coverage explicitly
   while expanding the locally cached catalog.

## Phase 3: small mixed passage

`data/samples/april-2018.json` specifies **every catalog reentry in
[2018-04-02 00:00, 2018-04-10 00:00) UTC**. This is a complete eight-day slice of the
existing catalog, not a statistical sample of all historical debris or all atmospheric
entries. Membership is checked against the normalized catalog; none of its 12 events
are omitted or duplicated. There are six payloads, one rocket body and five debris objects.
Reported dates and stable assigned times are unchanged; no gaps are removed to change the
rhythm. The viewer loads this small set together before playback.

| NORAD | Name | Orbital input in this sample |
|---|---|---|
| 37820 | TIANGONG 1 | Existing SGP4 replay and separate reference loop |
| 38249 | PSLV R/B | New cached reference elements |
| 31309 | ARIANE 5 DEB (SYLDA) | New cached reference elements |
| 41486 | FLOCK 2E 3 | New cached reference elements |
| 41568 | FLOCK 2EP 6 | New cached reference elements |
| 41569 | FLOCK 2EP 8 | Catalog only; history not yet queried |
| 41565 | FLOCK 2E 7 | Catalog only; history not yet queried |
| 24965 | IRIDIUM 19 | New cached reference elements |
| 43268 | DRAGON CRS-14 DEB | Catalog only; history not yet queried |
| 43269 | DRAGON CRS-14 DEB | Catalog only; history not yet queried |
| 26926 | ATLAS 14E DEB | Catalog only; history not yet queried |
| 31777 | FENGYUN 1C DEB | Empty three-day GP_HISTORY query |

Six narrow, three-day requests were made in one authenticated session, spaced three
seconds apart, using the existing acquisition/validation/cache functions. The five
nonempty queries returned 16, 18, 21, 20 and 21 rows respectively. Their newest pre-day
epochs support reference motifs only in this increment; they have **not** undergone the
SGP4 diagnostic workflow. No new SGP4 accuracy claim is made. The empty response is cached
as evidence of that query's coverage. Catalog-only entries explicitly record
`sources.gpHistory.status: not-queried`; they are not disguised as unsuccessful queries.

The existing exporter now accepts `--sample` and delegates collection assembly to
`mixed_sample.py`. It verifies complete interval membership, unique IDs, imported asset
hashes, and catalog identity/class/time joins before writing. Derived event assets use
the same event schema; the enclosing manifest adds sample bounds, counts, coverage and
presentation defaults. Original Tiangong assets are copied byte-for-byte into the sample
bundle. Sample inputs are repository-relative and raw snapshots remain immutable.

`EventSequence.js` loads and validates both single events and the collection, configures
each representation, and samples all of them from the existing clock. `OrbitPanel.js`
adds a small sequence timeline, active-event list, completed-event count and inspector.
EarthScene keeps its data-agnostic tracers/pulses; it has no new acquisition knowledge.
The three object-class lanes use amber marks; color is still not a configurable property.
The globe contains no text labels. Other events remain in the scene when one is inspected.

The default 24-hour lead window allows overlap. Tiangong-1 therefore uses its reference
loop by default; choosing at most two hours restores its prepared SGP4 samples. Other
orbital inputs use their individually sourced height/inclination, fixed reference period
and illustrative phase. As in phase 2, their node/periapsis directions and placement are
illustrative, with no geographical endpoint or atmospheric descent. Source epochs and
unknowns remain available per object. The screen shows a visual ensemble, not a
simultaneously reconstructed Earth-fixed orbital state.

At **7200×** playback the eight days take **96 seconds**. The sample uses one 14,400-second
surface pulse per symbolic event, ending at its event anchor (two real seconds at the
preset speed). Duration is explicit presentation metadata; shorter windows clip it and
longer windows cannot repeat it. Pause/seek/speed changes still use one clock. Pulses on
the far hemisphere are correctly hidden, so the active count includes events whose marks
may be occluded. The full historical charts retain their existing counts and filters;
Earth membership is this complete slice and its inspector does not act as a chart filter.
Audio scheduling, launches, unified filters and Earth-fixed imagery remain later phases.

Sample preferences use `sjr-sample-tracer-settings-v1`, separate from the single-event
key; Reset restores the sample's 24-hour lead without overwriting individual-preview
preferences. Browser testing covers playback, pause/resume, ending cleanly, backward
seeks, sample/single switches, settings and per-event inspection. Automated tests cover
membership, joins, coverage honesty, imported geometry checksums, mixed overlapping
states and preference separation. No raw data is required by the new automated tests.
