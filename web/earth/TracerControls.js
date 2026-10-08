// Presentation preferences only. Event identity, source geometry and clock stay separate.
export const SETTINGS_KEY = 'sjr-tracer-settings-v1';

export function normalizeSettings(value, availableSeconds) {
  if (!Number.isFinite(availableSeconds) || availableSeconds <= 0) throw new Error('Invalid geometry duration.');
  const raw = value && typeof value === 'object' ? value : {};
  const number = (key, fallback, min, max) => Number.isFinite(raw[key])
    ? Math.max(min, Math.min(max, raw[key])) : fallback;
  return {
    reentryLeadSeconds: number('reentryLeadSeconds', Math.min(7200, availableSeconds), Math.min(30, availableSeconds), availableSeconds),
    trailSeconds: number('trailSeconds', Math.min(1200, availableSeconds), 0, Math.min(7200, availableSeconds)),
    widthScale: number('widthScale', 3, 0.5, 3),
    markerScale: number('markerScale', 3, 0.5, 3),
  };
}

export function readSettings(storage, availableSeconds) {
  try {
    const saved = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? 'null');
    // Retain existing timing choices while adopting the new large appearance defaults.
    // Color is owned by event presentation data, never by browser preferences.
    const values = saved?.version === 1 ? {
      reentryLeadSeconds: saved.values?.reentryLeadSeconds,
      trailSeconds: saved.values?.trailSeconds,
    } : saved?.version === 2 ? saved.values : null;
    return normalizeSettings(values, availableSeconds);
  } catch { return normalizeSettings(null, availableSeconds); }
}

export function writeSettings(storage, values, reset = false) {
  try {
    if (!storage) return false;
    if (reset) storage.removeItem(SETTINGS_KEY);
    else storage.setItem(SETTINGS_KEY, JSON.stringify({ version: 2, values }));
    return true;
  } catch { return false; }
}

export function formatDuration(seconds) {
  if (seconds === 0) return 'Head only';
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
}

export function mountTracerControls(availableSeconds, onChange) {
  let storage;
  try { storage = window.localStorage; } catch { /* use session-only preferences */ }
  let settings = readSettings(storage, availableSeconds);
  const fields = document.getElementById('tracer-fields');
  const note = document.getElementById('tracer-preferences-note');
  const inputs = {
    reentryLeadSeconds: document.getElementById('tracer-window'),
    trailSeconds: document.getElementById('tracer-history'),
    widthScale: document.getElementById('tracer-width'),
    markerScale: document.getElementById('tracer-size'),
  };
  inputs.reentryLeadSeconds.min = Math.min(30, availableSeconds);
  inputs.reentryLeadSeconds.max = availableSeconds;
  inputs.trailSeconds.max = Math.min(7200, availableSeconds);
  const paint = () => {
    for (const [key, input] of Object.entries(inputs)) {
      input.value = settings[key];
      const value = key.endsWith('Seconds') ? formatDuration(settings[key]) : `${settings[key]}×`;
      document.getElementById(`${input.id}-value`).textContent = value;
      input.setAttribute('aria-valuetext', value);
    }
  };
  const apply = (reset = false) => {
    paint();
    onChange(settings);
    const saved = writeSettings(storage, settings, reset);
    note.textContent = saved ? (reset ? 'Defaults restored.' : 'Saved on this browser.')
      : 'Changes work for this visit; this browser is not saving preferences.';
  };
  const events = new AbortController();
  for (const [key, input] of Object.entries(inputs)) {
    input.addEventListener('input', () => {
      settings = normalizeSettings({ ...settings, [key]: Number(input.value) }, availableSeconds);
      apply();
    }, { signal: events.signal });
  }
  document.getElementById('tracer-reset').addEventListener('click', () => {
    settings = normalizeSettings(null, availableSeconds);
    apply(true);
  }, { signal: events.signal });
  fields.disabled = false;
  paint();
  onChange(settings);
  return { dispose: () => events.abort() };
}
