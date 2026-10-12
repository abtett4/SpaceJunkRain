// Browser twin of tools/representative_orbit.py: an illustrative loop from reference perigee,
// apogee and inclination only (here, GCAT's recorded orbit). Node, periapsis direction and
// phase are display choices; no drag, precession or descent. Same policy, same phase hash.
import { hashFraction } from '../DisplayPolicy.js';

export const RADIUS_KM = 6378.135;
const MU = 398600.8; // WGS72, as in the Python sampler
const POLICY = 'reference-ellipse-v1';
const SAMPLES = 512;

// Returns the same geometry shape the loader reads from prepared assets, or null when the
// elements can't make a valid loop (the event then stays a ring).
export function referenceLoop({ perigeeKm: low, apogeeKm: high, inclinationDeg: inc, epochUtc }, identifier, noradId) {
  if (![low, high, inc].every(Number.isFinite) || !(inc >= 0 && inc <= 180 && low > 0 && low <= high)
    || !Number.isFinite(Date.parse(epochUtc))) return null;
  const a = RADIUS_KM + (low + high) / 2, e = (high - low) / (2 * a);
  if (e >= 0.9) return null;
  const period = 2 * Math.PI * Math.sqrt(a ** 3 / MU);
  const phase = hashFraction(`${POLICY}:${identifier}`) * 2 * Math.PI;
  const tilt = inc * Math.PI / 180, cosT = Math.cos(tilt), sinT = Math.sin(tilt), b = a * Math.sqrt(1 - e * e);
  const trace = new Array(SAMPLES + 1);
  for (let k = 0; k < SAMPLES; k++) {
    const mean = (phase + 2 * Math.PI * k / SAMPLES) % (2 * Math.PI);
    // A standard starter (M + e sin M) converges in a few steps to the same root the Python uses.
    let E = e < 0.8 ? mean + e * Math.sin(mean) : Math.PI;
    for (let n = 0; n < 30; n++) {
      const change = (E - e * Math.sin(E) - mean) / (1 - e * Math.cos(E));
      E -= change;
      if (Math.abs(change) < 1e-13) break;
    }
    const x = a * (Math.cos(E) - e), y = b * Math.sin(E);
    trace[k] = [period * k / SAMPLES, x, y * cosT, y * sinT];
  }
  trace[SAMPLES] = [period, trace[0][1], trace[0][2], trace[0][3]];
  // Linear interpolation between samples must not cut through the reference Earth.
  for (let k = 0; k < SAMPLES; k++) {
    const [, x0, y0, z0] = trace[k], [, x1, y1, z1] = trace[k + 1];
    const vx = x1 - x0, vy = y1 - y0, vz = z1 - z0, d = vx * vx + vy * vy + vz * vz;
    const f = d ? Math.max(0, Math.min(1, -(x0 * vx + y0 * vy + z0 * vz) / d)) : 0;
    if (Math.hypot(x0 + f * vx, y0 + f * vy, z0 + f * vz) <= RADIUS_KM) return null;
  }
  return { schemaVersion: 1, id: noradId, frame: 'illustrative-equatorial', units: 'km', timeSystem: 'loop-seconds',
    referenceSphereRadiusKm: RADIUS_KM, periodSeconds: period, referenceEpochUtc: epochUtc, trace,
    construction: { policy: POLICY, basis: 'illustrative', inclinationDeg: inc, perigeeKm: low, apogeeKm: high, eccentricity: e,
      periodBasis: 'two-body-derived-from-reference-heights', phaseAtAnchorRad: phase } };
}
