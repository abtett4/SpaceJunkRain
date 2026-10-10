import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { displayAnchor, illustrativeLocation, resolveVisualization } from '../web/DisplayPolicy.js';
import { DEFAULTS, EVENT_COLORS } from '../web/PresentationConfig.js';
import { loadSequence, configureSequence } from '../web/earth/EventSequence.js';
import { earthRotation } from '../web/earth/EarthOrientation.js';
import { latLonToVector, transform, normalize, cross } from '../web/earth/GeoMath.js';
const json=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)));
const base='../web/data/samples/april-2018-launch/';
const timeline=json('../web/data/decays.json');
const asset=name=>Promise.resolve(json(base+name));
const freeze=v=>{ if(v && typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);} return v; };
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const launch=async()=>{const s=await loadSequence(json(base+'launch.json'),timeline,asset);configureSequence(s,DEFAULTS);return s;};

test('display timing and equal-area points preserve the existing SHA-256 policies',()=>{
  for (let i=0;i<256;i++) {
    const id=`${i}:reentry:2024-01-05`, day='2024-01-05';
    const pointHash=createHash('sha256').update(`sha256-equal-area-surface-v1:${id}`).digest();
    const u=Number(pointHash.readBigUInt64BE(0))/2**64, v=Number(pointHash.readBigUInt64BE(8))/2**64;
    const location=illustrativeLocation(id);
    assert.ok(Math.abs(location.latitudeDeg-Math.asin(2*u-1)*180/Math.PI)<1e-12);
    assert.equal(location.longitudeDeg,360*v-180);
    const timeHash=createHash('sha256').update(`sha256-utc-day-v1:SpaceJunkRain:${id}`).digest();
    assert.equal(displayAnchor({eventId:id,eventTime:{date:day,precision:'day'}}),
      Date.parse(day)+Number(timeHash.readBigUInt64BE(0)%86400n)*1000);
  }
  assert.ok(Math.abs(illustrativeLocation('38023:reentry:2024-01-05').latitudeDeg-62.2055135654)<1e-8);
});

test('settings and replacement visualization policy cannot mutate event evidence or orbital assets',async()=>{
  const doc=freeze(json(base+'tracers.json')), before=JSON.stringify(doc), geometry=[];
  const sequence=await loadSequence(doc,timeline,async name=>{const g=freeze(await asset(name));geometry.push([g,JSON.stringify(g)]);return g;});
  configureSequence(sequence,DEFAULTS);
  const eventBytes=sequence.events.map(s=>JSON.stringify(s.event));
  for(const s of sequence.events){assert.ok(Object.isFrozen(s.event.attributes));assert.equal('presentation' in s.event,false);}
  configureSequence(sequence,{...DEFAULTS,markerScale:1,launchFollowSeconds:300,reentryLeadSeconds:1800});
  // Deliberately use a different representation for exactly the same inputs.
  configureSequence(sequence,DEFAULTS,(event,available,settings)=>({
    ...resolveVisualization(event,available,settings),tracer:null,pulse:'symbolic',color:'#ffffff',mode:'symbolic',
  }));
  assert.ok(sequence.events.every(s=>!s.active && s.pulse.color==='#ffffff'));
  configureSequence(sequence,DEFAULTS);
  assert.equal(JSON.stringify(doc),before);
  assert.deepEqual(sequence.events.map(s=>JSON.stringify(s.event)),eventBytes);
  geometry.forEach(([g,saved])=>assert.equal(JSON.stringify(g),saved));
  for(const s of sequence.events){
    if(s.active) assert.equal(s.active.color,EVENT_COLORS[s.event.eventKind]);
    if(s.pulse) assert.equal(s.pulse.color,EVENT_COLORS[s.event.eventKind]);
  }
});

test('launch begins at the sourced pad and its visible origin follows the rotating pad',async()=>{
  const sequence=await launch(), s=sequence.events[0], a=s.active;
  const pad=latLonToVector(s.event.attributes.launchSite.coordinates.latitudeDeg,s.event.attributes.launchSite.coordinates.longitudeDeg);
  assert.ok(distance(normalize(a.sample(s.endMs).head),transform(earthRotation(s.endMs),pad))<1e-12);
  configureSequence(sequence,{...DEFAULTS,trailSeconds:1200});
  const t=s.endMs+600000;
  assert.ok(distance(normalize(a.sample(t).tail[0]),transform(earthRotation(t),pad))<1e-12);
  for(let t=s.endMs;t<=s.endMs+a.ascentMs+1000;t+=5000) {
    const sample=a.sample(t);
    assert.ok(sample.head.every(Number.isFinite));
    assert.ok(sample.tail.every(p=>Math.hypot(...p)>=1));
  }
});

test('ascent joins the orbit without a jump and preserves reference inclination, sizes and period',async()=>{
  const sequence=await launch(), s=sequence.events[0], a=s.active, join=s.endMs+a.ascentMs;
  assert.ok(distance(a.sample(join-1).head,a.sample(join+1).head)<1e-5);
  const p=a.sample(join+10000).head,q=a.sample(join+20000).head;
  const normal=normalize(cross(p,q));
  const tilt=Math.acos(Math.abs(normal[1]))*180/Math.PI;
  assert.ok(Math.abs(tilt-s.event.attributes.orbitReference.inclinationDeg)<1e-7);
  const t=join+123456;
  assert.ok(distance(a.sample(t).head,a.sample(t+a.orbit.loopPeriodMs).head)<1e-10);
  // Linear interpolation of the sampled polygon may lower radius by about 0.13 km.
  const radii=Array.from({length:512},(_,i)=>Math.hypot(...a.sample(join+i*a.orbit.loopPeriodMs/512).head));
  const reference=s.event.attributes.orbitReference, radius=s.loop.referenceSphereRadiusKm;
  assert.ok(Math.abs((Math.min(...radii)-1)*radius-reference.perigeeKm)<0.2);
  assert.ok(Math.abs((Math.max(...radii)-1)*radius-reference.apogeeKm)<0.2);
});

test('policy selects only supported geometry, with a sourced launch pulse when orbit data is absent',async()=>{
  const doc=json(base+'launch.json');doc.events[0].orbitalData={};
  const s=await loadSequence(doc,timeline,()=>{throw Error('No asset should be fetched');});configureSequence(s,DEFAULTS);
  assert.equal(s.events[0].active,null);assert.equal(s.events[0].pulse,s.events[0].pulses.site);
  assert.equal(s.events[0].view.color,EVENT_COLORS.launch);
  assert.equal(resolveVisualization({eventKind:'reentry'},{reference:false,propagatedSeconds:null},DEFAULTS).tracer,null);
});

test('changing history and window length preserves the head and backward seeks exactly',async()=>{
  const sequence=await launch(), s=sequence.events[0], t=s.endMs+300000;
  const expected=s.active.sample(t).head;
  configureSequence(sequence,{...DEFAULTS,launchFollowSeconds:600,trailSeconds:0});
  assert.deepEqual(s.active.sample(t).tail,[expected]);
  s.active.sample(s.endMs+600000);
  assert.deepEqual(s.active.sample(t).head,expected);
  configureSequence(sequence,DEFAULTS);
  assert.deepEqual(s.active.sample(t).head,expected);
});
