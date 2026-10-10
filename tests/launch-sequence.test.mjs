import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadSequence, configureSequence, sequenceAt, sequenceRange } from '../web/earth/EventSequence.js';
import { DEFAULTS, EVENT_COLORS, createPresentationStore } from '../web/PresentationConfig.js';
const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const base = '../web/data/samples/april-2018-launch/';
const timeline = json('../web/data/decays.json');
const asset = name => Promise.resolve(json(base + name));
const load = async (name = 'tracers.json', values = DEFAULTS) => {
  const sequence = await loadSequence(json(base + name), timeline, asset);
  configureSequence(sequence, values); return sequence;
};

test('sourced launch joins all twelve reentries without changing catalog chronology', async () => {
  const before = JSON.stringify(timeline), sequence = await load();
  assert.equal(sequence.events.length, 13);
  const launches = sequence.events.filter(s => s.mode === 'launch');
  assert.equal(launches.length, 1); assert.equal(launches[0].event.object.noradId, 43267);
  assert.equal(launches[0].event.eventTime.resolutionSeconds, 60);
  assert.equal(launches[0].endMs, Date.parse('2018-04-02T20:30:00Z'));
  assert.equal(sequence.events.filter(s => s.event.eventKind === 'reentry').length, 12);
  assert.equal(JSON.stringify(timeline), before);
});

test('launch starts at the pad with an illustrative ascent before its reference epoch', async () => {
  const sequence = await load('launch.json'), s = sequence.events[0];
  assert.equal(sequenceAt(sequence, s.endMs - 1)[0].sample, null);
  const early = sequenceAt(sequence, s.endMs + 600000)[0];
  assert.ok(early.pulseSample); assert.equal(early.orbitSample.stage, 'illustrative-ascent');
  const start = Date.parse(s.event.attributes.orbitReference.epochUtc);
  assert.equal(s.active.sample(start - 1).stage, 'illustrative-ascent');
  assert.equal(s.active.sample(start).stage, 'reference-orbit');
  assert.ok(s.active.sample(start + 1));
  const [from, to] = sequenceRange(sequence, DEFAULTS);
  assert.equal(from, s.endMs); assert.equal(to, s.endMs + 14400000);
  assert.equal(sequenceAt(sequence, to + 1)[0].sample, null);
});

test('forward window clipping preserves orbital phase and works below the source gap', async () => {
  const sequence = await load('launch.json'), s = sequence.events[0];
  const t = s.endMs + 3600000, initial = s.active.sample(t).head, points = JSON.stringify(s.active.orbit.points);
  configureSequence(sequence, { ...DEFAULTS, launchFollowSeconds: 7200 });
  assert.deepEqual(s.active.sample(t).head, initial);
  assert.equal(JSON.stringify(s.active.orbit.points), points);
  configureSequence(sequence, { ...DEFAULTS, launchFollowSeconds: 600 });
  assert.equal(s.active.sample(s.endMs + 300000).stage, 'illustrative-ascent');
  assert.equal(s.active.sample(s.endMs + 600001), null); assert.equal(s.pulse.sample(s.endMs + 300000).opacity, 1);
  assert.equal(s.pulse.sample(s.endMs + 600001), null);
  configureSequence(sequence, DEFAULTS);
  assert.deepEqual(s.active.sample(t).head, initial);
  sequenceAt(sequence, t + 86400000);
  assert.deepEqual(s.active.sample(t).head, initial);
});

test('one settings store updates every event and survives loading another preview', async () => {
  const store = createPresentationStore(), sequence = await load();
  store.update({ markerScale: 2, widthScale: 1, opacityTaper: 3, tracerOpacity: 0.4, pulseOpacity: 0.3 });
  configureSequence(sequence, store.values);
  for (const s of sequence.events) {
    if (s.active) {
      assert.equal(s.active.markerRadiusEarth, 0.024); assert.equal(s.active.lineWidthEarth, 0.008);
      assert.equal(s.active.opacity, 0.4); assert.equal(s.active.opacityTaper, 3);
    }
    if (s.pulse) { assert.equal(s.pulse.markerRadiusEarth, 0.024); assert.equal(s.pulse.opacity, 0.3); }
  }
  const next = await load('launch.json', store.values);
  assert.equal(next.events[0].active.markerRadiusEarth, 0.024);
  assert.equal(next.events[0].active.color, EVENT_COLORS.launch);
  assert.notEqual(EVENT_COLORS.launch, EVENT_COLORS.reentry);
});

test('launch source, geometry epoch, site and catalog joins cannot silently disagree', async () => {
  for (const edit of [
    e => { e.eventTime.intervalUtc[0] = '2018-04-03T20:30:00Z'; },
    e => { e.attributes.orbitReference.epochUtc = '2018-04-02T20:00:00Z'; },
    e => { e.attributes.launchSite.coordinates.latitudeDeg = 91; },
    e => { delete e.sources.launchReport; },
    e => { e.attributes.objectType.value = 'DEBRIS'; },
  ]) {
    const doc = json(base + 'launch.json'); edit(doc.events[0]);
    await assert.rejects(loadSequence(doc, timeline, asset));
  }
  const missing = json(base + 'tracers.json'); missing.events.splice(missing.events.findIndex(e => e.eventKind === 'reentry'), 1); missing.sample.eventCount--;
  await assert.rejects(loadSequence(missing, timeline, asset), /membership/);
});
