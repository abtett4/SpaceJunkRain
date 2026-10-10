import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulationClock} from '../web/SimulationClock.js';
import {OrbitalEventFeed} from '../web/OrbitalEventFeed.js';
import {DEFAULTS,normalizePresentation} from '../web/PresentationConfig.js';
const make=()=>new SimulationClock({minMs:0,maxMs:1000,nowMs:0,rate:1,requestFrame:()=>1,cancelFrame:()=>{}});

test('skips initial, intermediate and trailing gaps without consuming active duration',()=>{
 const c=make();c.setPlaybackWindows([[100,200],[400,500]],[0,1000]);c.play(1000);
 c.advance(0);assert.equal(c.nowMs,100);
 c.advance(50);assert.equal(c.nowMs,150);
 c.advance(75);assert.equal(c.nowMs,425);
 c.advance(75);assert.equal(c.nowMs,500);
 c.advance(0);assert.equal(c.nowMs,1000);assert.equal(c.playing,false);
});
test('overlapping windows merge; paused seeks stay put; disabled playback retains quiet time',()=>{
 const c=make();c.setPlaybackWindows([[100,300],[200,400]],[0,1000]);c.play(1000);c.advance(250);assert.equal(c.nowMs,350);
 c.pause();c.seek(450);assert.equal(c.nowMs,450);c.advance(100);assert.equal(c.nowMs,450);
 c.setPlaybackWindows(null);c.play(1000);c.advance(100);assert.equal(c.nowMs,550);
 c.dispose();
});
test('automatic gaps preserve traversal and deliver every event exactly once',()=>{
 const c=make(),feed=new OrbitalEventFeed(c);let seen=[];
 feed.replace([100,200,400,500].map(t=>({event:{eventId:String(t),eventKind:'reentry'},displayTimeMs:t})));
 feed.subscribeCrossings(batch=>seen.push(...batch.events.map(e=>e.displayTimeMs)));
 const traversal=feed.traversal;
 c.setPlaybackWindows([[100,200],[400,500]],[0,1000]);c.play(1000);c.advance(0);c.advance(200);c.advance(0);
 assert.deepEqual(seen,[100,200,400,500]);assert.equal(feed.traversal,traversal);
 c.seek(0);c.play(1000);c.advance(201);assert.deepEqual(seen,[100,200,400,500,100,200,400,500]);
 feed.dispose();c.dispose();
});
test('scope leaves full-catalog playback alone and settings updates replace windows',()=>{
 const c=make();c.setPlaybackWindows([[100,200]],[0,500]);c.play(1000);c.advance(50);assert.equal(c.nowMs,50);
 c.pause();c.seek(0);c.play(500);c.advance(0);assert.equal(c.nowMs,100);
 c.setPlaybackWindows([[300,400]],[0,500]);c.advance(10);assert.equal(c.nowMs,310);
 assert.equal(DEFAULTS.skipQuietIntervals,true);assert.equal(normalizePresentation({skipQuietIntervals:false}).skipQuietIntervals,false);
});
