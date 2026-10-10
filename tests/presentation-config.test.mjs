import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_KEY, CONFIG_FIELDS, DEFAULTS, createPresentationStore, normalizePresentation } from '../web/PresentationConfig.js';
const memory = initial => {
  const data = new Map(initial); return { data, getItem: key => data.get(key) ?? null, setItem: (key, v) => data.set(key, v) };
};

test('one versioned preference record migrates prior passage settings and theme', () => {
  const storage = memory([['sjr-sample-tracer-settings-v1', JSON.stringify({ version: 2, values: { reentryLeadSeconds: 3600, widthScale: 2, color: '#ffffff' } })], ['sjr-theme', 'dark']]);
  const store = createPresentationStore(storage);
  assert.equal(store.values.reentryLeadSeconds, 3600); assert.equal(store.values.widthScale, 2);
  assert.equal(store.values.theme, 'dark'); assert.equal('color' in store.values, false);
  store.update({ launchFollowSeconds: 7200, timelineNotes: false });
  assert.deepEqual(createPresentationStore(storage).values, store.values);
  assert.equal(JSON.parse(storage.getItem(CONFIG_KEY)).version, 1);
  store.reset();
  assert.deepEqual(createPresentationStore(storage).values, DEFAULTS, 'reset must not remigrate legacy values');
  assert.equal(storage.getItem('sjr-theme'), 'dark', 'unrelated legacy key is not deleted');
});

test('invalid, unsupported and blocked preferences safely retain usable controls', () => {
  for (const raw of ['{', 'null', '7', '{"version":99,"values":{"widthScale":1}}']) {
    assert.deepEqual(createPresentationStore(memory([[CONFIG_KEY, raw]])).values, DEFAULTS);
  }
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const store = createPresentationStore(blocked); store.update({ widthScale: 2 });
  assert.equal(store.values.widthScale, 2); assert.equal(store.saved, false);
  assert.equal(normalizePresentation({ theme: 'invalid', timelineNotes: 'no', earthBrightness: NaN, pulseSeconds: -1 }).pulseSeconds, 30);
  assert.equal(normalizePresentation({ launchFollowSeconds: Infinity }).launchFollowSeconds, DEFAULTS.launchFollowSeconds);
});

test('subscribers receive immutable snapshots, and future layers can extend the schema', () => {
  const fields = [...CONFIG_FIELDS, { key: 'exampleLayerIntensity', group: 'Example layer', value: 0.5, min: 0, max: 1 }];
  const store = createPresentationStore(undefined, fields), calls = [];
  const remove = store.subscribe(values => calls.push(values));
  const old = store.values; store.update({ exampleLayerIntensity: 8, widthScale: 1 });
  assert.equal(store.values.exampleLayerIntensity, 1); assert.equal(old.widthScale, 3);
  assert.throws(() => { store.values.widthScale = 3; });
  remove(); store.reset(); assert.equal(calls.length, 2);
});
