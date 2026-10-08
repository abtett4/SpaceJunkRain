import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Tracer } from '../web/earth/Tracer.js';
import { SimulationClock } from '../web/SimulationClock.js';
import { SETTINGS_KEY, normalizeSettings, readSettings, writeSettings } from '../web/earth/TracerControls.js';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const geometry = readJson('../web/data/trajectories/37820.json');
const event = readJson('../web/data/tracers.json').events[0];
function newTracer() {
  return new Tracer({ positions: geometry.trace, startTime: event.presentation.startTime,
    endTime: event.presentation.endTime, radiusKm: geometry.referenceSphereRadiusKm });
}

test('a shorter window clips the final source segment without retiming or changing its endpoint', () => {
  const tracer = newTracer();
  const originalPoints = JSON.stringify(tracer.points);
  const endpoint = tracer.sample(tracer.endMs);
  const earlier = tracer.sample(tracer.endMs - 20 * 60000);
  tracer.configure({ visibleSeconds: 1800, trailSeconds: 7200 });
  assert.equal(tracer.startMs, Date.parse(event.presentation.displayAnchorUtc) - 1800000);
  assert.equal(tracer.sample(tracer.startMs - 1), null);
  assert.equal(tracer.sample(tracer.startMs).sourceMs, Date.parse('2018-04-01T23:30:00Z'));
  assert.equal(tracer.sample(tracer.startMs).tail.length, 1, 'no hidden pre-window trail');
  assert.deepEqual(tracer.sample(tracer.endMs).head, endpoint.head);
  assert.deepEqual(tracer.sample(tracer.endMs - 20 * 60000).head, earlier.head);
  assert.equal(JSON.stringify(tracer.points), originalPoints);
  tracer.configure({ visibleSeconds: 7200 });
  assert.equal(tracer.startMs, Date.parse(event.presentation.startTime));
});

test('trail history has an interpolated boundary and zero means head only', () => {
  const tracer = newTracer();
  const now = tracer.startMs + 1265432;
  tracer.configure({ trailSeconds: 75 });
  const sample = tracer.sample(now);
  assert.deepEqual(sample.tail[0], tracer.sample(now - 75000).head);
  assert.deepEqual(sample.tail.at(-1), sample.head);
  assert.equal(sample.tail.length, 5); // two interpolated endpoints plus three 30-second samples
  tracer.configure({ trailSeconds: 0 });
  assert.deepEqual(tracer.sample(now).tail, [sample.head]);
});

test('unsupported or invalid display settings are rejected without partial changes', () => {
  const tracer = newTracer();
  const before = JSON.stringify(tracer);
  for (const values of [{ visibleSeconds: 7201 }, { visibleSeconds: 0 }, { trailSeconds: -1 },
    { markerRadiusEarth: NaN }, { lineWidthEarth: 0 }, { color: 'invalid' }]) {
    assert.throws(() => tracer.configure(values));
    assert.equal(JSON.stringify(tracer), before);
  }
});

test('display changes leave the paused or playing shared clock and event anchor untouched', () => {
  const tracer = newTracer();
  const clock = new SimulationClock({ minMs: tracer.startMs, maxMs: tracer.endMs, nowMs: tracer.startMs,
    rate: 300, requestFrame: () => 1, cancelFrame: () => {} });
  const anchor = tracer.endMs;
  for (const playing of [false, true]) {
    if (playing) clock.play();
    const before = { nowMs: clock.nowMs, rate: clock.rate, playing: clock.playing };
    tracer.configure({ visibleSeconds: 1800, color: '#ffd166', lineWidthEarth: 0.016, markerRadiusEarth: 0.024 });
    assert.deepEqual({ nowMs: clock.nowMs, rate: clock.rate, playing: clock.playing }, before);
    assert.equal(tracer.endMs, anchor);
  }
  clock.advance(18000);
  assert.equal(clock.nowMs, tracer.startMs);
  clock.advance(6000);
  assert.equal(clock.nowMs, anchor);
  assert.equal(clock.playing, false);
  clock.seek(tracer.startMs);
  assert.equal(tracer.sample(clock.nowMs).sourceMs, Date.parse('2018-04-01T23:30:00Z'));
});

test('preferences round-trip and resetting removes only the tracer key', () => {
  const data = new Map([['sjr-theme', 'dark']]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key) };
  const values = normalizeSettings({ reentryLeadSeconds: 1800, trailSeconds: 300, widthScale: 2,
    markerScale: 1.5, color: '#ffd166' }, 7200);
  assert.equal(writeSettings(storage, values), true);
  assert.deepEqual(readSettings(storage, 7200), values);
  assert.equal(writeSettings(storage, values, true), true);
  assert.equal(data.has(SETTINGS_KEY), false);
  assert.equal(data.get('sjr-theme'), 'dark');
  assert.deepEqual(readSettings(storage, 7200), normalizeSettings(null, 7200));
});

test('corrupt, future-version or unavailable preferences fall back safely', () => {
  const defaults = normalizeSettings(null, 7200);
  for (const content of ['{', 'null', '7', '{"version":2,"values":{"color":"#ffd166"}}']) {
    assert.deepEqual(readSettings({ getItem: () => content }, 7200), defaults);
  }
  const blocked = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
  assert.deepEqual(readSettings(blocked, 7200), defaults);
  assert.equal(writeSettings(blocked, defaults), false);
  assert.equal(writeSettings(undefined, defaults), false);
});

test('saved values are bounded by available geometry and supported styles', () => {
  const values = normalizeSettings({ reentryLeadSeconds: 999999, trailSeconds: -100,
    widthScale: Infinity, markerScale: 99, color: 'not-a-color' }, 1800);
  assert.deepEqual(values, { reentryLeadSeconds: 1800, trailSeconds: 0, widthScale: 1,
    markerScale: 3, color: '#70e1bc' });
});
