import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {html,ids,post,composer} from './fixtures/x-redesign.mjs';

// Fresh browser + route-fulfilled synthetic X pages. Never opens a user profile
// and never transmits a draft, post, credential, or request to a provider.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'artifacts','x-redesign-compat');
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{playwright=await import(pathToFileURL(process.env.SUPERX_PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules','playwright','index.mjs')));}
const scripts=['x-dom.js','feed-core.js','ui-i18n.js','overlay-layout.js','marked.umd.js','markdown-renderer.js','draft-composer.js','content.js'];
const bodies=Object.fromEntries(await Promise.all(scripts.map(async name=>[name,await readFile(path.join(root,'extension',name),'utf8')])));
const report={environment:'Fresh isolated Chromium; intercepted fixtures only; no account, credentials or provider requests',checks:[],errors:[],externalRequests:[],mediaRequests:[],screenshots:[]};
const check=(name,value,details)=>report.checks.push({name,passed:Boolean(value),...(details===undefined?{}:{details})});
const cached={provider:'api',text:'**Cached finding.** This result already exists and costs no new request.',sources:[],verificationStatus:'completed',usage:{input_tokens:30,output_tokens:20,total_tokens:50},model:'grok-4.3'};
function installMock(initial){
  const listeners=[];
  const qa=window.qa={sent:[],publishes:0,settings:initial.settings,cache:initial.cache||{},active:new Set()};
  const config=()=>({ok:true,settings:XGrokCore.normalizeSettings(qa.settings),ready:true,keyState:'ready',historyEnabled:true,historyEpoch:0,taskRevision:0,used:0,collapsed:false,uiLanguage:'en',credentialIdentity:'',oauthStatus:{state:'disconnected'}});
  qa.emit=message=>listeners.forEach(fn=>fn(message));
  qa.configure=patch=>{qa.settings=XGrokCore.normalizeSettings({...qa.settings,...patch,customTriggers:{...qa.settings.customTriggers,...patch.customTriggers}});qa.emit({type:'CONFIG',...config()});};
  qa.start=id=>{qa.active.add(id);qa.emit({type:'START',requestId:id,used:qa.active.size});};
  qa.finish=(id,text='**Verified local fixture.** A concise finding with evidence.')=>{qa.active.delete(id);qa.emit({type:'RESULT',requestId:id,result:{provider:'api',text,sources:[],verificationStatus:'completed',usage:{input_tokens:40,output_tokens:20,total_tokens:60},model:'grok-4.3'}});};
  const response=message=>{qa.sent.push(structuredClone(message));if(message.type==='GET_CONFIG')return config();return {ok:true};};
  window.chrome={runtime:{id:'superx-isolated-modern-test',getManifest:()=>({version:'1.1.3-test'}),getURL:file=>'https://fixture.superx.test/extension/'+file,sendMessage:async message=>response(message),onMessage:{addListener(){}},connect:()=>{const port={onMessage:{addListener:fn=>listeners.push(fn)},onDisconnect:{addListener(){}},disconnect(){},postMessage(message){
    qa.sent.push(structuredClone(message));
    if(message.type==='PING')queueMicrotask(()=>qa.emit({type:'PONG'}));
    if(message.type==='LOOKUP_CACHED_POST')queueMicrotask(()=>qa.emit(qa.cache[message.post.id]?{type:'RESULT',requestId:message.requestId,result:qa.cache[message.post.id],cacheLookup:true,cached:true}:{type:'CACHE_MISS',requestId:message.requestId}));
    if(message.type==='HISTORY_VISIT')queueMicrotask(()=>qa.emit({type:'HISTORY_ACK',batchId:message.batchId,epoch:message.historyEpoch,ok:true}));
    if(message.type==='SET_RAIL_COLLAPSED')queueMicrotask(()=>qa.emit({type:'RAIL_VISIBILITY',collapsed:message.collapsed}));
    if(message.type==='CANCEL_IF_QUEUED'&&!qa.active.has(message.requestId))queueMicrotask(()=>qa.emit({type:'ERROR',requestId:message.requestId,code:'CANCELLED'}));
  }};setTimeout(()=>qa.emit({type:'CONFIG',...config()}),0);return port;}},storage:{local:{get:async()=>({})},session:{get:async()=>({}),remove:async()=>{}},onChanged:{addListener(){}}}};
}
const settings={provider:'api',enabled:true,analysisDefaultsVersion:1,triggerMode:'custom',language:'en',customTriggers:{manual:true,buttonHover:false,postHover:false,detailMain:false,detailReplies:false}};
let browser;
try{browser=await playwright.chromium.launch({channel:'msedge',headless:true});}
catch{browser=await playwright.chromium.launch({headless:true});}
await mkdir(output,{recursive:true});
const settle=async page=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForTimeout(120);};
async function open(scene='feed',options={}){
  const context=await browser.newContext({viewport:options.viewport||{width:1400,height:1100},reducedMotion:options.reducedMotion||'no-preference'});
  const page=await context.newPage();
  page.on('pageerror',error=>report.errors.push({scene,message:error.message}));
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='x.com')return route.fulfill({contentType:'text/html',body:html({scene,...options})});
    if(url.hostname==='fixture.superx.test'&&url.pathname==='/extension/assets/superx-symbol.svg')return route.fulfill({contentType:'image/svg+xml',body:await readFile(path.join(root,'extension/assets/superx-symbol.svg'))});
    if(url.hostname==='pbs.twimg.com'){
      report.mediaRequests.push({url:url.href,type:route.request().resourceType()});
      // Preserve the format distinction that the real CDN exposes. Returning
      // PNG for every URL used to conceal draft capture rejecting WebP.
      const webp=url.searchParams.get('format')==='webp';
      return route.fulfill({contentType:webp?'image/webp':'image/png',body:Buffer.from(webp?'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==':'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS8AAAAASUVORK5CYII=','base64')});
    }
    report.externalRequests.push(url.origin+url.pathname);return route.abort();
  });
  const initial={settings:{...settings,...options.settings},cache:options.cache||{}};
  await page.addInitScript(installMock,initial);
  const route=scene==='detail'?`/Writer/status/${ids.root}`:scene==='reply-modal'?`/compose/post?in_reply_to=${ids.root}`:scene==='quote-article-modal'?`/compose/post?quote_tweet_id=${ids.quote}`:['quote-modal','new-modal'].includes(scene)?'/compose/post':'/home';
  await page.goto('https://x.com'+route);
  await page.evaluate(()=>{
    document.querySelectorAll('form').forEach(form=>form.addEventListener('submit',event=>{event.preventDefault();qa.publishes++;}));
    document.querySelectorAll('.publish').forEach(button=>button.addEventListener('click',()=>qa.publishes++));
    document.querySelectorAll('textarea').forEach(editor=>editor.addEventListener('input',()=>{editor.previousElementSibling.textContent=editor.value;const button=editor.closest('form').querySelector('.publish');button.disabled=!editor.value.trim();}));
  });
  for(const name of scripts)await page.addScriptTag({content:bodies[name]});
  await settle(page);return {context,page};
}
const sent=(page,type)=>page.evaluate(type=>qa.sent.filter(m=>m.type===type),type);
const railText=page=>page.locator('grok-first-card').evaluateAll(cards=>cards.map(card=>card.shadowRoot.textContent).join('\n'));
const postButton=(page,id=ids.root)=>page.locator('#fixture-post-'+id+' superx-post-check button');
const capture=async(page,name)=>{const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);};
try{
  const {context,page}=await open();
  const dom=await page.evaluate(root=>{const a=document.querySelector('#fixture-post-'+root+' article'),c=XGrokCore.DOM.controls(a);return {ids:XGrokCore.DOM.articles(document).map(a=>XGrokCore.extractPost(a)?.id),buttons:document.querySelectorAll('superx-post-check').length,rail:document.querySelector('#grokfirst-overlay')?.shadowRoot.querySelector('.rail')?.hidden,post:XGrokCore.extractPost(a),controls:c&&{ref:c.reference.outerHTML,header:c.header.outerHTML.slice(0,600)},settings:XGrokCore.normalizeSettings(qa.settings),sent:qa.sent.map(m=>m.type)};},ids.root);
  check('modern feed detects three top-level posts, excluding nested quotes',JSON.stringify(dom.ids)===JSON.stringify([ids.root,ids.reply,ids.second]),dom.ids);
  check('modern feed shows rail and one manual control per post',dom.buttons===3&&dom.rail===false,dom);
  check('modern extraction keeps body, author and quote separate',dom.post?.text.includes('Claim '+ids.root)&&!dom.post.text.includes('Quoted source')&&dom.post.quotedContext?.[0]?.text.includes('Quoted source'),dom.post);
  check('custom mode without selected auto triggers makes no model request',(await sent(page,'ANALYZE')).length===0);
  await page.locator('#fixture-post-'+ids.root+' superx-post-check button').click();await settle(page);
  const first=(await sent(page,'ANALYZE')).at(-1);check('manual button dispatches exactly one correct post',first?.post?.id===ids.root&&(await sent(page,'ANALYZE')).length===1,first);
  if(first){await page.evaluate(id=>{qa.start(id);qa.configure({triggerMode:'paused'});qa.finish(id);},first.requestId);await settle(page);}
  check('pause preserves an accepted answer',(await railText(page)).includes('Verified local fixture'));
  await capture(page,'modern-feed');
  await context.close();

  const cachedPage=await open('feed',{cache:{[ids.root]:cached},settings:{triggerMode:'paused'}});
  check('paused mode restores cache without generation',(await sent(cachedPage.page,'ANALYZE')).length===0&&(await railText(cachedPage.page)).includes('Cached finding'));
  await cachedPage.context.close();

  for(const scene of ['home-compose','detail','new-modal','reply-modal','quote-modal','quote-article-modal']){
    const {context,page}=await open(scene);const editor=page.locator('textarea').last();
    if(scene==='new-modal'){
      await page.locator('[role="dialog"] .publish-parent').evaluate(parent=>{
        const lock=document.createElement('button');lock.type='button';lock.id='fixture-tall-reply-control';lock.setAttribute('aria-label','Who can reply');lock.style.cssText='width:32px;height:40px;flex:none';lock.textContent='♧';parent.prepend(lock);
      });await settle(page);
    }
    const nativeBeforeOpen=await page.locator('.publish').last().boundingBox();
    check(scene+': one active draft control',await page.locator('superx-draft-action').count()===1);
    const trigger=page.locator('superx-draft-action button');check(scene+': empty draft is disabled',await trigger.isDisabled());
    check(scene+': draft action retains spacing despite the native CSS reset',await page.locator('superx-draft-action').evaluate(host=>{const a=host.getBoundingClientRect(),b=host.nextElementSibling.getBoundingClientRect();return Math.abs(b.left-a.right)>=7.9;}));
    await editor.fill('A draft asks whether the earthquake lasted an hour.\nSecond line 😀');await settle(page);
    check(scene+': typed textarea enables control',await trigger.isEnabled());
    await trigger.click();await settle(page);
    const request=(await sent(page,'ANALYZE_DRAFT')).at(-1);
    check(scene+': textarea value is sent once without mirror duplication',request?.draft?.text==='A draft asks whether the earthquake lasted an hour.\nSecond line 😀',request?.draft);
    if(scene==='reply-modal'||scene==='detail')check(scene+': reply uses the intended parent',request?.draft?.mode==='reply'&&request.draft.context?.id===ids.root,request?.draft);
    if(scene==='reply-modal')check(scene+': reply includes the parent body, not only its URL',request?.draft?.context?.text.includes('A parent post says a shallow moonquake may last an hour.'),request?.draft?.context);
    if(['quote-modal','quote-article-modal'].includes(scene))check(scene+': quoted new post includes its quote',request?.draft?.mode==='post'&&request.draft.quotedContext?.[0]?.id===ids.quote,request?.draft);
    if(scene==='quote-article-modal')check(scene+': ordinary quoted article image is context, not a draft upload',!request?.draft?.images?.length&&request?.draft?.quotedContext?.[0]?.images?.some(image=>image.url.includes('quoted-native-image')),request?.draft);
    if(request){await page.evaluate(id=>{qa.start(id);qa.finish(id);},request.requestId);await settle(page);}
    check(scene+': findings remain visible despite transparent textarea',await page.locator('superx-draft-panel').evaluate(panel=>{const answer=panel.shadowRoot?.querySelector('.answer')||panel.querySelector('.answer');return !!answer&&getComputedStyle(answer).color!=='rgba(0, 0, 0, 0)';}));
    if(scene==='detail')check('detail: answer aligns with the draft text column',await page.locator('superx-draft-panel').evaluate(panel=>Math.abs(panel.shadowRoot.querySelector('.answer').getBoundingClientRect().left-document.querySelector('textarea').getBoundingClientRect().left)<2));
    const spacing=await page.locator('superx-draft-panel').evaluate(panel=>{
      const box=panel.shadowRoot.querySelector('.panel'),header=panel.shadowRoot.querySelector('.header');
      const b=box.getBoundingClientRect(),h=header.getBoundingClientRect(),publish=document.querySelector('[role="dialog"] .publish')||document.querySelector('.publish');
      const p=publish.getBoundingClientRect(),rowBottom=document.querySelector('#fixture-tall-reply-control')?.getBoundingClientRect().bottom??p.bottom;
      return {modalGap:panel.hasAttribute('data-modal-gap'),hostPadding:parseFloat(getComputedStyle(panel).paddingTop),before:b.top-rowBottom,postGap:b.top-p.bottom,after:h.top-b.top-parseFloat(getComputedStyle(box).borderTopWidth)};
    });
    if(scene.endsWith('-modal')){
      check(scene+': divider has balanced 14px breathing room above and below',spacing.modalGap&&Math.abs(spacing.before-14)<1&&Math.abs(spacing.after-14)<1,spacing);
      if(scene==='new-modal')check('new-modal: 40px lock leaves 14px to divider and 36px Post leaves 16px',Math.abs(spacing.before-14)<1&&Math.abs(spacing.postGap-16)<1,spacing);
      const nativeAfterOpen=await page.locator('.publish').last().boundingBox();
      check(scene+': adding the answer gap does not move native controls',nativeBeforeOpen&&nativeAfterOpen&&['x','y','width','height'].every(key=>Math.abs(nativeBeforeOpen[key]-nativeAfterOpen[key])<1),{nativeBeforeOpen,nativeAfterOpen});
    }else check(scene+': inline composer does not get modal-only padding',!spacing.modalGap&&spacing.hostPadding===0,spacing);
    check(scene+': never clicks or submits native publishing',await page.evaluate(()=>qa.publishes===0));
    const before=await page.locator('.publish').last().boundingBox();
    await trigger.click();await settle(page);await trigger.click();await settle(page);
    const after=await page.locator('.publish').last().boundingBox();
    check(scene+': show/hide keeps native publish position',before&&after&&Math.abs(before.x-after.x)<1&&Math.abs(before.width-after.width)<1,{before,after});
    if(scene.endsWith('-modal'))check(scene+': show/hide keeps native vertical position and the divider gap',before&&after&&Math.abs(before.y-after.y)<1&&await page.locator('superx-draft-panel').evaluate(panel=>{const rowBottom=(document.querySelector('#fixture-tall-reply-control')||document.querySelector('[role="dialog"] .publish')).getBoundingClientRect().bottom;return Math.abs(panel.shadowRoot.querySelector('.panel').getBoundingClientRect().top-rowBottom-14)<1;}),{before,after});
    await capture(page,'modern-'+scene);await context.close();
  }

  for(const spacingProperty of ['paddingBottom','marginBottom']){
    const {context,page}=await open('new-modal');
    await page.locator('[role="dialog"] form').evaluate((form,property)=>form.style[property]='24px',spacingProperty);
    await page.locator('textarea').fill('A draft with an existing native footer gap.');await settle(page);
    const before=await page.locator('.publish').last().boundingBox();
    await page.locator('superx-draft-action button').click();await settle(page);
    const after=await page.locator('.publish').last().boundingBox();
    const geometry=await page.locator('superx-draft-panel').evaluate(panel=>({padding:parseFloat(getComputedStyle(panel).paddingTop),gap:panel.shadowRoot.querySelector('.panel').getBoundingClientRect().top-document.querySelector('[role="dialog"] .publish').getBoundingClientRect().bottom}));
    check('modal keeps native '+spacingProperty+' when it already exceeds 14px',geometry.padding===0&&Math.abs(geometry.gap-24)<1,geometry);
    check('preserving native '+spacingProperty+' does not move the publish button',before&&after&&['x','y','width','height'].every(key=>Math.abs(before[key]-after[key])<1),{before,after});
    await context.close();
  }

  for(const kind of ['postHover','buttonHover']){
    const {context,page}=await open('feed',{settings:{customTriggers:{...settings.customTriggers,[kind]:true,[kind+'Ms']:180}}});
    const target=kind==='postHover'?page.locator('#fixture-post-'+ids.root+' > article > .whitespace-pre-wrap'):postButton(page);
    await target.hover();await page.waitForTimeout(70);
    check(kind+': waits before requesting',(await sent(page,'ANALYZE')).length===0);
    await page.mouse.move(20,20);await page.waitForTimeout(220);
    check(kind+': leaving cancels the timer',(await sent(page,'ANALYZE')).length===0);
    await target.hover();await page.waitForTimeout(240);
    const request=(await sent(page,'ANALYZE')).at(-1);
    check(kind+': fires once for correct post',request?.post?.id===ids.root&&(await sent(page,'ANALYZE')).length===1,request?.triggerKind);
    if(request){await page.evaluate(id=>{qa.start(id);qa.finish(id);},request.requestId);await settle(page);}
    await page.mouse.move(20,20);await target.hover();await page.waitForTimeout(240);
    check(kind+': existing answer does not re-request',(await sent(page,'ANALYZE')).length===1);
    await context.close();
  }

  for(const mode of ['main','replies','auto']){
    const {context,page}=await open('detail',{settings:{triggerMode:mode==='auto'?'auto':'custom',dwellMs:0,customTriggers:{...settings.customTriggers,detailMain:mode==='main',detailReplies:mode==='replies'}}});
    await page.waitForTimeout(300);const requests=await sent(page,'ANALYZE');
    check('detail '+mode+': obeys only its configured scope',mode==='main'?requests.length===1&&requests[0].post.id===ids.root:mode==='replies'?requests.length>0&&requests.every(r=>r.post.id!==ids.root):requests.some(r=>r.post.id===ids.root),requests.map(r=>r.post.id));
    await context.close();
  }

  {
    const {context,page}=await open();await postButton(page).click();await settle(page);
    const old=(await sent(page,'ANALYZE')).at(-1);
    await page.evaluate(({id,next,markup,requestId})=>{
      const shell=document.querySelector('#fixture-post-'+id),replacement=document.createElement('div');replacement.innerHTML=markup;
      // X can recycle the article itself, not only its outer virtual cell.
      shell.querySelector('article').innerHTML=replacement.querySelector('article').innerHTML;
      shell.dataset.href='/Writer/status/'+next;shell.id='fixture-post-'+next;
      qa.finish(requestId,'Old result must never appear on the replacement post.');
    },{id:ids.root,next:'8000000000000000200',markup:post('8000000000000000200'),requestId:old.requestId});
    await settle(page);
    check('recycled native article cannot display previous result',!(await railText(page)).includes('Old result must never appear'));
    await postButton(page,'8000000000000000200').click();await settle(page);
    check('recycled native article dispatches its new identity',(await sent(page,'ANALYZE')).at(-1)?.post.id==='8000000000000000200');
    check('recycled native article has no duplicate controls',await page.locator('#fixture-post-8000000000000000200 superx-post-check').count()===1);
    await context.close();
  }

  {
    const {context,page}=await open('reply-modal');
    await page.evaluate(markup=>{document.querySelector('.shell main').insertAdjacentHTML('beforeend',markup);},composer({grid:true}));await settle(page);
    check('modal excludes retained inert background editor',await page.locator('superx-draft-action').count()===1);
    const editor=page.locator('[role="dialog"] textarea'),trigger=page.locator('[role="dialog"] superx-draft-action button');
    await editor.fill('Is the claim above accurate?');await trigger.click();await settle(page);
    const old=(await sent(page,'ANALYZE_DRAFT')).at(-1);
    await page.evaluate(id=>{qa.start(id);qa.finish(id,'Answer for first recipient only.');},old.requestId);await settle(page);
    await page.evaluate(id=>{history.pushState({},'', '/compose/post?in_reply_to='+id);window.dispatchEvent(new PopStateEvent('popstate'));},ids.second);await settle(page);
    check('same editor changing reply target hides prior answer',await page.locator('[role="dialog"] superx-draft-panel').evaluateAll(panels=>panels.every(p=>p.hidden||!p.shadowRoot.textContent.includes('Answer for first recipient only'))));
    await page.locator('[role="dialog"] superx-draft-action button').click();await settle(page);
    check('same editor changing reply target uses new exact parent',(await sent(page,'ANALYZE_DRAFT')).at(-1)?.draft.context?.id===ids.second);
    check('unchanged old preview is not attributed to new recipient',!(await sent(page,'ANALYZE_DRAFT')).at(-1)?.draft.context?.text);
    const pending=(await sent(page,'ANALYZE_DRAFT')).at(-1);await page.evaluate(id=>{qa.start(id);qa.finish(id);},pending.requestId);
    await page.locator('.parent-preview .whitespace-pre-wrap').evaluate(el=>el.textContent='A newly selected parent describes an unrelated event.');await settle(page);
    await page.locator('superx-draft-panel button').filter({hasText:'Check again'}).click();await settle(page);
    check('new recipient preview refresh restores its correct body',(await sent(page,'ANALYZE_DRAFT')).at(-1)?.draft.context?.text.includes('A newly selected parent describes an unrelated event.'));
    await editor.evaluate(e=>e.readOnly=true);await settle(page);
    check('readonly editor has no active draft action',await page.locator('[role="dialog"] superx-draft-action').count()===0);
    await editor.evaluate(e=>e.readOnly=false);await settle(page);
    check('editable restoration adds exactly one draft action',await page.locator('[role="dialog"] superx-draft-action').count()===1);
    await context.close();
  }

  for(const format of ['png','webp']){
    const {context,page}=await open('quote-modal');const editor=page.locator('textarea');
    await editor.fill('A draft with an uploaded chart.');
    await page.evaluate(format=>{const img=document.createElement('img');img.src=format==='webp'?'https://pbs.twimg.com/media/uploaded-webp?format=webp&name=medium':'https://pbs.twimg.com/media/uploaded-fixture.png';img.width=80;img.height=40;img.alt='Uploaded chart';document.querySelector('.draft-images').append(img);},format);await settle(page);
    await page.locator('superx-draft-action button').click();await settle(page);
    const request=(await sent(page,'ANALYZE_DRAFT')).at(-1);
    check(format+': uploaded draft image stays separate from quoted media',request?.draft?.images?.length===1&&request.draft.images[0].url.startsWith('data:image/png;base64,')&&request.draft.images[0].alt==='Uploaded chart'&&request.draft.quotedContext[0].id===ids.quote,{...request?.draft,images:request?.draft?.images?.map(image=>({...image,url:image.url.slice(0,30)+'…'}))});
    if(format==='webp')check('WebP draft preview is fetched as a supported CDN rendition',report.mediaRequests.some(r=>r.type==='fetch'&&r.url==='https://pbs.twimg.com/media/uploaded-webp?format=jpg&name=orig')&&!report.mediaRequests.some(r=>r.type==='fetch'&&r.url.includes('uploaded-webp?format=webp')));
    await context.close();
  }

  for(const scheme of ['dark','light'])for(const direction of ['ltr','rtl']){
    const {context,page}=await open('new-modal',{scheme,direction,viewport:{width:1000,height:720}});
    await page.locator('textarea').fill('A short draft.');await page.locator('superx-draft-action button').click();await settle(page);
    const request=(await sent(page,'ANALYZE_DRAFT')).at(-1);
    if(request)await page.evaluate(id=>{qa.start(id);qa.finish(id,Array(40).fill('A long but finite finding with evidence.').join('\n\n'));},request.requestId);
    await settle(page);
    const before=await page.locator('.publish').boundingBox();
    await page.locator('superx-draft-action button').click();await settle(page);
    const after=await page.locator('.publish').boundingBox();
    check(scheme+' '+direction+': long modal show/hide keeps native width and x',before&&after&&Math.abs(before.x-after.x)<1&&Math.abs(before.width-after.width)<1,{before,after});
    check(scheme+' '+direction+': modal does not horizontally overflow',await page.locator('[role="dialog"]').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    check(scheme+' '+direction+': result uses readable foreground',await page.locator('superx-draft-panel').evaluate(el=>{const color=getComputedStyle(el.shadowRoot.querySelector('.answer')).color;return color!=='rgba(0, 0, 0, 0)';}));
    await capture(page,'modern-modal-'+scheme+'-'+direction);await context.close();
  }

  for(const scheme of ['dark','light']){
    const {context,page}=await open('feed',{scheme});
    const sizes=await page.locator('#fixture-post-'+ids.root).evaluate(el=>{
      const host=el.querySelector('superx-post-check'),button=host.shadowRoot.querySelector('button'),grok=el.querySelector('[data-icon="icon-logo-grok"]').parentElement;
      const symbol=host.shadowRoot.querySelector('.symbol'),nativeIcon=grok.querySelector('svg');
      return {button:getComputedStyle(button).color,native:getComputedStyle(grok).color,w:button.getBoundingClientRect().width,nw:grok.getBoundingClientRect().width,icon:getComputedStyle(symbol).width,ni:getComputedStyle(nativeIcon).width};
    });
    check(scheme+': post button matches native size, icon and color',sizes.button===sizes.native&&sizes.w===sizes.nw&&sizes.icon===sizes.ni,sizes);
    await postButton(page).hover();await page.waitForTimeout(240);
    const halo=await postButton(page).evaluate(button=>getComputedStyle(button,'::before').backgroundColor);
    const expected=await page.locator('#fixture-post-'+ids.root+' .x-button').first().evaluate(el=>getComputedStyle(el).getPropertyValue('--x-btn-ghost-hover').trim());
    check(scheme+': post hover paints a neutral native halo',halo=== (scheme==='dark'?'rgba(255, 255, 255, 0.08)':'rgba(0, 0, 0, 0.08)'),{halo,expected});
    await context.close();
  }
  {
    const {context,page}=await open();
    await page.locator('#fixture-post-'+ids.root+' > article').evaluate(article=>{const video=document.createElement('video');article.append(video);});await settle(page);
    await page.locator('#fixture-post-'+ids.root+' video').evaluate(video=>video.poster='https://pbs.twimg.com/amplify_video_thumb/123/img/late-cover?format=webp&name=medium');await settle(page);
    await postButton(page).click();await settle(page);
    const request=(await sent(page,'ANALYZE')).at(-1);
    check('late video poster is present on the first manual check',request?.post?.images?.some(image=>image.url.includes('late-cover')&&image.kind==='video-thumbnail'),request?.post?.images);
    await context.close();
  }
  {
    const {context,page}=await open();
    await page.locator('#fixture-post-'+ids.root+' > article').evaluate(article=>article.insertAdjacentHTML('beforeend','<picture><source media="(min-width: 1300px)" srcset="https://pbs.twimg.com/media/cover-wide?format=png"><img class="responsive-image" src="https://pbs.twimg.com/media/cover-narrow?format=png" width="100" height="50"></picture>'));await settle(page);
    await page.setViewportSize({width:1200,height:1100});await settle(page);
    await postButton(page).click();await settle(page);
    const request=(await sent(page,'ANALYZE')).at(-1);
    check('responsive image change updates snapshot before first manual check',request?.post?.images?.some(image=>image.url.includes('cover-narrow'))&&!request.post.images.some(image=>image.url.includes('cover-wide')),request?.post?.images);
    await context.close();
  }
  {
    const {context,page}=await open('feed',{viewport:{width:540,height:800}});
    check('narrow layout keeps native page usable without a rail overlap',await page.locator('#grokfirst-overlay').evaluate(el=>el.shadowRoot.querySelector('.rail').hidden));
    check('narrow layout does not introduce horizontal page overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await context.close();
  }
}finally{
  await browser.close();
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
}
const failed=report.checks.filter(c=>!c.passed);
console.log(JSON.stringify({checks:report.checks.length,failed:failed.map(c=>c.name),errors:report.errors,externalRequests:report.externalRequests,report:path.join(output,'report.json')},null,2));
assert.equal(report.errors.length,0,'Browser errors');assert.equal(report.externalRequests.length,0,'Unexpected network requests');assert.equal(failed.length,0,'Compatibility checks failed');
