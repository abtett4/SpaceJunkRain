import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SimulationClock } from '../web/SimulationClock.js';
import { OrbitalEventFeed } from '../web/OrbitalEventFeed.js';
import { displayAnchor } from '../web/DisplayPolicy.js';
const record=(id,time,kind='reentry')=>({event:{eventId:id,eventKind:kind,object:{noradId:1,name:id},eventTime:{precision:'day'}},displayTimeMs:time});
const setup=(records=[record('a',100),record('b',200),record('c',300)])=>{
  const clock=new SimulationClock({minMs:0,maxMs:1000,nowMs:0,rate:1,requestFrame:()=>1,cancelFrame:()=>{}});
  const errors=[],feed=new OrbitalEventFeed(clock,{onError:e=>errors.push(e)}),batches=[],states=[];
  feed.replace(records,{id:'test'});feed.subscribeCrossings(b=>batches.push(b));feed.subscribeState(s=>states.push(s));
  return {clock,feed,batches,states,errors};
};
const ids=batches=>batches.flatMap(b=>b.events.map(r=>r.event.eventId));

test('forward playback reports all crossed events in order, including the stopping endpoint',()=>{
  const {clock,batches}=setup([record('b',200),record('a',100),record('c',300)]);
  clock.play(300);clock.advance(250);clock.advance(100);
  assert.deepEqual(ids(batches),['a','b','c']);assert.equal(batches[1].playing,false);
  assert.equal(batches[1].nowMs,300);assert.equal(batches[0].previousMs,0);
});
test('pause, resume, zero frames, rate and appearance subscribers do not repeat events',()=>{
  const {clock,batches,feed}=setup();clock.play();clock.advance(100);
  clock.pause();clock.play();clock.advance(0);clock.setRate(2);clock.advance(50);
  feed.subscribeState(()=>{});clock.pause();clock.play();clock.advance(0);
  assert.deepEqual(ids(batches),['a','b']);
});
test('forward and backward seeks are silent; replay can cross the same facts again',()=>{
  const {clock,batches,states}=setup();clock.seek(250);assert.deepEqual(ids(batches),[]);
  clock.play();clock.advance(50);assert.deepEqual(ids(batches),['c']);
  const traversal=states.at(-1).traversal;clock.seek(0);assert.ok(states.at(-1).traversal>traversal);
  clock.advance(300);assert.deepEqual(ids(batches),['c','a','b','c']);
});
test('launch exactly at replay start fires once on play, not on seek or resume',()=>{
  const {clock,batches}=setup([record('launch',100,'launch')]);
  clock.seek(100);assert.equal(batches.length,0);clock.play();
  assert.deepEqual(ids(batches),['launch']);assert.equal(batches[0].reason,'play');
  clock.advance(0);clock.pause();clock.play();clock.advance(1);assert.equal(batches.length,1);
  clock.pause();clock.seek(100);clock.play();assert.equal(batches.length,2);
});
test('seeking to an exact event while playing arms it for the next advancing frame',()=>{
  const {clock,batches}=setup();clock.play();clock.seek(100);clock.advance(0);
  assert.equal(batches.length,0);clock.advance(100);assert.deepEqual(ids(batches),['a','b']);
});
test('timestamp ties are deterministic, preserving launch and reentry of one object',()=>{
  const {clock,batches}=setup([record('1:reentry',100),record('1:launch',100,'launch')]);
  clock.play();clock.advance(100);assert.deepEqual(ids(batches),['1:launch','1:reentry']);
});
test('switching collections clears the old stream without replaying its past events',()=>{
  const {clock,feed,batches,states}=setup();clock.seek(150);const rev=feed.snapshot.revision;
  feed.replace([record('new',200)],{id:'next'});assert.equal(batches.length,0);
  assert.equal(states.at(-1).reason,'collection');assert.ok(feed.snapshot.revision>rev);
  clock.play();clock.advance(200);assert.deepEqual(ids(batches),['new']);
  assert.equal(batches[0].collection.id,'next');feed.replace([]);clock.advance(200);assert.equal(batches.length,1);
});
test('event facts, collection metadata and batches are immutable copies',()=>{
  const rows=[record('a',100)], metadata={id:'test',source:{name:'fixture'}};
  const {clock,feed,batches}=setup([]);feed.replace(rows,metadata);
  rows[0].event.object.name='changed';metadata.source.name='changed';
  clock.play();clock.advance(100);const batch=batches[0];
  assert.equal(batch.events[0].event.object.name,'a');assert.equal(batch.collection.source.name,'fixture');
  assert.throws(()=>{batch.events[0].event.object.name='mutated';},TypeError);
  assert.throws(()=>batch.events.push(record('b',200)),TypeError);
  assert.throws(()=>{batch.rate=100;},TypeError);
});
test('invalid replacement leaves the currently loaded event collection intact',()=>{
  const {clock,feed,batches}=setup();const revision=feed.snapshot.revision;
  for(const records of [[record('x',NaN)],[record('x',1),record('x',2)],[record('x',1,'breakup')]]) assert.throws(()=>feed.replace(records));
  assert.equal(feed.snapshot.revision,revision);clock.play();clock.advance(300);assert.deepEqual(ids(batches),['a','b','c']);
});
test('subscriber exceptions, unsubscribe and disposal do not disrupt other clock users',()=>{
  const {clock,feed,batches,errors}=setup();let other=0,temporary=0;
  clock.subscribe(()=>other++);feed.subscribeCrossings(()=>{throw Error('adapter failed');});
  const off=feed.subscribeCrossings(()=>temporary++);off();clock.play();clock.advance(100);
  assert.equal(errors.length,1);assert.equal(temporary,0);assert.ok(other>0);
  feed.dispose();feed.dispose();clock.advance(200);assert.deepEqual(ids(batches),['a']);
  assert.throws(()=>feed.replace([]),/disposed/);assert.throws(()=>feed.subscribeState(()=>{}),/disposed/);
});
test('a subscriber-triggered seek cannot publish the now-stale crossing batch',()=>{
  const {clock,feed,batches}=setup();let once=true;
  feed.subscribeState(s=>{if(s.reason==='advance'&&once){once=false;clock.seek(0);}});
  clock.play();clock.advance(300);assert.deepEqual(ids(batches),[]);
  clock.advance(300);assert.deepEqual(ids(batches),['a','b','c']);
});
test('a large event index skips empty intervals and retains complete dense crossings',()=>{
  const rows=Array.from({length:20000},(_,i)=>record(String(i),i/20));
  const {clock,batches}=setup(rows);clock.play(999.95);clock.advance(999.95);
  assert.equal(ids(batches).length,20000);assert.equal(new Set(ids(batches)).size,20000);
});
test('real mixed sample emits thirteen events; seeks and settings are not musical triggers',()=>{
  const doc=JSON.parse(readFileSync(new URL('../web/data/samples/april-2018-launch/tracers.json',import.meta.url)));
  const [minMs,maxMs]=doc.sample.intervalUtc.map(Date.parse);
  const clock=new SimulationClock({minMs,maxMs,nowMs:minMs,rate:7200,requestFrame:()=>1,cancelFrame:()=>{}});
  const feed=new OrbitalEventFeed(clock);feed.replace(doc.events.map(event=>({event,displayTimeMs:displayAnchor(event)})));
  const batches=[];feed.subscribeCrossings(b=>batches.push(b));clock.play();clock.advance(96000);
  assert.equal(ids(batches).length,13);assert.equal(batches.flatMap(b=>b.events).filter(r=>r.event.eventKind==='launch').length,1);
  clock.seek(minMs);assert.equal(ids(batches).length,13);clock.play();clock.advance(96000);assert.equal(ids(batches).length,26);
});
