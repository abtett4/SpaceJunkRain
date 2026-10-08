// Sheet 1, "By source": one row per major breakup, each dot an object on the day it reentered.

import {
  YEAR, KIND_GLYPH, KIND_WORD, FONT, dateToDay, fmtDate, fmtDay, yearOf, fmtDur, fmtInt, evDate, pretty, hash01,
} from '../util.js';
import { C } from '../theme.js';
import { objectTip } from '../tips.js';

const LANE_MIN_DEBRIS = 150; // a launch gets its own row at this many reentered debris pieces

export function createSourceSheet(db) {
  const { N, D, F, K, events, families, names, cols, todayDay } = db;

  // ---- rows ------------------------------------------------------------------
  const evByFam = new Map();
  events.forEach((e, ei) => e.families.forEach((f) => (evByFam.get(f) || evByFam.set(f, []).get(f)).push(ei)));
  const debrisByFam = new Map();
  for (let i = 0; i < N; i++) if (K[i] === 0) debrisByFam.set(F[i], (debrisByFam.get(F[i]) || 0) + 1);
  const laneFams = new Set([...debrisByFam].filter(([, c]) => c >= LANE_MIN_DEBRIS).map(([f]) => f));
  evByFam.forEach((_, f) => laneFams.add(f)); // every launch linked in events.json gets a row

  const lanes = [...laneFams].map((f) => {
    const evs = evByFam.get(f) || [];
    const ev = evs.length ? events[evs[0]] : null;
    const fam = families[f];
    return {
      // an event can name its row when the catalogue name is ambiguous (eight launches are "Delta 1")
      fam: f, label: evs.map((ei) => events[ei].row).find(Boolean) || pretty(fam.name), events: evs,
      sub: `${fam.key} · ` + (ev ? `${KIND_WORD[ev.kind]} ${yearOf(ev.t)}` : 'breakup debris'),
      origin: ev ? ev.t : fam.launch ?? 0,
      group: ev && (ev.kind === 'crash' || ev.kind === 'explosion') ? 0 : 1, // colour: 0 collision/ASAT, 1 other
      n: fam.n, orbit: fam.orbit, h: 30,
    };
  }).sort((a, b) => a.origin - b.origin); // in the order they broke apart
  const isStarlink = (i) => names[cols.nm[i]].startsWith('STARLINK');
  // the "Everything else" rows; each object goes to the first one whose test it passes
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
  // in an event row, pieces that came down before the breakup weren't its debris
  const preEvent = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const ln = LANES[laneOf[i]];
    if (ln.events.length && D[i] < events[ln.events[0]].t) preEvent[i] = 1;
  }

  let showAgg = false, laneY = [], laneFirstX = [];
  const laneShown = (li) => !LANES[li].agg || showAgg;
  const laneAt = (y) => LANES.findIndex((ln, li) => laneY[li] != null && y >= laneY[li] && y < laneY[li] + ln.h);

  // ---- notes for event rows, worked out from the data ----------------------------
  function laneStats(ln) {
    const ev = events[ln.events[0]], li = laneIdx.get(ln.fam), ts = [];
    for (let i = 0; i < N; i++) if (laneOf[i] === li && D[i] >= ev.t) ts.push(D[i] - ev.t);
    ts.sort((a, b) => a - b);
    const q = (p) => ts[Math.min(ts.length - 1, Math.floor(p * (ts.length - 1)))];
    const up = ln.orbit / Math.max(1, ln.n + ln.orbit);
    return { ev, n: ts.length, up, half: ts.length ? q(0.5) : 0, p90: ts.length ? q(0.9) : 0, since: todayDay - ev.t };
  }
  // longest wording first; drawing uses the first one that fits the empty space
  function laneNote(ln) {
    if (ln.agg) return ln.label.startsWith('Starlink') ? ['retired satellites, steered down after about 5 years'] : null;
    if (!ln.events.length) return null;
    const s = laneStats(ln), from = s.ev.alt ? `, from ~${s.ev.alt} km` : '';
    if (!s.n) return [`broke up ${fmtDay(s.ev.t)}; fragments not yet catalogued`, 'fragments not yet catalogued'];
    if (s.up > 0.3 && s.since > 5 * YEAR) {
      const yrs = `${Math.floor(s.since / YEAR)} years`, pct = `${Math.round(s.up * 100)}%`;
      return [`${pct} still in orbit after ${yrs}${from}`, `${pct} still in orbit after ${yrs}`, `${pct} still up`];
    }
    // the altitude explains the speed, so it outlasts the 90% figure as space runs out
    const half = `half down in ${fmtDur(s.half)}`, p90 = `90% in ${fmtDur(s.p90)}`;
    return [`${half}, ${p90}${from}`, `${half}${from}`, `${half}, ${p90}`, half];
  }
  const laneNotes = new Map();
  LANES.forEach((ln, li) => { const n = laneNote(ln); if (n) laneNotes.set(li, n); });

  // ---- "Everything else" fold ---------------------------------------------------
  const aggBtn = document.getElementById('agg-toggle');
  const aggTotal = AGG.reduce((s, a) => s + a.n, 0);
  let appRef = null;
  function renderAggBtn() {
    aggBtn.setAttribute('aria-expanded', String(showAgg));
    aggBtn.innerHTML = showAgg
      ? '▾ Hide everything else'
      : `▸ Everything else <span class="count">· ${fmtInt(aggTotal)} more reentries in ${AGG.length} rows</span>: ` +
        'thousands of smaller breakups, spent rocket stages, Starlink and other satellites';
  }
  aggBtn.addEventListener('click', () => { showAgg = !showAgg; renderAggBtn(); appRef?.relayout(); });
  renderAggBtn();

  // the Highlight menu lists these rows, biggest first
  const famSel = document.getElementById('family');
  [...lanes].sort((a, b) => b.n - a.n).forEach((l) => {
    const o = document.createElement('option');
    o.value = l.fam; o.textContent = `${l.label} (${families[l.fam].key})`;
    famSel.appendChild(o);
  });

  const key = (v, text) => `<span class="key"><span class="sw" style="background:var(${v})"></span>${text}</span>`;
  const glyphs = Object.entries(KIND_GLYPH).map(([k, g]) => `${g}&thinsp;${KIND_WORD[k]}`).join(', ');

  return {
    id: 'source',
    title: 'Where the falling debris came from',
    caption: () => `Each row is one source, in the order it broke apart; each dot is one object on the day it reentered. ` +
      `${key('--series-1', 'Blue')} is debris from collisions and anti-satellite tests, ` +
      `${key('--series-2', 'vermilion')} other breakups and shed parts, ` +
      `${key('--series-3', 'green')} intact rocket stages and satellites; ` +
      `${key('--pre', 'grey')} pieces fell before their source broke up. Symbols mark the event (${glyphs}); ` +
      `the bar at right is the share of each source that has come down.`,
    topAxis: true,        // year labels along the top as well, for the rows far from the bottom axis
    eventLines: 'hover',  // full-height event lines only on hover or as the playhead passes
    rainDrop: 12,
    alpha: 0.7,

    // the monthly chart takes a highlighted launch's colour from its row, on every sheet
    attach(app) { appRef = app; app.familyColor = (f) => C.groups[LANES[laneIdx.get(f)].group]; },

    frame(app) {
      const narrow = app.narrow();
      // taller top margin: event symbols, then a row of year labels above the rows
      const M = { l: narrow ? 120 : 196, r: narrow ? 12 : 128, t: 52, b: 26 };
      let y = M.t;
      laneY = LANES.map((ln, li) => {
        if (!laneShown(li)) return null;
        if (ln.agg && !LANES[li - 1].agg) y += 30; // gap + heading before the aggregates
        const top = y; y += ln.h; return top;
      });
      return { M, height: y + M.b };
    },
    layout(app) {
      const { PX, PY, hiddenPt } = app;
      for (let i = 0; i < N; i++) {
        if (!laneShown(laneOf[i])) { hiddenPt[i] = 1; continue; }
        const ln = LANES[laneOf[i]], pad = 4;
        // height inside the row carries no data; it only keeps dots apart
        PY[i] = laneY[laneOf[i]] + pad + hash01(cols.id[i]) * (ln.h - 2 * pad);
      }
      laneFirstX = LANES.map(() => Infinity);
      for (let i = 0; i < N; i++) if (PX[i] < laneFirstX[laneOf[i]]) laneFirstX[laneOf[i]] = PX[i];
    },
    colorOf: (i, app) => !app.inFamily(i) ? C.dim : preEvent[i] ? C.pre : C.groups[LANES[laneOf[i]].group],
    radius: (i) => (LANES[laneOf[i]].agg ? 1.4 : 1.8),

    drawUnder(app) {
      const { main, state } = app, M = app.M, ctx = main.ctx, plotR = main.w - M.r;
      LANES.forEach((ln, li) => {
        if (!laneShown(li)) return;
        const top = laneY[li], mid = top + ln.h / 2;
        const hl = state.family >= 0 && ln.fam === state.family;
        const hov = state.hover && state.hover.lane === li;
        if (ln.agg && !LANES[li - 1].agg) {
          ctx.font = FONT(15, 400, 'italic'); ctx.fillStyle = C.text2; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
          ctx.fillText('Everything else', 0, top - 7);
          ctx.strokeStyle = C.rule; ctx.beginPath(); ctx.moveTo(0, top - 2.5); ctx.lineTo(main.w, top - 2.5); ctx.stroke();
        }
        if (hl || hov) { ctx.fillStyle = C.gridMajor; ctx.globalAlpha = 0.45; ctx.fillRect(0, top, main.w, ln.h); ctx.globalAlpha = 1; }
        // lifeline from launch to today; when zoomed it's cut at the plot edges and the
        // launch tick only shows if the launch is in view
        if (!ln.agg && families[ln.fam].launch != null) {
          const lx = app.xOf(families[ln.fam].launch, main, M), x0 = Math.max(M.l, lx);
          if (x0 <= plotR) {
            ctx.strokeStyle = C.axis; ctx.lineWidth = 0.75;
            ctx.beginPath(); ctx.moveTo(x0, mid + 0.5); ctx.lineTo(plotR, mid + 0.5); ctx.stroke();
            if (lx >= M.l) { ctx.lineWidth = 1.25; ctx.beginPath(); ctx.moveTo(x0, mid - 3.5); ctx.lineTo(x0, mid + 4.5); ctx.stroke(); }
            ctx.lineWidth = 1;
          }
        }
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.font = FONT(15, 500); ctx.fillStyle = C.text;
        ctx.fillText(app.clipText(ctx, ln.label, M.l - 14), 0, top + (ln.agg ? 24 : 14));
        ctx.font = FONT(12.5, 400, 'italic'); ctx.fillStyle = C.muted;
        ctx.fillText(app.clipText(ctx, ln.sub, M.l - 14), 0, top + (ln.agg ? 39 : 27));
        // right gutter: share of the source that has come down
        if (!app.narrow()) {
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
      if (!app.narrow()) {
        ctx.font = FONT(13, 400, 'italic'); ctx.fillStyle = C.muted; ctx.textAlign = 'left';
        ctx.fillText('share down', plotR + 14, M.t - 8);
      }
    },

    drawNotes(app) {
      const { main, state } = app, M = app.M, ctx = main.ctx;
      ctx.font = FONT(13.5, 400, 'italic'); ctx.fillStyle = C.text2; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      laneNotes.forEach((variants, li) => {
        if (!laneShown(li)) return;
        const ln = LANES[li];
        const from = ln.agg ? dateToDay('2019-06-01') : events[ln.events[0]].t;
        if (state.playhead < from) return; // a note appears once its story has happened
        // the note sits in the empty stretch before the row's first mark, ending at its launch tick
        const end = ln.agg ? app.xOf(from, main, M) : Math.min(app.xOf(families[ln.fam].launch, main, M), laneFirstX[li]);
        if (end - 8 > main.w - M.r) return; // row starts beyond the zoomed view
        const text = variants.find((t) => ctx.measureText(t).width < end - 10 - M.l - 8);
        if (text) app.haloText(ctx, text + ' —', end - 8, laneY[li] + ln.h / 2 + 0.5);
      });
    },

    // the event's symbol, repeated on each of its rows
    drawEventMark(app, e, x) {
      const ctx = app.main.ctx;
      ctx.font = FONT(14, 700);
      for (const f of e.families) {
        const li = laneIdx.get(f); if (li == null) continue;
        const y = laneY[li] + LANES[li].h / 2;
        ctx.fillStyle = C.surface; ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.2832); ctx.fill();
        ctx.fillStyle = C.text; ctx.fillText(KIND_GLYPH[e.kind], x, y + 0.5);
      }
    },
    eventHitY: (app, e, y) => e.families.some((f) => {
      const li = laneIdx.get(f); return li != null && Math.abs(laneY[li] + LANES[li].h / 2 - y) < 9;
    }),

    // the row-label gutters show a row summary; clicking a label highlights that source
    hoverAt(app, x, y) {
      if (x >= app.M.l && x <= app.main.w - app.M.r) return null;
      const li = laneAt(y); if (li < 0) return null;
      const ln = LANES[li];
      let html;
      if (ln.agg) html = `<b>${ln.label}</b><div class="row">${fmtInt(ln.n)} reentered · ${ln.sub}</div>`;
      else {
        const f = families[ln.fam];
        const ev = ln.events.map((ei) => `${KIND_GLYPH[events[ei].kind]} ${events[ei].name}, ${evDate(events[ei])}`).join('<br>');
        html = `<b>${ln.label}</b><div class="row">Launch ${f.key}${f.launch != null ? ', ' + fmtDate(f.launch) : ''}</div>
          ${ev ? `<div class="row">${ev}</div>` : ''}
          <div class="row">${fmtInt(f.n)} reentered · ${fmtInt(f.orbit)} still in orbit</div>`;
      }
      return { hover: { lane: li }, html, cursor: ln.agg ? 'crosshair' : 'pointer' };
    },
    pointerDown(app, x, y) {
      if (x >= app.M.l) return false;
      const li = laneAt(y);
      if (li >= 0 && !LANES[li].agg) app.setFamily(app.state.family === LANES[li].fam ? -1 : LANES[li].fam);
      return true;
    },
    pointTip: (i) => objectTip(db, i),
  };
}
