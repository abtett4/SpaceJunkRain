# Orbital view UI cleanup — plan (2026-10-11)

Last piece of Tyler's work before the PR to Alan (`abtett4/SpaceJunkRain`). Scope: the UI around
the 3D Earth and tracers. No changes to evidence, data files, rendering semantics or the
collaborator API.

## Decisions

- **Placement:** the orbital view becomes its own section **above** the timeline charts:
  hero → summary tiles → orbital view → timeline card (tabs, charts, histogram, title block).
- **Transport:** **one shared playback bar** (sticky while scrolling) drives the globe and the
  charts, which share one clock. It replaces the separate `▶ Animate` and `▶ Resume` buttons.
- **Examples:** the full historical catalog is the only main mode. Dragon alone, Tiangong-1,
  the April 2018 sample and the two Iridium fallbacks move into a collapsed **Other examples**
  section.
- **Target:** desktop browser first. Narrow widths must still work (single column, no
  horizontal scroll), but they are not the design target.

## Problems being fixed

1. Playback controls are in three places (timeline bar, orbit heading, scrubber at the
   bottom), and two play buttons drive the same clock with different behaviour.
2. The globe is small (~400 px), and the text column next to it has a large empty gap.
3. About eight caveat paragraphs are always visible and separate the controls from the globe.
4. "Preview input" puts the main mode in the same list as developer and demo examples.
5. The geographic reference panel takes the prime space under the globe.
6. The orbit panel sits inside the timeline card, between the chart and its controls.

## Target layout

```
Orbital view header ─ passage title · event count · date span
Shared transport (sticky) ─ Play/Pause · Replay passage · ◀ ▶ passage · clock readout ·
                            Speed · Year · Passage
┌──────────── globe (≈ 60–65 % width) ────────────┐ ┌ Now ───────────────────────┐
│ overlays: legend chips (tracer / launch / pulse) │ │ active · reached · next     │
│ geo readout + find place, zoom +/−               │ ├ Selected event ────────────┤
└──────────────────────────────────────────────────┘ │ name · mode · anchor ·      │
                                                     │ ▸ provenance                │
                                                     └─────────────────────────────┘
Event lanes = scrubber (drag the playhead, click a dot to inspect)
▸ Events reached   ▸ Configure visualization   ▸ About this view (caveats)
▸ Other examples
── timeline card (By source / Time in orbit, Highlight, type filter, charts) ──
```

- **Caveats stay.** Short evidence labels stay next to the marks (legend chips, inspector
  mode line). The longer explanations move into "About this view" word for word, per
  `notes/design-principles.md` (explain the data on the graphic; don't hide limitations).
- The timeline keeps its own view-only controls (tabs, Highlight, type filter) in its card.

## Constraints (backward compatibility)

- **Do not touch** the `experience` object (`clock`, `events`, `settings`, `earth.addLayer`),
  `OrbitalEventFeed` semantics, or the commented integration point in `web/app.js`.
  Collaborators' progress is unknown; treat these as a frozen public API.
- Keep the element IDs looked up by `OrbitPanel.js`, `GeographyPanel.js`,
  `EventPlaybackLog.js` and `app.js`. If one has to change, change the HTML and the module in
  the same commit.
- Keep `#speed` as the single shared speed control.
- Keep the import-map cache-busting version in step across `index.html` entries.
- All Python and Node tests must pass after every step.

## Open risk to check first

`#play` (Animate) runs the clock to the catalog end at timeline speeds (e.g. 1 s per year),
while `#orbit-pause` plays only to the current passage end and handles passage-to-passage
continuation. Before merging them, check what the globe does when the clock moves at
year-scale speeds (passage loading can't keep up with ~1,100 passages in ~70 s). Likely
policy: the shared Play uses the passage-aware path. At year-scale speeds the globe shows
a "too fast for the globe" state and stops loading passages until speed drops, while the
charts animate normally. Confirm with Tyler before implementing.

## Steps (one commit each, verified in the browser)

1. **Section split.** Move `.orbit-panel` out of the timeline card into its own section above
   it. Keep the markup otherwise unchanged. Verify both parts still work.
2. **Shared transport.** Build the sticky bar; move Speed and the readout into it. Wire one
   Play according to the policy above. Remove the duplicate buttons. Add ◀ ▶ passage.
3. **Stage layout.** Enlarge the globe. Move the legend and geographic readout to overlays and
   tighten the side column into "Now" and "Selected event".
4. **Lanes as scrubber.** Merge `#orbit-scrub` with the event lanes (keep an accessible range
   input, visually integrated, for keyboard use).
5. **Disclosures.** Move "About this view" (caveat text, unchanged), "Other examples"
   (former Preview input) and the existing log/config into the collapsed row.
6. **Polish and verification.** Light and dark themes, a narrow-width check, keyboard and
   focus order, and the full test suite. Update the README's orbital view section.
