// The listening key: what each sound stands for, with a button to hear it on its own.
// Events by kind (the 2019 categories), object sizes and types, the rain, a few example sources,
// and every named source behind one more fold. Add ?tune to the address to open it all and show
// each source's numbers (Hz, brightness, attack) for tuning by ear.

import { KIND_GLYPH, KIND_WORD, TYPE_LABELS, yearOf, pretty } from '../util.js';

const NOTE_NAMES = ['A', 'B♭', 'B', 'C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭'];
const noteName = (hz) => {
  const n = Math.round(12 * Math.log2(hz / 440)) + 48; // semitones above A0
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor((n + 9) / 12)}`;
};
const side = (pan) => (Math.abs(pan) < 0.1 ? 'centre' : `${Math.round(Math.abs(pan) * 100)}% ${pan < 0 ? 'left' : 'right'}`);
// examples that show the range: the biggest source, the two ASAT tests that shaped the
// catalogue, and the one accidental collision's two sides
const EXAMPLES = ['1982-092', '1999-025', '1997-051', '1993-036'];
const VOICE_WORDS = ['a bright blip', 'a heavy growl', 'a soft bell'];

export function mountAudition(db, engine, sonify, ensureSound) {
  const body = document.getElementById('audition-body');
  if (!body) return;
  const tune = new URLSearchParams(location.search).has('tune');
  const { N, F, K, events, families } = db;

  // each family's commonest object type sets its timbre and register, as in the timeline
  const typeOf = new Map();
  {
    const counts = new Map();
    for (let i = 0; i < N; i++) {
      const c = counts.get(F[i]) || counts.set(F[i], [0, 0, 0, 0]).get(F[i]);
      c[K[i]]++;
    }
    for (const [f, c] of counts) typeOf.set(f, c.indexOf(Math.max(...c)));
  }

  const play = async (fn) => { if (await ensureSound()) fn(); };
  const button = (html, title, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.innerHTML = html; b.title = title;
    b.addEventListener('click', () => play(fn));
    return b;
  };
  const group = (heading, note, parent = body) => {
    const g = document.createElement('div'); g.className = 'aud-group';
    g.innerHTML = `${heading ? `<p class="aud-h">${heading}</p>` : ''}${note ? `<p class="aud-note">${note}</p>` : ''}`;
    const row = document.createElement('div'); row.className = 'aud-row'; g.appendChild(row);
    parent.appendChild(g);
    return row;
  };

  body.insertAdjacentHTML('beforeend', `<p class="aud-intro">Every reentry is a short falling note on the day it came down.
    <b>Pitch and stereo place</b> tell you which source it came from; <b>timbre</b> what it is
    (debris ${VOICE_WORDS[0]}, a rocket body ${VOICE_WORDS[1]}, a satellite ${VOICE_WORDS[2]});
    <b>loudness</b> its radar size and how many from one source came down that day. Moments too
    crowded for separate notes fall as <b>rain</b>. Underneath, the <b>Sun organ</b> rises and
    brightens with the sunspot cycle. Each button plays one sound on its own.</p>`);

  // collisions and breakups, with the events that use each sound
  const ev = group('Collisions and breakups', 'The symbols on the chart, each with its own sound.');
  for (const kind of Object.keys(KIND_GLYPH)) {
    const ex = events.filter((e) => e.kind === kind);
    const eg = ex.slice(0, 2).map((e) => `${e.name} (${yearOf(e.t)})`).join('; ');
    ev.appendChild(button(`${KIND_GLYPH[kind]} ${KIND_WORD[kind]} <span class="n">· ${ex.length}</span>`,
      eg ? `e.g. ${eg}` : '', () => engine.collision(engine.now + 0.02, kind)));
  }

  // what it is, how big it was, and the rain
  const ty = group('What came down', 'One note for each object type, on one pitch.');
  TYPE_LABELS.slice(0, 3).forEach((label, k) => ty.appendChild(button(label, VOICE_WORDS[k], () =>
    engine.note(engine.now + 0.02, { freq: [440, 82.5, 220][k], gain: 0.2, kind: k, pan: 0 }))));
  ty.appendChild(button('Rain', 'what falls when a moment is too crowded for separate notes',
    () => engine.rain(engine.now + 0.02, { gain: 0.16, length: 1.2 })));

  const fams = [...document.getElementById('family').options].map((o) => +o.value).filter((f) => f >= 0);
  const fy = fams.find((f) => families[f].key === '1999-025') ?? fams[0];
  const sz = group('How big', 'Radar size sets loudness: small, medium and large pieces of debris.');
  ['Small', 'Medium', 'Large'].forEach((label, size) => sz.appendChild(button(label, '', () => sonify.voice(fy, 0, 1, size))));

  // sources: a few examples, then all of them
  const sourceButton = (f) => {
    const k = typeOf.get(f) ?? 0, hz = sonify.freqOf(f, k), pan = sonify.panOf(f), ch = sonify.charOf(f);
    const name = pretty(families[f].name), key = families[f].key; // key: the launch, e.g. 1999-025
    const numbers = `${noteName(hz)}, ${Math.round(hz)} Hz · ${side(pan)} · brightness ×${ch.bright} · attack ${Math.round(ch.attack * 1000)} ms`;
    return button(`${name}, ${key.slice(0, 4)}${tune ? ` <span class="n">· ${numbers}</span>` : ''}`,
      `${name} (${key}) · ${TYPE_LABELS[k].toLowerCase()} voice, ${side(pan)}${tune ? '' : ` · ${numbers}`}`,
      () => { sonify.voice(f, k, 1); setTimeout(() => sonify.voice(f, k, 12), 700); });
  };
  const ex = group('Where it came from', 'Each source has its own pitch and place. One reentry, then a busy day from the same source.');
  EXAMPLES.map((key) => fams.find((f) => families[f].key === key)).filter((f) => f != null).forEach((f) => ex.appendChild(sourceButton(f)));

  const all = document.createElement('details'); all.className = 'aud-all';
  all.innerHTML = `<summary>All ${fams.length} sources</summary>`;
  body.appendChild(all);
  const allRow = group('', 'Biggest first. The biggest each have their own pitch in the centre; the rest share pitches, placed to the left.', all);
  fams.forEach((f) => allRow.appendChild(sourceButton(f)));

  if (tune) { body.closest('details').open = true; all.open = true; }
}
