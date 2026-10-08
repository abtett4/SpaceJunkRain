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

The timeline tools need no third-party packages; Python 3.8+ standard library only. The optional
orbital tools below have separate dependencies. Pushing to `main` redeploys the site
from `web/` (see `.github/workflows/pages.yml`).

## Tracer visualization model and fallback previews

The existing page now includes a Tiangong-1 orbital tracer. Choose **Replay orbit** to
watch its default two-hour sample segment in 24 seconds. The timeline and Earth share one clock;
pausing or scrubbing either control changes the same simulation time. The globe supports
drag, pinch, scroll, arrow keys, and +/− zoom. No browser credentials or propagation are
needed: the preview uses the checked-in derived data and a local p5.js module.

Open **Configure tracer** to set the time shown before reentry (30 seconds to 48 hours),
trail history (head only to 2 hours), trail width, and marker size. Preferences
are saved in this browser; **Reset defaults** restores the two-hour window, 20-minute
history, and large (3×) width/size. If browser storage is unavailable, the
controls still work for the current visit. The trail tapers to zero width and opacity
at its oldest end, reaching the selected width and full opacity at the marker.
Color comes from event presentation data, with amber as the current default; its future
object/event-data mapping is still to be decided. Color is not a browser preference.
Earlier saved preferences retain their timing choices and adopt the large size defaults.

Within Tiangong-1’s prepared two-hour segment, a shorter window clips its final portion.
Longer windows explicitly switch to a representative orbit for the entire display window;
the SGP4 samples are never stretched or repeated. Window changes keep the event anchor
and clock fixed. Trail history is clipped to the window and, for representative orbits,
to at most one revolution. Replay starts the selected window at 300 simulated seconds per real
second and stops at the event anchor; the existing Speed control remains independent.
Width and marker size are visual choices, not physical dimensions. The after-launch control
will follow with the first launch example.

Date-only reentries receive stable random display times within their reported UTC day.
Tiangong-1 is assigned **2018-04-02T15:35:52Z**. This is an animation anchor, not an
estimated reentry time. The original SGP4 sample timestamps remain separate and visible.
The plain inertial globe makes no reentry-location or ground-impact claim.

After producing the diagnostic trajectory described below, regenerate the preview offline:

```bash
python tools/build_data.py --retime-existing
python tools/build_tracers.py \
  --trajectory data/processed/trajectories/37820.json \
  --gp-history data/raw/gp_history/37820/6c2ffa38f41e5d8e/response.json \
  --output-dir web/data
```

The adapter verifies source provenance and the timeline join. Its default output goes to
`data/processed/browser/`; the explicit output argument above refreshes the distributable
assets. It exports one object per run, not a bulk catalog. Retiming is idempotent and
preserves source dates, object attributes and column alignment. `cols.p` uses 0 for a
reported day and 1 for a reported timestamp. `cols.d` now holds presentation time in days
since the existing epoch. Do not treat its fractional part as observed timing precision.

See [the tracer model](notes/tracer-model.md), [the consumed manifest](web/data/tracers.json),
and [the portable example](data/examples/tracer-37820-reentry.json) for attributes and
provenance. Missing size, owner, mission, location and lifetime-orbit information stays
explicitly unknown. Launch tracers and a broader mixed sample are next steps.

`web/earth/` adapts Cosmic Clock's sphere mesh and camera only; Cosmic Clock itself is
unchanged. [Renderer credits](web/vendor/README.md) document the local p5 dependency.
The site remains static, with no new web build step. JavaScript modules require HTTP
serving, as do the existing JSON requests.

Validate the pipeline and clock/geometry contracts:

```bash
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
node tests/clock-tracer.test.mjs
node tests/tracer-settings.test.mjs
node tests/representative-tracer.test.mjs
node tests/surface-pulse.test.mjs
node tests/event-sequence.test.mjs
```

## Phase 2: explicit fallbacks

**Preview input** switches among three single-event inputs on the same page:

- **Tiangong-1:** original SGP4 replay for windows up to two hours; a separately prepared
  representative loop for longer windows.
- **Iridium 33 debris (38023), stale reference:** historical inclination and heights
  produce an illustrative loop. The reference is 2022-11-08, **422.5 days before** the
  reported 2024-01-05 decay day. Those elements are not propagated to the event.
- **The same debris event, empty near-event query:** one brief pulse on Earth's surface,
  with no tracer, labeled **No orbital data representation**. Its persistent random
  display point is illustrative; the real reentry location stays unknown. This demonstrates the actual empty cached query;
  it does not imply that no other history exists. The event anchor is identical to the
  stale-reference example, **2024-01-05T22:11:53Z**.

All modes use the existing shared clock and amber styling. Changing preview input pauses
without seeking; Replay focuses its event. Representative loops preserve reference
inclination and perigee/apogee, while node direction, periapsis direction and event phase
are illustrative. Their assets contain `[elapsed seconds, x, y, z]`, not UTC observation
samples. They repeat at a fixed reference/derived period, with no drag, precession or
atmospheric descent. The 48-hour maximum is a presentation limit, not a model-validity
claim. Details, source hashes and null unknowns remain in each manifest.

