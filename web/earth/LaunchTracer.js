// An explicitly illustrative pad-to-reference-orbit path. No ascent physics or inferred observations.
import { earthRotation } from './EarthOrientation.js';
import { latLonToVector, transform, normalize, dot, cross, scale, clamp, inverseRotation } from './GeoMath.js';
import { DEFAULTS, STYLE } from '../PresentationConfig.js';

const ease = u => u*u*(3-2*u);
const mixDirections = (a,b,u) => {
  const angle = Math.acos(clamp(dot(a,b),-1,1));
  if (angle < 1e-7) return normalize(a.map((v,i) => v*(1-u)+b[i]*u));
  if (Math.PI-angle < 1e-6) {
    const tangent = normalize(cross(a, Math.abs(a[1]) < 0.9 ? [0,1,0] : [1,0,0]));
    return a.map((v,i) => v*Math.cos(Math.PI*u)+tangent[i]*Math.sin(Math.PI*u));
  }
  return a.map((v,i) => (v*Math.sin((1-u)*angle)+b[i]*Math.sin(u*angle))/Math.sin(angle));
};
export class LaunchTracer {
  constructor({ orbit, latitudeDeg, longitudeDeg, startTime, ascentSeconds, maxDisplaySeconds, color }) {
    this.orbit = orbit;
    this.anchorMs = Date.parse(startTime);
    this.ascentMs = ascentSeconds * 1000;
    this.availableSeconds = maxDisplaySeconds;
    this.pad = transform(earthRotation(this.anchorMs), latLonToVector(latitudeDeg,longitudeDeg));
    this.phaseMs = 0;
    // Choose a northbound latitude crossing when possible, then rotate only around
    // Earth's axis. This keeps the reference inclination and orbital dimensions intact.
    for (let i=1;i<orbit.points.length;i++) {
      const a=orbit.points[i-1], b=orbit.points[i];
      if (normalize(a.xyz)[1] >= this.pad[1] && normalize(b.xyz)[1] <= this.pad[1]) {
        let lo=a.time, hi=b.time;
        for (let n=0;n<40;n++) { const mid=(lo+hi)/2; if (normalize(orbit.positionAt(mid))[1] > this.pad[1]) lo=mid; else hi=mid; }
        this.phaseMs=(lo+hi)/2; break;
      }
    }
    const initial = orbit.positionAt(this.phaseMs);
    this.angle = Math.atan2(initial[2],initial[0])-Math.atan2(this.pad[2],this.pad[0]);
    this.configure({ visibleSeconds: maxDisplaySeconds, color });
  }
  configure({ visibleSeconds, ascentSeconds = this.ascentMs / 1000, color = this.color, trailSeconds = this.trailSeconds ?? DEFAULTS.trailSeconds,
    markerRadiusEarth = this.markerRadiusEarth ?? STYLE.markerRadiusEarth*DEFAULTS.markerScale,
    lineWidthEarth = this.lineWidthEarth ?? STYLE.lineWidthEarth*DEFAULTS.widthScale,
    opacity = this.opacity ?? DEFAULTS.tracerOpacity, widthTaper = this.widthTaper ?? DEFAULTS.widthTaper,
    opacityTaper = this.opacityTaper ?? DEFAULTS.opacityTaper }) {
    if (!Number.isFinite(ascentSeconds) || ascentSeconds <= 0) throw new Error('Invalid illustrative ascent duration.');
    // Reuse the reference tracer's bounds checking, without changing its geometry or phase.
    this.orbit.configure({ visibleSeconds: Math.min(visibleSeconds,this.orbit.availableSeconds), color,
      trailSeconds, markerRadiusEarth, lineWidthEarth, opacity, widthTaper, opacityTaper });
    if (!Number.isFinite(visibleSeconds) || visibleSeconds <= 0 || visibleSeconds > this.availableSeconds) throw new Error('Invalid launch window.');
    this.ascentMs=ascentSeconds*1000;
    this.startMs=this.anchorMs; this.endMs=this.anchorMs+visibleSeconds*1000;
    Object.assign(this,{color,trailSeconds,markerRadiusEarth,lineWidthEarth,opacity,widthTaper,opacityTaper});
  }
  positionAt(timeMs) {
    const elapsed=timeMs-this.anchorMs, u=clamp(elapsed/this.ascentMs,0,1);
    // Smooth angular acceleration, joining the reference orbital rate continuously.
    const travel=elapsed < this.ascentMs ? elapsed*elapsed/(2*this.ascentMs) : elapsed-this.ascentMs/2;
    const phase=((this.phaseMs+travel)%this.orbit.loopPeriodMs+this.orbit.loopPeriodMs)%this.orbit.loopPeriodMs;
    const raw=this.orbit.positionAt(phase), c=Math.cos(this.angle), s=Math.sin(this.angle);
    const point=[c*raw[0]+s*raw[2],raw[1],-s*raw[0]+c*raw[2]];
    const fraction=ease(u), normal=normalize(point);
    // General fallback for a pad outside the reference inclination's latitude range:
    // blend the direction on the sphere, never cut a straight chord through Earth.
    const direction=mixDirections(this.pad,normal,fraction);
    return scale(direction,1.004+(Math.hypot(...point)-1.004)*fraction);
  }
  sample(timeMs) {
    if (!Number.isFinite(timeMs) || timeMs < this.startMs || timeMs > this.endMs) return null;
    const history=Math.min(this.trailSeconds*1000,this.orbit.loopPeriodMs,timeMs-this.startMs);
    const steps=Math.min(512,Math.ceil(history/10000));
    // Draw launch history in Earth-fixed coordinates so a visible pad endpoint stays
    // attached to the rotating surface. The head is unchanged; this is a display trail.
    const rotation=earthRotation(timeMs);
    const tail=Array.from({length:steps+1},(_,i) => {
      const t=timeMs-history+(steps ? history*i/steps : 0);
      return transform(rotation,inverseRotation(earthRotation(t),this.positionAt(t)));
    });
    return { sourceMs:null, stage:timeMs-this.anchorMs < this.ascentMs ? 'illustrative-ascent' : 'reference-orbit',
      head:tail.at(-1),tail };
  }
}
