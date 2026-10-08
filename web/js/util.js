// Shared constants and small helpers. No DOM, no state: safe to import anywhere.

export const EPOCH_MS = Date.UTC(1957, 0, 1); // day 0 of the data
export const DAY_MS = 86400000;
export const YEAR = 365.25;

export const TYPE_LABELS = ['Debris', 'Rocket body', 'Payload', 'Unknown'];
export const TYPE_PLURALS = ['Debris', 'Rocket bodies', 'Payloads', 'Unknown'];
export const TYPE_VARS = ['--series-1', '--series-2', '--series-3', '--series-unknown'];
export const GROUP_VARS = ['--series-1', '--series-2', '--series-3'];
export const KIND_GLYPH = { bump: '◇', crash: '✕', explosion: '✷', fragmentation: '⁂' };
export const KIND_WORD = { bump: 'glancing contact', crash: 'impact', explosion: 'collision', fragmentation: 'fragmentation' };

export const SERIF = '"EB Garamond", Garamond, "Iowan Old Style", Georgia, serif';
export const FONT = (px, w = 400, style = 'normal') => `${style} ${w} ${px}px ${SERIF}`;

// ---- dates (all in fractional days since 1957-01-01 UTC) --------------------
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dateToDay = (s) => (Date.parse(s.length <= 10 ? s + 'T00:00:00Z' : s) - EPOCH_MS) / DAY_MS;
export const dayToDate = (day) => new Date(EPOCH_MS + day * DAY_MS);
export const fmtDate = (day) => dayToDate(day).toISOString().slice(0, 10);
export const yearOf = (day) => dayToDate(day).getUTCFullYear();
export const fmtMonth = (day) => { const d = dayToDate(day); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
export const fmtDay = (day) => { const d = dayToDate(day); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
export const evDate = (e) => e.date.replace('T', ' ').replace(':00Z', ' UTC');

// "5.2 months", "19.0 years": for tooltips and tables
export function fmtSpan(days) {
  if (!isFinite(days)) return 'unknown';
  if (days < 2) return 'under 2 days';
  if (days < 60) return `${days.toFixed(0)} days`;
  if (days < 2 * YEAR) return `${(days / 30.44).toFixed(1)} months`;
  return `${(days / YEAR).toFixed(1)} years`;
}
// "4 weeks", "14 months", "7 years": rounder, for notes on the chart
export function fmtDur(days) {
  if (days < 70) return `${Math.max(1, Math.round(days / 7))} weeks`;
  if (days < 2 * YEAR) return `${Math.round(days / 30.44)} months`;
  const y = days / YEAR;
  return `${y < 10 ? y.toFixed(1).replace(/\.0$/, '') : Math.round(y)} years`;
}
export const fmtInt = (n) => n.toLocaleString('en-US');

// ---- names -------------------------------------------------------------------
// SATCAT names are all caps; set them in mixed case, keeping real acronyms and designators.
const ACRONYMS = new Set(['ISS', 'USA', 'PSLV', 'GSLV', 'SL', 'CZ', 'NOAA', 'DMSP', 'GPS', 'OPS', 'ESSA',
  'ATS', 'OAO', 'OGO', 'TDRS', 'GOES', 'HST', 'UK', 'II', 'III', 'IV', 'VI', 'H', 'NRO', 'KH', 'NOSS', 'SJ', 'HJ',
  'YG', 'KZ', 'BD', 'TJS', 'CBERS', 'SPOT', 'ERS', 'DEB', 'R/B']);
const titleWord = (w) => w.split('-').map((p) =>
  ACRONYMS.has(p) || /\d/.test(p) || p.length === 1 ? p : p[0] + p.slice(1).toLowerCase()).join('-');
export const pretty = (s) => s.replace(/[A-Z0-9/-]+/g, titleWord)
  .replace(/\bDEB\b/, 'debris').replace(/\bR\/B\b/, 'rocket body');

// ---- numbers -----------------------------------------------------------------
export function upperBound(arr, v) { // first index with arr[i] >= v
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; }
  return lo;
}
// a stable pseudo-random 0..1 per catalog number, so a dot never moves between visits
export const hash01 = (n) => (Math.imul(n, 2654435761) >>> 0) / 4294967296;
