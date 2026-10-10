import { DEFAULTS, STYLE } from '../PresentationConfig.js';
// Preserve source geometry (TEME or illustrative); adapt to p5’s screen-down Y.
// The display reflection keeps north up and geographic east to the right.
export const toScene = ([x, y, z], radiusKm) => [x / radiusKm, -z / radiusKm, -y / radiusKm].map(v => v === 0 ? 0 : v);

export class Tracer {
  constructor({ positions, startTime, endTime, radiusKm, color = STYLE.color,
    objectType = 'UNKNOWN', trailSeconds = DEFAULTS.trailSeconds, markerRadiusEarth = STYLE.markerRadiusEarth * DEFAULTS.markerScale,
    lineWidthEarth = STYLE.lineWidthEarth * DEFAULTS.widthScale,
    loopPeriodSeconds = null, maxDisplaySeconds = null, anchorEdge = 'end' }) {
    this.startMs = Date.parse(startTime);
    this.endMs = Date.parse(endTime);
    if (!Number.isFinite(this.startMs) || !Number.isFinite(this.endMs) || this.endMs <= this.startMs
      || !Number.isFinite(radiusKm) || radiusKm <= 0 || !Array.isArray(positions) || positions.length < 2) {
      throw new Error('Invalid tracer interval or geometry.');
    }
    this.loopPeriodMs = loopPeriodSeconds === null ? null : loopPeriodSeconds * 1000;
    if (this.loopPeriodMs !== null && (!Number.isFinite(this.loopPeriodMs) || this.loopPeriodMs <= 0)) {
      throw new Error('Invalid representative loop period.');
    }
    this.points = positions.map((p) => {
      if (p.length !== 4 || !p.slice(1).every(Number.isFinite)) throw new Error('Invalid XYZ sample.');
      if (this.loopPeriodMs !== null && !Number.isFinite(p[0])) throw new Error('Loop offsets must be finite seconds.');
      return { time: this.loopPeriodMs === null ? Date.parse(p[0]) : p[0] * 1000, xyz: toScene(p.slice(1), radiusKm) };
    });
    if (this.points.some((p, i) => !Number.isFinite(p.time) || (i && p.time <= this.points[i - 1].time))) {
      throw new Error('Tracer sample times must increase.');
    }
    this.sourceStartMs = this.points[0].time;
    this.sourceEndMs = this.points.at(-1).time;
    if (this.loopPeriodMs !== null) {
      if (this.sourceStartMs !== 0 || Math.abs(this.sourceEndMs - this.loopPeriodMs) > 0.001
        || Math.hypot(...this.points[0].xyz.map((v, j) => v - this.points.at(-1).xyz[j])) > 1e-9) {
        throw new Error('Representative loops must close over one complete period.');
      }
    } else if (Math.abs((this.endMs - this.startMs) - (this.sourceEndMs - this.sourceStartMs)) > 1) {
      throw new Error('This renderer supports only 1:1 replay duration.');
    }
    const initialSeconds = (this.endMs - this.startMs) / 1000;
    this.availableSeconds = this.loopPeriodMs === null ? initialSeconds : maxDisplaySeconds ?? initialSeconds;
    if (!Number.isFinite(this.availableSeconds) || this.availableSeconds < initialSeconds) throw new Error('Invalid display limit.');
    if (!['start', 'end'].includes(anchorEdge) || (anchorEdge === 'start' && this.loopPeriodMs === null)) throw new Error('Unsupported tracer anchor.');
    this.anchorEdge = anchorEdge;
    this.anchorMs = anchorEdge === 'start' ? this.startMs : this.endMs;
    this.objectType = objectType;
    this.configure({ visibleSeconds: initialSeconds, color, trailSeconds, markerRadiusEarth, lineWidthEarth });
  }
  configure({ visibleSeconds = (this.endMs - this.startMs) / 1000, color = this.color,
    trailSeconds = this.trailSeconds, markerRadiusEarth = this.markerRadiusEarth, lineWidthEarth = this.lineWidthEarth,
    opacity = this.opacity ?? DEFAULTS.tracerOpacity, widthTaper = this.widthTaper ?? DEFAULTS.widthTaper, opacityTaper = this.opacityTaper ?? DEFAULTS.opacityTaper }) {
    if (![visibleSeconds, trailSeconds, markerRadiusEarth, lineWidthEarth, opacity, widthTaper, opacityTaper].every(Number.isFinite)
      || visibleSeconds <= 0 || visibleSeconds > this.availableSeconds || trailSeconds < 0
      || opacity < 0 || opacity > 1 || widthTaper < 0 || widthTaper > 4 || opacityTaper < 0 || opacityTaper > 4
      || markerRadiusEarth <= 0 || lineWidthEarth <= 0 || !/^#[0-9a-f]{6}$/i.test(color)) {
      throw new Error('Invalid tracer display settings.');
    }
    // Clip the visible interval; never stretch or retime source geometry.
    this.startMs = this.anchorEdge === 'start' ? this.anchorMs : this.anchorMs - visibleSeconds * 1000;
    this.endMs = this.anchorEdge === 'start' ? this.anchorMs + visibleSeconds * 1000 : this.anchorMs;
    Object.assign(this, { color, trailSeconds, markerRadiusEarth, lineWidthEarth, opacity, widthTaper, opacityTaper });
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
    if (this.loopPeriodMs !== null) {
      const period = this.loopPeriodMs;
      const phase = (t) => ((t % period) + period) % period;
      // Phase is anchored to the fixed event/source epoch, so changing window length cannot move the head.
      const elapsed = nowMs - this.anchorMs;
      const head = this.positionAt(phase(elapsed));
      const history = Math.min(this.trailSeconds * 1000, period, nowMs - this.startMs);
      const from = elapsed - history;
      const tail = history ? [this.positionAt(phase(from))] : [];
      // At most one revolution is visible; never bridge the seam with a straight chord.
      for (let cycle = Math.floor(from / period); cycle <= Math.floor(elapsed / period); cycle++) {
        for (const point of this.points.slice(0, -1)) {
          const t = cycle * period + point.time;
          if (t > from && t < elapsed) tail.push(point.xyz);
        }
      }
      return { sourceMs: null, phaseSeconds: phase(elapsed) / 1000, head, tail: [...tail, head] };
    }
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
