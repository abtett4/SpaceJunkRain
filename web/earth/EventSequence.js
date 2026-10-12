// Validate offline evidence, then let the independent display policy choose visuals.
import { Tracer } from './Tracer.js';
import { referenceLoop } from './ReferenceLoop.js';
import { LaunchTracer } from './LaunchTracer.js';
import { SurfacePulse } from './SurfacePulse.js';
import { DEFAULTS } from '../PresentationConfig.js';
import { DISPLAY_LIMIT_SECONDS, displayAnchor, illustrativeLocation, resolveVisualization, eventAppearance } from '../DisplayPolicy.js';
export { selectMode } from '../DisplayPolicy.js';

const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const yieldToPage = () => globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise(resolve => {
  if (typeof MessageChannel !== 'function') return setTimeout(resolve, 0);
  const channel = new MessageChannel(); channel.port1.onmessage = () => { channel.port1.close(); resolve(); }; channel.port2.postMessage(0);
});

// Lookups into the timeline catalog, built once per catalog object: NORAD ID -> row, and the
// rounded display times for range membership (binary search when the catalog is sorted).
const timelineIndexes = new WeakMap();
function timelineIndex(timeline) {
  let index = timelineIndexes.get(timeline);
  if (!index) {
    const epoch = Date.parse(timeline.meta.epoch), d = timeline.cols.d;
    const ms = Float64Array.from(d, v => Math.round(epoch + v * 86400000));
    let sorted = true;
    for (let i = 1; i < ms.length && sorted; i++) sorted = ms[i - 1] <= ms[i];
    index = { row: new Map(timeline.cols.id.map((id, i) => [id, i])), ms, sorted };
    timelineIndexes.set(timeline, index);
  }
  return index;
}
const lowerBound = (values, x) => { let lo = 0, hi = values.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (values[mid] < x) lo = mid + 1; else hi = mid; } return lo; };
function idsBetween(timeline, start, end) {
  const { ms, sorted } = timelineIndex(timeline), ids = timeline.cols.id;
  if (!sorted) return ids.filter((id, i) => start <= ms[i] && ms[i] < end);
  return ids.slice(lowerBound(ms, start), lowerBound(ms, end));
}

