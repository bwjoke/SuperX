import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {html as modernHTML,ids} from './fixtures/x-redesign.mjs';

// Isolated native-layout fixtures only: no user profile, remote page, API call,
// credential or publishing action is used by this acceptance run.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'artifacts','trigger-guide-preview');
const previewOnly=process.argv.includes('--preview-only');
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{playwright=await import(pathToFileURL(process.env.SUPERX_PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules','playwright','index.mjs')));}
const scripts=['x-dom.js','feed-core.js','ui-i18n.js','overlay-layout.js','marked.umd.js','markdown-renderer.js','draft-composer.js','content.js'];
const sources=Object.fromEntries(await Promise.all(scripts.map(async name=>[name,await readFile(path.join(root,'extension',name),'utf8')])));
const report={environment:'Fresh isolated Chromium; all network requests intercepted; no live X or model calls',checks:[],pageErrors:[],externalRequests:[],screenshots:[]};
const check=(name,passed,details)=>report.checks.push({name,passed:Boolean(passed),...(details===undefined?{}:{details})});
const nativeSelector=modern=>modern?'.post-shell':':is(article[data-testid="tweet"]):not(article article)';
const firstId=modern=>modern?ids.root:'100';
const postSelector=(modern,id=firstId(modern))=>modern?'#fixture-post-'+id:'#post-'+id;
const button=(page,modern,id)=>page.locator(postSelector(modern,id)+' superx-post-check button.post-check');
const guide=page=>page.locator('grok-first-overlay .trigger-guide');
const sent=(page,type)=>page.evaluate(type=>qa.sent.filter(item=>item.type===type),type);
const settle=async page=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForTimeout(100);};
const cached={provider:'api',text:'**Cached finding.** Existing evidence requires no new model request.',sources:[],verificationStatus:'completed',usage:{input_tokens:30,output_tokens:20,total_tokens:50},model:'grok-4.3'};

function legacyHTML({scheme='dark',direction='ltr'}={}){
  const post=id=>`<article id="post-${id}" data-testid="tweet"><div class="post-heading"><div data-testid="User-Name"><a href="/Writer">Fixture Writer <span>@Writer</span></a><a href="/Writer/status/${id}"><time datetime="2026-10-28T00:00:00Z">1h</time></a></div><div class="post-actions"><button data-testid="grok" aria-label="Ask Grok"><svg viewBox="0 0 24 24"><path d="M4 4l16 16M20 4L4 20"/></svg></button><button data-testid="caret" aria-label="More"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button></div></div><div class="post-text" data-testid="tweetText">A fabricated claim in post ${id} for local acceptance.</div><button class="reply" aria-label="Reply">Reply</button></article>`;
  return `<!doctype html><html lang="en" dir="${direction}"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}html{font:15px/1.5 Arial,sans-serif;color-scheme:${scheme};background:${scheme==='dark'?'#000':'#fff'};color:${scheme==='dark'?'#e7e9ea':'#0f1419'}}body{margin:0}.columns{display:flex;direction:ltr;margin-left:70px;width:1000px;align-items:flex-start}main{width:620px;min-width:620px;border-inline:1px solid #536471;min-height:1500px}header{height:56px;padding:12px 16px;border-bottom:1px solid #536471}aside{width:380px;min-width:380px;padding:12px 20px}aside form{height:40px;background:#202327;border-radius:20px;padding:7px 20px}article{padding:14px 16px;border-bottom:1px solid #536471;min-height:240px}.post-heading{display:flex;justify-content:space-between;gap:12px;align-items:center;height:34px;direction:${direction}}[data-testid=User-Name]{display:flex;gap:10px;min-width:0;align-items:center}.post-actions{display:flex;flex:none;align-items:center;gap:4px}.post-actions button{display:grid;place-items:center;border:0;background:transparent;color:#71767b;padding:7px;width:34px;height:34px;cursor:pointer}.post-actions svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2}.post-text{padding:12px 0;min-height:110px}a{color:inherit;text-decoration:none}.reply{background:none;color:inherit;border:0}[hidden]{display:none!important}@media(max-width:1100px){.columns{margin-left:0;width:100%}aside{flex:1;min-width:0}}
  </style></head><body><div class="columns"><main data-testid="primaryColumn"><header><nav role="tablist">For you　Following</nav></header>${[100,101,102].map(post).join('')}</main><aside data-testid="sidebarColumn"><form role="search">Search</form></aside></div></body></html>`;
}

function installMock(initial){
  const listeners=[];
  const stored=localStorage.getItem('fixture-guide-completed')==='true';
  const qa=window.qa={sent:[],settings:initial.settings,completed:stored||initial.completed===true,ready:initial.ready!==false,cache:initial.cache||{},active:new Set()};
  const config=()=>({ok:true,settings:XGrokCore.normalizeSettings(qa.settings),ready:qa.ready,keyState:qa.ready?'ready':'missing',historyEnabled:false,historyEpoch:0,taskRevision:0,used:0,collapsed:false,uiLanguage:initial.language,triggerGuideCompleted:qa.completed,triggerGuidePersisted:qa.completed,credentialIdentity:'',oauthStatus:{state:'disconnected'}});
  qa.emit=message=>listeners.forEach(fn=>fn(message));
  qa.configure=patch=>{qa.settings=XGrokCore.normalizeSettings({...qa.settings,...patch,customTriggers:{...qa.settings.customTriggers,...patch.customTriggers}});qa.emit({type:'CONFIG',...config()});};
  qa.completeFromOtherTab=()=>{qa.completed=true;localStorage.setItem('fixture-guide-completed','true');qa.emit({type:'TRIGGER_GUIDE_STATE',completed:true,persisted:true});};
  qa.finish=id=>{qa.active.delete(id);qa.emit({type:'RESULT',requestId:id,result:{...initial.cached,text:'A completed local result.'}});};
  window.chrome={runtime:{id:'superx-guide-test',getManifest:()=>({version:'1.1.5-test'}),getURL:file=>'https://fixture.superx.test/extension/'+file,sendMessage:async message=>{qa.sent.push(structuredClone(message));return message.type==='GET_CONFIG'?config():{ok:true};},onMessage:{addListener(){}},connect:()=>{
    const port={onMessage:{addListener:fn=>listeners.push(fn)},onDisconnect:{addListener(){}},disconnect(){},postMessage(message){
      qa.sent.push(structuredClone(message));
      if(message.type==='COMPLETE_TRIGGER_GUIDE'){qa.completed=true;localStorage.setItem('fixture-guide-completed','true');queueMicrotask(()=>qa.emit({type:'TRIGGER_GUIDE_STATE',completed:true,persisted:true}));}
      if(message.type==='PING')queueMicrotask(()=>qa.emit({type:'PONG'}));
      if(message.type==='LOOKUP_CACHED_POST')queueMicrotask(()=>qa.emit(qa.cache[message.post.id]?{type:'RESULT',requestId:message.requestId,result:qa.cache[message.post.id],cacheLookup:true,cached:true}:{type:'CACHE_MISS',requestId:message.requestId}));
      if(message.type==='ANALYZE'){qa.active.add(message.requestId);queueMicrotask(()=>qa.emit({type:'START',requestId:message.requestId,used:qa.active.size}));}
      if(message.type==='SET_RAIL_COLLAPSED')queueMicrotask(()=>qa.emit({type:'RAIL_VISIBILITY',collapsed:message.collapsed}));
    }};setTimeout(()=>qa.emit({type:'CONFIG',...config()}),0);return port;
  }},storage:{local:{get:async()=>({})},session:{get:async()=>({}),remove:async()=>{}},onChanged:{addListener(){}}}};
}

let browser;
async function open({modern=false,scheme='dark',direction='ltr',width=1280,language=direction==='rtl'?'ar':'en',settings={},ready=true,completed=false,cache={},url='/home'}={}){
  const context=await browser.newContext({viewport:{width,height:1000},colorScheme:scheme});
  const initial={settings:{provider:'api',enabled:true,triggerMode:'custom',language:'en',interfaceLanguage:language,dwellMs:50,...settings,customTriggers:{manual:true,buttonHover:true,buttonHoverMs:500,postHover:false,postHoverMs:500,detailMain:false,detailReplies:false,...settings.customTriggers}},language,ready,completed,cache,cached};
  await context.addInitScript(installMock,initial);
  await context.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='x.com'&&route.request().isNavigationRequest()){
      let html=modern?modernHTML({scheme,direction}):legacyHTML({scheme,direction});
      if(modern&&direction==='rtl')html=html.replace('</head>','<style>.shell{direction:ltr}.post-heading{direction:rtl}</style></head>');
      return route.fulfill({contentType:'text/html',body:html});
    }
    if(u.hostname==='fixture.superx.test'&&u.pathname==='/extension/assets/superx-symbol.svg')return route.fulfill({contentType:'image/svg+xml',body:await readFile(path.join(root,'extension/assets/superx-symbol.svg'))});
    if(u.hostname==='pbs.twimg.com')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS8AAAAASUVORK5CYII=','base64')});
    report.externalRequests.push(u.origin+u.pathname);return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(error.message));
  await page.goto('https://x.com'+url);
  const native=await page.locator(nativeSelector(modern)).evaluateAll(nodes=>nodes.map(node=>({id:node.id,style:node.getAttribute('style'),height:node.getBoundingClientRect().height})));
  await inject(page);return {context,page,native,modern};
}
async function inject(page){for(const name of scripts)await page.addScriptTag({content:sources[name]});await settle(page);}
async function capture(page,name){const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);}
async function run(name,fn){try{await fn();}catch(error){check(name,false,String(error.stack||error));}}
const shown=async page=>(await guide(page).count())===1&&await guide(page).isVisible();
const completed=async page=>(await sent(page,'COMPLETE_TRIGGER_GUIDE')).length;
await mkdir(output,{recursive:true});
try{
  try{browser=await playwright.chromium.launch({channel:'msedge',headless:true});}catch{browser=await playwright.chromium.launch({headless:true});}
  const variants=previewOnly?[{scheme:'dark',language:'zh-CN'}]:[{scheme:'dark'},{scheme:'light'},{scheme:'dark',direction:'rtl',width:1050},{scheme:'dark',language:'zh-CN'}];
  for(const modern of previewOnly?[true]:[false,true])for(const variant of variants)await run(`layout/${modern}/${JSON.stringify(variant)}`,async()=>{
    const {context,page,native}=await open({modern,...variant});
    check(`${modern?'modern':'legacy'} ${JSON.stringify(variant)}: one guide on the home feed`,await shown(page));
    if(await shown(page)){
      const g=await guide(page).evaluate(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,text:node.textContent,placement:node.dataset.placement,id:node.dataset.postId};});
      const b=await button(page,modern,g.id).boundingBox();
      check('guide stays within viewport',g.left>=4&&g.right<=(variant.width||1280)-4,g);
      check('guide is bounded and points beside its selected button',g.width>=120&&g.width<=300&&g.height<180&&b&&Math.abs((g.placement==='above'?g.bottom:g.top)-(g.placement==='above'?b.y:b.y+b.height))<28,{g,b});
      check('guide copy explicitly offers click or hover',g.text.trim().length>15,g.text);
      await capture(page,`${modern?'modern':'legacy'}-${variant.scheme}-${variant.direction||'ltr'}${variant.language?'-'+variant.language:''}`);
      if(modern&&variant.language==='zh-CN'){
        const actions=await page.locator(postSelector(modern,g.id)+' > article > .post-heading .post-actions').boundingBox();
        const left=Math.max(0,Math.min(g.left,actions.x)-16),top=Math.max(0,Math.min(g.top,actions.y)-16);
        const right=Math.min(variant.width||1280,Math.max(g.right,actions.x+actions.width)+16),bottom=Math.max(g.bottom,actions.y+actions.height)+16;
        const file=path.join(output,'guide-cn.png');await page.screenshot({path:file,clip:{x:left,y:top,width:right-left,height:bottom-top}});report.screenshots.push(file);
      }
    }
    const after=await page.locator(nativeSelector(modern)).evaluateAll(nodes=>nodes.map(node=>({id:node.id,style:node.getAttribute('style'),height:node.getBoundingClientRect().height})));
    check('guide does not alter native post geometry or style',JSON.stringify(native)===JSON.stringify(after),{native,after});
    check('guide causes no model request',!(await sent(page,'ANALYZE')).length);
    await context.close();
  });
  if(!previewOnly){
  for(const modern of [false,true])await run(`activation/${modern}`,async()=>{
    const {context,page}=await open({modern,settings:{triggerMode:'automatic',dwellMs:5000}});
    check('guide starts hidden outside custom mode',!await shown(page));
    await page.evaluate(()=>qa.configure({triggerMode:'custom'}));await settle(page);check('first switch to custom shows the guide',await shown(page));
    await page.evaluate(()=>qa.configure({triggerMode:'paused'}));await settle(page);check('pause hides the guide',!await shown(page));
    await page.evaluate(()=>qa.configure({triggerMode:'custom'}));await settle(page);check('returning to custom before use still guides',await shown(page));
    await button(page,modern).click();await settle(page);
    check('manual button makes one model request and completes guide once',(await sent(page,'ANALYZE')).length===1&&await completed(page)===1);
    check('completed guide disappears',!await shown(page));
    await page.reload();await inject(page);check('completion persists after a page reload',!await shown(page)&&await page.evaluate(()=>qa.completed));
    check('reload does not repeat completion',await completed(page)===0);await context.close();
  });
  for(const modern of [false,true])await run(`hover/${modern}`,async()=>{
    const {context,page}=await open({modern,settings:{customTriggers:{postHover:true,postHoverMs:180,buttonHoverMs:180}}});
    const body=page.locator(postSelector(modern)+(modern?' > article > .text-primary':' > .post-text'));
    await body.hover();await page.waitForTimeout(250);await settle(page);
    check('whole-post hover does not complete the button guide',(await sent(page,'ANALYZE')).some(m=>m.triggerKind==='post-hover')&&await completed(page)===0);
    check('guide remains after an unrelated post-hover trigger',await shown(page));
    await context.close();
    const h=await open({modern,settings:{customTriggers:{buttonHoverMs:180}}});await button(h.page,modern).hover();await h.page.waitForTimeout(250);await settle(h.page);
    check('button hover starts one check and completes guide',(await sent(h.page,'ANALYZE')).length===1&&(await sent(h.page,'ANALYZE'))[0].triggerKind==='button-hover'&&await completed(h.page)===1&&!await shown(h.page));
    await h.context.close();
    const c=await open({modern,cache:{[firstId(modern)]:cached},settings:{customTriggers:{buttonHoverMs:180}}});await button(c.page,modern).hover();await c.page.waitForTimeout(250);await settle(c.page);
    check('hovering an existing result completes learning without paid request',await completed(c.page)===1&&(await sent(c.page,'ANALYZE')).length===0&&!await shown(c.page));await c.context.close();
  });
  for(const modern of [false,true])for(const buttonWait of [180,500])await run(`combined-hover/${modern}/${buttonWait}`,async()=>{
    const {context,page}=await open({modern,settings:{customTriggers:{postHover:true,postHoverMs:180,buttonHover:true,buttonHoverMs:buttonWait}}});
    await button(page,modern).hover();
    await page.waitForTimeout(buttonWait===500?230:300);await settle(page);
    const first=await sent(page,'ANALYZE');
    check(`${modern?'modern':'legacy'} combined ${buttonWait}: first hover starts only one check`,first.length===1,first.map(m=>m.triggerKind));
    if(buttonWait===500){
      check(`${modern?'modern':'legacy'} longer button wait: post timer does not finish the guide early`,await completed(page)===0&&await shown(page));
      await page.waitForTimeout(340);await settle(page);
    }
    check(`${modern?'modern':'legacy'} combined ${buttonWait}: button deadline completes the guide`,await completed(page)===1&&!await shown(page));
    check(`${modern?'modern':'legacy'} combined ${buttonWait}: completion does not issue a second check`,(await sent(page,'ANALYZE')).length===1);
    await context.close();
  });
  await run('lifecycle and optional controls',async()=>{
    const {context,page}=await open({settings:{customTriggers:{buttonHover:false}}});
    check('click-only setting uses a matching instruction',await guide(page).locator('.guide-copy').textContent()===await page.evaluate(()=>GrokFirstUI.t('guide.buttonClick','en')));
    await guide(page).locator('.guide-dismiss').click();await settle(page);check('dismiss hides this page without marking completion',!await shown(page)&&await completed(page)===0&&!await page.evaluate(()=>qa.completed));
    await page.reload();await inject(page);check('page dismissal does not erase the pending first-use guide',await shown(page));
    await page.evaluate(()=>qa.completeFromOtherTab());await settle(page);check('another tab completion hides the current guide',!await shown(page));await context.close();
    for(const opts of [{ready:false},{completed:true},{settings:{customTriggers:{manual:false}}},{url:'/Writer'},{url:'/Writer/status/100'}]){
      const fixture=await open(opts);check('guide hidden when unavailable or not the feed '+JSON.stringify(opts),!await shown(fixture.page));await fixture.context.close();
    }
    const fixture=await open();await fixture.page.evaluate(()=>{const d=document.createElement('div');d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.style.cssText='position:fixed;inset:100px;z-index:50;background:white';d.innerHTML='<textarea aria-label="Write a draft"></textarea>';document.body.append(d);});await settle(fixture.page);check('native modal hides the coachmark',!await shown(fixture.page));await fixture.context.close();
  });
  }
  check('no unexpected external requests',report.externalRequests.length===0,report.externalRequests);
  check('no browser errors',report.pageErrors.length===0,report.pageErrors);
}finally{
  await browser?.close();report.passed=report.checks.filter(item=>item.passed).length;report.failed=report.checks.length-report.passed;
  await writeFile(path.join(output,previewOnly?'preview-report.json':'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,failed:report.failed,pageErrors:report.pageErrors.length,externalRequests:report.externalRequests.length,output},null,2));if(report.failed)process.exitCode=1;
}
