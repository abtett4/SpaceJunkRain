import test from 'node:test';
import assert from 'node:assert/strict';
import { SurfacePulse } from '../web/js/earth/SurfacePulse.js';

const options = { latitudeDeg: 35, longitudeDeg: -110, durationSeconds: 600, endTime: '2024-01-05T22:11:53Z' };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} ≈ ${b}`);

test('one finite pulse fades in and out at the anchor without repeating', () => {
  const pulse = new SurfacePulse(options);
  for (const t of [pulse.startMs - 1, pulse.startMs, pulse.endMs, pulse.endMs + 1, NaN]) assert.equal(pulse.sample(t), null);
  near(pulse.sample(pulse.startMs + 150000).opacity, 0.5);
  near(pulse.sample(pulse.startMs + 300000).opacity, 1);
  near(pulse.sample(pulse.startMs + 450000).opacity, 0.5);
  assert.equal(pulse.sample(pulse.startMs - 600000), null);
});

test('seeks and reloads return the same surface mark with no moving head or trail', () => {
  const pulse = new SurfacePulse(options), t = pulse.endMs - 300000;
  const before = pulse.sample(t);
  pulse.sample(pulse.endMs);
  assert.deepEqual(pulse.sample(t), before);
  assert.deepEqual(new SurfacePulse(options).sample(t), before);
  assert.equal(before.head, undefined);
  assert.equal(before.tail, undefined);
});

test('display windows clip without rescaling phase, relocating or repeating the pulse', () => {
  const pulse = new SurfacePulse(options), t = pulse.endMs - 150000;
  const before = pulse.sample(t);
  pulse.configure({ visibleSeconds: 172800, markerRadiusEarth: 0.036 });
  assert.equal(pulse.visibleStartMs, pulse.startMs);
  assert.deepEqual(pulse.sample(t), before);
  pulse.configure({ visibleSeconds: 180, markerRadiusEarth: 0.036 });
  assert.equal(pulse.visibleStartMs, pulse.endMs - 180000);
  assert.equal(pulse.sample(pulse.visibleStartMs - 1), null);
  assert.deepEqual(pulse.sample(t), before);
});

test('rings are closed on the surface at equator, poles and arbitrary locations', () => {
  for (const latitudeDeg of [-90, -35, 0, 35, 90]) {
    const pulse = new SurfacePulse({ ...options, latitudeDeg });
    near(Math.hypot(...pulse.normal), 1);
    const ring = pulse.sample(pulse.endMs - 300000).ring;
    assert.equal(ring.length, 130);
    ring.forEach(point => near(Math.hypot(...point), 1.004));
    for (let j = 0; j < 3; j++) {
      near(ring[0][j], ring.at(-2)[j]);
      near(ring[1][j], ring.at(-1)[j]);
    }
  }
});

test('invalid coordinates, dates and pulse sizes fail explicitly', () => {
  for (const bad of [{ latitudeDeg: 91 }, { longitudeDeg: -181 }, { longitudeDeg: NaN },
    { durationSeconds: 0 }, { endTime: 'unknown' }, { markerRadiusEarth: -1 }]) {
    assert.throws(() => new SurfacePulse({ ...options, ...bad }));
  }
});
