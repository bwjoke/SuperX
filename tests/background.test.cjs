const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {webcrypto} = require('node:crypto');
const root = path.resolve(__dirname,'../extension');
const event = () => ({listeners:[],addListener(fn){this.listeners.push(fn);}});
const tick = () => new Promise(resolve=>setImmediate(resolve));
async function worker() {
  const local = {}, session = {};
  const storage = data => ({async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>k in data).map(k=>[k,structuredClone(data[k])]))},
    async set(values){Object.assign(data,structuredClone(values));},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete data[key];},async setAccessLevel(){}});
  const runtime = {id:'a'.repeat(32),onConnect:event(),onMessage:event(),getURL:p=>'chrome-extension://'+'a'.repeat(32)+'/'+p,
    sendMessage:async()=>{},openOptionsPage:async()=>{}};
  const chrome = {runtime,storage:{local:storage(local),session:storage(session)},
    tabs:{onRemoved:event(),query:async()=>[]},alarms:{create:async()=>{},onAlarm:event()},i18n:{getUILanguage:()=> 'zh-CN'}};
  const ctx = vm.createContext({chrome,console,crypto:webcrypto,URL,TextEncoder,AbortController,DOMException,setTimeout,clearTimeout,btoa,atob});
  ctx.importScripts = (...files) => {for(const file of files)vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});};
  vm.runInContext(fs.readFileSync(path.join(root,'background.js'),'utf8'),ctx);
  ctx.SuperXCLI.check = async()=>({installed:true,hasLogin:true});
  await vm.runInContext('ready',ctx);
  return {ctx,local,session,runtime};
}
test('Provider readiness does not require API credentials in CLI mode; API mode remains gated',async()=>{
  const {ctx,local}=await worker();
  assert.equal((await vm.runInContext('publicConfig()',ctx)).ready,true);
  await vm.runInContext("saveSettings({...settings,provider:'api'})",ctx);
  assert.equal((await vm.runInContext('publicConfig()',ctx)).ready,false);
  assert.equal(local.settings.provider,'api');
  await vm.runInContext("saveSettings({...settings,provider:'cli'})",ctx);
  assert.equal((await vm.runInContext('publicConfig()',ctx)).ready,true);
});
test('Two no-key analysis requests run serially and persist provider-separated cache',async()=>{
  const {ctx,session,runtime}=await worker();
  const pending=[];
  ctx.SuperXCLI.run = async(post,settings,{signal})=>new Promise((resolve,reject)=>{
    pending.push({post,resolve});signal.addEventListener('abort',()=>reject(signal.reason));
  });
  const messages=[];
  const port={name:'GROKFIRST_FEED',sender:{id:runtime.id,frameId:0,tab:{id:1},url:'https://x.com/home'},
    onMessage:event(),onDisconnect:event(),postMessage:m=>messages.push(m),disconnect(){}};
  runtime.onConnect.listeners[0](port);
  for(let i=0;i<4;i++)await tick();
  for(const id of ['20','21'])port.onMessage.listeners[0]({type:'ANALYZE',requestId:id,post:{id,url:`https://x.com/jack/status/${id}`,text:`visible ${id}`}});
  for(let i=0;i<5;i++)await tick();
  assert.equal(pending.length,1);
  pending[0].resolve({text:'First explanation',provider:'cli',verified:false,searched:false,verificationStatus:'unverified'});
  for(let i=0;i<8;i++)await tick();
  assert.equal(pending.length,2);
  pending[1].resolve({text:'Second explanation',provider:'cli',verified:false,searched:false,verificationStatus:'unverified'});
  for(let i=0;i<8;i++)await tick();
  assert.equal(messages.filter(m=>m.type==='RESULT').length,2);
  assert.equal(Object.values(session.cache).length,2);
  assert.ok(Object.keys(session.cache).every(key=>JSON.parse(key)[1]==='cli'));
  assert.equal(messages.some(m=>m.code==='NEEDS_KEY'),false);
});
test('CLI setup distinguishes missing helper, missing binary and missing login without inference calls',async()=>{
  const {ctx}=await worker();
  ctx.SuperXCLI.run=()=>{throw new Error('Setup must never generate text');};
  for(const [response,status] of [[{installed:false,hasLogin:false},'cli_missing'],[{installed:true,hasLogin:false},'login_required'],[{installed:true,hasLogin:true},'ready']]){
    ctx.SuperXCLI.check=async()=>response;
    await vm.runInContext('refreshCLI(true)',ctx);
    assert.equal(vm.runInContext('cliStatus',ctx),status);
    assert.equal(vm.runInContext('cliReady',ctx),status==='ready');
  }
  ctx.SuperXCLI.check=async()=>{throw new Error('native host not registered');};
  await vm.runInContext('refreshCLI(true)',ctx);
  assert.equal(vm.runInContext('cliStatus',ctx),'bridge_missing');
});
