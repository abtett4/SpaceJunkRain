import { skipFocusDirection } from './SkipFocus.js';
import { validateHistoryIndex, loadHistoryChunk } from './HistoryChunks.js';
// The orbital view: the globe, the event strip and the shared Play, all on the timeline's clock.
import { loadSequence, configureSequence, sequenceRange, sequenceAt } from './EventSequence.js';
import { OrbitalEventFeed } from '../OrbitalEventFeed.js';
import { mountEventPlaybackLog } from '../EventPlaybackLog.js';
import { DEFAULT_PLAYBACK_RATE } from '../PresentationConfig.js';
import { EventStrip } from './EventStrip.js';
import { clockParts, longDate, shortDay, MONTH_ABBR } from '../DateText.js';
export { selectMode } from './EventSequence.js';

// Above one simulated day per second, months can't load fast enough; the globe waits and
// only the charts animate.
export const GLOBE_MAX_RATE = 86400;
const HISTORY = 'data/history/all/index.json';
const EPOCH_MS = Date.UTC(1957, 0, 1), DAY_MS = 86400000;
const LANES = [['LAUNCH', 'Launches'], ['PAYLOAD', 'Payloads'], ['ROCKET BODY', 'Rocket bodies'], ['DEBRIS', 'Debris'], ['UNKNOWN', 'Unknown']];
const laneOf = s => s.event.eventKind === 'launch' ? 'LAUNCH' : s.event.attributes.objectType.value ?? 'UNKNOWN';
const capital = t => t[0].toUpperCase() + t.slice(1);
const isFailedLaunch = s => s.event.attributes.launchOutcome?.value === 'failure';
const kindText = s => {
  const a = s.event.attributes;
  if (s.event.eventKind === 'launch') return `${isFailedLaunch(s) ? 'Failed launch' : 'Launch'}${a.launchVehicle?.value ? ` · ${a.launchVehicle.value}` : a.launchSite?.name ? ` · ${a.launchSite.name}` : ''}`;
  return `${capital((a.objectType.value ?? 'unknown object').toLowerCase())} reentry`;
};
const shownAs = s => {
  const orbit = s.event.attributes.orbitReference ?? s.event.attributes.orbitNearEvent, known = Number.isFinite;
  const site = s.event.attributes.launchSite;
  const at = site?.coordinates?.precision === 'site' ? 'launch site' : 'launch pad';
  const how = { propagated: 'Last known orbit, replayed', representative: 'Reference orbit, illustrative path', symbolic: 'Ring · no orbital data',
    launch: s.launchTracer ? 'Illustrative ascent from the launch pad' : `Ring at the ${at}${site?.place ? ` · ${site.place}` : ''}` }[s.mode];
  const facts = known(orbit?.inclinationDeg) && known(orbit?.perigeeKm) && known(orbit?.apogeeKm)
    ? ` · ${orbit.inclinationDeg.toFixed(1)}°, ${Math.round(orbit.perigeeKm)}–${Math.round(orbit.apogeeKm)} km` : '';
  // GCAT orbits are often operational, years before reentry; say when it was recorded.
  const when = s.mode === 'representative' && orbit?.source === 'gcat' && orbit.epochUtc ? `, recorded ${MONTH_ABBR[new Date(orbit.epochUtc).getUTCMonth()]} ${orbit.epochUtc.slice(0, 4)}` : '';
  return how + facts + when;
};
// Mass, length and owner, from GCAT where it has them: '8,500 kg · 10.4 m long · China · PLA GAD'.
const objectFacts = s => {
  const a = s.event.attributes, size = a.physicalSize?.value ?? {};
  return [size.massKg && `${Math.round(size.massKg).toLocaleString()} kg`, size.lengthM && `${size.lengthM} m long`,
    a.ownerCountry?.value, a.owner?.value !== a.ownerCountry?.value && a.owner?.value].filter(Boolean).join(' · ');
};