export async function loadSequence(manifest, timeline, fetchAsset) {
  if (manifest.schemaVersion !== 3 || !Array.isArray(manifest.events)
    || !manifest.events.length || manifest.events.length > 50) throw new Error('Unsupported event collection; rebuild with the current exporters.');
  const ids = new Set(), eventIds = new Set(), objectKinds = new Set();
  // Preparing 50 events with orbit loops takes tens of milliseconds; give the page a turn every
  // ten events so a prefetch during playback never blocks a whole frame.
  const gates = [Promise.resolve()];
  for (let g = 1; g * 10 < manifest.events.length; g++) gates.push(gates[g - 1].then(yieldToPage));
  const events = await Promise.all(manifest.events.map(async (input, k) => {
    if (k >= 10) await gates[Math.floor(k / 10)];
    // Own an immutable copy. Rendering and settings never decorate the input records.
    const event = freeze(structuredClone(input)), nid = event.object.noradId, launch = event.eventKind === 'launch';
    if (event.schemaVersion !== 2 || event.presentation) throw new Error('Event records must contain evidence, not presentation settings.');
    // GCAT launches are launch-level records (no catalogued object), validated on their own terms.
    if (launch && event.sources?.gcat) return loadGcatLaunch(event, eventIds);
    if (eventIds.has(event.eventId) || objectKinds.has(`${nid}:${event.eventKind}`)) throw new Error('Duplicate object/event kind in collection.');
    eventIds.add(event.eventId); objectKinds.add(`${nid}:${event.eventKind}`);
    if (!launch) ids.add(nid);
    const index = timelineIndex(timeline).row.get(nid) ?? -1, endMs = displayAnchor(event);
    const timelineMs = Date.parse(timeline.meta.epoch) + timeline.cols.d[index] * 86400000;
    const [lower, upper] = event.eventTime.intervalUtc.map(Date.parse), day = Date.parse(`${event.eventTime.date}T00:00:00Z`);
    if (index < 0 || !Number.isFinite(endMs) || !Number.isFinite(day) || !Number.isFinite(lower) || !Number.isFinite(upper)
      || !['launch', 'reentry'].includes(event.eventKind) || !['day','reported-time'].includes(event.eventTime.precision)
      || event.eventId !== `${nid}:${event.eventKind}:${event.eventTime.date}`
      || endMs < day || endMs >= day+86400000 || lower < day || lower >= day+86400000 || upper < lower
      || event.eventTime.precision === 'day' && (lower !== day || upper !== day+86400000)
      || event.attributes.objectType.value !== timeline.meta.types[timeline.cols.k[index]]) {
      throw new Error('Event and timeline identity, class, or time disagree.');
    }
    if (launch) {
      const launchDay = new Date(Date.parse(timeline.meta.epoch) + timeline.cols.l[index] * 86400000).toISOString().slice(0, 10);
      if (launchDay !== event.eventTime.date || !['PAYLOAD', 'ROCKET BODY'].includes(event.attributes.objectType.value)
        || event.eventTime.precision !== 'reported-time' || event.eventTime.resolutionSeconds !== 60
        || upper-lower !== 60000 || !event.sources?.launchReport?.url) throw new Error('Launch time, source, class or catalog day disagree.');
    } else if (Math.abs(endMs-timelineMs)>1 || (event.eventTime.precision === 'day' ? 0 : 1) !== timeline.cols.p[index]) {
      throw new Error('Event and timeline time disagree.');
    }
    if (!event.orbitalData || Object.keys(event.orbitalData).some(k => !['propagated','reference','elements'].includes(k))) throw new Error('Unsupported orbital data product.');
    const products = await Promise.all(['propagated','reference'].map(async kind => {
      const product=event.orbitalData[kind];
      if (!product) return null;
      if (typeof product.asset !== 'string' || !product.asset) throw new Error('Missing geometry asset reference.');
      const g=await fetchAsset(product.asset), isLoop=kind === 'reference';
      if (g?.id !== nid || g.units !== 'km' || g.schemaVersion !== 1
        || g.frame !== (isLoop ? 'illustrative-equatorial' : 'TEME')
        || g.timeSystem !== (isLoop ? 'loop-seconds' : 'UTC')) throw new Error('Unsupported geometry identity, frame or units.');
      return g;
    }));
    const [geometry,prepared]=products;
    // Inline reference elements (GCAT) become a loop here; invalid elements leave a ring.
    const elements=event.orbitalData.elements;
    if (elements && (prepared || geometry || launch)) throw new Error('Reference elements must be the only orbital product.');
    const loop=prepared ?? (elements ? referenceLoop(elements,event.eventId,nid) : null);
    const epochMs=loop ? Date.parse(loop.referenceEpochUtc) : null;
    const orbit=event.attributes.orbitReference ?? event.attributes.orbitNearEvent;
    if (loop && (!Number.isFinite(epochMs) || epochMs !== Date.parse(orbit?.epochUtc))) throw new Error('Reference geometry epoch disagrees with source evidence.');
    const delaySeconds=launch && loop ? (epochMs-endMs)/1000 : 0;
    if (launch && (geometry || loop && (delaySeconds<0 || delaySeconds>=DISPLAY_LIMIT_SECONDS))) throw new Error('Unsupported post-launch orbital data.');
    const coordinates=launch ? event.attributes.launchSite?.coordinates : null;
    const launchSite=coordinates?.basis === 'reported' ? coordinates : null;
    if (launchSite && (!event.sources.siteCoordinates?.url || !Number.isFinite(launchSite.latitudeDeg)
      || Math.abs(launchSite.latitudeDeg)>90 || !Number.isFinite(launchSite.longitudeDeg) || Math.abs(launchSite.longitudeDeg)>180)) throw new Error('Invalid sourced launch site.');
    const sourceSeconds=geometry ? (Date.parse(geometry.trace.at(-1)[0])-Date.parse(geometry.trace[0][0]))/1000 : null;
    const maxSeconds=!launch && geometry && !loop ? sourceSeconds : DISPLAY_LIMIT_SECONDS;
    const base={ objectType:event.attributes.objectType.value, ...eventAppearance(event) };
    const makeTracer=(g,isLoop) => new Tracer({ ...base, positions:g.trace, radiusKm:g.referenceSphereRadiusKm,
      startTime:new Date(launch ? epochMs : endMs-(isLoop ? maxSeconds : sourceSeconds)*1000).toISOString(),
      endTime:new Date(launch ? endMs+maxSeconds*1000 : endMs).toISOString(),
      ...(launch ? {anchorEdge:'start'} : {}),
      ...(isLoop ? {loopPeriodSeconds:g.periodSeconds,maxDisplaySeconds:maxSeconds-delaySeconds} : {}) });
    const representative=loop ? makeTracer(loop,true) : null;
    const times={ startTime:new Date(endMs).toISOString(), endTime:new Date(endMs).toISOString(), anchorEdge:launch ? 'start':'end',
      durationSeconds:DEFAULTS.pulseSeconds, ...eventAppearance(event) };
    const pulses={ symbolic:new SurfacePulse({...illustrativeLocation(event.eventId),...times}),
      site:launchSite ? new SurfacePulse({...launchSite,...times}):null };
    const available=freeze({ reference:Boolean(loop),propagatedSeconds:sourceSeconds,launchSite:Boolean(launchSite),launchGapSeconds:delaySeconds });
    const launchTracer=launchSite && representative ? new LaunchTracer({orbit:representative,...launchSite,
      startTime:times.startTime,ascentSeconds:resolveVisualization(event,available,DEFAULTS).ascentSeconds,maxDisplaySeconds:maxSeconds,...eventAppearance(event)}):null;
    return { event,endMs,loop,maxSeconds,delaySeconds,anchorBasis:event.eventTime.precision === 'day' ? 'illustrative':'reported',
      available,
      pulses,launchTracer,propagated:geometry ? makeTracer(geometry,false):null,representative };
  }));
  events.sort((a,b)=>a.endMs-b.endMs || (a.event.object.noradId ?? 0)-(b.event.object.noradId ?? 0) || (a.event.eventId < b.event.eventId ? -1 : 1));
  const sample=manifest.sample ? freeze(structuredClone(manifest.sample)):null;
  if (events.length>1 && !sample) throw new Error('Multiple events require a bounded sample.');
  if (sample) {
    const [start,end]=sample.intervalUtc.map(Date.parse);
    // Catalog fractional days can drift below an exact split by a fraction of a millisecond.
    const expected=idsBetween(timeline,start,end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start>=end || end-start>31*86400000
      || sample.eventCount!==events.length || sample.reentryCount !== undefined && sample.reentryCount !== ids.size
      || sample.selectedLaunchCount !== undefined && sample.selectedLaunchCount !== events.length-ids.size
      || expected.length!==ids.size || expected.some(id=>!ids.has(id)) || events.some(s=>s.endMs<start || s.endMs>=end)
      || sample.playbackRate!==7200) throw new Error('Sample interval, membership, or playback policy is invalid.');
  }
  return {events,sample,maxSeconds:Math.max(...events.map(s=>s.maxSeconds))};
}

