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
  advance(elapsedRealMs) {
    if (!Number.isFinite(elapsedRealMs) || elapsedRealMs < 0) throw new Error('Invalid elapsed time.');
    if (!this.playing) return;
    const previous = this.nowMs;
    this.nowMs = Math.min(this.untilMs, this.nowMs + elapsedRealMs * this.rate);
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
