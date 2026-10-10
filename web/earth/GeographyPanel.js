import { Geography } from './Geography.js';

// A geographic readout, deliberately separate from event attributes and the globe.
export async function mountGeographyPanel(scene) {
  const name = document.getElementById('geo-name'), detail = document.getElementById('geo-detail');
  const clear = document.getElementById('geo-clear'), picker = document.getElementById('geo-place');
  const events = new AbortController();
  let geography, error = false, lastLookupAt = -Infinity, lastPinned = null;
  const coordinate = ({ lat, lon }) => `${Math.abs(lat).toFixed(2)}° ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(2)}° ${lon < 0 ? 'W' : 'E'}`;
  const show = (point, pinned) => {
    clear.disabled = !pinned;
    if (!point) {
      name.textContent = 'Explore the Earth';
      detail.textContent = error ? 'Place names unavailable. Coordinates still work on hover or tap.' : 'Hover over land or water, or click / tap to pin a geographic point.';
      lastPinned = null; return;
    }
    // Hover follows a moving Earth, but the text need only refresh five times/sec.
    const now = performance.now(), key = pinned ? `${point.lat},${point.lon}` : null;
    if (key && key === lastPinned) return;
    if (!pinned && now - lastLookupAt < 200) return;
    lastPinned = key; lastLookupAt = now;
    const place = geography?.lookup(point.lat, point.lon);
    name.textContent = `${pinned ? 'Pinned · ' : ''}${place?.name ?? 'Geographic point'}`;
    detail.textContent = `${coordinate(point)}${place ? ` · ${place.region}` : ''}`
      + (place?.distanceKm != null ? ` · about ${Math.round(place.distanceKm)} km from the listed point` : '')
      + (error ? ' · Place names unavailable' : '');
  };
  scene.onInspect = show;
  clear.addEventListener('click', () => scene.clearInspection(), { signal: events.signal });
  document.getElementById('geo-go').addEventListener('click', () => {
    const [lat, lon] = picker.value.split(',').map(Number);
    scene.focusGeography(lat, lon);
  }, { signal: events.signal });
  show(null, false);
  try {
    const response = await fetch(new URL('../data/geography.json', import.meta.url));
    if (!response.ok) throw new Error(`Geography HTTP ${response.status}`);
    geography = new Geography(await response.json());
  } catch { error = true; }
  lastPinned = null; lastLookupAt = -Infinity; scene.refreshInspection();
  return () => { events.abort(); scene.onInspect = () => {}; };
}
