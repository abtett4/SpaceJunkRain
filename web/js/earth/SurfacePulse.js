// An illustrative surface mark, sampled only from the shared simulation clock.
// Coordinates describe presentation on the globe; no orbital or reentry calculation.
export class SurfacePulse {
  constructor({ latitudeDeg, longitudeDeg, durationSeconds, endTime, color = '#ffd166', markerRadiusEarth = 0.036 }) {
    if (!Number.isFinite(latitudeDeg) || Math.abs(latitudeDeg) > 90
      || !Number.isFinite(longitudeDeg) || longitudeDeg < -180 || longitudeDeg > 180
      || !Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('Invalid surface pulse.');
    this.endMs = Date.parse(endTime);
    if (!Number.isFinite(this.endMs)) throw new Error('Invalid pulse anchor.');
    this.durationSeconds = durationSeconds;
    this.startMs = this.endMs - durationSeconds * 1000;
    const lat = latitudeDeg * Math.PI / 180, lon = longitudeDeg * Math.PI / 180;
    this.normal = [Math.cos(lat) * Math.sin(lon), -Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
    this.color = color;
    this.configure({ visibleSeconds: durationSeconds, markerRadiusEarth });
  }
  configure({ visibleSeconds, markerRadiusEarth }) {
    if (!Number.isFinite(visibleSeconds) || visibleSeconds <= 0
      || !Number.isFinite(markerRadiusEarth) || markerRadiusEarth <= 0 || markerRadiusEarth > 0.1) {
      throw new Error('Invalid pulse presentation settings.');
    }
    this.visibleStartMs = Math.max(this.startMs, this.endMs - visibleSeconds * 1000);
    this.markerRadiusEarth = markerRadiusEarth;
  }
  sample(timeMs) {
    if (!Number.isFinite(timeMs) || timeMs < this.visibleStartMs || timeMs <= this.startMs || timeMs >= this.endMs) return null;
    const phase = (timeMs - this.startMs) / (this.durationSeconds * 1000);
    return { opacity: Math.sin(Math.PI * phase) ** 2,
      ring: surfaceRing(this.normal, this.markerRadiusEarth * (1 + 7 * phase), this.markerRadiusEarth * 0.22) };
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
