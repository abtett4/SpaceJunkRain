// One source of simulation time for timeline, Earth, and future audio subscribers.
export class SimulationClock {
  constructor({ minMs, maxMs, nowMs = maxMs, rate = 1,
    requestFrame = (fn) => requestAnimationFrame(fn), cancelFrame = (id) => cancelAnimationFrame(id) }) {
    if (![minMs, maxMs, nowMs, rate].every(Number.isFinite) || minMs >= maxMs || rate <= 0) {
      throw new Error('Invalid simulation clock bounds or rate.');
    }
    Object.assign(this, { minMs, maxMs, rate, requestFrame, cancelFrame });
    this.nowMs = Math.max(minMs, Math.min(maxMs, nowMs));
    this.playing = false;
    this.untilMs = maxMs;
    this.listeners = new Set();
    this.frame = null;
    this.lastReal = null;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(reason, previousMs = this.nowMs) {
    const state = { nowMs: this.nowMs, previousMs, playing: this.playing, rate: this.rate, reason };
    this.listeners.forEach((fn) => fn(state));
  }
  seek(ms) {
    if (!Number.isFinite(ms)) throw new Error('Invalid simulation time.');
    const previous = this.nowMs;
    this.nowMs = Math.max(this.minMs, Math.min(this.maxMs, ms));
    this.lastReal = null;
    this.emit('seek', previous);
  }
  setRate(rate) {
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid simulation rate.');
    this.rate = rate;
    this.lastReal = null;
    this.emit('rate');
  }
  play(untilMs = this.maxMs) {
    if (!Number.isFinite(untilMs)) throw new Error('Invalid playback endpoint.');
    this.pause();
    this.untilMs = Math.max(this.minMs, Math.min(this.maxMs, untilMs));
    if (this.nowMs >= this.untilMs) return;
    this.playing = true;
    this.lastReal = null;
    this.emit('play');
    const tick = (realMs) => {
      this.frame = null;
      if (!this.playing) return;
      const delta = this.lastReal === null ? 0 : Math.max(0, realMs - this.lastReal);
      this.lastReal = realMs;
      this.advance(delta);
      if (this.playing) this.frame = this.requestFrame(tick);
    };
    this.frame = this.requestFrame(tick);
  }
  setPlaybackWindows(windows = null, range = null) {
    if (windows === null) { this.playbackWindows = null; return; }
    if (!range || !range.every(Number.isFinite) || range[0] >= range[1]
      || windows.some(w => w.length !== 2 || !w.every(Number.isFinite) || w[0] > w[1])) throw new Error('Invalid playback windows.');
    const merged = [];
    for (const [a,b] of windows.map(w => [Math.max(range[0],w[0]),Math.min(range[1],w[1])]).filter(w=>w[0]<=w[1]).sort((a,b)=>a[0]-b[0])) {
      const last = merged.at(-1);
      if (last && a <= last[1]) last[1] = Math.max(last[1],b);
      else merged.push([a,b]);
    }
    this.playbackWindows = { range: [...range], windows: merged };
  }
  playbackTarget(budget) {
    const plan = this.playbackWindows;
    if (!plan || this.untilMs !== plan.range[1] || this.nowMs < plan.range[0] || this.nowMs >= plan.range[1])
      return Math.min(this.untilMs,this.nowMs+budget);
    let cursor = this.nowMs;
    for (const [start,end] of plan.windows) {
      if (end <= cursor) continue;
      cursor = Math.max(cursor,start);
      const available = end-cursor;
      if (budget < available) return cursor+budget;
      budget -= available; cursor = end;
      if (budget === 0) return cursor;
    }
    return this.untilMs;
  }
  advance(elapsedRealMs) {
    if (!Number.isFinite(elapsedRealMs) || elapsedRealMs < 0) throw new Error('Invalid elapsed time.');
    if (!this.playing) return;
    const previous = this.nowMs;
    this.nowMs = this.playbackTarget(elapsedRealMs * this.rate);
    if (this.nowMs >= this.untilMs) this.playing = false;
    this.emit('advance', previous);
  }
  pause() {
    if (this.frame !== null) this.cancelFrame(this.frame);
    this.frame = null;
    this.lastReal = null;
    this.playing = false;
    this.emit('pause');
  }
  dispose() {
    this.pause();
    this.listeners.clear();
  }
}
