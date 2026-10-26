import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

// A fresh local browser and fabricated extension transport only. The X-looking
// URLs below are fulfilled by our route handler; no X account or provider runs.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'artifacts','trigger-modes-preview');
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{playwright=await import(pathToFileURL(process.env.SUPERX_PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules','playwright','index.mjs')));}
const {chromium}=playwright;
const focus=['feed','ui','halo','countdown'].includes(process.env.SUPERX_TRIGGER_FOCUS)?process.env.SUPERX_TRIGGER_FOCUS:'all';
const report={scope:focus,environment:'Fresh isolated headless browser; fabricated Chrome runtime; no account, real credentials, model requests or X publishing',checks:[],pageErrors:[],externalRequests:[],screenshots:[]};
const check=(name,value,details)=>report.checks.push({name,passed:Boolean(value),...(details===undefined?{}:{details})});
const scripts=['feed-core.js','ui-i18n.js','overlay-layout.js','marked.umd.js','markdown-renderer.js','draft-composer.js','content.js'];
const allCustom={manual:true,postHover:true,postHoverMs:1000,buttonHover:true,buttonHoverMs:1000,detailMain:true,detailReplies:false};
const post=(id,{quote=false,noGrok=false,nativeHalo=false}={})=>`<article id="post-${id}" data-testid="tweet"><div class="post-header"><div data-testid="User-Name"><a href="/Author">Fixture Author <span>@Author</span></a><a href="/Author/status/${id}"><time datetime="2026-10-26T00:00:00Z">1h</time></a></div><div class="post-actions">${noGrok?'':`<button type="button" data-testid="grok" aria-label="Ask Grok">${nativeHalo?'<span class="native-icon-wrap"><span class="native-halo"></span>':''}<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 3l16 18M20 3L4 21"/></svg>${nativeHalo?'</span>':''}</button>`}<button type="button" data-testid="caret" aria-label="More"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 12h14"/></svg></button></div></div><div data-testid="tweetText" class="post-text" lang="en">A public test claim in post ${id}. This is a fabricated fixture, not a real X post.</div>${quote?'<div role="link" class="quote"><div data-testid="User-Name"><a href="/Quote/status/900"><time datetime="2026-10-25T00:00:00Z">Yesterday</time></a></div><div data-testid="tweetText">Nested quote cannot become a second trigger target.</div></div>':''}<div class="post-bottom"><button type="button" aria-label="Reply">Reply</button></div></article>`;
const draft=`<section class="composer" data-testid="cellInnerDiv"><div class="editor-row"><span class="avatar">U</span><div class="entry"><div role="textbox" data-testid="tweetTextarea_0" contenteditable="true" aria-label="Fixture draft" spellcheck="false"></div></div></div><div data-testid="toolBar" class="draft-tools"><div role="tablist"><button type="button" role="tab" aria-label="Media">▧</button></div><div class="submit-row"><button type="button" data-testid="tweetButtonInline" class="publish">Post</button></div></div></section>`;
function feedHTML({detail=false,draftEditor=false,noGrok=false,scheme='dark',direction='ltr',nativeHalo=false}={}){
  return `<!doctype html><html lang="en" dir="${direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  *{box-sizing:border-box}html{font:15px/1.5 Arial,sans-serif;color-scheme:${scheme};background:${scheme==='dark'?'#000':'#fff'};color:${scheme==='dark'?'#e7e9ea':'#0f1419'}}body{margin:0}.columns{display:flex;direction:ltr;margin-left:70px;width:1000px;align-items:flex-start}main{width:620px;min-width:620px;border-inline:1px solid #536471;min-height:1800px}main>header{height:54px;padding:12px 16px;border-bottom:1px solid #536471}main>header [role=tablist]{display:flex;gap:50px}h1{font-size:20px;margin:0}aside{width:380px;min-width:380px;padding:12px 20px}aside form{height:40px;background:#202327;border-radius:20px;padding:7px 20px}article{padding:14px 16px;border-bottom:1px solid #536471;min-height:216px}.post-header{display:flex;justify-content:space-between;gap:12px;align-items:center;height:34px}.post-header>[data-testid=User-Name]{display:flex;gap:10px;min-width:0;align-items:center}.post-actions{display:flex;flex:none;align-items:center;gap:4px}.post-actions button{display:grid;place-items:center;border:0;background:transparent;color:inherit;padding:7px;width:34px;height:34px;cursor:pointer}.post-actions svg{fill:none;stroke:currentColor;stroke-width:2}.post-text{padding:12px 0;min-height:84px}.post-bottom{display:flex;justify-content:space-between;height:28px}.post-bottom button{border:0;background:transparent;color:inherit}.quote{border:1px solid #536471;border-radius:12px;padding:8px}.quote [data-testid=User-Name]{font-size:12px}a{color:inherit;text-decoration:none}.tail{height:1000px}.composer{padding:16px;border-bottom:1px solid #536471}.editor-row{display:flex;gap:12px}.avatar{width:36px;height:36px;border-radius:50%;background:#536471;display:grid;place-items:center;flex:none}.entry{flex:1;min-width:0}[contenteditable]{min-height:65px;outline:0;font-size:20px}.draft-tools,.submit-row{display:flex;align-items:center;justify-content:space-between;gap:8px}.draft-tools{margin-left:48px}.draft-tools button{border:0;border-radius:20px;padding:8px 14px;background:#eff3f4;color:#0f1419}.submit-row{justify-content:flex-end}[hidden]{display:none!important}
  ${nativeHalo?'.post-actions [data-testid="grok"]{position:relative;width:19.335px;height:20px;padding:0}.native-icon-wrap{position:relative;width:19.335px;height:18.75px;border-radius:9999px;color:#71767b;transition:color .2s}.native-icon-wrap svg{display:block;width:19.335px;height:18.75px}.native-halo{position:absolute;inset:0;margin:-8px;border-radius:999px;pointer-events:none;background:transparent;transition:background-color .2s,box-shadow .2s}.post-actions [data-testid="grok"]:hover .native-icon-wrap{color:#1d9bf0}.post-actions [data-testid="grok"]:hover .native-halo{background:rgba(29,155,240,.1)}.post-actions [data-testid="caret"]{color:#71767b}.post-actions [data-testid="caret"]:hover{color:#1d9bf0}@media(max-width:1050px){.columns{margin-left:0;width:100%}main{width:min(620px,100vw);min-width:0}aside{flex:1;min-width:0}}@media(max-width:620px){aside{display:none}.post-header>[data-testid="User-Name"]{flex-wrap:wrap;gap:2px 6px;font-size:12px}}':''}
  ${nativeHalo&&direction==='rtl'?'.post-header{direction:rtl}':''}
  </style></head><body><div class="columns"><main data-testid="primaryColumn"><header>${detail?'<h1>Post</h1>':'<nav role="tablist"><span>For you</span><span>Following</span></nav>'}</header>${draftEditor?draft:''}${post(100,{quote:true,noGrok,nativeHalo})}${post(101,{noGrok,nativeHalo})}${post(102,{noGrok,nativeHalo})}<div class="tail"></div></main><aside data-testid="sidebarColumn"><form role="search">Search</form></aside></div></body></html>`;
}

function installMock(initial){
  const listeners=[],runtimeListeners=[],storageListeners=[],ports=[];
  const state={settings:initial.settings,uiLanguage:initial.language||'en'};
  const qa=window.qa={sent:[],publishes:0,opened:[],started:new Set(),state,ports,cache:initial.cache||{},holdCache:initial.holdCache===true,deferredCache:[],identity:'fixture-oauth-account-a'};
  const config=()=>({ok:true,settings:window.XGrokCore?XGrokCore.normalizeSettings(state.settings):state.settings,ready:initial.ready!==false,keyState:initial.ready===false?'missing':'ready',historyEnabled:false,historyEpoch:0,taskRevision:0,used:0,collapsed:initial.collapsed===true,uiLanguage:state.uiLanguage,credentialIdentity:state.settings.provider==='oauth'?qa.identity:'',oauthStatus:{state:'connected',connected:true,modelAvailable:true,remember:true,catalogModels:[{id:'grok-4.3',efforts:['none','low','high']}]}});
  qa.emit=message=>{for(const callback of [...listeners])callback(message);};
  qa.configure=patch=>{state.settings=XGrokCore.normalizeSettings({...state.settings,...patch,customTriggers:{...state.settings.customTriggers,...patch.customTriggers}});qa.emit({type:'CONFIG',...config()});for(const callback of runtimeListeners)callback({type:'CONFIG',...config()});};
  qa.start=id=>{qa.started.add(id);qa.emit({type:'START',requestId:id,used:qa.started.size});};
  qa.finish=(id,text='A completed local fact check with source evidence.')=>{qa.started.delete(id);qa.emit({type:'RESULT',requestId:id,result:{provider:'api',text,sources:[],verificationStatus:'completed',usage:{input_tokens:20,output_tokens:10,total_tokens:30},model:'grok-4.3'}});};
  qa.flushCache=()=>{for(const result of qa.deferredCache.splice(0))qa.emit(result);};
  qa.pick=keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(key=>Object.hasOwn(state,key)).map(key=>[key,state[key]]));
  const send=async message=>{
    qa.sent.push(structuredClone(message));
    if(message.type==='GET_CONFIG')return config();
    if(message.type==='GET_UI_LANGUAGE')return {ok:true,language:state.uiLanguage};
    if(message.type==='GET_SECURITY_STATUS')return {ok:true,keyState:initial.ready===false?'missing':'ready',remember:true,hasSavedKey:false};
    if(message.type==='GET_OAUTH_STATUS')return {ok:true,oauthStatus:config().oauthStatus};
    if(message.type==='GET_BUILD_CONNECTION')return {ok:true,configured:false,port:2419};
    if(message.type==='GET_API_DIAGNOSTICS')return {ok:true,entries:[],retentionHours:24,maxEntries:30};
    if(message.type==='SET_TRIGGER_PREFERENCES'||message.type==='SAVE_SETTINGS'){
      const previous=state.settings;
      qa.configure(message.type==='SAVE_SETTINGS'?message.settings:{...(message.triggerMode===undefined?{}:{triggerMode:message.triggerMode}),...(message.customTriggers?{customTriggers:message.customTriggers}:{})});
      for(const callback of storageListeners)callback({settings:{oldValue:previous,newValue:state.settings}},'local');
      return {ok:true,...config()};
    }
    if(['OPEN_SETTINGS','OPEN_HISTORY'].includes(message.type)){qa.opened.push(message.type);return {ok:true};}
    return {ok:true};
  };
  window.chrome={runtime:{id:'superx-isolated-trigger-test',getURL:file=>'https://fixture.superx.test/extension/'+file,getManifest:()=>({version:'local-trigger-candidate'}),sendMessage:send,onMessage:{addListener:callback=>runtimeListeners.push(callback)},connect:()=>{
    const callbacks=[];const port={onMessage:{addListener:callback=>{listeners.push(callback);callbacks.push(callback);}},onDisconnect:{addListener(){}},disconnect(){for(const callback of callbacks){const at=listeners.indexOf(callback);if(at>=0)listeners.splice(at,1);}},postMessage(message){
      qa.sent.push(structuredClone(message));
      if(message.type==='PING')qa.emit({type:'PONG'});
      if(message.type==='LOOKUP_CACHED_POST'){
        const result=qa.cache[message.post?.id],response=result?{type:'RESULT',requestId:message.requestId,result,cached:true,cacheLookup:true}:{type:'CACHE_MISS',requestId:message.requestId};
        if(qa.holdCache)qa.deferredCache.push(response);else queueMicrotask(()=>qa.emit(response));
      }
      if(message.type==='HISTORY_VISIT')qa.emit({type:'HISTORY_ACK',batchId:message.batchId,epoch:message.historyEpoch,ok:true});
      if(message.type==='CANCEL_IF_QUEUED'&&!qa.started.has(message.requestId))qa.emit({type:'ERROR',requestId:message.requestId,code:'CANCELLED'});
      if(message.type==='SET_RAIL_COLLAPSED')qa.emit({type:'RAIL_VISIBILITY',collapsed:message.collapsed});
    }};ports.push(port);setTimeout(()=>qa.emit({type:'CONFIG',...config()}),0);return port;
  }},storage:{local:{get:async keys=>qa.pick(keys)},session:{get:async()=>({}),remove:async()=>{}},onChanged:{addListener:callback=>storageListeners.push(callback)}},permissions:{request:async()=>false}};
}

const settle=async page=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForTimeout(80);};
const analyses=page=>page.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE'));
const icon=(page,id)=>page.locator(`#post-${id} superx-post-check button.post-check`);
const body=(page,id)=>page.locator(`#post-${id} > [data-testid="tweetText"]`);
const cachedFinding=text=>({provider:'api',text,sources:[],verificationStatus:'completed',usage:{input_tokens:500,output_tokens:277,total_tokens:777},usageComplete:true,model:'grok-4.3',completedAt:Date.now()});
const noTriggers={manual:false,postHover:false,buttonHover:false,detailMain:false,detailReplies:false};
const countdown=(page,id=100)=>page.evaluate(id=>{
  const button=document.querySelector(`#post-${id} superx-post-check`)?.shadowRoot?.querySelector('.post-check');
  if(!button)return {active:false,missing:true};
  const progress=button.querySelector('.symbol-progress'),symbol=button.querySelector('.symbol'),style=progress&&getComputedStyle(progress),rect=progress?.getBoundingClientRect(),base=symbol?.getBoundingClientRect(),animation=progress?.getAnimations()[0];
  const clip=style?.clipPath.match(/^inset\(([^)]+)\)$/)?.[1].split(/\s+/)||[],inset=clip.map((part,index)=>parseFloat(part)/(part.endsWith('%')?100:index%2?rect.width:rect.height));
  const values=inset.length===1?[inset[0],inset[0],inset[0],inset[0]]:inset.length===2?[inset[0],inset[1],inset[0],inset[1]]:inset;
  return {active:Boolean(button.dataset.hoverCountdown),trigger:button.dataset.hoverTrigger,clip:style?.clipPath,top:values[0],right:values[1],bottom:values[2],left:values[3],fraction:values.length===4?1-values[1]-values[3]:null,display:style?.display,opacity:style?.opacity,animation:style?.animationName,startTime:animation?.startTime,color:getComputedStyle(button).color,progressColor:style?.backgroundColor,disabled:button.disabled,width:rect?.width,height:rect?.height,baseWidth:base?.width,baseHeight:base?.height,halo:getComputedStyle(button,'::before').backgroundColor};
},id);
let browser;
async function newPage({settings={},ready=true,detail=false,draftEditor=false,noGrok=false,scheme='dark',direction='ltr',viewport={width:1280,height:900},cache={},holdCache=false,collapsed=false,nativeHalo=false,reducedMotion='no-preference'}={}){
  const context=await browser.newContext({viewport,colorScheme:scheme,reducedMotion});
  const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(error.message));
  // Isolate other triggers unless a scenario explicitly enables whole-post hover.
  const initial={settings:{provider:'api',language:'en',interfaceLanguage:'auto',dwellMs:80,triggerMode:'custom',...settings,customTriggers:{...allCustom,postHover:false,...settings.customTriggers}},ready,language:direction==='rtl'?'ar':'en',cache,holdCache,collapsed};
  await page.addInitScript(installMock,initial);
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='x.com'&&route.request().isNavigationRequest()){await route.fulfill({contentType:'text/html',body:feedHTML({detail,draftEditor,noGrok,scheme,direction,nativeHalo})});return;}
    if(url.hostname==='fixture.superx.test'&&/^\/extension\/[\w./-]+$/.test(url.pathname)){
      const target=path.resolve(root,url.pathname.slice(1));if(target.startsWith(path.join(root,'extension')+path.sep)){try{await route.fulfill({contentType:target.endsWith('.svg')?'image/svg+xml':target.endsWith('.css')?'text/css':'text/javascript',body:await readFile(target)});return;}catch{}}
    }
    report.externalRequests.push(url.origin+url.pathname);await route.abort();
  });
  await page.goto(detail?'https://x.com/Author/status/101':'https://x.com/home');
  const native=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('article')].map(article=>[article.id,{height:article.getBoundingClientRect().height,style:article.getAttribute('style')}])));
  for(const script of scripts)await page.addScriptTag({path:path.join(root,'extension',script)});
  await settle(page);return {page,context,native};
}
async function newUISurface(surface,{language='en',scheme='dark',ready=true,width=375}={}){
  const context=await browser.newContext({viewport:{width,height:950},colorScheme:scheme,locale:language==='zh-CN'?'zh-CN':language});
  const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(error.message));
  await page.addInitScript(installMock,{settings:{provider:'api',language:'en',interfaceLanguage:language,triggerMode:'automatic',customTriggers:{...allCustom}},ready,language});
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url()),target=path.resolve(root,url.pathname.slice(1));
    if(url.hostname==='fixture.superx.test'&&url.pathname.startsWith('/extension/')&&target.startsWith(path.join(root,'extension')+path.sep)){
      try{await route.fulfill({contentType:target.endsWith('.html')?'text/html; charset=utf-8':target.endsWith('.css')?'text/css; charset=utf-8':target.endsWith('.svg')?'image/svg+xml':'text/javascript; charset=utf-8',body:await readFile(target)});return;}catch{}
    }
    report.externalRequests.push(url.origin+url.pathname);await route.abort();
  });
  await page.goto(`https://fixture.superx.test/extension/${surface}.html`);await settle(page);
  return {page,context};
}
async function run(name,fn){try{await fn();}catch(error){check(name,false,{error:String(error.stack||error)});}}
async function screenshot(page,name){await page.screenshot({path:path.join(output,name),fullPage:false});report.screenshots.push(name);}
await mkdir(output,{recursive:true});
try{
  try{browser=await chromium.launch({channel:'msedge',headless:true});}catch{browser=await chromium.launch({headless:true});}
  if(focus==='all'||focus==='feed'){
  await run('automatic defaults',async()=>{
    const {page,context}=await newPage({settings:{triggerMode:'automatic'}});await page.waitForTimeout(220);
    check('automatic preserves multi-post visible analysis', (await analyses(page)).length>=2,await analyses(page));
    check('automatic does not add custom header icons',await page.locator('superx-post-check').count()===0);await context.close();
  });
  await run('custom button trigger and geometry',async()=>{
    const {page,context,native}=await newPage({settings:{customTriggers:{postHover:false,buttonHoverMs:180}}});await page.waitForTimeout(220);
    check('custom home remains idle before a trigger', (await analyses(page)).length===0);
    check('one header icon per top-level post, none for quote',await page.locator('superx-post-check').count()===3);
    const layout=await page.evaluate(()=>[...document.querySelectorAll('article')].map(article=>{const host=article.querySelector('superx-post-check'),button=host?.shadowRoot.querySelector('button'),grok=article.querySelector('[data-testid="grok"]'),svg=grok?.querySelector('svg'),mark=button?.querySelector('svg,.mark,.logo,.symbol');return {id:article.id,height:article.getBoundingClientRect().height,style:article.getAttribute('style'),beforeGrok:host?.compareDocumentPosition(grok)&Node.DOCUMENT_POSITION_FOLLOWING,button:button&&{width:button.getBoundingClientRect().width,height:button.getBoundingClientRect().height},grok:grok&&{width:grok.getBoundingClientRect().width,height:grok.getBoundingClientRect().height},mark:mark&&{width:mark.getBoundingClientRect().width,height:mark.getBoundingClientRect().height},svg:svg&&{width:svg.getBoundingClientRect().width,height:svg.getBoundingClientRect().height}};}));
    check('icons precede Grok without changing post height or inline styles',layout.every(item=>item.beforeGrok&&item.height===native[item.id].height&&item.style===native[item.id].style),layout);
    check('icon and target sizes follow native Grok controls',layout.every(item=>item.mark&&Math.abs(item.mark.width-item.svg.width)<=1&&Math.abs(item.button.height-item.grok.height)<=1),layout);
    await body(page,100).hover();await page.waitForTimeout(220);check('disabled body hover does not trigger', (await analyses(page)).length===0);
    await icon(page,100).hover();await page.waitForTimeout(80);check('button hover honors its delay', (await analyses(page)).length===0);
    await page.mouse.move(1150,750);await page.waitForTimeout(170);check('leaving button resets pending hover', (await analyses(page)).length===0);
    await icon(page,100).hover();await page.waitForTimeout(230);let sent=await analyses(page);check('button hover sends one cache-eligible request',sent.length===1&&sent[0].force!==true&&sent[0].triggerKind==='button-hover',sent);
    await page.evaluate(id=>{qa.start(id);qa.finish(id);},sent[0].requestId);await settle(page);
    await page.mouse.move(1150,750);await icon(page,100).hover();await page.waitForTimeout(230);check('hovering completed post does not recheck', (await analyses(page)).length===1);
    await icon(page,100).click();await settle(page);sent=await analyses(page);check('explicit click on completed post rechecks once',sent.length===2&&sent[1].force===true,sent);
    await icon(page,101).focus();await page.keyboard.press('Enter');await settle(page);sent=await analyses(page);check('keyboard first check uses cache eligible manual request',sent.length===3&&sent[2].post.id==='101'&&sent[2].force!==true,sent);
    await screenshot(page,'custom-header-dark.png');await context.close();
  });
  await run('body hover and combined conditions',async()=>{
    const {page,context}=await newPage({settings:{customTriggers:{postHover:true,postHoverMs:180,buttonHover:true,buttonHoverMs:180}}});
    await body(page,100).hover();await page.waitForTimeout(70);await page.mouse.move(1150,750);await page.waitForTimeout(200);check('leaving body resets its independent timer',(await analyses(page)).length===0);
    await body(page,100).hover();await page.waitForTimeout(230);let sent=await analyses(page);check('body hover activates specified post once',sent.length===1&&sent[0].post.id==='100'&&sent[0].triggerKind==='post-hover',sent);
    await icon(page,101).hover();await page.waitForTimeout(240);sent=await analyses(page);check('overlapping body and button conditions deduplicate',sent.filter(item=>item.post.id==='101').length===1,sent);
    await page.mouse.move(1150,750);await body(page,102).hover();await page.waitForTimeout(80);await page.mouse.wheel(0,10);await page.waitForTimeout(100);check('scroll resets continuous hover instead of accumulating',(await analyses(page)).every(item=>item.post.id!=='102'),await analyses(page));
    await context.close();
  });
  await run('independent body hover without a header button',async()=>{
    const {page,context}=await newPage({settings:{customTriggers:{manual:false,postHover:true,postHoverMs:120,buttonHover:true}}});
    check('disabling manual removes header buttons',await page.locator('superx-post-check').count()===0);
    await body(page,100).hover();await page.waitForTimeout(180);const sent=await analyses(page);
    check('body hover works independently of hidden header buttons',sent.length===1&&sent[0].post.id==='100'&&sent[0].triggerKind==='post-hover',sent);await context.close();
  });
  await run('detail main versus ancestor and replies',async()=>{
    const {page,context}=await newPage({detail:true});await page.waitForTimeout(250);let sent=await analyses(page);
    check('default detail auto selects current URL post only',sent.length===1&&sent[0].post.id==='101'&&sent[0].triggerKind==='detail-main',sent);
    await page.evaluate(()=>qa.configure({customTriggers:{detailReplies:true}}));await page.waitForTimeout(250);sent=await analyses(page);
    check('detail replies auto excludes ancestor and nested quote',sent.some(item=>item.post.id==='102')&&sent.every(item=>!['100','900'].includes(item.post.id)),sent);
    await context.close();
  });
  await run('detail reply-only rules',async()=>{
    const {page,context}=await newPage({detail:true,settings:{customTriggers:{manual:false,buttonHover:false,detailMain:false,detailReplies:true}}});await page.waitForTimeout(250);const sent=await analyses(page);
    check('reply-only automatic rule excludes main and ancestors',sent.length===1&&sent[0].post.id==='102'&&sent[0].triggerKind==='detail-reply',sent);await context.close();
  });
  await run('no native Grok fallback',async()=>{
    const {page,context,native}=await newPage({noGrok:true});
    check('safe action-row fallback adds one icon without growing posts',await page.locator('superx-post-check').count()===3&&await page.evaluate(native=>[...document.querySelectorAll('article')].every(article=>article.getBoundingClientRect().height===native[article.id].height),native));
    await context.close();
  });
  await run('mode transitions retain paid work and explicit pending requests',async()=>{
    const {page,context}=await newPage({settings:{customTriggers:{buttonHover:false}}});await icon(page,100).click();await settle(page);let sent=await analyses(page);const id=sent[0]?.requestId;
    await page.evaluate(id=>{qa.start(id);qa.pauseStart=qa.sent.length;},id);await page.evaluate(()=>qa.configure({triggerMode:'paused'}));await settle(page);
    const cancellations=await page.evaluate(id=>qa.sent.slice(qa.pauseStart).filter(message=>['CANCEL','CANCEL_ALL'].includes(message.type)&&(!message.requestId||message.requestId===id)),id);
    check('pause does not cancel an already-started request',cancellations.length===0,cancellations);
    await page.evaluate(id=>qa.finish(id,'This paid answer finished after pausing.'),id);await page.evaluate(()=>qa.configure({triggerMode:'custom'}));await settle(page);
    check('completed answer survives pause and resume',await page.locator('grok-first-card .answer').allTextContents().then(values=>values.some(value=>value.includes('finished after pausing'))));
    await icon(page,101).click();await settle(page);sent=await analyses(page);const pending=sent.find(message=>message.post.id==='101')?.requestId;
    await page.mouse.wheel(0,1000);await page.waitForTimeout(200);
    check('explicit pending request is not withdrawn offscreen',await page.evaluate(id=>!qa.sent.some(message=>['CANCEL','CANCEL_IF_QUEUED'].includes(message.type)&&message.requestId===id),pending));
    await context.close();
  });
  await run('paused retains explicit draft checks',async()=>{
    const {page,context}=await newPage({draftEditor:true,settings:{triggerMode:'paused'}});await page.waitForTimeout(220);
    check('paused starts no post analyses',(await analyses(page)).length===0);
    await page.getByRole('textbox',{name:'Fixture draft'}).fill('An explicit draft fact check.');await settle(page);
    const action=page.locator('superx-draft-action button');check('paused keeps draft check available',await action.count()===1&&await action.isEnabled());
    if(await action.count()&&await action.isEnabled())await action.click();await settle(page);
    check('paused explicit draft sends a draft request only',await page.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1&&qa.sent.filter(message=>message.type==='ANALYZE').length===0));await context.close();
  });
  await run('cached answers appear without custom triggers',async()=>{
    const {page,context}=await newPage({cache:{100:cachedFinding('Cached first visible finding.'),102:cachedFinding('Cached third visible finding.')},settings:{customTriggers:noTriggers}});
    await page.waitForTimeout(150);
    const answers=await page.locator('grok-first-card .answer').allTextContents();
    check('custom with every trigger off still shows visible cached answers',answers.includes('Cached first visible finding.')&&answers.includes('Cached third visible finding.'),answers);
    check('cache-only hits and misses do not submit paid analyses',(await analyses(page)).length===0);
    const before=await page.evaluate(()=>qa.sent.filter(message=>message.type==='LOOKUP_CACHED_POST').length);
    await page.waitForTimeout(450);
    check('cache misses are not polled on every layout tick',before>0&&await page.evaluate(()=>qa.sent.filter(message=>message.type==='LOOKUP_CACHED_POST').length)===before);
    check('cached answer preserves reported usage without a generating state',await page.locator('grok-first-card .token-usage').allTextContents().then(values=>values.some(value=>value.includes('777')))&&await page.locator('grok-first-card [aria-busy="true"]').count()===0);
    await screenshot(page,'custom-cache-visible.png');
    await page.evaluate(()=>qa.configure({triggerMode:'paused'}));await settle(page);
    check('pause preserves readable cached answers without new generation',await page.locator('grok-first-card .answer').filter({hasText:'Cached first visible finding.'}).isVisible()&&(await analyses(page)).length===0);
    await context.close();
  });
  await run('cached replies display despite reply auto being off',async()=>{
    const {page,context}=await newPage({detail:true,cache:{102:cachedFinding('Cached reply remains visible.')},settings:{customTriggers:{...noTriggers}}});await page.waitForTimeout(150);
    check('reply cache is visible without enabling automatic replies',await page.locator('grok-first-card .answer').filter({hasText:'Cached reply remains visible.'}).isVisible());
    check('uncached detail main and reply never create jobs when all triggers are off',(await analyses(page)).length===0);await context.close();
  });
  await run('automatic mode checks cache before submitting',async()=>{
    const {page,context}=await newPage({settings:{triggerMode:'automatic'},cache:{100:cachedFinding('Existing automatic result.')}});await page.waitForTimeout(250);const sent=await analyses(page);
    check('automatic cache hit avoids a provider job for that post',sent.length>=1&&sent.every(message=>message.post.id!=='100'),sent);
    check('automatic cache miss still follows the original trigger rule',sent.some(message=>message.post.id==='101'));await context.close();
  });
  await run('late cached result does not replace a newer active answer',async()=>{
    const {page,context}=await newPage({cache:{100:cachedFinding('Old cached answer must not overwrite progress.')},holdCache:true,settings:{customTriggers:{...noTriggers,manual:true}}});
    await icon(page,100).click();await settle(page);const sent=await analyses(page),id=sent[0]?.requestId;
    check('explicit click remains available during cache-only lookup',sent.length===1&&sent[0].post.id==='100',sent);
    await page.evaluate(id=>{qa.start(id);qa.emit({type:'UPDATE',requestId:id,phase:'verify',text:'New active generation is in progress.'});qa.flushCache();},id);await settle(page);
    const answers=await page.locator('grok-first-card .answer').allTextContents();
    check('late old cache does not overwrite streamed progress',answers.includes('New active generation is in progress.')&&!answers.includes('Old cached answer must not overwrite progress.'),answers);
    await context.close();
  });
  await run('cache response is ignored after recycled post identity',async()=>{
    const {page,context}=await newPage({cache:{100:cachedFinding('Old identity cached finding.')},holdCache:true,settings:{customTriggers:noTriggers}});
    await page.evaluate(()=>{const article=document.getElementById('post-100');article.querySelector('a[href*="/status/"]').href='/Author/status/201';article.querySelector('[data-testid="tweetText"]').textContent='Different recycled post.';});await settle(page);
    await page.evaluate(()=>qa.flushCache());await settle(page);
    check('recycled article cannot receive prior post cached answer',await page.locator('grok-first-card .answer').allTextContents().then(values=>!values.includes('Old identity cached finding.')));
    check('identity changes alone do not generate in custom mode',(await analyses(page)).length===0);await context.close();
  });
  await run('old cached response is ignored after OAuth account replacement',async()=>{
    const {page,context}=await newPage({cache:{100:cachedFinding('Old account cached finding.')},holdCache:true,settings:{provider:'oauth',customTriggers:noTriggers}});
    await page.evaluate(()=>{qa.oldAccountResponses=qa.deferredCache.splice(0);qa.identity='fixture-oauth-account-b';qa.configure({});});await settle(page);
    await page.evaluate(()=>{for(const response of qa.oldAccountResponses)qa.emit(response);});await settle(page);
    check('old account lookup cannot fill the new account result',await page.locator('grok-first-card .answer').allTextContents().then(values=>!values.includes('Old account cached finding.')));
    check('account change does not implicitly analyze custom-mode posts',(await analyses(page)).length===0);await context.close();
  });
  await run('collapsed sidebar defers cache-only work',async()=>{
    const {page,context}=await newPage({collapsed:true,cache:{100:cachedFinding('Deferred cache finding.')},settings:{customTriggers:noTriggers}});await page.waitForTimeout(180);
    check('collapsed view does not repeatedly read unseen cache',await page.evaluate(()=>qa.sent.filter(message=>message.type==='LOOKUP_CACHED_POST').length)===0);
    await page.evaluate(()=>qa.emit({type:'RAIL_VISIBILITY',collapsed:false}));await settle(page);await page.waitForTimeout(120);
    check('expanding restores cached answer without provider work',await page.locator('grok-first-card .answer').filter({hasText:'Deferred cache finding.'}).isVisible()&&(await analyses(page)).length===0);await context.close();
  });
  }
  if(focus==='all'||focus==='feed'||focus==='halo'){
  for(const scheme of ['dark','light'])for(const narrow of [false,true])await run(`post hover halo/${scheme}/${narrow?'narrow-rtl':'desktop-ltr'}`,async()=>{
    const {page,context,native}=await newPage({nativeHalo:true,scheme,direction:narrow?'rtl':'ltr',viewport:{width:narrow?375:1280,height:900},settings:{customTriggers:{postHover:false,buttonHover:false}}});
    const grok=page.locator('#post-100 [data-testid="grok"]'),control=icon(page,100);
    const nativeMarkup=await grok.evaluate(node=>node.outerHTML);
    const paint=()=>page.evaluate(()=>{
      const native=document.querySelector('#post-100 [data-testid="grok"]'),button=document.querySelector('#post-100 superx-post-check').shadowRoot.querySelector('.post-check'),mark=button.querySelector('.symbol');
      const halo=native.querySelector('.native-halo'),svg=native.querySelector('svg'),nativeRect=halo.getBoundingClientRect(),buttonRect=button.getBoundingClientRect(),markRect=mark.getBoundingClientRect(),sx=getComputedStyle(button,'::before');
      const rgba=color=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
      const shift=sx.transform==='none'?{e:0,f:0}:new DOMMatrixReadOnly(sx.transform),width=parseFloat(sx.width),height=parseFloat(sx.height);
      return {nativeColor:rgba(getComputedStyle(svg).color),nativeBackground:rgba(getComputedStyle(halo).backgroundColor),color:rgba(getComputedStyle(mark).color),background:rgba(sx.backgroundColor),width,height,nativeWidth:nativeRect.width,nativeHeight:nativeRect.height,centerX:parseFloat(sx.left)+shift.e+width/2,centerY:parseFloat(sx.top)+shift.f+height/2,boxWidth:buttonRect.width,boxHeight:buttonRect.height,markCenterX:markRect.left-buttonRect.left+markRect.width/2,markCenterY:markRect.top-buttonRect.top+markRect.height/2,outline:getComputedStyle(button).outlineStyle};
    });
    const initial=await paint();
    check(`post halo ${scheme}/${narrow}: idle icon follows native SVG instead of outer button`,JSON.stringify(initial.color)===JSON.stringify(initial.nativeColor)&&initial.background[3]===0,initial);
    check(`post halo ${scheme}/${narrow}: larger native halo stays centered around a small unchanged target`,Math.abs(initial.width-initial.nativeWidth)<1&&Math.abs(initial.height-initial.nativeHeight)<1&&Math.abs(initial.centerX-initial.boxWidth/2)<1&&Math.abs(initial.centerY-initial.boxHeight/2)<1&&Math.abs(initial.markCenterX-initial.boxWidth/2)<1&&Math.abs(initial.markCenterY-initial.boxHeight/2)<1&&initial.boxWidth<initial.width&&initial.boxHeight<initial.height,initial);
    await grok.hover();await page.waitForTimeout(280);const nativeHovered=await paint();
    await control.hover();await page.waitForTimeout(280);const sxHovered=await paint();
    check(`post halo ${scheme}/${narrow}: hovered icon and 10 percent halo match native Grok`,JSON.stringify(sxHovered.color)===JSON.stringify(nativeHovered.nativeColor)&&JSON.stringify(sxHovered.background)===JSON.stringify(nativeHovered.nativeBackground)&&sxHovered.background[3]>=24&&sxHovered.background[3]<=27,{native:nativeHovered,superx:sxHovered});
    await screenshot(page,`post-hover-${scheme}-${narrow?'narrow-rtl':'desktop-ltr'}.png`);
    await page.mouse.move(3,800);await page.waitForTimeout(280);const restored=await paint();
    check(`post halo ${scheme}/${narrow}: leaving restores idle paint and preserves native markup`,JSON.stringify(restored.color)===JSON.stringify(initial.color)&&restored.background[3]===0&&await grok.evaluate(node=>node.outerHTML)===nativeMarkup&&await page.locator('#post-100').evaluate(node=>({height:node.getBoundingClientRect().height,style:node.getAttribute('style')})).then(value=>value.height===native['post-100'].height&&value.style===native['post-100'].style),restored);
    await control.focus();const focused=await paint();
    check(`post halo ${scheme}/${narrow}: focus remains visible and appearance changes do not trigger requests`,focused.outline!=='none'&&(await analyses(page)).length===0,focused);
    await context.close();
  });
  await run('post hover halo without a measurable native halo',async()=>{
    const {page,context}=await newPage({nativeHalo:true,settings:{customTriggers:{postHover:false,buttonHover:false}}});
    await page.locator('.native-halo').evaluateAll(nodes=>nodes.forEach(node=>node.remove()));await settle(page);
    const fallback=await icon(page,100).evaluate(button=>{const halo=getComputedStyle(button,'::before'),svg=document.querySelector('#post-100 [data-testid="grok"] svg').getBoundingClientRect();return {width:parseFloat(halo.width),height:parseFloat(halo.height),expectedWidth:Math.max(34,svg.width+16),expectedHeight:Math.max(34,svg.height+16),slot:button.getBoundingClientRect().width};});
    check('post halo fallback expands only the visual halo around the measured icon',Math.abs(fallback.width-fallback.expectedWidth)<1&&Math.abs(fallback.height-fallback.expectedHeight)<1&&fallback.slot<fallback.width,fallback);
    await context.close();
  });
  await run('post hover halo without Grok while caret is hovered',async()=>{
    const {page,context}=await newPage({nativeHalo:true,noGrok:true,settings:{customTriggers:{postHover:false,buttonHover:false}}});
    const control=icon(page,100),caret=page.locator('#post-100 [data-testid="caret"]');
    const idle=await control.locator('.symbol').evaluate(node=>getComputedStyle(node).color);
    await caret.hover();await page.evaluate(()=>qa.configure({}));await settle(page);
    const during=await control.locator('.symbol').evaluate(node=>getComputedStyle(node).color),nativeHovered=await caret.evaluate(node=>getComputedStyle(node).color);
    check('no-Grok fallback does not adopt the hovered caret color',during===idle&&nativeHovered!==idle,{idle,during,nativeHovered});
    await page.mouse.move(3,800);await settle(page);
    check('no-Grok fallback remains idle after caret mouseout without triggering',await control.locator('.symbol').evaluate(node=>getComputedStyle(node).color)===idle&&(await analyses(page)).length===0);
    await context.close();
  });
  }
  if(focus==='all'||focus==='countdown'){
  for(const scheme of ['dark','light'])for(const narrow of [false,true])await run(`hover countdown/${scheme}/${narrow?'narrow-rtl':'desktop-ltr'}`,async()=>{
    const {page,context}=await newPage({nativeHalo:true,scheme,direction:narrow?'rtl':'ltr',viewport:{width:narrow?375:1280,height:900},settings:{customTriggers:{postHover:false,buttonHover:true,buttonHoverMs:1200}}});
    const control=icon(page,100),idle=await countdown(page);await control.hover();await page.waitForTimeout(200);const first=await countdown(page);
    check(`countdown ${scheme}/${narrow}: enabled hover progressively fills physical left to right`,first.active&&first.trigger==='button-hover'&&first.fraction>.08&&first.fraction<.6&&first.left===0&&first.top===0&&first.bottom===0&&first.right>0,first);
    const box=await control.boundingBox();await page.mouse.move(box.x+box.width/2+2,box.y+box.height/2);await page.waitForTimeout(170);const moved=await countdown(page);
    check(`countdown ${scheme}/${narrow}: pointer movement preserves the original animation deadline`,moved.active&&moved.startTime===first.startTime&&moved.fraction>first.fraction+.05&&(await analyses(page)).length===0,{first,moved});
    check(`countdown ${scheme}/${narrow}: gray base and blue overlay preserve native logo geometry`,first.color===idle.color&&first.progressColor==='rgb(29, 155, 240)'&&Math.abs(first.width-first.baseWidth)<1&&Math.abs(first.height-first.baseHeight)<1,first);
    await screenshot(page,`post-countdown-${scheme}-${narrow?'narrow-rtl':'desktop-ltr'}.png`);
    await page.mouse.move(3,800);await page.waitForTimeout(50);const left=await countdown(page);
    check(`countdown ${scheme}/${narrow}: leaving clears progress without starting a request`,!left.active&&(await analyses(page)).length===0,left);
    await page.evaluate(()=>qa.configure({customTriggers:{buttonHover:false}}));await settle(page);await control.hover();await page.waitForTimeout(250);const ordinary=await countdown(page);
    check(`countdown ${scheme}/${narrow}: ordinary hover retains native blue without a countdown`,!ordinary.active&&ordinary.color==='rgb(29, 155, 240)'&&(await analyses(page)).length===0,ordinary);
    await context.close();
  });
  for(const reset of ['leave','scroll','blur','pause'])await run(`hover countdown reset/${reset}`,async()=>{
    const {page,context}=await newPage({settings:{customTriggers:{postHover:false,buttonHover:true,buttonHoverMs:500}}});
    await icon(page,100).hover();await page.waitForTimeout(80);const started=await countdown(page);
    if(reset==='leave')await page.mouse.move(3,800);
    if(reset==='scroll')await page.mouse.wheel(0,10);
    if(reset==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    if(reset==='pause')await page.evaluate(()=>qa.configure({triggerMode:'paused'}));
    await page.waitForTimeout(50);const cleared=await countdown(page);await page.waitForTimeout(550);
    check(`countdown ${reset}: cancels both visual progress and pending trigger`,started.active&&!cleared.active&&(await analyses(page)).length===0,{started,cleared});await context.close();
  });
  await run('hover countdown competing deadlines',async()=>{
    const {page,context}=await newPage({settings:{customTriggers:{postHover:true,postHoverMs:1800,buttonHover:true,buttonHoverMs:900}}});
    await body(page,100).hover();await page.waitForTimeout(360);const post=await countdown(page);await icon(page,100).hover();await page.waitForTimeout(160);const button=await countdown(page);
    check('countdown follows the earliest active trigger deadline',post.trigger==='post-hover'&&button.active&&button.trigger==='button-hover',{post,button});
    await body(page,100).hover();await page.waitForTimeout(100);const fallback=await countdown(page);
    check('countdown falls back to elapsed post hover without restarting its timer',fallback.active&&fallback.trigger==='post-hover'&&fallback.fraction>.25,{fallback});
    await page.waitForTimeout(720);check('cancelled earlier button deadline does not send a request',(await analyses(page)).length===0,await analyses(page));
    await page.waitForTimeout(600);const sent=await analyses(page);check('original post deadline still sends exactly one request',sent.length===1&&sent[0].triggerKind==='post-hover'&&!(await countdown(page)).active,sent);await context.close();
  });
  await run('hover countdown completed and running answers',async()=>{
    const {page,context}=await newPage({cache:{100:cachedFinding('Existing cached answer.')},settings:{customTriggers:{postHover:false,buttonHover:true,buttonHoverMs:400}}});
    await icon(page,100).hover();await page.waitForTimeout(120);check('cached answer shows no misleading wait or new request',!(await countdown(page)).active&&(await analyses(page)).length===0);
    await icon(page,100).click();await settle(page);const sent=await analyses(page);await page.evaluate(id=>qa.start(id),sent[0].requestId);await settle(page);const running=await countdown(page);
    check('running answer disables the button without a countdown',running.disabled&&!running.active&&sent.length===1,running);await context.close();
  });
  await run('hover countdown missing connection',async()=>{
    const {page,context}=await newPage({ready:false,settings:{customTriggers:{postHover:false,buttonHover:true,buttonHoverMs:200}}});await icon(page,100).hover();await page.waitForTimeout(260);const state=await countdown(page);
    check('disabled button has no countdown or request',state.disabled&&!state.active&&(await analyses(page)).length===0,state);await context.close();
  });
  await run('hover countdown zero delay',async()=>{
    const {page,context}=await newPage({settings:{customTriggers:{postHover:false,buttonHover:true,buttonHoverMs:0}}});await icon(page,100).hover();await page.waitForTimeout(100);const sent=await analyses(page);
    check('zero wait triggers once without a visible countdown',sent.length===1&&sent[0].triggerKind==='button-hover'&&!(await countdown(page)).active,sent);await context.close();
  });
  await run('hover countdown reduced motion',async()=>{
    const {page,context}=await newPage({reducedMotion:'reduce',settings:{customTriggers:{postHover:false,buttonHover:true,buttonHoverMs:500}}});await icon(page,100).hover();await page.waitForTimeout(100);const state=await countdown(page);
    check('reduced motion hides fill animation while preserving the waiting interval',(state.display==='none'||Number(state.opacity)===0)&&state.animation==='none'&&(await analyses(page)).length===0,state);
    await page.waitForTimeout(500);check('reduced motion retains one request at the configured deadline',(await analyses(page)).length===1);await context.close();
  });
  }
  if(focus==='all'||focus==='ui'){
  for(const language of ['en','zh-CN','ar'])for(const scheme of ['dark','light'])await run(`popup/${language}/${scheme}`,async()=>{
    const {page,context}=await newUISurface('popup',{language,scheme,ready:false});
    const selector='#trigger-mode-automatic, #trigger-mode-custom, #trigger-mode-paused';
    check(`popup ${language}/${scheme}: three native radio controls`,await page.locator(selector).count()===3);
    const summaryInitiallyHidden=await page.locator('#custom-trigger-summary').isHidden();
    const automaticHintVisible=await page.locator('#provider-hint').isVisible()&&Boolean((await page.locator('#provider-hint').textContent()).trim());
    await page.locator('#trigger-mode-custom').check();await settle(page);
    check(`popup ${language}/${scheme}: custom is saved without login`,await page.evaluate(()=>qa.state.settings.triggerMode==='custom'&&qa.sent.some(message=>message.type==='SET_TRIGGER_PREFERENCES'&&message.triggerMode==='custom')));
    const summary=await page.locator('#custom-trigger-summary').evaluate(section=>({visible:!section.hidden,rows:[...section.querySelectorAll('dd')].map(node=>({id:node.id,state:node.dataset.state})),controls:section.querySelectorAll('input,button,select,textarea').length}));
    check(`popup ${language}/${scheme}: custom summary is read-only and lists five saved defaults`,summary.visible&&summary.controls===0&&JSON.stringify(summary.rows.map(row=>row.id))===JSON.stringify(['summary-trigger-manual','summary-trigger-button-hover','summary-trigger-post-hover','summary-trigger-detail-main','summary-trigger-detail-replies'])&&JSON.stringify(summary.rows.map(row=>row.state))===JSON.stringify(['on','on','on','on','off']),summary);
    check(`popup ${language}/${scheme}: custom footer is hidden without an empty hint gap`,await page.locator('#provider-hint').isHidden()&&(await page.locator('#provider-hint').textContent())==='');
    if(language==='zh-CN'&&scheme==='dark')await screenshot(page,'popup-zh-CN-custom.png');
    await page.evaluate(()=>qa.configure({customTriggers:{manual:false,postHover:true,postHoverMs:2500,buttonHover:true,buttonHoverMs:700,detailMain:false,detailReplies:true}}));await settle(page);
    const updated=await page.locator('#custom-trigger-summary').evaluate(section=>({states:[...section.querySelectorAll('dd')].map(node=>node.dataset.state),delay:section.querySelector('#summary-trigger-post-hover').textContent,expected:new Intl.NumberFormat(document.documentElement.lang,{maximumFractionDigits:3}).format(2.5),button:section.querySelector('#summary-trigger-button-hover').textContent,expectedButton:new Intl.NumberFormat(document.documentElement.lang,{maximumFractionDigits:3}).format(.7)}));
    check(`popup ${language}/${scheme}: current saved seconds and manual dependency update immediately`,JSON.stringify(updated.states)===JSON.stringify(['off','unavailable','on','off','on'])&&updated.delay.includes(updated.expected)&&updated.button.includes(updated.expectedButton),updated);
    const summaryLayout=await page.locator('#custom-trigger-summary').evaluate(section=>{const box=section.getBoundingClientRect(),mode=document.querySelector('.mode-selector').getBoundingClientRect(),settings=document.querySelector('#options').getBoundingClientRect();return {ordered:box.top>=mode.bottom&&box.bottom<=settings.top,rows:[...section.querySelectorAll('dl>div')].map(row=>{const [label,value]=[...row.children].map(node=>node.getBoundingClientRect());return {separate:Math.min(label.right,value.right)<=Math.max(label.left,value.left)+1,inside:label.left>=box.left&&value.left>=box.left&&label.right<=box.right&&value.right<=box.right};}),fits:document.documentElement.scrollWidth<=document.documentElement.clientWidth};});
    check(`popup ${language}/${scheme}: compact summary fits between modes and settings without overlapping columns`,summaryLayout.ordered&&summaryLayout.fits&&summaryLayout.rows.every(row=>row.separate&&row.inside),summaryLayout);
    await screenshot(page,`popup-${language}-${scheme}-summary.png`);
    await page.locator('#trigger-mode-paused').check();await settle(page);
    check(`popup ${language}/${scheme}: pause remains reachable without login`,await page.evaluate(()=>qa.state.settings.triggerMode==='paused'));
    check(`popup ${language}/${scheme}: summary stays hidden in automatic and paused modes`,summaryInitiallyHidden&&await page.locator('#custom-trigger-summary').isHidden());
    check(`popup ${language}/${scheme}: automatic and paused help remain visible`,automaticHintVisible&&await page.locator('#provider-hint').isVisible()&&Boolean((await page.locator('#provider-hint').textContent()).trim()));
    if(language==='en')check(`popup ${scheme}: Pause action keeps paused status wording`,(await page.locator('#trigger-mode-paused + span').textContent())==='Pause'&&(await page.locator('#enabled-label').textContent())==='Post fact-checking paused'&&await page.locator('#trigger-mode-paused').isChecked());
    const geometry=await page.locator(selector).evaluateAll(nodes=>nodes.map(node=>{const label=node.closest('label')||node;const rect=label.getBoundingClientRect();return {x:rect.x,y:rect.y,width:rect.width,height:rect.height};}));
    check(`popup ${language}/${scheme}: segments share one row without horizontal overflow`,Math.max(...geometry.map(r=>r.y))-Math.min(...geometry.map(r=>r.y))<=1&&await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),geometry);
    if(language==='en'&&scheme==='dark'){
      await page.locator('#trigger-mode-automatic').check();await page.locator('#trigger-mode-automatic').focus();await page.keyboard.press('ArrowRight');await settle(page);
      check('popup keyboard selects the next radio',await page.locator('#trigger-mode-custom').isChecked());
    }
    await screenshot(page,`popup-${language}-${scheme}.png`);await context.close();
  });
  for(const language of ['en','zh-CN','ar'])await run(`settings/${language}`,async()=>{
    const {page,context}=await newUISurface('options',{language,width:390});
    await page.locator('#trigger-mode-custom').check();await settle(page);
    check(`settings ${language}: custom panel appears`,await page.locator('#custom-triggers').isVisible());
    const order=await page.locator('#custom-triggers input[type="checkbox"]').evaluateAll(nodes=>nodes.map(node=>node.id));
    check(`settings ${language}: requested five conditions preserve order`,JSON.stringify(order)===JSON.stringify(['trigger-manual','trigger-button-hover','trigger-post-hover','trigger-detail-main','trigger-detail-replies']),order);
    const cacheHelp=page.locator('#custom-triggers [data-i18n="popup.triggerCached"]');
    check(`settings ${language}: existing-result explanation remains in Settings`,await cacheHelp.isVisible()&&Boolean((await cacheHelp.textContent()).trim()));
    if(language==='en')check('settings: English selector uses Pause action',(await page.locator('#trigger-mode-paused + span').textContent())==='Pause');
    check(`settings ${language}: custom defaults match product decision`,await page.evaluate(()=>document.getElementById('trigger-manual').checked&&document.getElementById('trigger-post-hover').checked&&document.getElementById('trigger-button-hover').checked&&document.getElementById('trigger-detail-main').checked&&!document.getElementById('trigger-detail-replies').checked));
    await page.locator('#trigger-manual').uncheck();await settle(page);
    check(`settings ${language}: hidden manual button disables dependent hover`,await page.locator('#trigger-button-hover').isDisabled()&&await page.locator('#trigger-button-hover').isChecked());
    await page.locator('#trigger-manual').check();await page.locator('#trigger-post-hover').check();
    await page.locator('#trigger-post-hover-seconds').fill('2.5');await page.locator('#trigger-button-hover-seconds').fill('0.7');
    await page.locator('#trigger-mode-automatic').check();await page.locator('#trigger-mode-custom').check();
    check(`settings ${language}: toggling modes preserves unsaved custom choices`,await page.locator('#trigger-post-hover-seconds').inputValue()==='2.5'&&await page.locator('#trigger-button-hover-seconds').inputValue()==='0.7');
    await page.locator('#save').click();await settle(page);
    const saved=await page.evaluate(()=>qa.sent.filter(message=>message.type==='SAVE_SETTINGS').at(-1)?.settings);
    check(`settings ${language}: saved seconds use independent millisecond values`,saved?.triggerMode==='custom'&&saved?.customTriggers?.postHoverMs===2500&&saved?.customTriggers?.buttonHoverMs===700,saved&&{triggerMode:saved.triggerMode,customTriggers:saved.customTriggers});
    check(`settings ${language}: narrow page has no horizontal overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
    const delayGeometry=await page.locator('.trigger-delay').evaluateAll(labels=>labels.map(label=>{const parts=[...label.children].map(child=>{const r=child.getBoundingClientRect();return {tag:child.tagName,left:r.left,right:r.right,width:r.width};}).sort((a,b)=>a.left-b.left);return {parts,overlap:parts.some((part,index)=>index>0&&parts[index-1].right>part.left+1)};}));
    check(`settings ${language}: compact delay fields do not cover their labels`,delayGeometry.every(row=>!row.overlap&&row.parts.find(part=>part.tag==='INPUT')?.width<=90),delayGeometry);
    await page.locator('#custom-triggers').scrollIntoViewIfNeeded();await screenshot(page,`settings-${language}.png`);await context.close();
  });
  }
  check('no external requests attempted',report.externalRequests.length===0,report.externalRequests);check('no browser runtime errors',report.pageErrors.length===0,report.pageErrors);
}finally{
  await browser?.close();report.passed=report.checks.filter(item=>item.passed).length;report.failed=report.checks.length-report.passed;await writeFile(path.join(output,focus==='all'?'report.json':focus+'-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({scope:focus,passed:report.passed,failed:report.failed,pageErrors:report.pageErrors.length,externalRequests:report.externalRequests.length,output},null,2));if(report.failed)process.exitCode=1;
}
