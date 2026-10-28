import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {html,ids} from './fixtures/x-redesign.mjs';

// A private, route-fulfilled browser fixture: no user profile, credentials,
// model traffic or public posts. Exercises native preview DOM and real events.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'artifacts','media-regressions');
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{playwright=await import(pathToFileURL(process.env.SUPERX_PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules','playwright','index.mjs')));}
const report={environment:'Isolated synthetic X preview; every network request intercepted',checks:[],errors:[],externalRequests:[]};
const check=(name,value)=>{report.checks.push({name,passed:Boolean(value)});assert.ok(value,name);};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS8AAAAASUVORK5CYII=','base64');
const scripts=['x-dom.js','feed-core.js','ui-i18n.js','overlay-layout.js','marked.umd.js','markdown-renderer.js','draft-composer.js','content.js'];
let browser;
try{browser=await playwright.chromium.launch({channel:'msedge',headless:true});}catch{browser=await playwright.chromium.launch({headless:true});}
await mkdir(output,{recursive:true});
try{
  const context=await browser.newContext({viewport:{width:1400,height:1100}}),page=await context.newPage();
  page.on('pageerror',error=>report.errors.push(error.message));
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='x.com')return route.fulfill({contentType:'text/html',body:html({scene:'reply-modal'})});
    if(url.hostname==='pbs.twimg.com')return route.fulfill({contentType:'image/png',body:png});
    if(url.hostname==='fixture.superx.test')return route.fulfill({contentType:'image/svg+xml',body:await readFile(path.join(root,'extension/assets/superx-symbol.svg'))});
    report.externalRequests.push(url.origin+url.pathname);return route.abort();
  });
  await page.addInitScript(()=>{
    const listeners=[],qa=window.qa={sent:[],publishes:0};
    const config=()=>({settings:XGrokCore.normalizeSettings({provider:'api',enabled:true,triggerMode:'custom',language:'en',customTriggers:{manual:true,postHover:false,buttonHover:false,detailMain:false,detailReplies:false}}),ready:true,keyState:'ready',historyEnabled:false,historyEpoch:0,taskRevision:0,used:0,collapsed:false,credentialIdentity:''});
    qa.emit=message=>listeners.forEach(fn=>fn(message));
    window.chrome={runtime:{id:'isolated-media-test',getManifest:()=>({version:'test'}),getURL:file=>'https://fixture.superx.test/'+file,sendMessage:async()=>({ok:true,...config()}),connect:()=>{setTimeout(()=>qa.emit({type:'CONFIG',...config()}),0);return{onMessage:{addListener:fn=>listeners.push(fn)},onDisconnect:{addListener(){}},disconnect(){},postMessage(message){qa.sent.push(structuredClone(message));if(message.type==='LOOKUP_CACHED_POST')queueMicrotask(()=>qa.emit({type:'CACHE_MISS',requestId:message.requestId}));}};}},storage:{local:{get:async()=>({})},session:{get:async()=>({})},onChanged:{addListener(){}}}};
  });
  await page.goto('https://x.com/compose/post?in_reply_to='+ids.root);
  await page.evaluate(()=>{document.querySelectorAll('form').forEach(form=>form.addEventListener('submit',event=>{event.preventDefault();qa.publishes++;}));document.querySelector('textarea').addEventListener('input',event=>{event.target.previousElementSibling.textContent=event.target.value;event.target.closest('form').querySelector('.publish').disabled=!event.target.value.trim();});});
  for(const name of scripts)await page.addScriptTag({content:await readFile(path.join(root,'extension',name),'utf8')});
  const settle=()=>page.waitForTimeout(120);
  const requests=()=>page.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT'));
  const finish=async()=>{const last=(await requests()).at(-1);await page.evaluate(id=>{qa.emit({type:'START',requestId:id});qa.emit({type:'RESULT',requestId:id,result:{provider:'api',text:'Fixture finding',sources:[],verificationStatus:'completed',usage:{total_tokens:1}}});},last.requestId);await settle();};
  await page.locator('[role="dialog"] textarea').fill('Does the preceding claim hold up?');await settle();
  await page.locator('superx-draft-action button').click();await settle();
  check('initial linkless parent is identified', (await requests()).at(-1)?.draft.context?.id===ids.root);
  await finish();
  await page.evaluate(id=>{
    history.pushState({},'', '/compose/post?in_reply_to='+id);window.dispatchEvent(new PopStateEvent('popstate'));
    const image=document.createElement('img');image.src='https://pbs.twimg.com/media/old-parent-now-loaded.jpg';document.querySelector('.parent-preview').append(image);
  },ids.second);await settle();
  check('media hydration does not automatically issue another draft check',(await requests()).length===1);
  await page.locator('superx-draft-action button').click();await settle();
  const changed=(await requests()).at(-1)?.draft.context;
  check('new target never inherits old parent text after image hydration',changed?.id===ids.second&&!changed.text);
  check('new target never inherits old parent image after image hydration',!changed?.images?.length);
  await finish();
  await page.locator('.parent-preview .whitespace-pre-wrap').evaluate(el=>el.textContent+=' More of the same old parent post was expanded.');await settle();
  await page.locator('superx-draft-panel button').filter({hasText:'Check again'}).click();await settle();
  check('expanding the old parent does not reassign it to the new target',!(await requests()).at(-1)?.draft.context?.text);
  await finish();
  await page.evaluate(()=>{document.querySelector('.parent-preview .whitespace-pre-wrap').textContent='The newly selected parent concerns a different claim.';document.querySelector('.parent-preview img').remove();});await settle();
  await page.locator('superx-draft-panel button').filter({hasText:'Check again'}).click();await settle();
  check('distinct new preview text becomes the new target context',(await requests()).at(-1)?.draft.context?.text==='The newly selected parent concerns a different claim.');
  check('native publishing was never activated',await page.evaluate(()=>qa.publishes===0));
  check('no page errors',report.errors.length===0);check('no external requests',report.externalRequests.length===0);
  await context.close();
}finally{await browser.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({checks:report.checks.length,passed:report.checks.every(item=>item.passed),output},null,2));
