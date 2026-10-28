import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {html,ids} from './fixtures/x-redesign.mjs';

// Real layout/raster checks in a fresh browser. Every route is fulfilled or
// blocked, and the runtime supplies cached answers: no user profile or model.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'artifacts','rail-boundaries');
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{playwright=await import(pathToFileURL(process.env.SUPERX_PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules','playwright','index.mjs')));}
const scripts=['x-dom.js','feed-core.js','ui-i18n.js','overlay-layout.js','marked.umd.js','markdown-renderer.js','content.js'];
const sources=Object.fromEntries(await Promise.all(scripts.map(async name=>[name,await readFile(path.join(root,'extension',name),'utf8')])));
const report={environment:'Fresh isolated Chromium; all routes intercepted; cached fabricated results only',checks:[],errors:[],externalRequests:[],scenes:[],screenshots:[]};
function check(name,value,details){report.checks.push({name,passed:Boolean(value),...(details===undefined?{}:{details})});}
function runtime(){
  const listeners=[],qa=window.qa={sent:[],publishes:0};
  const config=()=>({settings:XGrokCore.normalizeSettings({provider:'api',enabled:true,triggerMode:'custom',language:'en',customTriggers:{manual:true,postHover:false,buttonHover:false,detailMain:false,detailReplies:false}}),ready:true,keyState:'ready',historyEnabled:false,historyEpoch:0,taskRevision:0,used:0,collapsed:false,credentialIdentity:''});
  qa.emit=message=>listeners.forEach(fn=>fn(message));
  window.chrome={runtime:{id:'isolated-rail-test',getManifest:()=>({version:'test'}),getURL:file=>'https://fixture.superx.test/'+file,sendMessage:async()=>({ok:true,...config()}),connect:()=>{
    setTimeout(()=>qa.emit({type:'CONFIG',...config()}),0);
    return {onMessage:{addListener:fn=>listeners.push(fn)},onDisconnect:{addListener(){}},disconnect(){},postMessage(message){
      qa.sent.push(structuredClone(message));
      if(message.type==='PING')queueMicrotask(()=>qa.emit({type:'PONG'}));
      if(message.type==='LOOKUP_CACHED_POST')queueMicrotask(()=>qa.emit({type:'RESULT',requestId:message.requestId,cacheLookup:true,cached:true,result:{provider:'api',text:'**Cached fixture finding.**\n\n'+('An intentionally long answer checks clipping beneath an adjacent row.\n\n'.repeat(45)),sources:[],verificationStatus:'completed',usage:{total_tokens:50},model:'grok-4.3'}}));
      if(message.type==='SET_RAIL_COLLAPSED')queueMicrotask(()=>qa.emit({type:'RAIL_VISIBILITY',collapsed:message.collapsed}));
    }};
  }},storage:{local:{get:async()=>({})},session:{get:async()=>({})},onChanged:{addListener(){}}}};
}
function nativeScene({modern,edge}){
  const main=document.querySelector('main');
  document.querySelectorAll('.post-shell').forEach(el=>el.style.border='0');
  const rows=[...document.querySelectorAll('.timeline > ul > li')];
  const first=rows[0],second=rows[1],third=rows[2];
  first.id='native-first';second.id='native-second';third.remove();
  const mainArticle=first.querySelector(':scope > .post-shell > article');
  const secondArticle=second.querySelector(':scope > .post-shell > article');
  // Main's 1px sides leave its rows within the production 2px width tolerance.
  first.style.cssText='position:absolute;left:0;top:44.375px;width:100%;height:292.375px;overflow:hidden';
  second.style.cssText='position:absolute;left:0;top:336px;width:100%;height:280px;overflow:hidden';
  first.style.setProperty('border-'+edge,'0.727px solid rgba(255, 255, 255, 0.2)');
  second.style.borderTop='0.727px solid rgba(255, 255, 255, 0.2)';
  second.style.borderBottom='0.727px solid rgba(255, 255, 255, 0.2)';
  // Full-width shell also owns a distinct divider; the interior ARTICLE/quote
  // must not become a fabricated row separator.
  const shell=second.querySelector('.post-shell');shell.style.cssText='padding:16px;min-height:200px;border-bottom:0.727px solid rgba(255, 255, 255, 0.2)';
  const quote=first.querySelector('.quote');quote.id='native-quote';quote.style.cssText='border:1px solid rgb(255, 0, 255);padding:0;margin:0;position:absolute;left:0;right:0;top:135.375px;height:88px';
  const rule=document.createElement('div');rule.id='native-independent';rule.setAttribute('role','separator');rule.style.cssText='position:absolute;top:617.375px;left:0;width:100%;height:0.727px;background:rgba(255, 255, 255, 0.2)';
  document.querySelector('.timeline > ul').append(rule);
  main.style.background='#000';
  if(!modern){
    main.setAttribute('data-testid','primaryColumn');document.querySelector('aside').setAttribute('data-testid','sidebarColumn');
    document.querySelector('header').setAttribute('data-testid','grokFirstDemoHeader');
    for(const row of [first,second]){
      row.removeAttribute('data-index');row.setAttribute('data-testid','cellInnerDiv');
      const article=row.querySelector(':scope > .post-shell > article');article.setAttribute('data-testid','tweet');
      article.querySelector(':scope > .whitespace-pre-wrap').setAttribute('data-testid','tweetText');
      article.querySelector(':scope > .post-heading .x-middot-group').setAttribute('data-testid','User-Name');
      const time=document.createElement('time');time.dateTime='2026-10-28T00:00:00Z';time.textContent='1h';article.querySelector('a[data-base-ui-tooltip-trigger]').replaceChildren(time);
    }
    // Legacy quoted previews likewise expose their actual test IDs.
    for(const q of first.querySelectorAll('.quote'))q.setAttribute('data-testid','quoteTweet');
  }
  qa.nativeBefore={first:first.getBoundingClientRect().toJSON(),second:second.getBoundingClientRect().toJSON(),firstArticle:mainArticle.getBoundingClientRect().toJSON(),secondArticle:secondArticle.getBoundingClientRect().toJSON()};
}
function notificationScene({modern}){
  document.querySelector('#native-independent').remove();
  const timeline=document.querySelector('.timeline'),list=timeline.querySelector('ul');timeline.id='urt:notifications:all';
  document.querySelector('h1').textContent='Notifications';
  const first=document.querySelector('#native-first'),second=document.querySelector('#native-second');
  for(const row of [first,second]){
    row.style.borderTop='0.727px solid rgba(255, 255, 255, 0.2)';
    row.style.borderBottom='0.727px solid rgba(255, 255, 255, 0.2)';
    row.querySelector('.post-shell').style.border='0';
  }
  first.style.top='144px';first.style.height='250px';second.style.top='514px';second.style.height='260px';
  const contents=['Someone liked your reply.','Someone reposted your post.','Two people followed you.','Someone liked your photo.'];
  const positions=[{top:0,height:72},{top:72,height:72},{top:394,height:60},{top:454,height:60}];
  const notices=contents.map((label,index)=>{
    const row=document.createElement('li');row.id='native-notice-'+index;
    if(modern)row.dataset.index=String(index<2?index:index+1);else row.setAttribute('data-testid','cellInnerDiv');
    row.style.cssText=`position:absolute;left:0;top:${positions[index].top}px;width:100%;height:${positions[index].height}px;padding:14px 16px;border-bottom:0.727px solid rgba(255, 255, 255, 0.2)`;
    // Status links alone do not turn an activity notification into an ARTICLE.
    const link=document.createElement('a');link.href='/Notifier';link.textContent='Fixture notifier';
    row.append(link,document.createTextNode(' · '+label));return row;
  });
  if(modern){first.dataset.index='2';second.dataset.index='5';}
  list.replaceChildren(notices[0],notices[1],first,notices[2],notices[3],second);
  qa.nativeBefore={first:first.getBoundingClientRect().toJSON(),second:second.getBoundingClientRect().toJSON()};
}
const settle=async page=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForTimeout(150);};
async function geometry(page){return page.evaluate(()=>{
  const root=document.querySelector('#grokfirst-overlay')?.shadowRoot;
  const rect=element=>element.getBoundingClientRect().toJSON();
  const style=element=>({top:getComputedStyle(element).borderTopWidth,bottom:getComputedStyle(element).borderBottomWidth,topColor:getComputedStyle(element).borderTopColor,bottomColor:getComputedStyle(element).borderBottomColor});
  return {lines:[...(root?.querySelectorAll('.rail-separator')||[])].map(el=>({rect:rect(el),color:getComputedStyle(el).backgroundColor})),cards:[...(root?.querySelectorAll('grok-first-card')||[])].map(el=>({rect:rect(el),hidden:el.hidden})),first:rect(document.querySelector('#native-first')),second:rect(document.querySelector('#native-second')),firstStyle:style(document.querySelector('#native-first')),secondStyle:style(document.querySelector('#native-second')),shell:rect(document.querySelector('#native-second .post-shell')),shellStyle:style(document.querySelector('#native-second .post-shell')),quote:rect(document.querySelector('#native-quote')),independent:rect(document.querySelector('#native-independent')),primary:rect(document.querySelector('main')),rail:root?.querySelector('.rail')?.hidden,nativeBefore:qa.nativeBefore,sent:qa.sent.map(m=>m.type)};
});}
async function notificationGeometry(page){return page.evaluate(()=>{
  const root=document.querySelector('#grokfirst-overlay')?.shadowRoot;
  const rect=element=>element.getBoundingClientRect().toJSON();
  const boundary=element=>{const box=rect(element),style=getComputedStyle(element);return {top:box.top,bottom:box.bottom,topWidth:parseFloat(style.borderTopWidth)||0,bottomWidth:parseFloat(style.borderBottomWidth)||0};};
  const visible=el=>!el.hidden&&el.getClientRects().length>0;
  return {lines:[...(root?.querySelectorAll('.rail-separator')||[])].filter(visible).map(el=>({rect:rect(el),color:getComputedStyle(el).backgroundColor})),cards:[...(root?.querySelectorAll('grok-first-card')||[])].filter(visible).map(el=>({rect:rect(el),text:el.shadowRoot?.textContent})),posts:[document.querySelector('#native-first'),document.querySelector('#native-second')].filter(el=>el.querySelector('article')).map(boundary),notices:[...document.querySelectorAll('[id^="native-notice-"]')].map(boundary),quote:rect(document.querySelector('#native-quote')||document.querySelector('#native-second')),nativeBefore:qa.nativeBefore,first:rect(document.querySelector('#native-first')),second:rect(document.querySelector('#native-second')),sent:qa.sent.map(m=>m.type)};
});}
function matchLine(scene,top,width,color='rgba(255, 255, 255, 0.2)'){
  return scene.lines.find(line=>Math.abs(line.rect.top-top)<0.04&&Math.abs(line.rect.height-width)<0.04&&line.color===color);
}
// Ask Chromium itself to decode the screenshot. This samples real composite
// pixels rather than inferring alpha blending solely from getComputedStyle.
async function pixels(page,png,points){return page.evaluate(async({png,points})=>{
  const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);
  const ratio=image.width/innerWidth;
  return points.map(({x,y})=>{const pixel=context.getImageData(Math.floor(x*ratio),Math.floor(y*ratio),1,1).data;return [...pixel];});
},{png:png.toString('base64'),points});}
let browser;
try{browser=await playwright.chromium.launch({channel:'msedge',headless:true});}catch{browser=await playwright.chromium.launch({headless:true});}
await mkdir(output,{recursive:true});
try{
  for(const modern of [false,true])for(const edge of ['top','bottom']){
    const name=(modern?'modern':'legacy')+'-'+edge;
    const context=await browser.newContext({viewport:{width:1400,height:1000},deviceScaleFactor:1});const page=await context.newPage();
    page.on('pageerror',error=>report.errors.push({name,message:error.message}));
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='x.com')return route.fulfill({contentType:'text/html',body:html({scene:'feed'})});
      if(url.hostname==='fixture.superx.test')return route.fulfill({contentType:'image/svg+xml',body:await readFile(path.join(root,'extension/assets/superx-symbol.svg'))});
      if(url.hostname==='pbs.twimg.com')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS8AAAAASUVORK5CYII=','base64')});
      report.externalRequests.push({name,url:url.origin+url.pathname});return route.abort();
    });
    await page.addInitScript(runtime);await page.goto('https://x.com/home');await page.evaluate(nativeScene,{modern,edge});
    for(const name of scripts)await page.addScriptTag({content:sources[name]});await settle(page);
    const scene=await geometry(page);report.scenes.push({name,...scene});
    check(name+': two valid post cards and rail visible',scene.cards.length===2&&scene.rail===false,scene.cards);
    const firstWidth=parseFloat(edge==='top'?scene.firstStyle.top:scene.firstStyle.bottom),firstTop=edge==='top'?scene.first.top:scene.first.bottom-firstWidth;
    const secondWidth=parseFloat(scene.secondStyle.top),secondTop=scene.second.top;
    check(name+': translucent '+edge+' border extends at native position',Boolean(matchLine(scene,firstTop,firstWidth)),{top:firstTop,width:firstWidth,lines:scene.lines});
    check(name+': next native top border extends once',scene.lines.filter(line=>Math.abs(line.rect.top-secondTop)<0.04).length===1&&Boolean(matchLine(scene,secondTop,secondWidth)));
    const bottomWidth=parseFloat(scene.secondStyle.bottom);
    check(name+': owning cell bottom is preserved',Boolean(matchLine(scene,scene.second.bottom-bottomWidth,bottomWidth)));
    const shellWidth=parseFloat(scene.shellStyle.bottom);
    check(name+': full-width owning shell border is preserved',Boolean(matchLine(scene,scene.shell.bottom-shellWidth,shellWidth)));
    check(name+': actual 0.727px filled separator retains fractional height',Boolean(matchLine(scene,scene.independent.top,scene.independent.height)),scene.independent);
    check(name+': nested quote border never paints across rail',!scene.lines.some(line=>line.color==='rgb(255, 0, 255)'||Math.abs(line.rect.top-scene.quote.top)<0.04||Math.abs(line.rect.top-(scene.quote.bottom-1))<0.04));
    check(name+': cached long answer is clipped at adjacent native row',scene.cards[0]?.rect.bottom<=scene.second.top+0.04,{card:scene.cards[0],second:scene.second});
    check(name+': overlay leaves native layout unchanged',JSON.stringify(scene.first)===JSON.stringify(scene.nativeBefore.first)&&JSON.stringify(scene.second)===JSON.stringify(scene.nativeBefore.second));
    check(name+': cached display sends no model request',!scene.sent.some(type=>['ANALYZE','ANALYZE_DRAFT','GENERATE_COMMENTS'].includes(type)));
    const line=matchLine(scene,secondTop,secondWidth);
    const file=path.join(output,name+'.png'),png=await page.screenshot({path:file});report.screenshots.push(file);
    if(line){
      const y=secondTop+secondWidth/2,points=[{x:scene.primary.left+3,y},{x:line.rect.right-3,y}];
      const sampled=await pixels(page,png,points);
      // Bottom-border overlap intentionally composites two native 20% lines;
      // the rail must reproduce that 36% result (92), not force it back to 51.
      check(name+': native/rail translucent border composite pixels agree',sampled[0].every((value,index)=>Math.abs(value-sampled[1][index])<=1)&&[51,92].includes(sampled[0][0]),{points,sampled});
      for(const target of [{name:'isolated bottom border',top:scene.second.bottom-bottomWidth,width:bottomWidth},{name:'fractional filled rule',top:scene.independent.top,width:scene.independent.height}]){
        const copy=matchLine(scene,target.top,target.width),p=[{x:scene.primary.left+3,y:target.top+target.width/2},{x:copy.rect.right-3,y:target.top+target.width/2}];
        const values=await pixels(page,png,p);
        check(name+': '+target.name+' composite pixels agree',values[0].every((value,index)=>Math.abs(value-values[1][index])<=1)&&values[0][0]>0&&values[0][0]<100,{points:p,sampled:values});
      }
    }
    // A standalone line is eligible only while it belongs to a nearby post
    // boundary. Moving it away cannot divide an unrelated blank rail region.
    await page.locator('#native-independent').evaluate(el=>el.style.top='715.625px');await settle(page);const detached=await geometry(page);
    check(name+': unrelated standalone separator cannot divide blank rail space',!detached.lines.some(line=>Math.abs(line.rect.top-detached.independent.top)<0.04)&&!detached.lines.some(line=>Math.abs(line.rect.top-scene.independent.top)<0.04));
    await page.locator('#native-independent').evaluate(el=>el.style.top='617.875px');await settle(page);const moved=await geometry(page);
    check(name+': independent separator follows a native style movement',Boolean(matchLine(moved,moved.independent.top,moved.independent.height))&&!moved.lines.some(line=>Math.abs(line.rect.top-scene.independent.top)<0.04));
    await page.locator('#native-independent').evaluate(el=>el.hidden=true);await settle(page);const hidden=await geometry(page);
    check(name+': hidden native separator leaves no stale rail line',!hidden.lines.some(line=>Math.abs(line.rect.top-moved.independent.top)<0.04));
    await context.close();
  }
  for(const modern of [false,true]){
    const name=(modern?'modern':'legacy')+'-notifications';
    const context=await browser.newContext({viewport:{width:1400,height:1000},deviceScaleFactor:1}),page=await context.newPage();
    page.on('pageerror',error=>report.errors.push({name,message:error.message}));
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='x.com')return route.fulfill({contentType:'text/html',body:html({scene:'feed'})});
      if(url.hostname==='fixture.superx.test')return route.fulfill({contentType:'image/svg+xml',body:await readFile(path.join(root,'extension/assets/superx-symbol.svg'))});
      if(url.hostname==='pbs.twimg.com')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS8AAAAASUVORK5CYII=','base64')});
      report.externalRequests.push({name,url:url.origin+url.pathname});return route.abort();
    });
    await page.addInitScript(runtime);await page.goto('https://x.com/notifications');await page.evaluate(nativeScene,{modern,edge:'top'});await page.evaluate(notificationScene,{modern});
    for(const file of scripts)await page.addScriptTag({content:sources[file]});await settle(page);
    const scene=await notificationGeometry(page);report.scenes.push({name,...scene});
    const postLines=scene.posts.flatMap(post=>[{top:post.top,width:post.topWidth},{top:post.bottom-post.bottomWidth,width:post.bottomWidth}]);
    check(name+': only two checkable posts receive answer cards',scene.cards.length===2,{cards:scene.cards.length});
    check(name+': every post top/bottom still extends into the rail',postLines.every(line=>matchLine(scene,line.top,line.width)),scene.lines);
    const atPostEdge=line=>scene.posts.some(post=>Math.abs(line.rect.top-post.top)<=2||Math.abs(line.rect.top-post.bottom)<=2);
    check(name+': every rail rule belongs to a checkable post boundary',scene.lines.length<=6&&scene.lines.every(atPostEdge),scene.lines);
    check(name+': like/repost/follow notices do not divide their blank rail space',scene.notices.filter(notice=>!scene.posts.some(post=>Math.abs(notice.bottom-post.top)<=2||Math.abs(notice.bottom-post.bottom)<=2)).every(notice=>!scene.lines.some(line=>Math.abs(line.rect.top-(notice.bottom-notice.bottomWidth))<0.04)),{notices:scene.notices,lines:scene.lines});
    check(name+': quote card borders do not create notification rail rules',!scene.lines.some(line=>line.color==='rgb(255, 0, 255)'||Math.abs(line.rect.top-scene.quote.top)<0.04||Math.abs(line.rect.top-(scene.quote.bottom-1))<0.04));
    check(name+': native notification/post positions remain unchanged',JSON.stringify(scene.first)===JSON.stringify(scene.nativeBefore.first)&&JSON.stringify(scene.second)===JSON.stringify(scene.nativeBefore.second));
    const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);
    // Virtualized X can recycle the same cell from a post to a plain activity.
    // Keep the old row borders and identity so stale decorations cannot pass.
    await page.locator('#native-first').evaluate(row=>{const text=document.createElement('div');text.textContent='Recycled activity: someone liked your post.';text.style.padding='16px';row.replaceChildren(text);row.id='native-first';});
    await settle(page);const recycled=await notificationGeometry(page);report.scenes.push({name:name+'-recycled',...recycled});
    const remaining=recycled.posts[0];
    check(name+': post-to-notice recycling removes old answer card',recycled.cards.length===1,{cards:recycled.cards.length});
    check(name+': recycled notice loses both old post boundaries',recycled.lines.length<=3&&recycled.lines.every(line=>Math.abs(line.rect.top-remaining.top)<=2||Math.abs(line.rect.top-remaining.bottom)<=2)&&Boolean(matchLine(recycled,remaining.top,remaining.topWidth))&&Boolean(matchLine(recycled,remaining.bottom-remaining.bottomWidth,remaining.bottomWidth)),recycled.lines);
    check(name+': notification checks use existing cache without model work',!recycled.sent.some(type=>['ANALYZE','ANALYZE_DRAFT','GENERATE_COMMENTS'].includes(type)));
    const recycledFile=path.join(output,name+'-recycled.png');await page.screenshot({path:recycledFile});report.screenshots.push(recycledFile);
    await page.locator('#native-second').evaluate(row=>{const text=document.createElement('div');text.textContent='Recycled activity: another person reposted your post.';text.style.padding='16px';row.replaceChildren(text);});
    await settle(page);const empty=await notificationGeometry(page);report.scenes.push({name:name+'-only-notices',...empty});
    check(name+': only activity notices leave no visible lines or answer cards',empty.posts.length===0&&empty.lines.length===0&&empty.cards.length===0,{lines:empty.lines,cards:empty.cards.length});
    await context.close();
  }
  check('all browser fixtures complete without page errors',report.errors.length===0,report.errors);
  check('all network routes remain local',report.externalRequests.length===0,report.externalRequests);
}finally{await browser.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
const failed=report.checks.filter(item=>!item.passed);
console.log(JSON.stringify({checks:report.checks.length,passed:report.checks.length-failed.length,failed:failed.map(item=>item.name),output},null,2));
assert.equal(failed.length,0,'Rail boundary acceptance checks failed; inspect report.json');
