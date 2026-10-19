// Sheet 3, "Earth view": every reentry and orbital launch attempt on a globe, on the same clock as
// the timeline. The panel and everything under js/earth/ are Tyler Griffith's; this file plugs it
// into the sheet interface. See notes/orbital-tracers.md and notes/earth-view.md.

import { createPresentationStore, DEFAULT_PLAYBACK_RATE } from '../PresentationConfig.js';
import { YEAR } from '../util.js';

// Collaborator integration point: resolves to the panel's experience object (clock, events,
// settings, earth.addLayer) once the Earth view has been opened. See notes/collaborator-integration.md.
let resolveExperience;
export const earthExperience = new Promise((resolve) => { resolveExperience = resolve; });

const DEFAULT_SEC_PER_YEAR = 3; // the Speed menu's default (was 3.147, the 2019 piece's tempo)
const EARTH_SEC_PER_YEAR = YEAR * 86400 / DEFAULT_PLAYBACK_RATE; // 3 simulated hours per second

export function createEarthSheet(db) {
  let mounted = null; // the panel loads p5 and its data the first time the sheet opens
  const hooks = {};   // the panel fills in hooks.play: passage-aware play/pause

  return {
    id: 'earth',
    title: 'Every reentry and launch, on the globe',
    caption: () => 'Each reentry comes down on its reported day and each orbital launch attempt lifts off from its ' +
      'pad, in step with the timeline: Animate, scrub or use the strip under the globe and both move. ' +
      'Amber traces follow a reference orbit with the object’s recorded height and tilt; rings mark objects with no ' +
      'recorded orbit; cyan arcs are launches, small red rings failed ones. Positions on an orbit, ring spots and ' +
      'ascent paths are illustrative; “About this view” below the globe says exactly what is known. ' +
      'Launch data: GCAT (J. McDowell). Built by Tyler Griffith.',
    canvas: false, // the panel replaces the main chart; the monthly chart stays below

    frame: () => ({ M: { l: 64, r: 16, t: 34, b: 26 }, height: null }),
    layout(app) { app.hiddenPt.fill(1); },
    colorOf: () => 'transparent',
    radius: () => 0,
    pointTip: () => '',

    // Animate on this sheet plays month by month on the globe (falls back to the timeline
    // while the panel is still loading).
    play() { if (!hooks.play) return false; hooks.play(); return true; },

    // Leaving mid-replay keeps the shared clock running, so the other sheets follow the passage.
    // Otherwise put the clock back to today, at the timeline's usual speed, so sheets 1 and 2
    // don't open on the globe's month.
    leave(app) {
      document.querySelector('.chart-card')?.classList.remove('earth-active');
      if (app.state.playing) return;
      app.state.secPerYear = DEFAULT_SEC_PER_YEAR;
      document.getElementById('speed').value = String(DEFAULT_SEC_PER_YEAR);
      app.clock.seek(app.clock.maxMs);
    },

    enter(app) {
      document.querySelector('.chart-card')?.classList.add('earth-active');
      // The globe follows hour-scale speeds; start there unless something is already playing.
      if (!app.state.playing && app.state.secPerYear < 100) {
        app.state.secPerYear = EARTH_SEC_PER_YEAR;
        document.getElementById('speed').value = String(EARTH_SEC_PER_YEAR);
      }
      if (mounted) { if (!app.state.playing) hooks.resume?.(); return; }
      let storage;
      try { storage = window.localStorage; } catch { /* settings last for this visit only */ }
      mounted = import('../earth/OrbitPanel.js').then(({ mountOrbitPanel }) =>
        mountOrbitPanel(app.clock, db, app.replay, createPresentationStore(storage), hooks))
        .then((experience) => { if (experience) resolveExperience(experience); return experience; });
    },
  };
}
