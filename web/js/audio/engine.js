// The sound engine: one AudioContext, a master chain, and a few synthesized voices.
// Nothing makes sound until enable() is called from a click (browsers require it).
// Voices are synthesized, not samples, so there's nothing to license; the 2019 recordings
// can replace the collision voices once their licenses are checked.

const MAX_VOICES = 48; // a ceiling on overlapping sounds, so dense years stay listenable

export function createAudioEngine() {
  let ctx = null, master = null, out = null, noise = null, drops = null;
  let volume = 0.7;
  const live = new Set(); // sources started or scheduled and not yet ended

  function chain() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    // master volume -> gentle compression so chords and storms don't clip
    out = ctx.createDynamicsCompressor();
    out.threshold.value = -18; out.knee.value = 12; out.ratio.value = 4;
    out.attack.value = 0.005; out.release.value = 0.25;
    master = ctx.createGain(); master.gain.value = volume;
    master.connect(out); out.connect(ctx.destination);
    // two seconds of white noise, shared by the noisy voices
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // two seconds of rain: about 1,500 droplets a second, each a few milliseconds of decaying
    // noise at a random level, so dense moments patter instead of hiss
    drops = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const r = drops.getChannelData(0), sr = ctx.sampleRate;
    for (let k = 0; k < 3000; k++) {
      const at = Math.floor(Math.random() * (r.length - sr * 0.01)), len = Math.floor(sr * (0.001 + Math.random() * 0.004));
      const amp = 0.2 + 0.8 * Math.random() ** 2;
      for (let j = 0; j < len; j++) r[at + j] += amp * (Math.random() * 2 - 1) * Math.exp(-5 * j / len);
    }
  }

  // keep track of every source so a seek or pause can silence what's queued
  function track(src, end) {
    live.add(src);
    src.onended = () => live.delete(src);
    src.stop(end);
    return src;
  }
  const room = () => live.size < MAX_VOICES;

  // a gain envelope: fast attack, exponential fall
  function envelope(t, peak, attack, release) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
    return g;
  }
  function panner(pan) {
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (p.pan) p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(master);
    return p;
  }

  // One object coming down: a short note whose pitch falls as it "lands",
  // after the 2019 \decay SynthDef (Blip with a falling XLine).
  // kind: 0 debris (bright blip), 1 rocket body (low thump), 2 payload / other (soft bell)
  function note(t, { freq, gain = 0.15, kind = 0, pan = 0 }) {
    if (!room()) return false;
    const shape = [
      { type: 'square', attack: 0.004, release: 0.22, fall: 0.5, cutoff: 3200 },
      { type: 'triangle', attack: 0.008, release: 0.7, fall: 0.4, cutoff: 700 },
      { type: 'triangle', attack: 0.008, release: 0.6, fall: 0.85, cutoff: 4000 },
    ][Math.min(kind, 2)];
    const osc = ctx.createOscillator();
    osc.type = shape.type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * shape.fall, t + shape.attack + shape.release);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = shape.cutoff;
    const env = envelope(t, gain, shape.attack, shape.release);
    const p = panner(pan), end = t + shape.attack + shape.release;
    osc.connect(lp); lp.connect(env); env.connect(p);
    osc.start(t);
    track(osc, end + 0.05);
    if (kind === 1) {
      // rocket body: weight from a sine an octave down that rings on past the note
      const sub = ctx.createOscillator(); sub.type = 'sine';
      sub.frequency.setValueAtTime(freq / 2, t);
      sub.frequency.exponentialRampToValueAtTime(freq / 2 * shape.fall, end + 0.3);
      const se = envelope(t, gain * 1.1, 0.012, shape.release + 0.3);
      sub.connect(se); se.connect(p);
      sub.start(t); track(sub, end + 0.35);
    }
    return true;
  }

  // A patter of droplets: the many reentries folded together in a dense moment
  function rain(t, { gain = 0.08, pan = 0, length = 0.4 } = {}) {
    if (!room()) return false;
    const src = ctx.createBufferSource(); src.buffer = drops;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 0.5;
    const env = ctx.createGain(); // swell in, hold, fall away
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t + 0.04);
    env.gain.setValueAtTime(Math.max(gain, 0.0002), t + length * 0.5);
    env.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(bp); bp.connect(env); env.connect(panner(pan));
    src.start(t, Math.random() * 1.4);
    track(src, t + length + 0.05);
    return true;
  }

  // Collision and breakup events, by the 2019 categories (stand-ins for the recordings)
  function collision(t, kind) {
    const thud = (f, peak, rel) => {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.5, t + rel);
      const e = envelope(t, peak, 0.005, rel); o.connect(e); e.connect(panner(0));
      o.start(t); track(o, t + rel + 0.1);
    };
    const burst = (cutoff, peak, rel, at = t) => {
      const s = ctx.createBufferSource(); s.buffer = noise;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
      const e = envelope(at, peak, 0.004, rel); s.connect(f); f.connect(e); e.connect(panner(0));
      s.start(at, Math.random()); track(s, at + rel + 0.1);
    };
    // high-passed noise that hangs on after a hit: the sizzle
    const hiss = (cutoff, peak, rel) => {
      const s = ctx.createBufferSource(); s.buffer = noise;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = cutoff;
      const e = envelope(t + 0.01, peak, 0.02, rel); s.connect(f); f.connect(e); e.connect(panner(0));
      s.start(t, Math.random()); track(s, t + rel + 0.1);
    };
    if (kind === 'bump') thud(90, 0.5, 0.35);                                     // glancing contact
    else if (kind === 'crash') {                                                  // impact
      thud(55, 0.8, 1.0); thud(130, 0.4, 0.22);   // weight, then a punch on top
      burst(2400, 0.5, 0.7);                      // the crunch
      hiss(5500, 0.22, 1.8);                      // the sizzle
    }
    else if (kind === 'explosion') { burst(500, 0.6, 2.6); thud(45, 0.6, 1.8); }  // collision
    else for (let k = 0; k < 7; k++) burst(3500, 0.25, 0.12, t + k * 0.07 + Math.random() * 0.04); // fragmentation
  }

  return {
    get enabled() { return !!ctx && ctx.state === 'running'; },
    get now() { return ctx ? ctx.currentTime : 0; },
    get context() { return ctx; },   // for continuous voices (the organ) that build their own graph
    get input() { return master; },  // where those voices connect: master volume and compression
    async enable() {
      if (!ctx) chain();
      if (ctx.state !== 'running') await ctx.resume();
      return this.enabled;
    },
    async disable() { this.cancelAll(); if (ctx) await ctx.suspend(); },
    setVolume(v) { volume = v; if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); },
    cancelAll() { for (const s of live) { try { s.stop(); } catch (e) { /* already stopped */ } } live.clear(); },
    note, rain, collision,
  };
}
