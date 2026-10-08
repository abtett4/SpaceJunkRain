// Sheet 2, "Time in orbit": when each object came down (across) and how long it had been up.

import { YEAR, TYPE_PLURALS, TYPE_VARS, FONT, dateToDay, fmtDate, yearOf, fmtSpan, fmtInt, pretty } from '../util.js';
import { C } from '../theme.js';
import { objectTip } from '../tips.js';

const Y_MIN = 1, Y_MAX = YEAR * 70; // time in orbit, days
const Y_TICKS = {
  log: [[1, '1 day'], [7, '1 week'], [30.44, '1 month'], [YEAR, '1 year'], [10 * YEAR, '10 years'], [50 * YEAR, '50 years']],
  linear: [0, 10, 20, 30, 40, 50, 60].map((y) => [y * YEAR, y ? `${y} years` : '0']),
};

// fixed notes, placed by date and time in orbit
const LIFE_NOTES = [
  { x: '1961-06-01', y: 3, align: 'left', text: 'upper stages that fall within days of launch', logOnly: true },
  { x: '2019-09-01', y: 5.2 * YEAR, align: 'right', text: 'Starlink retirements, about 5 years after launch —' },
];
// notes that point at one launch's streak: its dots are inked dark so the curve can be found,
// and a leader runs from the note to a dot partway along it (q = position by reentry order)
const STREAKS = [
  { key: '1998-067', k: 2, q: 0.55, dx: -26, dy: -44, align: 'right', text: [
    'satellites released from the ISS (dark dots) are logged under its 1998 launch, so their time in orbit reads years too long',
    'released from the ISS (dark dots), but dated from its 1998 launch, so they look older than they are',
    'ISS-released satellites (dark dots): dated from 1998, so too old',
    'released from the ISS; dated 1998'],
    why: 'Released from the station years after 1998 but catalogued under its launch, so time in orbit reads too long.' },
  { key: '1965-082', k: 0, q: 0.3, dx: 26, dy: -46, align: 'left', text: [
    'Titan 3C Transtage debris (dark dots): one 1965 launch date, so every fragment falls on one curve',
    'Titan 3C debris (dark dots): one launch date, one curve',
    'Titan 3C debris: one curve'],
    why: 'Fragments of one upper stage share its 1965 launch date, so they fall along one curve.' },
];

