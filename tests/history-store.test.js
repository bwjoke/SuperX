'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const History=require('../extension/history-store.js');
const clone=value=>structuredClone(value);
const post=id=>({id:String(id),url:`https://x.com/author/status/${id}`,text:`Visible post ${id}`,author:'Author',language:'en',hasMedia:false});
function fixture(initial={},options={}){
  let now=1800000000000;const data=clone(initial),writes=[];
  const storage={async get(keys){if(options.get)await options.get(keys);return Object.fromEntries(keys.filter(key=>Object.hasOwn(data,key)).map(key=>[key,clone(data[key])]));},async set(value){if(options.set)await options.set(value);writes.push(clone(value));Object.assign(data,clone(value));}};
  return {data,writes,storage,store:History.create(storage,{now:()=>now,limits:options.limits}),now:()=>now,advance:ms=>{now+=ms;},restart:()=>History.create(storage,{now:()=>now,limits:options.limits})};
}
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}

test('visible visits persist independently of credentials and survive a fresh store instance',async()=>{
  const f=fixture();assert.equal((await f.store.status()).enabled,true);assert.equal(f.writes.length,0,'Reading an empty history creates no records');
  await f.store.visit([post(100)],0);const first=(await f.store.get()).entries[0];
  assert.equal(first.firstViewedAt,f.now());assert.equal(first.lastViewedAt,f.now());assert.equal(first.visits,1);assert.equal(first.recordId,undefined);
  const restarted=await f.restart().get();assert.deepEqual(restarted.entries,[first]);assert.equal(f.data.apiKey,undefined);
});

test('repeat visits merge by post ID, update visible text, and renew the 24 hour window',async()=>{
  const f=fixture();await f.store.visit([post(100),post(101)],0);const first=f.now();f.advance(23*60*60*1000);
  await f.store.visit([{...post(100),text:'Translated visible text',language:'zh-CN'},post(100)],0);
  const entries=(await f.store.get()).entries;assert.equal(entries.length,2);assert.equal(entries[0].id,'100');assert.equal(entries[0].visits,2);assert.equal(entries[0].firstViewedAt,first);assert.equal(entries[0].language,'zh-CN');
  f.advance(60*60*1000);assert.deepEqual((await f.store.get()).entries.map(entry=>entry.id),['100']);
  f.advance(23*60*60*1000);assert.deepEqual((await f.store.get()).entries,[]);assert.deepEqual(f.data.superxHistory,[]);
});

test('startup and explicit cleanup remove expired and future records durably',async()=>{
  const f=fixture({superxHistory:[{...post(100),recordId:'old',lastViewedAt:1800000000000-History.LIMITS.ttlMs,firstViewedAt:0},{...post(101),lastViewedAt:1800000000001}]});
  assert.equal((await f.store.prune()).count,0);assert.deepEqual(f.data.superxHistory,[]);
});

test('record and byte caps retain recent bounded records and never expose internal identity',async()=>{
  const f=fixture({}, {limits:{maxEntries:3,maxBytes:6000}});
  for(let id=100;id<107;id++){f.advance(1);await f.store.visit([post(id)],0);}
  assert.deepEqual((await f.store.get()).entries.map(entry=>entry.id),['106','105','104']);
  f.advance(1);await f.store.visit([{...post(108),text:'字'.repeat(12000)}],0);
  assert.ok(new TextEncoder().encode(JSON.stringify(f.data.superxHistory)).byteLength<=6000);
  assert.equal(JSON.stringify((await f.store.get()).entries).includes('recordId'),false);
});

