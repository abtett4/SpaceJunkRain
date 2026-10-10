// Data-to-visualization boundary. Event records contain evidence, never these choices.
// A different renderer can consume the same records and supply another resolver.
import { DEFAULTS, STYLE, EVENT_COLORS } from './PresentationConfig.js';
export const DISPLAY_LIMIT_SECONDS = 172800;
export const eventAppearance = event => ({ color: EVENT_COLORS[event.eventKind] ?? STYLE.color });
export const selectMode = (seconds, propagatedSeconds, hasReference) =>
  propagatedSeconds && seconds <= propagatedSeconds ? 'propagated' : hasReference ? 'representative' : 'symbolic';

export function resolveVisualization(event, available, input) {
  const settings = { ...DEFAULTS, ...input }, launch = event.eventKind === 'launch';
  const seconds = Math.min(launch ? settings.launchFollowSeconds : settings.reentryLeadSeconds,
    !launch && !available.reference && available.propagatedSeconds ? available.propagatedSeconds : DISPLAY_LIMIT_SECONDS);
  const mode = launch ? 'launch' : selectMode(seconds, available.propagatedSeconds, available.reference);
  const ascentSeconds = launch && available.reference ? Math.max(60, available.launchGapSeconds ?? 0) : null;
  return {
    mode, seconds, ascentSeconds, ...eventAppearance(event),
    tracer: launch ? (available.reference ? (available.launchSite ? 'launch' : 'representative') : null)
      : mode === 'propagated' ? 'propagated' : mode === 'representative' ? 'representative' : null,
    pulse: launch && available.launchSite ? 'site' : mode === 'symbolic' || launch && !available.reference ? 'symbolic' : null,
    markerRadiusEarth: STYLE.markerRadiusEarth * settings.markerScale,
    lineWidthEarth: STYLE.lineWidthEarth * settings.widthScale,
    trailSeconds: settings.trailSeconds, opacity: settings.tracerOpacity,
    widthTaper: settings.widthTaper, opacityTaper: settings.opacityTaper,
    pulseSeconds: Math.min(settings.pulseSeconds, seconds, launch && available.launchSite && ascentSeconds ? ascentSeconds : Infinity), pulseOpacity: settings.pulseOpacity,
  };
}

// Works on localhost and plain HTTP LAN previews; no Web Crypto/secure-context requirement.
// SHA-256 preserves the existing Python equal-area placement and date-only timing policies.
function digest(text) {
  const k = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const bytes = new TextEncoder().encode(text), size = Math.ceil((bytes.length + 9) / 64) * 64;
  const block = new DataView(new ArrayBuffer(size));
  bytes.forEach((v,i) => block.setUint8(i,v)); block.setUint8(bytes.length,128);
  block.setBigUint64(size - 8, BigInt(bytes.length) * 8n);
  const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const rr = (v,n) => v >>> n | v << (32-n), w = new Uint32Array(64);
  for (let offset=0; offset<size; offset+=64) {
    for (let i=0;i<16;i++) w[i]=block.getUint32(offset+i*4);
    for (let i=16;i<64;i++) w[i]=w[i-16]+(rr(w[i-15],7)^rr(w[i-15],18)^w[i-15]>>>3)+w[i-7]+(rr(w[i-2],17)^rr(w[i-2],19)^w[i-2]>>>10);
    let [a,b,c,d,e,f,g,j]=h;
    for (let i=0;i<64;i++) {
      const t1=(j+(rr(e,6)^rr(e,11)^rr(e,25))+((e&f)^(~e&g))+k[i]+w[i])|0;
      const t2=((rr(a,2)^rr(a,13)^rr(a,22))+((a&b)^(a&c)^(b&c)))|0;
      [a,b,c,d,e,f,g,j]=[(t1+t2)|0,a,b,c,(d+t1)|0,e,f,g];
    }
    [a,b,c,d,e,f,g,j].forEach((v,i) => h[i]=(h[i]+v)>>>0);
  }
  return h;
}
const first64 = (h,i=0) => BigInt(h[i]) * 4294967296n + BigInt(h[i+1]);
export function displayAnchor(event) {
  return event.eventTime.precision === 'day'
    ? Date.parse(`${event.eventTime.date}T00:00:00Z`)
      + Number(first64(digest(`sha256-utc-day-v1:SpaceJunkRain:${event.eventId}`)) % 86400n) * 1000
    : Date.parse(event.eventTime.intervalUtc[0]);
}
export function illustrativeLocation(eventId) {
  const h = digest(`sha256-equal-area-surface-v1:${eventId}`);
  return { latitudeDeg: Math.asin(2 * Number(first64(h)) / 2**64 - 1) * 180 / Math.PI,
    longitudeDeg: 360 * Number(first64(h,2)) / 2**64 - 180 };
}
