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
import { mountAudition } from './audio/audition.js';
import { mountSunChart } from './sunchart.js';

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

// the Sun: NOAA SWPC sunspot numbers, drawn above the monthly reentries and played as the organ
const solar = await fetch('data/solar.json').then((r) => r.json()).catch(() => null);
if (solar) mountSunChart(app, db, solar);
else document.querySelectorAll('.sun-only').forEach((el) => { el.hidden = true; });

// sound: off until the visitor turns it on (browsers only allow audio after a click)
const engine = createAudioEngine();
// the named sources get their own pitch and stereo place, biggest first (the Highlight menu's order)
const named = [...document.getElementById('family').options].map((o) => +o.value).filter((f) => f >= 0);
const sonify = mountSonification(app, db, engine, named);
const organ = solar ? mountOrgan(app, engine, solar) : null;
const organBox = document.getElementById('organ');
organBox.addEventListener('change', async () => organ?.setEnabled(organBox.checked));
const soundBtn = document.getElementById('sound');
async function setSound(on) {
  if (on) await engine.enable(); else await engine.disable();
  if (on) organ?.resume();
  soundBtn.setAttribute('aria-pressed', String(on && engine.enabled));
  soundBtn.textContent = on && engine.enabled ? '♪ Sound on' : '♪ Sound off';
  return engine.enabled;
}
soundBtn.addEventListener('click', () => setSound(soundBtn.getAttribute('aria-pressed') !== 'true'));
// auditioning a voice turns the sound on, so the switch always says what you'll hear
mountAudition(db, engine, sonify, () => engine.enabled || setSound(true));
document.getElementById('volume').addEventListener('input', (e) => engine.setVolume(+e.target.value));
// "What you hear" opens the listening key before jumping to it
document.getElementById('key-link').addEventListener('click', (e) => {
  const key = document.getElementById('listening');
  e.preventDefault();
  key.open = true;
  key.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  // a smooth scroll can stall if the page reflows on the way; finish the trip if it did
  setTimeout(() => { if (Math.abs(key.getBoundingClientRect().top) > 4) key.scrollIntoView({ block: 'start' }); }, 1200);
});
