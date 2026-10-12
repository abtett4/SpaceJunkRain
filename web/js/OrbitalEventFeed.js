// Discrete events on the existing simulation clock. Independent of renderers and audio engines.
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const boundary = (records, timeMs, after) => {
  let lo = 0, hi = records.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (records[mid].displayTimeMs < timeMs || after && records[mid].displayTimeMs === timeMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

export class OrbitalEventFeed {
  constructor(clock, { onError = error => console.error('Orbital event subscriber failed:', error) } = {}) {
    this.clock = clock;
    this.onError = onError;
    this.records = Object.freeze([]);
    this.states = new Set(); this.crossings = new Set();
    this.revision = 0; this.traversal = 0; this.collection = null;
    this.includeStart = true; this.disposed = false;
    this.snapshot = this.makeState('initial');
    this.unsubscribeClock = clock.subscribe(state => this.update(state));
  }
  makeState(reason, state = this.clock) {
    return Object.freeze({ reason, nowMs: state.nowMs, previousMs: state.previousMs ?? state.nowMs,
      playing: state.playing, rate: state.rate, revision: this.revision, traversal: this.traversal,
      collection: this.collection, eventCount: this.records.length });
  }
  notify(listeners, value) {
    // An optional contributor cannot prevent the clock, Earth, or other subscribers updating.
    for (const listener of [...listeners]) {
      try { listener(value); } catch (error) { try { this.onError(error); } catch { /* report hooks are also isolated */ } }
    }
  }
  subscribeState(listener) {
    if (this.disposed) throw new Error('Event feed is disposed.');
    this.states.add(listener); this.notify([listener], this.snapshot);
    return () => this.states.delete(listener);
  }
  subscribeCrossings(listener) {
    if (this.disposed) throw new Error('Event feed is disposed.');
    this.crossings.add(listener);
    return () => this.crossings.delete(listener);
  }
  replace(records, collection = null, { continuation = false } = {}) {
    if (this.disposed) throw new Error('Event feed is disposed.');
    const ids = new Set();
    const prepared = records.map(({ event, displayTimeMs }) => {
      if (!event?.eventId || !['launch','reentry'].includes(event.eventKind) || !Number.isFinite(displayTimeMs)
        || ids.has(event.eventId)) throw new Error('Event feed needs unique event IDs and finite display times.');
      ids.add(event.eventId);
      // Clone the input; no caller-owned event is frozen or decorated by this adapter.
      return freeze({ event: structuredClone(event), displayTimeMs });
    }).sort((a,b) => a.displayTimeMs-b.displayTimeMs || (a.event.eventId < b.event.eventId ? -1 : 1));
    const preparedCollection = freeze(structuredClone(collection));
    this.records = Object.freeze(prepared);
    this.collection = preparedCollection;
    this.revision++; if (!continuation) this.traversal++; this.includeStart = true;
    this.snapshot = this.makeState(continuation ? 'continuation' : 'collection');
    this.notify(this.states, this.snapshot);
  }
  update(state) {
    if (this.disposed) return;
    if (state.reason === 'seek') { this.includeStart = true; this.traversal++; }
    const includeStart = this.includeStart;
    const forward = state.reason === 'advance' && state.nowMs > state.previousMs;
    const starting = state.reason === 'play' && includeStart;
    // Consume this boundary before notifying subscribers, including on zero-length first frames.
    if (forward || starting) this.includeStart = false;
    this.snapshot = this.makeState(state.reason, state);
    const snapshot = this.snapshot;
    this.notify(this.states, snapshot);
    // A subscriber may seek or change collections. Never publish a stale batch afterward.
    if (this.snapshot !== snapshot || !(forward || starting)) return;
    const start = starting ? state.nowMs : state.previousMs;
    const from = boundary(this.records, start, !includeStart), to = boundary(this.records, state.nowMs, true);
    if (from === to) return;
    this.notify(this.crossings, Object.freeze({ ...snapshot,
      events: Object.freeze(this.records.slice(from,to)) }));
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.unsubscribeClock();
    this.records = Object.freeze([]); this.states.clear(); this.crossings.clear();
  }
}
