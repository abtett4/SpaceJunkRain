// The event strip under the globe: one tick per event in the visible range, one lane per object
// class, on a month (or day / hour) axis. Drag or click to move the shared clock; click a tick
// to jump to that event. A transparent range input over the track keeps it keyboard-operable.
import { MONTH_ABBR, shortDay } from '../DateText.js';

const HOUR = 3600e3, DAY = 24 * HOUR;
const LANE_H = 24;

// Axis divisions for [startMs, endMs]. Long ranges get month segments ({ ms, endMs, label },
// label centred in the month); short ranges get evenly stepped UTC ticks ({ ms, label }).
export function axisTicks(startMs, endMs) {
  const span = endMs - startMs, ticks = [];
  if (span > 60 * DAY) {
    const first = new Date(startMs);
    for (let y = first.getUTCFullYear(), m = first.getUTCMonth(); ; m++) {
      const a = Date.UTC(y, m, 1), b = Date.UTC(y, m + 1, 1);
      if (a >= endMs) break;
      if (b > startMs) ticks.push({ ms: Math.max(a, startMs), endMs: Math.min(b, endMs), label: MONTH_ABBR[new Date(a).getUTCMonth()] });
    }
    return ticks;
  }
  const step = [15 * 60e3, 30 * 60e3, HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY]
    .find(s => span / s <= 8) ?? 7 * DAY;
  for (let ms = Math.ceil(startMs / step) * step; ms <= endMs; ms += step) {
    const d = new Date(ms);
    ticks.push({ ms, label: step >= DAY ? shortDay(ms) : `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` });
  }
  return ticks;
}