export function createOrbitSheet(db) {
  const { N, D, L, F, K, R, families } = db;
  let yScale = 'log';
  const hiddenTypes = new Set();
  let appRef = null;

  const streaks = STREAKS.map((n) => {
    const fi = families.findIndex((f) => f.key === n.key), members = [];
    for (let i = 0; i < N; i++) if (F[i] === fi && K[i] === n.k) members.push(i);
    return { ...n, members };
  }).filter((n) => n.members.length);

  // the streaks' row in the data tables
  document.querySelector('#streaks-table tbody').innerHTML = streaks.map((n) => {
    const f = families.find((x) => x.key === n.key), m = n.members;
    const spans = m.map((i) => D[i] - L[i]).filter(isFinite);
    return `<tr><td>${f.key}${f.launch != null ? ', ' + fmtDate(f.launch) : ''}</td><td>${pretty(f.name)}</td>` +
      `<td>${TYPE_PLURALS[n.k].toLowerCase()}</td><td class="num">${fmtInt(m.length)}</td>` +
      `<td>${yearOf(D[m[0]])}–${yearOf(D[m[m.length - 1]])}</td>` +
      `<td class="num">${fmtSpan(Math.min(...spans))} to ${fmtSpan(Math.max(...spans))}</td><td>${n.why}</td></tr>`;
  }).join('');

  // ---- controls: one toggle per object type, and the Log / Linear switch ------------
  const bar = document.getElementById('typefilter');
  const typeCounts = [0, 0, 0, 0];
  for (let i = 0; i < N; i++) typeCounts[K[i]]++;
  bar.innerHTML = '<span class="k">Show</span>' + TYPE_PLURALS.map((label, k) => typeCounts[k]
    ? `<button type="button" data-k="${k}" aria-pressed="true"><span class="sw" style="background:var(${TYPE_VARS[k]})"></span>` +
      `${label}<span class="n">${fmtInt(typeCounts[k])}</span></button>` : '').join('') +
    '<span class="scale" role="group" aria-label="Time in orbit scale">' +
    '<span class="k">Scale</span><button type="button" data-scale="log" aria-pressed="true">Log</button>' +
    '<button type="button" data-scale="linear" aria-pressed="false">Linear</button></span>';
  bar.addEventListener('click', (e) => {
    const sc = e.target.closest('button[data-scale]');
    if (sc) {
      yScale = sc.dataset.scale;
      bar.querySelectorAll('button[data-scale]').forEach((b) => b.setAttribute('aria-pressed', String(b === sc)));
      const w = document.getElementById('scale-word'); if (w) w.textContent = `${yScale} scale`;
      appRef.relayout(); return;
    }
    const b = e.target.closest('button[data-k]'); if (!b) return;
    const k = +b.dataset.k, on = hiddenTypes.has(k);
    on ? hiddenTypes.delete(k) : hiddenTypes.add(k);
    b.setAttribute('aria-pressed', String(on));
    appRef.relayout();
  });

  // log spreads days-to-decades evenly; linear turns each breakup into a straight 45° line
  function yLife(app, span) {
    const M = app.M, h = app.main.h;
    const s = Math.min(Y_MAX, Math.max(yScale === 'log' ? Y_MIN : 0, span));
    const v = yScale === 'log' ? Math.log(s / Y_MIN) / Math.log(Y_MAX / Y_MIN) : s / Y_MAX;
    return h - M.b - v * (h - M.t - M.b);
  }

  const key = (v, text) => `<span class="key"><span class="sw" style="background:var(${v})"></span>${text}</span>`;

  return {
    id: 'orbit',
    title: 'How long each object stayed up',
    caption: () => `Each dot is one object: when it came down (across) and how long it had been in orbit (up, ` +
      `<span id="scale-word">${yScale} scale</span>). ` +
      `${key('--series-1', 'Debris')}, ${key('--series-2', 'rocket bodies')} and ${key('--series-3', 'payloads')}. ` +
      `Debris from one breakup shares a launch date, so each breakup traces its own rising curve.`,
    eventLines: 'always',
    rainDrop: 28,
    alpha: 0.8,

    attach(app) { appRef = app; },
    frame: () => ({ M: { l: 64, r: 16, t: 34, b: 26 }, height: null }),
    layout(app) {
      const { PY, hiddenPt } = app;
      for (let i = 0; i < N; i++) {
        if (hiddenTypes.has(K[i])) { hiddenPt[i] = 1; continue; }
        PY[i] = yLife(app, D[i] - L[i]);
      }
    },
    counts: (i) => !hiddenTypes.has(K[i]),   // the monthly chart and the "down" count follow the filter
    filtered: () => hiddenTypes.size > 0,    // hides the whole-catalogue peak note
    colorOf: (i, app) => (!app.inFamily(i) ? C.dim : C.types[K[i]]),
    radius: (i) => [1.6, 2.4, 3.2][R[i]] || 2,

    drawUnder(app) { app.drawYTicks(app.main, app.M, Y_TICKS[yScale].map(([v, l]) => [yLife(app, v), l])); },
    drawNotes(app) {
      if (app.state.playhead < db.X_MAX) return; // notes describe the finished picture
      const { main, PX, PY } = app, M = app.M, ctx = main.ctx;
      ctx.font = FONT(13.5, 400, 'italic'); ctx.fillStyle = C.text; ctx.textBaseline = 'middle';
      for (const n of LIFE_NOTES) {
        if (n.logOnly && yScale !== 'log') continue; // on a linear axis it would sit on the baseline
        const x = app.xOf(dateToDay(n.x), main, M), w = ctx.measureText(n.text).width;
        if (n.align === 'right' ? x - w < M.l : x + w > main.w - M.r) continue; // no room at this width
        ctx.textAlign = n.align;
        app.haloText(ctx, n.text, x, yLife(app, n.y));
      }
      for (const n of streaks) {
        if (hiddenTypes.has(n.k)) continue;
        ctx.fillStyle = C.text; ctx.globalAlpha = 0.85;
        for (const i of n.members) { ctx.beginPath(); ctx.arc(PX[i], PY[i], 1.9, 0, 6.2832); ctx.fill(); }
        ctx.globalAlpha = 1;
        const a = n.members[Math.floor(n.q * (n.members.length - 1))];
        const tx = PX[a] + n.dx, ty = PY[a] + n.dy;
        const room = n.align === 'right' ? tx - M.l - 4 : main.w - M.r - tx - 4;
        const text = n.text.find((t) => ctx.measureText(t).width < room);
        if (!text) continue;
        ctx.strokeStyle = C.text; ctx.lineWidth = 0.75;
        ctx.beginPath(); ctx.moveTo(PX[a], PY[a]); ctx.lineTo(tx, ty); ctx.stroke(); ctx.lineWidth = 1;
        ctx.textAlign = n.align;
        app.haloText(ctx, text, tx + (n.align === 'right' ? -4 : 4), ty);
      }
    },
    pointTip: (i) => objectTip(db, i),
  };
}
