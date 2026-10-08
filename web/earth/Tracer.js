// Coordinates stay TEME. This proper rotation only adapts them to p5's screen axes.
export const toScene = ([x, y, z], radiusKm) => [x / radiusKm, -z / radiusKm, y / radiusKm];

export class Tracer {
  constructor({ positions, startTime, endTime, radiusKm, color = '#ffd166',
    objectType = 'UNKNOWN', trailSeconds = 1200, markerRadiusEarth = 0.012, lineWidthEarth = 0.008 }) {
    this.startMs = Date.parse(startTime);
    this.endMs = Date.parse(endTime);
    if (!Number.isFinite(this.startMs) || !Number.isFinite(this.endMs) || this.endMs <= this.startMs
      || !Number.isFinite(radiusKm) || radiusKm <= 0 || !Array.isArray(positions) || positions.length < 2) {
      throw new Error('Invalid tracer interval or geometry.');
    }
    this.points = positions.map((p) => {
      if (p.length !== 4 || !p.slice(1).every(Number.isFinite)) throw new Error('Invalid XYZ sample.');
      return { time: Date.parse(p[0]), xyz: toScene(p.slice(1), radiusKm) };
    });
    if (this.points.some((p, i) => !Number.isFinite(p.time) || (i && p.time <= this.points[i - 1].time))) {
      throw new Error('Tracer sample times must increase.');
    }
    this.sourceStartMs = this.points[0].time;
    this.sourceEndMs = this.points.at(-1).time;
    if (Math.abs((this.endMs - this.startMs) - (this.sourceEndMs - this.sourceStartMs)) > 1) {
      throw new Error('This renderer supports only 1:1 replay duration.');
    }
    this.availableSeconds = (this.endMs - this.startMs) / 1000;
    this.objectType = objectType;
    this.configure({ visibleSeconds: this.availableSeconds, color, trailSeconds, markerRadiusEarth, lineWidthEarth });
  }
  configure({ visibleSeconds = (this.endMs - this.startMs) / 1000, color = this.color,
    trailSeconds = this.trailSeconds, markerRadiusEarth = this.markerRadiusEarth, lineWidthEarth = this.lineWidthEarth }) {
    if (![visibleSeconds, trailSeconds, markerRadiusEarth, lineWidthEarth].every(Number.isFinite)
      || visibleSeconds <= 0 || visibleSeconds > this.availableSeconds || trailSeconds < 0
      || markerRadiusEarth <= 0 || lineWidthEarth <= 0 || !/^#[0-9a-f]{6}$/i.test(color)) {
      throw new Error('Invalid tracer display settings.');
    }
    // Clip the visible interval; never stretch or retime source geometry.
    this.startMs = this.endMs - visibleSeconds * 1000;
    Object.assign(this, { color, trailSeconds, markerRadiusEarth, lineWidthEarth });
  }
  positionAt(sourceMs) {
    let lo = 0, hi = this.points.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (this.points[mid].time <= sourceMs) lo = mid;
      else hi = mid - 1;
    }
    const a = this.points[lo], b = this.points[Math.min(lo + 1, this.points.length - 1)];
    const f = b.time === a.time ? 0 : (sourceMs - a.time) / (b.time - a.time);
    return a.xyz.map((v, j) => v + (b.xyz[j] - v) * f);
  }
  sample(nowMs) {
    if (!Number.isFinite(nowMs) || nowMs < this.startMs || nowMs > this.endMs) return null;
    // This mapping is anchored to the unchanged event endpoint, independent of clipping.
    const sourceMs = this.sourceEndMs - (this.endMs - nowMs);
    const head = this.positionAt(sourceMs);
    const visibleSourceStart = this.sourceEndMs - (this.endMs - this.startMs);
    const tailStart = Math.max(visibleSourceStart, sourceMs - this.trailSeconds * 1000);
    const tail = tailStart === sourceMs ? [head] : [this.positionAt(tailStart),
      ...this.points.filter((p) => p.time > tailStart && p.time < sourceMs).map((p) => p.xyz), head];
    return { sourceMs, head, tail };
  }
}
