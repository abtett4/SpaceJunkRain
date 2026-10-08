// The shared chart core: canvases, the zoomable time axis, the monthly reentries chart,
// collision markers, playback, tooltips and scrubbing. Everything specific to one sheet
// lives in js/sheets/*.js and plugs in through the sheet interface (see CONTRIBUTING.md).

import {
  YEAR, EPOCH_MS, DAY_MS, KIND_GLYPH, KIND_WORD, FONT, dateToDay, fmtDate, yearOf, fmtMonth, fmtInt,
  evDate, pretty, upperBound,
} from './util.js';
import { C, readColors } from './theme.js';

const CELL = 12;        // hover-search grid, px
const MIN_SPAN = 1.5 * YEAR;

export function createApp(db) {
  const { N, D, F, events, families, X_MIN, X_MAX } = db;
  const $ = (id) => document.getElementById(id);

  const state = {
    view: null, playhead: X_MAX, playing: false, secPerYear: 3.1470588,
    family: -1,   // highlighted launch, or -1
    hover: null,  // { point } | { event } | { bin } | anything a sheet returns from hoverAt
    notes: true,
  };
  const zoom = { lo: X_MIN, hi: X_MAX }; // visible stretch of the time axis
  const sheets = new Map();
  const sheet = () => sheets.get(state.view);

  // ---- canvases and geometry ----------------------------------------------
  const wrap = $('main-wrap');
  const setupCanvas = (id) => { const c = $(id); return { c, ctx: c.getContext('2d'), w: 0, h: 0, dpr: 1 }; };
  const main = setupCanvas('main'), hist = setupCanvas('hist');
  const base = document.createElement('canvas'), bctx = base.getContext('2d'); // revealed dots, painted once
  let M = { l: 64, r: 16, t: 34, b: 26 };
  const H = { l: 64, r: 16, t: 8, b: 22 };
  const PX = new Float32Array(N), PY = new Float32Array(N);
  const hiddenPt = new Uint8Array(N); // set by the sheet: 1 = not drawn on this sheet
  let spatial = new Map(), revealed = N, drawnTo = 0;

  function size(cv) {
    const r = cv.c.getBoundingClientRect();
    cv.dpr = window.devicePixelRatio || 1;
    cv.w = r.width; cv.h = r.height;
    cv.c.width = Math.round(r.width * cv.dpr); cv.c.height = Math.round(r.height * cv.dpr);
    cv.ctx.setTransform(cv.dpr, 0, 0, cv.dpr, 0, 0);
  }
  const xOf = (day, cv, m) => m.l + (day - zoom.lo) / (zoom.hi - zoom.lo) * (cv.w - m.l - m.r);
  const dayOf = (x, cv, m) => zoom.lo + (x - m.l) / (cv.w - m.l - m.r) * (zoom.hi - zoom.lo);
  // drawing is clipped to the plot so zoomed-out-of-view marks don't spill into the label gutters
  function clipPlot(ctx, cv, m) { ctx.save(); ctx.beginPath(); ctx.rect(m.l - 1, 0, cv.w - m.l - m.r + 2, cv.h); ctx.clip(); }
  const narrow = () => wrap.clientWidth < 700;
  const inFamily = (i) => state.family < 0 || F[i] === state.family;

  // text knocked out of the dots behind it with a ring of sheet colour
  function haloText(ctx, text, x, y) {
    ctx.save(); ctx.strokeStyle = C.surface; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y); ctx.restore(); ctx.fillText(text, x, y);
  }
  function clipText(ctx, text, max) {
    if (ctx.measureText(text).width <= max) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > max) text = text.slice(0, -1);
    return text + '…';
  }

  // graph paper: faint yearly rules, firmer rules on labelled years, drafting ticks on the axis.
  // top = also label along the top edge, for rows far from the bottom axis
  function drawXAxis(cv, m, top = false) {
    const ctx = cv.ctx, foot = cv.h - m.b + 0.5, head = m.t - 0.5;
    ctx.font = FONT(13); ctx.lineWidth = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = C.muted;
    // label every 10, 5, 2 or 1 years depending on how far in the axis is zoomed
    const span = (zoom.hi - zoom.lo) / YEAR, step = span > 35 ? 10 : span > 14 ? 5 : span > 6 ? 2 : 1;
    for (let y = yearOf(zoom.lo); y <= yearOf(zoom.hi) + 1; y++) {
      const x = Math.round(xOf(dateToDay(`${y}-01-01`), cv, m)) + 0.5;
      if (x < m.l || x > cv.w - m.r) continue;
      const major = y % step === 0, tick = major ? 6 : y % 5 === 0 ? 4 : 2;
      ctx.strokeStyle = major ? C.gridMajor : C.grid;
      ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, cv.h - m.b); ctx.stroke();
      ctx.strokeStyle = C.axis;
      ctx.beginPath(); ctx.moveTo(x, foot); ctx.lineTo(x, foot + tick); ctx.stroke();
      if (major) ctx.fillText(String(y), x, foot + 7);
      if (top) {
        ctx.beginPath(); ctx.moveTo(x, head); ctx.lineTo(x, head - tick); ctx.stroke();
        if (major) { ctx.textBaseline = 'bottom'; ctx.fillText(String(y), x, head - 7); ctx.textBaseline = 'top'; }
      }
    }
    ctx.strokeStyle = C.axis;
    ctx.beginPath(); ctx.moveTo(m.l, foot); ctx.lineTo(cv.w - m.r, foot); ctx.stroke();
    if (top) { ctx.beginPath(); ctx.moveTo(m.l, head); ctx.lineTo(cv.w - m.r, head); ctx.stroke(); }
  }
  function drawYTicks(cv, m, ticks) {
    const ctx = cv.ctx;
    ctx.font = FONT(13, 400, 'italic'); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.muted;
    for (const [y, label] of ticks) {
      const py = Math.round(y) + 0.5;
      ctx.strokeStyle = C.gridMajor;
      ctx.beginPath(); ctx.moveTo(m.l, py); ctx.lineTo(cv.w - m.r, py); ctx.stroke();
      ctx.fillText(label, m.l - 8, py);
    }
  }

  // ---- layout: margins and dot positions for the current sheet -------------
  function layout() {
    const s = sheet();
    const frame = s.frame(app);           // { M, height } ; height null = the CSS default
    M = frame.M;
    wrap.style.height = frame.height == null ? '' : `${frame.height}px`;
    size(main); size(hist);
    base.width = main.c.width; base.height = main.c.height;
    bctx.setTransform(main.dpr, 0, 0, main.dpr, 0, 0);
    for (let i = 0; i < N; i++) PX[i] = xOf(D[i], main, M);
    hiddenPt.fill(0);
    s.layout(app);                        // sets PY[i], and hiddenPt[i] = 1 for dots it doesn't draw
    spatial = new Map();
    for (let i = 0; i < N; i++) {
      if (hiddenPt[i] || PX[i] < M.l - 2 || PX[i] > main.w - M.r + 2) continue; // off the zoomed axis: no hover
      const key = ((PX[i] / CELL) | 0) + ',' + ((PY[i] / CELL) | 0);
      (spatial.get(key) || spatial.set(key, []).get(key)).push(i);
    }
    buildHistogram();
  }

  function paintPoints(from, to) {
    const s = sheet();
    clipPlot(bctx, main, M);
    bctx.globalAlpha = s.alpha ?? 0.8;
    for (let i = from; i < to; i++) {
      if (hiddenPt[i]) continue;
      bctx.fillStyle = s.colorOf(i, app);
      bctx.beginPath(); bctx.arc(PX[i], PY[i], s.radius(i, app), 0, 6.2832); bctx.fill();
    }
    bctx.globalAlpha = 1;
    bctx.restore();
  }
  function rebuild() { readColors(); bctx.clearRect(0, 0, main.w, main.h); drawnTo = 0; buildHistogram(); draw(); }
  const relayout = () => { layout(); rebuild(); };

  // ---- monthly reentries ---------------------------------------------------
  let bins = [], binMax = 1;
  const BIN_STARTS = [];
  for (let y = 1957, done = false; !done; y++) {
    for (let m = 0; m < 12; m++) {
      const d = (Date.UTC(y, m, 1) - EPOCH_MS) / DAY_MS;
      if (d > X_MAX) { done = true; break; }
      BIN_STARTS.push(d);
    }
  }
  // a sheet's `counts(i)` decides what the totals include (e.g. its type filter)
  const counted = (i) => inFamily(i) && (sheet()?.counts?.(i) ?? true);
  function buildHistogram() {
    bins = new Array(BIN_STARTS.length).fill(0);
    let b = 0;
    for (let i = 0; i < N; i++) {
      if (!counted(i)) continue;
      while (b + 1 < BIN_STARTS.length && BIN_STARTS[b + 1] <= D[i]) b++;
      bins[b]++;
    }
    binMax = Math.max(1, ...bins);
  }
  // the busiest month of the whole catalogue, and which source dominated it
  const PEAK = (() => {
    const all = new Array(BIN_STARTS.length).fill(0);
    for (let i = 0, b = 0; i < N; i++) {
      while (b + 1 < BIN_STARTS.length && BIN_STARTS[b + 1] <= D[i]) b++;
      all[b]++;
    }
    const n = Math.max(...all), b = all.indexOf(n);
    const lo = BIN_STARTS[b], hi = BIN_STARTS[b + 1] ?? X_MAX, byFam = new Map();
    for (let i = upperBound(D, lo); i < N && D[i] < hi; i++) byFam.set(F[i], (byFam.get(F[i]) || 0) + 1);
    const [topFam, topN] = [...byFam].sort((a, c) => c[1] - a[1])[0];
    const src = pretty(families[topFam].name);
    return {
      bin: b, day: lo, n, topN, source: src,
      text: `${fmtMonth(lo)}: ${fmtInt(n)} reentries, ${fmtInt(topN)} of them ${src} debris`,
      short: `${fmtMonth(lo)}: ${fmtInt(topN)} of ${fmtInt(n)} from ${src}`,
    };
  })();

  function drawHist() {
    const ctx = hist.ctx, s = sheet();
    ctx.clearRect(0, 0, hist.w, hist.h);
    const plotH = hist.h - H.t - H.b;
    const yv = (v) => hist.h - H.b - v / binMax * plotH;
    H.l = M.l; H.r = M.r; // share the main chart's x scale
    drawYTicks(hist, H, [[yv(binMax), fmtInt(binMax)], [yv(binMax / 2), fmtInt(Math.round(binMax / 2))]]);
    drawXAxis(hist, H);
    clipPlot(ctx, hist, H);
    ctx.fillStyle = state.family >= 0 ? (app.familyColor?.(state.family) ?? C.hist) : C.hist;
    for (let b = 0; b < bins.length; b++) {
      if (!bins[b] || BIN_STARTS[b] > state.playhead) continue;
      const x0 = xOf(BIN_STARTS[b], hist, H), x1 = xOf(BIN_STARTS[b + 1] ?? X_MAX, hist, H);
      const y = yv(bins[b]);
      ctx.fillRect(x0, y, Math.max(1, x1 - x0 - 0.5), hist.h - H.b - y);
    }
    // the peak note describes the whole catalogue, so it only shows when nothing is filtered out
    if (state.notes && state.family < 0 && (s.filtered?.() !== true) && PEAK.day <= state.playhead) {
      ctx.font = FONT(13.5, 400, 'italic'); ctx.fillStyle = C.text2;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const x = xOf(PEAK.day, hist, H) - 8;
      const text = x > hist.w - H.r ? null : [PEAK.text, PEAK.short].find((t) => x - ctx.measureText(t).width > H.l + 6);
      if (text) haloText(ctx, text, x, yv(bins[PEAK.bin]) + 6);
    }
    const h = state.hover;
    if (h && h.bin != null) {
      const x = Math.round(xOf(BIN_STARTS[h.bin], hist, H)) + 0.5;
      ctx.strokeStyle = C.text; ctx.beginPath(); ctx.moveTo(x, H.t); ctx.lineTo(x, hist.h - H.b); ctx.stroke();
    }
    ctx.restore();
  }

  // ---- main chart --------------------------------------------------------------
  const eventFlash = new Map(); // event index -> time the playhead crossed it

  function drawEvents(now) {
    const ctx = main.ctx, s = sheet();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    events.forEach((e, idx) => {
      const x = Math.round(xOf(e.t, main, M)) + 0.5;
      const passed = e.t <= state.playhead;
      const since = eventFlash.has(idx) ? (now - eventFlash.get(idx)) / 1000 : 9;
      const glow = Math.max(0, 1 - since / 1.2);
      const hov = state.hover && state.hover.event === idx;
      const full = s.eventLines === 'always' || glow > 0 || hov;
      ctx.globalAlpha = passed ? 0.6 + 0.4 * Math.max(glow, hov ? 1 : 0) : 0.25;
      ctx.strokeStyle = C.text2; ctx.lineWidth = 1 + 2 * glow;
      ctx.setLineDash([3, 3]);
      // with a top axis the year labels sit between the symbol and the plot, so the line starts
      // below them; otherwise it hangs from just under the symbol
      const y0 = s.topAxis ? M.t : M.t - 6;
      if (full) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, main.h - M.b); ctx.stroke(); }
      else if (!s.topAxis) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, M.t); ctx.stroke(); }
      ctx.setLineDash([]);
      ctx.font = FONT(12); ctx.fillStyle = C.text;
      ctx.fillText(KIND_GLYPH[e.kind], x, 14);
      s.drawEventMark?.(app, e, x);
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
    });
  }

  // dots that landed in the last ~0.4 s of real time fall in as short streaks
  function drawRain() {
    const s = sheet(), flashDays = 0.4 / state.secPerYear * YEAR;
    const from = upperBound(D, state.playhead - flashDays);
    const ctx = main.ctx, drop = s.rainDrop ?? 28;
    for (let i = from; i < revealed; i++) {
      if (hiddenPt[i]) continue;
      const age = Math.min(1, (state.playhead - D[i]) / flashDays);
      const fall = (1 - age) * drop;
      ctx.strokeStyle = s.colorOf(i, app); ctx.globalAlpha = 1 - age * 0.7; ctx.lineWidth = s.radius(i, app) + 0.4;
      ctx.beginPath(); ctx.moveTo(PX[i], PY[i] - fall - 8); ctx.lineTo(PX[i], PY[i] - fall); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
  }

  function draw(now = performance.now()) {
    revealed = upperBound(D, state.playhead);
    if (!base.width || !base.height) return; // not laid out yet (hidden tab)
    const s = sheet();
    if (revealed < drawnTo) { bctx.clearRect(0, 0, main.w, main.h); drawnTo = 0; }
    if (revealed > drawnTo) { paintPoints(drawnTo, revealed); drawnTo = revealed; }

    const ctx = main.ctx;
    ctx.clearRect(0, 0, main.w, main.h);
    drawXAxis(main, M, !!s.topAxis);
    s.drawUnder?.(app);                    // row labels, y ticks: anything behind the dots
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(base, 0, 0); ctx.restore();
    clipPlot(ctx, main, M);
    if (state.playhead < X_MAX) drawRain();
    if (state.notes) s.drawNotes?.(app);   // notes on the plotting field
    drawEvents(now);
    if (state.playhead < X_MAX) {
      const x = Math.round(xOf(state.playhead, main, M)) + 0.5;
      ctx.strokeStyle = C.text;
      ctx.beginPath(); ctx.moveTo(x, M.t - 6); ctx.lineTo(x, main.h - M.b); ctx.stroke();
    }
    const h = state.hover;
    if (h && h.point != null) {
      ctx.strokeStyle = C.text; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(PX[h.point], PY[h.point], s.radius(h.point, app) + 3, 0, 6.2832); ctx.stroke();
      ctx.lineWidth = 1;
    }
    ctx.restore();
    drawHist();

    let shown = 0;
    for (let i = 0; i < revealed; i++) if (counted(i)) shown++;
    $('date').textContent = state.playhead >= X_MAX ? 'Today' : fmtDate(state.playhead);
    $('now-count').textContent = `${fmtInt(shown)} down`;
  }

  // ---- zoom ------------------------------------------------------------------
  const zoomBar = document.querySelector('.zoom'), zoomRange = $('zoom-range');
  function setZoom(lo, hi) {
    const full = X_MAX - X_MIN, span = Math.min(full, Math.max(MIN_SPAN, hi - lo));
    lo = Math.min(Math.max(X_MIN, lo), X_MAX - span);
    zoom.lo = lo; zoom.hi = lo + span;
    const whole = span >= full - 1;
    zoomRange.textContent = whole ? '' : span < 5 * YEAR
      ? `${fmtMonth(zoom.lo)} – ${fmtMonth(zoom.hi)}` : `${yearOf(zoom.lo)}–${yearOf(zoom.hi)}`;
    const btn = (z) => zoomBar.querySelector(`[data-z="${z}"]`);
    btn('out').disabled = whole; btn('full').disabled = whole;
    btn('in').disabled = span <= MIN_SPAN + 1;
    btn('left').disabled = zoom.lo <= X_MIN + 1;
    btn('right').disabled = zoom.hi >= X_MAX - 1;
    if (state.view) relayout();
  }
  // zoom by factor f, keeping the day `at` fixed on screen
  const zoomBy = (f, at) => setZoom(at - (at - zoom.lo) * f, at + (zoom.hi - at) * f);
  zoomBar.addEventListener('click', (e) => {
    const z = e.target.closest('button')?.dataset.z; if (!z) return;
    const span = zoom.hi - zoom.lo;
    // the playhead is the natural centre when it's on screen; otherwise the middle of the view
    const c = state.playhead < X_MAX && state.playhead > zoom.lo && state.playhead < zoom.hi
      ? state.playhead : (zoom.lo + zoom.hi) / 2;
    if (z === 'in') zoomBy(0.5, c);
    else if (z === 'out') zoomBy(2, c);
    else if (z === 'left') setZoom(zoom.lo - span / 3, zoom.hi - span / 3);
    else if (z === 'right') setZoom(zoom.lo + span / 3, zoom.hi + span / 3);
    else setZoom(X_MIN, X_MAX);
  });
  // pinch or ctrl + wheel zooms at the cursor; sideways swipe or shift + wheel pans;
  // a plain vertical wheel is left alone so the page still scrolls
  for (const [cv, getM] of [[main, () => M], [hist, () => H]]) {
    cv.c.addEventListener('wheel', (e) => {
      const m = getM(), x = e.clientX - cv.c.getBoundingClientRect().left;
      const span = zoom.hi - zoom.lo, plotW = cv.w - m.l - m.r;
      if (e.ctrlKey) {
        e.preventDefault();
        zoomBy(Math.exp(e.deltaY * 0.01), Math.min(zoom.hi, Math.max(zoom.lo, dayOf(x, cv, m))));
      } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        const d = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) / plotW * span;
        setZoom(zoom.lo + d, zoom.hi + d);
      }
    }, { passive: false });
  }

  // ---- playback ----------------------------------------------------------------
  const playBtn = $('play'), pulse = $('pulse');
  let lastT = 0, lastYear = -1;
  function setPlaying(p) {
    state.playing = p;
    playBtn.textContent = p ? '❚❚ Pause' : '▶ Animate';
    playBtn.setAttribute('aria-label', p ? 'Pause' : 'Animate');
    if (p) {
      if (state.playhead >= X_MAX) { state.playhead = X_MIN; eventFlash.clear(); }
      lastT = performance.now();
      requestAnimationFrame(tick);
    }
  }
  function tick(now) {
    if (!state.playing) return;
    const prev = state.playhead;
    state.playhead = Math.min(X_MAX, prev + (now - lastT) / 1000 / state.secPerYear * YEAR);
    lastT = now;
    events.forEach((e, i) => { if (e.t > prev && e.t <= state.playhead) eventFlash.set(i, now); });
    const year = yearOf(state.playhead);
    if (year !== lastYear) { // a visual beat once a year
      lastYear = year;
      pulse.classList.add('on');
      requestAnimationFrame(() => requestAnimationFrame(() => pulse.classList.remove('on')));
    }
    draw(now);
    if (state.playhead >= X_MAX) { setPlaying(false); draw(); return; }
    requestAnimationFrame(tick);
  }
  playBtn.addEventListener('click', () => setPlaying(!state.playing));
  $('speed').addEventListener('change', (e) => { state.secPerYear = +e.target.value; });
  $('notes').addEventListener('change', (e) => { state.notes = e.target.checked; draw(); });

  // ---- tooltips, hover and scrubbing --------------------------------------------
  const tip = $('tip');
  function showTip(html, cx, cy) {
    tip.innerHTML = html; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = cx + 14, y = cy + 14;
    if (x + r.width > innerWidth - 8) x = cx - r.width - 14;
    if (y + r.height > innerHeight - 8) y = cy - r.height - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  const hideTip = () => { tip.hidden = true; };

  function nearestPoint(x, y) {
    let best = null, bd = 100;
    const cx = (x / CELL) | 0, cy = (y / CELL) | 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const list = spatial.get((cx + dx) + ',' + (cy + dy));
      if (!list) continue;
      for (const i of list) {
        if (i >= revealed) continue;
        const d2 = (PX[i] - x) ** 2 + (PY[i] - y) ** 2;
        if (d2 < bd) { bd = d2; best = i; }
      }
    }
    return best;
  }
  // an event is hit along the symbol strip, or anywhere the sheet draws its mark (eventHitY)
  function nearestEvent(x, y) {
    let best = null, bd = 9;
    events.forEach((e, i) => {
      const ex = xOf(e.t, main, M);
      if ((y < M.t || sheet().eventHitY?.(app, e, y)) && Math.abs(ex - x) < bd) { bd = Math.abs(ex - x); best = i; }
    });
    return best;
  }
  function eventTip(e) {
    const fam = e.families.map((f) => families[f])
      .map((f) => `${pretty(f.name)}: ${fmtInt(f.n)} down, ${fmtInt(f.orbit)} still up`).join('<br>');
    return `<b>${KIND_GLYPH[e.kind]} ${e.name}</b><div class="row">${evDate(e)} · ${KIND_WORD[e.kind]}</div>${fam ? `<div class="row">${fam}</div>` : ''}`;
  }

  let dragging = null;
  function scrubTo(cv, m, clientX) {
    const x = clientX - cv.c.getBoundingClientRect().left;
    state.playhead = Math.max(X_MIN, Math.min(X_MAX, dayOf(x, cv, m)));
    draw();
  }
  for (const [cv, getM] of [[main, () => M], [hist, () => H]]) {
    cv.c.addEventListener('pointerdown', (ev) => {
      const r = cv.c.getBoundingClientRect();
      if (cv === main && sheet().pointerDown?.(app, ev.clientX - r.left, ev.clientY - r.top)) return;
      if (state.playing) setPlaying(false);
      dragging = [cv, getM()]; cv.c.setPointerCapture(ev.pointerId);
      scrubTo(cv, getM(), ev.clientX);
    });
    cv.c.addEventListener('pointerup', () => { dragging = null; });
    cv.c.addEventListener('pointerleave', () => { state.hover = null; hideTip(); if (!state.playing) draw(); });
  }
  main.c.addEventListener('pointermove', (ev) => {
    if (dragging) { scrubTo(...dragging, ev.clientX); return; }
    const r = main.c.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    let html = null, cursor = 'crosshair';
    state.hover = null;
    const e = nearestEvent(x, y);
    const own = e == null && sheet().hoverAt?.(app, x, y); // e.g. row labels: { hover, html, cursor }
    if (e != null) { state.hover = { event: e }; html = eventTip(events[e]); }
    else if (own) { state.hover = own.hover; html = own.html; cursor = own.cursor || cursor; }
    else {
      const i = nearestPoint(x, y);
      if (i != null) { state.hover = { point: i }; html = sheet().pointTip(i, app); }
    }
    main.c.style.cursor = cursor;
    html ? showTip(html, ev.clientX, ev.clientY) : hideTip();
    if (!state.playing) draw();
  });
  hist.c.addEventListener('pointermove', (ev) => {
    if (dragging) { scrubTo(...dragging, ev.clientX); return; }
    const day = dayOf(ev.clientX - hist.c.getBoundingClientRect().left, hist, H);
    const b = upperBound(BIN_STARTS, day + 1e-9) - 1;
    if (b < 0 || b >= bins.length) { hideTip(); return; }
    state.hover = { bin: b };
    showTip(`<b>${fmtMonth(BIN_STARTS[b])}</b><div class="row">${fmtInt(bins[b])} reentries</div>`, ev.clientX, ev.clientY);
    if (!state.playing) draw();
  });

  // ---- sheets --------------------------------------------------------------------
  // Each sheet has a tab button with data-sheet="<id>" and any controls with
  // data-sheet-only="<id>"; switching sheets shows only that sheet's controls.
  function addSheet(s) { sheets.set(s.id, s); s.attach?.(app); }
  function setView(id) {
    const prev = sheet();
    if (prev && prev.id !== id) prev.leave?.(app);
    state.view = id;
    const s = sheet(), order = [...sheets.keys()];
    document.querySelectorAll('[data-sheet]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.sheet === id)));
    document.querySelectorAll('[data-sheet-only]').forEach((el) => { el.hidden = el.dataset.sheetOnly !== id; });
    $('chart-title').textContent = s.title;
    $('chart-note').innerHTML = s.caption(app);
    $('tb-sheet').textContent = `${order.indexOf(id) + 1} of ${order.length}`;
    s.enter?.(app);
    relayout();
  }
  document.querySelectorAll('[data-sheet]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.sheet)));

  // highlight one launch everywhere (the Highlight menu, or a sheet's own control)
  const famSel = $('family');
  function setFamily(f) { state.family = f; famSel.value = String(f); rebuild(); }
  famSel.addEventListener('change', () => setFamily(+famSel.value));

  function start(first) {
    setView(first);
    setZoom(X_MIN, X_MAX); // sets the zoom buttons' enabled states
    let lastW = 0;
    new ResizeObserver(() => { if (wrap.clientWidth !== lastW) { lastW = wrap.clientWidth; relayout(); } }).observe(wrap);
    document.fonts.addEventListener('loadingdone', () => rebuild());
  }

  const app = {
    db, state, zoom, main, hist, wrap, PX, PY, hiddenPt, PEAK,
    get M() { return M; },
    get revealed() { return revealed; },
    xOf, dayOf, clipPlot, narrow, inFamily, haloText, clipText, drawXAxis, drawYTicks, showTip, hideTip,
    draw, rebuild, relayout, addSheet, setView, setFamily, start,
    familyColor: null, // set by a sheet that colours launches (used by the monthly chart)
  };
  readColors();
  return app;
}
