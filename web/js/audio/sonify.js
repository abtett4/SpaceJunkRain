// Sonification of the reentry timeline, driven by the shared clock.
//
// Each reentry is a note on its (display) time. Reentries from the same launch on the same UTC
// day merge into one louder note, so a breakup's busy days sound as chords rather than smears.
// In very dense frames only the largest groups get notes and the rest become a burst of "rain".
// Collision and breakup markers sound their own voice. Mappings, still being tuned:
//   launch (source)  -> pitch and stereo position. The named sources (sheet 1's rows, biggest
//                       first) each get their own slot: 21 diatonic steps (A natural minor,
//                       three octaves) x 3 stereo places, so the 21 biggest have distinct pitches
//                       in the centre and the rest sit left. Other launches share the steps.
//                       (It was 15 pentatonic steps; diatonic adds the half steps B-C and E-F.)
//                       Pitch alone can't name 42 sources; pitch + place keeps them apart.
//                       Each named source also has its own brightness and attack, spread so
//                       that sources sharing a pitch differ in both.
//   object type      -> register and timbre (debris high blips, rocket bodies low, payloads mid)
//   radar size       -> loudness: small, medium, large (Space-Track's RCS_SIZE; objects without
//                       one, most reentries before 1980, take their type's usual size)
//   same-day count   -> loudness too: a busy day from one source is a louder note

import { EPOCH_MS, DAY_MS, upperBound, hash01 } from '../util.js';

const LATENCY = 0.08;          // seconds between the clock reaching a moment and hearing it
const NOTES_PER_FRAME = 10;    // the busiest groups in a frame get notes; the rest become rain
const OCTAVE = [0, 2, 3, 5, 7, 8, 10]; // A natural minor: A B C D E F G
const STEPS = [0, 12, 24].flatMap((o) => OCTAVE.map((s) => o + s)); // three octaves, 21 steps
const PLACES = [0, -0.6, 0.6];        // stereo positions for the named sources: centre, left, right
const BASE = [220, 82.5, 110, 110];    // Hz by type: debris (A3), rocket body (E2), payload, unknown
const SIZE_GAIN = [0.55, 1, 1.6];      // loudness by radar size: small, medium, large
const USUAL_SIZE = [1, 2, 2, 1];       // by type, for objects without a radar size: debris medium, others large
const BRIGHT = [0.45, 0.7, 1, 1.4, 2]; // filter multipliers, dark to bright
const ATTACK = [0.003, 0.012, 0.03, 0.06]; // seconds: a click to a swell

// named: family indices of the named sources, biggest first (the Highlight menu's order)
export function mountSonification(app, db, engine, named = []) {
  const { D, F, K, R, events } = db;
  const toDay = (ms) => (ms - EPOCH_MS) / DAY_MS;
  const slot = new Map(named.map((f, j) => [f, j]));
  const stepOf = (f) => (slot.has(f) ? slot.get(f) : f) % STEPS.length;
  const freqOf = (f, k) => BASE[k] * 2 ** (STEPS[stepOf(f)] / 12);
  const panOf = (f) => slot.has(f)
    ? PLACES[Math.min(PLACES.length - 1, Math.floor(slot.get(f) / STEPS.length))]
    : (hash01(f + 1) * 2 - 1) * 0.7;
  // brightness and attack: stepped through at different strides, so slots that share a pitch
  // (j and j + 21, in different places) also differ in colour and onset
  const charOf = (f) => {
    const j = slot.has(f) ? slot.get(f) : Math.floor(hash01(f + 7) * 60), lap = Math.floor(j / STEPS.length);
    return { bright: BRIGHT[(j * 2 + lap) % BRIGHT.length], attack: ATTACK[(j + lap * 2) % ATTACK.length] };
  };
  const sizeOf = (i) => (R[i] >= 0 ? R[i] : USUAL_SIZE[K[i]]);
  const gainOf = (n, size) => Math.min(0.42, 0.12 * (1 + Math.log2(n)) * SIZE_GAIN[size]);
  const play = (t, f, k, n, size) => engine.note(t, { freq: freqOf(f, k), gain: gainOf(n, size), kind: k, pan: panOf(f), ...charOf(f) });
  let lastReal = null;
  // the same voice the timeline uses for a group of n same-day reentries, sounded now
  const voice = (f, k, n = 1, size = USUAL_SIZE[k]) => play(engine.now + 0.02, f, k, n, size);

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
      if (g) { g.n++; g.size = Math.max(g.size, sizeOf(i)); } // a group sounds as big as its biggest piece
      else groups.set(key, { f: F[i], k: K[i], day: D[i], n: 1, size: sizeOf(i) });
    }
    const list = [...groups.values()].sort((a, b) => b.n - a.n);
    let folded = 0;
    list.forEach((g, idx) => {
      if (idx >= NOTES_PER_FRAME || !play(at(g.day), g.f, g.k, g.n, g.size)) folded += g.n;
    });
    if (folded) engine.rain(at((prev + now) / 2), { gain: Math.min(0.24, 0.04 * Math.sqrt(folded)) });

    // collision and breakup markers
    for (const e of events) if (e.t > prev && e.t <= now) engine.collision(at(e.t), e.kind);
  });

  return { voice, freqOf, panOf, charOf };
}
