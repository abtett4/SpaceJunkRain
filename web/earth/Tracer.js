// Coordinates stay TEME. This proper rotation only adapts them to p5's screen axes.
export const toScene = ([x, y, z], radiusKm) => [x / radiusKm, -z / radiusKm, y / radiusKm];

export class Tracer {
  constructor({ positions, startTime, endTime, radiusKm, color = '#70e1bc',
    objectType = 'UNKNOWN', trailSeconds = 1200, markerRadiusEarth = 0.012 }) {
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
    Object.assign(this, { color, objectType, trailSeconds, markerRadiusEarth });
  }
  sample(nowMs) {
    if (nowMs < this.startMs || nowMs > this.endMs) return null;
    const sourceMs = this.sourceStartMs + nowMs - this.startMs;
    let lo = 0, hi = this.points.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (this.points[mid].time <= sourceMs) lo = mid;
      else hi = mid - 1;
    }
    const a = this.points[lo], b = this.points[Math.min(lo + 1, this.points.length - 1)];
    const f = b.time === a.time ? 0 : (sourceMs - a.time) / (b.time - a.time);
    const head = a.xyz.map((v, j) => v + (b.xyz[j] - v) * f);
    const tail = this.points.slice(0, lo + 1).filter((p) => p.time >= sourceMs - this.trailSeconds * 1000).map((p) => p.xyz);
    return { sourceMs, head, tail: [...tail, head] };
  }
}
