import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {html as modernHTML,ids} from './fixtures/x-redesign.mjs';

// All pages, model replies and billing destinations are synthetic. This tool
// never opens a user profile, contacts a provider, or publishes a post.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'artifacts','usage-errors-preview');
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{playwright=await import(pathToFileURL(process.env.SUPERX_PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules','playwright','index.mjs')));}
const scripts=['x-dom.js','feed-core.js','ui-i18n.js','overlay-layout.js','marked.umd.js','markdown-renderer.js','draft-composer.js','content.js'];
const sources=Object.fromEntries(await Promise.all(scripts.map(async name=>[name,await readFile(path.join(root,'extension',name),'utf8')])));
const usageURL='https://grok.com/dashboard/usage',consoleURL='https://console.x.ai/';
const report={environment:'Fresh isolated browser; synthetic pages and replies; no provider requests or publishing',checks:[],pageErrors:[],externalRequests:[],billingNavigations:[],screenshots:[]};
const check=(name,passed,details)=>report.checks.push({name,passed:Boolean(passed),...(details===undefined?{}:{details})});
const settle=async page=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForTimeout(120);};
const sent=(page,type)=>page.evaluate(type=>qa.sent.filter(item=>item.type===type),type);
const translated=(page,key,language,vars={})=>page.evaluate(({key,language,vars})=>GrokFirstUI.t(key,language,vars),{key,language,vars});
const generationCount=page=>page.evaluate(()=>qa.sent.filter(item=>['ANALYZE','ANALYZE_DRAFT','GENERATE_COMMENTS'].includes(item.type)).length);
const healthy={state:'connected',connected:true,modelAvailable:true,remember:true,catalogModels:[{id:'grok-4.3',efforts:['none','low','high']}]};
const catalog=(diagnostic,cached=false)=>({...healthy,modelAvailable:cached,catalogModels:cached?healthy.catalogModels:[],catalogErrorCode:'OAUTH_CATALOG_UNAVAILABLE',catalogDiagnostics:diagnostic});

function legacyHTML(){return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html{font:15px/1.5 Arial,sans-serif;background:#000;color:#e7e9ea}body{margin:0}.columns{display:flex;margin-left:60px;width:1020px;align-items:flex-start}main{width:620px;min-width:620px;border-inline:1px solid #333;min-height:1300px}header{height:56px;padding:12px 16px;border-bottom:1px solid #333}aside{width:400px;padding:12px 20px}article{padding:14px 16px;border-bottom:1px solid #333;min-height:250px}.post-heading{display:flex;justify-content:space-between;align-items:center;height:34px}[data-testid=User-Name]{display:flex;gap:10px;align-items:center}.post-actions{display:flex;gap:4px}.post-actions button{display:grid;place-items:center;border:0;background:transparent;color:#71767b;width:34px;height:34px;padding:7px}.post-actions svg{width:20px;height:20px;fill:none;stroke:currentColor}.post-text{padding:12px 0;min-height:120px}a{color:inherit;text-decoration:none}[hidden]{display:none!important}
</style></head><body><div class="columns"><main data-testid="primaryColumn"><header>Home</header>${[100,101].map(id=>`<article data-testid="tweet" id="post-${id}"><div class="post-heading"><div data-testid="User-Name"><a href="/Writer">Fixture Writer @Writer</a><a href="/Writer/status/${id}"><time datetime="2026-10-28T00:00:00Z">1h</time></a></div><div class="post-actions"><button data-testid="grok" aria-label="Ask Grok"><svg viewBox="0 0 24 24"><path d="M4 4l16 16M20 4L4 20"/></svg></button><button data-testid="caret" aria-label="More">…</button></div></div><div class="post-text" data-testid="tweetText">A fictional claim for isolated account-error acceptance.</div><button aria-label="Reply">Reply</button></article>`).join('')}</main><aside data-testid="sidebarColumn"><form role="search">Search</form></aside></div></body></html>`;}

function installMock(initial){
  const listeners=[],runtimeListeners=[],storageListeners=[];
  const qa=window.qa={sent:[],status:initial.oauthStatus,settings:initial.settings,language:initial.language,publishes:0};
  const config=()=>({ok:true,settings:globalThis.XGrokCore?XGrokCore.normalizeSettings(qa.settings):qa.settings,ready:initial.ready,keyState:'ready',historyEnabled:false,historyEpoch:0,taskRevision:0,used:0,collapsed:false,uiLanguage:qa.language,triggerGuideCompleted:true,triggerGuidePersisted:true,credentialIdentity:qa.settings.provider==='oauth'?'isolated-test-account':'',oauthStatus:qa.status});
  qa.emit=message=>listeners.forEach(callback=>callback(message));
  qa.setStatus=value=>{qa.status=value;for(const callback of runtimeListeners)callback({type:'OAUTH_STATUS_CHANGED',oauthStatus:value});};
  qa.fail=(requestId,failure)=>qa.emit({type:'ERROR',requestId,code:'API_ERROR',verificationFailure:{stage:'verify',code:'ACCESS',errorCode:'API_ERROR',...failure},requestDiagnostics:{failureOrigin:'http',transportStatus:failure.httpStatus||400,requestedModel:'grok-4.3',requestedEffort:'none'}});
  qa.succeed=requestId=>qa.emit({type:'RESULT',requestId,result:{text:'A completed fixture answer.',sources:[],provider:qa.settings.provider,verificationStatus:'completed',searched:true,usage:{input_tokens:20,output_tokens:10,total_tokens:30},model:'grok-4.3'}});
  const send=async message=>{
    qa.sent.push(structuredClone(message));
    if(message.type==='GET_CONFIG')return config();
    if(message.type==='GET_UI_LANGUAGE')return {ok:true,language:qa.language};
    if(message.type==='GET_OAUTH_STATUS')return {ok:true,oauthStatus:qa.status};
    if(message.type==='GET_SECURITY_STATUS')return {ok:true,keyState:'ready',remember:true,hasSavedKey:false};
    if(message.type==='GET_BUILD_CONNECTION')return {ok:true,configured:false,port:2419};
    if(message.type==='GET_API_DIAGNOSTICS')return {ok:true,entries:[],retentionHours:24,maxEntries:30};
    if(message.type==='OAUTH_REFRESH_CATALOG'){qa.status=initial.healthy;return {ok:true,oauthStatus:qa.status};}
    if(message.type==='SAVE_SETTINGS')qa.settings=message.settings;
    return {ok:true};
  };
  window.chrome={runtime:{id:'superx-isolated-usage-errors',getURL:file=>'https://fixture.superx.test/extension/'+file,getManifest:()=>({version:'1.1.5-isolated'}),sendMessage:send,onMessage:{addListener:fn=>runtimeListeners.push(fn)},connect:()=>{
    const port={onMessage:{addListener:fn=>listeners.push(fn)},onDisconnect:{addListener(){}},disconnect(){},postMessage(message){
      qa.sent.push(structuredClone(message));
      if(message.type==='PING')queueMicrotask(()=>qa.emit({type:'PONG'}));
      if(message.type==='LOOKUP_CACHED_POST')queueMicrotask(()=>qa.emit({type:'CACHE_MISS',requestId:message.requestId}));
      if(['ANALYZE','ANALYZE_DRAFT'].includes(message.type))queueMicrotask(()=>qa.emit({type:'START',requestId:message.requestId,used:1}));
      if(message.type==='SET_RAIL_COLLAPSED')queueMicrotask(()=>qa.emit({type:'RAIL_VISIBILITY',collapsed:message.collapsed}));
    }};setTimeout(()=>qa.emit({type:'CONFIG',...config()}),0);return port;
  }},storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(key=>['settings','uiLanguage'].includes(key)).map(key=>[key,key==='settings'?qa.settings:qa.language]))},session:{get:async()=>({}),remove:async()=>{}},onChanged:{addListener:fn=>storageListeners.push(fn)}},permissions:{request:async()=>false}};
  document.addEventListener('click',event=>{if(event.target.closest?.('.publish'))qa.publishes++;},true);
}

let browser;
async function open({options=false,modern=true,scene='feed',language='en',width=1280,scheme='dark',provider='oauth',oauthStatus=healthy,ready=true}={}){
  const context=await browser.newContext({viewport:{width,height:1000},colorScheme:scheme,locale:language});
  const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(error.message));
  await context.addInitScript(installMock,{settings:{provider,enabled:true,triggerMode:'custom',language:'en',interfaceLanguage:language,dwellMs:50,customTriggers:{manual:true,postHover:false,buttonHover:false,detailMain:false,detailReplies:false}},language,oauthStatus,healthy,ready});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.isNavigationRequest()&&[usageURL,consoleURL].includes(url.href)){
      report.billingNavigations.push(url.href);return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated billing destination</title><p>Offline acceptance destination.</p>'});
    }
    if(url.hostname==='fixture.superx.test'&&url.pathname.startsWith('/extension/')){
      const target=path.resolve(root,url.pathname.slice(1));
      if(target.startsWith(path.join(root,'extension')+path.sep))return route.fulfill({contentType:target.endsWith('.html')?'text/html; charset=utf-8':target.endsWith('.css')?'text/css; charset=utf-8':target.endsWith('.svg')?'image/svg+xml':'text/javascript; charset=utf-8',body:await readFile(target)});
    }
    if(url.hostname==='x.com'&&request.isNavigationRequest()){
      let html=modern?modernHTML({scene,scheme,direction:language==='ar'?'rtl':'ltr'}):legacyHTML();
      if(language==='ar')html=html.replace('</head>','<style>.shell{direction:ltr}.post-heading{direction:rtl}</style></head>');
      return route.fulfill({contentType:'text/html',body:html});
    }
    if(url.hostname==='pbs.twimg.com')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS8AAAAASUVORK5CYII=','base64')});
    report.externalRequests.push(url.origin+url.pathname);return route.abort();
  });
  await page.goto(options?'https://fixture.superx.test/extension/options.html':'https://x.com/home');
  if(!options)await page.evaluate(()=>document.addEventListener('input',event=>{
    if(!event.target.matches('textarea[aria-label="Fixture draft"]'))return;
    const form=event.target.closest('form');form.querySelector('.editor-mirror').textContent=event.target.value;
    form.querySelector('.publish').disabled=!event.target.value.trim();
  }));
  if(!options)for(const name of scripts)await page.addScriptTag({content:sources[name]});
  await settle(page);return {context,page};
}
async function safeLinks(locator,label,expected=[usageURL]){
  const links=await locator.locator('a').evaluateAll(nodes=>nodes.map(a=>({href:a.href,target:a.target,rel:a.rel})));
  check(label+' uses fixed safe destinations',links.length===expected.length&&expected.every(href=>links.some(a=>a.href===href))&&links.every(a=>a.target==='_blank'&&a.rel.split(/\s+/).includes('noopener')&&a.rel.split(/\s+/).includes('noreferrer')),links);
}
async function screenshot(page,name){const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);}
async function run(name,callback){try{await callback();}catch(error){check(name,false,String(error.stack||error));}}
async function noOverflow(locator,label){const sizes=await locator.evaluate(node=>({width:node.clientWidth,scroll:node.scrollWidth}));check(label+' has no horizontal overflow',sizes.scroll<=sizes.width+1,sizes);}

await mkdir(output,{recursive:true});
try{
  try{browser=await playwright.chromium.launch({channel:'msedge',headless:true});}catch{browser=await playwright.chromium.launch({headless:true});}
  const cases=[
    ['quota',{httpStatus:403,providerCode:'insufficient_quota'},'account.quota'],
    ['credits',{httpStatus:402,providerCode:'insufficient_credits'},'account.credits'],
    ['spending',{httpStatus:403,providerCode:'spending_limit'},'account.spending'],
    ['rate',{httpStatus:429,providerCode:'rate_limit_exceeded'},'account.rate'],
    ['limited',{httpStatus:429},'account.limited'],
  ];
  for(const language of ['en','zh-CN','ar'])await run('settings/'+language,async()=>{
    const {context,page}=await open({options:true,language,width:language==='ar'?390:1100,scheme:language==='zh-CN'?'light':'dark',oauthStatus:catalog({reason:'quota',httpStatus:403,providerCode:'insufficient_quota'})});
    for(const [name,diagnostic,key] of [...cases,['access',{reason:'access',httpStatus:403},'oauth.catalogAccess'],['auth',{reason:'auth',httpStatus:401},'oauth.catalogAuth'],['server',{reason:'server',httpStatus:503},'oauth.catalogServer'],['network',{reason:'network'},'oauth.catalogNetwork'],['timeout',{reason:'timeout'},'oauth.catalogTimeout'],['response',{reason:'response'},'oauth.catalogResponse']]){
      await page.evaluate(status=>qa.setStatus(status),catalog({reason:name,...diagnostic}));await settle(page);
      const message=await page.locator('#oauth-model-status').textContent(),expected=await translated(page,key,language);
      check(`settings ${language} ${name}: precise localized message`,message===expected,{message,expected});
      check(`settings ${language} ${name}: login remains connected`,await page.locator('#oauth-status').getAttribute('data-state')==='connected');
      check(`settings ${language} ${name}: usage action is visible`,await page.locator('#oauth-model-usage').isVisible());
      check(`settings ${language} ${name}: unavailable first catalog is not advertised as usable`,await page.locator('#oauth-model option:not([disabled])').count()===0);
    }
    await page.evaluate(status=>qa.setStatus(status),catalog({reason:'rate',httpStatus:429,providerCode:'rate_limit_exceeded',retryAfterSeconds:12},true));await settle(page);
    check(`settings ${language}: Retry-After is described`,(await page.locator('#oauth-model-status').textContent()).includes(await translated(page,'account.retryAfter',language,{seconds:12})));
    check(`settings ${language}: cached models explicitly retained`,await page.locator('#oauth-catalog-cache').isVisible()&&await page.locator('#oauth-model').inputValue()==='grok-4.3');
    await safeLinks(page.locator('#oauth-model-usage'),`settings ${language}`);await noOverflow(page.locator('#oauth-model-usage'),`settings ${language} usage action`);
    check(`settings ${language}: opening and updating errors never generates`,await generationCount(page)===0);
    check(`settings ${language}: usage is not opened automatically`,report.billingNavigations.length===0);
    if(language==='zh-CN'){await page.locator('#oauth-model').scrollIntoViewIfNeeded();await screenshot(page,'settings-zh');}
    await page.locator('#oauth-refresh-models').click();await settle(page);
    check(`settings ${language}: successful refresh clears stale error and usage`,(await page.locator('#oauth-model-status').textContent())===''&&!await page.locator('#oauth-model-usage').isVisible()&&!await page.locator('#oauth-catalog-cache').isVisible());
    check(`settings ${language}: explicit refresh makes no generation request`,await generationCount(page)===0);
    await context.close();
  });
  for(const modern of [false,true])await run('blocked catalog/feed/'+modern,async()=>{
    const language='zh-CN',{context,page}=await open({modern,language,ready:false,oauthStatus:catalog({reason:'credits',httpStatus:402,providerCode:'insufficient_credits'})});
    const card=page.locator('grok-first-card').first();
    check(`blocked catalog ${modern?'modern':'legacy'}: precise account state is shown`,(await card.locator('.status').textContent()).includes(await translated(page,'account.credits',language)));
    check(`blocked catalog ${modern?'modern':'legacy'}: usage action is visible`,await card.locator('.usage-help').isVisible());
    await safeLinks(card.locator('.usage-help'),`blocked catalog ${modern?'modern':'legacy'}`);
    check(`blocked catalog ${modern?'modern':'legacy'}: no provider generation`,await generationCount(page)===0);
    await context.close();
  });
  for(const modern of [false,true])await run('feed/'+modern,async()=>{
    const language=modern?'zh-CN':'en',{context,page}=await open({modern,language,provider:modern?'oauth':'api'});
    const control=page.locator(`${modern?'#fixture-post-'+ids.root:'#post-100'} superx-post-check button.post-check`);
    const card=page.locator('grok-first-card').first();
    for(const [name,failure,key] of cases){
      await control.click();await settle(page);const request=(await sent(page,'ANALYZE')).at(-1);
      if(!request)throw new Error('Native post button did not create the expected local request.');
      const buttonBefore=await control.boundingBox();
      await page.evaluate(({id,failure})=>qa.fail(id,failure),{id:request.requestId,failure});await settle(page);
      check(`feed ${modern?'modern':'legacy'} ${name}: precise localized message`,(await card.locator('.status').textContent())===await translated(page,key,language));
      check(`feed ${modern?'modern':'legacy'} ${name}: usage action is visible`,await card.locator('.usage-help').isVisible());
      await safeLinks(card.locator('.usage-help'),`feed ${modern?'modern':'legacy'} ${name}`,modern?[usageURL]:[usageURL,consoleURL]);
      await noOverflow(card.locator('.card'),`feed ${modern?'modern':'legacy'} ${name}`);
      const buttonAfter=await control.boundingBox();check(`feed ${modern?'modern':'legacy'} ${name}: error actions do not move native controls`,['x','y','width','height'].every(key=>Math.abs(buttonBefore[key]-buttonAfter[key])<1),{buttonBefore,buttonAfter});
    }
    check(`feed ${modern?'modern':'legacy'}: errors do not auto-retry`,(await sent(page,'ANALYZE')).length===cases.length);
    check(`feed ${modern?'modern':'legacy'}: no draft or comment generation`,(await sent(page,'ANALYZE_DRAFT')).length===0&&(await sent(page,'GENERATE_COMMENTS')).length===0);
    if(modern)await screenshot(page,'feed-zh');
    await control.click();await settle(page);const id=(await sent(page,'ANALYZE')).at(-1).requestId;await page.evaluate(id=>qa.succeed(id),id);await settle(page);
    check(`feed ${modern?'modern':'legacy'}: successful retry removes stale usage`,!await card.locator('.usage-help').isVisible());
    await context.close();
  });
  for(const language of ['en','zh-CN','ar'])await run('draft/'+language,async()=>{
    const {context,page}=await open({scene:'home-compose',language,width:language==='ar'?700:1280,provider:language==='en'?'api':'oauth'});
    await page.locator('textarea').fill('A fictional draft claim for offline acceptance.');await settle(page);
    const control=page.locator('superx-draft-action button'),panel=page.locator('superx-draft-panel');
    for(const [index,[name,failure,key]] of cases.entries()){
      if(index===0)await control.click();else await panel.locator('.retry').click();
      await settle(page);const request=(await sent(page,'ANALYZE_DRAFT')).at(-1);if(!request)throw new Error('Draft button did not create the expected local request.');
      const buttonBefore=await page.locator('.publish').boundingBox();
      await page.evaluate(({id,failure})=>qa.fail(id,failure),{id:request.requestId,failure});await settle(page);
      check(`draft ${language} ${name}: precise localized message`,await panel.locator('.state-label').textContent()===await translated(page,key,language));
      check(`draft ${language} ${name}: usage action is visible`,await panel.locator('.usage-help').isVisible());
      await safeLinks(panel.locator('.usage-help'),`draft ${language} ${name}`,language==='en'?[usageURL,consoleURL]:[usageURL]);
      await noOverflow(panel.locator('.panel'),`draft ${language} ${name}`);
      const buttonAfter=await page.locator('.publish').boundingBox();check(`draft ${language} ${name}: error actions do not move native publish controls`,['x','y','width','height'].every(key=>Math.abs(buttonBefore[key]-buttonAfter[key])<1),{buttonBefore,buttonAfter});
    }
    check(`draft ${language}: errors never auto-retry`,(await sent(page,'ANALYZE_DRAFT')).length===cases.length);
    check(`draft ${language}: no native publishing`,await page.evaluate(()=>qa.publishes)===0);
    check(`draft ${language}: no automatic feed or comment request`,(await sent(page,'ANALYZE')).length===0&&(await sent(page,'GENERATE_COMMENTS')).length===0);
    if(language==='zh-CN')await screenshot(page,'draft-zh');
    await panel.locator('.retry').click();await settle(page);const id=(await sent(page,'ANALYZE_DRAFT')).at(-1).requestId;await page.evaluate(id=>qa.succeed(id),id);await settle(page);
    check(`draft ${language}: successful retry removes stale usage`,!await panel.locator('.usage-help').isVisible());
    await context.close();
  });
  await run('explicit usage link navigation',async()=>{
    const {context,page}=await open({options:true,oauthStatus:catalog({reason:'quota',httpStatus:403,providerCode:'insufficient_quota'})});
    const before=report.billingNavigations.length;
    const popupPromise=context.waitForEvent('page');await page.locator('#oauth-model-usage a').click();const popup=await popupPromise;await popup.waitForLoadState();
    check('usage link opens only its fixed destination after user click',report.billingNavigations.length===before+1&&popup.url()===usageURL);
    check('usage destination has no opener access',await popup.evaluate(()=>window.opener===null));
    check('usage link does not trigger model or publish activity',await generationCount(page)===0&&await page.evaluate(()=>qa.publishes)===0);
    await context.close();
  });
}finally{await browser?.close();}
check('no unexpected external request',report.externalRequests.length===0,report.externalRequests);
check('no uncaught browser error',report.pageErrors.length===0,report.pageErrors);
report.passed=report.checks.filter(item=>item.passed).length;report.failed=report.checks.length-report.passed;
await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,failed:report.failed,pageErrors:report.pageErrors.length,externalRequests:report.externalRequests.length,output},null,2));
if(report.failed)process.exitCode=1;
