import P5 from '../../vendor/p5.esm.min.js';
import { Tracer } from './Tracer.js';
import { CameraController } from './CameraController.js';

// Sphere mesh adapted from Cosmic Clock's EarthView; no catalog or clock knowledge.
function sphereMesh() {
  const w = 96, h = 48, g = new P5.Geometry(w, h);
  for (let y = 0; y <= h; y++) for (let x = 0; x <= w; x++) {
    const lat = Math.PI / 2 - y / h * Math.PI, lon = x / w * 2 * Math.PI;
    const v = [Math.cos(lat) * Math.sin(lon), -Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
    g.vertices.push(new P5.Vector(...v));
    g.vertexNormals.push(new P5.Vector(...v));
    g.uvs.push(x / w, y / h);
    if (y < h && x < w) {
      const a = y * (w + 1) + x, b = a + 1, c = a + w + 1, d = c + 1;
      g.faces.push([a, c, b], [b, c, d]);
    }
  }
  return g;
}

// A camera-facing ribbon gives continuous width and opacity between source samples.
// Both taper along the visible path, from zero at the oldest point to full at the head.
function drawTaperedTrail(p, points, eye, width, color) {
  if (points.length < 2) return;
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    distances.push(distances[i - 1] + Math.hypot(...points[i].map((v, j) => v - points[i - 1][j])));
  }
  const length = distances.at(-1);
  if (length === 0) return;
  const tint = p.color(color);
  let previousSide = [1, 0, 0];
  p.noStroke();
  p.beginShape(p.TRIANGLE_STRIP);
  points.forEach((point, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const tangent = b.map((v, j) => v - a[j]);
    const view = eye.map((v, j) => v - point[j]);
    const cross = [tangent[1]*view[2]-tangent[2]*view[1],
      tangent[2]*view[0]-tangent[0]*view[2], tangent[0]*view[1]-tangent[1]*view[0]];
    const norm = Math.hypot(...cross);
    let side = norm > 1e-10 ? cross.map(v => v / norm) : previousSide;
    // Keep the ribbon's two edges consistent when viewed nearly end-on.
    if (i && side.reduce((sum, v, j) => sum + v * previousSide[j], 0) < 0) side = side.map(v => -v);
    previousSide = side;
    const progress = distances[i] / length;
    const halfWidth = width * progress / 2;
    tint.setAlpha(255 * progress * progress);
    p.fill(tint);
    p.vertex(...point.map((v, j) => v - side[j] * halfWidth));
    p.vertex(...point.map((v, j) => v + side[j] * halfWidth));
  });
  p.endShape();
}

export class EarthScene {
  constructor(element) {
    this.tracers = [];
    this.pulses = [];
    this.timeMs = 0;
    this.ready = new Promise((resolve, reject) => {
      this.p = new P5((p) => {
        p.setup = () => {
          try {
            const canvas = p.createCanvas(element.clientWidth, 380, p.WEBGL);
            p.pixelDensity(Math.min(devicePixelRatio || 1, 2));
            canvas.elt.tabIndex = 0;
            canvas.elt.setAttribute('aria-label', 'Earth event preview. Drag or use arrow keys to rotate; plus and minus to zoom.');
            this.camera = new CameraController(canvas.elt, () => p.redraw());
            this.camera.yaw = 0.8;
            this.mesh = sphereMesh();
            p.noLoop();
            this.resize = new ResizeObserver(() => {
              p.resizeCanvas(element.clientWidth, 380);
              p.redraw();
            });
            this.resize.observe(element);
            resolve(this);
          } catch (error) { reject(error); }
        };
        p.draw = () => this.draw(p);
      }, element);
    });
  }
  addTracer(options) {
    const tracer = new Tracer(options);
    this.tracers.push(tracer);
    return tracer;
  }
  setTime(timeMs) { this.timeMs = timeMs; this.p.redraw(); }
  draw(p) {
    if (!this.camera || !this.mesh) return;
    const camera = this.camera;
    p.background('#081b2c');
    p.perspective(camera.fov, p.width / p.height, 0.05, 100);
    p.camera(...camera.eye, 0, 0, 0, 0, 1, 0);
    p.ambientLight(135);
    p.directionalLight(180, 195, 220, -0.5, 0.5, -1);
    p.noStroke(); p.fill('#274e65');
    p.model(this.mesh);
    p.noLights();
    // Equator only. Surface pulses have illustrative locations; orbits have no geographic endpoint.
    p.noFill(); p.stroke('#547f92'); p.strokeWeight(0.003);
    p.beginShape();
    for (let i = 0; i <= 128; i++) {
      const a = i / 128 * 2 * Math.PI;
      p.vertex(Math.cos(a) * 1.0005, 0, Math.sin(a) * 1.0005);
    }
    p.endShape();
    for (const tracer of this.tracers) {
      const sample = tracer.sample(this.timeMs);
      if (!sample) continue;
      drawTaperedTrail(p, sample.tail, camera.eye, tracer.lineWidthEarth, tracer.color);
      p.push(); p.translate(...sample.head); p.noStroke(); p.fill(tracer.color);
      p.sphere(tracer.markerRadiusEarth, 12, 8); p.pop();
    }
    for (const pulse of this.pulses) {
      const sample = pulse.sample(this.timeMs);
      if (!sample) continue;
      const tint = p.color(pulse.color);
      tint.setAlpha(255 * sample.opacity);
      p.noStroke(); p.fill(tint);
      p.beginShape(p.TRIANGLE_STRIP);
      for (const point of sample.ring) p.vertex(...point);
      p.endShape();
    }
  }
  dispose() { this.resize?.disconnect(); this.camera?.dispose(); this.p.remove(); }
}
