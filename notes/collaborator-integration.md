# Shared clock and orbital event feed — 2026-10-10

The launch/reentry preview now supplies a small integration interface, without adding
sound synthesis or solar data. The original collaborator owns orbital sound; the new
collaborator owns solar-weather visualization and sound. Tyler owns the orbital evidence,
Earth, launch/reentry visuals, geographic inspection and these shared interfaces.

## What is available

`mountOrbitPanel()` resolves to an experience object after preparing Earth. `web/app.js`
keeps that promise as `experienceReady`, so Earth preparation does not block the existing
timeline. Add collaborator imports and mount calls at that commented integration point.
No globals, second simulation timer, credentials, or browser orbital propagation are needed.

| Interface | Purpose |
| --- | --- |
| `experience.clock` | Existing SimulationClock: UTC milliseconds, rate, play/pause/seek, state subscription. |
| `experience.events.subscribeCrossings(fn)` | Discrete launch/reentry batches reached during forward playback. Returns unsubscribe. |
| `experience.events.subscribeState(fn)` | Immediate immutable snapshot, then clock/collection changes; use to cancel queued sounds on seek, pause or collection replacement. Returns unsubscribe. |
| `experience.settings` | Existing shared settings store; immutable snapshots, subscribe/update/reset. |
| `experience.earth.addLayer(layer)` | Existing Earth layer hook; receives shared time/transforms/settings each draw, returns removal/disposal function. |

`OrbitalEventFeed.js` owns no timer and contains no rendering, audio or style choices.
The preview adapter replaces its collection only after validating all event records and
required geometry. Starting another load clears it immediately. The feed currently covers
**only the selected preview**, not the complete historical catalog. Failed preview loads
leave an empty feed rather than publishing stale events from the preceding collection.

## Crossing contract

A batch contains `reason`, `previousMs`, `nowMs`, `rate`, `playing`, `revision`,
`traversal`, `collection`, `eventCount`, and an immutable `events` array. Each array entry
is `{ event, displayTimeMs }`: the unchanged evidence record plus a separate display anchor.
For date-only reentries that anchor is a stable assigned time, not an observed instant.
Minute-resolution launch times still retain their original support interval in `eventTime`.
Never infer additional precision from `displayTimeMs`.

- Normal advances report anchors in `(previousMs, nowMs]`, sorted by timestamp then ID.
  A single fast frame may contain several events; none are discarded or merged.
- A seek is silent, clears the playback readout, and starts a new traversal. Seeking
  directly onto an anchor arms it for the next play or positive forward advance.
- Play at an armed exact anchor emits that event once. This handles a launch whose
  preview begins at liftoff. The zero-duration first animation frame cannot duplicate it.
- Pause/resume and speed changes do not reset that boundary or repeat an event.
  Changing appearance or camera settings does not interact with the feed at all.
- Replay uses the existing seek/play controls. It intentionally permits the same events
  to be emitted again on the new traversal. It does not rewrite or randomize evidence.
- The stopping endpoint is included even when the final advance reports `playing:false`.
  Do not throw away that final batch merely because playback has just finished.
- Collection replacement increments `revision` and clears pending history. Queued work
  must be discarded when its revision or traversal no longer matches current state.
- No events are delivered retroactively to a new crossing subscriber. State subscribers
  receive the current snapshot immediately. Disposal/unsubscribe detaches listeners.
- Subscriber errors are reported and isolated so another contributor cannot stop the
  clock or other subscribers. Adapters must not use crossings to seek/restart the clock.

The feed pre-sorts records and binary-searches each advancing interval. A synthetic
20,000-event test verifies complete delivery across dense crossings; this is not a claim
that the full 3D renderer is ready for that many simultaneously loaded trajectories.
Geometry loading and scene membership still use the bounded, at-most-50-event preview.

## Orbital audio adapter example

This is a contract example, not a sound implementation. `voiceBank` belongs to the audio
collaborator. It must be unlocked by a deliberate user gesture; nothing here autoplays audio.

```js
function mountOrbitalAudio({ events, settings }, voiceBank) {
  const offState = events.subscribeState(state => {
    if (['seek', 'pause', 'collection'].includes(state.reason)) voiceBank.cancelAll();
  });
  const offSettings = settings.subscribe(values => voiceBank.configure(values));
  const offEvents = events.subscribeCrossings(batch => {
    if (!voiceBank.enabled) return;
    for (const { event, displayTimeMs } of batch.events) {
      voiceBank.trigger(event, { displayTimeMs, rate: batch.rate,
        revision: batch.revision, traversal: batch.traversal });
    }
  });
  return () => { offEvents(); offState(); offSettings(); voiceBank.cancelAll(); };
}
```

This feed reports events at simulation-frame resolution, not sample-accurate Web Audio
scheduling. The audio collaborator should choose voice limits, chords and look-ahead
scheduling if needed. Audio triggers come from the feed, never from drawing, visibility,
hover, pulse opacity or an active-tracer list; an occluded object can still have an event.
Keep sound controls in the shared configuration schema when they are introduced.

## Solar-weather adapter example

The solar layer samples its preloaded series at `frame.timeMs`, using the transforms and
settings already supplied by Earth. Its temporal variation is continuous and independent
of whether an orbital event is crossing. Missing values must remain distinct from zero.

```js
experienceReady.then(experience => {
  if (!experience) return; // Earth initialization may fail; timeline still works.
  const removeSolarLayer = experience.earth.addLayer(solarLayer);
  const disposeOrbitalAudio = mountOrbitalAudio(experience, voiceBank);
  window.addEventListener('pagehide', event => {
    if (!event.persisted) { disposeOrbitalAudio(); removeSolarLayer(); }
  });
});
```

`solarLayer` and `voiceBank` are collaborator-supplied adapters, not bundled placeholders.
An adapter must tolerate backward seeks, restore graphics state, avoid its own simulation
clock and return/implement disposal. See [Earth's layer contract](earth-renderer.md#future-solar-weather-attachment)
for frame fields and rendering limits. A solar audio adapter can use the same event-state
subscription for transport changes while deriving its intensity from solar data.

## Visible verification and next bounded milestone

Open **Events reached during playback** below the globe. It shows the latest five
crossings and a count for the current traversal. Scrubbing or selecting another preview
clears the readout silently. The default eight-day passage produces 13 entries total:
12 catalog reentries plus the selected Dragon launch. A single launch replay includes its
start-boundary event. Sound remains disabled until the collaborator's real adapter is added.

Tests cover endpoints, ties, large time jumps, pause/resume, speed changes, forward/backward
seeks, replay, collection replacement, source immutability, subscriber failure and disposal.
The next orbital milestone is bounded historical loading: produce an index of time chunks,
load only the relevant geometry, and profile a larger mixed passage before expanding to
full history. That work should preserve this feed and the event/visualization separation.
