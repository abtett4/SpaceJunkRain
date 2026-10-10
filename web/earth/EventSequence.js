// Offline event/geometry contracts. No renderer, network credentials, or independent clock.
import { Tracer } from './Tracer.js';
import { SurfacePulse } from './SurfacePulse.js';
import { DEFAULTS, STYLE, eventAppearance } from '../PresentationConfig.js';

export function selectMode(seconds, propagatedSeconds, hasRepresentative) {
  return propagatedSeconds && seconds <= propagatedSeconds ? 'propagated'
    : hasRepresentative ? 'representative' : 'symbolic';
}

export async function loadSequence(manifest, timeline, fetchAsset) {
  if (![1, 2].includes(manifest.schemaVersion) || !Array.isArray(manifest.events)
    || !manifest.events.length || manifest.events.length > 50) throw new Error('Unsupported event collection.');
  const ids = new Set(), eventIds = new Set(), objectKinds = new Set();
  const events = await Promise.all(manifest.events.map(async event => {
    const nid = event.object.noradId, p = event.presentation;
    const launch = event.eventKind === 'launch';
    if (eventIds.has(event.eventId) || objectKinds.has(`${nid}:${event.eventKind}`)) throw new Error('Duplicate object/event kind in collection.');
    eventIds.add(event.eventId); objectKinds.add(`${nid}:${event.eventKind}`);
    if (!launch) ids.add(nid);
    const index = timeline.cols.id.indexOf(nid), endMs = Date.parse(p?.displayAnchorUtc);
    const timelineMs = Date.parse(timeline.meta.epoch) + timeline.cols.d[index] * 86400000;
    if (index < 0 || !Number.isFinite(endMs) || !['launch', 'reentry'].includes(event.eventKind)
      || event.eventId !== `${nid}:${event.eventKind}:${event.eventTime.date}`
      || event.attributes.objectType.value !== timeline.meta.types[timeline.cols.k[index]]) {
      throw new Error('Event and timeline identity, class, or time disagree.');
    }
    if (launch) {
      const launchDay = new Date(Date.parse(timeline.meta.epoch) + timeline.cols.l[index] * 86400000).toISOString().slice(0, 10);
      const [lower, upper] = event.eventTime.intervalUtc.map(Date.parse);
      if (manifest.schemaVersion !== 2 || launchDay !== event.eventTime.date || new Date(endMs).toISOString().slice(0, 10) !== launchDay
        || !['PAYLOAD', 'ROCKET BODY'].includes(event.attributes.objectType.value)
        || event.eventTime.precision !== 'reported-time' || event.eventTime.resolutionSeconds !== 60
        || p.anchorBasis !== 'reported' || lower !== endMs || upper - lower !== 60000
        || Date.parse(p.startTime) !== endMs || p.mode !== 'launch-reference-orbit'
        || !event.sources?.launchReport?.url || !event.sources?.siteCoordinates?.url) {
        throw new Error('Launch time, source, class or catalog day disagree.');
      }
    } else if (Math.abs(endMs - timelineMs) > 1 || Date.parse(p.endTime) !== endMs
      || (event.eventTime.precision === 'day' ? 0 : event.eventTime.precision === 'reported-time' ? 1 : -1) !== timeline.cols.p[index]) {
      throw new Error('Event and timeline time disagree.');
    }
    if ((!launch && p.mode === 'launch-reference-orbit')
      || !['illustrative-replay-of-propagated-orbit', 'representative-orbit', 'symbolic-event', 'launch-reference-orbit'].includes(p.mode)) {
      throw new Error('Unsupported representation mode.');
    }
    const [geometry, extraLoop] = await Promise.all([
      p.geometryAsset ? fetchAsset(p.geometryAsset) : null,
      p.representativeOrbitAsset ? fetchAsset(p.representativeOrbitAsset) : null,
    ]);
    if (p.mode === 'symbolic-event' && (geometry || extraLoop)) throw new Error('Symbolic events cannot carry orbital geometry.');
    if (p.mode !== 'symbolic-event' && !geometry) throw new Error('Required geometry is missing.');
    const loop = extraLoop ?? (['representative-orbit', 'launch-reference-orbit'].includes(p.mode) ? geometry : null);
    const base = { startTime: p.startTime, endTime: p.endTime, objectType: event.attributes.objectType.value, ...eventAppearance(event) };
    const maxSeconds = p.maxDisplaySeconds ?? (endMs - Date.parse(p.startTime)) / 1000;
    if (!Number.isFinite(maxSeconds) || maxSeconds <= 0 || maxSeconds > 172800) throw new Error('Unsupported display limit.');
    const orbitStartMs = launch ? Date.parse(p.orbitStartTime) : null;
    const delaySeconds = launch ? (orbitStartMs - endMs) / 1000 : 0;
    if (launch && (!Number.isFinite(delaySeconds) || delaySeconds < 0 || delaySeconds >= maxSeconds
      || Date.parse(p.endTime) !== endMs + maxSeconds * 1000
      || Date.parse(loop.referenceEpochUtc) !== orbitStartMs
      || extraLoop || p.surfacePulse?.basis !== 'reported'
      || p.surfacePulse.locationPolicy !== 'sourced-launch-site-v1'
      || p.surfacePulse.timing !== 'single-pulse-starting-at-display-anchor'
      || p.surfacePulse.latitudeDeg !== event.attributes.launchSite.coordinates.latitudeDeg
      || p.surfacePulse.longitudeDeg !== event.attributes.launchSite.coordinates.longitudeDeg)) throw new Error('Unsupported sourced launch representation.');
    const makeTracer = (g, isLoop) => {
      if (g.id !== nid || g.units !== 'km' || g.schemaVersion !== 1
        || g.frame !== (isLoop ? 'illustrative-equatorial' : 'TEME')
        || g.timeSystem !== (isLoop ? 'loop-seconds' : 'UTC')) throw new Error('Unsupported geometry identity, frame or units.');
      return new Tracer({ ...base, positions: g.trace, radiusKm: g.referenceSphereRadiusKm,
        ...(launch ? { startTime: p.orbitStartTime, anchorEdge: 'start' } : {}),
        ...(isLoop ? { loopPeriodSeconds: g.periodSeconds, maxDisplaySeconds: maxSeconds - delaySeconds } : {}) });
    };
    if (p.mode === 'symbolic-event' && (p.surfacePulse?.basis !== 'illustrative'
      || p.surfacePulse.locationPolicy !== 'sha256-equal-area-surface-v1'
      || p.surfacePulse.timing !== 'single-pulse-ending-at-display-anchor'
      || p.surfacePulse.durationSeconds > maxSeconds)) throw new Error('Unsupported illustrative pulse policy.');
    return { event, endMs, loop, maxSeconds, delaySeconds,
      pulse: p.mode === 'symbolic-event' || launch ? new SurfacePulse({ ...p.surfacePulse,
        startTime: p.startTime, endTime: p.endTime, anchorEdge: launch ? 'start' : 'end', ...eventAppearance(event) }) : null,
      propagated: p.mode === 'illustrative-replay-of-propagated-orbit' ? makeTracer(geometry, false) : null,
      representative: loop ? makeTracer(loop, true) : null };
  }));
  events.sort((a, b) => a.endMs - b.endMs || a.event.object.noradId - b.event.object.noradId);
  const sample = manifest.sample ?? null;
  if (events.length > 1 && !sample) throw new Error('Multiple events require a bounded sample.');
  if (sample) {
    const [start, end] = sample.intervalUtc.map(Date.parse);
    const expected = timeline.cols.id.filter((id, i) => {
      const t = Date.parse(timeline.meta.epoch) + timeline.cols.d[i] * 86400000;
      return start <= t && t < end;
    });
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 31 * 86400000
      || sample.eventCount !== events.length
      || (manifest.schemaVersion === 2 && (sample.reentryCount !== ids.size || sample.selectedLaunchCount !== events.length - ids.size))
      || expected.length !== ids.size || expected.some(id => !ids.has(id))
      || events.some(s => s.endMs < start || s.endMs >= end) || sample.playbackRate !== 7200) {
      throw new Error('Sample interval, membership, or playback policy is invalid.');
    }
  }
  return { events, sample, maxSeconds: Math.max(...events.map(s => s.maxSeconds)) };
}