test('visit validation keeps safe bounded post metadata and drops media URLs, quotes and unknown fields',async()=>{
  const f=fixture();const input={...post(100),url:'https://twitter.com/Author/status/100',text:'a'.repeat(20000),author:'b'.repeat(1000),language:'en',hasMedia:true,images:[{url:'https://pbs.twimg.com/private.jpg'}],quotedContext:[post(999)],apiKey:'must-not-store',prompt:'must-not-store'};
  await f.store.visit([input,{...post(101),id:'999'},{...post(102),url:'https://example.com/author/status/102'},{...post(103),url:'javascript:alert(1)'}],0);
  const [entry]=(await f.store.get()).entries;assert.equal(entry.url,'https://x.com/author/status/100');assert.equal(entry.text.length,12000);assert.equal(entry.author.length,200);assert.equal(entry.hasMedia,true);
  assert.equal(entry.images,undefined);assert.equal(entry.quotedContext,undefined);assert.equal(entry.apiKey,undefined);assert.equal(entry.prompt,undefined);assert.equal((await f.store.get()).count,1);
});

test('completed analysis, verification metadata and comments attach only to an existing visit',async()=>{
  const f=fixture();assert.equal(await f.store.capture('100'),null);await f.store.analysis(null,{text:'Unvisited answer'});assert.equal((await f.store.get()).count,0);
  await f.store.visit([post(100)],0);const ticket=await f.store.capture('100');
  await f.store.analysis(ticket,{text:'Meaning\n\nFact Check',verificationStart:9,verificationStatus:'completed',language:'en',model:'grok-4.3',usage:{total_tokens:200,apiKey:'bad'},usageByStage:{verify:{total_tokens:100}},modelByStage:{verify:'grok-4.3'},sources:[{url:'https://example.com/evidence',title:'Evidence'},{url:'javascript:alert(1)'}],apiKey:'must-not-store',prompt:'must-not-store'});
  await f.store.comments(ticket,{comments:['First comment','Second comment','Third comment','Fourth ignored'],model:'grok-4.3',language:'en',usage:{total_tokens:40}});
  const entry=(await f.store.get()).entries[0];assert.equal(entry.analysis.text,'Meaning\n\nFact Check');assert.equal(entry.analysis.verificationStart,9);assert.equal(entry.analysis.model,'grok-4.3');assert.equal(entry.analysis.usage.total_tokens,200);assert.equal(entry.analysis.usage.apiKey,undefined);assert.equal(entry.analysis.sources.length,1);assert.equal(entry.comments.length,3);assert.equal(entry.commentsUsage.total_tokens,40);
  assert.equal(JSON.stringify(f.data).includes('must-not-store'),false);assert.equal((await f.restart().get()).entries[0].analysis.text,entry.analysis.text);
});

test('clear invalidates queued batches and late results even after the same post is revisited',async()=>{
  const f=fixture();await f.store.visit([post(100)],0);const old=await f.store.capture('100');await f.store.clear();
  await f.store.visit([post(101)],0);assert.equal((await f.store.get()).count,0);
  await f.store.visit([post(100)],1);await f.store.analysis(old,{text:'Old result'});await f.store.comments(old,{comments:['Old comment']});
  assert.equal((await f.store.get()).entries[0].analysis,undefined);assert.equal((await f.store.get()).entries[0].comments,undefined);
  await f.store.analysis(await f.store.capture('100'),{text:'New result'});assert.equal((await f.store.get()).entries[0].analysis.text,'New result');
});

test('delete blocks resurrection of its record while another in-flight answer stays eligible',async()=>{
  const f=fixture();await f.store.visit([post(100),post(101)],0);const deleted=await f.store.capture('100'),other=await f.store.capture('101');await f.store.delete('100');
  await f.store.visit([post(100)],1);await f.store.analysis(deleted,{text:'Old deleted answer'});await f.store.analysis(other,{text:'Other answer'});
  const entries=(await f.store.get()).entries;assert.equal(entries.find(entry=>entry.id==='100').analysis,undefined);assert.equal(entries.find(entry=>entry.id==='101').analysis.text,'Other answer');
});

