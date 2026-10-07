# Design principles for Space Junk Rain

Working notes distilled (paraphrased, not quoted) from Edward Tufte, *The Visual Display of
Quantitative Information*, 2nd ed. (Graphics Press, 2001), plus how each applies here.

## Integrity
- Marks must be proportional to the numbers they stand for. Our dots sit at true dates; row
  jitter is only for visibility and carries no value. Say so if anyone could read it as data.
- Label important events directly on the data, and explain the data on the graphic itself.
- Never quote numbers out of context. "Still in orbit" includes working satellites: always say
  how much of it is debris (SATCAT 2026-10-07: 35,190 in orbit, ~12,500 of them debris).
- Show the data's variation, not the design's. Keep scales, row heights and colors constant
  across rows so differences come from the data.
- Don't encode more dimensions than the data has (no 3D bars, no area for 1D values).

## Data-ink
- Above all, show the data. Most of the ink should be data.
- Erase non-data ink (heavy grids, frames, boxes) and redundant data ink, within reason.
- Revise and edit: every element should earn its place on a second look.
- No chartjunk: moiré hatching, heavy grids, decoration that is about the tool rather than
  the data. Animation is fine when it carries time; the static view must stand on its own.
- Multifunctioning elements: one mark can do two jobs (a row's baseline also marks launch
  date; the monthly chart's x-axis serves both charts).

## Density and small multiples
- High data density is a virtue when the design keeps it legible.
- Small multiples: repeat one design so the eye compares data, not layouts. The by-source rows
  are small multiples on a shared time axis, like Marey's Paris-Lyon train schedule.

## Friendly graphics
- Words spelled out, horizontal, mixed case. Avoid all-caps names; keep true acronyms (ISS, PSLV).
- Labels on the graphic beat legends; short notes explain what to look at.
- Colors legible to colour-blind readers (validated palette slots 1-3; blue separates best).
- Words, numbers and pictures belong together; treat a graphic as a paragraph about data.
- Proportion: follow the data's shape; otherwise tend toward ~1.5x wider than tall.
- Simple design, complex data. Elegance comes from content that matters.

## Caveat (Tufte's own)
These principles produce options, not commandments. Break one rather than put a graceless
mark on the page.
