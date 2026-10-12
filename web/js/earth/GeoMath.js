export const RAD = Math.PI / 180;
export const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
export const dot = (a, b) => a.reduce((n, x, i) => n + x * b[i], 0);
export const scale = (v, s) => v.map((x) => x * s);
export const add = (a, b) => a.map((x, i) => x + b[i]);
export const normalize = (v) => scale(v, 1 / Math.hypot(...v));
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const wrapLongitude = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;

// Earth-local axes: Greenwich is +X, north is -Y, east is -Z.
// Matches [equatorial X, -Z, -Y] for p5’s screen-down Y convention.
// This display reflection keeps north up AND geographic east to the right.
export function latLonToVector(lat, lon) {
  const p = lat * RAD,
    l = lon * RAD;
  return [Math.cos(p) * Math.cos(l), -Math.sin(p), -Math.cos(p) * Math.sin(l)];
}
export function vectorToLatLon(v) {
  const n = normalize(v);
  return {
    lat: Math.asin(clamp(-n[1], -1, 1)) / RAD,
    lon: Math.atan2(-n[2], n[0]) / RAD,
  };
}
// Column-major matrices, shared by GLSL and CPU picking.
export function transform(m, v) {
  return [0, 1, 2].map((i) => m[i] * v[0] + m[i + 3] * v[1] + m[i + 6] * v[2]);
}
export function inverseRotation(m, v) {
  return [0, 3, 6].map((i) => m[i] * v[0] + m[i + 1] * v[1] + m[i + 2] * v[2]);
}
export function raySphere(origin, direction, radius = 1) {
  const b = dot(origin, direction),
    c = dot(origin, origin) - radius * radius;
  const d = b * b - c;
  if (d < 0) return null;
  const near = -b - Math.sqrt(d),
    far = -b + Math.sqrt(d);
  const t = near >= 0 ? near : far;
  return t < 0 ? null : add(origin, scale(direction, t));
}
export function cameraBasis(eye) {
  const back = normalize(eye);
  const right = normalize(cross([0, 1, 0], back));
  return { back, right, down: cross(back, right) };
}
export function screenRay(x, y, width, height, eye, fov) {
  const { back, right, down } = cameraBasis(eye);
  const h = Math.tan(fov / 2);
  return normalize(
    add(
      scale(back, -1),
      add(
        scale(right, (((2 * x) / width - 1) * h * width) / height),
        scale(down, ((2 * y) / height - 1) * h),
      ),
    ),
  );
}

export function pickGlobe(x, y, width, height, eye, fov, earthRotation) {
  const hit = raySphere(eye, screenRay(x, y, width, height, eye, fov));
  return hit ? vectorToLatLon(inverseRotation(earthRotation, hit)) : null;
}
