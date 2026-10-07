// Space Junk Rain - every decay sits on its real day; nothing is smoothed.
(async function () {
  const EPOCH_MS = Date.UTC(1957, 0, 1);
  const DAY_MS = 86400000;
  const YEAR = 365.25;
  const TYPE_LABELS = ['Debris', 'Rocket body', 'Payload', 'Unknown'];
  const TYPE_VARS = ['--series-1', '--series-2', '--series-3', '--series-unknown'];
  const GROUP_VARS = ['--series-1', '--series-2', '--series-3'];
  const KIND_GLYPH = { bump: '◇', crash: '✕', explosion: '✷', fragmentation: '⁂' };
  const KIND_WORD = { bump: 'glancing contact', crash: 'impact', explosion: 'collision', fragmentation: 'fragmentation' };
  const Y_MIN = 1, Y_MAX = YEAR * 70;
  const LANE_MIN_DEBRIS = 150;
  const SERIF = '"EB Garamond", Garamond, "Iowan Old Style", Georgia, serif';

  // SATCAT names are all caps; set them in mixed case, keeping real acronyms and designators.
  const ACRONYMS = new Set(['ISS', 'USA', 'PSLV', 'GSLV', 'SL', 'CZ', 'NOAA', 'DMSP', 'GPS', 'OPS', 'ESSA',
    'ATS', 'OAO', 'OGO', 'TDRS', 'GOES', 'HST', 'UK', 'II', 'III', 'IV', 'VI', 'H', 'NRO', 'KH', 'NOSS', 'SJ', 'HJ',
    'YG', 'KZ', 'BD', 'TJS', 'CBERS', 'SPOT', 'ERS', 'DEB', 'R/B']);
  const titleWord = (w) => w.split('-').map((p) =>
    ACRONYMS.has(p) || /\d/.test(p) || p.length === 1 ? p : p[0] + p.slice(1).toLowerCase()).join('-');
  const pretty = (s) => s.replace(/[A-Z0-9/-]+/g, titleWord)
    .replace(/\bDEB\b/, 'debris').replace(/\bR\/B\b/, 'rocket body');

  const data = await (await fetch('data/decays.json', { cache: 'no-store' })).json();
  const { meta, families, names, cols, events } = data;
  const N = cols.d.length;
  const D = Float64Array.from(cols.d);
  const L = Float64Array.from(cols.l, (v) => (v == null ? NaN : v));
  const F = Int32Array.from(cols.f);
  const K = Int8Array.from(cols.k);
  const R = Int8Array.from(cols.r);

  const todayDay = (Date.now() - EPOCH_MS) / DAY_MS;
  const X_MIN = dateToDay('1957-01-01');
  const X_MAX = Math.max(todayDay, N ? D[N - 1] : 0, ...events.map((e) => e.t)) + 60;

  // ---- helpers -----------------------------------------------------------
  function dateToDay(s) { return (Date.parse(s.length <= 10 ? s + 'T00:00:00Z' : s) - EPOCH_MS) / DAY_MS; }
  function fmtDate(day) { return new Date(EPOCH_MS + day * DAY_MS).toISOString().slice(0, 10); }
  const yearOf = (day) => new Date(EPOCH_MS + day * DAY_MS).getUTCFullYear();
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtMonth = (day) => { const d = new Date(EPOCH_MS + day * DAY_MS); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  function fmtSpan(days) {
    if (!isFinite(days)) return 'unknown';
    if (days < 2) return 'under 2 days';
    if (days < 60) return `${days.toFixed(0)} days`;
    if (days < 2 * YEAR) return `${(days / 30.44).toFixed(1)} months`;
    return `${(days / YEAR).toFixed(1)} years`;
  }
  const fmtInt = (n) => n.toLocaleString('en-US');
  const evDate = (e) => e.date.replace('T', ' ').replace(':00Z', ' UTC');
  function upperBound(arr, v) { // first index with arr[i] >= v
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; }
    return lo;
  }
  const hash01 = (n) => (Math.imul(n, 2654435761) >>> 0) / 4294967296;
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  let C = {};
  function readColors() {
    C = {
      types: TYPE_VARS.map(css), groups: GROUP_VARS.map(css), dim: css('--dim'), grid: css('--grid'),
      gridMajor: css('--grid-major'), axis: css('--axis'), muted: css('--muted'), text: css('--text-primary'),
      text2: css('--text-secondary'), hist: css('--hist'), surface: css('--surface-1'), pre: css('--pre'),
      rule: css('--rule'),
    };
  }

  // ---- lanes for the "by source" view ------------------------------------
  const evByFam = new Map();
  events.forEach((e, ei) => e.families.forEach((f) => (evByFam.get(f) || evByFam.set(f, []).get(f)).push(ei)));
  const debrisByFam = new Map();
  for (let i = 0; i < N; i++) if (K[i] === 0) debrisByFam.set(F[i], (debrisByFam.get(F[i]) || 0) + 1);
  const laneFams = new Set([...debrisByFam].filter(([, c]) => c >= LANE_MIN_DEBRIS).map(([f]) => f));
  evByFam.forEach((_, f) => laneFams.add(f));

  const lanes = [...laneFams].map((f) => {
    const evs = evByFam.get(f) || [];
    const ev = evs.length ? events[evs[0]] : null;
    const fam = families[f];
    return {
      fam: f, label: pretty(fam.name), events: evs,
      sub: `${fam.key} · ` + (ev ? `${KIND_WORD[ev.kind]} ${yearOf(ev.t)}` : 'breakup debris'),
      origin: ev ? ev.t : fam.launch ?? 0,
      group: ev && (ev.kind === 'crash' || ev.kind === 'explosion') ? 0 : 1,
      n: fam.n, orbit: fam.orbit, h: 30,
    };
  }).sort((a, b) => a.origin - b.origin);
  const isStarlink = (i) => names[cols.nm[i]].startsWith('STARLINK');
  const AGG = [
    { label: 'All other debris', sub: 'thousands of smaller breakups', group: 1, test: (i) => K[i] === 0 },
    { label: 'Rocket bodies', sub: 'spent upper stages', group: 2, test: (i) => K[i] === 1 },
    { label: 'Starlink satellites', sub: 'retired or failed', group: 2, test: (i) => K[i] === 2 && isStarlink(i) },
    { label: 'Other satellites', sub: 'and unidentified objects', group: 2, test: () => true },
  ].map((a) => ({ ...a, fam: -1, events: [], h: 52, n: 0, agg: true }));
  const LANES = [...lanes, ...AGG];
  const laneIdx = new Map(lanes.map((l, li) => [l.fam, li]));
  const laneOf = new Int16Array(N);
  for (let i = 0; i < N; i++) {
    let li = laneIdx.get(F[i]);
    if (li == null) { const a = AGG.findIndex((g) => g.test(i)); li = lanes.length + a; LANES[li].n++; }
    laneOf[i] = li;
  }
  const famOfLaneGroup = (i) => LANES[laneOf[i]].group;
  // in an event lane, pieces that came down before the breakup weren't its debris
  const preEvent = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const ln = LANES[laneOf[i]];
    if (ln.events.length && D[i] < events[ln.events[0]].t) preEvent[i] = 1;
  }

  // ---- state -------------------------------------------------------------
  const state = { view: 'parent', playhead: X_MAX, playing: false, secPerYear: 3.1470588, family: -1, hover: null };
  let revealed = N, drawnTo = 0, lastYear = -1;
  const eventFlash = new Map();
  const inFamily = (i) => state.family < 0 || F[i] === state.family;
  const colorOf = (i) => !inFamily(i) ? C.dim
    : state.view === 'parent' ? (preEvent[i] ? C.pre : C.groups[famOfLaneGroup(i)])
    : C.types[K[i]];

  // ---- static text ---------------------------------------------------------
  document.getElementById('h-down').textContent = fmtInt(meta.decayed);
  // say what "still in orbit" is made of, so the junk count isn't inflated by working satellites
  document.getElementById('h-up').textContent = meta.onOrbit
    ? `Of the ${fmtInt(meta.onOrbit.total)} still in orbit, ${fmtInt(meta.onOrbit.DEBRIS)} are debris.` : '';
  const big = families.reduce((a, b) => (b.n > a.n ? b : a));
  document.getElementById('t-big').textContent = pretty(big.name);
  document.getElementById('t-big-foot').textContent = `${fmtInt(big.n)} pieces reentered, ${fmtInt(big.orbit)} still up`;
  const fy = families.find((f) => f.key === '1999-025');
  if (fy) {
    document.getElementById('t-fy').textContent = `${Math.round(fy.orbit / (fy.orbit + fy.n) * 100)}%`;
    document.getElementById('t-fy-foot').textContent = `${fmtInt(fy.orbit)} of ${fmtInt(fy.orbit + fy.n)} tracked pieces, ${yearOf(todayDay) - 2007} years after the 2007 test`;
  }
  const retrieved = meta.generated.slice(0, 10);
  document.getElementById('credit').textContent =
    `Data: U.S. Space Command (USSPACECOM), via Space-Track.org: satellite catalog (SATCAT) and ` +
    `satellite decay and reentry data, retrieved ${retrieved}. ` +
    `${fmtInt(meta.decayed)} reentered objects from ${fmtInt(families.length)} launches.`;
  document.getElementById('tb-date').textContent = retrieved;
  document.getElementById('tb-span').textContent = `1957–${yearOf(todayDay)}`;

  const famSel = document.getElementById('family');
  [...lanes].sort((a, b) => b.n - a.n).forEach((l) => {
    const o = document.createElement('option');
    o.value = l.fam; o.textContent = `${l.label} (${families[l.fam].key})`;
    famSel.appendChild(o);
  });
  famSel.addEventListener('change', () => { state.family = +famSel.value; rebuild(); });
  document.getElementById('speed').addEventListener('change', (e) => { state.secPerYear = +e.target.value; });

  const famLink = (e) => e.families.map((f) => families[f]);
  document.querySelector('#events-table tbody').innerHTML = events.map((e) => {
    const fs = famLink(e);
    const sum = (k) => (fs.length ? fmtInt(fs.reduce((s, f) => s + f[k], 0)) : '–');
    return `<tr><td>${evDate(e)}</td><td>${e.name}</td><td>${KIND_GLYPH[e.kind]} ${KIND_WORD[e.kind]}</td><td class="num">${sum('n')}</td><td class="num">${sum('orbit')}</td></tr>`;
  }).join('');
  document.querySelector('#families-table tbody').innerHTML = families.slice(0, 25).map((f) =>
    `<tr><td>${f.key}</td><td>${pretty(f.name)}</td><td class="num">${fmtInt(f.n)}</td><td class="num">${fmtInt(f.orbit)}</td></tr>`).join('');

  // ---- views -------------------------------------------------------------
  // the key lives in the caption, in words, instead of a separate legend box
  const key = (v, text) => `<span class="key"><span class="sw" style="background:var(${v})"></span>${text}</span>`;
  const glyphs = Object.entries(KIND_GLYPH).map(([k, g]) => `${g}&thinsp;${KIND_WORD[k]}`).join(', ');
  const VIEWS = {
    parent: {
      title: 'Where the falling debris came from',
      note: `Each row is one source, in the order it broke apart; each dot is one object on the day it reentered. ` +
        `${key('--series-1', 'Blue')} is debris from collisions and anti-satellite tests, ` +
        `${key('--series-2', 'vermilion')} other breakups and shed parts, ` +
        `${key('--series-3', 'green')} intact rocket stages and satellites; ` +
        `${key('--pre', 'grey')} pieces fell before their source broke up. Symbols mark the event (${glyphs}); ` +
        `the bar at right is the share of each source that has come down.`,
    },
    lifespan: {
      title: 'How long each object stayed up',
      note: `Each dot is one object: when it came down (across) and how long it had been in orbit (up, log scale). ` +
        `${key('--series-1', 'Debris')}, ${key('--series-2', 'rocket bodies')} and ${key('--series-3', 'payloads')}. ` +
        `Debris from one breakup shares a launch date, so each breakup traces its own rising curve.`,
    },
  };
  const tabs = { parent: document.getElementById('tab-parent'), lifespan: document.getElementById('tab-life') };
  function setView(v) {
    state.view = v;
    for (const [k, b] of Object.entries(tabs)) b.setAttribute('aria-selected', String(k === v));
    document.getElementById('chart-title').textContent = VIEWS[v].title;
    document.getElementById('chart-note').innerHTML = VIEWS[v].note;
    document.getElementById('tb-sheet').textContent = `${v === 'parent' ? 1 : 2} of 2`;
    layout(); rebuild();
  }
  tabs.parent.addEventListener('click', () => setView('parent'));
  tabs.lifespan.addEventListener('click', () => setView('lifespan'));

  // ---- canvases ------------------------------------------------------------
  const wrap = document.getElementById('main-wrap');
  const main = setupCanvas('main'), hist = setupCanvas('hist');
  const base = document.createElement('canvas'); const bctx = base.getContext('2d');
  let M = { l: 64, r: 16, t: 34, b: 26 };
  const H = { l: 64, r: 16, t: 8, b: 22 };
  const PX = new Float32Array(N), PY = new Float32Array(N);
  let spatial = new Map(), laneY = [], laneFirstX = [];
  const CELL = 12;

  function setupCanvas(id) { const c = document.getElementById(id); return { c, ctx: c.getContext('2d'), w: 0, h: 0, dpr: 1 }; }
  function size(cv) {
    const r = cv.c.getBoundingClientRect();
    cv.dpr = window.devicePixelRatio || 1;
    cv.w = r.width; cv.h = r.height;
    cv.c.width = Math.round(r.width * cv.dpr); cv.c.height = Math.round(r.height * cv.dpr);
    cv.ctx.setTransform(cv.dpr, 0, 0, cv.dpr, 0, 0);
  }
  const xOf = (day, cv, m) => m.l + (day - X_MIN) / (X_MAX - X_MIN) * (cv.w - m.l - m.r);
  const dayOf = (x, cv, m) => X_MIN + (x - m.l) / (cv.w - m.l - m.r) * (X_MAX - X_MIN);
  const yLife = (span) => {
    const v = Math.log(Math.min(Y_MAX, Math.max(Y_MIN, span)) / Y_MIN) / Math.log(Y_MAX / Y_MIN);
    return main.h - M.b - v * (main.h - M.t - M.b);
  };
  const radius = (i) => state.view === 'parent' ? (LANES[laneOf[i]].agg ? 1.4 : 1.8) : ([1.6, 2.4, 3.2][R[i]] || 2);
  const narrow = () => wrap.clientWidth < 700;

  function layout() {
    if (state.view === 'parent') {
      M = { l: narrow() ? 120 : 196, r: narrow() ? 12 : 128, t: 34, b: 26 };
      let y = M.t;
      laneY = LANES.map((ln, li) => {
        if (ln.agg && !LANES[li - 1].agg) y += 30; // gap + heading before the aggregates
        const top = y; y += ln.h; return top;
      });
      wrap.style.height = `${y + M.b}px`;
    } else {
      M = { l: 64, r: 16, t: 34, b: 26 };
      wrap.style.height = '';
    }
    size(main); size(hist);
    base.width = main.c.width; base.height = main.c.height;
    bctx.setTransform(main.dpr, 0, 0, main.dpr, 0, 0);
    spatial = new Map();
    for (let i = 0; i < N; i++) {
      PX[i] = xOf(D[i], main, M);
      if (state.view === 'parent') {
        const ln = LANES[laneOf[i]], pad = 4;
        PY[i] = laneY[laneOf[i]] + pad + hash01(cols.id[i]) * (ln.h - 2 * pad);
      } else {
        PY[i] = yLife(D[i] - L[i]);
      }
      const key = ((PX[i] / CELL) | 0) + ',' + ((PY[i] / CELL) | 0);
      (spatial.get(key) || spatial.set(key, []).get(key)).push(i);
    }
    laneFirstX = LANES.map(() => Infinity);
    for (let i = 0; i < N; i++) if (PX[i] < laneFirstX[laneOf[i]]) laneFirstX[laneOf[i]] = PX[i];
    buildHistogram();
  }

  function paintPoints(from, to) {
    bctx.globalAlpha = state.view === 'parent' ? 0.7 : 0.8;
    for (let i = from; i < to; i++) {
      bctx.fillStyle = colorOf(i);
      bctx.beginPath(); bctx.arc(PX[i], PY[i], radius(i), 0, 6.2832); bctx.fill();
    }
    bctx.globalAlpha = 1;
  }
  function rebuild() { readColors(); bctx.clearRect(0, 0, main.w, main.h); drawnTo = 0; buildHistogram(); draw(); }

  // ---- histogram -------------------------------------------------------------
  let bins = [], binMax = 1;
  const BIN_STARTS = [];
  for (let y = 1957, done = false; !done; y++) {
    for (let m = 0; m < 12; m++) {
      const d = (Date.UTC(y, m, 1) - EPOCH_MS) / DAY_MS;
      if (d > X_MAX) { done = true; break; }
      BIN_STARTS.push(d);
    }
  }
  function buildHistogram() {
    bins = new Array(BIN_STARTS.length).fill(0);
    let b = 0;
    for (let i = 0; i < N; i++) {
      if (!inFamily(i)) continue;
      while (b + 1 < BIN_STARTS.length && BIN_STARTS[b + 1] <= D[i]) b++;
      bins[b]++;
    }
    binMax = Math.max(1, ...bins);
  }
  const PEAK = { bin: 0, day: Infinity, text: '' };
  { // busiest month tile (whole catalog)
    const save = state.family; state.family = -1; buildHistogram(); state.family = save;
    const b = bins.indexOf(binMax);
    // which source dominated the busiest month?
    const lo = BIN_STARTS[b], hi = BIN_STARTS[b + 1] ?? X_MAX, byFam = new Map();
    for (let i = upperBound(D, lo); i < N && D[i] < hi; i++) byFam.set(F[i], (byFam.get(F[i]) || 0) + 1);
    const [topFam, topN] = [...byFam].sort((a, c) => c[1] - a[1])[0];
    PEAK.bin = b; PEAK.day = lo;
    PEAK.text = `${fmtMonth(lo)}: ${fmtInt(binMax)} reentries, ${fmtInt(topN)} of them ${pretty(families[topFam].name)} debris`;
    document.getElementById('t-peak').textContent = fmtMonth(lo);
    document.getElementById('t-peak-foot').textContent = `${fmtInt(binMax)} reentries, ${fmtInt(topN)} from ${pretty(families[topFam].name)}`;
  }

  // ---- drawing -------------------------------------------------------------
  const Y_TICKS = [[1, '1 day'], [7, '1 week'], [30.44, '1 month'], [YEAR, '1 year'], [10 * YEAR, '10 years'], [50 * YEAR, '50 years']];
  const FONT = (px, w = 400, style = 'normal') => `${style} ${w} ${px}px ${SERIF}`;

  // graph paper: faint yearly rules, firmer decade rules, drafting ticks on the time axis
  function drawXAxis(cv, m) {
    const ctx = cv.ctx, base = cv.h - m.b + 0.5;
    ctx.font = FONT(13); ctx.lineWidth = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = C.muted;
    for (let y = 1957; y <= 2030; y++) {
      const x = Math.round(xOf(dateToDay(`${y}-01-01`), cv, m)) + 0.5;
      if (x < m.l || x > cv.w - m.r) continue;
      const decade = y % 10 === 0;
      ctx.strokeStyle = decade ? C.gridMajor : C.grid;
      ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, cv.h - m.b); ctx.stroke();
      ctx.strokeStyle = C.axis;
      ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, base + (decade ? 6 : y % 5 === 0 ? 4 : 2)); ctx.stroke();
      if (decade) ctx.fillText(String(y), x, base + 7);
    }
    ctx.strokeStyle = C.axis;
    ctx.beginPath(); ctx.moveTo(m.l, base); ctx.lineTo(cv.w - m.r, base); ctx.stroke();
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

  function clip(ctx, text, max) {
    if (ctx.measureText(text).width <= max) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > max) text = text.slice(0, -1);
    return text + '…';
  }

  function drawLanes() {
    const ctx = main.ctx, plotR = main.w - M.r;
    LANES.forEach((ln, li) => {
      const top = laneY[li], mid = top + ln.h / 2;
      const hl = state.family >= 0 && ln.fam === state.family;
      const hov = state.hover && state.hover.lane === li;
      if (ln.agg && !LANES[li - 1].agg) {
        ctx.font = FONT(15, 400, 'italic'); ctx.fillStyle = C.text2; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText('Everything else', 0, top - 7);
        ctx.strokeStyle = C.rule; ctx.beginPath(); ctx.moveTo(0, top - 2.5); ctx.lineTo(main.w, top - 2.5); ctx.stroke();
      }
      if (hl || hov) { ctx.fillStyle = C.gridMajor; ctx.globalAlpha = 0.45; ctx.fillRect(0, top, main.w, ln.h); ctx.globalAlpha = 1; }
      // lifeline from launch to today, with a launch tick
      if (!ln.agg && families[ln.fam].launch != null) {
        const x0 = Math.max(M.l, xOf(families[ln.fam].launch, main, M));
        ctx.strokeStyle = C.axis; ctx.lineWidth = 0.75;
        ctx.beginPath(); ctx.moveTo(x0, mid + 0.5); ctx.lineTo(plotR, mid + 0.5); ctx.stroke();
        ctx.lineWidth = 1.25; ctx.beginPath(); ctx.moveTo(x0, mid - 3.5); ctx.lineTo(x0, mid + 4.5); ctx.stroke();
        ctx.lineWidth = 1;
      }
      // labels
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = FONT(15, 500); ctx.fillStyle = C.text;
      ctx.fillText(clip(ctx, ln.label, M.l - 14), 0, top + (ln.agg ? 24 : 14));
      ctx.font = FONT(12.5, 400, 'italic'); ctx.fillStyle = C.muted;
      ctx.fillText(clip(ctx, ln.sub, M.l - 14), 0, top + (ln.agg ? 39 : 27));
      // right gutter: share reentered
      if (!narrow()) {
        const bx = plotR + 14, bw = 56, by = mid - 3;
        ctx.textAlign = 'left'; ctx.font = FONT(13); ctx.fillStyle = C.text2;
        if (!ln.agg) {
          const share = ln.n / Math.max(1, ln.n + ln.orbit);
          ctx.fillStyle = C.grid; ctx.fillRect(bx, by, bw, 6);
          ctx.fillStyle = C.groups[ln.group]; ctx.fillRect(bx, by, Math.max(share > 0 ? 1.5 : 0, bw * share), 6);
          ctx.fillStyle = C.text2; ctx.textBaseline = 'middle';
          ctx.fillText(`${Math.round(share * 100)}%`, bx + bw + 6, mid);
        } else {
          ctx.textBaseline = 'middle'; ctx.fillText(fmtInt(ln.n), bx, mid);
        }
      }
    });
    ctx.textBaseline = 'alphabetic';
    if (!narrow()) {
      ctx.font = FONT(13, 400, 'italic'); ctx.fillStyle = C.muted; ctx.textAlign = 'left';
      ctx.fillText('share down', plotR + 14, M.t - 8);
    }
  }

  // ---- notes written on the plotting field --------------------------------
  function fmtDur(days) {
    if (days < 70) return `${Math.max(1, Math.round(days / 7))} weeks`;
    if (days < 2 * YEAR) return `${Math.round(days / 30.44)} months`;
    const y = days / YEAR;
    return `${y < 10 ? y.toFixed(1).replace(/\.0$/, '') : Math.round(y)} years`;
  }
  // per event lane: how fast its debris came down, from the data itself
  function laneStats(ln) {
    const ev = events[ln.events[0]], ts = [];
    for (let i = 0; i < N; i++) if (laneOf[i] === laneIdx.get(ln.fam) && D[i] >= ev.t) ts.push(D[i] - ev.t);
    ts.sort((a, b) => a - b);
    const q = (p) => ts[Math.min(ts.length - 1, Math.floor(p * (ts.length - 1)))];
    const up = ln.orbit / Math.max(1, ln.n + ln.orbit);
    return { ev, n: ts.length, up, half: ts.length ? q(0.5) : 0, p90: ts.length ? q(0.9) : 0, since: todayDay - ev.t };
  }
  function laneNote(ln) {
    if (ln.agg) return ln.label.startsWith('Starlink') ? 'retired satellites, steered down after about 5 years' : null;
    if (!ln.events.length) return null;
    // longest wording first; the drawing code uses the first one that fits the empty space
    const s = laneStats(ln), from = s.ev.alt ? `, from ~${s.ev.alt} km` : '';
    if (!s.n) {
      const d = new Date(EPOCH_MS + s.ev.t * DAY_MS);
      return [`broke up ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}; fragments not yet catalogued`,
        'fragments not yet catalogued'];
    }
    if (s.up > 0.3 && s.since > 5 * YEAR) {
      const yrs = `${Math.floor(s.since / YEAR)} years`, pct = `${Math.round(s.up * 100)}%`;
      return [`${pct} still in orbit after ${yrs}${from}`, `${pct} still in orbit after ${yrs}`, `${pct} still up`];
    }
    // the altitude explains the speed, so it outlasts the 90% figure as space runs out
    const half = `half down in ${fmtDur(s.half)}`, p90 = `90% in ${fmtDur(s.p90)}`;
    return [`${half}, ${p90}${from}`, `${half}${from}`, `${half}, ${p90}`, half];
  }
  const laneNotes = new Map();
  LANES.forEach((ln, li) => { const n = laneNote(ln); if (n) laneNotes.set(li, [].concat(n)); });

  // text knocked out of the dots behind it with a ring of sheet colour
  function haloText(ctx, text, x, y) {
    ctx.save(); ctx.strokeStyle = C.surface; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y); ctx.restore(); ctx.fillText(text, x, y);
  }
  function drawLaneNotes() {
    const ctx = main.ctx;
    ctx.font = FONT(13.5, 400, 'italic'); ctx.fillStyle = C.text2; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    laneNotes.forEach((variants, li) => {
      const ln = LANES[li];
      // the note sits in the empty stretch before the row's first mark, ending at its launch tick
      const from = ln.agg ? dateToDay('2019-06-01') : ln.events.length ? events[ln.events[0]].t : 0;
      if (state.playhead < from) return; // a note appears once its story has happened
      const end = ln.agg ? xOf(from, main, M) : Math.min(xOf(families[ln.fam].launch, main, M), laneFirstX[li]);
      const text = variants.find((t) => ctx.measureText(t).width < end - 10 - M.l - 8);
      if (text) haloText(ctx, text + ' —', end - 8, laneY[li] + ln.h / 2 + 0.5);
    });
  }

  const LIFE_NOTES = [
    { x: '1961-06-01', y: 3, align: 'left', text: 'upper stages that fall within days of launch' },
    { x: '2019-09-01', y: 5.2 * YEAR, align: 'right', text: 'Starlink retirements, about 5 years after launch —' },
  ];
  function drawLifeNotes() {
    const ctx = main.ctx;
    ctx.font = FONT(13.5, 400, 'italic'); ctx.fillStyle = C.text; ctx.textBaseline = 'middle';
    for (const n of LIFE_NOTES) {
      ctx.textAlign = n.align;
      haloText(ctx, n.text, xOf(dateToDay(n.x), main, M), yLife(n.y));
    }
  }

  function drawEvents(now) {
    const ctx = main.ctx;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    events.forEach((e, idx) => {
      const x = Math.round(xOf(e.t, main, M)) + 0.5;
      const passed = e.t <= state.playhead;
      const since = eventFlash.has(idx) ? (now - eventFlash.get(idx)) / 1000 : 9;
      const glow = Math.max(0, 1 - since / 1.2);
      const hov = state.hover && state.hover.event === idx;
      const full = state.view === 'lifespan' || glow > 0 || hov;
      ctx.globalAlpha = passed ? 0.6 + 0.4 * Math.max(glow, hov ? 1 : 0) : 0.25;
      ctx.strokeStyle = C.text2; ctx.lineWidth = 1 + 2 * glow;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, M.t - 6); ctx.lineTo(x, full ? main.h - M.b : M.t); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = FONT(12); ctx.fillStyle = C.text;
      ctx.fillText(KIND_GLYPH[e.kind], x, 14);
      if (state.view === 'parent') {
        ctx.font = FONT(14, 700);
        for (const f of e.families) {
          const li = laneIdx.get(f); if (li == null) continue;
          const y = laneY[li] + LANES[li].h / 2;
          ctx.fillStyle = C.surface; ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.2832); ctx.fill();
          ctx.fillStyle = C.text; ctx.fillText(KIND_GLYPH[e.kind], x, y + 0.5);
        }
      }
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
    });
  }

  function drawRain() {
    const flashDays = 0.4 / state.secPerYear * YEAR;
    const from = upperBound(D, state.playhead - flashDays);
    const ctx = main.ctx, drop = state.view === 'parent' ? 12 : 28;
    for (let i = from; i < revealed; i++) {
      const age = Math.min(1, (state.playhead - D[i]) / flashDays);
      const fall = (1 - age) * drop;
      ctx.strokeStyle = colorOf(i); ctx.globalAlpha = 1 - age * 0.7; ctx.lineWidth = radius(i) + 0.4;
      ctx.beginPath(); ctx.moveTo(PX[i], PY[i] - fall - 8); ctx.lineTo(PX[i], PY[i] - fall); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
  }

  function draw(now = performance.now()) {
    revealed = upperBound(D, state.playhead);
    if (!base.width || !base.height) return;
    if (revealed < drawnTo) { bctx.clearRect(0, 0, main.w, main.h); drawnTo = 0; }
    if (revealed > drawnTo) { paintPoints(drawnTo, revealed); drawnTo = revealed; }

    const ctx = main.ctx;
    ctx.clearRect(0, 0, main.w, main.h);
    drawXAxis(main, M);
    if (state.view === 'parent') drawLanes();
    else drawYTicks(main, M, Y_TICKS.map(([v, l]) => [yLife(v), l]));
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(base, 0, 0); ctx.restore();
    if (state.playhead < X_MAX) drawRain();
    if (state.view === 'parent') drawLaneNotes();
    else if (state.playhead >= X_MAX) drawLifeNotes();
    drawEvents(now);

    if (state.playhead < X_MAX) {
      const x = Math.round(xOf(state.playhead, main, M)) + 0.5;
      ctx.strokeStyle = C.text;
      ctx.beginPath(); ctx.moveTo(x, M.t - 6); ctx.lineTo(x, main.h - M.b); ctx.stroke();
    }
    const h = state.hover;
    if (h && h.point != null) {
      ctx.strokeStyle = C.text; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(PX[h.point], PY[h.point], radius(h.point) + 3, 0, 6.2832); ctx.stroke();
      ctx.lineWidth = 1;
    }
    drawHist();

    let shown = 0;
    for (let i = 0; i < revealed; i++) if (inFamily(i)) shown++;
    document.getElementById('date').textContent = state.playhead >= X_MAX ? 'Today' : fmtDate(state.playhead);
    document.getElementById('now-count').textContent = `${fmtInt(shown)} down`;
  }

  function drawHist() {
    const ctx = hist.ctx;
    ctx.clearRect(0, 0, hist.w, hist.h);
    const plotH = hist.h - H.t - H.b;
    const yv = (v) => hist.h - H.b - v / binMax * plotH;
    H.l = M.l; H.r = M.r; // share the main chart's x scale
    drawYTicks(hist, H, [[yv(binMax), fmtInt(binMax)], [yv(binMax / 2), fmtInt(Math.round(binMax / 2))]]);
    drawXAxis(hist, H);
    ctx.fillStyle = state.family >= 0 ? C.groups[LANES[laneIdx.get(state.family)].group] : C.hist;
    for (let b = 0; b < bins.length; b++) {
      if (!bins[b] || BIN_STARTS[b] > state.playhead) continue;
      const x0 = xOf(BIN_STARTS[b], hist, H), x1 = xOf(BIN_STARTS[b + 1] ?? X_MAX, hist, H);
      const y = yv(bins[b]);
      ctx.fillRect(x0, y, Math.max(1, x1 - x0 - 0.5), hist.h - H.b - y);
    }
    // label the peak month with what caused it
    if (state.family < 0 && PEAK.day <= state.playhead) {
      ctx.font = FONT(13.5, 400, 'italic'); ctx.fillStyle = C.text2;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      haloText(ctx, PEAK.text, xOf(PEAK.day, hist, H) - 8, yv(bins[PEAK.bin]) + 6);
    }
    const h = state.hover;
    if (h && h.bin != null) {
      const x = Math.round(xOf(BIN_STARTS[h.bin], hist, H)) + 0.5;
      ctx.strokeStyle = C.text; ctx.beginPath(); ctx.moveTo(x, H.t); ctx.lineTo(x, hist.h - H.b); ctx.stroke();
    }
  }

  // ---- playback ------------------------------------------------------------
  const playBtn = document.getElementById('play'), pulse = document.getElementById('pulse');
  let lastT = 0;
  function setPlaying(p) {
    state.playing = p;
    playBtn.textContent = p ? '❚❚ Pause' : '▶ Play';
    playBtn.setAttribute('aria-label', p ? 'Pause' : 'Play');
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
    if (year !== lastYear) {
      lastYear = year;
      pulse.classList.add('on');
      requestAnimationFrame(() => requestAnimationFrame(() => pulse.classList.remove('on')));
    }
    draw(now);
    if (state.playhead >= X_MAX) { setPlaying(false); draw(); return; }
    requestAnimationFrame(tick);
  }
  playBtn.addEventListener('click', () => setPlaying(!state.playing));

  // ---- hover & scrub -------------------------------------------------------
  const tip = document.getElementById('tip');
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
  function nearestEvent(x, y) {
    let best = null, bd = 9;
    events.forEach((e, i) => {
      const ex = xOf(e.t, main, M);
      const onLane = state.view === 'parent' && e.families.some((f) => {
        const li = laneIdx.get(f); return li != null && Math.abs(laneY[li] + LANES[li].h / 2 - y) < 9;
      });
      if ((y < M.t || onLane) && Math.abs(ex - x) < bd) { bd = Math.abs(ex - x); best = i; }
    });
    return best;
  }
  const laneAt = (y) => LANES.findIndex((ln, li) => y >= laneY[li] && y < laneY[li] + ln.h);

  function eventTip(e) {
    const fam = famLink(e).map((f) => `${pretty(f.name)}: ${fmtInt(f.n)} down, ${fmtInt(f.orbit)} still up`).join('<br>');
    return `<b>${KIND_GLYPH[e.kind]} ${e.name}</b><div class="row">${evDate(e)} · ${KIND_WORD[e.kind]}</div>${fam ? `<div class="row">${fam}</div>` : ''}`;
  }
  function laneTip(ln) {
    if (ln.agg) return `<b>${ln.label}</b><div class="row">${fmtInt(ln.n)} reentered · ${ln.sub}</div>`;
    const f = families[ln.fam];
    const ev = ln.events.map((ei) => `${KIND_GLYPH[events[ei].kind]} ${events[ei].name}, ${evDate(events[ei])}`).join('<br>');
    return `<b>${ln.label}</b><div class="row">Launch ${f.key}${f.launch != null ? ', ' + fmtDate(f.launch) : ''}</div>
      ${ev ? `<div class="row">${ev}</div>` : ''}
      <div class="row">${fmtInt(f.n)} reentered · ${fmtInt(f.orbit)} still in orbit</div>`;
  }
  function pointTip(i) {
    const fam = families[F[i]];
    return `<b>${pretty(names[cols.nm[i]])}</b>
      <div class="row">NORAD ${cols.id[i]} · ${TYPE_LABELS[K[i]]}${R[i] >= 0 ? ', ' + meta.rcs[R[i]].toLowerCase() : ''}</div>
      <div class="row">Launched ${isFinite(L[i]) ? fmtDate(L[i]) : '?'} · reentered ${fmtDate(D[i])}</div>
      <div class="row">${fmtSpan(D[i] - L[i])} in orbit · source ${fam.key}</div>`;
  }

  let dragging = null;
  function scrubTo(cv, m, clientX) {
    const x = clientX - cv.c.getBoundingClientRect().left;
    state.playhead = Math.max(X_MIN, Math.min(X_MAX, dayOf(x, cv, m)));
    draw();
  }
  for (const [cv, getM] of [[main, () => M], [hist, () => H]]) {
    cv.c.addEventListener('pointerdown', (ev) => {
      const x = ev.clientX - cv.c.getBoundingClientRect().left;
      if (cv === main && state.view === 'parent' && x < M.l) { // click a lane label to highlight it
        const li = laneAt(ev.clientY - main.c.getBoundingClientRect().top);
        if (li >= 0 && !LANES[li].agg) {
          state.family = state.family === LANES[li].fam ? -1 : LANES[li].fam;
          famSel.value = String(state.family); rebuild();
        }
        return;
      }
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
    let html = null; state.hover = null;
    const e = nearestEvent(x, y);
    if (e != null) { state.hover = { event: e }; html = eventTip(events[e]); }
    else if (state.view === 'parent' && (x < M.l || x > main.w - M.r)) {
      const li = laneAt(y);
      if (li >= 0) { state.hover = { lane: li }; html = laneTip(LANES[li]); }
    } else {
      const i = nearestPoint(x, y);
      if (i != null) { state.hover = { point: i }; html = pointTip(i); }
    }
    main.c.style.cursor = state.hover && state.hover.lane != null && !LANES[state.hover.lane].agg ? 'pointer' : 'crosshair';
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

  // ---- boot ----------------------------------------------------------------
  // canvas text needs the web font loaded first; don't wait long if it's offline
  try {
    await Promise.race([
      Promise.all(['500 15px', 'italic 13px', '13px'].map((f) => document.fonts.load(`${f} "EB Garamond"`))),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch (e) { /* fall back to Georgia */ }
  // paper / blueprint switch: an explicit choice is remembered; otherwise follow the system
  const themeBtn = document.getElementById('theme');
  const sysDark = matchMedia('(prefers-color-scheme: dark)');
  let saved = null;
  try { saved = localStorage.getItem('sjr-theme'); } catch (e) { /* storage blocked */ }
  // a theme already set on <html> (e.g. by a host page) is respected until the viewer flips the switch
  function applyTheme(t) {
    if (t) document.documentElement.dataset.theme = t;
    const cur = document.documentElement.dataset.theme;
    themeBtn.setAttribute('aria-checked', String(cur ? cur === 'dark' : sysDark.matches));
  }
  applyTheme(saved);
  themeBtn.addEventListener('click', () => {
    const t = themeBtn.getAttribute('aria-checked') === 'true' ? 'light' : 'dark';
    try { localStorage.setItem('sjr-theme', t); } catch (e) { /* not remembered, still applied */ }
    applyTheme(t); // the observer below redraws the canvases
  });
  sysDark.addEventListener('change', () => applyTheme(null));
  new MutationObserver(() => { applyTheme(null); rebuild(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  readColors();
  setView('parent');
  document.fonts.addEventListener('loadingdone', () => rebuild());
  let lastW = 0;
  new ResizeObserver(() => { if (wrap.clientWidth !== lastW) { lastW = wrap.clientWidth; layout(); rebuild(); } }).observe(wrap);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rebuild);
})();