export async function mountOrbitPanel(clock, timeline, onReplay, presentation) {
  const el = id => document.getElementById(id);
  const text = (id, value) => { if (el(id).textContent !== value) el(id).textContent = value; };
  const events = new OrbitalEventFeed(clock);
  const disposeEventLog = mountEventPlaybackLog(el('event-playback-log'), events);
  const status = el('orbit-status'), pause = el('orbit-pause'), picker = el('orbit-example');
  let historyIndex = null, chunkId = null, loadController = null, provenanceUrl = null;
  let prefetched = null, transitioning = false, continuationStart = null;
  const PASSAGE_RATE = DEFAULT_PLAYBACK_RATE;
  let scene, unsubscribeSettings, unsubscribe, sequence, settings = presentation.values, selected = null, pinned = null, revision = 0;
  let nowSignature = '', hasStarted = false, failed = false, stripYear = null;
  const listeners = new AbortController();
  const tooFast = () => clock.rate > GLOBE_MAX_RATE;
  const playRate = () => tooFast() ? PASSAGE_RATE : clock.rate;
  const historical = () => picker.value === HISTORY;
  const range = () => {
    const [start,end] = sequenceRange(sequence,settings);
    return [Math.max(continuationStart ?? start,clock.minMs),Math.min(end,clock.maxMs)];
  };

  // ---- catalog reentries for the event strip (decays.json is sorted by display time) ----
  const catMs = Float64Array.from(timeline.cols.d, d => EPOCH_MS + d * DAY_MS);
  const lowerBound = ms => { let lo = 0, hi = catMs.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (catMs[mid] < ms) lo = mid + 1; else hi = mid; } return lo; };
  const catalogMarks = (startMs, endMs) => {
    const marks = [];
    for (let i = lowerBound(startMs), end = lowerBound(endMs); i < end; i++) marks.push({ ms: catMs[i], lane: timeline.meta.types[timeline.cols.k[i]],
      kind: 'reentry', name: timeline.names[timeline.cols.nm[i]], norad: timeline.cols.id[i] });
    return marks;
  };
  // Every orbital launch attempt (GCAT), for the strip's launch lane.
  let launchIndex = null;
  const launchesReady = fetch(new URL('data/launches.json', document.baseURI), { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : null).then(index => {
      if (!index) return;
      launchIndex = { ms: Float64Array.from(index.cols.t, t => EPOCH_MS + t * 1000), ...index };
      const src = launchIndex.source;
      text('src-launch-count', launchIndex.count.toLocaleString());
      text('src-launch-failed', launchIndex.failures.toLocaleString());
      text('src-gcat-date', src.updated?.replace(/^Updated\s+/, '').replace(/\s+\S+$/, '') ?? src.retrievedAt.slice(0, 10));
    }).catch(() => {});
  const launchMarks = (startMs, endMs) => {
    if (!launchIndex) return [];
    const marks = [];
    launchIndex.ms.forEach((ms, i) => { if (ms >= startMs && ms < endMs) marks.push({ ms, lane: 'LAUNCH',
      kind: launchIndex.cols.ok[i] ? 'launch' : 'failed', name: launchIndex.cols.name[i] + (launchIndex.cols.ok[i] ? '' : ' (failed)'), tag: launchIndex.cols.tag[i] }); });
    return marks;
  };
  const stripRange = () => {
    if (!historical()) return range();
    const year = stripYear;
    return [Math.max(Date.UTC(year, 0, 1), clock.minMs), Math.min(Date.UTC(year + 1, 0, 1), clock.maxMs)];
  };
  const refreshStrip = () => {
    const [startMs, endMs] = stripRange();
    const launches = historical() ? launchMarks(startMs, endMs)
      : (sequence?.events ?? []).filter(s => s.event.eventKind === 'launch' && s.endMs >= startMs && s.endMs <= endMs)
        .map(s => ({ ms: s.endMs, lane: 'LAUNCH', kind: isFailedLaunch(s) ? 'failed' : 'launch', name: s.event.object.name, state: s }));
    const marks = [...launches, ...catalogMarks(startMs, endMs)];
    // A fixed set of lanes keeps the strip the same height from year to year.
    strip.set({ startMs, endMs, lanes: LANES.map(([key, label]) => ({ key, label })), marks });
    const reentries = marks.length - launches.length, fails = launches.filter(m => m.kind === 'failed').length;
    const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
    text('strip-summary', historical()
      ? `${plural(reentries, 'reentry', 'reentries')} · ${plural(launches.length, 'launch', 'launches')}${fails ? ` (${fails} failed)` : ''} in ${stripYear}`
      : shortDay(startMs) === shortDay(endMs) ? longDate(startMs) : `${shortDay(startMs)} to ${longDate(endMs)}`);
  };

  const focus = direction => {
    scene.clearInspection();
    scene.camera.yaw = Math.atan2(direction[0], direction[2]);
    scene.camera.pitch = Math.max(-1.4, Math.min(1.4, Math.asin(-direction[1] / Math.hypot(...direction))));
  };
  const clearScene = () => { scene.tracers = []; scene.pulses = []; scene.setTime(clock.nowMs); };
  const fail = error => {
    sequence = selected = pinned = null;
    events.replace([]);
    clock.setPlaybackWindows(null);
    if (scene) clearScene();
    el('event-card').hidden = true;
    el('now-list').replaceChildren();
    failed = true;
    status.textContent = `The globe is unavailable: ${error.message} The charts below still work.`;
  };

  // ---- the selected-event card: what it is, when, and how it is drawn ----
  const showCard = (s, label) => {
    el('event-card').hidden = !s;
    if (!s) return;
    text('sel-label', label);
    text('sel-name', s.event.object.name);
    text('sel-kind', kindText(s));
    const { time } = clockParts(s.endMs);
    text('sel-date', `${longDate(s.endMs)} · ${time}`);
    text('sel-time-note', s.anchorBasis === 'illustrative' ? 'Day reported; time of day assigned for display'
      : s.event.eventTime.source === 'gcat' && s.event.eventKind === 'reentry' ? 'Time of day from GCAT' : '');
    text('sel-shown', shownAs(s));
    text('sel-facts', objectFacts(s));
    text('sel-source', `${s.event.object.noradId ? `NORAD ${s.event.object.noradId}` : `GCAT ${s.event.object.objectId}`} · source data`);
  };
  const renderNow = (samples, nowMs) => {
    const active = samples.filter(v => v.sample).map(v => v.state);
    const signature = active.map(s => s.event.eventId).join('|');
    if (signature !== nowSignature) {
      nowSignature = signature;
      const shown = active.slice(0, 6).map(s => {
        const li = document.createElement('li'), button = document.createElement('button');
        button.type = 'button';
        button.innerHTML = '<span class="now-name"></span><span class="now-kind"></span>';
        button.children[0].textContent = s.event.object.name;
        button.children[1].textContent = kindText(s).replace(/ reentry$/, '');
        button.className = `${s.event.eventKind}${isFailedLaunch(s) ? ' failed' : ''}`;
        button.addEventListener('click', () => jumpTo(s));
        li.append(button); return li;
      });
      if (active.length > 6) { const li = document.createElement('li'); li.className = 'now-more'; li.textContent = `and ${active.length - 6} more`; shown.push(li); }
      el('now-list').replaceChildren(...shown);
    }
    const next = sequence.events.find(s => s.endMs > nowMs && !active.includes(s));
    const nextText = next ? `${active.length ? 'Next' : 'Quiet. Next'}: |${next.event.object.name}|, ${clockParts(next.endMs).day}`
      : active.length ? '' : 'Nothing more this month.';
    if (el('now-next').dataset.text !== nextText) {
      el('now-next').dataset.text = nextText;
      const [before, name = '', after = ''] = nextText.split('|'), span = document.createElement('span');
      span.className = 'now-name'; span.textContent = name;
      el('now-next').replaceChildren(before, ...(name ? [span, after] : []));
    }
    const auto = active[0] ?? next ?? sequence.events.at(-1);
    selected = pinned ?? auto;
    showCard(selected, pinned ? 'Selected' : active.includes(selected) ? 'In progress' : 'Next up');
    strip.setSelected(selected.endMs, laneOf(selected));
  };
  const update = ({ nowMs, playing = clock.playing }) => {
    if (tooFast() && playing) return; // The globe waits; the strip and charts keep moving.
    scene.setTime(nowMs); // Earth and future overlays follow time even without orbital data.
    if (!sequence || !settings) return;
    const [start, end] = range();
    if (historical() && (nowMs < start || nowMs > end) && !transitioning) {
      // The charts or the strip moved the clock past the loaded month; don't describe it.
      selected = null; nowSignature = '';
      el('now-list').replaceChildren(); el('event-card').hidden = true; strip.setSelected(null);
      el('now-next').replaceChildren('Press Play to show this date on the globe.'); delete el('now-next').dataset.text;
      return;
    }
    renderNow(sequenceAt(sequence, nowMs), nowMs);
  };
  const applySettings = values => {
    settings = values;
    scene.configureAppearance(values);
    if (!sequence) return;
    configureSequence(sequence, values);
    scene.tracers = sequence.events.flatMap(s => s.active ? [s.active] : []);
    scene.pulses = sequence.events.flatMap(s => s.pulse ? [s.pulse] : []);
    const [startMs, endMs] = range();
    clock.setPlaybackWindows(values.skipQuietIntervals ? sequence.events.flatMap(s => [
      [s.endMs,s.endMs],
      ...(s.active ? [[s.active.startMs,s.active.endMs]] : []),
      ...(s.pulse ? [[s.pulse.visibleStartMs,s.pulse.visibleEndMs]] : [])
    ]) : null, [startMs,endMs]);
    text('quiet-playback-note', values.skipQuietIntervals ? 'Quiet intervals are skipped: playback jumps between event windows.' : 'Quiet intervals are included: playback preserves elapsed historical time.');
    if (!historical()) refreshStrip();
    update(clock);
  };
  const jumpTo = s => {
    if (!sequence || !settings || !s) return;
    pinned = selected = s;
    const [start, end] = range();
    const target = s.mode === 'launch' ? s.endMs + Math.min((s.launchTracer?.ascentMs ?? 600000) / 2, s.view.seconds * 1000 / 2) : s.mode === 'symbolic' ? (s.pulse.visibleStartMs + s.endMs) / 2
      : s.endMs - Math.min(settings.reentryLeadSeconds / 2, 3600) * 1000;
    clock.pause(); clock.seek(Math.max(start, Math.min(end, target)));
    if (s.pulse) focus(scene.surfaceToWorld(s.pulse.normal));
    else { const head = s.active?.sample(clock.nowMs)?.head; if (head) focus(head); }
    scene.setTime(clock.nowMs);
    update(clock);
  };

  // ---- loading: the full catalog one month (passage) at a time, or one fixed example ----
  const fetchText = async (url, signal) => {
    const response = await fetch(url, { cache: 'no-cache', signal });
    if (!response.ok) throw new Error(`Could not load ${url.pathname} (${response.status}).`);
    return response.text();
  };
  const fetchJson = async (url, signal) => JSON.parse(await fetchText(url, signal));
  const chunkIndex = () => historyIndex ? historyIndex.chunks.findIndex(c => c.id === chunkId) : -1;
  const nextChunk = () => historyIndex?.chunks[chunkIndex() + 1];
  // The passage containing ms, or the first one after it (quiet months have no passage).
  const chunkAt = ms => historyIndex.chunks.find(c => Date.parse(c.intervalUtc[1]) > ms) ?? historyIndex.chunks.at(-1);
  const years = () => [...new Set(historyIndex.chunks.map(c => c.id.slice(0, 4)))];
  const showYear = () => {
    const year = String(stripYear), list = years(), i = list.indexOf(year);
    el('year-select').value = year;
    el('year-prev').disabled = i <= 0;
    el('year-next').disabled = i >= list.length - 1;
  };
  const prepareHistory = async (chunk, signal) => {
    const indexUrl = new URL(HISTORY, document.baseURI);
    const manifest = await loadHistoryChunk(chunk,indexUrl,async url=>{
      const response=await fetch(url,{cache:'no-cache',signal});
      if (!response.ok) throw new Error(`Could not load historical passage (${response.status}).`);
      return response.arrayBuffer();
    });
    const manifestUrl=new URL(chunk.asset,indexUrl), cache=new Map();
    const loaded=await loadSequence(manifest,timeline,name=>{
      if (!cache.has(name)) cache.set(name,fetchJson(new URL(name,manifestUrl),signal));
      return cache.get(name);
    });
    return {manifest,manifestUrl,loaded};
  };
  const prefetchNext = () => {
    const next=nextChunk();
    if (!next || Date.parse(next.intervalUtc[0])>=clock.maxMs) { prefetched=null; return; }
    const controller=new AbortController();
    const promise=prepareHistory(next,controller.signal);
    promise.catch(()=>{}); // Surface a failure only if/when this passage is needed.
    prefetched={id:next.id,controller,promise};
  };
  const load = async (options = {}) => {
    const automatic = options.automatic === true;
    const ready = automatic ? prefetched : null;
    if (!automatic) { prefetched?.controller.abort(); transitioning=false; continuationStart=null; }
    prefetched=null;
    const ticket = ++revision;
    if (provenanceUrl) { URL.revokeObjectURL(provenanceUrl); provenanceUrl=null; }
    loadController?.abort();
    const controller = loadController = new AbortController();
    if (ready) controller.signal.addEventListener('abort',()=>ready.controller.abort(),{once:true});
    const isHistory = historical();
    failed = false;
    if (!automatic) {
      clock.pause(); sequence = selected = pinned = null;
      events.replace([]); clock.setPlaybackWindows(null); clearScene();
      el('event-card').hidden = true; el('now-list').replaceChildren(); el('now-next').replaceChildren(); delete el('now-next').dataset.text;
    }
    nowSignature = ''; hasStarted = false;
    if (!automatic) status.textContent = 'Loading…';
    try {
      let manifestUrl = new URL(picker.value, document.baseURI);
      const cache = new Map();
      let manifest, loaded;
      if (isHistory) {
        if (!historyIndex) {
          const index = validateHistoryIndex(await fetchJson(manifestUrl, controller.signal));
          if (ticket !== revision) return;
          historyIndex = index;
          text('history-coverage', `Coverage: ${index.reentryCount.toLocaleString()} catalog reentries from ${index.chunks[0].id.slice(0,4)} to ${index.chunks.at(-1).id.slice(0,4)}, plus one curated launch. Limited to the supplied catalog snapshot; launch coverage is not complete.`);
          el('year-select').replaceChildren(...years().map(year=>{
            const option=document.createElement('option');option.value=year;option.textContent=year;return option;
          }));
          chunkId ??= index.defaultChunk;
        }
        const chunk = historyIndex.chunks.find(c => c.id === chunkId);
        if (!chunk) throw new Error('Choose an indexed historical passage.');
        const prepared=await (ready?.id===chunk.id ? ready.promise : prepareHistory(chunk,controller.signal));
        ({manifest,manifestUrl,loaded}=prepared);
      } else {
        manifest=await fetchJson(manifestUrl,controller.signal);
        loaded=await loadSequence(manifest,timeline,name=>{
          if (!cache.has(name)) cache.set(name,fetchJson(new URL(name,manifestUrl),controller.signal));
          return cache.get(name);
        });
      }
      if (ticket !== revision) return;
      if (automatic) continuationStart=clock.nowMs;
      sequence = loaded;
      events.replace(sequence.events.map(s => ({ event: s.event, displayTimeMs: s.endMs })),
        { id: sequence.sample?.id ?? sequence.events[0].event.eventId, title: sequence.sample?.title ?? sequence.events[0].event.object.name }, {continuation:automatic});
      const mixed = Boolean(sequence.sample);
      el('strip-head').classList.toggle('example', !isHistory);
      text('orbit-title', isHistory ? 'Every reentry, on the globe' : mixed ? sequence.sample.title : sequence.events[0].event.object.name);
      text('orbit-name', isHistory ? 'Press Play to watch each object come down on its reentry day.' : 'An example from “Other examples” below. Choose “Every reentry” there to return.');
      if (isHistory) { provenanceUrl=URL.createObjectURL(new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'})); stripYear = Number(chunkId.slice(0, 4)); showYear(); }
      el('sel-source').href = provenanceUrl ?? manifestUrl.href;
      if (mixed) {
        const coverage = sequence.sample.coverage;
        const plural = { PAYLOAD: 'payloads', 'ROCKET BODY': 'rocket bodies', DEBRIS: 'debris objects', UNKNOWN: 'unknown objects' };
        const types = Object.entries(sequence.sample.objectTypes).filter(([,count]) => count).map(([type,count]) => `${count} ${count === 1 ? type.toLowerCase() : plural[type]}`).join(', ');
        text('sample-coverage', `Loaded now: ${types}. ${coverage.propagatedInput+coverage.referenceInput} with orbital data; ${coverage.historyQueryEmpty} with an empty history query; ${coverage.historyNotQueried} with history not yet fetched.`);
        if (!automatic && options.seekMs == null) { scene.camera.yaw = 0.8; scene.camera.pitch = 0.2; }
      } else text('sample-coverage', '');
      text('tracer-window-limit', 'Settings apply everywhere. Up to 2 h of Tiangong-1 uses SGP4 samples; longer windows use a reference loop. All event windows are capped at 48 h; rings fade within the chosen window.');
      status.textContent = '';
      applySettings(presentation.values);
      if (!automatic && mixed) clock.seek(Math.max(range()[0], Math.min(range()[1], options.seekMs ?? range()[0])));
      if (!mixed) jumpTo(sequence.events[0]);
      refreshStrip();
      update(clock);
      if (isHistory) prefetchNext();
      if (automatic) { transitioning=false; hasStarted=true; clock.play(range()[1]); }
    } catch (error) { if (ticket === revision) { transitioning=false; fail(error); } }
  };
  const loadAt = async ms => { chunkId = chunkAt(ms).id; await load({ seekMs: ms }); };
  const replaySequence = () => {
    if (!sequence) return;
    continuationStart=null; applySettings(presentation.values);
    let [startMs, endMs] = range();
    if (!sequence.sample) {
      const s = sequence.events[0];
      if (s.pulse) {
        startMs = s.pulse.visibleStartMs;
        focus(scene.surfaceToWorld(s.pulse.normal, (startMs + endMs) / 2));
      }
      else {
        const head = s.active.sample(startMs)?.head;
        if (head) focus(head);
      }
    }
    hasStarted = true;
    onReplay(startMs, endMs, playRate());
  };
  // Charts-only playback: year-scale speeds, or no orbital preview at all.
  const playTimeline = () => {
    if (clock.nowMs >= clock.maxMs) clock.seek(clock.minMs);
    clock.play(clock.maxMs);
  };
  const play = async () => {
    if (clock.playing || transitioning) { clock.pause(); return; }
    if (failed || tooFast()) { playTimeline(); return; }
    if (!sequence) return;
    pinned = null;
    const [start, end] = range();
    if (clock.nowMs >= start && clock.nowMs < end) {
      if (!hasStarted) { hasStarted = true; onReplay(clock.nowMs, end, playRate()); } else clock.play(end);
    } else if (historical() && historyIndex && clock.nowMs < clock.maxMs) {
      // The clock is outside the loaded month: continue from the month at that time.
      const resumeMs = clock.nowMs;
      await loadAt(resumeMs);
      if (!sequence) return;
      const [from, to] = range();
      hasStarted = true; onReplay(Math.max(from, Math.min(to, resumeMs)), to, playRate());
    } else replaySequence();
  };

  // ---- controls that work even before (or without) the globe ----
  const strip = new EventStrip(el('event-strip'), {
    onSeek: (ms, final) => {
      clock.pause(); clock.seek(ms);
      if (final && historical() && historyIndex && sequence && (ms < range()[0] || ms >= range()[1])) loadAt(ms);
    },
    onPick: async mark => {
      if (mark.state) { jumpTo(mark.state); return; }
      const find = () => sequence?.events.find(s => mark.tag ? s.event.eventKind === 'launch' && s.event.object.launchFamily === mark.tag
        : s.event.eventKind === 'reentry' && s.event.object.noradId === mark.norad);
      if (!find() && historical() && historyIndex) await loadAt(mark.ms);
      const s = find();
      if (s) jumpTo(s); else { clock.pause(); clock.seek(mark.ms); }
    },
  });
  const showPlayState = ({ playing }) => {
    pause.textContent = playing || transitioning ? '❚❚ Pause' : '▶ Play';
  };
  showPlayState(clock);
  const unsubscribePlayState = clock.subscribe(state => {
    showPlayState(state);
    const year = new Date(state.nowMs).getUTCFullYear();
    if (historical() && historyIndex && stripYear !== null && year !== stripYear && !transitioning) { stripYear = year; refreshStrip(); showYear(); }
    strip.setTime(state.nowMs);
    el('globe-speed-note').hidden = !tooFast();
    if (state.reason === 'rate' && sequence && settings && scene) applySettings(settings);
  });
  pause.addEventListener('click', play, { signal: listeners.signal });
  // Skip quiet intervals: a shared setting, surfaced in the playback bar.
  const skip = el('skip-quiet');
  const unsubscribeSkip = presentation.subscribe(values => { skip.checked = values.skipQuietIntervals; });
  skip.addEventListener('change', () => presentation.update({ skipQuietIntervals: skip.checked }), { signal: listeners.signal });
  // Now | Appearance tabs beside the globe, so appearance changes are visible as they are made.
  const tabs = [['tab-now', 'panel-now'], ['tab-appearance', 'panel-appearance']];
  const showTab = id => tabs.forEach(([tab, panel]) => {
    const on = tab === id;
    el(tab).setAttribute('aria-selected', String(on)); el(tab).tabIndex = on ? 0 : -1; el(panel).hidden = !on;
  });
  for (const [tab] of tabs) {
    el(tab).addEventListener('click', () => showTab(tab), { signal: listeners.signal });
    el(tab).addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const other = tabs.find(([t]) => t !== tab)[0]; showTab(other); el(other).focus();
    }, { signal: listeners.signal });
  }
  const goYear = year => {
    if (!historyIndex || !historical()) return;
    chunkId = historyIndex.chunks.find(c => c.id.startsWith(year)).id; load();
  };
  el('year-select').addEventListener('change', e => goYear(e.target.value), { signal: listeners.signal });
  for (const [id, step] of [['year-prev', -1], ['year-next', 1]]) el(id).addEventListener('click', () => {
    if (!historyIndex) return;
    const list = years(), year = list[list.indexOf(String(stripYear)) + step];
    if (year) goYear(year);
  }, { signal: listeners.signal });

  try {
    const { EarthScene } = await import('./EarthScene.js');
    scene = new EarthScene(el('earth-scene')); await scene.ready;
    if (scene.imageryError) text('earth-render-status', 'Earth imagery unavailable; showing a plain globe.');
    unsubscribe = clock.subscribe(state => {
      if (sequence && settings.skipQuietIntervals && state.reason === 'advance' && Number.isFinite(state.skippedToMs)) {
        const direction = skipFocusDirection(sequence,state.skippedToMs,state.nowMs);
        if (direction) {
          scene.clearInspection();
          // Quiet skips reframe longitude only; preserve the user's viewing latitude.
          scene.camera.yaw = Math.atan2(direction[0], direction[2]);
        }
      }
      update(state);
      if (transitioning && ['pause','seek'].includes(state.reason)) {
        transitioning=false; revision++; loadController?.abort(); showPlayState(clock);
        if (sequence?.sample && historyIndex) { chunkId = sequence.sample.id; }
      }
      if (state.reason==='advance' && !state.playing && sequence && state.nowMs===range()[1] && clock.untilMs===range()[1]
        && historical() && !transitioning) {
        const next=nextChunk();
        if (!next || Date.parse(next.intervalUtc[0])>=clock.maxMs) return;
        transitioning=true; showPlayState(clock);
        queueMicrotask(()=>{
          if (!transitioning) return;
          chunkId = next.id;
          load({automatic:true});
        });
      }
    });
    unsubscribeSettings = presentation.subscribe(applySettings);
    picker.addEventListener('change', () => load(), { signal: listeners.signal });
    window.addEventListener('pagehide', e => {
      if (!e.persisted) { revision++; if (provenanceUrl) URL.revokeObjectURL(provenanceUrl); loadController?.abort(); prefetched?.controller.abort(); listeners.abort(); unsubscribePlayState(); unsubscribeSkip(); strip.dispose(); disposeEventLog(); events.dispose(); clock.setPlaybackWindows(null); unsubscribeSettings?.(); unsubscribe(); scene.dispose(); }
    });
    await launchesReady;
    await load();
    // Integration seam: collaborators receive the same clock, evidence feed, settings, and Earth host.
    return Object.freeze({ clock, events, settings: presentation,
      earth: Object.freeze({ addLayer: layer => scene.addLayer(layer) }) });
  } catch (error) { fail(error); disposeEventLog(); events.dispose(); clock.setPlaybackWindows(null); unsubscribeSettings?.(); unsubscribe?.(); scene?.dispose(); }
}
