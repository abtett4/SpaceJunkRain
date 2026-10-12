// Tooltip for one catalogued object, shared by every sheet.

import { TYPE_LABELS, fmtDate, fmtSpan, pretty } from './util.js';

export function objectTip(db, i) {
  const { D, L, F, K, R, families, names, cols, meta } = db;
  return `<b>${pretty(names[cols.nm[i]])}</b>
    <div class="row">NORAD ${cols.id[i]} · ${TYPE_LABELS[K[i]]}${R[i] >= 0 ? ', ' + meta.rcs[R[i]].toLowerCase() : ''}</div>
    <div class="row">Launched ${isFinite(L[i]) ? fmtDate(L[i]) : '?'} · reentered ${fmtDate(D[i])}</div>
    <div class="row">${fmtSpan(D[i] - L[i])} in orbit · source ${families[F[i]].key}</div>`;
}
