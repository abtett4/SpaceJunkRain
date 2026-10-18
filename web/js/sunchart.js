// Sunspots per month, on the same time axis as the reentries below it: the monthly sunspot
// number as faint bars, the 13-month smoothed number as a line, both revealed up to the
// playhead. Data: NOAA SWPC (web/data/solar.json, built by tools/build_solar.py); the
// numbers are WDC-SILSO's. Smoothed values SWPC hasn't published yet are estimates, drawn dashed.

import { C } from './theme.js';
import { FONT, fmtMonth, fmtInt, upperBound, yearOf } from './util.js';

export function mountSunChart(app, db, solar) {
  const c = document.getElementById('sun');
  if (!c) return;
  const cv = { c, ctx: c.getContext('2d'), w: 0, h: 0, dpr: 1 };
  const { t, ssn, smooth, est } = solar;
  const S = { l: 64, r: 16, t: 8, b: 22 };
  // the axis tops out at the largest monthly number, rounded up to a round 50
  const top = Math.ceil(Math.max(...ssn.filter((v) => v != null)) / 50) * 50;
  const end = (k) => t[k + 1] ?? t[k] + 30.4;

  // solar maxima: the highest smoothed month of each cycle (published values only)
  const peaks = [];
  for (let k = 1; k < t.length - 1; k++) {
    const v = smooth[k];
    if (v == null || est[k]) continue;
    let best = true;
    for (let j = Math.max(0, k - 48); j <= Math.min(t.length - 1, k + 48); j++) {
      if (j !== k && smooth[j] != null && !est[j] && smooth[j] > v) { best = false; break; }
    }
    if (best && v > 60) peaks.push(k);
  }

  let hover = null; // month index under the pointer

  function draw() {
    const ctx = cv.ctx, ph = app.state.playhead, H = app.H;
    if (!cv.w) return;
    S.l = H.l; S.r = H.r; // share the monthly chart's x scale
    ctx.clearRect(0, 0, cv.w, cv.h);
    const plotH = cv.h - S.t - S.b;
    const yv = (v) => cv.h - S.b - v / top * plotH;
    app.drawYTicks(cv, S, [[yv(top), fmtInt(top)], [yv(top / 2), fmtInt(top / 2)]]);
    app.drawXAxis(cv, S);
    app.clipPlot(ctx, cv, S);
    const shown = upperBound(t, ph + 1e-9); // months that have begun by the playhead

    ctx.fillStyle = C.sun; ctx.globalAlpha = 0.28;
    for (let k = 0; k < shown; k++) {
      if (ssn[k] == null) continue;
      const x0 = app.xOf(t[k], cv, S), x1 = app.xOf(end(k), cv, S);
      if (x1 < S.l || x0 > cv.w - S.r) continue;
      const y = yv(ssn[k]);
      ctx.fillRect(x0, y, Math.max(1, x1 - x0 - 0.5), cv.h - S.b - y);
    }
    ctx.globalAlpha = 1;

    // the smoothed line, solid where published and dashed where estimated
    ctx.strokeStyle = C.sun; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    const mid = (k) => app.xOf((t[k] + end(k)) / 2, cv, S);
    for (const dashed of [false, true]) {
      ctx.setLineDash(dashed ? [4, 3] : []);
      ctx.beginPath();
      let pen = false;
      for (let k = 0; k < shown; k++) {
        const v = smooth[k];
        // a dashed run starts at the last published month so the two pieces join
        const inRun = v != null && (dashed ? est[k] || est[k + 1] : !est[k]);
        if (!inRun) { pen = false; continue; }
        const x = mid(k), y = yv(v);
        pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        pen = true;
      }
      ctx.stroke();
    }
    ctx.setLineDash([]); ctx.lineWidth = 1;

    // labelled maxima: one wording for all of them, the longest that fits every visible one
    if (app.state.notes) {
      ctx.font = FONT(13, 400, 'italic'); ctx.fillStyle = C.text2; ctx.textBaseline = 'bottom';
      const vis = peaks.filter((k) => t[k] <= ph && mid(k) >= S.l && mid(k) <= cv.w - S.r);
      const words = [(y) => `Solar maximum ${y}`, (y) => `Maximum ${y}`, (y) => `${y}`];
      // each label is centred on its peak, nudged inside the plot at either edge
      const place = (k, f) => {
        const text = f(yearOf(t[k])), w = ctx.measureText(text).width;
        const x0 = Math.min(Math.max(mid(k) - w / 2, S.l + 2), cv.w - S.r - w - 2);
        return { k, text, x0, x1: x0 + w };
      };
      const fits = (ls) => ls.every((l, i) => i === 0 || l.x0 > ls[i - 1].x1 + 10);
      let labels = null;
      for (const f of words) { labels = vis.map((k) => place(k, f)); if (fits(labels)) break; }
      ctx.textAlign = 'left';
      let lastRight = -Infinity;
      for (const l of labels ?? []) {
        if (l.x0 < lastRight + 10) continue; // still too tight (very narrow): draw only what fits
        app.haloText(ctx, l.text, l.x0, Math.max(S.t + 14, yv(smooth[l.k]) - 4));
        lastRight = l.x1;
      }
    }

    if (ph < db.TIME_END) {
      const x = Math.round(app.xOf(ph, cv, S)) + 0.5;
      ctx.strokeStyle = C.text; ctx.beginPath(); ctx.moveTo(x, S.t); ctx.lineTo(x, cv.h - S.b); ctx.stroke();
    }
    if (hover != null) {
      const x = Math.round(app.xOf(t[hover], cv, S)) + 0.5;
      ctx.strokeStyle = C.text; ctx.beginPath(); ctx.moveTo(x, S.t); ctx.lineTo(x, cv.h - S.b); ctx.stroke();
    }
    ctx.restore();
  }

  app.wireTime(cv, () => S);
  c.addEventListener('pointermove', (ev) => {
    if (app.dragMove(ev)) return;
    const day = app.dayOf(ev.clientX - c.getBoundingClientRect().left, cv, S);
    const k = upperBound(t, day + 1e-9) - 1;
    if (k < 0 || k >= t.length) { hover = null; app.hideTip(); return; }
    hover = k;
    const n = (v) => (v == null ? 'not recorded' : fmtInt(Math.round(v)));
    const sm = smooth[k] == null ? '' : `<div class="row">smoothed ${n(smooth[k])}${est[k] ? ' (estimated)' : ''}</div>`;
    app.showTip(`<b>${fmtMonth(t[k])}</b><div class="row">${n(ssn[k])} sunspots (monthly)</div>${sm}`, ev.clientX, ev.clientY);
    if (!app.state.playing) draw();
  });
  c.addEventListener('pointerleave', () => { hover = null; if (!app.state.playing) draw(); });

  app.addStrip({ layout: () => app.size(cv), draw });
}
