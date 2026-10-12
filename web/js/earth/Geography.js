import { RAD, wrapLongitude } from './GeoMath.js';

export function distanceKm(a, b) {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i], [xx, yy] = ring[j];
    if ((y > lat) !== (yy > lat) && lon < (xx - x) * (lat - y) / (yy - y) + x) inside = !inside;
  }
  return inside;
}

// Natural Earth splits its polygons at the antimeridian. Preserve those parts
// (and holes); do not unwrap them into a polygon spanning the opposite hemisphere.
export function contains(polygon, lat, lon) {
  const [west, south, east, north] = polygon.bounds;
  return lon >= west && lon <= east && lat >= south && lat <= north
    && inRing(lon, lat, polygon.rings[0]) && !polygon.rings.slice(1).some(r => inRing(lon, lat, r));
}

export class Geography {
  constructor(data) { this.data = data; }
  lookup(lat, lon) {
    lon = wrapLongitude(lon);
    const point = { lat, lon };
    const land = this.data.land.find(p => contains(p, lat, lon));
    const waters = this.data.water.filter(p => contains(p, lat, lon));
    // Prefer named seas/gulfs over a containing ocean by bounding-box area.
    waters.sort((a, b) => (a.bounds[2]-a.bounds[0])*(a.bounds[3]-a.bounds[1]) - (b.bounds[2]-b.bounds[0])*(b.bounds[3]-b.bounds[1]));
    const region = land?.name ?? waters[0]?.name ?? 'Unmapped region';
    const nearest = places => places.map(place => ({ place, km: distanceKm(point, place) }))
      .filter(p => p.km <= p.place.radiusKm).sort((a, b) => a.km - b.km)[0];
    const near = nearest(this.data.sites) ?? nearest(this.data.cities);
    return { ...point, region, name: near ? `Near ${near.place.name}` : region,
      distanceKm: near?.km ?? null, reference: near?.place.reference ?? (near ? 'listed city point' : null) };
  }
}
