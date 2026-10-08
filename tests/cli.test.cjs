const {test} = require('node:test');
const assert = require('node:assert/strict');
const core = require('../extension/feed-core.js');
global.XGrokCore = core;
global.GrokFirstAPI = require('../extension/api-provider.js');
const cli = require('../extension/cli-provider.js');
function native() {
  const listeners = {};
  const port = {onMessage:{addListener:fn=>listeners.message=fn},onDisconnect:{addListener:fn=>listeners.disconnect=fn},
    disconnect(){this.closed=true;},postMessage(message){this.message=message;}};
  global.chrome = {runtime:{connectNative:()=>port}};
  return {port,listeners};
}
test('CLI is default; API selection and customized settings survive normalization',()=>{
  assert.equal(core.normalizeSettings({}).provider,'cli');
  const s=core.normalizeSettings({provider:'api',apiModel:'grok-4.5',language:'zh-CN',explainPrompt:'keep this'});
  assert.equal(s.provider,'api');assert.equal(s.apiModel,'grok-4.5');assert.equal(s.explainPrompt,'keep this');
  assert.equal(core.normalizeSettings({cliModel:'x; touch nope'}).cliModel,'');
});
test('CLI cache attribution changes with visible text; API URL attribution stays stable',()=>{
  const a={id:'20',url:'https://x.com/jack/status/20',text:'one'},b={...a,text:'two'};
  assert.notEqual(core.apiPostIdentity(a,{provider:'cli'}),core.apiPostIdentity(b,{provider:'cli'}));
  assert.equal(core.apiPostIdentity(a,{provider:'api'}),core.apiPostIdentity(b,{provider:'api'}));
});
test('Abort disconnects the native host and ignores a late result',async()=>{
  const {port,listeners}=native(),control=new AbortController();
  const result=cli.request({type:'test'},{signal:control.signal});control.abort();
  await assert.rejects(result,{name:'AbortError'});assert.equal(port.closed,true);
  listeners.message({type:'result',text:'late'});
});
test('Native timeout frees the connection',async()=>{
  const {port}=native();await assert.rejects(cli.request({type:'check'},{timeout:5}),{code:'TIMEOUT'});assert.equal(port.closed,true);
});
test('Disconnect and host errors have bounded public messages',async()=>{
  const {listeners}=native();const result=cli.request({type:'test'});global.chrome.runtime.lastError={message:'private diagnostics'};listeners.disconnect();
  await assert.rejects(result,{code:'CLI_UNAVAILABLE'});
  assert.equal(global.GrokFirstAPI.publicError({code:'not-a-code',message:'secret'}).code,'API_ERROR');
});
test('CLI search completion never upgrades factual verification',async()=>{
  const {listeners}=native();const result=cli.run({id:'20',url:'https://x.com/jack/status/20',text:'hi'},core.normalizeSettings({provider:'cli'}));
  listeners.message({type:'result',text:'Explanation',searched:true});
  assert.equal((await result).verified,false);
});
test('Comment drafts are validated and cannot request web tools',async()=>{
  const {listeners,port}=native();const result=cli.run({id:'20',url:'https://x.com/jack/status/20',text:'hi'}, {...core.normalizeSettings({}),task:'comments'});
  assert.equal(port.message.webSearch,false);listeners.message({type:'result',text:'["a","a","b"]'});
  await assert.rejects(result,{code:'COMMENTS_INVALID_RESPONSE'});
});
test('CLI dwell settings are bounded, persistent and preserve manual-only mode',()=>{
  const defaults=core.normalizeSettings({dwellMs:0});
  assert.equal(defaults.cliAutoAnalyze,true);assert.equal(defaults.cliDwellSeconds,5);
  const saved=core.normalizeSettings({cliAutoAnalyze:false,cliDwellSeconds:17});
  assert.deepEqual(core.normalizeSettings(saved),saved);
  assert.equal(core.normalizeSettings({cliDwellSeconds:0}).cliDwellSeconds,1);
  assert.equal(core.normalizeSettings({cliDwellSeconds:99999}).cliDwellSeconds,300);
  assert.equal(core.normalizeSettings({cliDwellSeconds:'invalid'}).cliDwellSeconds,5);
});
test('CLI requires continuous readable dwell; leaving and manual mode discard elapsed time',()=>{
  const s=core.normalizeSettings({cliDwellSeconds:5}),entry={since:0};
  assert.equal(core.cliDwellReady(entry,s,true,1000),false);
  assert.equal(core.cliDwellReady(entry,s,true,5999),false);
  assert.equal(core.cliDwellReady(entry,s,true,6000),true);
  assert.equal(core.cliDwellReady(entry,s,false,6100),false);
  assert.equal(core.cliDwellReady(entry,s,true,9000),false);
  assert.equal(core.cliDwellReady(entry,s,true,13999),false);
  assert.equal(core.cliDwellReady(entry,s,true,14000),true);
  assert.equal(core.cliDwellReady(entry,{...s,cliAutoAnalyze:false},true,99000),false);
  assert.equal(entry.since,0);
  assert.equal(core.visibilityEligibility({top:790,left:0,width:600,height:700},{height:800,width:1400}).eligible,false);
});
