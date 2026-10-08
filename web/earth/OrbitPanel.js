// App adapter: one selected event, shared clock, explicit representation mode.
import { mountTracerControls, formatDuration } from './TracerControls.js';
import { Tracer } from './Tracer.js';
import { SurfacePulse } from './SurfacePulse.js';

export function selectMode(seconds, propagatedSeconds, hasRepresentative) {
  return propagatedSeconds && seconds <= propagatedSeconds ? 'propagated'
    : hasRepresentative ? 'representative' : 'symbolic';
}

export async function mountOrbitPanel(clock, timeline, onReplay) {
  const el = id => document.getElementById(id);
  const status = el('orbit-status'), slider = el('orbit-scrub'), replay = el('orbit-replay');
  const picker = el('orbit-example'), symbolic = el('symbolic-event');
  const dateText = ms => new Date(Math.round(ms)).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
  let scene, controls, unsubscribe, state, active, mode, settings, revision = 0;
  const listeners = new AbortController();
  const fail = error => {
    state = active = null;
    symbolic.hidden = true;
    if (scene) { scene.tracers = []; scene.pulses = []; scene.setTime(clock.nowMs); }
    controls?.dispose();
    el('tracer-fields').disabled = slider.disabled = replay.disabled = true;
    status.textContent = `Orbit preview unavailable: ${error.message} The timeline is still available.`;
  };
  const update = ({ nowMs }) => {
    if (!state || !settings) return;
    const startMs = state.endMs - settings.reentryLeadSeconds * 1000;
    const visible = nowMs >= startMs && nowMs <= state.endMs;
    scene.setTime(nowMs);
    slider.value = Math.max(0, Math.min(Number(slider.max), (nowMs - startMs) / 1000));
    el('orbit-clock').textContent = dateText(nowMs);
    const sample = active?.sample(nowMs);
    let message = 'Outside the selected tracer window. Choose Replay to focus the shared clock.';
    if (mode === 'symbolic') {
      const lit = Boolean(state.pulse.sample(nowMs));
      el('symbolic-state').textContent = lit ? 'Pulse active · no tracer'
        : nowMs >= state.endMs ? 'Pulse complete' : 'Choose Replay pulse to view this event';
      message = 'No orbital data representation · persistent random display location; actual reentry location unknown.';
    } else if (sample) {
      message = mode === 'propagated' ? `Orbit sample: ${dateText(sample.sourceMs)}`
        : `Illustrative repeating orbit · reference epoch ${state.loop.referenceEpochUtc} · no event-time position claim.`;
    }
    el('orbit-sample').textContent = message;
    slider.setAttribute('aria-valuetext', visible ? dateText(nowMs) : 'Outside tracer interval');
  };
  const applySettings = values => {
    settings = values;
    mode = selectMode(values.reentryLeadSeconds, state.propagated?.availableSeconds, Boolean(state.representative));
    active = mode === 'propagated' ? state.propagated : mode === 'representative' ? state.representative : null;
    if (active) active.configure({ visibleSeconds: values.reentryLeadSeconds, trailSeconds: values.trailSeconds,
      lineWidthEarth: 0.008 * values.widthScale, markerRadiusEarth: state.event.presentation.style.markerRadiusEarth * values.markerScale });
    scene.tracers = active ? [active] : [];
    if (mode === 'symbolic') state.pulse.configure({ visibleSeconds: values.reentryLeadSeconds,
      markerRadiusEarth: state.event.presentation.style.markerRadiusEarth * values.markerScale });
    scene.pulses = mode === 'symbolic' ? [state.pulse] : [];
    symbolic.hidden = mode !== 'symbolic';
    if (mode === 'symbolic') symbolic.querySelector('.orbit-key-pulse').style.borderColor = state.pulse.color;
    el('tracer-history').disabled = el('tracer-width').disabled = mode === 'symbolic';
    status.textContent = mode === 'propagated' ? 'Last-known orbit replay · reentry location unknown'
      : mode === 'representative' ? 'Representative orbit · illustrative loop, not an event-time reconstruction'
      : 'Orbital geometry unavailable in this input';
    el('orbit-explanation').textContent = mode === 'propagated'
      ? 'This arc replays the prepared SGP4 samples. Its assigned event time is illustrative; no reentry location is claimed.'
      : mode === 'representative'
        ? 'This repeating ellipse uses historical reference height and inclination. Its node direction and phase are illustrative. It does not model drag, precession, atmospheric descent or the object’s position at reentry.'
        : 'One brief pulse marks the event on Earth without a tracer. Its random display point stays the same on every replay and reload. It is sampled evenly by surface area, not from a reentry probability model. The actual reentry location remains unknown.';
    slider.max = values.reentryLeadSeconds;
    const replaySeconds = mode === 'symbolic' ? (state.endMs - state.pulse.visibleStartMs) / 1000 : values.reentryLeadSeconds;
    replay.textContent = `▶ Replay${mode === 'symbolic' ? ' pulse' : ''} · ${formatDuration(replaySeconds / 300)}`;
    el('tracer-window-times').textContent = `Display window: ${dateText(state.endMs - values.reentryLeadSeconds * 1000)} to ${dateText(state.endMs)}`;
    update(clock);
  };
  const fetchJson = async url => {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Could not load ${url.pathname} (${response.status}).`);
    return response.json();
  };
  const load = async () => {
    const ticket = ++revision;
    clock.pause();
    controls?.dispose(); state = active = settings = null;
    symbolic.hidden = true;
    scene.tracers = []; scene.pulses = []; scene.setTime(clock.nowMs);
    el('tracer-fields').disabled = slider.disabled = replay.disabled = true;
    status.textContent = 'Loading preview…';
    try {
      const manifestUrl = new URL(picker.value, document.baseURI);
      const manifest = await fetchJson(manifestUrl);
      const event = manifest.events[0], p = event?.presentation;
      if (manifest.schemaVersion !== 1 || manifest.events.length !== 1 || !p) throw new Error('Unsupported single-event manifest.');
      const index = timeline.cols.id.indexOf(event.object.noradId);
      const endMs = Date.parse(p.displayAnchorUtc);
      const timelineMs = Date.parse(timeline.meta.epoch) + timeline.cols.d[index] * 86400000;
      if (index < 0 || !Number.isFinite(endMs) || Math.abs(endMs - timelineMs) > 1 || Date.parse(p.endTime) !== endMs) {
        throw new Error('Tracer and timeline event times disagree.');
      }
      const allowed = ['illustrative-replay-of-propagated-orbit', 'representative-orbit', 'symbolic-event'];
      if (!allowed.includes(p.mode)) throw new Error('Unsupported representation mode.');
      const [geometry, extraLoop] = await Promise.all([
        p.geometryAsset ? fetchJson(new URL(p.geometryAsset, manifestUrl)) : null,
        p.representativeOrbitAsset ? fetchJson(new URL(p.representativeOrbitAsset, manifestUrl)) : null,
      ]);
      if (ticket !== revision) return;
      if (p.mode === 'symbolic-event' && (geometry || extraLoop)) throw new Error('Symbolic events cannot carry orbital geometry.');
      const loop = extraLoop ?? (p.mode === 'representative-orbit' ? geometry : null);
      const base = { startTime: p.startTime, endTime: p.endTime, objectType: event.attributes.objectType.value, ...p.style };
      const maxSeconds = p.maxDisplaySeconds ?? (endMs - Date.parse(p.startTime)) / 1000;
      if (!Number.isFinite(maxSeconds) || maxSeconds <= 0 || maxSeconds > 172800) throw new Error('Unsupported display limit.');
      const makeTracer = (g, isLoop) => {
        if (g.id !== event.object.noradId || g.units !== 'km' || g.schemaVersion !== 1
          || g.frame !== (isLoop ? 'illustrative-equatorial' : 'TEME')
          || g.timeSystem !== (isLoop ? 'loop-seconds' : 'UTC')) throw new Error('Unsupported geometry identity, frame or units.');
        return new Tracer({ ...base, positions: g.trace, radiusKm: g.referenceSphereRadiusKm,
          ...(isLoop ? { loopPeriodSeconds: g.periodSeconds, maxDisplaySeconds: maxSeconds } : {}) });
      };
      if (p.mode !== 'symbolic-event' && !geometry) throw new Error('Required geometry is missing.');
      if (p.mode === 'symbolic-event' && (p.surfacePulse?.basis !== 'illustrative'
        || p.surfacePulse.locationPolicy !== 'sha256-equal-area-surface-v1'
        || p.surfacePulse.timing !== 'single-pulse-ending-at-display-anchor'
        || p.surfacePulse.durationSeconds > maxSeconds)) throw new Error('Unsupported illustrative pulse policy.');
      state = { event, endMs, loop,
        pulse: p.mode === 'symbolic-event' ? new SurfacePulse({ ...p.surfacePulse, endTime: p.endTime, color: p.style.color }) : null,
        propagated: p.mode === 'illustrative-replay-of-propagated-orbit' ? makeTracer(geometry, false) : null,
        representative: loop ? makeTracer(loop, true) : null };
      if (state.pulse) focus(state.pulse.normal);
      const a = event.attributes, orbit = a.orbitReference ?? a.orbitNearEvent;
      const known = n => Number.isFinite(n);
      el('orbit-name').textContent = `${event.object.name} · NORAD ${event.object.noradId}`;
      el('orbit-anchor').textContent = `${dateText(endMs)} · ${p.anchorBasis === 'illustrative' ? 'assigned display time within the reported day' : 'reported timestamp'}`;
      el('orbit-attributes').textContent = `${a.objectType.value ?? 'Unknown class'} · `
        + (known(orbit?.inclinationDeg) ? `${orbit.inclinationDeg.toFixed(2)}° reference inclination · ` : 'Inclination unknown · ')
        + (known(orbit?.perigeeKm) && known(orbit?.apogeeKm) ? `${Math.round(orbit.perigeeKm)}–${Math.round(orbit.apogeeKm)} km reference perigee/apogee` : 'Orbital heights unknown')
        + ` · ${a.radarSize.value ?? 'Unknown'} radar-size proxy · catalog country ${a.catalogCountry.value ?? 'unknown'}`;
      el('orbit-evidence').textContent = (orbit?.epochUtc ? `Reference epoch: ${orbit.epochUtc}. ` : '')
        + (p.modeReason ?? 'Historical element descriptors are separate from the assigned event time.');
      el('orbit-provenance').href = manifestUrl.href;
      el('tracer-window-limit').textContent = state.propagated
        ? 'Up to 2 h uses the original prepared samples. Longer windows switch to an illustrative representative loop; maximum 48 h.'
        : loop ? 'Up to 48 h repeats reference geometry; the old elements are not propagated across the gap to reentry.'
          : `One pulse during the final ${formatDuration(state.pulse.durationSeconds)} before the event anchor (${formatDuration(state.pulse.durationSeconds / 300)} at Replay speed). A shorter window clips it; a longer one adds context without repeating it. This is display timing, not reentry duration.`;
      slider.disabled = replay.disabled = false;
      controls = mountTracerControls(maxSeconds, applySettings);
    } catch (error) { if (ticket === revision) fail(error); }
  };
  const focus = direction => {
    scene.camera.yaw = Math.atan2(direction[0], direction[2]);
    scene.camera.pitch = Math.max(-1.4, Math.min(1.4, Math.asin(-direction[1] / Math.hypot(...direction))));
  };
  try {
    const { EarthScene } = await import('./EarthScene.js');
    scene = new EarthScene(el('earth-scene')); await scene.ready;
    unsubscribe = clock.subscribe(update);
    replay.addEventListener('click', () => {
      if (!state) return;
      const startMs = mode === 'symbolic' ? state.pulse.visibleStartMs : state.endMs - settings.reentryLeadSeconds * 1000;
      if (active) {
        const head = active.sample(startMs).head, next = active.sample(Math.min(state.endMs, startMs + 30000)).head;
        const normal = [head[1]*next[2]-head[2]*next[1], head[2]*next[0]-head[0]*next[2], head[0]*next[1]-head[1]*next[0]];
        const length = Math.hypot(...normal);
        const direction = head.map((v, i) => v / Math.hypot(...head) + (length ? 0.6 * normal[i] / length : 0));
        focus(direction);
      } else if (state.pulse) focus(state.pulse.normal);
      onReplay(startMs, state.endMs);
    }, { signal: listeners.signal });
    slider.addEventListener('input', () => {
      if (!state) return;
      const target = state.endMs - settings.reentryLeadSeconds * 1000 + Number(slider.value) * 1000;
      clock.pause(); clock.seek(target);
    }, { signal: listeners.signal });
    picker.addEventListener('change', load, { signal: listeners.signal });
    window.addEventListener('pagehide', e => {
      if (!e.persisted) { revision++; listeners.abort(); controls?.dispose(); unsubscribe(); scene.dispose(); }
    });
    await load();
  } catch (error) { fail(error); unsubscribe?.(); scene?.dispose(); }
}
