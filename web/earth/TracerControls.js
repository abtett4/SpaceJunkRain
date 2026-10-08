// Presentation preferences only. Event identity, source geometry and clock stay separate.
export const SETTINGS_KEY = 'sjr-tracer-settings-v1';
export const COLORS = ['#70e1bc', '#ffd166', '#ff8d8d', '#8bc4ff', '#c2a5ff'];

export function normalizeSettings(value, availableSeconds) {
  if (!Number.isFinite(availableSeconds) || availableSeconds <= 0) throw new Error('Invalid geometry duration.');
  const raw = value && typeof value === 'object' ? value : {};
  const number = (key, fallback, min, max) => Number.isFinite(raw[key])
    ? Math.max(min, Math.min(max, raw[key])) : fallback;
  return {
    reentryLeadSeconds: number('reentryLeadSeconds', availableSeconds, Math.min(30, availableSeconds), availableSeconds),
    trailSeconds: number('trailSeconds', Math.min(1200, availableSeconds), 0, availableSeconds),
    widthScale: number('widthScale', 1, 0.5, 3),
    markerScale: number('markerScale', 1, 0.5, 3),
    color: COLORS.includes(raw.color) ? raw.color : COLORS[0],
  };
}

export function readSettings(storage, availableSeconds) {
  try {
    const saved = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? 'null');
    return normalizeSettings(saved?.version === 1 ? saved.values : null, availableSeconds);
  } catch { return normalizeSettings(null, availableSeconds); }
}

export function writeSettings(storage, values, reset = false) {
  try {
    if (!storage) return false;
    if (reset) storage.removeItem(SETTINGS_KEY);
    else storage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, values }));
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
    color: document.getElementById('tracer-color'),
  };
  inputs.reentryLeadSeconds.min = Math.min(30, availableSeconds);
  inputs.reentryLeadSeconds.max = inputs.trailSeconds.max = availableSeconds;
  document.getElementById('tracer-window-limit').textContent =
    `Up to ${formatDuration(availableSeconds)} of prepared orbit is available. Shorter windows show its final portion; timing and orbital speed stay the same.`;
  const paint = () => {
    for (const [key, input] of Object.entries(inputs)) {
      input.value = settings[key];
      if (key === 'color') continue;
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
      settings = normalizeSettings({ ...settings, [key]: key === 'color' ? input.value : Number(input.value) }, availableSeconds);
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