export class EventStrip {
  // lanes: [{ key, label }]; marks: [{ ms, lane, kind: 'reentry' | 'launch' | 'failed', name }]
  constructor(root, { onSeek, onPick }) {
    Object.assign(this, { root, onSeek, onPick });
    this.startMs = 0; this.endMs = 1; this.lanes = []; this.marks = []; this.nowMs = 0;
    root.innerHTML = `
      <div class="strip-body">
        <div class="strip-labels"></div>
        <div class="strip-track">
          <canvas aria-hidden="true"></canvas>
          <div class="strip-progress"></div>
          <div class="strip-playhead"></div>
          <div class="strip-selected" hidden></div>
          <input id="orbit-scrub" type="range" min="0" max="1" step="any" value="0" aria-label="Time">
          <div class="strip-tip" hidden></div>
        </div>
      </div>
      <div class="strip-axis" aria-hidden="true"></div>`;
    const $ = s => root.querySelector(s);
    Object.assign(this, { labelsEl: $('.strip-labels'), track: $('.strip-track'), canvas: $('canvas'),
      progress: $('.strip-progress'), playhead: $('.strip-playhead'), selectedEl: $('.strip-selected'),
      input: $('input'), tip: $('.strip-tip'), axis: $('.strip-axis') });
    this.listeners = new AbortController();
    const signal = this.listeners.signal;
    const msAt = () => this.startMs + Number(this.input.value) * 1000;
    this.input.addEventListener('input', () => this.onSeek(msAt(), false), { signal });
    this.input.addEventListener('change', () => this.onSeek(msAt(), true), { signal });
    this.input.addEventListener('keydown', e => {
      const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const span = this.endMs - this.startMs, unit = span > 60 * DAY ? DAY : span / 100;
      const ms = Math.max(this.startMs, Math.min(this.endMs, this.nowMs + step * unit * (e.shiftKey ? 7 : 1)));
      this.onSeek(ms, true);
    }, { signal });
    let down = null;
    this.input.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; }, { signal });
    this.input.addEventListener('pointerup', e => {
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 4) {
        const mark = this.markAt(e);
        if (mark) this.onPick(mark);
      }
      down = null;
    }, { signal });
    this.input.addEventListener('pointermove', e => {
      const mark = this.markAt(e);
      this.tip.hidden = !mark;
      if (!mark) return;
      this.tip.textContent = `${mark.name} · ${shortDay(mark.ms)}`;
      const r = this.track.getBoundingClientRect();
      this.tip.style.left = `${Math.min(r.width - 10, Math.max(10, e.clientX - r.left))}px`;
      this.tip.style.top = `${e.clientY - r.top}px`;
    }, { signal });
    this.input.addEventListener('pointerleave', () => { this.tip.hidden = true; }, { signal });
    this.resize = new ResizeObserver(() => this.draw());
    this.resize.observe(this.track);
  }
  frac(ms) { return (ms - this.startMs) / (this.endMs - this.startMs); }
  markAt(e) {
    const r = this.track.getBoundingClientRect();
    const lane = this.lanes[Math.floor((e.clientY - r.top) / LANE_H)];
    if (!lane) return null;
    let best = null, bestDx = 6;
    for (const m of this.marks) {
      if (m.lane !== lane.key) continue;
      const dx = Math.abs(this.frac(m.ms) * r.width - (e.clientX - r.left));
      if (dx < bestDx) { best = m; bestDx = dx; }
    }
    return best;
  }
  set({ startMs, endMs, lanes, marks }) {
    Object.assign(this, { startMs, endMs, lanes, marks });
    this.input.max = String((endMs - startMs) / 1000);
    this.labelsEl.replaceChildren(...lanes.map(l => {
      const row = document.createElement('div');
      const count = marks.filter(m => m.lane === l.key).length;
      row.innerHTML = `<span></span> <span class="n"></span>`;
      row.children[0].textContent = l.label; row.children[1].textContent = count.toLocaleString();
      return row;
    }));
    this.track.style.height = `${lanes.length * LANE_H}px`;
    this.axis.replaceChildren(...axisTicks(startMs, endMs).map(t => {
      const label = document.createElement('span');
      label.textContent = t.label;
      label.style.left = `${(this.frac(t.ms) + (t.endMs ? this.frac(t.endMs) : this.frac(t.ms))) / 2 * 100}%`;
      return label;
    }));
    this.draw();
    this.setTime(this.nowMs);
  }
  setTime(nowMs) {
    this.nowMs = nowMs;
    const pct = Math.max(0, Math.min(1, this.frac(nowMs))) * 100;
    this.progress.style.width = `${pct}%`;
    this.playhead.style.left = `${pct}%`;
    this.playhead.hidden = nowMs < this.startMs || nowMs > this.endMs;
    this.input.value = String(Math.max(0, Math.min(Number(this.input.max), (nowMs - this.startMs) / 1000)));
    this.input.setAttribute('aria-valuetext', shortDay(nowMs));
  }
  setSelected(ms, laneKey) {
    const lane = this.lanes.findIndex(l => l.key === laneKey);
    this.selectedEl.hidden = ms == null || lane < 0 || ms < this.startMs || ms > this.endMs;
    if (this.selectedEl.hidden) return;
    this.selectedEl.style.left = `${this.frac(ms) * 100}%`;
    this.selectedEl.style.top = `${lane * LANE_H + LANE_H / 2}px`;
  }
  draw() {
    const w = this.track.clientWidth, h = this.lanes.length * LANE_H, dpr = Math.min(devicePixelRatio || 1, 2);
    if (!w || !h) return;
    Object.assign(this.canvas, { width: Math.round(w * dpr), height: Math.round(h * dpr) });
    this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`;
    const ctx = this.canvas.getContext('2d'), css = getComputedStyle(this.root);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = css.getPropertyValue('--grid-major').trim() || '#ccc';
    for (const t of axisTicks(this.startMs, this.endMs)) ctx.fillRect(Math.round(this.frac(t.ms) * w), 0, 1, h);
    ctx.fillStyle = css.getPropertyValue('--border').trim() || '#999';
    this.lanes.forEach((_, i) => ctx.fillRect(0, (i + 1) * LANE_H - 1, w, 1));
    const ink = { reentry: css.getPropertyValue('--event-ink').trim(), launch: css.getPropertyValue('--launch-ink').trim(), failed: css.getPropertyValue('--fail-ink').trim() };
    ctx.globalAlpha = 0.8;
    for (const m of this.marks) {
      const lane = this.lanes.findIndex(l => l.key === m.lane);
      ctx.fillStyle = ink[m.kind];
      ctx.fillRect(Math.round(this.frac(m.ms) * w) - 1, lane * LANE_H + 5, 2, LANE_H - 10);
    }
    ctx.globalAlpha = 1;
  }
  dispose() { this.listeners.abort(); this.resize.disconnect(); }
}
