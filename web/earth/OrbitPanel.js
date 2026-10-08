// App adapter: resolves event assets and translates the shared clock into scene time.
export async function mountOrbitPanel(clock, timeline, onReplay) {
  const status = document.getElementById('orbit-status');
  let scene, unsubscribe;
  try {
    const manifestUrl = new URL('data/tracers.json', document.baseURI);
    const fetchJson = async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not load ${url.pathname} (${response.status}).`);
      return response.json();
    };
    const manifest = await fetchJson(manifestUrl);
    const event = manifest.events[0];
    if (!event || manifest.schemaVersion !== 1) throw new Error('Unsupported tracer manifest.');
    const presentation = event.presentation;
    const index = timeline.cols.id.indexOf(event.object.noradId);
    const anchorMs = Date.parse(presentation.displayAnchorUtc);
    const timelineMs = Date.parse(timeline.meta.epoch) + timeline.cols.d[index] * 86400000;
    if (index < 0 || Math.abs(anchorMs - timelineMs) > 1) throw new Error('Tracer and timeline event times disagree.');
    const geometry = await fetchJson(new URL(presentation.geometryAsset, manifestUrl));
    if (geometry.id !== event.object.noradId || geometry.frame !== 'TEME' || geometry.units !== 'km'
      || geometry.timeSystem !== 'UTC') throw new Error('Unsupported geometry identity, frame, or units.');
    const { EarthScene } = await import('./EarthScene.js');
    scene = new EarthScene(document.getElementById('earth-scene'));
    await scene.ready;
    const tracer = scene.addTracer({ positions: geometry.trace, startTime: presentation.startTime,
      endTime: presentation.endTime, radiusKm: geometry.referenceSphereRadiusKm,
      objectType: event.attributes.objectType.value, ...presentation.style });
    const startMs = tracer.startMs, endMs = tracer.endMs;
    const dateText = (ms) => new Date(Math.round(ms)).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
    document.getElementById('orbit-name').textContent = `${event.object.name} · NORAD ${event.object.noradId}`;
    document.getElementById('orbit-anchor').textContent = `${dateText(anchorMs)} · assigned display time within the reported day`;
    const a = event.attributes, orbit = a.orbitNearEvent;
    document.getElementById('orbit-attributes').textContent =
      `${a.objectType.value} · ${orbit.inclinationDeg.toFixed(2)}° inclination · ` +
      `${Math.round(orbit.perigeeKm)}–${Math.round(orbit.apogeeKm)} km catalog perigee/apogee · ` +
      `${a.radarSize.value} radar-size proxy · catalog country ${a.catalogCountry.value}`;
    const slider = document.getElementById('orbit-scrub');
    slider.max = (endMs - startMs) / 1000;
    slider.disabled = false;
    const replay = document.getElementById('orbit-replay');
    replay.disabled = false;
    replay.addEventListener('click', () => {
      const head = tracer.points[0].xyz;
      const next = tracer.points[1].xyz;
      const normal = [head[1]*next[2]-head[2]*next[1], head[2]*next[0]-head[0]*next[2], head[0]*next[1]-head[1]*next[0]];
      const length = Math.hypot(...normal);
      const direction = head.map((v, i) => v / Math.hypot(...head) + (length ? 0.6 * normal[i] / length : 0));
      scene.camera.yaw = Math.atan2(direction[0], direction[2]);
      scene.camera.pitch = Math.asin(-direction[1] / Math.hypot(...direction));
      onReplay(startMs, endMs);
    });
    slider.addEventListener('input', () => {
      const targetMs = startMs + Number(slider.value) * 1000;
      clock.pause(); clock.seek(targetMs);
    });
    const update = ({ nowMs }) => {
      scene.setTime(nowMs);
      const sample = tracer.sample(nowMs);
      slider.value = Math.max(0, Math.min(Number(slider.max), (nowMs - startMs) / 1000));
      document.getElementById('orbit-clock').textContent = dateText(nowMs);
      document.getElementById('orbit-sample').textContent = sample
        ? `Orbit sample: ${dateText(sample.sourceMs)}` : 'Outside this tracer’s display interval. Choose Replay to focus the shared clock.';
      slider.setAttribute('aria-valuetext', sample ? dateText(nowMs) : 'Outside tracer interval');
    };
    unsubscribe = clock.subscribe(update);
    update(clock);
    status.textContent = 'Last-known orbit replay · reentry location unknown';
    window.addEventListener('pagehide', (e) => { if (!e.persisted) { unsubscribe(); scene.dispose(); } });
  } catch (error) {
    unsubscribe?.(); scene?.dispose();
    status.textContent = `Orbit preview unavailable: ${error.message} The timeline is still available.`;
  }
}
