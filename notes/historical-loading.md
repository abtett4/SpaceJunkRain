# Full historical catalog passages

The default preview is now **Full historical catalog · by year and passage**. Select a
year, then a passage, and Replay. The supplied catalog contains **35,692 reentries**
from 1957–2026. Every one appears exactly once across **1,132** bounded passages,
plus the existing curated Dragon CRS-14 launch. This is complete coverage of this
catalog snapshot, not all objects ever reentered and not complete launch coverage.

Months with more than 50 events are divided into chronological parts. Split boundaries
never divide events with identical anchors. Every passage stays within one month and
contains at most 50 events. Missing months mean no catalog events in that month.
The browser loads only the selected passage and its available geometry; switching
passages pauses and resets the feed. Event windows are clipped at passage boundaries.
Quiet-interval skipping remains enabled by default and configurable. Continuous
cross-passage playback is still a separate next step, not implied by full catalog coverage.
The most recent passage's playback range is capped at the existing clock endpoint.

The existing April geometry and stale Iridium reference evidence are reused. Other
records use the same catalog-only exporter and show labeled no-orbital-data pulses.
No new Space-Track requests were made. Unknown orbital history, location, ownership,
size and mission fields remain unknown; random display locations are not reentry estimates.
The empty-history alternative remains a selectable single-event demonstration; it does
not replace the richer available Iridium reference in the full catalog export.

## Build and validation

```sh
python3 tools/build_history_chunks.py --all-history
node tests/full-history.test.mjs
python3 -m unittest discover -s tests -p test_history_chunks.py
```

The full output lives in `web/data/history/all/`. The old 2018 pilot remains intact;
`--year 2018` rebuilds it. Full exports use deterministic gzip files and an uncompressed
index. The browser verifies compressed checksums and decoded size, decompresses using
DecompressionStream, then applies the same schema, catalog-join and geometry validation
as the small previews. Serve through HTTP on localhost or HTTPS; do not open via file://.
The browser must support DecompressionStream (modern browsers). The year/passage controls
keep the long index out of a single overwhelming dropdown.

The full index and event files total **4,076,097 bytes** compressed, excluding existing
geometry, Earth assets and the already-loaded compact timeline. No unbounded application
cache is introduced. Stale requests are aborted and stale load results cannot install.
The catalog-only export uses one-row column views so its joins do not repeatedly scan
the entire catalog for each fallback event.

The exhaustive test loads and validates all 1,132 passages, checks unique membership
against the catalog, loads every referenced geometry product and delivers all 35,693
crossings through the shared feed with quiet skipping on. A first local run took about
9.4 seconds for that offline CPU/validation workload; this is not GPU/FPS or network
performance. Dense split boundaries exposed floating-point day-to-millisecond drift:
expected interval membership now rounds to UTC milliseconds before boundary comparison,
matching the browser clock's precision. This prevents an event being counted on both
sides of a split by a sub-millisecond artifact.

Next: seamless passage transitions with neighboring visual windows and an uninterrupted
collaborator event traversal, followed by greater orbital-data coverage and GPU profiling.

---

## Earlier 2018 pilot record

# Bounded historical loading — 2018 pilot (previous milestone)

Choose **Historical passages · 2018 by month**, choose a month, then **Replay passage**.
The default historical month is April: 27 reentries plus the sourced Dragon launch,
versus 13 events in the original eight-day preview. All 251 catalog reentries in 2018
are available, plus that one curated launch. This is not complete launch coverage.

`tools/build_history_chunks.py` reads the existing normalized catalog and enriched
April collection locally. Existing event evidence is preserved; only relative geometry
links change. New records reuse `build_fallback_manifest` with explicitly unfetched
orbital history. These become no-orbital-data pulses through the existing display policy.
No new orbital geometry, launch times, reentry locations or raw downloads are fabricated.
Raw data and existing geometry files are unchanged.

Rebuild from the repository root:

```sh
python3 tools/build_history_chunks.py
node tests/history-chunks.test.mjs
python3 -m unittest discover -s tests -p test_history_chunks.py
```

The output is `web/data/history/2018/index.json` plus twelve monthly collections.
The index stores interval, membership count, byte count and SHA-256 for each chunk.
The browser loads the small index, then only the chosen month's event file and its
referenced geometry. It checks checksum, identity and bounds, then uses the existing
sequence validator to check complete membership against the timeline and validate geometry.
An in-flight selection is aborted when another starts; a revision guard prevents stale
responses installing. No previous scene or event feed survives a failed load.

One selected month is resident. The small index is reused, but event collections and
geometry caches are local to a load; returning to a month revalidates its files. There
is no unbounded application cache. The existing full compact timeline still loads as
before: this feature bounds the expanded orbital evidence and geometry, not that catalog.
Shared appearance settings and event objects remain separate. New months use current settings.

Changing months pauses, clears the crossing readout and seeks to the new month's start.
Playback stops at the month's endpoint. Cross-month autoplay and neighbor prefetch are
not implemented. Events are selected by anchors inside the month, so visual windows
are clipped at passage edges and events anchored outside it are not carried in. This is
explicitly a passage browser, not a seamless full-history simulation. A future continuous
loader needs window overlap, deduplication and an audio feed that survives chunk swaps.

## Measurements and limits

The shipped year contains 252 events in 12 files, 881,102 bytes including the index,
uncompressed and excluding already existing geometry. No month exceeds 28 events; the
existing 50-event scene cap is preserved. The exporter rejects denser months, rather
than truncating them or silently increasing the renderer budget. Other years may need
smaller chunks; the interface currently advertises only this validated 2018 pilot.

A local Node CPU diagnostic on 2026-10-10 loaded and validated every month, then sampled
1,000 clock positions per month and delivered every crossing through the shared feed.
April required 8 geometry products, with about 33 ms for preparation plus sampling and
16 ms for its 1,000 sampling calls in that run. Other months requested no geometry and
used about 9–18 ms for preparation plus sampling. These are local diagnostics, not
network benchmarks, GPU timings or guaranteed browser frame rates. Rerunning prints
current measurements. All 252 crossings were delivered, including end-boundary checks.

Next: seamless adjacent-chunk transitions with overlapping visual windows and stable
audio traversal, followed by denser historical intervals and actual browser frame profiling.