export function configureSequence(sequence, input) {
  const settings = { ...DEFAULTS, ...input };
  for (const s of sequence.events) {
    const launch = s.event.eventKind === 'launch';
    const seconds = Math.min(launch ? settings.launchFollowSeconds : settings.reentryLeadSeconds, s.maxSeconds);
    s.mode = launch ? 'launch' : selectMode(seconds, s.propagated?.availableSeconds, Boolean(s.representative));
    s.active = launch ? (seconds > s.delaySeconds ? s.representative : null)
      : s.mode === 'propagated' ? s.propagated : s.mode === 'representative' ? s.representative : null;
    const appearance = { visibleSeconds: seconds, markerRadiusEarth: STYLE.markerRadiusEarth * settings.markerScale };
    if (s.active) s.active.configure({ ...appearance, visibleSeconds: seconds - s.delaySeconds,
      trailSeconds: settings.trailSeconds, lineWidthEarth: STYLE.lineWidthEarth * settings.widthScale,
      opacity: settings.tracerOpacity, widthTaper: settings.widthTaper, opacityTaper: settings.opacityTaper });
    if (s.pulse) s.pulse.configure({ ...appearance, durationSeconds: Math.min(settings.pulseSeconds, seconds), opacity: settings.pulseOpacity });
  }
}

export function sequenceRange(sequence, input) {
  if (sequence.sample) return sequence.sample.intervalUtc.map(Date.parse);
  const settings = { ...DEFAULTS, ...input }, s = sequence.events[0];
  return s.event.eventKind === 'launch'
    ? [s.endMs, s.endMs + Math.min(settings.launchFollowSeconds, s.maxSeconds) * 1000]
    : [s.endMs - Math.min(settings.reentryLeadSeconds, s.maxSeconds) * 1000, s.endMs];
}

export function sequenceAt(sequence, timeMs) {
  return sequence.events.map(s => {
    const orbitSample = s.active?.sample(timeMs) ?? null, pulseSample = s.pulse?.sample(timeMs) ?? null;
    return { state: s, sample: orbitSample ?? pulseSample, orbitSample, pulseSample, reached: timeMs >= s.endMs };
  });
}
