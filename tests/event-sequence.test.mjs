import { DEFAULTS } from '../web/PresentationConfig.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadSequence, configureSequence, sequenceAt, sequenceRange } from '../web/earth/EventSequence.js';
import { readSettings, writeSettings, SETTINGS_KEY, SAMPLE_SETTINGS_KEY } from '../web/earth/TracerControls.js';
import { SimulationClock } from '../web/SimulationClock.js';

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const timeline = json('../web/data/decays.json');
const manifest = () => json('../web/data/samples/april-2018/tracers.json');
const asset = name => Promise.resolve(json(`../web/data/samples/april-2018/${name}`));
const settings = { reentryLeadSeconds: 86400, trailSeconds: 1200, widthScale: 3, markerScale: 3 };
const load = async doc => { const s = await loadSequence(doc ?? manifest(), timeline, asset); configureSequence(s, settings); return s; };

test('all twelve events join one bounded catalog slice, with mixed coverage', async () => {
  const sequence = await load();
  assert.equal(sequence.events.length, 12);
  assert.equal(sequence.events.filter(s => s.mode === 'representative').length, 6);
  assert.equal(sequence.events.filter(s => s.mode === 'symbolic').length, 6);
  assert.deepEqual(sequenceRange(sequence, settings), ['2018-04-02T00:00:00Z','2018-04-10T00:00:00Z'].map(Date.parse));
  const before = sequence.events.map(s => s.endMs);
  configureSequence(sequence, { ...settings, reentryLeadSeconds: 7200 });
  assert.equal(sequence.events.find(s => s.event.object.noradId === 37820).mode, 'propagated');
  assert.deepEqual(sequence.events.map(s => s.endMs), before);
});

test('overlapping events and pulses are reproducible after backward seeks', async () => {
  const sequence = await load(), at = Date.parse('2018-04-06T12:00:00Z');
  const before = sequenceAt(sequence, at);
  assert.ok(before.some(s => s.sample && s.state.mode === 'symbolic'));
  assert.ok(before.some(s => s.sample && s.state.mode === 'representative'));
  sequenceAt(sequence, Date.parse('2018-04-10T00:00:00Z'));
  const after = sequenceAt(sequence, at);
  assert.deepEqual(after.map(s => [s.reached, s.sample]), before.map(s => [s.reached, s.sample]));
});

test('the passage ends without active remnants and the shared clock stops exactly', async () => {
  const sequence = await load(), [minMs, maxMs] = sequenceRange(sequence, settings);
  const clock = new SimulationClock({ minMs, maxMs, nowMs: minMs, rate: 7200, requestFrame: () => 1, cancelFrame: () => {} });
  clock.play(maxMs); clock.advance(96000);
  assert.equal(clock.nowMs, maxMs); assert.equal(clock.playing, false);
  const state = sequenceAt(sequence, clock.nowMs);
  assert.ok(state.every(s => s.reached && !s.sample));
});

test('duplicate events, omitted interval members and wrong joins are rejected', async () => {
  const duplicate = manifest(); duplicate.events.push(duplicate.events[0]);
  await assert.rejects(load(duplicate), /Duplicate/);
  const omitted = manifest(); omitted.events.pop(); omitted.sample.eventCount--;
  await assert.rejects(load(omitted), /membership/);
  const wrong = manifest(); wrong.events[0].eventTime.date = '2018-04-03';
  await assert.rejects(load(wrong), /disagree/);
});

test('missing or mislabeled geometry fails rather than showing a false fallback', async () => {
  await assert.rejects(loadSequence(manifest(), timeline, () => Promise.reject(new Error('Missing asset'))), /Missing asset/);
  await assert.rejects(loadSequence(manifest(), timeline, async name => ({ ...await asset(name), id: 99999 })), /identity/);
});

test('sample preferences have their own defaults and never replace single-event preferences', () => {
  const values = new Map(), storage = { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
  writeSettings(storage, { ...settings, reentryLeadSeconds: 7200 });
  const original = values.get(SETTINGS_KEY);
  const opts = { key: SAMPLE_SETTINGS_KEY, defaults: { reentryLeadSeconds: DEFAULTS.reentryLeadSeconds, trailSeconds: DEFAULTS.trailSeconds } };
  assert.equal(readSettings(storage, 172800, opts).reentryLeadSeconds, 14400);
  assert.equal(readSettings(storage, 172800, opts).trailSeconds, 300);
  writeSettings(storage, { ...settings, reentryLeadSeconds: 43200 }, false, SAMPLE_SETTINGS_KEY);
  assert.equal(readSettings(storage, 172800, opts).reentryLeadSeconds, 43200);
  writeSettings(storage, settings, true, SAMPLE_SETTINGS_KEY);
  assert.equal(readSettings(storage, 172800, opts).reentryLeadSeconds, 14400);
  assert.equal(readSettings(storage, 172800, opts).trailSeconds, 300);
  assert.equal(values.get(SETTINGS_KEY), original);
});
