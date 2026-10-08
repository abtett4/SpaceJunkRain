// Sheet 3, "Earth view": sample reentries replayed as orbital tracers around a globe, on the
// same clock as the timeline. The panel and everything under js/earth/ are Tyler Griffith's;
// this file only plugs it into the sheet interface. See notes/orbital-tracers.md.

const DEFAULT_SEC_PER_YEAR = 3.1470588; // the Speed menu's default, the 2019 piece's tempo

export function createEarthSheet(db) {
  let mounted = null; // the panel loads p5 and its sample data the first time the sheet opens

  return {
    id: 'earth',
    title: 'In orbit, on the same clock',
    caption: () => 'Sample reentries replayed around a globe, in step with the timeline: scrub or play either ' +
      'and both move. Each tracer is one of three kinds, depending on how much is known about the object: a replay ' +
      'computed (SGP4) from its last recorded orbit, a reference orbit with its historical shape and tilt, or, ' +
      'where no orbit is on record, a pulse at an illustrative spot. None of them claims to show where or how it ' +
      'came down. The monthly chart below follows the same clock. Built by Tyler Griffith.',
    canvas: false, // the panel replaces the main chart; the monthly chart stays below

    frame: () => ({ M: { l: 64, r: 16, t: 34, b: 26 }, height: null }),
    layout(app) { app.hiddenPt.fill(1); },
    colorOf: () => 'transparent',
    radius: () => 0,
    pointTip: () => '',

    // Leaving mid-replay keeps the shared clock running, so the other sheets follow the passage.
    // Otherwise put the clock back to today, at the timeline's usual speed, so sheets 1 and 2
    // don't open on the sample's April 2018.
    leave(app) {
      if (app.state.playing) return;
      app.state.secPerYear = DEFAULT_SEC_PER_YEAR;
      document.getElementById('speed').value = String(DEFAULT_SEC_PER_YEAR);
      app.clock.seek(app.clock.maxMs);
    },

    enter(app) {
      if (mounted) return;
      mounted = import('../earth/OrbitPanel.js').then(({ mountOrbitPanel }) =>
        mountOrbitPanel(app.clock, { meta: db.meta, cols: db.cols }, app.replay));
    },
  };
}
