# Contributing to Space Junk Rain

Thanks for helping. This guide covers getting the site running, how the code is laid out,
how to add a sheet or a dataset, and what every change needs before it merges.

Live site: https://abtett4.github.io/SpaceJunkRain/

## 1. Run it locally

You need Python 3.8+ (standard library only, nothing to install) and your own
[Space-Track.org](https://www.space-track.org) account. Every contributor fetches their own data;
raw downloads never go in git.

```
copy .env.example .env                       # then add your Space-Track login
python tools/spacetrack_fetch.py             # SATCAT + decay messages -> data/raw/ (cached 24 h)
python tools/build_data.py                   # -> web/data/decays.json
python -m http.server 8174 --directory web   # then open http://localhost:8174
```

Space-Track asks for SATCAT at most once a day, and rate-limits queries (about 30 a minute and
300 an hour). The fetch script respects that; any new fetch script must too. Never commit `.env`.

## 2. How the repo is laid out

```
data/events.json         hand-curated collisions and breakups (see section 5)
tools/                   Python: fetch raw data, build the compact files the site loads
web/index.html           the page: text, controls, tabs
web/style.css            all colours (as tokens), type and layout
web/data/                compact JSON built by tools/ (committed, with citations)
web/js/main.js           start-up: load data, register sheets in tab order
web/js/chart.js          shared core: canvases, zoomable time axis, monthly chart,
                         collision markers, playback, tooltips, scrubbing
web/js/util.js           dates, formatting, names, constants (no DOM, no state)
web/js/theme.js          canvas colours from the CSS tokens; paper / blueprint switch
web/js/page.js           headline, summary cards, credits, shared data tables
web/js/tips.js           the tooltip for one object
web/js/sheets/*.js       one file per sheet: everything specific to that view
notes/                   design principles, roadmap
2023/, explode-6.scd     the original 2019 SuperCollider piece
```

The site is plain ES modules: no build step, no npm. Edit a file, refresh the browser.

## 3. Adding a sheet

A sheet is one view of the data that shares the time axis, zoom, playback and monthly chart.
Look at `web/js/sheets/orbit.js` (simpler) or `source.js` (more interactive) as a model.

1. Create `web/js/sheets/<name>.js` exporting `create<Name>Sheet(db)`, returning a sheet object.
2. Register it in `web/js/main.js` with `app.addSheet(...)`. Sheets are numbered in that order.
3. Add a tab to `index.html`: `<button role="tab" data-sheet="<id>">Tab label</button>`.
4. Give any controls that belong only to your sheet `data-sheet-only="<id>"` and `hidden`;
   the core shows them only on your sheet.

The sheet object (only the first group is required):

| Member | What it does |
|---|---|
| `id` | matches the tab's `data-sheet` |
| `title`, `caption(app)` | heading and caption above the chart; the caption is HTML and should name every colour in words |
| `frame(app)` | returns `{ M: {l, r, t, b}, height }`: plot margins in px, and the chart height (`null` = default) |
| `layout(app)` | set `app.PY[i]` for every object, and `app.hiddenPt[i] = 1` for objects this sheet doesn't draw. `app.PX[i]` (decay date) is already set |
| `colorOf(i, app)`, `radius(i, app)` | colour and size of each dot; use `C` from `theme.js`, never a literal colour |
| `pointTip(i, app)` | tooltip HTML for a dot; `objectTip(db, i)` from `tips.js` is the default |
| `attach(app)` | called once when registered |
| `enter(app)`, `leave(app)` | called when the sheet is shown or hidden |
| `drawUnder(app)` | draw behind the dots (row labels, y-axis ticks) |
| `drawNotes(app)` | draw notes on the plotting field; only called when Notes is on |
| `counts(i)` | false to leave object `i` out of the monthly chart and the "down" count |
| `filtered()` | true when your sheet hides part of the catalogue (hides whole-catalogue notes) |
| `hoverAt(app, x, y)`, `pointerDown(app, x, y)` | your own hover targets and clicks; return `null`/`false` to let the core handle them |
| `drawEventMark(app, e, x)`, `eventHitY(app, e, y)` | extra collision-marker drawing, and where it can be hovered |
| `topAxis`, `eventLines` (`'always'` or `'hover'`), `rainDrop`, `alpha` | small display options |

Helpers on `app`: `xOf(day, cv, M)`, `dayOf`, `M`, `main` (the canvas), `state` (playhead,
highlighted family, notes), `haloText`, `clipText`, `drawYTicks`, `relayout()` after anything
changes positions, `rebuild()` after anything changes colours, `draw()` for a repaint.
Dates are fractional days since 1957-01-01 UTC; `util.js` converts them.

## 4. Adding data

- Write the fetch/build step as a script in `tools/`, Python standard library if at all possible.
- Raw downloads go in `data/raw/` (git-ignored). The site loads a compact file from `web/data/`.
- Put a `meta` block in every built file with its source, retrieval date and citation.
- Keep built files small: the site loads them on every visit (`decays.json` is 1.7 MB).
  Thin long time series and keep only the columns a sheet draws.
- **Citations.** USSPACECOM allows redistribution of basic SSA data (TLE/OMM, SATCAT, decay and
  reentry data) and publication of analysis based on it, on condition of appropriate citation.
  Anything derived from it must carry "Data: U.S. Space Command (USSPACECOM), via Space-Track.org".
  Other sources (NOAA, SILSO, papers) need their own credit and license check.

## 5. The events table

`data/events.json` lists collisions and breakups. Each entry:

```
{ "date": "2009-02-10", "name": "Iridium 33 + Cosmos 2251", "kind": "explosion",
  "families": ["1997-051", "1993-036"], "alt_km": 790, "source": "scd" }
```

`kind` is `bump`, `crash`, `explosion` or `fragmentation` (shown as glancing contact, impact,
collision, fragmentation). `families` are launch designators whose debris belongs to the event;
`norad` (catalog numbers) can be used instead. `alt_km` feeds the notes on sheet 1. Every new
entry needs a source you can point to; mark unverified values in your pull request.

## 6. Design rules

Read `notes/design-principles.md` first. In short:

- Every mark is real data at its true position; no smoothing.
- Colours only from the tokens in `style.css`, in both paper and blueprint. New colours must
  pass the palette validator (colour-blind separation and contrast) against both sheets.
- Words on the chart beat legends: name colours in the caption, label important events in place.
- Mixed-case names (`pretty()` in `util.js`), EB Garamond, small caps for labels.
- Must work at phone width (375 px), with no sideways page scroll.
- Notes must fit or step aside: give longest-to-shortest wordings and draw the first that fits.

## 7. Workflow

1. Open (or take) an issue describing the change.
2. Work on a branch: `git switch -c tracer-iridium`.
3. Run the site locally and test it (checklist below).
4. Open a pull request against `main`. Someone else reviews it.
5. Merging to `main` redeploys the live site automatically. The deploy also stamps every CSS
   and JS file with the commit, so browsers never mix old and new files; nothing to bump by hand.

### Before you open a pull request

- [ ] Runs locally with no errors in the browser console
- [ ] Works on both sheets you touched, in paper and blueprint, and at phone width
- [ ] Zoom, Notes, Highlight and Animate still work on your sheet
- [ ] Data sources cited on the page and in the built file's `meta`
- [ ] Any claim about physics or history has a source in the PR (and on the page if shown)
- [ ] No raw downloads, no `.env`, no files over a few MB

## 8. Credit and license

Contributors are credited on the page (title block and the sheet they built) and in the README.
The project is licensed under MPL-2.0 (see `LICENSE`); by contributing you agree your work is
released under the same license.
