// Loads web/data/decays.json (built by tools/build_data.py) into typed arrays.
// Objects are sorted by decay date, so object i reentered on or after object i - 1.

import { EPOCH_MS, DAY_MS, dateToDay } from './util.js';

export async function loadData(url = 'data/decays.json') {
  const raw = await (await fetch(url, { cache: 'no-store' })).json();
  const { meta, families, names, cols, events } = raw;
  const N = cols.d.length;
  const D = Float64Array.from(cols.d);                                // decay day
  const todayDay = (Date.now() - EPOCH_MS) / DAY_MS;
  return {
    meta, families, names, cols, events, N, D, todayDay,
    L: Float64Array.from(cols.l, (v) => (v == null ? NaN : v)),      // launch day
    F: Int32Array.from(cols.f),                                      // family (launch) index
    K: Int8Array.from(cols.k),                                       // type: 0 debris, 1 rocket body, 2 payload, 3 unknown
    R: Int8Array.from(cols.r),                                       // radar size: 0 small, 1 medium, 2 large, -1 unknown
    X_MIN: dateToDay('1957-01-01'),
    X_MAX: Math.max(todayDay, N ? D[N - 1] : 0, ...events.map((e) => e.t)) + 60,
  };
}
