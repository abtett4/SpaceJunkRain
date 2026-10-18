// Space Junk Rain: every decay sits on its real day; nothing is smoothed.
// Start-up: load the data, build the chart core, register the sheets in tab order.

import { loadData } from './data.js';
import { initThemeSwitch } from './theme.js';
import { createApp } from './chart.js';
import { fillPage } from './page.js';
import { createSourceSheet } from './sheets/source.js';
import { createOrbitSheet } from './sheets/orbit.js';
import { createEarthSheet } from './sheets/earth.js';
import { createAudioEngine } from './audio/engine.js';
import { mountSonification } from './audio/sonify.js';
import { mountOrgan } from './audio/organ.js';

// canvas text needs the web font loaded first; don't wait long if it's offline
try {
  await Promise.race([
    Promise.all(['500 15px', 'italic 13px', '13px'].map((f) => document.fonts.load(`${f} "EB Garamond"`))),
    new Promise((r) => setTimeout(r, 1500)),
  ]);
} catch (e) { /* fall back to Georgia */ }

const db = await loadData();
const app = createApp(db);
fillPage(db, app.PEAK);

// sheets are numbered in the order they're added; each needs a tab with data-sheet="<id>"
app.addSheet(createSourceSheet(db));
app.addSheet(createOrbitSheet(db));
app.addSheet(createEarthSheet(db));

initThemeSwitch(document.getElementById('theme'), () => app.rebuild());
app.start('source');

// sound: off until the visitor turns it on (browsers only allow audio after a click)
const engine = createAudioEngine();
mountSonification(app, db, engine);
const organ = mountOrgan(app, engine).catch(() => null); // the Sun: NOAA SWPC sunspot numbers
const organBox = document.getElementById('organ');
organBox.addEventListener('change', async () => (await organ)?.setEnabled(organBox.checked));
const soundBtn = document.getElementById('sound');
soundBtn.addEventListener('click', async () => {
  const on = soundBtn.getAttribute('aria-pressed') !== 'true';
  if (on) await engine.enable(); else await engine.disable();
  if (on) (await organ)?.resume();
  soundBtn.setAttribute('aria-pressed', String(on && engine.enabled));
  soundBtn.textContent = on && engine.enabled ? '♪ Sound on' : '♪ Sound off';
});
document.getElementById('volume').addEventListener('input', (e) => engine.setVolume(+e.target.value));
