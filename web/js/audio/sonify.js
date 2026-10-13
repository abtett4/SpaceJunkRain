// Sonification of the reentry timeline, driven by the shared clock.
//
// Each reentry is a note on its (display) time. Reentries from the same launch on the same UTC
// day merge into one louder note, so a breakup's busy days sound as chords rather than smears.
// In very dense frames only the largest groups get notes and the rest become a burst of "rain".
// Collision and breakup markers sound their own voice. Placeholder mappings, to be tuned:
//   launch (source)  -> pitch, from a pentatonic scale, and stereo position
//   object type      -> register and timbre (debris high blips, rocket bodies low, payloads mid)
//   same-day count   -> loudness

import { EPOCH_MS, DAY_MS, upperBound, hash01 } from '../util.js';

const LATENCY = 0.08;          // seconds between the clock reaching a moment and hearing it
const NOTES_PER_FRAME = 10;    // the busiest groups in a frame get notes; the rest become rain
const STEPS = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22]; // A minor pentatonic, two octaves
const BASE = [440, 110, 220, 220]; // Hz by type: debris, rocket body, payload, unknown

export function mountSonification(app, db, engine) {
  const { D, F, K, events } = db;
  const toDay = (ms) => (ms - EPOCH_MS) / DAY_MS;
  const freqOf = (f, k) => BASE[k] * 2 ** (STEPS[f % STEPS.length] / 12);
  const panOf = (f) => (hash01(f + 1) * 2 - 1) * 0.7;
  let lastReal = null;

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
      if (!app.counted(i)) continue; // follows Highlight and the sheet's own filters
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
    if (folded) engine.rain(at((prev + now) / 2), { gain: Math.min(0.2, 0.03 * Math.sqrt(folded)) });

    // collision and breakup markers
    for (const e of events) if (e.t > prev && e.t <= now) engine.collision(at(e.t), e.kind);
  });
}
