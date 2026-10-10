import {inverseRotation, vectorToLatLon, latLonToVector, transform} from './GeoMath.js';
import {earthRotation} from './EarthOrientation.js';

// Camera-only randomness, stable across sessions; never written into event evidence.
export function longitudeOffset(eventId) {
  let hash = 2166136261;
  for (const char of `skip-camera-v1:${eventId}`) hash = Math.imul(hash ^ char.charCodeAt(0),16777619) >>> 0;
  return ((hash + 0.5) / 4294967296 * 2 - 1) * 45;
}

export function skipFocusDirection(sequence, landingMs, nowMs) {
  // Simultaneous events use anchor order, then ID, so the target is repeatable.
  const candidates = sequence.events.filter(s =>
    (s.pulse && landingMs >= s.pulse.visibleStartMs && landingMs < s.pulse.visibleEndMs)
    || (s.active && landingMs >= s.active.startMs && landingMs < s.active.endMs));
  candidates.sort((a,b) => a.endMs-b.endMs || a.event.eventId.localeCompare(b.event.eventId));
  for (const s of candidates) {
    const pulse = s.pulse && landingMs >= s.pulse.visibleStartMs && landingMs < s.pulse.visibleEndMs;
    const head = pulse ? null : s.active?.sample(landingMs)?.head;
    const normal = pulse ? s.pulse.normal : head ? inverseRotation(earthRotation(landingMs),head) : null;
    if (!normal) continue;
    const {lat,lon} = vectorToLatLon(normal);
    return transform(earthRotation(nowMs),latLonToVector(lat,lon+longitudeOffset(s.event.eventId)));
  }
  return null;
}
