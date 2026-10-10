import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateHistoryIndex,loadHistoryChunk} from '../web/earth/HistoryChunks.js';
import {loadSequence,configureSequence,sequenceAt} from '../web/earth/EventSequence.js';
import {DEFAULTS} from '../web/PresentationConfig.js';
import {SimulationClock} from '../web/SimulationClock.js';
import {OrbitalEventFeed} from '../web/OrbitalEventFeed.js';
const base=new URL('../web/data/history/2018/index.json',import.meta.url);
const index=JSON.parse(readFileSync(base));
const catalog=JSON.parse(readFileSync(new URL('../web/data/decays.json',import.meta.url)));
const read=url=>Promise.resolve(readFileSync(url,'utf8'));

test('all indexed months join their complete catalog intervals with bounded asset requests',async()=>{
  validateHistoryIndex(index);
  let total=0, reentries=0;
  const profile=[];
  for(const chunk of index.chunks){
    const requested=[];
    const before=performance.now();
    const manifest=await loadHistoryChunk(chunk,base,read);
    const sequence=await loadSequence(manifest,catalog,async name=>{
      requested.push(name); return JSON.parse(await read(new URL(name,base)));
    });
    configureSequence(sequence,DEFAULTS);
    const [start,end]=chunk.intervalUtc.map(Date.parse);
    const clock=new SimulationClock({minMs:start,maxMs:end,nowMs:start,rate:7200,requestFrame:()=>1,cancelFrame:()=>{}});
    const feed=new OrbitalEventFeed(clock); let crossed=0;
    feed.replace(sequence.events.map(s=>({event:s.event,displayTimeMs:s.endMs})));
    feed.subscribeCrossings(batch=>crossed+=batch.events.length);
    clock.play(end);clock.advance((end-start)/7200);
    assert.equal(crossed,chunk.eventCount);
    let peak=0; const samplingStart=performance.now();
    for(let frame=0;frame<1000;frame++) peak=Math.max(peak,sequenceAt(sequence,start+(end-start)*frame/999).filter(s=>s.sample).length);
    const sampleMs=performance.now()-samplingStart;
    if(chunk.id!=='2018-04') assert.equal(requested.length,0,'catalog-only months must not request geometry');
    profile.push({month:chunk.id,events:crossed,geometryRequests:requested.length,peakActive:peak,sample1000Ms:Math.round(sampleMs),prepareAndSampleMs:Math.round(performance.now()-before)});
    total+=crossed;reentries+=chunk.reentryCount;feed.dispose();clock.dispose();
  }
  assert.equal(total,252);assert.equal(reentries,251);
  console.log('Historical passage CPU diagnostic (not GPU/FPS):',JSON.stringify(profile));
});

test('invalid, overlapping and unbounded indexes are rejected',()=>{
  for(const change of [x=>x.chunks[0].eventCount=51,x=>x.chunks[1].intervalUtc=x.chunks[0].intervalUtc,
    x=>x.chunks[0].asset='../outside.json',x=>x.defaultChunk='missing']){
    const copy=structuredClone(index);change(copy);assert.throws(()=>validateHistoryIndex(copy));
  }
});

test('a mismatched or truncated chunk fails before geometry loading',async()=>{
  const chunk=index.chunks[0];
  await assert.rejects(loadHistoryChunk(chunk,base,async url=>(await read(url))+' '),/checksum/);
  await assert.rejects(loadHistoryChunk({...chunk,eventCount:chunk.eventCount+1},base,read),/index/);
});
