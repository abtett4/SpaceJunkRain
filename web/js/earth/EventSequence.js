// Offline event/geometry contracts. No renderer, network credentials, or independent clock.
import { Tracer } from './Tracer.js';
import { SurfacePulse } from './SurfacePulse.js';

export function selectMode(seconds, propagatedSeconds, hasRepresentative) {
  return propagatedSeconds && seconds <= propagatedSeconds ? 'propagated'
    : hasRepresentative ? 'representative' : 'symbolic';
}

export async function loadSequence(manifest, timeline, fetchAsset) {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.events)
    || !manifest.events.length || manifest.events.length > 50) throw new Error('Unsupported event collection.');
  const ids = new Set(), eventIds = new Set();
  const events = await Promise.all(manifest.events.map(async event => {
    const nid = event.object.noradId, p = event.presentation;
    if (ids.has(nid) || eventIds.has(event.eventId)) throw new Error('Duplicate object or event in collection.');
    ids.add(nid); eventIds.add(event.eventId);
    const index = timeline.cols.id.indexOf(nid), endMs = Date.parse(p?.displayAnchorUtc);
    const timelineMs = Date.parse(timeline.meta.epoch) + timeline.cols.d[index] * 86400000;
    if (index < 0 || !Number.isFinite(endMs) || Math.abs(endMs - timelineMs) > 1 || Date.parse(p.endTime) !== endMs
      || event.eventKind !== 'reentry' || event.eventId !== `${nid}:reentry:${event.eventTime.date}`
      || event.attributes.objectType.value !== timeline.meta.types[timeline.cols.k[index]]
      || (event.eventTime.precision === 'day' ? 0 : event.eventTime.precision === 'reported-time' ? 1 : -1) !== timeline.cols.p[index]) {
      throw new Error('Event and timeline identity, class, or time disagree.');
    }
    if (!['illustrative-replay-of-propagated-orbit', 'representative-orbit', 'symbolic-event'].includes(p.mode)) {
      throw new Error('Unsupported representation mode.');
    }
    const [geometry, extraLoop] = await Promise.all([
      p.geometryAsset ? fetchAsset(p.geometryAsset) : null,
      p.representativeOrbitAsset ? fetchAsset(p.representativeOrbitAsset) : null,
    ]);
    if (p.mode === 'symbolic-event' && (geometry || extraLoop)) throw new Error('Symbolic events cannot carry orbital geometry.');
    if (p.mode !== 'symbolic-event' && !geometry) throw new Error('Required geometry is missing.');
    const loop = extraLoop ?? (p.mode === 'representative-orbit' ? geometry : null);
    const base = { startTime: p.startTime, endTime: p.endTime, objectType: event.attributes.objectType.value, ...p.style };
    const maxSeconds = p.maxDisplaySeconds ?? (endMs - Date.parse(p.startTime)) / 1000;
    if (!Number.isFinite(maxSeconds) || maxSeconds <= 0 || maxSeconds > 172800) throw new Error('Unsupported display limit.');
    const makeTracer = (g, isLoop) => {
      if (g.id !== nid || g.units !== 'km' || g.schemaVersion !== 1
        || g.frame !== (isLoop ? 'illustrative-equatorial' : 'TEME')
        || g.timeSystem !== (isLoop ? 'loop-seconds' : 'UTC')) throw new Error('Unsupported geometry identity, frame or units.');
      return new Tracer({ ...base, positions: g.trace, radiusKm: g.referenceSphereRadiusKm,
        ...(isLoop ? { loopPeriodSeconds: g.periodSeconds, maxDisplaySeconds: maxSeconds } : {}) });
    };
    if (p.mode === 'symbolic-event' && (p.surfacePulse?.basis !== 'illustrative'
      || p.surfacePulse.locationPolicy !== 'sha256-equal-area-surface-v1'
      || p.surfacePulse.timing !== 'single-pulse-ending-at-display-anchor'
      || p.surfacePulse.durationSeconds > maxSeconds)) throw new Error('Unsupported illustrative pulse policy.');
    return { event, endMs, loop, maxSeconds,
      pulse: p.mode === 'symbolic-event' ? new SurfacePulse({ ...p.surfacePulse, endTime: p.endTime, color: p.style.color }) : null,
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
      || sample.eventCount !== events.length || expected.length !== ids.size || expected.some(id => !ids.has(id))
      || events.some(s => s.endMs < start || s.endMs >= end) || sample.playbackRate !== 7200) {
      throw new Error('Sample interval, membership, or playback policy is invalid.');
    }
  }
  return { events, sample, maxSeconds: Math.max(...events.map(s => s.maxSeconds)) };
}

export function configureSequence(sequence, settings) {
  for (const s of sequence.events) {
    const seconds = Math.min(settings.reentryLeadSeconds, s.maxSeconds);
    s.mode = selectMode(seconds, s.propagated?.availableSeconds, Boolean(s.representative));
    s.active = s.mode === 'propagated' ? s.propagated : s.mode === 'representative' ? s.representative : null;
    const appearance = { visibleSeconds: seconds, markerRadiusEarth: s.event.presentation.style.markerRadiusEarth * settings.markerScale };
    if (s.active) s.active.configure({ ...appearance, trailSeconds: settings.trailSeconds, lineWidthEarth: 0.008 * settings.widthScale });
    else s.pulse.configure(appearance);
  }
}

export function sequenceRange(sequence, settings) {
  return sequence.sample ? sequence.sample.intervalUtc.map(Date.parse)
    : [sequence.events[0].endMs - settings.reentryLeadSeconds * 1000, sequence.events[0].endMs];
}

export function sequenceAt(sequence, timeMs) {
  return sequence.events.map(s => ({ state: s, sample: (s.active ?? s.pulse).sample(timeMs),
    reached: timeMs >= s.endMs }));
}
