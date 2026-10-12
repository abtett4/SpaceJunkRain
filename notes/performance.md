# Performance notes (2026-10-12)

Measured in headless Chrome with hardware GL on the development laptop, with the CPU
slowed 4× (DevTools throttling) to stand in for a slower machine. Without throttling every
scenario already held 60 fps; the work below is about headroom and month transitions.

| Scenario (4× CPU slowdown) | Before | After |
| --- | --- | --- |
| Playback, April 2018, 3 h/s | 33 fps, 8 long tasks / 20 s (longest 113 ms) | 54–58 fps, 1–2 long tasks |
| Dense playback, April 2022 (Cosmos 1408), 3 h/s | 44 fps, 6 long tasks (longest 147 ms) | 48–50 fps, 2–4 long tasks (longest ~70 ms) |
| Year-scale playback, 1 s/year | — | 58 fps |
| Cold start, simulated 20 Mbit/s, uncompressed local server | globe ready ≈ 4.6 s | ≈ 4.2 s |

## What changed

- **Timeline charts redraw only when something visible changes** (`app.js`, `drawIfChanged`):
  the playhead's pixel, the revealed count, active rain/event flashes, or hover. At hour-scale
  speeds the playhead crosses a chart pixel only every few seconds. The date readout still
  updates every tick.
- **Static chart layers are cached**: axes, lane labels and share bars render once per
  view/highlight/hover/size into an offscreen canvas; the histogram redraws only on pixel moves.
- **The "objects down" count is incremental** instead of rescanning every revealed object.
- **p5 friendly errors are off** (`P5.disableFriendlyErrors`): they validated every drawing call.
- **Globe redraws are coalesced** (`EarthScene.requestRedraw`): p5 2.x draws asynchronously and
  ignored a redraw requested mid-frame, which also caused a missed camera move after loads.
- **Side panel and strip writes are throttled**: the now-list/card refresh at ~10 Hz while
  playing; the strip skips DOM writes until the playhead moves 0.01 % of the year.
- **Month preparation is cheaper and split up**: catalog lookups use a per-catalog index
  instead of linear scans; reference loops start Newton's method from M + e·sin M; event
  preparation yields to the page every ten events, so a prefetch never blocks a whole frame.
- **Downloads start immediately**: an inline script in `index.html` starts `decays.json`,
  `launches.json` and the history index before the module graph loads, and the globe modules
  are `modulepreload`ed. `decays.json` is now revalidated (`no-cache`) instead of always
  refetched (`no-store`).

## Remaining costs, not changed

- p5's immediate-mode shapes convert colours per vertex (`structuredClone` inside p5) for trails
  and rings, a few percent of frame time. Replacing them needs custom WebGL buffers.
- The Earth images (2.6 MB of JPEG) are now the largest download; a 4096-px day image would
  roughly halve that, at some cost in close-zoom detail.
- `web/data/geography.json` (2.8 MB) is no longer fetched by the page but is still deployed.

The measurement driver (Chrome DevTools Protocol, headless Chrome) lives outside the repo; the
scenarios were: play 4 s per scenario and record rAF intervals; play 20 s across month
transitions and record `longtask` entries; cold load with network emulation.
