// Camera input adapted from Cosmic Clock. Picking remains in EarthScene.
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
export class CameraController {
  constructor(element, changed, { hover = () => {}, inspect = () => {}, clear = () => {} } = {}) {
    Object.assign(this, { yaw: 0, pitch: 0.2, distance: 3.7, fov: Math.PI / 4 });
    this.changed = changed;
    this.pointers = new Map();
    let down = null, moved = false;
    this.events = new AbortController();
    const listen = (name, fn, options = {}) => element.addEventListener(name, fn, { ...options, signal: this.events.signal });
    listen('pointerdown', (e) => {
      element.focus({ preventScroll: true });
      this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
      down = [e.clientX, e.clientY]; moved = this.pointers.size > 1;
      hover(null);
      element.setPointerCapture(e.pointerId);
    });
    listen('pointermove', (e) => {
      const old = this.pointers.get(e.pointerId);
      if (!old) { hover([e.clientX, e.clientY]); return; }
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) moved = true;
      if (this.pointers.size === 2) {
        const other = [...this.pointers].find(([id]) => id !== e.pointerId)[1];
        const before = Math.hypot(old[0] - other[0], old[1] - other[1]);
        const after = Math.hypot(e.clientX - other[0], e.clientY - other[1]);
        if (after > 0) this.zoom(before / after);
      } else this.orbit(-(e.clientX - old[0]) * 0.005, (e.clientY - old[1]) * 0.005);
      this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
    });
    listen('pointerup', e => {
      if (this.pointers.has(e.pointerId) && this.pointers.size === 1 && !moved) inspect([e.clientX, e.clientY]);
      this.pointers.delete(e.pointerId);
    });
    listen('pointerleave', () => hover(null));
    for (const name of ['pointercancel', 'lostpointercapture']) {
      listen(name, (e) => this.pointers.delete(e.pointerId));
    }
    listen('wheel', (e) => {
      e.preventDefault(); this.zoom(Math.exp(clamp(e.deltaY, -100, 100) * 0.0015));
    }, { passive: false });
    listen('keydown', (e) => {
      const actions = {
        ArrowLeft: () => this.orbit(-0.12, 0), ArrowRight: () => this.orbit(0.12, 0),
        ArrowUp: () => this.orbit(0, -0.1), ArrowDown: () => this.orbit(0, 0.1),
        '+': () => this.zoom(0.9), '=': () => this.zoom(0.9), '-': () => this.zoom(1.1),
        Enter: () => inspect(null), Escape: clear,
      };
      if (actions[e.key]) { e.preventDefault(); actions[e.key](); }
    });
  }
  orbit(yaw, pitch) {
    this.yaw += yaw; this.pitch = clamp(this.pitch + pitch, -1.4, 1.4); this.changed();
  }
  zoom(factor) { this.distance = clamp(this.distance * factor, 2.05, 6); this.changed(); }
  get eye() {
    return [Math.cos(this.pitch) * Math.sin(this.yaw), -Math.sin(this.pitch), Math.cos(this.pitch) * Math.cos(this.yaw)]
      .map((v) => v * this.distance);
  }
  dispose() { this.events.abort(); }
}
