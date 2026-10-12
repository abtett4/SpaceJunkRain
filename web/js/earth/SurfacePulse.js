import { DEFAULTS, STYLE } from '../PresentationConfig.js';
import { latLonToVector } from './GeoMath.js';
// A surface mark sampled only from the shared simulation clock.
// Its caller supplies sourced or illustrative coordinates; no orbital calculation.
export class SurfacePulse {
  constructor({ latitudeDeg, longitudeDeg, durationSeconds, endTime, startTime, anchorEdge = 'end', color = STYLE.color, markerRadiusEarth = Number((STYLE.markerRadiusEarth * DEFAULTS.markerScale).toFixed(12)) }) {
    if (!Number.isFinite(latitudeDeg) || Math.abs(latitudeDeg) > 90
      || !Number.isFinite(longitudeDeg) || longitudeDeg < -180 || longitudeDeg > 180
      || !Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('Invalid surface pulse.');
    if (!['start', 'end'].includes(anchorEdge)) throw new Error('Invalid pulse anchor edge.');
    this.anchorEdge = anchorEdge;
    this.anchorMs = Date.parse(anchorEdge === 'start' ? startTime : endTime);
    this.endMs = this.anchorMs;
    if (!Number.isFinite(this.endMs)) throw new Error('Invalid pulse anchor.');
    this.durationSeconds = durationSeconds;
    this.startMs = this.endMs - durationSeconds * 1000;
    this.normal = latLonToVector(latitudeDeg, longitudeDeg);
    this.color = color;
    this.configure({ visibleSeconds: durationSeconds, markerRadiusEarth });
  }
  configure({ visibleSeconds, markerRadiusEarth, durationSeconds = this.durationSeconds, opacity = this.opacity ?? DEFAULTS.pulseOpacity }) {
    if (!Number.isFinite(visibleSeconds) || visibleSeconds <= 0
      || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(opacity) || opacity < 0 || opacity > 1
      || !Number.isFinite(markerRadiusEarth) || markerRadiusEarth <= 0 || markerRadiusEarth > 0.1) {
      throw new Error('Invalid pulse presentation settings.');
    }
    this.durationSeconds = durationSeconds; this.opacity = opacity;
    this.startMs = this.anchorEdge === 'start' ? this.anchorMs : this.anchorMs - durationSeconds * 1000;
    this.endMs = this.anchorEdge === 'start' ? this.anchorMs + durationSeconds * 1000 : this.anchorMs;
    this.visibleStartMs = this.anchorEdge === 'start' ? this.startMs : Math.max(this.startMs, this.endMs - visibleSeconds * 1000);
    this.visibleEndMs = this.anchorEdge === 'start' ? Math.min(this.endMs, this.startMs + visibleSeconds * 1000) : this.endMs;
    this.markerRadiusEarth = markerRadiusEarth;
  }
  sample(timeMs) {
    if (!Number.isFinite(timeMs) || timeMs < this.visibleStartMs || timeMs <= this.startMs || timeMs >= this.endMs || timeMs > this.visibleEndMs) return null;
    const phase = (timeMs - this.startMs) / (this.durationSeconds * 1000);
    return { opacity: this.opacity * Math.sin(Math.PI * phase) ** 2,
      ring: surfaceRing(this.normal, this.markerRadiusEarth * (1 + STYLE.pulseExpansion * phase), this.markerRadiusEarth * STYLE.pulseRingWidth) };
  }
}

// A geodesic annulus follows the sphere, including at the poles. Keeping every vertex
// just above its surface lets ordinary depth testing hide the far side of the Earth.
export function surfaceRing(normal, radius, halfWidth) {
  const [x, y, z] = normal;
  const length = Math.hypot(x, z);
  const a = length > 1e-10 ? [z / length, 0, -x / length] : [1, 0, 0];
  const b = [y*a[2]-z*a[1], z*a[0]-x*a[2], x*a[1]-y*a[0]];
  const vertices = [];
  for (let i = 0; i <= 64; i++) {
    const angle = i / 64 * 2 * Math.PI;
    const tangent = a.map((v, j) => v * Math.cos(angle) + b[j] * Math.sin(angle));
    for (const r of [Math.max(0, radius - halfWidth), radius + halfWidth]) {
      vertices.push(normal.map((v, j) => 1.004 * (v * Math.cos(r) + tangent[j] * Math.sin(r))));
    }
  }
  return vertices;
}