// An orbital launch attempt from GCAT: a pulse at its sourced pad (or site), no orbit drawn.
function loadGcatLaunch(event, eventIds) {
  const t = event.eventTime, [lower, upper] = t.intervalUtc.map(Date.parse), day = Date.parse(`${t.date}T00:00:00Z`);
  const endMs = displayAnchor(event), site = event.attributes.launchSite?.coordinates;
  const outcome = event.attributes.launchOutcome?.value;
  if (eventIds.has(event.eventId) || event.eventId !== `${event.object.objectId}:launch:${t.date}`
    || !['day', 'reported-time'].includes(t.precision) || !Number.isFinite(endMs) || !Number.isFinite(lower) || !Number.isFinite(upper)
    || lower < day || lower >= day + 86400000 || upper <= lower || endMs < day || endMs >= day + 86400000
    || t.precision === 'day' && (lower !== day || upper !== day + 86400000)
    || t.precision === 'reported-time' && upper - lower !== t.resolutionSeconds * 1000
    || !['success', 'failure'].includes(outcome) || !event.sources.gcat.url || Object.keys(event.orbitalData ?? {}).length
    || site?.basis !== 'reported' || !Number.isFinite(site.latitudeDeg) || Math.abs(site.latitudeDeg) > 90
    || !Number.isFinite(site.longitudeDeg) || Math.abs(site.longitudeDeg) > 180) throw new Error('Invalid GCAT launch record.');
  eventIds.add(event.eventId);
  const times = { startTime: new Date(endMs).toISOString(), endTime: new Date(endMs).toISOString(), anchorEdge: 'start',
    durationSeconds: DEFAULTS.pulseSeconds, ...eventAppearance(event) };
  return { event, endMs, loop: null, maxSeconds: DISPLAY_LIMIT_SECONDS, delaySeconds: 0,
    anchorBasis: t.precision === 'day' ? 'illustrative' : 'reported',
    available: freeze({ reference: false, propagatedSeconds: null, launchSite: true, launchGapSeconds: 0 }),
    pulses: { symbolic: null, site: new SurfacePulse({ ...site, ...times }) }, launchTracer: null, propagated: null, representative: null };
}

export function configureSequence(sequence, input, policy=resolveVisualization) {
  for (const s of sequence.events) {
    const view=policy(s.event,s.available,input);
    s.view=view; s.mode=view.mode;
    s.active=({launch:s.launchTracer,propagated:s.propagated,representative:s.representative})[view.tracer] ?? null;
    s.pulse=s.pulses[view.pulse] ?? null;
    let visibleSeconds=view.seconds;
    if (s.event.eventKind==='launch' && s.active===s.representative) {
      visibleSeconds-=s.delaySeconds;
      if (visibleSeconds<=0) s.active=null;
    }
    if (s.active) s.active.configure({...view,visibleSeconds});
    if (s.pulse) { s.pulse.color=view.color; s.pulse.configure({visibleSeconds:view.seconds,markerRadiusEarth:view.markerRadiusEarth,
      durationSeconds:view.pulseSeconds,opacity:view.pulseOpacity}); }
  }
}
export function sequenceRange(sequence,input) {
  if (sequence.sample) return sequence.sample.intervalUtc.map(Date.parse);
  const s=sequence.events[0], {seconds}=resolveVisualization(s.event,s.available,input);
  return s.event.eventKind==='launch' ? [s.endMs,s.endMs+seconds*1000] : [s.endMs-seconds*1000,s.endMs];
}
export function sequenceAt(sequence,timeMs) {
  return sequence.events.map(s=> {
    const orbitSample=s.active?.sample(timeMs) ?? null,pulseSample=s.pulse?.sample(timeMs) ?? null;
    return {state:s,sample:orbitSample ?? pulseSample,orbitSample,pulseSample,reached:timeMs>=s.endMs};
  });
}
