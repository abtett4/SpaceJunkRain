// The Sun as an organ drone under the reentry rain, after the 2019 \organ SynthDef:
// four sines at 1x, 2x, 4x and 8x the pitch, a quarter each, spread across the stereo field
// (Splay), plus a sine an octave down at 0.4. Driven by NOAA SWPC's monthly sunspot numbers
// (web/data/solar.json, built by tools/build_solar.py and loaded once in main.js):
//   13-month smoothed sunspot number -> pitch (A2 at zero, up to A3 at the largest maximum)
//                                      and brightness (upper partials come in as the Sun wakes)
//   monthly sunspot number           -> loudness
// It sounds while the clock moves and fades out on pause, so it doesn't drone while you read.

import { EPOCH_MS, DAY_MS, upperBound } from '../util.js';

const LOW = 110;          // Hz at a sunspot number of 0 (A2); one octave up at the record maximum
const PARTIALS = [1, 2, 4, 8];
const SPREAD = [-0.9, -0.3, 0.3, 0.9]; // Splay across the stereo field
const GLIDE = 0.25;       // seconds for pitch and level to follow the data
const FADE = 0.6;         // seconds to swell in on play and fade out on pause

export function mountOrgan(app, engine, solar) {
  const { t, ssn, smooth } = solar;
  const top = solar.meta.maxSmooth;
  let voice = null, enabled = true;

  // value at a day, interpolated between monthly points (nulls skipped)
  function at(series, day) {
    let i = Math.max(0, Math.min(t.length - 2, upperBound(t, day + 1e-9) - 1));
    while (i > 0 && (series[i] == null || series[i + 1] == null)) i--;
    const a = series[i] ?? 0, b = series[i + 1] ?? a, f = Math.max(0, Math.min(1, (day - t[i]) / (t[i + 1] - t[i])));
    return a + (b - a) * f;
  }

  function build() {
    const ctx = engine.context;
    const out = ctx.createGain(); out.gain.value = 0; out.connect(engine.input);
    const oscs = [], gains = [];
    const add = (mult, pan, level) => {
      const o = ctx.createOscillator(); o.type = 'sine';
      const g = ctx.createGain(); g.gain.value = level;
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      if (p.pan) p.pan.value = pan;
      o.connect(g); g.connect(p); p.connect(out); o.start();
      oscs.push({ o, mult }); gains.push(g);
    };
    PARTIALS.forEach((m, k) => add(m, SPREAD[k], 0.25));
    add(0.5, 0, 0.4); // the sub-octave
    return { out, oscs, gains };
  }

  function update(day, playing) {
    if (!engine.enabled) return;
    if (!voice) voice = build();
    const ctx = engine.context, now = ctx.currentTime;
    const s = Math.max(0, at(smooth, day)) / top;          // 0 quiet Sun .. 1 record maximum
    const m = Math.max(0, at(ssn, day)) / top;
    const freq = LOW * 2 ** s;
    for (const { o, mult } of voice.oscs) o.frequency.setTargetAtTime(freq * mult, now, GLIDE);
    // brightness: partial k is weighted a^k, a growing with activity
    const a = 0.3 + 0.7 * s;
    voice.gains.forEach((g, k) => { if (k < PARTIALS.length) g.gain.setTargetAtTime(0.25 * a ** k, now, GLIDE); });
    const level = enabled && playing ? 0.06 + 0.16 * Math.min(1, m) : 0;
    voice.out.gain.setTargetAtTime(level, now, playing ? GLIDE : FADE / 3);
  }

  app.clock.subscribe(({ nowMs, playing }) => update((nowMs - EPOCH_MS) / DAY_MS, playing));

  return {
    meta: solar.meta,
    get enabled() { return enabled; },
    setEnabled(on) { enabled = on; update(app.state.playhead, app.state.playing); },
    resume() { update(app.state.playhead, app.state.playing); }, // after the engine is switched on
  };
}
