import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateHistoryIndex,loadHistoryChunk} from '../web/earth/HistoryChunks.js';
import {loadSequence,configureSequence,sequenceAt} from '../web/earth/EventSequence.js';
import {DEFAULTS} from '../web/PresentationConfig.js';
import {SimulationClock} from '../web/SimulationClock.js';
import {OrbitalEventFeed} from '../web/OrbitalEventFeed.js';
const base=new URL('../web/data/history/all/index.json',import.meta.url);
const index=JSON.parse(readFileSync(base));
const catalog=JSON.parse(readFileSync(new URL('../web/data/decays.json',import.meta.url)));

test('full history has complete nonduplicated membership, valid geometry and event crossings',async()=>{
 validateHistoryIndex(index);const seen=new Set();let launches=0,total=0,maxEvents=0;
 const start=performance.now();
 for(const chunk of index.chunks){
  const manifest=await loadHistoryChunk(chunk,base,async url=>readFileSync(url));
  const sequence=await loadSequence(manifest,catalog,async name=>JSON.parse(readFileSync(new URL(name,base)))).catch(error=>{throw new Error(chunk.id+": "+error.message);});
  configureSequence(sequence,DEFAULTS);
  for(const s of sequence.events){
   assert(!seen.has(s.event.eventId));seen.add(s.event.eventId);launches+=s.event.eventKind==='launch';
  }
  const [a,b]=sequence.sample.intervalUtc.map(Date.parse);
  const clock=new SimulationClock({minMs:a,maxMs:b,nowMs:a,requestFrame:()=>1,cancelFrame:()=>{}});
  const feed=new OrbitalEventFeed(clock);let reached=0;
  feed.replace(sequence.events.map(s=>({event:s.event,displayTimeMs:s.endMs})));
  feed.subscribeCrossings(batch=>reached+=batch.events.length);
  clock.setPlaybackWindows(sequence.events.flatMap(s=>[[s.endMs,s.endMs],...(s.active?[[s.active.startMs,s.active.endMs]]:[]),...(s.pulse?[[s.pulse.visibleStartMs,s.pulse.visibleEndMs]]:[])]),[a,b]);
  clock.play(b);clock.advance(b-a+1);assert.equal(reached,chunk.eventCount);
  assert(sequenceAt(sequence,b).every(s=>s.reached));
  total+=reached;maxEvents=Math.max(maxEvents,sequence.events.length);feed.dispose();clock.dispose();
 }
 assert.equal(total,catalog.cols.id.length+1);assert.equal(launches,1);assert.equal(index.reentryCount,catalog.cols.id.length);
 assert.equal(maxEvents,50);
 console.log(JSON.stringify({passages:index.chunks.length,reentries:total-launches,launches,validationMs:Math.round(performance.now()-start)}));
});

test('compressed chunk corruption is rejected',async()=>{
 const chunk=index.chunks[0];
 await assert.rejects(loadHistoryChunk(chunk,base,async url=>readFileSync(url).subarray(1)),/checksum/);
 await assert.rejects(loadHistoryChunk({...chunk,decodedBytes:1},base,async url=>readFileSync(url)),/decoded size/);
});
