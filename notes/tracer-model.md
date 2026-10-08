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
| Launch / reentry location | Optional site code, sourced point/region, location kind and bounds | A launch-site pulse can be grounded in a site. Unknown reentry geography remains unknown; no precise marker is required. |
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

The plain sphere and camera were adapted from Cosmic Clock. Coordinates remain inertial
TEME, mapped to scene axes `[x, -z, y] / 6378.135`, a length- and handedness-preserving
rotation. North is screen-up in the default orientation. The equator is shown; there are
no longitude lines, surface imagery, geographic endpoint or atmospheric descent. Sphere
lighting and marker width are presentation choices. The scene redraws on clock, camera,
or size changes, without a separate simulation timer.

Representative-orbit and symbolic fallbacks, launch tracers, other objects, and audio
remain subsequent increments. One object is exported on each adapter run; this is not a
bulk manifest merger. The existing numerical diagnostic and immutable raw caches remain
unchanged.


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

The implemented reentry window spans 30 seconds to the available two hours, in 30-second
steps. Trail history ranges from zero (head only) to two hours and is also clipped to
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
raw data, diagnostic output, and geometry are unchanged. The event's presentation color
is now amber, matching the exporter and portable example.

Recommended sequence:

1. **Configurable Tiangong-1 preview — complete.** The collapsible panel supports
   reentry lead time, trail history, width, marker size, saved preferences and
   reset, bounded by the existing two-hour segment. Launch-follow remains reserved
   for the launch example.
2. **Explicit geometry fallbacks.** Implement representative orbits for partial/stale
   element history and symbolic events where geometry is missing. Use the already cached
   NORAD 38023 case to exercise stale-data handling. Establish the illustrative looping
   policy that enables longer display windows without inventing long SGP4 reconstructions.
3. **Small mixed event sample.** Export and select multiple events with debris, rocket
   body and payload examples across different data-coverage cases. Preserve NORAD joins,
   field-level provenance and unknowns. Generalize the single-event manifest exporter and
   viewer before bulk acquisition or optimization.
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
