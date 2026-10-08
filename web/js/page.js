// The words around the charts: headline, summary cards, credits and the shared data tables.

import { KIND_GLYPH, KIND_WORD, yearOf, fmtInt, evDate, pretty } from './util.js';

export function fillPage(db, peak) {
  const { meta, families, events, todayDay } = db;
  const $ = (id) => document.getElementById(id);

  $('h-down').textContent = fmtInt(meta.decayed);
  // say what "still in orbit" is made of, so the junk count isn't inflated by working satellites
  $('h-up').textContent = meta.onOrbit
    ? `Of the ${fmtInt(meta.onOrbit.total)} still in orbit, ${fmtInt(meta.onOrbit.DEBRIS)} are debris.` : '';

  const big = families.reduce((a, b) => (b.n > a.n ? b : a));
  $('t-big').textContent = pretty(big.name);
  $('t-big-foot').textContent = `${fmtInt(big.n)} pieces reentered, ${fmtInt(big.orbit)} still up`;
  const fy = families.find((f) => f.key === '1999-025');
  if (fy) {
    $('t-fy').textContent = `${Math.round(fy.orbit / (fy.orbit + fy.n) * 100)}%`;
    $('t-fy-foot').textContent = `${fmtInt(fy.orbit)} of ${fmtInt(fy.orbit + fy.n)} tracked pieces, ${yearOf(todayDay) - 2007} years after the 2007 test`;
  }
  $('t-peak').textContent = peak.text.split(':')[0];
  $('t-peak-foot').textContent = `${fmtInt(peak.n)} reentries, ${fmtInt(peak.topN)} from ${peak.source}`;

  const retrieved = meta.retrieved || meta.generated.slice(0, 10);
  $('credit').textContent =
    `Data: U.S. Space Command (USSPACECOM), via Space-Track.org: satellite catalog (SATCAT) and ` +
    `satellite decay and reentry data, retrieved ${retrieved}. ` +
    `${fmtInt(meta.decayed)} reentered objects from ${fmtInt(families.length)} launches.`;
  $('tb-date').textContent = retrieved;
  $('tb-span').textContent = `1957–${yearOf(todayDay)}`;

  document.querySelector('#events-table tbody').innerHTML = events.map((e) => {
    const fs = e.families.map((f) => families[f]);
    const sum = (k) => (fs.length ? fmtInt(fs.reduce((s, f) => s + f[k], 0)) : '–');
    const src = e.ref ? `<a href="${e.ref.url}" target="_blank" rel="noopener">${e.ref.text}</a>` : '';
    return `<tr><td>${evDate(e)}</td><td>${e.name}</td><td>${KIND_GLYPH[e.kind]} ${KIND_WORD[e.kind]}</td>` +
      `<td class="num">${sum('n')}</td><td class="num">${sum('orbit')}</td><td class="src">${src}</td></tr>`;
  }).join('');
  document.querySelector('#families-table tbody').innerHTML = families.slice(0, 25).map((f) =>
    `<tr><td>${f.key}</td><td>${pretty(f.name)}</td><td class="num">${fmtInt(f.n)}</td><td class="num">${fmtInt(f.orbit)}</td></tr>`).join('');
}
