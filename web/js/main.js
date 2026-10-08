// Space Junk Rain: every decay sits on its real day; nothing is smoothed.
// Start-up: load the data, build the chart core, register the sheets in tab order.

import { loadData } from './data.js';
import { initThemeSwitch } from './theme.js';
import { createApp } from './chart.js';
import { fillPage } from './page.js';
import { createSourceSheet } from './sheets/source.js';
import { createOrbitSheet } from './sheets/orbit.js';

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

initThemeSwitch(document.getElementById('theme'), () => app.rebuild());
app.start('source');
