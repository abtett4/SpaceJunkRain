# Next steps

## Status (2026-10-12)
- Live with three sheets: By source, Time in orbit, Earth view (Tyler Griffith). `main` at the
  merge of Tyler's PR #3.
- Data: SATCAT + historical decay messages retrieved 2026-10-07; GCAT times for 4,108 reentries.
- Events: 2019 SCD collisions, 2021 Yunhai/Kosmos 1408, USA 32 (2026), Titan 3C (1965) and nine
  Delta second-stage explosions, the last two groups cited to the 1999 NASA chronology.

### Open, for Tyler
- `web/vendor/README.md` says p5 2.3.3; the file's version string reads 2.3.1.
- Python tests: 3 failures and 2 errors (`test_mixed_sample`, `test_history_chunks`) that fail
  the same way on his branch. JS tests need Node.

### Open, general
- Verify the `alt_km` values and 2021 events marked "new" in `data/events.json`.
- Check Freesound licenses and credits for the SFX in the repo (one uploader account is deleted).
- Notes switch: on sheet 3 it only controls the monthly chart's April 2022 note, so it looks inert
  while the globe plays months before April 2022. Consider a note or an Earth-view use for it.
- The merged `sheet3-earth` branch can be deleted.

## Sonification (audio assignment, due 2026-10-19)
- Done on branch `sonification`: Web Audio engine (`web/js/audio/engine.js`) on the shared clock,
  and the timeline voice (`web/js/audio/sonify.js`): one note per reentry, same-day reentries
  from one launch merged into a louder note, dense frames folded into "rain", synthesized
  collision voices by kind. Sound switch and volume in the controls; off until clicked.
- Placeholder mappings to tune: launch -> pitch (A minor pentatonic) and pan; type -> register
  and timbre; same-day count -> loudness.
- Next: per-row listening (solo/combine, name search), port the 2019 SynthDefs, data mappings
  (altitude, inclination: the build must carry them), the yearly pulse, swap in the 2019
  collision recordings once their licenses are checked.
- Done: the Sun organ (`web/js/audio/organ.js`), the 2019 \organ SynthDef as a drone driven by
  NOAA SWPC sunspot numbers: smoothed -> pitch (A2-A3) and brightness, monthly -> loudness;
  sounds while the clock plays. Switch next to the volume. Credited in Data sources.
- Done: "Sunspots per month" chart (`web/js/sunchart.js`) above the monthly reentries on every
  sheet, same axis, zoom and scrub; solar maxima labelled with Notes on. What you hear follows
  what's shown: folded "Everything else" rows are silent until opened (`audible(i)`), and the
  Highlight menu filters the sound as it does the totals.
- Maybe: the sun as a sticky strip at the top of sheet 1 instead of (or as well as) the chart.

## Ideas (not started)

- **Next sheet, cadence:** solar cycle vs. reentry rate. Two stacked panels on one time axis
  (monthly reentries; sunspot number or F10.7), plus a folded "all cycles on one phase axis"
  view, possibly as a polar clock. Data: SILSO monthly sunspots (check license) or NOAA F10.7.
  First, check that the reentry peaks really line up with solar maxima.
- **Alternative sheet 3/4:** stock-and-flow "balance sheet". Launches + breakups in, reentries
  out, catalog population as the difference. SATCAT already has everything needed.
- **Sheets 4+:** 3D / WebGL.
- **"Why" layer:** a short claim + on-page evidence + a checked citation for each pattern
  (altitude vs. drag, Fengyun-1C lingering, Starlink deorbits, Kessler 1978). Verify every
  citation; nothing from memory.
- **Links:** NASA ODPO / ODQN, ESA Space Environment Report, Space-Track, UN debris
  mitigation guidelines, a neutral "find your representative" link.
- **Collaborators:** Tyler Griffith built the Earth view (orbital mechanics). Someone for space
  weather (the cadence sheet) is still an open question; no space-weather data exists yet.
  Workflow for contributors is in `CONTRIBUTING.md`.

## What sets us apart from CSET's "Mapping Space Debris" (Nov 2025)
CSET covers the stock still in orbit: attribution by country/source, top 20 sources, and a
Sankey of country → source → orbit regime (their Fig. 5). Snapshot as of Apr 2025. Cite it
as related work. We cover what comes down:
1. **Breakup lifecycles:** survival curves, share of each breakup still up vs. years since the
   event, all starting at t=0, explained by altitude.
2. **Forecast rain:** use the 93k Prediction messages in decay.json (currently dropped) for a
   "coming down in the next 60 days" panel; TIP messages for where things reenter.
3. **Why the cadence pulses:** the solar-cycle sheet.
4. **Always current:** scheduled rebuilds (fine under the data terms, with citation; respect
   Space-Track's once-a-day SATCAT limit).
5. **Every dot traceable:** link each object to its public CelesTrak SATCAT page.
6. **Sound:** a multisensory, accessible piece.
7. **Open method:** a reproducible pipeline.
Core identity: lifecycle + forecast + sound.

## Interactive sonification (maybe this week, maybe a later assignment; undecided)
- Web Audio: one channel (gain node) per source row → master output, driven by the existing
  playhead.
- Solo/add rows (speaker toggle by each label, Ctrl/Shift-click to combine), presets
  (collisions & ASAT, everything still falling), name search ("Cosmos" → every Cosmos source).
  What you hear = what stays in color.
- Exact day timing; merge same-day reentries into one louder chord; voice limit for dense
  stretches (Kosmos 1408 in 2022).
- Possible mappings: altitude → pitch, inclination → stereo pan, size → loudness/timbre.
  The build needs to carry APOGEE/PERIGEE/INCLINATION into decays.json.
- Port the 2019 SynthDefs (the waveguide flute needs an AudioWorklet); OSC → SuperCollider
  for a performance version.
- Collision SFX by kind; check Freesound licenses and credits (one uploader account is deleted).
- Accessibility: keyboard control, spoken event announcements during playback (aria-live),
  explicit "start listening" button (browsers block sound until a click).
- **Still to verify:** the 2021 events and alt_km values marked "new" in data/events.json;
  Freesound licenses for the SFX now in the public repo.
- **Data terms (resolved):** USSPACECOM allows redistribution of basic SSA data (SATCAT, decay
  and reentry data) and publication of analysis, with appropriate citation. Keep the
  "USSPACECOM via Space-Track.org" credit on every page and copy.

Re-sonification (this week if time allows, otherwise the later audio assignment, which might
then be something else): SuperCollider / Web Audio, one voice per source,
collision SFX by kind (bump / crash / explosion / fragmentation).

To view: `python -m http.server 8174 --directory web`, then http://localhost:8174