Missing-orbit pulses use a stable hash of event ID to choose a point uniformly by
spherical surface area (uniform longitude and uniform sine of latitude). The exported
`presentation.surfacePulse` is separate from the unknown factual `attributes.eventLocation`.
This is a neutral display policy, not a physical reentry distribution. Actual latitude
patterns depend on orbital inclination and other conditions; see the
[location policy and sources](notes/tracer-model.md#missing-orbit-surface-pulses).
One pulse fades in and out during the final ten simulated minutes before the display
anchor. Replay pulse focuses that interval, taking two seconds at the preset speed.
Longer windows do not repeat it; shorter windows clip it without shifting its phase.
Pause and seek reproduce the same appearance. Trail controls do not apply.

Regenerate Tiangong-1 with the existing command above; it also writes a separate
`37820-representative.json`. Build the two fallback previews entirely offline:

```bash
python tools/build_tracers.py --norad-id 38023 \
  --gp-history data/raw/gp_history/38023/46e447ca98a6bd6b/response.json \
  --output-dir web/data/fallbacks/stale
python tools/build_tracers.py --norad-id 38023 \
  --gp-history data/raw/gp_history/38023/7412ba0be6c2bca9/response.json \
  --output-dir web/data/fallbacks/empty
```

`tools/representative_orbit.py` is a small standard-library geometric sampler. It requires
valid reference inclination, positive ordered perigee/apogee, and eccentricity below 0.9;
missing node/anomaly does not block a motif. If the reference period is absent, a two-body
period is derived and labeled. Unsupported or incomplete geometry becomes symbolic;
corrupt snapshots, wrong object IDs and timeline mismatches fail explicitly. No new
Space-Track requests are made by this offline exporter. Phase 3 adds an explicit small
sample specification to the same exporter; broader catalog acquisition remains future work.

## Phase 3: a small historical passage

The default Earth preview now plays **all 12 catalogued reentries from April 2–9, 2018**:
six payloads, one rocket body and five debris objects. **Replay passage** takes 96 seconds
at two simulated hours per second. Reported days keep their original spacing, including
quiet intervals. Times within date-only days retain the existing stable assigned times.
This is a visual sequence on the shared clock; the colleague's audio layer remains a
later integration.

Six objects have orbital inputs: the existing Tiangong-1 SGP4 asset plus five newly fetched
three-day GP_HISTORY snapshots. The sample defaults to 4 hours before each orbital event with 5 minutes of visible trail,
so all six use reference loops at that setting. At two hours or less Tiangong-1 returns to
its prepared SGP4 replay. Six objects use illustrative surface pulses: five histories have
not been queried for this small sample, and the Fengyun-1C debris query returned no rows.
Those two coverage states remain distinct in the data and inspector. Missing data is not
evidence that no orbital history exists.

**Event sequence** shows one dot per event in payload/rocket/debris lanes. Click a dot to
pause, inspect and jump near that event without hiding the others. Expand **Event details
and provenance** to choose any object and read its source epoch, mode, unknown fields and
provenance. Active objects and the sample count follow the same clock as the full historical
charts. Pause/Resume and scrubbing work across the collection; playback stops at April 10
00:00 UTC. The existing Speed menu also has a slower passage setting. In **Configure tracer**,
**Show before each reentry** changes the event lead-up and **Visible trail history**
changes the trail length. Both apply to each event and are saved in this browser.

The sample's missing-orbit pulse is a **four-hour simulation-time motif**, taking two
seconds at the preset speed. It ends at the assigned event anchor, has a stable random
surface point, and carries no orbital path or factual reentry location. Single-event
pulse timing remains unchanged. Keys and labels stay outside the globe. Sample settings
are saved separately from single-event settings; the default marker and trail remain
large and amber, with width/opacity taper.

Rebuild offline from the explicit specification (all paths in it are repository-relative):

```bash
python tools/build_tracers.py --sample data/samples/april-2018.json \
  --output-dir web/data/samples/april-2018
```

The derived assets are included for browser use. To reproduce the newly
added inputs with your own Space-Track credentials, fetch these small windows once using
the existing immutable-cache tool (the Tiangong-1 setup is documented above):

```bash
python tools/spacetrack_fetch.py gp_history --norad-id 38249 --start 2018-03-31T00:00:00Z --end 2018-04-03T00:00:00Z
python tools/spacetrack_fetch.py gp_history --norad-id 31309 --start 2018-03-31T00:00:00Z --end 2018-04-03T00:00:00Z
python tools/spacetrack_fetch.py gp_history --norad-id 41486 --start 2018-04-02T00:00:00Z --end 2018-04-05T00:00:00Z
python tools/spacetrack_fetch.py gp_history --norad-id 41568 --start 2018-04-02T00:00:00Z --end 2018-04-05T00:00:00Z
python tools/spacetrack_fetch.py gp_history --norad-id 24965 --start 2018-04-04T00:00:00Z --end 2018-04-07T00:00:00Z
python tools/spacetrack_fetch.py gp_history --norad-id 31777 --start 2018-04-06T00:00:00Z --end 2018-04-09T00:00:00Z
```

The builder requires complete interval membership, unique NORAD IDs, matching timeline
anchors/classes and intact cached/imported hashes. Corrupt or missing required assets fail
explicitly. Unknown fields stay null; no browser data acquisition is introduced. The
original raw inputs and Tiangong geometry are preserved. Scope and scientific limits are
recorded in [the tracer model notes](notes/tracer-model.md#phase-3-small-mixed-passage).

## One-object orbital prototype

The first offline trajectory uses **TIANGONG 1, NORAD 37820**, already present in the
timeline, with reported decay **date 2018-04-02**. It is a last-known orbital estimate,
not an observed atmospheric reentry or impact path. The original candidate, IRIDIUM 33
DEB (38023), was rejected because its last available pre-decay element was over a year old.
See [the evidence and limitations](notes/orbital-prototype.md).

The downloader uses the same `.env` credentials as the timeline. Add `--dry-run` to either
command to inspect its URL without authentication, writes, or network requests:

```sh
python tools/spacetrack_fetch.py decay --norad-id 37820
python tools/spacetrack_fetch.py gp_history --norad-id 37820 \
  --start 2018-03-30T00:00:00Z --end 2018-04-03T00:00:00Z
```

Historical requests are limited to one object and GP windows of at most seven days, with
inclusive endpoints. Response bytes and metadata (query, retrieval time, SHA-256, row count)
are saved in `data/raw/<class>/<NORAD ID>/<query-hash>/`. Identical requests reuse the
snapshot indefinitely, including empty responses; `--force` is unavailable in targeted
mode. Corrupt/incomplete snapshots stop instead of triggering a download. Existing full
DECAY files are reused if they contain the object. Consult saved windows before changing
query bounds: a different window creates a new request. Space-Track asks that
[downloaded histories be stored and reused](https://www.space-track.org/documentation).
The legacy full-catalog commands retain their existing replaceable 24-hour cache.

Set up the optional orbital tools (Python 3.11+ for the pinned plotting dependencies):

```sh
python -m venv .venv
.venv/bin/python -m pip install -r requirements-orbit.txt
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python tools/propagate.py --norad-id 37820 \
  --gp-history data/raw/gp_history/37820/6c2ffa38f41e5d8e/response.json \
  --decay data/raw/decay/37820/f0e22da9e3871b49/response.json
```

Use the paths printed by the downloader if they differ. If it reuses a full DECAY file,
this first propagator requires a targeted snapshot with its metadata sidecar; it does not
yet read the legacy bulk format. Do not refetch just to change formats.

The offline propagator verifies snapshot checksums, retains original UTC times, selects
the latest numerically usable element epoch before the cutoff, and uses the full OMM
record including BSTAR. The default 24-hour age limit is a screening policy, not an
accuracy guarantee. It plots the last two hours (or the shorter available interval) at
30-second spacing, stops on an SGP4 failure, then exports JSON. It compares nearby
element sets to reveal sensitivity; this comparison is not a calibrated error bound.

Outputs are `data/processed/trajectories/37820-diagnostic.png` and `37820.json` (Git-ignored).
JSON positions are `[UTC timestamp, x, y, z]` in **TEME kilometers**, with NORAD identity,
source hashes, element age, decay precision, numerical diagnostics, and warnings. The
radius plot subtracts a WGS72 reference sphere; it is not geodetic altitude. Earth-fixed
coordinates would require a separate frame conversion before rendering geographic detail.

The retrieved DECAY records only support a calendar day, so this trajectory stops at the
**start** of April 2 UTC. Midnight is not promoted to an exact decay time. No ground
intersection or atmospheric descent is synthesized. The browser replay described above
uses these unchanged samples with a separate illustrative time mapping; audio remains a
later step.

Without orbital dependencies, `python -m unittest discover -s tests -v` still runs the
acquisition checks and explicitly skips the orbital checks.

## Data and citation

Data: U.S. Space Command (USSPACECOM), via [Space-Track.org](https://www.space-track.org):
satellite catalog (SATCAT) and satellite decay and reentry data. USSPACECOM gives blanket approval
to redistribute this basic SSA data, and to publish analysis based on it, on condition of
appropriate citation. Keep this citation with any copy of `web/data/decays.json` or work built on it.

- One row per object from SATCAT. Where a historical decay message carries a precise epoch that
  agrees with SATCAT (within 2 days), that epoch wins. Date-only decays receive stable random display times within their UTC day, with source precision retained in `cols.p`.
- Families are launch designators (`1993-036` = everything from the Cosmos 2251 launch).
- `data/events.json` is the hand-edited collision table: kind = bump | crash | explosion | fragmentation.
- Raw downloads (`data/raw/`, `data/decay.json`) stay out of git for size; each person fetches their own.

## Other files

- `2023/SatelliteDecay/`, `explode-6.scd`: the original 2019 SuperCollider and Max files.
- `ExplosionSounds.zip`, `FenderBender.zip`, and the `.wav` files: collision SFX from Freesound
  (the number in each file name is its Freesound ID); check each sound's license before reuse.
- Licensed under MPL-2.0 (see `LICENSE`).
