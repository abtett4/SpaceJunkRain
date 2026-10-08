import test from 'node:test';
import assert from 'node:assert/strict';
import { Tracer } from '../web/earth/Tracer.js';
import { selectMode } from '../web/earth/OrbitPanel.js';
import { normalizeSettings } from '../web/earth/TracerControls.js';

const positions = [[0, 2, 0, 0], [15, 0, 2, 0], [30, -2, 0, 0], [45, 0, -2, 0], [60, 2, 0, 0]];
const options = { positions, loopPeriodSeconds: 60, maxDisplaySeconds: 172800, radiusKm: 1,
  startTime: '2024-01-05T20:00:00Z', endTime: '2024-01-05T22:00:00Z' };

test('loops keep a fixed period and anchor phase as the display window changes', () => {
  const tracer = new Tracer(options);
  const now = tracer.endMs - 15000;
  const before = tracer.sample(now);
  tracer.configure({ visibleSeconds: 172800 });
  assert.deepEqual(tracer.sample(now), before);
  assert.deepEqual(tracer.sample(now - 60000).head, before.head);
  assert.equal(before.sourceMs, null, 'an illustrative loop never returns a source timestamp');
  assert.equal(before.phaseSeconds, 45);
  assert.deepEqual(tracer.sample(tracer.endMs).head.map(v => v || 0), [2, 0, 0]);
  assert.equal(tracer.sample(tracer.endMs + 1), null);
});

test('loop seams stay continuous and the tail follows the seam instead of bridging it', () => {
  const tracer = new Tracer(options);
  const seam = tracer.endMs - 60000;
  const a = tracer.sample(seam - 1), b = tracer.sample(seam + 1);
  assert.ok(Math.hypot(...a.head.map((v, i) => v - b.head[i])) < 0.001);
  tracer.configure({ trailSeconds: 30 });
  const tail = tracer.sample(seam + 15000).tail;
  assert.equal(tail.length, 3);
  assert.equal(Math.hypot(...tail[1].map((v, i) => v - tracer.sample(seam).head[i])), 0);
});

test('loop trails are clipped to the selected window and at most one revolution', () => {
  const tracer = new Tracer(options);
  tracer.configure({ visibleSeconds: 30, trailSeconds: 7200 });
  assert.equal(tracer.sample(tracer.startMs).tail.length, 1);
  assert.equal(tracer.sample(tracer.startMs - 1), null);
  tracer.configure({ visibleSeconds: 172800 });
  assert.equal(tracer.sample(tracer.endMs).tail.length, 5);
  tracer.configure({ trailSeconds: 0 });
  assert.equal(tracer.sample(tracer.endMs).tail.length, 1);
});

test('invalid periods and open loop geometry fail instead of producing a false path', () => {
  for (const loopPeriodSeconds of [0, -1, NaN, 61]) assert.throws(() => new Tracer({ ...options, loopPeriodSeconds }));
  assert.throws(() => new Tracer({ ...options, positions: [...positions.slice(0, -1), [60, 0, 0, 2]] }));
});

test('mode switches explicitly at the prepared sample limit and empty geometry is symbolic', () => {
  assert.equal(selectMode(7200, 7200, true), 'propagated');
  assert.equal(selectMode(7201, 7200, true), 'representative');
  assert.equal(selectMode(1800, null, true), 'representative');
  assert.equal(selectMode(7200, null, false), 'symbolic');
  assert.deepEqual(normalizeSettings(null, 172800), { reentryLeadSeconds: 7200, trailSeconds: 1200, widthScale: 3, markerScale: 3 });
  assert.equal(normalizeSettings({ trailSeconds: 172800 }, 172800).trailSeconds, 7200);
});
