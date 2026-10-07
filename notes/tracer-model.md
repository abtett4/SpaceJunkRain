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
  event at noon within its known day, choosing phase on a representative orbit, shortening
  a trail, or exaggerating marker width. These are not physical measurements.

Initial display time for date-only events remains **12:00 UTC**, matching the existing
timeline. This anchor is a presentation convention. It must fall inside the reported
day `[00:00, next 00:00)`. A future deterministic distribution within that day is possible,
but would be applied once to the shared event so Earth, timeline, and sound stay aligned.

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

## Concrete Tiangong-1 example and next implementation

`data/examples/tracer-37820-reentry.json` is a populated **design example**, not a new
production dataset or a currently consumed renderer API. It uses the existing trajectory
and cached source records, retaining their hashes. It demonstrates every requested
attribute slot, including explicit unknowns for physical dimensions, owner/operator,
mission type, exact reentry location, physical structure, and lifetime regime.

Its reported event day is April 2, 2018; proposed display anchor is noon UTC. The original
two-hour trajectory keeps its actual sample times. Replaying that geometry at the display
anchor is an illustrative presentation mapping, not a new orbit calculation. Source plane
and altitude descriptors retain their April 1 epoch. The 145 km model sensitivity remains
available in diagnostics without preventing a useful tracer.

Next, add a small preprocessing adapter that emits this manifest alongside each existing
trajectory, joined by NORAD ID. Normalize the chosen event anchor once. A renderer should
consume the manifest, the geometry asset, and shared simulation time. The representative
and symbolic fallbacks should be added incrementally; they are specified here, not yet
implemented. The existing numerical diagnostic remains available without silently
relaxing its meaning or changing its source data.
