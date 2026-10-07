# Next steps (as of 2026-10-07)

Paused here. Nothing below is started.

- **Sheet 3, cadence:** solar cycle vs. reentry rate. Two stacked panels on one time axis
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
- **Possible collaborators (asked 2026-10-07, no reply yet; nothing assigned):** someone for
  orbital mechanics (e.g. verify `alt_km` in data/events.json, survival-curve physics) and
  someone for space weather (solar-cycle sheet). If anyone joins: git + a contributor README;
  each person fetches their own Space-Track data.

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
