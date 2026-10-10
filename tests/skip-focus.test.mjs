import test from 'node:test';
import assert from 'node:assert/strict';
import {longitudeOffset,skipFocusDirection} from '../web/earth/SkipFocus.js';
import {latLonToVector,vectorToLatLon,inverseRotation,wrapLongitude} from '../web/earth/GeoMath.js';
import {earthRotation} from '../web/earth/EarthOrientation.js';
import {SimulationClock} from '../web/SimulationClock.js';
test('persistent offsets stay strictly inside plus/minus 45 degrees',()=>{
 const offsets=Array.from({length:10000},(_,i)=>longitudeOffset(String(i)));
 assert.ok(offsets.every(n=>n>-45&&n<45));assert.ok(offsets.some(n=>n<0)&&offsets.some(n=>n>0));
 assert.equal(longitudeOffset('example'),longitudeOffset('example'));
});
test('camera focuses pulse longitude across dateline at the current Earth rotation',()=>{
 const sequence={events:[{event:{eventId:'example'},endMs:200,pulse:{visibleStartMs:100,visibleEndMs:200,normal:latLonToVector(35,179)}}]};
 const direction=skipFocusDirection(sequence,100,150);
 const geo=vectorToLatLon(inverseRotation(earthRotation(150),direction));
 assert.ok(Math.abs(geo.lat-35)<1e-8);
 assert.ok(Math.abs(wrapLongitude(geo.lon-179)-longitudeOffset('example'))<1e-8);
 assert.equal(skipFocusDirection(sequence,250,250),null);
});
test('clock reports actual gap landings only, including zero-budget initial skip',()=>{
 const c=new SimulationClock({minMs:0,maxMs:1000,nowMs:0,rate:1,requestFrame:()=>1,cancelFrame:()=>{}});let state;
 c.subscribe(s=>state=s);c.setPlaybackWindows([[100,200],[400,500]],[0,1000]);c.play(1000);
 c.advance(0);assert.equal(state.skippedToMs,100);
 c.advance(50);assert.equal(state.skippedToMs,null);
 c.advance(75);assert.equal(state.skippedToMs,400);
 c.setPlaybackWindows(null);c.advance(10);assert.equal(state.skippedToMs,null);
 c.seek(600);assert.equal(state.skippedToMs,undefined);c.dispose();
});
