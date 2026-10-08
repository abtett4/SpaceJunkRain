// Canvas colours come from the CSS tokens in style.css, so paper and blueprint stay in one place.

import { TYPE_VARS, GROUP_VARS } from './util.js';

export const C = {};
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function readColors() {
  Object.assign(C, {
    types: TYPE_VARS.map(css), groups: GROUP_VARS.map(css), dim: css('--dim'), grid: css('--grid'),
    gridMajor: css('--grid-major'), axis: css('--axis'), muted: css('--muted'), text: css('--text-primary'),
    text2: css('--text-secondary'), hist: css('--hist'), surface: css('--surface-1'), pre: css('--pre'),
    rule: css('--rule'),
  });
}

// Paper / blueprint switch. An explicit choice is remembered; otherwise follow the system.
// A theme already set on <html> (e.g. by a host page) is respected until the viewer flips it.
export function initThemeSwitch(button, onChange) {
  const sysDark = matchMedia('(prefers-color-scheme: dark)');
  let saved = null;
  try { saved = localStorage.getItem('sjr-theme'); } catch (e) { /* storage blocked */ }
  function apply(t) {
    if (t) document.documentElement.dataset.theme = t;
    const cur = document.documentElement.dataset.theme;
    button.setAttribute('aria-checked', String(cur ? cur === 'dark' : sysDark.matches));
  }
  apply(saved);
  button.addEventListener('click', () => {
    const t = button.getAttribute('aria-checked') === 'true' ? 'light' : 'dark';
    try { localStorage.setItem('sjr-theme', t); } catch (e) { /* not remembered, still applied */ }
    apply(t); // the observer below redraws
  });
  sysDark.addEventListener('change', () => { apply(null); onChange(); });
  new MutationObserver(() => { apply(null); onChange(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
