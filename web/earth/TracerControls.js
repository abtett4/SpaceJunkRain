// Legacy preference migration helpers; UI now lives in ConfigurationPanel.js.
// Presentation preferences only. Event identity, source geometry and clock stay separate.
export const SETTINGS_KEY = 'sjr-tracer-settings-v1';
export const SAMPLE_SETTINGS_KEY = 'sjr-sample-tracer-settings-v1';

export function normalizeSettings(value, availableSeconds, defaults = {}) {
  if (!Number.isFinite(availableSeconds) || availableSeconds <= 0) throw new Error('Invalid geometry duration.');
  const raw = value && typeof value === 'object' ? value : {};
  const number = (key, fallback, min, max) => Number.isFinite(raw[key])
    ? Math.max(min, Math.min(max, raw[key])) : fallback;
  return {
    reentryLeadSeconds: number('reentryLeadSeconds', Math.min(defaults.reentryLeadSeconds ?? 7200, availableSeconds), Math.min(30, availableSeconds), availableSeconds),
    trailSeconds: number('trailSeconds', Math.min(defaults.trailSeconds ?? 1200, 7200, availableSeconds), 0, Math.min(7200, availableSeconds)),
    widthScale: number('widthScale', 3, 0.5, 3),
    markerScale: number('markerScale', 3, 0.5, 3),
  };
}

export function readSettings(storage, availableSeconds, { key = SETTINGS_KEY, defaults = {} } = {}) {
  try {
    const saved = JSON.parse(storage?.getItem(key) ?? 'null');
    // Retain existing timing choices while adopting the new large appearance defaults.
    // Color is owned by event presentation data, never by browser preferences.
    const values = saved?.version === 1 ? {
      reentryLeadSeconds: saved.values?.reentryLeadSeconds,
      trailSeconds: saved.values?.trailSeconds,
    } : saved?.version === 2 ? saved.values : null;
    return normalizeSettings(values, availableSeconds, defaults);
  } catch { return normalizeSettings(null, availableSeconds, defaults); }
}

export function writeSettings(storage, values, reset = false, key = SETTINGS_KEY) {
  try {
    if (!storage) return false;
    if (reset) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ version: 2, values }));
    return true;
  } catch { return false; }
}

export function formatDuration(seconds) {
  if (seconds === 0) return 'Head only';
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
}
