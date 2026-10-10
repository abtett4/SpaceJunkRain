# Earth rendering and geographical inspection (2026-10-10)

The existing mixed passage now uses Cosmic Clock's day/night textures and adapted
surface/atmosphere shaders. Cosmic Clock remains unchanged. Reentry preprocessing,
catalog assets and event times remain unchanged. `EarthScene` is still a reusable
display component; it does not know about Space-Track or event provenance.

## Time and coordinates

`SimulationClock` remains the only simulation timer. `OrbitPanel` passes its time
to `EarthScene.setTime()`. Earth rotation and sunlight update on seeks, replay and
speed changes; camera changes redraw the same simulation time. The p5 scene uses
`noLoop()`, not a second animation clock.

The source-to-display mapping is `[X, -Z, -Y] / referenceSphereRadiusKm`. This
reflection compensates for p5's screen-down Y convention: north appears up and
geographic east appears to the right when looking at Greenwich. The previous
`[X, -Z, Y]` mapping mirrored the geography once a texture was added. All source
trajectory samples are unchanged. `Tracer`, surface geometry, sunlight and picking
now share the corrected display convention.

Earth-local Greenwich is +X, north -Y, east -Z. A column-major matrix from GMST
rotates it into the equatorial display scene. GMST uses the Vallado expression,
with UTC approximating UT1 and polar motion omitted. The matrix is orthogonal;
its transpose maps a picked surface point back to Earth-fixed coordinates.
[Vallado's TEME/PEF discussion](https://www.celestrak.org/publications/AIAA/2006-6753/AIAA-2006-6753-Rev2.pdf)
provides the sidereal convention. This is a spherical geographic display, not a
precision Earth-orientation or impact-location product.

Astronomy Engine computes the apparent equatorial-of-date Sun. Its apparent
sidereal time locates the subsolar geographic point, then the same GMST matrix
places that point in the scene. This avoids mixing apparent and mean equinoxes
when lighting the surface. The Sun computation supplies lighting only, not solar
radiation magnitudes or the future solar-weather data stream.

Reference loops still have illustrative phase and node direction. Even the
Tiangong SGP4 replay is shifted to the assigned event anchor. A detailed Earth
therefore does not establish an event-time orbital position or impact location.
Surface pulses retain their stable illustrative latitude/longitude and turn with
Earth. Neither hover results nor place shortcuts modify event records.

## Geographic interaction

Hover picks the nearest visible sphere intersection using the camera, viewport,
and inverse Earth rotation. Its label appears below the globe, updates as Earth
moves beneath a stationary pointer, and clears off the globe or during dragging.
Click/tap pins a geographic point. A pin retains its coordinates as the clock
moves; it does not lock the camera to that location. Enter inspects the center;
Escape and Clear pin release it. Place shortcuts focus and pin the listed point.
Arrow keys and +/− retain the existing camera controls.

`Geography.js` resolves names from bundled polygons and place points. Named
seas/gulfs take precedence over larger containing ocean polygons by bounding-box
area; land regions take precedence over marine polygons. Point-in-polygon lookup
preserves holes and source antimeridian splits. This is generalized map context,
not address lookup. Facility radius is 75 km, city radius 100 km. The panel shows
distance and coordinates. [Credits, limits and rebuild instructions](../web/assets/earth/README.md).

If images fail, a plain globe remains available. If the gazetteer fails, coordinates
remain available without names. Geographic inspection never requires credentials.

## Future solar-weather attachment

The new collaborator owns solar data, spatial meaning, color/transparency mapping,
and solar audio. The original collaborator owns orbital audio and the existing
timeline work. Tyler owns orbital preprocessing, Earth and tracers. Shared event
crossing and audio seek behavior will be agreed in the next integration phase.

`scene.addLayer(layer)` registers a drawing adapter and returns a removal function.
The adapter implements `draw(frame)` and optionally `dispose()`. Its frame contains:

- `p`: the active p5 renderer, with the Earth camera and perspective already set.
- `timeMs`: current shared simulation timestamp, in UTC milliseconds.
- `earthRotation`: column-major 3×3 Earth-local-to-display rotation.
- `sunDirection`: unit vector toward the Sun in display coordinates.
- `eye`: camera position in display coordinates; `earthRadius`: 1 display unit.
- `settings`: immutable snapshot from the shared presentation configuration. Add future
  layer controls to that schema; do not create an independent preference menu.

Draw calls happen after the opaque Earth and decorative atmosphere, before orbital
tracers/pulses. A transparent overlay should retain depth testing, temporarily
disable depth writes, and restore its own custom WebGL state. The host wraps p5
state and restores shader/lights/depth writes. It does not sort arbitrary
transparent shells; a complex future overlay may need an agreed compositing pass.
Disposal runs on removal or scene disposal. No solar layer is registered yet.

An adapter must sample its preloaded data at `timeMs`, tolerate backward seeks,
and avoid creating its own timer. Missing solar values must stay distinguishable
from zero intensity. A planet-wide shell must not imply localized aurora or field
geometry unless the input supports that claim. Provide the data legend outside
the model. Audio subscribes to the shared clock/event contract separately; drawing
is never a sound trigger.

## Verification

`tests/earth-geography.test.mjs` covers Python SGP4 GMST reference values, screen
orientation, seasons/daylight, off-center surface picking at different viewpoints
and aspect ratios, pulse geographic stability, named-place thresholds, polygon
holes, antimeridian ocean lookups and missing coverage. Existing clock, tracer,
settings and sample tests remain in use. Browser checks cover imagery orientation,
keyboard/click inspection, both viewport layouts, shared-clock motion and pulses.

Current appearance defaults and user controls live in `web/PresentationConfig.js`.
Earth brightness, city lights and decorative atmospheric opacity update through
`configureAppearance(settings)` without changing time or source data. Tracers and
pulses consume the same snapshot. See [the configuration contract](launch-and-configuration.md).
