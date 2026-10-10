import { DEFAULTS, STYLE } from '../PresentationConfig.js';
import P5 from '../vendor/p5.esm.min.js';
import { Tracer } from './Tracer.js';
import { CameraController } from './CameraController.js';
import { earthState, earthRotation } from './EarthOrientation.js';
import { latLonToVector, transform, pickGlobe } from './GeoMath.js';
import { earthVertex, earthFragment } from './EarthShader.js';

// Sphere mesh adapted from Cosmic Clock's EarthView; no catalog or clock knowledge.
function sphereMesh() {
  const w = 144, h = 96, g = new P5.Geometry(w, h);
  for (let y = 0; y <= h; y++) for (let x = 0; x <= w; x++) {
    const v = latLonToVector(90 - y / h * 180, x / w * 360 - 180);
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
function drawTaperedTrail(p, points, eye, width, color, opacity, widthTaper, opacityTaper) {
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
    const halfWidth = width * progress ** widthTaper / 2;
    tint.setAlpha(255 * opacity * progress ** opacityTaper);
    p.fill(tint);
    p.vertex(...point.map((v, j) => v - side[j] * halfWidth));
    p.vertex(...point.map((v, j) => v + side[j] * halfWidth));
  });
  p.endShape();
}

export class EarthScene {
  constructor(element) {
    this.settings = DEFAULTS;
    this.tracers = [];
    this.pulses = [];
    this.timeMs = 0;
    this.state = earthState(0);
    this.layers = new Set();
    this.onInspect = () => {};
    this.pointer = this.pinned = null;
    this.disposed = false;
    this.ready = new Promise((resolve, reject) => {
      this.p = new P5((p) => {
        p.setup = async () => {
          try {
            const canvas = p.createCanvas(element.clientWidth, 380, p.WEBGL);
            p.pixelDensity(Math.min(devicePixelRatio || 1, 2));
            canvas.elt.tabIndex = 0;
            this.canvas = canvas.elt;
            canvas.elt.setAttribute('aria-label', 'Earth event preview and geographic explorer');
            canvas.elt.setAttribute('aria-describedby', 'geo-instructions');
            this.camera = new CameraController(canvas.elt, () => p.redraw(), {
              hover: point => { this.pointer = point; this.refreshInspection(); },
              inspect: point => {
                this.pinned = this.pick(point); this.pointer = null; this.refreshInspection();
              },
              clear: () => this.clearInspection(),
            });
            this.camera.yaw = 0.8;
            this.mesh = sphereMesh();
            p.noLoop();
            this.resize = new ResizeObserver(() => {
              p.resizeCanvas(element.clientWidth, 380);
              p.redraw();
            });
            this.resize.observe(element);
            this.shader = p.createShader(earthVertex, earthFragment);
            const images = await Promise.allSettled(['earth-day.jpg', 'earth-night.jpg'].map(name =>
              p.loadImage(new URL(`../assets/earth/${name}`, import.meta.url).href)));
            if (this.disposed) return;
            if (images.every(image => image.status === 'fulfilled')) {
              this.shader.setUniform('uDay', images[0].value);
              this.shader.setUniform('uNight', images[1].value);
              this.textured = true;
            } else {
              this.imageryError = true;
            }
            resolve(this); p.redraw();
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
  configureAppearance(settings) { this.settings = settings; this.p.redraw(); }
  setTime(timeMs) {
    if (timeMs !== this.timeMs) this.state = earthState(timeMs);
    this.timeMs = timeMs; this.p.redraw();
  }
  surfaceToWorld(normal, timeMs = this.timeMs) {
    return transform(timeMs === this.timeMs ? this.state.rotation : earthRotation(timeMs), normal);
  }
  pick(clientPoint) {
    if (!this.canvas) return null;
    const r = this.canvas.getBoundingClientRect();
    const [x, y] = clientPoint ? [clientPoint[0] - r.left, clientPoint[1] - r.top] : [r.width / 2, r.height / 2];
    if (x < 0 || x > r.width || y < 0 || y > r.height) return null;
    return pickGlobe(x, y, r.width, r.height, this.camera.eye, this.camera.fov, this.state.rotation);
  }
  refreshInspection() {
    this.onInspect(this.pinned ?? (this.pointer ? this.pick(this.pointer) : null), Boolean(this.pinned));
  }
  clearInspection() { this.pinned = this.pointer = null; this.refreshInspection(); }
  focusGeography(lat, lon) {
    const direction = this.surfaceToWorld(latLonToVector(lat, lon));
    this.camera.yaw = Math.atan2(direction[0], direction[2]);
    this.camera.pitch = Math.max(-1.4, Math.min(1.4, Math.asin(-direction[1])));
    this.pinned = { lat, lon }; this.pointer = null; this.p.redraw();
  }
  // Future data layers receive this scene's clock and transforms. No independent timer.
  // A layer supplies draw(frame) and optionally dispose(); removal owns disposal.
  addLayer(layer) {
    if (typeof layer?.draw !== 'function') throw new Error('Earth layer requires draw(frame).');
    this.layers.add(layer);
    this.p.redraw();
    return () => { if (this.layers.delete(layer)) { layer.dispose?.(); this.p.redraw(); } };
  }
  draw(p) {
    if (!this.camera || !this.mesh) return;
    const camera = this.camera;
    p.background(STYLE.background);
    p.perspective(camera.fov, p.width / p.height, 0.05, 100);
    p.camera(...camera.eye, 0, 0, 0, 0, 1, 0);
    p.noStroke();
    if (this.textured) {
      p.fill(255); p.shader(this.shader);
      this.shader.setUniform('uEarthRotation', this.state.rotation);
      this.shader.setUniform('uSun', this.state.sunDirection);
      this.shader.setUniform('uEye', camera.eye);
      this.shader.setUniform('uBrightness', this.settings.earthBrightness);
      this.shader.setUniform('uNightIntensity', this.settings.nightLights);
      this.shader.setUniform('uAtmosphereOpacity', this.settings.atmosphereOpacity);
      this.shader.setUniform('uRadius', 1);
      this.shader.setUniform('uAtmosphere', 0);
      p.model(this.mesh);
      // Decorative rim only. Do not write its transparent surface into the depth buffer.
      p.fill(255, 100);
      this.shader.setUniform('uRadius', STYLE.atmosphereRadius);
      this.shader.setUniform('uAtmosphere', 1);
      p.drawingContext.depthMask(false);
      p.model(this.mesh);
      p.drawingContext.depthMask(true);
      p.resetShader();
    } else {
      p.ambientLight(135); p.directionalLight(180, 195, 220, -0.5, 0.5, -1);
      p.fill('#274e65'); p.model(this.mesh); p.noLights();
    }
    // Overlay authors decide what their data means; this host only supplies the frame.
    for (const layer of this.layers) {
      p.push();
      try {
        layer.draw({ p, timeMs: this.timeMs, earthRotation: [...this.state.rotation],
          sunDirection: [...this.state.sunDirection], eye: [...camera.eye], earthRadius: 1, settings: this.settings });
      } finally { p.pop(); p.resetShader(); p.noLights(); p.drawingContext.depthMask(true); }
    }
    for (const tracer of this.tracers) {
      const sample = tracer.sample(this.timeMs);
      if (!sample || tracer.opacity === 0) continue;
      drawTaperedTrail(p, sample.tail, camera.eye, tracer.lineWidthEarth, tracer.color, tracer.opacity, tracer.widthTaper, tracer.opacityTaper);
      p.push(); p.translate(...sample.head); p.noStroke(); const tint = p.color(tracer.color); tint.setAlpha(255 * tracer.opacity); p.fill(tint);
      p.sphere(tracer.markerRadiusEarth, 12, 8); p.pop();
    }
    for (const pulse of this.pulses) {
      const sample = pulse.sample(this.timeMs);
      if (!sample) continue;
      const tint = p.color(pulse.color);
      tint.setAlpha(255 * sample.opacity);
      p.noStroke(); p.fill(tint);
      p.beginShape(p.TRIANGLE_STRIP);
      for (const point of sample.ring) p.vertex(...this.surfaceToWorld(point));
      p.endShape();
    }
    this.refreshInspection();
  }
  dispose() {
    this.disposed = true; this.resize?.disconnect(); this.camera?.dispose();
    for (const layer of this.layers) layer.dispose?.();
    this.layers.clear(); this.p.remove();
  }
}
