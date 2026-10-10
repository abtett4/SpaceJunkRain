import { GeoVector, RotateVector, Rotation_EQJ_EQD, SiderealTime } from '../vendor/astronomy.js';
import { latLonToVector, normalize, transform, RAD } from './GeoMath.js';

// Vallado's GMST expression. UTC approximates UT1; polar motion is omitted.
// The spherical display is not a precision geodetic or reentry-location product.
export function gmst(timeMs) {
  const t = (timeMs / 86400000 + 2440587.5 - 2451545) / 36525;
  const seconds = 67310.54841 + (876600 * 3600 + 8640184.812866) * t
    + 0.093104 * t * t - 6.2e-6 * t * t * t;
  return ((seconds * Math.PI / 43200) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
}

export function earthRotation(timeMs) {
  const a = gmst(timeMs), c = Math.cos(a), s = Math.sin(a);
  return [c, 0, -s, 0, 1, 0, s, 0, c];
}

export function earthState(timeMs) {
  if (!Number.isFinite(timeMs)) throw new Error('Earth display time must be finite.');
  const date = new Date(timeMs), rotation = earthRotation(timeMs);
  const sun = RotateVector(Rotation_EQJ_EQD(date), GeoVector('Sun', date, true));
  // Apparent equatorial-of-date Sun + apparent sidereal time give a subsolar
  // geographic point. Map it through the SAME GMST rotation as the surface.
  const lat = Math.atan2(sun.z, Math.hypot(sun.x, sun.y)) / RAD;
  const lon = Math.atan2(sun.y, sun.x) / RAD - SiderealTime(date) * 15;
  return { rotation, sunDirection: normalize(transform(rotation, latLonToVector(lat, lon))) };
}
