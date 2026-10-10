// One presentation policy and observable preference store for every preview/layer.
// Physics, provenance and event times do not belong in this configuration.
import { readSettings, SETTINGS_KEY as LEGACY_SINGLE, SAMPLE_SETTINGS_KEY as LEGACY_SAMPLE } from './earth/TracerControls.js';
export const CONFIG_KEY = 'sjr-presentation-v1';
export const STYLE = Object.freeze({ color: '#ffd166', markerRadiusEarth: 0.012, lineWidthEarth: 0.008,
  background: '#081b2c', atmosphereRadius: 1.018, pulseExpansion: 7, pulseRingWidth: 0.22 });
// This is the future data-to-style boundary. Color intentionally has no user control.
export const eventAppearance = _event => ({ color: STYLE.color });
const field = (key, group, label, value, min, max, step, unit, help = '') =>
  Object.freeze({ key, group, label, value, min, max, step, unit, help });
export const CONFIG_FIELDS = Object.freeze([
  Object.freeze({ key: 'theme', group: 'Page & timeline', label: 'Page theme', value: 'system',
    choices: [['system', 'Follow system'], ['light', 'Paper'], ['dark', 'Blueprint']] }),
  Object.freeze({ key: 'timelineNotes', group: 'Page & timeline', label: 'Show timeline notes', value: true, kind: 'boolean' }),
  field('reentryLeadSeconds', 'Event windows', 'Before each reentry', 14400, 30, 172800, 30, 'seconds'),
  field('launchFollowSeconds', 'Event windows', 'After each launch', 14400, 30, 172800, 30, 'seconds'),
  field('trailSeconds', 'Event windows', 'Visible trail history', 300, 0, 7200, 30, 'seconds', 'Zero shows the head only. Reference trails show at most one revolution.'),
  field('pulseSeconds', 'Event windows', 'Surface pulse duration', 14400, 30, 14400, 30, 'seconds', 'Display time, shortened to fit the event window. Four simulated hours = two seconds at passage speed.'),
  field('widthScale', 'Tracers & pulses', 'Trail width', 3, 0.5, 3, 0.25, 'scale'),
  field('markerScale', 'Tracers & pulses', 'Marker & pulse size', 3, 0.5, 3, 0.25, 'scale'),
  field('tracerOpacity', 'Tracers & pulses', 'Tracer opacity', 1, 0, 1, 0.05, 'percent'),
  field('widthTaper', 'Tracers & pulses', 'Width taper', 1, 0, 4, 0.25, 'number', 'Zero gives uniform width; higher values narrow more of the trail.'),
  field('opacityTaper', 'Tracers & pulses', 'Fade toward tail', 2, 0, 4, 0.25, 'number', 'Zero gives uniform opacity; higher values fade more of the trail.'),
  field('pulseOpacity', 'Tracers & pulses', 'Pulse opacity', 1, 0, 1, 0.05, 'percent'),
  field('earthBrightness', 'Earth', 'Surface brightness', 1, 0.25, 2, 0.05, 'scale'),
  field('nightLights', 'Earth', 'City lights', 1, 0, 2, 0.05, 'scale'),
  field('atmosphereOpacity', 'Earth', 'Decorative atmosphere', 1, 0, 1, 0.05, 'percent', 'Appearance only. Solar-weather data will have its own layer.'),
]);
export function normalizePresentation(raw, fields = CONFIG_FIELDS) {
  return Object.freeze(Object.fromEntries(fields.map(f => [f.key,
    f.choices ? (f.choices.some(([v]) => v === raw?.[f.key]) ? raw[f.key] : f.value)
      : f.kind === 'boolean' ? (typeof raw?.[f.key] === 'boolean' ? raw[f.key] : f.value)
      : Number.isFinite(raw?.[f.key]) ? Math.max(f.min, Math.min(f.max, raw[f.key])) : f.value])));
}
export const DEFAULTS = normalizePresentation(null);
export function createPresentationStore(storage, fields = CONFIG_FIELDS) {
  let values, saved = false;
  try {
    const current = storage?.getItem(CONFIG_KEY);
    if (current !== null && current !== undefined) {
      const doc = JSON.parse(current);
      values = normalizePresentation(doc?.version === 1 ? doc.values : null, fields);
    } else {
      // The passage was the main preview. Adopt its legacy settings when present.
      const key = storage?.getItem(LEGACY_SAMPLE) ? LEGACY_SAMPLE : LEGACY_SINGLE;
      values = normalizePresentation({ ...(storage?.getItem(key)
        ? readSettings(storage, 172800, { key, defaults: DEFAULTS }) : {}), theme: storage?.getItem('sjr-theme') }, fields);
    }
  } catch { values = normalizePresentation(null, fields); }
  const subscribers = new Set();
  const persist = () => {
    try {
      if (!storage) return false;
      storage.setItem(CONFIG_KEY, JSON.stringify({ version: 1, values })); return true;
    } catch { return false; }
  };
  saved = persist(); // One-time migration; reset cannot resurrect old preferences.
  return {
    fields,
    get values() { return values; },
    get saved() { return saved; },
    subscribe(fn) { subscribers.add(fn); fn(values); return () => subscribers.delete(fn); },
    update(patch) { values = normalizePresentation({ ...values, ...patch }, fields); saved = persist(); subscribers.forEach(fn => fn(values)); },
    reset() { values = normalizePresentation(null, fields); saved = persist(); subscribers.forEach(fn => fn(values)); },
  };
}
