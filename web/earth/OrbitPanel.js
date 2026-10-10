// One event or a bounded passage, using the timeline's existing simulation clock.
import { formatDuration } from './TracerControls.js';
import { loadSequence, configureSequence, sequenceRange, sequenceAt } from './EventSequence.js';
import { mountGeographyPanel } from './GeographyPanel.js';
export { selectMode } from './EventSequence.js';

const modeName = mode => ({ propagated: 'SGP4 replay', representative: 'Reference orbit', symbolic: 'No orbital data · pulse', launch: 'Launch · sourced site + early reference orbit' })[mode];
const dateText = ms => new Date(Math.round(ms)).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
const shortDate = ms => dateText(ms).slice(5, 16) + ' UTC';

export async function mountOrbitPanel(clock, timeline, onReplay, presentation) {
  const el = id => document.getElementById(id);
  const text = (id, value) => { if (el(id).textContent !== value) el(id).textContent = value; };
  const status = el('orbit-status'), slider = el('orbit-scrub'), replay = el('orbit-replay'), pause = el('orbit-pause');
  const picker = el('orbit-example'), objectPicker = el('orbit-object');
  let scene, unsubscribeSettings, unsubscribe, disposeGeography, sequence, settings = presentation.values, selected, revision = 0, firstLoad = true;
  let scoreButtons = [], activeSignature = '', hasStarted = false;
  const listeners = new AbortController();
  const range = () => sequenceRange(sequence, settings);
  const focus = direction => {
    scene.clearInspection();
    scene.camera.yaw = Math.atan2(direction[0], direction[2]);
    scene.camera.pitch = Math.max(-1.4, Math.min(1.4, Math.asin(-direction[1] / Math.hypot(...direction))));
  };
  const clearScene = () => { scene.tracers = []; scene.pulses = []; scene.setTime(clock.nowMs); };
  const fail = error => {
    sequence = selected = null;
    if (scene) clearScene();
    for (const id of ['symbolic-event', 'orbit-trace-key', 'sample-summary', 'sample-score', 'orbit-inspector', 'launch-key']) el(id).hidden = true;
    slider.disabled = replay.disabled = pause.disabled = true;
    status.textContent = `Orbit preview unavailable: ${error.message} The timeline is still available.`;
  };
  const inspect = () => {
    if (!selected) return;
    const { event, mode, endMs } = selected, p = event.presentation, a = event.attributes;
    const orbit = a.orbitReference ?? a.orbitNearEvent;
    const known = Number.isFinite;
    text('orbit-object-name', `${event.object.name} · NORAD ${event.object.noradId}`);
    text('orbit-object-mode', modeName(mode));
    text('orbit-anchor', `${dateText(endMs)} · ${p.anchorBasis === 'illustrative' ? 'assigned time within the reported day' : event.eventTime.resolutionSeconds === 60 ? 'reported to the minute; seconds unspecified' : 'reported timestamp'}`);
    text('orbit-attributes', `${a.objectType.value ?? 'Unknown class'} · `
      + (known(orbit?.inclinationDeg) ? `${orbit.inclinationDeg.toFixed(2)}° reference inclination · ` : 'Inclination unknown · ')
      + (known(orbit?.perigeeKm) && known(orbit?.apogeeKm) ? `${Math.round(orbit.perigeeKm)}–${Math.round(orbit.apogeeKm)} km reference perigee/apogee` : 'Orbital heights unknown')
      + ` · ${a.radarSize.value ?? 'Unknown'} radar-size proxy · catalog country ${a.catalogCountry.value ?? 'unknown'}`);
    text('orbit-evidence', (event.eventKind === 'launch' ? `Launch site: ${a.launchSite.name}. Mission: ${a.missionType.value}. ` : '') + (orbit?.epochUtc ? `Reference epoch: ${orbit.epochUtc}. ` : '')
      + (p.modeReason ?? 'Historical element descriptors are separate from the assigned event time.'));
    text('orbit-explanation', mode === 'launch'
      ? 'A pulse marks the sourced launch site. The separate orbit begins at the earliest usable record in the retrieved interval, about 25 minutes later. Its heights and inclination come from that record; direction and phase are illustrative. There is no connecting ascent trajectory.'
      : mode === 'propagated'
      ? 'Prepared SGP4 samples replay at their original rate. The assigned event time is illustrative; no reentry location is claimed.'
      : mode === 'representative'
        ? 'This repeating ellipse uses reference height and inclination. Node direction and phase are illustrative. It does not model atmospheric descent or the object’s position at reentry.'
        : 'One surface pulse, without a tracer. The random display point persists across replays and reloads. It is sampled evenly by surface area, not from a reentry probability model. The actual reentry location is unknown.');
    objectPicker.value = event.eventId;
  };
  const update = ({ nowMs, playing = clock.playing }) => {
    scene.setTime(nowMs); // Earth and future overlays follow time even without orbital data.
    if (!sequence || !settings) return;
    const [startMs, endMs] = range();
    slider.value = Math.max(0, Math.min(Number(slider.max), (nowMs - startMs) / 1000));
    slider.setAttribute('aria-valuetext', nowMs >= startMs && nowMs <= endMs ? dateText(nowMs) : 'Outside preview interval');
    text('orbit-clock', dateText(nowMs));
    pause.textContent = playing ? '❚❚ Pause' : '▶ Resume';
    const samples = sequenceAt(sequence, nowMs), active = samples.filter(s => s.sample);
    if (sequence.sample) {
      const reached = samples.filter(s => s.reached).length;
      text('sample-progress', `${active.length} active · ${reached} / ${samples.length} events reached`);
      const signature = active.map(s => s.state.event.eventId).join('|');
      if (activeSignature !== signature) {
        activeSignature = signature;
        el('sample-active').replaceChildren(...active.map(({ state: s }) => {
          const li = document.createElement('li');
          li.textContent = `${s.event.object.name} · ${s.event.eventKind} · ${s.event.attributes.objectType.value.toLowerCase()}`;
          return li;
        }));
      }
      text('sample-quiet', active.length ? '' : nowMs < startMs || nowMs > endMs ? 'Outside this passage. Choose Replay passage.' : 'A quiet interval in the catalog.');
      const next = sequence.events.find(s => s.endMs > nowMs);
      text('sample-next', nowMs >= endMs ? 'Passage complete. Replay to watch it again.' : next
        ? `Next event: ${next.event.object.name} · ${shortDate(next.endMs)}` : 'All sample events reached.');
      const progress = Math.max(0, Math.min(100, (nowMs - startMs) / (endMs - startMs) * 100));
      el('sample-score').style.setProperty('--progress', `${progress}%`);
      for (const { state: s, button } of scoreButtons) {
        const view = samples.find(v => v.state === s);
        button.classList.toggle('reached', view.reached);
        button.classList.toggle('active', Boolean(view.sample));
        button.setAttribute('aria-pressed', String(s === selected));
      }
      text('orbit-sample', 'One clock for the passage and full catalog below. The launch uses a reported minute; reentries use assigned times within reported days.');
      const pulseCount = active.filter(s => s.state.mode === 'symbolic').length;
      text('symbolic-state', `${pulseCount} pulse${pulseCount === 1 ? '' : 's'} active · no tracers for these events`);
    } else {
      const s = sequence.events[0], sample = samples[0].sample;
      text('symbolic-state', sample ? 'Pulse active · no tracer' : nowMs >= s.endMs ? 'Pulse complete' : 'Choose Replay pulse to view this event');
      text('orbit-sample', s.mode === 'launch'
        ? samples[0].orbitSample ? 'Early reference orbit active · illustrative direction and phase; no ascent path.'
          : samples[0].pulseSample ? 'Sourced launch-site pulse active · early orbit appears only after its reference epoch.'
            : 'Outside the launch display window. Choose Replay to focus the shared clock.'
        : s.mode === 'symbolic'
        ? 'No orbital data representation · persistent random display point; actual reentry location unknown.'
        : sample ? s.mode === 'propagated' ? `Orbit sample: ${dateText(sample.sourceMs)}`
          : `Illustrative repeating orbit · reference epoch ${s.loop.referenceEpochUtc} · no event-time position claim.`
          : 'Outside the selected tracer window. Choose Replay to focus the shared clock.');
    }
  };
  const applySettings = values => {
    settings = values;
    scene.configureAppearance(values);
    if (!sequence) return;
    configureSequence(sequence, values);
    scene.tracers = sequence.events.flatMap(s => s.active ? [s.active] : []);
    scene.pulses = sequence.events.flatMap(s => s.pulse ? [s.pulse] : []);
    const counts = { propagated: 0, representative: 0, symbolic: 0, launch: 0 };
    sequence.events.forEach(s => counts[s.mode]++);
    el('symbolic-event').hidden = !counts.symbolic;
    el('orbit-trace-key').hidden = !sequence.sample || !scene.tracers.length;
    el('launch-key').hidden = !counts.launch;
    status.textContent = sequence.sample
      ? `${counts.launch ? `${counts.launch} launch · ` : ''}${counts.propagated ? `${counts.propagated} SGP4 replay · ` : ''}${counts.representative} reentry reference orbits · ${counts.symbolic} no-data pulses`
      : selected.mode === 'launch' ? 'Sourced launch site · separate early reference orbit' : selected.mode === 'propagated' ? 'Last-known orbit replay · reentry location unknown'
        : selected.mode === 'representative' ? 'Representative orbit · illustrative loop, not an event-time reconstruction'
          : 'Orbital geometry unavailable in this input';
    const [startMs, endMs] = range();
    slider.max = (endMs - startMs) / 1000;
    const seconds = sequence.sample ? (endMs - startMs) / 1000 / sequence.sample.playbackRate
      : selected.mode === 'symbolic' ? (selected.endMs - selected.pulse.visibleStartMs) / 1000 / 300 : (endMs - startMs) / 1000 / 300;
    replay.textContent = `▶ Replay${sequence.sample ? ' passage' : selected.mode === 'symbolic' ? ' pulse' : ''} · ${formatDuration(seconds)}`;
    text('tracer-window-times', `${sequence.sample ? 'Passage' : 'Display window'}: ${dateText(startMs)} to ${dateText(endMs)}`);
    inspect();
    update(clock);
  };
  const jumpTo = s => {
    if (!sequence || !settings || !s) return;
    selected = s; inspect();
    const [start, end] = range();
    const target = s.mode === 'launch' ? (s.pulse.visibleStartMs + s.pulse.visibleEndMs) / 2 : s.mode === 'symbolic' ? (s.pulse.visibleStartMs + s.endMs) / 2
      : s.endMs - Math.min(settings.reentryLeadSeconds / 2, 3600) * 1000;
    clock.pause(); clock.seek(Math.max(start, Math.min(end, target)));
    if (s.pulse) focus(scene.surfaceToWorld(s.pulse.normal));
    else { const head = s.active.sample(clock.nowMs)?.head; if (head) focus(head); }
    scene.setTime(clock.nowMs);
  };
  const makeScore = () => {
    scoreButtons = [];
    const lanes = el('sample-lanes'); lanes.replaceChildren();
    const [start, end] = range();
    for (const [type, label] of [['LAUNCH', 'Launches'], ['PAYLOAD', 'Payloads'], ['ROCKET BODY', 'Rocket bodies'], ['DEBRIS', 'Debris'], ['UNKNOWN', 'Unknown']]) {
      const entries = sequence.events.filter(s => type === 'LAUNCH' ? s.event.eventKind === 'launch'
        : s.event.eventKind === 'reentry' && s.event.attributes.objectType.value === type);
      if (!entries.length) continue;
      const row = document.createElement('div'); row.className = 'sample-lane';
      const name = document.createElement('span'); name.textContent = `${label} · ${entries.length}`;
      const track = document.createElement('div'); track.className = 'sample-track';
      for (const s of entries) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'sample-event';
        button.style.left = `${(s.endMs - start) / (end - start) * 100}%`;
        button.title = `${s.event.object.name} · ${shortDate(s.endMs)} · ${s.event.presentation.anchorBasis === 'reported' ? 'reported minute' : 'assigned time'}`;
        button.setAttribute('aria-label', `Preview ${s.event.eventKind}: ${s.event.object.name}, NORAD ${s.event.object.noradId}, ${shortDate(s.endMs)}`);
        button.addEventListener('click', () => jumpTo(s));
        track.append(button); scoreButtons.push({ state: s, button });
      }
      row.append(name, track); lanes.append(row);
    }
    el('sample-dates').replaceChildren(...Array.from({length:5}, (_,i) => {
      const label = document.createElement('span'); label.textContent = new Date(start+(end-start)*i/4).toISOString().slice(5,10); return label;
    }));
  };
  const fetchJson = async url => {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Could not load ${url.pathname} (${response.status}).`);
    return response.json();
  };
  const load = async () => {
    const ticket = ++revision;
    clock.pause(); sequence = selected = null;
    clearScene(); activeSignature = ''; scoreButtons = []; hasStarted = false;
    for (const id of ['sample-score', 'sample-summary', 'orbit-inspector', 'symbolic-event', 'orbit-trace-key', 'launch-key']) el(id).hidden = true;
    el('sample-active').replaceChildren();
    slider.disabled = replay.disabled = pause.disabled = true;
    status.textContent = 'Loading preview…';
    try {
      const manifestUrl = new URL(picker.value, document.baseURI), cache = new Map();
      const manifest = await fetchJson(manifestUrl);
      const loaded = await loadSequence(manifest, timeline, name => {
        if (!cache.has(name)) cache.set(name, fetchJson(new URL(name, manifestUrl)));
        return cache.get(name);
      });
      if (ticket !== revision) return;
      sequence = loaded; selected = sequence.events[0];
      const mixed = Boolean(sequence.sample);
      for (const id of ['sample-summary', 'sample-score', 'orbit-object-choice']) el(id).hidden = !mixed;
      el('orbit-inspector').hidden = false; el('orbit-inspector').open = !mixed;
      text('orbit-title', mixed ? sequence.sample.title : 'One event, one shared clock');
      text('orbit-name', mixed ? `${sequence.events.length} events · ${sequence.sample.intervalUtc[0].slice(0,10)} to ${new Date(Date.parse(sequence.sample.intervalUtc[1])-1).toISOString().slice(0,10)} · one shared clock` : `${selected.event.object.name} · NORAD ${selected.event.object.noradId}`);
      objectPicker.replaceChildren(...sequence.events.map(s => {
        const option = document.createElement('option'); option.value = s.event.eventId;
        option.textContent = `${s.event.eventKind} · ${s.event.object.name} · ${shortDate(s.endMs)}`; return option;
      }));
      el('orbit-provenance').href = manifestUrl.href;
      if (mixed) {
        const coverage = sequence.sample.coverage;
        const plural = { PAYLOAD: 'payloads', 'ROCKET BODY': 'rocket bodies', DEBRIS: 'debris objects', UNKNOWN: 'unknown objects' };
        const types = Object.entries(sequence.sample.objectTypes).filter(([,count]) => count).map(([type,count]) => `${count} ${count === 1 ? type.toLowerCase() : plural[type]}`).join(' · ');
        text('sample-coverage', `Every catalog reentry in this interval: ${types}. ${coverage.propagatedInput+coverage.referenceInput} inputs with geometry; ${coverage.historyQueryEmpty} empty history query; ${coverage.historyNotQueried} histories not yet fetched.${sequence.sample.selectedLaunchCount ? ' Plus one selected launch: Dragon CRS-14; launch coverage is incomplete.' : ''}`);
        scene.camera.yaw = 0.8; scene.camera.pitch = 0.2;
      }
      text('tracer-window-limit', 'Shared settings apply to every preview. Up to 2 h of Tiangong-1 uses SGP4 samples; longer windows use a reference loop. Launch orbits begin at their reference epoch. All event windows are capped at 48 h; pulses fade within the chosen window.');
      slider.disabled = replay.disabled = pause.disabled = false;
      applySettings(presentation.values);
      if (mixed) makeScore();
      if (firstLoad && mixed) clock.seek(range()[0]);
      if (!mixed) jumpTo(selected);
      firstLoad = false;
      update(clock);
    } catch (error) { if (ticket === revision) fail(error); }
  };
  const replaySequence = () => {
    if (!sequence) return;
    let [startMs, endMs] = range();
    if (!sequence.sample) {
      if (selected.pulse) {
        startMs = selected.pulse.visibleStartMs;
        focus(scene.surfaceToWorld(selected.pulse.normal, (startMs + endMs) / 2));
      }
      else {
        const head = selected.active.sample(startMs)?.head;
        if (head) focus(head);
      }
    }
    hasStarted = true;
    onReplay(startMs, endMs, sequence.sample?.playbackRate ?? 300);
  };
  try {
    const { EarthScene } = await import('./EarthScene.js');
    scene = new EarthScene(el('earth-scene')); await scene.ready;
    if (scene.imageryError) text('earth-render-status', 'Earth imagery unavailable; showing a plain globe. Geographic inspection still works.');
    disposeGeography = await mountGeographyPanel(scene);
    unsubscribe = clock.subscribe(update);
    unsubscribeSettings = presentation.subscribe(applySettings);
    replay.addEventListener('click', replaySequence, { signal: listeners.signal });
    pause.addEventListener('click', () => {
      if (!sequence) return;
      if (clock.playing) clock.pause();
      else {
        const [start, end] = range();
        if (clock.nowMs < start || clock.nowMs >= end) replaySequence();
        else if (!hasStarted) { hasStarted = true; onReplay(clock.nowMs, end, sequence.sample?.playbackRate ?? 300); }
        else clock.play(end);
      }
    }, { signal: listeners.signal });
    slider.addEventListener('input', () => {
      if (!sequence) return;
      // pause() notifies every view and repaints the slider; capture user input first.
      const targetMs = range()[0] + Number(slider.value) * 1000;
      clock.pause(); clock.seek(targetMs);
    }, { signal: listeners.signal });
    objectPicker.addEventListener('change', () => {
      if (!sequence) return;
      selected = sequence.events.find(s => s.event.eventId === objectPicker.value); inspect(); update(clock);
    }, { signal: listeners.signal });
    el('orbit-jump').addEventListener('click', () => jumpTo(selected), { signal: listeners.signal });
    picker.addEventListener('change', load, { signal: listeners.signal });
    window.addEventListener('pagehide', e => {
      if (!e.persisted) { revision++; listeners.abort(); unsubscribeSettings?.(); disposeGeography?.(); unsubscribe(); scene.dispose(); }
    });
    await load();
  } catch (error) { fail(error); unsubscribeSettings?.(); disposeGeography?.(); unsubscribe?.(); scene?.dispose(); }
}
