# Space Junk Rain: notes for Claude Code

Read this first in any session on this repo. It is a summary of decisions, not a transcript.
The repo and the site are **public**: never commit transcripts, credentials, local paths or
anything personal.

## What this is
An interactive data visualization of every catalogued object that has reentered Earth's
atmosphere, 1957 to today, each on its real decay day. Successor to Alan Tett's 2019
SuperCollider sonification (ATLS 4519, with Gerald Robinson); now a grad-school creative
technology project, possibly to be shared with Space-Track and NASA's Orbital Debris Program
Office. Live: https://abtett4.github.io/SpaceJunkRain/ (deploys on every push to `main`).

## Sheets
1. **By source** (`web/js/sheets/source.js`): one row per major breakup, dots on reentry days,
   share-down bars, notes written in empty row space ("same Delta stage, opposite fates" etc.).
2. **Time in orbit** (`sheets/orbit.js`): decay date vs. lifespan, Log/Linear switch, type
   filters, streak notes (ISS-released satellites, Titan 3C debris).
3. **Earth view** (`sheets/earth.js` + `web/js/earth/`): Tyler Griffith's globe, tracers and
   launches on the shared clock. His code and notes (`notes/earth-*.md`, `notes/orbital-*.md`,
   `notes/collaborator-integration.md`); coordinate with him before changing it.

Shared core: `web/js/chart.js` (time axis, zoom, monthly chart, markers, playback, tooltips),
driven by Tyler's `SimulationClock.js`. The sheet interface is documented in `CONTRIBUTING.md`.

## Data rules
- Space-Track data: each person uses their own login in `.env` (git-ignored; never print or
  commit it). Raw downloads stay out of git. SATCAT at most once a day.
- Every derived file and page cites **"U.S. Space Command (USSPACECOM), via Space-Track.org"**
  (redistribution is allowed only with citation). GCAT: J. McDowell, CC-BY-4.0, also cited.
- `data/events.json` is hand-curated; every entry needs a source. Values marked "from memory"
  (some `alt_km`) still need verifying.
- **Never state facts from memory as if checked.** Verify citations; say plainly what's unverified.
- Space weather: monthly sunspot numbers from NOAA SWPC's Solar Cycle Progression
  (`data/observed-solar-cycle-indices.json` -> `tools/build_solar.py` -> `web/data/solar.json`).
  The sunspot numbers are WDC-SILSO's (Royal Observatory of Belgium, **CC BY-NC 4.0**: credit
  "Source: WDC-SILSO, Royal Observatory of Belgium, Brussels", non-commercial use only). Smoothed
  maxima: 1958-03, 1968-11, 1979-12, 1989-11, 2001-11, 2014-04, 2024-10; minima 1964-10, 1976-03,
  1986-09, 1996-05, 2008-12, 2019-12. The page's solar-cycle note also cites the 1999 NASA chronology.

## Design (see `notes/design-principles.md`)
Tufte-inspired: real positions, no smoothing, words on the chart instead of legends, mixed-case
names, EB Garamond, paper (light) and blueprint (dark) themes. Colours only from tokens in
`web/style.css`, checked for colour-blind separation and contrast in both themes. Notes give
longest-to-shortest wordings and draw only what fits; must work at phone width.

## Working conventions
- Test every change in a browser (both themes, phone width, no console errors) before pushing.
  Browser caches mislead local testing: refresh the modules or use a fresh tab.
- The deploy stamps asset versions automatically (`tools/stamp_assets.py`); no manual bumps.
- Merge collaborators' work with merge commits so their authorship stays; credit Tyler as
  "Tyler Griffith" (GitHub: tyler-the-griffith).
- Don't name or assign collaborators in public files until they've agreed.
- Commit messages explain the why; pull requests describe what was checked and what wasn't.

## Where things stand
See `notes/next-steps.md` for open work and ideas.
