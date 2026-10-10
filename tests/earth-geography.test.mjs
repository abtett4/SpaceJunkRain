import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { latLonToVector, vectorToLatLon, transform, inverseRotation, dot, cameraBasis, pickGlobe } from '../web/earth/GeoMath.js';
import { gmst, earthRotation, earthState } from '../web/earth/EarthOrientation.js';
import { Geography, contains, distanceKm } from '../web/earth/Geography.js';
import { SurfacePulse } from '../web/earth/SurfacePulse.js';

const near = (a, b, epsilon = 1e-9) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const nearVector = (a, b) => a.forEach((v, i) => near(v, b[i]));

test('sidereal rotation agrees with Python sgp4/Vallado fixtures and preserves the tracer frame', () => {
  for (const [date, angle] of [['2000-01-01T12:00:00Z', 4.894961212823059],
    ['2018-04-02T00:00:00Z', 3.3212420337661968], ['2026-10-10T00:00:00Z', 0.32486541886889597]]) {
    const time = Date.parse(date), m = earthRotation(time);
    near(gmst(time), angle);
    nearVector(transform(m, latLonToVector(0, 0)), [Math.cos(angle), 0, -Math.sin(angle)]);
    nearVector(transform(m, latLonToVector(90, 0)), [0, -1, 0]);
    nearVector(inverseRotation(m, transform(m, [.2, -.8, .3])), [.2, -.8, .3]);
  }
  nearVector(latLonToVector(0, 90), [0, 0, -1]);
});

test('geographic east projects right and north projects up in p5', () => {
  const eye = [3.7, 0, 0], { right, down } = cameraBasis(eye);
  assert.ok(dot(latLonToVector(0, 10), right) > 0);
  assert.ok(dot(latLonToVector(10, 0), down) < 0);
});

test('lighting follows the solar seasons and UTC noon instead of the camera', () => {
  for (const [date, declination] of [['2024-03-20T12:00:00Z', 0], ['2024-06-21T12:00:00Z', 23.44], ['2024-12-21T12:00:00Z', -23.44]]) {
    const { rotation, sunDirection } = earthState(Date.parse(date));
    const subsolar = vectorToLatLon(inverseRotation(rotation, sunDirection));
    near(subsolar.lat, declination, .3);
    near(subsolar.lon, 0, 3); // equation of time; not civil noon at every longitude
    near(Math.hypot(...sunDirection), 1);
    assert.ok(dot(sunDirection, transform(rotation, latLonToVector(0, 0))) > .9);
    assert.ok(dot(sunDirection, transform(rotation, latLonToVector(0, 180))) < -.9);
  }
  assert.throws(() => earthState(NaN));
});

test('picking matches the rendered rotation across dates, viewpoints and aspect ratios', () => {
  for (const time of [0, Date.parse('2018-04-02T16:00Z')]) for (const [lat, lon] of [[28.6084,-80.6042],[-33,151],[70,179],[-80,-170]]) {
    const rotation = earthRotation(time), normal = transform(rotation, latLonToVector(lat, lon));
    const eye = normal.map(v => v * 3.7);
    for (const [width, height] of [[540,380],[280,380]]) {
      const hit = pickGlobe(width/2, height/2, width, height, eye, Math.PI/4, rotation);
      near(hit.lat, lat); near(hit.lon, lon);
      // Project a nearby off-center surface point then pick it back.
      const other = transform(rotation, latLonToVector(lat + 3, lon - 4));
      const delta = other.map((v,i) => v-eye[i]);
      const basis = cameraBasis(eye), depth = -dot(delta,basis.back), tangent = Math.tan(Math.PI/8);
      const x = width/2 + dot(delta,basis.right)/depth/tangent*height/2;
      const y = height/2 + dot(delta,basis.down)/depth/tangent*height/2;
      const offCenter = pickGlobe(x,y,width,height,eye,Math.PI/4,rotation);
      near(offCenter.lat, lat+3); near(offCenter.lon, lon-4);
      assert.equal(pickGlobe(0,0,width,height,eye,Math.PI/4,rotation), null);
    }
  }
});

test('pulses retain the same geographic location as Earth rotates and after a seek', () => {
  const pulse = new SurfacePulse({latitudeDeg: 28, longitudeDeg: -80, durationSeconds: 14400, endTime: '2018-04-02T16:00Z'});
  const original = pulse.sample(pulse.endMs-7200000);
  for (const time of [pulse.startMs, pulse.endMs, pulse.startMs]) {
    const m = earthRotation(time);
    const point = vectorToLatLon(inverseRotation(m, transform(m, pulse.normal)));
    near(point.lat,28); near(point.lon,-80);
    original.ring.forEach(p => near(Math.hypot(...transform(m,p)),1.004));
  }
  assert.deepEqual(pulse.sample(pulse.endMs-7200000), original);
});

const data = JSON.parse(readFileSync(new URL('../web/data/geography.json', import.meta.url)));
const geo = new Geography(data);
test('offline lookup recognizes requested places and ocean seams without assigning a distant city', () => {
  for (const [lat,lon,name] of [[28.608402,-80.604201,'Near Kennedy Space Center'],[29.741273,-95.348436,'Near Houston'],
    [34.049219,-118.231986,'Near Los Angeles'],[0,-150,'Pacific Ocean'],[0,179.9,'Pacific Ocean'],[0,-179.9,'Pacific Ocean'],
    [0,180,'Pacific Ocean'],[35,18,'Mediterranean Sea'],[50,10,'Germany'],[-85,30,'Antarctica']]) {
    assert.equal(geo.lookup(lat,lon).name, name);
  }
  assert.notEqual(geo.lookup(34,-116.5).name, 'Near Los Angeles');
  assert.notEqual(geo.lookup(30,-80.6).name, 'Near Kennedy Space Center');
  near(distanceKm({lat:0,lon:179.9},{lat:0,lon:-179.9}),22.239, .001);
});

test('polygon holes and absent map coverage remain explicit', () => {
  const polygon = {bounds:[0,0,10,10],rings:[[[0,0],[10,0],[10,10],[0,10],[0,0]],[[4,4],[6,4],[6,6],[4,6],[4,4]]]};
  assert.equal(contains(polygon,2,2), true);
  assert.equal(contains(polygon,5,5), false);
  assert.equal(contains(polygon,11,5), false);
  assert.equal(new Geography({land:[],water:[],sites:[],cities:[]}).lookup(0,0).name,'Unmapped region');
});
