import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulationClock} from '../web/SimulationClock.js';
import {OrbitalEventFeed} from '../web/OrbitalEventFeed.js';
const record=t=>({event:{eventId:String(t),eventKind:'reentry'},displayTimeMs:t});
test('continuation keeps traversal, includes the new boundary once and preserves rate',()=>{
 const clock=new SimulationClock({minMs:0,maxMs:1000,nowMs:0,rate:10800,requestFrame:()=>1,cancelFrame:()=>{}});
 const feed=new OrbitalEventFeed(clock),seen=[];feed.subscribeCrossings(b=>seen.push(...b.events.map(e=>e.displayTimeMs)));
 feed.replace([record(50)],{id:'December'});const traversal=feed.traversal;
 clock.play(100);clock.advance(1);
 feed.replace([record(100),record(150)],{id:'January'},{continuation:true});clock.play(200);clock.advance(1);
 assert.equal(feed.traversal,traversal);assert.equal(clock.rate,10800);assert.deepEqual(seen,[50,100,150]);
 feed.replace([record(300)],{id:'manual'});assert.equal(feed.traversal,traversal+1);
 clock.dispose();feed.dispose();
});
test('next collection can begin after an empty month without a synthetic seek',()=>{
 const clock=new SimulationClock({minMs:0,maxMs:1000,nowMs:0,requestFrame:()=>1,cancelFrame:()=>{}});
 const feed=new OrbitalEventFeed(clock),reasons=[],seen=[];feed.subscribeState(s=>reasons.push(s.reason));feed.subscribeCrossings(b=>seen.push(...b.events.map(e=>e.displayTimeMs)));
 feed.replace([record(50)]);clock.play(100);clock.advance(100);
 feed.replace([record(400)],null,{continuation:true});clock.setPlaybackWindows([[350,400]],[100,500]);clock.play(500);clock.advance(50);clock.advance(0);
 assert.deepEqual(seen,[50,400]);assert(!reasons.includes('seek'));assert.equal(clock.nowMs,500);clock.dispose();feed.dispose();
});
