// Readable UTC dates for the page: the year stands apart, the day reads in words.
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
export const MONTH_ABBR = MONTHS.map(m => m.slice(0, 3));

const pad = n => String(n).padStart(2, '0');

// { year: '2018', day: 'April 2', time: '15:35 UTC' }
export function clockParts(ms) {
  const d = new Date(ms);
  return {
    year: String(d.getUTCFullYear()),
    day: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`,
  };
}

// 'April 2, 2018'
export function longDate(ms) {
  const { year, day } = clockParts(ms);
  return `${day}, ${year}`;
}

// 'Apr 2'
export function shortDay(ms) {
  const d = new Date(ms);
  return `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
