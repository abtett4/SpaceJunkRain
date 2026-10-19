// "Audition the voices": a folded panel of buttons that each play one voice on its own,
// for tuning the sonification by ear. Events by kind (the 2019 categories), then each named
// source with the note it gets in the timeline, then the rain that stands in for dense moments.

import { KIND_GLYPH, KIND_WORD, TYPE_LABELS, yearOf, pretty } from '../util.js';

const NOTE_NAMES = ['A', 'B♭', 'B', 'C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭'];
const noteName = (hz) => {
  const n = Math.round(12 * Math.log2(hz / 440)) + 48; // semitones above A0
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor((n + 9) / 12)}`;
};
const side = (pan) => (Math.abs(pan) < 0.1 ? 'centre' : `${Math.round(Math.abs(pan) * 100)}% ${pan < 0 ? 'left' : 'right'}`);

export function mountAudition(db, engine, sonify, ensureSound) {
  const body = document.getElementById('audition-body');
  if (!body) return;
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
  const group = (heading, note) => {
    const g = document.createElement('div'); g.className = 'aud-group';
    g.innerHTML = `<p class="aud-h">${heading}</p>${note ? `<p class="aud-note">${note}</p>` : ''}`;
    const row = document.createElement('div'); row.className = 'aud-row'; g.appendChild(row);
    body.appendChild(g);
    return row;
  };

  // collisions and breakups, with the events that use each sound
  const ev = group('Collisions and breakups', 'Each marker on the timeline sounds its kind.');
  for (const kind of Object.keys(KIND_GLYPH)) {
    const ex = events.filter((e) => e.kind === kind);
    const eg = ex.slice(0, 2).map((e) => `${e.name} (${yearOf(e.t)})`).join('; ');
    ev.appendChild(button(`${KIND_GLYPH[kind]} ${KIND_WORD[kind]} <span class="n">· ${ex.length}</span>`,
      eg ? `e.g. ${eg}` : '', () => engine.collision(engine.now + 0.02, kind)));
  }

  // the named sources, in the order of the Highlight menu (biggest first)
  const src = group('Sources', 'One reentry, then a busy day of twelve from the same source (a louder note). ' +
    'Pitch and stereo place come from the source; timbre from its commonest type.');
  const fams = [...document.getElementById('family').options].map((o) => +o.value).filter((f) => f >= 0);
  for (const f of fams) {
    const k = typeOf.get(f) ?? 0, hz = sonify.freqOf(f, k), pan = sonify.panOf(f);
    const name = pretty(families[f].name), key = families[f].key; // key: the launch, e.g. 1999-025
    src.appendChild(button(`${name}, ${key.slice(0, 4)} <span class="n">· ${noteName(hz)}</span>`,
      `${name} (${key}) · ${TYPE_LABELS[k]} voice · ${Math.round(hz)} Hz · ${side(pan)}`,
      () => { sonify.voice(f, k, 1); setTimeout(() => sonify.voice(f, k, 12), 700); }));
  }

  // the three timbres on one pitch, and the rain
  const ty = group('Timbres and rain', 'The three object-type voices, and the noise that stands in for crowded moments.');
  TYPE_LABELS.slice(0, 3).forEach((label, k) => ty.appendChild(button(label, '', () =>
    engine.note(engine.now + 0.02, { freq: [440, 110, 220][k], gain: 0.2, kind: k, pan: 0 }))));
  ty.appendChild(button('Rain', 'what folds in when a moment is too crowded for separate notes',
    () => [0, 0.12, 0.24].forEach((d) => engine.rain(engine.now + 0.02 + d, { gain: 0.12 }))));
}
