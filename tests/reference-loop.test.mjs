import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceLoop } from '../web/js/earth/ReferenceLoop.js';

// Values from tools/representative_orbit.py for the same inputs (perigee 334, apogee 348, 42.78°).
const PY = { period: 5481.265462014484, phase: 1.606285596622512, t: [[0.0, -252.39793710863754, 4928.330432217144, 4560.489580837793],
  [10.705596605497039, -334.7749119281138, 4925.7491947174585, 4558.101001807858],
  [2729.9271344017448, 141.99051193504835, -4930.408051217731, -4562.412130458894]] };

test('browser loop matches the Python reference sampler', () => {
  const g = referenceLoop({ perigeeKm: 334, apogeeKm: 348, inclinationDeg: 42.78, epochUtc: '2011-10-06T00:00:00Z' }, '37820:reentry:2018-04-02', 37820);
  assert.ok(Math.abs(g.periodSeconds - PY.period) < 1e-6);
  assert.ok(Math.abs(g.construction.phaseAtAnchorRad - PY.phase) < 1e-12);
  for (const [i, expected] of [[0, PY.t[0]], [1, PY.t[1]], [255, PY.t[2]]])
    g.trace[i].forEach((v, j) => assert.ok(Math.abs(v - expected[j]) < 1e-6, `sample ${i}[${j}]`));
  assert.deepEqual(g.trace.at(-1).slice(1), g.trace[0].slice(1));
  assert.equal(g.frame, 'illustrative-equatorial');
});

test('invalid elements leave a ring', () => {
  const ok = { perigeeKm: 300, apogeeKm: 400, inclinationDeg: 51.6, epochUtc: '2020-01-01T00:00:00Z' };
  assert.ok(referenceLoop(ok, 'x', 1));
  for (const bad of [{ perigeeKm: 0 }, { perigeeKm: 500, apogeeKm: 400 }, { inclinationDeg: 200 }, { apogeeKm: 400000 }, { epochUtc: 'never' }])
    assert.equal(referenceLoop({ ...ok, ...bad }, 'x', 1), null);
});
