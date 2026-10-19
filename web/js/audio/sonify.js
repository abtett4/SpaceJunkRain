// Sonification of the reentry timeline, driven by the shared clock.
//
// Each reentry is a note on its (display) time. Reentries from the same launch on the same UTC
// day merge into one louder note, so a breakup's busy days sound as chords rather than smears.
// In very dense frames only the largest groups get notes and the rest become a burst of "rain".
// Collision and breakup markers sound their own voice. Mappings, still being tuned:
//   launch (source)  -> pitch and stereo position. The named sources (sheet 1's rows, biggest
//                       first) each get their own slot: 15 pentatonic steps x 3 stereo places,
//                       so the 15 biggest have distinct pitches in the centre, the next 15 sit
//                       left and the rest right. Other launches share the steps, panned by hash.
//                       Pitch alone can't name 42 sources; pitch + place keeps them apart.
//   object type      -> register and timbre (debris high blips, rocket bodies low, payloads mid)
//   same-day count   -> loudness

import { EPOCH_MS, DAY_MS, upperBound, hash01 } from '../util.js';

const LATENCY = 0.08;          // seconds between the clock reaching a moment and hearing it
const NOTES_PER_FRAME = 10;    // the busiest groups in a frame get notes; the rest become rain
const STEPS = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27, 29, 31, 34]; // A minor pentatonic, three octaves
const PLACES = [0, -0.6, 0.6];        // stereo positions for the named sources: centre, left, right
const BASE = [220, 82.5, 110, 110];    // Hz by type: debris (A3), rocket body (E2), payload, unknown

// named: family indices of the named sources, biggest first (the Highlight menu's order)
export function mountSonification(app, db, engine, named = []) {
  const { D, F, K, events } = db;
  const toDay = (ms) => (ms - EPOCH_MS) / DAY_MS;
  const slot = new Map(named.map((f, j) => [f, j]));
  const stepOf = (f) => (slot.has(f) ? slot.get(f) : f) % STEPS.length;
  const freqOf = (f, k) => BASE[k] * 2 ** (STEPS[stepOf(f)] / 12);
  const panOf = (f) => slot.has(f)
    ? PLACES[Math.min(PLACES.length - 1, Math.floor(slot.get(f) / STEPS.length))]
    : (hash01(f + 1) * 2 - 1) * 0.7;
  let lastReal = null;
  // the same voice the timeline uses for a group of n same-day reentries, sounded now
  const voice = (f, k, n = 1) => engine.note(engine.now + 0.02,
    { freq: freqOf(f, k), gain: Math.min(0.32, 0.12 * (1 + Math.log2(n))), kind: k, pan: panOf(f) });

  app.clock.subscribe(({ reason, previousMs, nowMs }) => {
    if (reason === 'seek' || reason === 'pause') { engine.cancelAll(); lastReal = null; return; }
    if (reason !== 'advance' || !engine.enabled) return;
    const real = performance.now();
    const frame = lastReal == null ? 1 / 60 : Math.min(0.1, (real - lastReal) / 1000); // seconds
    lastReal = real;
    const prev = toDay(previousMs), now = toDay(nowMs);
    if (now <= prev) return;
    const base = engine.now + LATENCY;
    const at = (day) => base + Math.max(0, Math.min(1, (day - prev) / (now - prev))) * frame;

    // reentries reached this frame, grouped by launch, type and UTC day
    const groups = new Map();
    const from = upperBound(D, prev + 1e-9), to = upperBound(D, now + 1e-9);
    for (let i = from; i < to; i++) {
      if (!app.audible(i)) continue; // follows Highlight, the sheet's filters and what's folded away
      const key = `${F[i]}|${K[i]}|${Math.floor(D[i])}`;
      const g = groups.get(key);
      if (g) g.n++; else groups.set(key, { f: F[i], k: K[i], day: D[i], n: 1 });
    }
    const list = [...groups.values()].sort((a, b) => b.n - a.n);
    let folded = 0;
    list.forEach((g, idx) => {
      const gain = Math.min(0.32, 0.12 * (1 + Math.log2(g.n)));
      if (idx >= NOTES_PER_FRAME || !engine.note(at(g.day), { freq: freqOf(g.f, g.k), gain, kind: g.k, pan: panOf(g.f) })) folded += g.n;
    });
    if (folded) engine.rain(at((prev + now) / 2), { gain: Math.min(0.24, 0.04 * Math.sqrt(folded)) });

    // collision and breakup markers
    for (const e of events) if (e.t > prev && e.t <= now) engine.collision(at(e.t), e.kind);
  });

  return { voice, freqOf, panOf };
}
