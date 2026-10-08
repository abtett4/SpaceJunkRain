import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SimulationClock } from '../web/js/SimulationClock.js';
import { Tracer, toScene } from '../web/js/earth/Tracer.js';

test('one clock notifies both layers and stops at the replay endpoint', () => {
  let scheduled, cancelled = 0;
  const clock = new SimulationClock({ minMs: 0, maxMs: 100000, nowMs: 1000, rate: 300,
    requestFrame: (fn) => { scheduled = fn; return 1; }, cancelFrame: () => cancelled++ });
  const timeline = [], earth = [];
  clock.subscribe((state) => timeline.push(state));
  clock.subscribe((state) => earth.push(state));
  clock.play(10000);
  scheduled(0);
  scheduled(20);
  assert.equal(clock.nowMs, 7000);
  scheduled(40);
  assert.equal(clock.nowMs, 10000);
  assert.equal(clock.playing, false);
  assert.deepEqual(earth, timeline);
  clock.seek(2000);
  assert.equal(earth.at(-1).reason, 'seek');
  assert.equal(earth.at(-1).nowMs, 2000);
  clock.play();
  clock.pause();
  const now = clock.nowMs;
  scheduled(200);
  assert.equal(clock.nowMs, now);
  assert.ok(cancelled > 0);
});

test('changing speed does not apply the new rate retroactively', () => {
  let scheduled;
  const clock = new SimulationClock({ minMs: 0, maxMs: 100000, nowMs: 0,
    requestFrame: (fn) => { scheduled = fn; return 1; }, cancelFrame: () => {} });
  clock.play(); scheduled(0); scheduled(100);
  clock.setRate(10); scheduled(150); scheduled(250);
  assert.equal(clock.nowMs, 1100);
  assert.throws(() => clock.setRate(-1));
  assert.throws(() => clock.seek(NaN));
});

test('axis adaptation preserves lengths and handedness, with north upwards', () => {
  assert.deepEqual(toScene([0, 0, 1], 1), [0, -1, 0]);
  assert.equal(Math.hypot(...toScene([3, 4, 12], 1)), 13);
  const a = toScene([1, 0, 0], 1), b = toScene([0, 1, 0], 1);
  const cross = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  assert.deepEqual(cross.map(v => v || 0), toScene([0, 0, 1], 1));
});

test('replay preserves original sample times and disappears outside its interval', () => {
  const tracer = new Tracer({ positions: [['2000-01-01T00:00:00Z', 1, 0, 0], ['2000-01-01T00:00:30Z', 0, 1, 0]],
    startTime: '2020-01-01T10:00:00Z', endTime: '2020-01-01T10:00:30Z', radiusKm: 1 });
  assert.equal(tracer.sample(tracer.startMs - 1), null);
  assert.equal(tracer.sample(tracer.endMs + 1), null);
  assert.equal(tracer.sample(tracer.startMs + 15000).sourceMs, Date.parse('2000-01-01T00:00:15Z'));
  assert.deepEqual(tracer.sample(tracer.startMs + 15000).head.map(v => v || 0), [0.5, 0, 0.5]);
  assert.deepEqual(tracer.sample(tracer.endMs).head.map(v => v || 0), [0, 0, 1]);
});

test('exported Tiangong event joins the catalog anchor and its original geometry', () => {
  const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
  const event = json('../web/data/tracers.json').events[0];
  const geometry = json('../web/data/trajectories/37820.json');
  const catalog = json('../web/data/decays.json');
  const i = catalog.cols.id.indexOf(event.object.noradId);
  const catalogMs = Math.round(Date.parse(catalog.meta.epoch) + catalog.cols.d[i] * 86400000);
  assert.equal(catalogMs, Date.parse(event.presentation.displayAnchorUtc));
  const tracer = new Tracer({ positions: geometry.trace, startTime: event.presentation.startTime,
    endTime: event.presentation.endTime, radiusKm: geometry.referenceSphereRadiusKm });
  assert.equal(tracer.sample(catalogMs).sourceMs, Date.parse(geometry.trace.at(-1)[0]));
  assert.equal(catalog.cols.p[i], 0);
  for (let ms = tracer.startMs; ms <= tracer.endMs; ms += 5000) {
    assert.ok(Math.hypot(...tracer.sample(ms).head) > 1, 'no linearly interpolated point inside the reference Earth');
  }
});