test('disable retains existing records, stops new visits and invalidates running results after re-enable',async()=>{
  const f=fixture();await f.store.visit([post(100)],0);const old=await f.store.capture('100');await f.store.setEnabled(false);await f.store.visit([post(101)],1);
  assert.equal(await f.store.capture('100'),null);assert.equal((await f.store.get()).count,1);assert.equal((await f.restart().get()).enabled,false);
  await f.store.setEnabled(true);await f.store.analysis(old,{text:'Late paid answer'});assert.equal((await f.store.get()).entries[0].analysis,undefined);
  await f.store.visit([post(101)],2);assert.equal((await f.store.get()).count,2);
});

test('expired tickets cannot attach a late answer or create a fresh record',async()=>{
  const f=fixture();await f.store.visit([post(100)],0);const ticket=await f.store.capture('100');f.advance(History.LIMITS.ttlMs);
  await f.store.analysis(ticket,{text:'Late answer'});assert.equal((await f.store.get()).count,0);
  await f.store.visit([post(100)],0);await f.store.analysis(ticket,{text:'Still late'});assert.equal((await f.store.get()).entries[0].analysis,undefined);
});

test('a failed storage mutation does not report success or commit memory, and the next operation retries',async()=>{
  let fail=false;const f=fixture({}, {set:async()=>{if(fail)throw new Error('Synthetic disk failure');}});await f.store.visit([post(100)],0);fail=true;
  await assert.rejects(f.store.clear(),/Synthetic disk failure/);assert.equal(f.store.config().epoch,0);assert.equal((await f.store.get()).count,1);
  await assert.rejects(f.store.setEnabled(false));assert.equal(f.store.config().enabled,true);
  fail=false;assert.equal((await f.store.clear()).count,0);assert.deepEqual(f.data.superxHistory,[]);
});

test('visit, clear and later visit writes serialize in receipt order rather than stale snapshots',async()=>{
  const gate=deferred();let held=false;const f=fixture({}, {set:async value=>{if(!held&&value.superxHistory?.some(entry=>entry.id==='100')){held=true;await gate.promise;}}});
  const first=f.store.visit([post(100)],0),clear=f.store.clear(),stale=f.store.visit([post(101)],0);await Promise.resolve();await Promise.resolve();gate.resolve();await Promise.all([first,clear,stale]);
  assert.deepEqual((await f.store.get()).entries,[]);await f.store.visit([post(102)],1);assert.deepEqual(f.data.superxHistory.map(entry=>entry.id),['102']);
});

test('startup storage errors are retryable without discarding a persisted record',async()=>{
  let fail=true;const f=fixture({superxHistory:[{...post(100),recordId:'saved',lastViewedAt:1800000000000,firstViewedAt:1800000000000,visits:1}]},{get:async()=>{if(fail)throw new Error('Read failed');}});
  await assert.rejects(f.store.get());fail=false;assert.equal((await f.store.get()).entries[0].id,'100');
});

test('statuses avoid duplicating the full history payload and returned DTOs cannot mutate storage',async()=>{
  const f=fixture();await f.store.visit([post(100)],0);const status=await f.store.status();assert.equal(status.entries,undefined);assert.equal(status.count,1);
  const response=await f.store.get();response.entries[0].text='Changed externally';response.entries.push(post(101));assert.equal((await f.store.get()).entries[0].text,'Visible post 100');assert.equal((await f.store.get()).count,1);
});

test('DeepSeek browser and Twikit history scopes survive persistence separately from Grok',async()=>{
  const f=fixture();await f.store.visit([post(100),post(101)],0);
  await f.store.analysis(await f.store.capture('100'),{text:'Browser evidence',scope:'api:deepseek-browser'});
  await f.store.analysis(await f.store.capture('101'),{text:'Twikit evidence',scope:'api:deepseek-twikit'});
  const entries=(await f.restart().get()).entries;
  assert.equal(entries.find(e=>e.id==='100').analysis.scope,'api:deepseek-browser');
  assert.equal(entries.find(e=>e.id==='101').analysis.scope,'api:deepseek-twikit');
});
