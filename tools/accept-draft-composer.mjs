import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

// Isolated fixtures only: no existing browser profile, credentials, live X
// accounts or provider requests. This deliberately tests production DOM code.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'artifacts','draft-check-preview');
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}
catch{
  const bundled=process.env.SUPERX_PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules','playwright','index.mjs');
  playwright=await import(pathToFileURL(bundled));
}
const {chromium}=playwright;
const focus=['thread','metadata','recovery','sticky','modalcontext','controls','spacing','images'].includes(process.env.SUPERX_QA_FOCUS)?process.env.SUPERX_QA_FOCUS:'full';
const reportFile=focus==='full'?'report.json':focus+'-report.json';
const report={scope:focus,environment:'Fresh isolated headless browser; local HTTP fixtures only; no credentials, account, provider requests or X publishing',checks:[],pageErrors:[],externalRequests:[],screenshots:[]};
const check=(name,value,details)=>{report.checks.push({name,passed:Boolean(value),...(details===undefined?{}:{details})});};
const t='A draft states that shallow moonquakes may last longer than ten minutes.';
const answer='**Finding supported, with limits.**\n\nThe local test evidence distinguishes shallow moonquakes from other events. [NASA](https://science.nasa.gov/moon/moonquakes/)';
const source={url:'https://science.nasa.gov/moon/moonquakes/',title:'NASA · Moonquakes'};
const original=`<article data-testid="tweet"><div data-testid="User-Name"><a href="https://x.com/NASA"><span>NASA</span><span>@NASA</span></a><a href="https://x.com/NASA/status/1956376225074552934"><time datetime="2025-08-15T15:23:00.000Z">Aug 15</time></a></div><div data-testid="tweetText" lang="en">Unlike earthquakes, some moonquakes can last for hours on end.</div></article>`;
const threadArticle=(id,text,nested='')=>`<article data-testid="tweet" data-fixture-post="${id}"><div data-testid="User-Name"><a href="https://x.com/ThreadAuthor"><span>Thread Author</span><span>@ThreadAuthor</span></a><a href="https://x.com/ThreadAuthor/status/${id}"><time datetime="2026-10-22T08:00:00.000Z">Oct 22</time></a></div><div data-testid="tweetText" lang="en">${text}</div>${nested}</article>`;
const threadRoot=threadArticle(100,'The original incident says the package was ordered through a buying agent.',threadArticle(900,'A nested quote is not a conversation ancestor.',threadArticle(901,'A second-level quoted source stays with its owner.')));
const threadMiddle=threadArticle(101,'The next reply asks whether the platform offers delivery.');
const threadParent=threadArticle(102,'It was a buying agent, not food delivery.');
const modalPreview=({tag='article',username='replyauthor',author='Reply Author',body='The visible parent claims that a local incident happened.',timestamp='2026-10-22T08:00:00.000Z',id=null,profileLink=true,nested=''}={})=>{
  const name=`<span>${author}</span><span> @${username}</span>`,user=profileLink?`<a href="https://x.com/${username}">${name}</a>`:name;
  const time=`<time datetime="${timestamp}">Oct 22</time>`,date=id?`<a href="https://x.com/${username}/status/${id}">${time}</a>`:time;
  return `<${tag}${tag==='article'?' data-testid="tweet"':tag==='button'?' type="button"':''} class="native-context-preview"><div data-testid="User-Name">${user}</div>${date}<div data-testid="tweetText" lang="en">${body}</div>${nested}</${tag}>`;
};
const nestedEditor=(editor,depth)=>'<div class="native-editor-layer">'.repeat(depth)+editor+'</div>'.repeat(depth);
const counterControls='<div class="counter-branch"><svg data-testid="dual-phase-countdown-circle" role="progressbar" aria-label="Post character count" aria-valuenow="70" aria-valuemax="280" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="8" fill="none" stroke="#536471" stroke-width="2"></circle><circle cx="11" cy="11" r="8" fill="none" stroke="#1d9bf0" stroke-width="2" stroke-dasharray="18 40"></circle></svg></div><span class="compose-divider" aria-hidden="true"></span><button type="button" data-testid="addButton" class="add-post" aria-label="Add another post">+</button>';
const composer=(id,{modal=false,collapsed=false,boundary='border',sticky=false,stickyQuote=false}={})=>{
  const editor=`<div data-testid="tweetTextarea_0" role="textbox" contenteditable="true" aria-label="${id} draft" spellcheck="false"></div>`;
  const row=`<div class="editor-row">${boundary==='narrow-border'?'':'<span class="avatar" aria-hidden="true">U</span>'}<div class="entry">${nestedEditor(editor,collapsed?12:20)}</div></div>`;
  const publish=`<div class="publish-column"><button type="button" data-testid="${modal?'tweetButton':'tweetButtonInline'}" class="publish"><span class="native-publish-label">${id.includes('reply')?'Reply':'Post'}</span></button></div>`;
  const tools='<div class="native-tools" role="tablist" aria-label="Add to post"><button type="button" role="tab" aria-label="Media">▧</button><button type="button" role="tab" aria-label="Emoji">☺</button><button type="button" role="tab" aria-label="Location">⌖</button></div>';
  const toolbar=`<div data-testid="toolBar" class="native-toolbar"${collapsed?' hidden':''}>${tools}<div class="submit-row">${counterControls}${collapsed?'':publish}</div></div>`;
  if(sticky)return `<section id="${id}" data-testid="cellInnerDiv" data-boundary="none" class="composer"><div class="native-avatar-row"><span class="avatar" aria-hidden="true">U</span><div class="native-common-group"><div class="entry">${nestedEditor(editor,20)}</div>${stickyQuote?threadArticle(300,'A quoted post inside the new-post editor.'):''}<div class="native-sticky-footer"><div></div><div class="native-toolbar-wrapper">${toolbar}</div></div></div></div></section><div class="transparent-native-spacer"></div>`;
  const section=`<section id="${id}" data-testid="cellInnerDiv" data-boundary="${boundary}" class="composer">${collapsed?`<div class="native-collapsed-row">${row}<div class="submit-row collapsed-submit">${publish}</div></div>`:row}${toolbar}</section>`;
  if(boundary==='narrow-border')return `<div class="native-avatar-layout"><span class="outer-avatar" aria-hidden="true">U</span>${section}</div>`;
  return section+(boundary==='separator'?`<div class="native-separator" data-native-boundary-for="${id}"></div>`:boundary==='none'?'<div class="transparent-native-spacer"></div>':'');
};
function html(scene,scheme,boundary='separator'){
  const modal=scene==='new-modal'||scene==='reply-modal';
  const isReply=scene.startsWith('reply');
  const body=modal?`<div class="backdrop"></div><div role="dialog" aria-modal="true" aria-label="${isReply?'Reply':'New post'}" class="dialog"><header class="modal-head"><button type="button" aria-label="Close">×</button><span>Local ${isReply?'reply':'post'} editor</span></header><div class="modal-body">${isReply?original:''}${composer(isReply?'reply-modal':'post-modal',{modal:true,boundary})}</div></div>`:`<main data-testid="primaryColumn"><header><h1>${isReply?'Post':'Home'}</h1></header>${isReply?original:''}${composer(isReply?'reply-inline':'post-inline',{collapsed:scene==='reply-collapsed',sticky:scene==='reply-sticky'||scene==='post-sticky-quote',stickyQuote:scene==='post-sticky-quote',boundary})}${!isReply?'<div class="show-new-posts">Show 140 posts</div>':''}<article data-testid="tweet" class="following"><div data-testid="tweetText">The next local fixture post remains below the entire composer.</div></article></main>`;
  return `<!doctype html><html lang="en" data-scheme="${scheme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  *{box-sizing:border-box}html{color-scheme:${scheme};font-family:Arial,sans-serif;background:${scheme==='dark'?'#000':'#fff'};color:${scheme==='dark'?'#e7e9ea':'#0f1419'}}body{margin:0;--bg:${scheme==='dark'?'#000':'#fff'};--fg:${scheme==='dark'?'#e7e9ea':'#0f1419'};--border:${scheme==='dark'?'#2f3336':'#cfd9de'};--muted:${scheme==='dark'?'#71767b':'#536471'}}main{width:min(600px,100%);margin:0 auto;border-inline:1px solid var(--border);min-height:100vh}main>header{padding:12px 16px;border-bottom:1px solid var(--border)}h1{font-size:20px;margin:0}article{padding:16px;border-bottom:1px solid var(--border);line-height:1.5}a{color:#1d9bf0}.composer{padding:12px 16px;border-bottom:1px solid var(--border);background:var(--bg);color:var(--fg)}.editor-row{display:flex;align-items:flex-start;gap:12px}.avatar{width:40px;height:40px;border-radius:50%;background:#536471;display:grid;place-items:center;color:white;flex:none}.entry{min-width:0;flex:1}[contenteditable]{min-height:80px;padding:10px 0;outline:0;font-size:20px;white-space:pre-wrap;overflow-wrap:anywhere}.native-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-left:52px;padding-top:8px;min-height:46px}.native-tools,.submit-row{display:flex;align-items:center;gap:4px;min-width:0}.native-tools button{border:0;background:transparent;color:#1d9bf0;padding:8px;font-size:19px;line-height:20px}.publish{border:0;background:#eff3f4;color:#0f1419;font:bold 14px/20px Arial,sans-serif;padding:8px 18px;border-radius:24px;cursor:pointer}.following{min-height:220px;color:var(--muted)}.backdrop{position:fixed;inset:0;background:rgba(91,112,131,.4)}.dialog{position:relative;margin:5vh auto;width:min(600px,calc(100% - 24px));max-height:90vh;overflow:auto;border-radius:16px;background:var(--bg);color:var(--fg)}.modal-head{display:flex;align-items:center;gap:18px;height:54px;padding:8px 16px;position:sticky;top:0;z-index:1;background:var(--bg)}.modal-head button{font-size:26px;background:transparent;border:0;color:inherit}.modal-body{min-height:200px}[hidden]{display:none!important}@media(max-width:420px){.composer{padding-inline:12px}.native-toolbar{margin-left:0}.avatar{width:32px;height:32px}.entry{min-width:0}.native-tools button{padding:5px}.submit-row{gap:3px}.publish{padding-inline:13px}}
  .native-editor-layer{min-width:0}.publish-column{display:flex;flex-direction:column;flex:none}.native-collapsed-row{display:flex;flex-direction:row;align-items:center;gap:8px;min-width:0}.native-collapsed-row>.editor-row{flex:1;min-width:0}.native-collapsed-row .entry{min-width:0}.native-collapsed-row [contenteditable]{min-height:54px}.collapsed-submit{flex:none}.expanded-column{display:flex;flex-direction:column;min-width:0}.counter-branch{display:flex;flex-direction:column;flex:none}.compose-divider{height:20px;border-inline-start:1px solid var(--border);margin-inline:5px}.add-post{display:grid;place-items:center;width:24px;height:24px;flex:none;border:1px solid #1d9bf0;border-radius:50%;background:transparent;color:#1d9bf0;font:20px/20px Arial}.submit-row{gap:6px}.publish{color:#fff;font-weight:400}.native-publish-label{color:#0f1419;font-weight:700}html[data-scheme="light"] .publish{background:#0f1419;color:#000}html[data-scheme="light"] .native-publish-label{color:#fff}
  .composer[data-boundary="separator"],.composer[data-boundary="none"]{border-bottom:0}.native-separator{height:1px;width:100%;background:var(--border);flex:none}.show-new-posts{padding:13px 16px;text-align:center;color:#1d9bf0;border-bottom:1px solid var(--border)}
  .transparent-native-spacer{height:1px;width:100%;background:transparent}.native-avatar-layout{position:relative;display:block;width:100%;min-width:0}.native-avatar-layout .composer{margin-left:52px;width:calc(100% - 52px)}.native-avatar-layout .native-toolbar{margin-left:0}.outer-avatar{position:absolute;top:12px;left:12px;width:32px;height:32px;border-radius:50%;background:#536471;color:white;display:grid;place-items:center}
  .native-avatar-row{display:flex;flex-direction:row;gap:12px;min-width:0}.native-common-group{display:flex;flex-direction:column;flex:1;min-width:0}.native-common-group .native-toolbar{margin-left:0}.native-sticky-footer{position:sticky;top:0;bottom:-1px;z-index:1;background:var(--bg)}
  </style></head><body>${body}<script>window.qa={sent:[],nativePublishes:0,settingsOpens:0};document.querySelectorAll('.publish').forEach(button=>button.addEventListener('click',()=>window.qa.nativePublishes++));
  const collapsed=document.querySelector('.native-collapsed-row');
  if(collapsed){
    const editor=collapsed.querySelector('[contenteditable]');
    editor.addEventListener('focus',()=>{
      if(qa.nativeExpanded)return;qa.nativeExpanded=true;
      const composer=collapsed.closest('.composer'),row=collapsed.querySelector('.editor-row'),entry=row.querySelector('.entry'),toolbar=composer.querySelector('[data-testid="toolBar"]'),publishColumn=collapsed.querySelector('.publish-column');
      editor.remove();let nested=editor;for(let depth=0;depth<17;depth++){const layer=document.createElement('div');layer.className='native-editor-layer';layer.append(nested);nested=layer;}entry.replaceChildren(nested);
      const expanded=document.createElement('div');expanded.className='expanded-column';collapsed.before(expanded);expanded.append(row,toolbar);toolbar.hidden=false;toolbar.querySelector('.submit-row').append(publishColumn);collapsed.remove();
    });
  }
  </script></body></html>`;
}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname.startsWith('/extension/')){
      if(!/^\/extension\/(?:[\w.-]+\.js|assets\/superx-symbol\.svg)$/.test(url.pathname))throw new Error('Unknown fixture asset');
      res.writeHead(200,{'Content-Type':url.pathname.endsWith('.svg')?'image/svg+xml':'text/javascript','Cache-Control':'no-store'});
      res.end(await readFile(path.join(root,url.pathname.slice(1))));return;
    }
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html(url.searchParams.get('scene')||'new-inline',url.searchParams.get('scheme')||'dark',url.searchParams.get('boundary')||'separator'));
  }catch(error){res.writeHead(404);res.end(error.message);}
});
await mkdir(output,{recursive:true});
await access(path.join(root,'extension','draft-composer.js'));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser,classicBrowser;
const settle=async page=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForTimeout(80);};
const emit=(page,message)=>page.evaluate(message=>window.qa.manager.handleMessage(message),message);
const config=(page,changes={})=>page.evaluate(changes=>{window.qa.config={...window.qa.config,...changes};window.qa.manager.configure(window.qa.config);},changes);
const geometrySnapshot=page=>page.evaluate(()=>qa.captureGeometry());
function maxGeometryDrift(before,after){
  let drift=0;
  for(const key of ['action','editor','toolbar','counter','publish','nativeLine']){
    if(!before[key]&&!after[key])continue;
    if(!before[key]||!after[key])return Infinity;
    for(const field of ['x','y','width','height'])drift=Math.max(drift,Math.abs(before[key][field]-after[key][field]));
  }
  if(before.tools.length!==after.tools.length)return Infinity;
  before.tools.forEach((rect,index)=>{for(const field of ['x','y','width','height'])drift=Math.max(drift,Math.abs(rect[field]-after.tools[index][field]));});
  return drift;
}
function insetLineMatches(frame,baseline){
  if(!frame.nativeBoundary||!baseline.nativeLine)return false;
  if(frame.panelHidden)return !frame.cover?.painted&&!frame.shortLine?.painted;
  const line=frame.shortLine,cover=frame.cover,edge=baseline.nativeLine,close=(a,b)=>Math.abs(a-b)<=1;
  return line?.painted&&cover?.painted&&close(line.x,frame.toolbar.x)&&close(line.right,frame.toolbar.right)&&close(line.y,edge.y)&&close(line.height,edge.height)&&line.color===baseline.lineColor&&close(cover.x,edge.x)&&close(cover.width,edge.width)&&close(cover.y,edge.y)&&close(cover.height,edge.height)&&cover.color===frame.panelBackground;
}
async function startFrameAudit(page){
  await page.evaluate(()=>{
    qa.auditFrames=[];qa.auditPromise=new Promise(resolve=>{
      let remaining=12;const frame=()=>{qa.auditFrames.push(qa.captureGeometry());if(--remaining>0)requestAnimationFrame(frame);else resolve();};frame();
    });
  });
}
async function finishFrameAudit(page){await page.evaluate(()=>qa.auditPromise);return page.evaluate(()=>qa.auditFrames);}
async function probeLinePixels(page,geometry,name){
  const edge=geometry.nativeLine,clip={x:Math.floor(edge.x),y:Math.max(0,Math.floor(edge.y)-1),width:Math.ceil(edge.width),height:Math.ceil(edge.height)+3};
  const png=await page.screenshot({path:path.join(output,name),clip});report.screenshots.push(name);
  return page.evaluate(async({base64,clip,geometry})=>{
    const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();
    const canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,image.width,image.height).data;
    const rgb=text=>String(text).match(/[\d.]+/g).slice(0,3).map(Number),distance=(a,b)=>a.reduce((total,value,i)=>total+Math.abs(value-b[i]),0);
    const color=rgb(geometry.lineColor),background=rgb(geometry.panelBackground),xOf=x=>Math.max(0,Math.min(image.width-1,Math.floor(x-clip.x)));
    const inside=xOf(geometry.toolbar.x+8),left=xOf(geometry.nativeLine.x+4),right=xOf(geometry.nativeLine.right-4),at=(x,y)=>Array.from(pixels.slice((y*image.width+x)*4,(y*image.width+x)*4+3));
    let row=0;for(let y=1;y<image.height;y++)if(distance(at(inside,y),color)<distance(at(inside,row),color))row=y;
    const expectedOutside=geometry.panelHidden?color:background;
    return {row,inside:at(inside,row),left:at(left,row),right:at(right,row),color,background,insideMatches:distance(at(inside,row),color)<=3,outsideMatches:distance(at(left,row),expectedOutside)<=3&&distance(at(right,row),expectedOutside)<=3};
  },{base64:png.toString('base64'),clip,geometry});
}
async function panelFor(page,composerSelector){
  const id=await page.locator(composerSelector+' superx-draft-action').getByRole('button').getAttribute('aria-controls');
  return page.locator('superx-draft-panel[id="'+id+'"]');
}
async function start(page,scene,scheme,width,locale='en',boundary='separator',setup){
  await page.goto(base+`/${scene.startsWith('reply')?'Fixture/status/1956376225074552934':'home'}?scene=${scene}&scheme=${scheme}&boundary=${boundary}`);
  if(setup)await setup(page);
  await page.evaluate(()=>{const editor=document.querySelector('[contenteditable]'),publish=document.querySelector('.publish'),rect=node=>{const bounds=node.getBoundingClientRect();return {width:bounds.width,height:bounds.height};};qa.nativeBeforeInjection={editor:rect(editor),publish:rect(publish)};});
  for(const file of ['feed-core.js','ui-i18n.js','marked.umd.js','markdown-renderer.js','draft-composer.js'])await page.addScriptTag({url:base+'/extension/'+file});
  await page.evaluate(locale=>{
    qa.captureGeometry=()=>{
      const rect=node=>{if(!node)return null;const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
      const composer=document.querySelector('.composer'),edge=document.querySelector('.native-separator'),action=document.querySelector('superx-draft-action'),panel=document.querySelector('superx-draft-panel'),box=panel?.shadowRoot?.querySelector('.panel');
      const css=getComputedStyle(composer),border=Number.parseFloat(css.borderBottomWidth)||0;
      let line=null,lineVisible=false,lineColor='';
      if(edge){line=rect(edge);const style=getComputedStyle(edge);lineVisible=style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&line.height>0;lineColor=style.backgroundColor;}
      else if(border){const r=rect(composer);line={x:r.x,y:r.bottom-border,width:r.width,height:border,right:r.right,bottom:r.bottom};lineVisible=true;lineColor=css.borderBottomColor;}
      const pseudo=node=>{if(!node||!panel)return null;const style=getComputedStyle(node,'::before'),bounds=rect(panel),left=Number.parseFloat(style.left)||0,right=Number.parseFloat(style.right)||0,width=Number.parseFloat(style.width)||bounds.width-left-right,height=Number.parseFloat(style.height)||0,x=bounds.x+left;return {x,y:bounds.y+(Number.parseFloat(style.top)||0),width,height,right:x+width,color:style.backgroundColor,painted:!panel.hidden&&!['none','normal'].includes(style.content)&&style.display!=='none'&&style.visibility!=='hidden'&&height>0};};
      const panelStyle=panel&&getComputedStyle(panel);
      return {action:rect(action),editor:rect(document.querySelector('[contenteditable]')),toolbar:rect(document.querySelector('.native-toolbar:not([hidden])')||document.querySelector('.native-collapsed-row')),counter:rect(document.querySelector('.counter-branch')),publish:rect(document.querySelector('.publish')),tools:[...document.querySelectorAll('.native-tools button')].map(rect),nativeLine:line,lineVisible,lineColor,panel:rect(panel),panelHidden:panel?.hidden,nativeBoundary:panel?.hasAttribute('data-native-boundary'),ownBorder:Number.parseFloat(box?getComputedStyle(box).borderTopWidth:'0')||0,boxMargin:box?getComputedStyle(box).marginTop:'',content:rect(panel?.shadowRoot?.querySelector('.header')),shortLine:pseudo(box),cover:pseudo(panel),panelBackground:box?getComputedStyle(box).backgroundColor:'',bottomBorder:panelStyle?{width:Number.parseFloat(panelStyle.borderBottomWidth)||0,color:panelStyle.borderBottomColor}:null,scrollTop:document.querySelector('.dialog')?.scrollTop||window.scrollY,next:rect(document.querySelector('.show-new-posts')||document.querySelector('.following'))};
    };
    window.qa.config={settings:{...XGrokCore.DEFAULT_SETTINGS,provider:'api'},ready:true,connected:true,awaitingConfig:false,hasConfig:true,refreshRequired:false,identity:'api:account-1',needsProvider:'status.needsKey'};
    window.qa.createManager=()=>SuperXDraftComposer.create({core:XGrokCore,t:(key,vars)=>GrokFirstUI.t(key,locale,vars),render:(target,text)=>GrokFirstMarkdown.render(target,text),send:message=>{window.qa.sent.push(message);return true;},wake:()=>{},openSettings:()=>window.qa.settingsOpens++,errorKey:()=> 'status.failed',symbolURL:location.origin+'/extension/assets/superx-symbol.svg',onLayout:()=>{qa.layoutCalls=(qa.layoutCalls||0)+1;}});
    window.qa.manager=qa.createManager();
    window.qa.manager.configure(window.qa.config);window.qa.manager.scan();
  },locale);
  await page.waitForSelector('superx-draft-action',{state:'attached'});await settle(page);
}
async function startIntegrated(page,{config=true,oauth=false}={}){
  await page.goto(base+'/home?scene=new-inline&scheme=dark');
  for(const file of ['feed-core.js','ui-i18n.js','overlay-layout.js','marked.umd.js','markdown-renderer.js','draft-composer.js'])await page.addScriptTag({url:base+'/extension/'+file});
  await page.evaluate(({config,oauth,base})=>{
    const event=()=>{const listeners=[];return {addListener:fn=>listeners.push(fn),removeListener:fn=>{const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);},emit:value=>listeners.slice().forEach(fn=>fn(value))};};
    qa.config={settings:{...XGrokCore.DEFAULT_SETTINGS,provider:oauth?'oauth':'api',enabled:false,interfaceLanguage:'en'},ready:!oauth,historyEnabled:false,historyEpoch:0,taskRevision:7,credentialIdentity:oauth?'':'account-1',oauthStatus:oauth?{state:'restoring',connected:false}:undefined,used:0,collapsed:true,uiLanguage:'en'};
    qa.autoConfig=config;qa.ports=[];qa.connectCount=0;
    qa.emit=message=>qa.currentPort?.onMessage.emit(message);
    qa.emitConfig=changes=>{qa.config={...qa.config,...changes};qa.emit({type:'CONFIG',...qa.config});};
    window.chrome={runtime:{id:'superx-isolated-fixture',getManifest:()=>({version:'0.9.13'}),getURL:file=>base+'/extension/'+file,sendMessage:async()=>({ok:true}),connect:()=>{
      const port={onMessage:event(),onDisconnect:event(),postMessage:message=>qa.sent.push(message),disconnect:()=>{if(!port.closed){port.closed=true;port.onDisconnect.emit();}}};
      qa.ports.push(port);qa.currentPort=port;qa.connectCount++;
      if(qa.autoConfig)setTimeout(()=>{if(!port.closed)port.onMessage.emit({type:'CONFIG',...qa.config});},0);
      return port;
    }}};
  },{config,oauth,base});
  await page.addScriptTag({url:base+'/extension/content.js'});await page.waitForSelector('superx-draft-action',{state:'attached'});await settle(page);
}
async function installImageFixture(page,options={}){
  await page.evaluate(options=>{
    const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM4sAAAAASUVORK5CYII=';
    const bytes=Uint8Array.from(atob(png),letter=>letter.charCodeAt(0));
    const nativeFetch=window.fetch.bind(window);
    Object.assign(qa,{imageFetches:[],imageAborts:0,deferImages:Boolean(options.defer),releaseImages:[],imageBytes:bytes});
    if(options.fastTimeout){
      const nativeTimeout=window.setTimeout.bind(window),nativeClear=window.clearTimeout.bind(window);qa.captureTimers=[];
      window.setTimeout=(callback,delay,...args)=>{
        if(delay!==20000)return nativeTimeout(callback,delay,...args);
        const timer={cleared:false,fired:false};timer.id=nativeTimeout(()=>{timer.fired=true;callback(...args);},60);qa.captureTimers.push(timer);return timer.id;
      };
      window.clearTimeout=id=>{const timer=qa.captureTimers.find(timer=>timer.id===id);if(timer)timer.cleared=true;return nativeClear(id);};
    }
    window.fetch=async(url,init={})=>{
      if(!String(url).startsWith('blob:'))return nativeFetch(url,init);
      qa.imageFetches.push({url:String(url),credentials:init.credentials,hadSignal:Boolean(init.signal)});
      if(qa.deferImages)await new Promise((resolve,reject)=>{
        const abort=()=>{qa.imageAborts++;reject(new DOMException('Fixture cancelled','AbortError'));};
        init.signal?.addEventListener('abort',abort,{once:true});
        qa.releaseImages.push(()=>{init.signal?.removeEventListener('abort',abort);resolve();});
      });
      if(options.failFetch)throw new TypeError('Fixture image unavailable');
      if(options.oversize)return new Response(bytes,{headers:{'content-length':String(8*1024*1024+1)}});
      return nativeFetch(url,init);
    };
    const attachments=document.createElement('div');attachments.dataset.testid='attachments';attachments.className='fixture-draft-images';
    attachments.style.cssText='display:flex;gap:4px;margin:8px 52px;min-height:64px';
    const toolbar=document.querySelector('.native-toolbar');toolbar.before(attachments);
    qa.newImage=(index=0)=>{
      const wrapper=document.createElement('div');wrapper.dataset.testid='tweetPhoto';
      const img=document.createElement('img');img.alt='User attachment '+index;img.style.cssText='display:block;width:64px;height:64px;object-fit:contain';
      img.src=URL.createObjectURL(new Blob([options.unsupported?Uint8Array.of(71,73,70,56,57,97):bytes],{type:options.unsupported?'image/gif':'image/png'}));
      wrapper.append(img);attachments.append(wrapper);return img;
    };
    for(let index=0;index<(options.count??1);index++)qa.newImage(index);
    if(options.quote){
      const quote=document.createElement('article');quote.dataset.testid='tweet';quote.innerHTML='<div data-testid="User-Name"><span>Source @source</span></div><div data-testid="tweetText">An independently quoted source</div>';
      const picture=document.createElement('img');picture.src=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));picture.style.cssText='display:block;width:64px;height:64px';
      const photo=document.createElement('div');photo.dataset.testid='tweetPhoto';photo.append(picture);quote.append(photo);attachments.append(quote);
      qa.quoteBlobURL=picture.src;
    }
  },options);
}
try{
  try{browser=await chromium.launch({channel:'msedge',headless:true});}catch{browser=await chromium.launch({headless:true});}
  if(focus==='full'||focus==='images'){
    const imageContext=await browser.newContext({viewport:{width:1100,height:1000},reducedMotion:'reduce'});
    await imageContext.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base||['data:','blob:'].includes(url.protocol))return route.continue();report.externalRequests.push({label:'draft-images',url:url.href});return route.abort();});
    const page=await imageContext.newPage();page.on('pageerror',error=>report.pageErrors.push({label:'draft-images',message:error.message}));
    const sent=()=>page.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT'));
    for(const scene of ['new-inline','new-modal','reply-modal','reply-inline'])for(const scheme of ['dark','light']){
      const label=`draft images/${scene}/${scheme}`;
      await start(page,scene,scheme,1100,'en','separator',page=>installImageFixture(page));
      const action=page.locator('superx-draft-action').getByRole('button');
      check(label+': image-only draft enables the explicit check',await action.isEnabled());
      await page.locator('[contenteditable]').fill('A claim in the attached picture.');await settle(page);
      await page.locator('[contenteditable]').fill('');await settle(page);
      check(label+': selecting or typing never reads attachment bytes',await page.evaluate(()=>qa.imageFetches.length===0));
      await action.click();await page.waitForFunction(()=>qa.sent.some(message=>message.type==='ANALYZE_DRAFT'));
      const request=(await sent())[0],capture=await page.evaluate(()=>qa.imageFetches);
      check(label+': one trusted click captures the image without credentials',capture.length===1&&capture[0].credentials==='omit'&&capture[0].hadSignal,capture);
      check(label+': image bytes reach the image-only draft rather than a transient blob URL',request.draft.text===''&&request.draft.images?.length===1&&request.draft.images[0].url.startsWith('data:image/png;base64,')&&request.draft.images[0].alt==='User attachment 0'&&!JSON.stringify(request).includes('blob:'),{mode:request.draft.mode,imageCount:request.draft.images?.length,text:request.draft.text});
      check(label+': included image does not show an inaccurate text-only warning',await page.locator('superx-draft-panel .text-only').isHidden());
      await emit(page,{type:'RESULT',requestId:request.requestId,result:{text:'The local attachment has been included.',model:'grok-4.3',usage:{input_tokens:20,output_tokens:10,total_tokens:30}}});await settle(page);
      await page.evaluate(()=>{const img=document.querySelector('.fixture-draft-images img');img.src=URL.createObjectURL(new Blob([qa.imageBytes],{type:'image/png'}));});await settle(page);
      check(label+': replacing the visible image marks the retained answer stale',await page.locator('superx-draft-panel .stale').isVisible());
      check(label+': image replacement does not silently read bytes or request a new answer',await page.evaluate(()=>qa.imageFetches.length===1)&&((await sent()).length===1));
      await page.locator('.fixture-draft-images').evaluate(node=>node.remove());await settle(page);
      check(label+': removing the final image disables the empty draft and hides its retained result',await action.isDisabled()&&await page.locator('superx-draft-panel').isHidden());
    }
    for(const reason of ['account-change','reset']){
      await start(page,'new-modal','dark',1100,'en','separator',page=>installImageFixture(page,{defer:true}));
      await page.locator('superx-draft-action').getByRole('button').click();await page.waitForFunction(()=>qa.imageFetches.length===1);
      check('draft images/'+reason+': attachment capture waits without dispatching a provider request',(await sent()).length===0);
      if(reason==='account-change')await config(page,{identity:'api:other-account'});else await page.evaluate(()=>qa.manager.reset());
      await page.evaluate(()=>{for(const release of qa.releaseImages)release();});await settle(page);
      check('draft images/'+reason+': cancelled image capture cannot dispatch stale image bytes',await page.evaluate(()=>qa.imageAborts===1)&&((await sent()).length===0));
    }
    await start(page,'new-modal','dark',1100,'en','separator',page=>installImageFixture(page,{defer:true,fastTimeout:true}));
    await page.locator('superx-draft-action').getByRole('button').click();
    await page.waitForFunction(()=>document.querySelector('superx-draft-panel').shadowRoot.querySelector('.spinner').hidden);
    const timedOutStatus=await page.locator('superx-draft-panel .state-label').innerText();
    const unavailable=await page.evaluate(()=>GrokFirstUI.t('draft.imageUnavailable','en'));
    check('draft images/timeout: stalled capture aborts with a useful error and no provider dispatch',timedOutStatus===unavailable&&await page.evaluate(()=>qa.imageAborts===1)&&(await sent()).length===0,timedOutStatus);
    await page.evaluate(()=>{for(const release of qa.releaseImages)release();});await settle(page);
    check('draft images/timeout: late image resolution cannot dispatch after the timeout',(await sent()).length===0);
    await start(page,'new-inline','light',1100,'en','separator',page=>installImageFixture(page,{fastTimeout:true}));
    await page.locator('superx-draft-action').getByRole('button').click();await page.waitForFunction(()=>qa.sent.some(message=>message.type==='ANALYZE_DRAFT'));await settle(page);
    check('draft images/timeout: successful capture clears its deadline before it can fire',await page.evaluate(()=>qa.captureTimers.length===1&&qa.captureTimers[0].cleared&&!qa.captureTimers[0].fired)&&(await sent()).length===1,await page.evaluate(()=>qa.captureTimers));
    for(const [kind,options,expected]of [
      ['unsupported',{unsupported:true},'draft.imageUnsupported'],['unavailable',{failFetch:true},'draft.imageUnavailable'],
      ['oversize',{oversize:true},'draft.imageTooLarge'],['too-many',{count:5},'draft.imageTooLarge']
    ]){
      await start(page,'new-inline','light',1100,'en','separator',page=>installImageFixture(page,options));
      await page.locator('superx-draft-action').getByRole('button').click();await page.waitForFunction(()=>document.querySelector('superx-draft-panel').shadowRoot.querySelector('.spinner').hidden);
      const status=await page.locator('superx-draft-panel .state-label').innerText();
      const expectedStatus=await page.evaluate(key=>GrokFirstUI.t(key,'en'),expected);
      check('draft images/'+kind+': attachment failure is visible and never falls back to text-only analysis',(await sent()).length===0&&status===expectedStatus&&status!==expected,status);
      if(kind==='too-many')check('draft images/too-many: validates count before fetching bytes',await page.evaluate(()=>qa.imageFetches.length===0));
    }
    await start(page,'new-modal','light',1100,'en','separator',page=>installImageFixture(page,{quote:true}));
    await page.locator('[contenteditable]').fill('Check my attached picture in relation to the quoted source.');await settle(page);
    await page.locator('superx-draft-action').getByRole('button').click();await page.waitForFunction(()=>qa.sent.some(message=>message.type==='ANALYZE_DRAFT'));
    const quotedRequest=(await sent())[0];
    check('draft images/quote: quoted preview pixels are never recaptured as private draft uploads',quotedRequest.draft.images?.length===1&&await page.evaluate(()=>qa.imageFetches.length===1&&qa.imageFetches[0].url!==qa.quoteBlobURL),{imageCount:quotedRequest.draft.images?.length});
    check('draft images/quote: quoted text remains auxiliary context',quotedRequest.draft.quotedContext?.some(post=>post.text==='An independently quoted source'),quotedRequest.draft.quotedContext);
    check('draft images: native publish button was never activated',await page.evaluate(()=>qa.nativePublishes===0));
    await imageContext.close();
  }
  if(focus==='full'||focus==='controls'){
    for(const scene of ['new-inline','new-modal','reply-modal','reply-inline'])for(const scheme of ['dark','light'])for(const width of [1280,390]){
      const label=`draft controls/${scene}/${scheme}/${width}`,context=await browser.newContext({viewport:{width,height:1000},colorScheme:scheme,reducedMotion:'reduce'});
      await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base||['data:','blob:'].includes(url.protocol))return route.continue();report.externalRequests.push({label,url:url.href});return route.abort();});
      const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push({label,message:error.message}));
      await start(page,scene,scheme,width,scheme==='dark'?'zh-CN':'en');
      const editor=page.locator('[contenteditable]'),action=page.locator('superx-draft-action').getByRole('button');
      const capture=()=>page.evaluate(()=>{
        const host=document.querySelector('superx-draft-action'),button=host.shadowRoot.querySelector('button'),mark=host.shadowRoot.querySelector('.mark'),publish=document.querySelector('.publish'),style=getComputedStyle(button);
        const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
        return {geometry:qa.captureGeometry(),button:rect(button),mark:rect(mark),disabled:button.disabled,visible:host.getBoundingClientRect().width>0&&!host.hidden,opacity:style.opacity,background:style.backgroundColor,color:style.color,mask:getComputedStyle(mark).maskImage,cursor:style.cursor,aria:button.getAttribute('aria-label'),title:button.title,directBeforePublish:host.nextElementSibling===publish.parentElement,insidePublishColumn:publish.parentElement.contains(host),publishStyle:publish.getAttribute('style'),overflow:document.documentElement.scrollWidth>innerWidth+1};
      });
      const empty=await capture();
      check(`${label}: empty editor keeps visible disabled circle beside publish`,empty.visible&&empty.disabled&&empty.directBeforePublish&&!empty.insidePublishColumn&&!empty.overflow,empty);
      check(`${label}: medium logo uses 23px in the native 36px circle`,Math.abs(empty.button.width-empty.button.height)<=1&&Math.abs(empty.button.height-empty.geometry.publish.height)<=1&&empty.mark.width>20&&empty.mark.width<26&&Math.abs(empty.mark.width-23)<=.1&&Math.abs(empty.mark.width-empty.mark.height)<=1&&empty.mask.includes('superx-symbol.svg'),empty);
      check(`${label}: accessible disabled control retains a useful label and title`,Boolean(empty.aria)&&Boolean(empty.title)&&empty.cursor!=='pointer',empty);
      if(scheme==='light')check(`${label}: English empty tooltip gives the precise next step`,empty.title==='Enter text or add an image to fact-check.',empty.title);
      await page.mouse.click(empty.button.x+empty.button.width/2,empty.button.y+empty.button.height/2);await settle(page);
      check(`${label}: trusted mouse click on disabled empty action sends nothing`,await page.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===0&&qa.nativePublishes===0));
      await startFrameAudit(page);await editor.fill('A short factual draft.');await settle(page);await page.mouse.move(0,0);await settle(page);
      const typed=await capture(),typingFrames=await finishFrameAudit(page);
      check(`${label}: typing enables the same control without shifting native toolbar`,typed.visible&&!typed.disabled&&typed.directBeforePublish&&maxGeometryDrift(empty.geometry,typed.geometry)<=1&&typingFrames.every(frame=>maxGeometryDrift(empty.geometry,frame)<=1)&&typed.publishStyle===empty.publishStyle,typed);
      check(`${label}: disabled appearance differs from enabled appearance`,empty.opacity!==typed.opacity||empty.background!==typed.background||empty.color!==typed.color,{empty:{opacity:empty.opacity,background:empty.background,color:empty.color},typed:{opacity:typed.opacity,background:typed.background,color:typed.color}});
      const gap=typed.geometry.publish.x-typed.button.right;
      check(`${label}: circle and publish share baseline with a compact non-overlapping gap`,gap>=4&&gap<=20&&Math.abs(typed.button.y+typed.button.height/2-typed.geometry.publish.y-typed.geometry.publish.height/2)<=1,{gap,button:typed.button,publish:typed.geometry.publish});
      await startFrameAudit(page);await editor.fill('');await settle(page);const cleared=await capture(),clearingFrames=await finishFrameAudit(page);
      check(`${label}: clearing restores disabled appearance without size or position changes`,cleared.visible&&cleared.disabled&&cleared.opacity===empty.opacity&&cleared.background===empty.background&&maxGeometryDrift(empty.geometry,cleared.geometry)<=1&&clearingFrames.every(frame=>maxGeometryDrift(empty.geometry,frame)<=1),cleared);
      await editor.fill('A short factual draft.');await settle(page);await action.click();await settle(page);
      const request=await page.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').at(-1));
      check(`${label}: enabled explicit click creates one task for current text`,Boolean(request)&&request.draft.text==='A short factual draft.'&&await page.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1));
      await emit(page,{type:'RESULT',requestId:request.requestId,result:{text:'A retained local fixture answer.',model:'grok-4.3',usage:{input_tokens:20,output_tokens:10,total_tokens:30}}});await settle(page);
      await editor.fill('');await settle(page);const completedEmpty=await capture();
      await page.mouse.click(completedEmpty.button.x+completedEmpty.button.width/2,completedEmpty.button.y+completedEmpty.button.height/2);await settle(page);
      check(`${label}: empty editor disables even a completed-result action and keeps panel closed`,completedEmpty.visible&&completedEmpty.disabled&&await page.locator('superx-draft-panel').isHidden()&&await page.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1),completedEmpty);
      check(`${label}: clearing a completed answer preserves native control geometry`,maxGeometryDrift(empty.geometry,completedEmpty.geometry)<=1,completedEmpty.geometry);
      await editor.fill('A short factual draft.');await settle(page);await action.click();await settle(page);
      check(`${label}: restoring text reopens retained answer without another request`,await page.locator('superx-draft-panel .answer').innerText().then(value=>value.includes('retained local fixture'))&&await page.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1));
      if(width===390&&scene==='reply-modal'){const filename=`draft-controls-result-${scheme}-${width}.png`;await page.screenshot({path:path.join(output,filename),fullPage:true});report.screenshots.push(filename);(report.screenshotStates||={})[filename]={draft:'nonempty',nativePublish:'enabled',source:'isolated result fixture; no model request'};}
      await context.close();
    }
    for(const scheme of ['dark','light'])for(const variant of ['button','publish-wrapper','shared-wrapper','button-and-wrapper','shared-and-button']){
      const label=`draft disabled appearance/${variant}/${scheme}`,context=await browser.newContext({viewport:{width:1100,height:850},colorScheme:scheme,reducedMotion:'reduce'});
      await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base||['data:','blob:'].includes(url.protocol))return route.continue();report.externalRequests.push({label,url:url.href});return route.abort();});
      const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push({label,message:error.message}));
      await start(page,'new-inline',scheme,1100,'en','separator',page=>page.evaluate(variant=>{
        const editor=document.querySelector('[contenteditable]'),publish=document.querySelector('.publish'),wrapper=document.querySelector('.publish-column'),shared=document.querySelector('.submit-row');
        const update=()=>{
          const empty=!editor.textContent.trim();publish.disabled=empty;
          publish.style.opacity=empty?(variant==='button'?'.25':['button-and-wrapper','shared-and-button'].includes(variant)?'.5':'1'):'1';
          wrapper.style.opacity=empty?(variant==='publish-wrapper'?'.25':variant==='button-and-wrapper'?'.5':'1'):'1';
          shared.style.opacity=empty?(variant==='shared-wrapper'?'.25':variant==='shared-and-button'?'.5':'1'):'1';
        };editor.addEventListener('input',update);update();
      },variant));
      const capture=()=>page.evaluate(()=>{
        const host=document.querySelector('superx-draft-action'),action=host.shadowRoot.querySelector('.action'),publish=document.querySelector('.publish');
        const effectiveOpacity=node=>{let opacity=1;for(let current=node;current;current=current.parentElement||current.getRootNode()?.host){opacity*=Number.parseFloat(getComputedStyle(current).opacity)||0;}return opacity;};
        const sample=node=>{const r=node.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+3,width:r.width,height:r.height,opacity:effectiveOpacity(node),bg:getComputedStyle(node).backgroundColor,disabled:node.disabled};};
        return {action:sample(action),publish:sample(publish),geometry:qa.captureGeometry(),title:action.title};
      });
      const pixels=async(positions,filename)=>{
        const png=await page.screenshot(filename?{path:path.join(output,filename)}:{});if(filename)report.screenshots.push(filename);
        return page.evaluate(async({base64,positions})=>{
          const img=new Image();img.src='data:image/png;base64,'+base64;await img.decode();const canvas=new OffscreenCanvas(img.width,img.height),ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
          const sample=point=>{const values=[];for(let dx=-1;dx<=1;dx++)for(let dy=0;dy<=1;dy++)values.push([...ctx.getImageData(Math.round(point.x+dx),Math.round(point.y+dy),1,1).data].slice(0,3));return [0,1,2].map(i=>values.map(pixel=>pixel[i]).sort((a,b)=>a-b)[Math.floor(values.length/2)]);};
          const action=sample(positions.action),publish=sample(positions.publish);return {action,publish,maxDifference:Math.max(...action.map((value,i)=>Math.abs(value-publish[i])))};
        },{base64:png.toString('base64'),positions});
      };
      const screenshot=variant==='button-and-wrapper'?`draft-disabled-${variant}-${scheme}.png`:undefined;
      await page.mouse.move(0,0);await settle(page);const empty=await capture(),emptyPixels=await pixels(empty,screenshot);
      if(screenshot)(report.screenshotStates||={})[screenshot]={draft:'empty',nativePublish:'disabled',nativeButtonOpacity:'.5',nativePublishWrapperOpacity:'.5',effectiveNativeOpacity:empty.publish.opacity,effectiveDraftOpacity:empty.action.opacity,source:'isolated native-disabled fixture; no model request'};
      check(`${label}: disabled opacity matches native even across wrapper ownership`,empty.action.disabled&&empty.publish.disabled&&Math.abs(empty.action.opacity-empty.publish.opacity)<.001&&Math.abs(empty.publish.opacity-.25)<.001,empty);
      check(`${label}: actual disabled composite pixels match native Post`,emptyPixels.maxDifference<=3,emptyPixels);
      check(`${label}: empty English tooltip stays exact`,empty.title==='Enter text or add an image to fact-check.',empty.title);
      await page.mouse.click(empty.action.x,empty.action.y+12);await settle(page);
      check(`${label}: disabled appearance remains non-interactive`,await page.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===0&&qa.nativePublishes===0));
      await page.locator('[contenteditable]').fill('A draft with native enabled Post.');await settle(page);await page.mouse.move(0,0);const enabled=await capture(),enabledPixels=await pixels(enabled);
      check(`${label}: enabled opacity and actual background match native Post`,!enabled.action.disabled&&!enabled.publish.disabled&&Math.abs(enabled.action.opacity-enabled.publish.opacity)<.001&&enabledPixels.maxDifference<=3,{enabled,pixels:enabledPixels});
      await page.locator('[contenteditable]').fill('');await settle(page);const restored=await capture(),restoredPixels=await pixels(restored);
      check(`${label}: empty enabled empty transitions preserve geometry and native composite`,maxGeometryDrift(empty.geometry,enabled.geometry)<=1&&maxGeometryDrift(empty.geometry,restored.geometry)<=1&&restoredPixels.maxDifference<=3&&Math.abs(restored.action.opacity-.25)<.001,{empty:empty.geometry,enabled:enabled.geometry,restored:restored.geometry,pixels:restoredPixels});
      await context.close();
    }
    for(const {gap,previousMargin,nextMargin} of [{gap:0,previousMargin:0,nextMargin:12},{gap:6,previousMargin:0,nextMargin:12},{gap:12,previousMargin:5,nextMargin:4},{gap:4,previousMargin:16,nextMargin:0}]){
      const label=`draft symmetric spacing/gap-${gap}/margins-${previousMargin}-${nextMargin}`,context=await browser.newContext({viewport:{width:390,height:850},colorScheme:'dark',reducedMotion:'reduce'});
      await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base||['data:','blob:'].includes(url.protocol))return route.continue();report.externalRequests.push({label,url:url.href});return route.abort();});
      const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push({label,message:error.message}));
      await start(page,'new-inline','dark',390,'en','separator',page=>page.evaluate(({gap,previousMargin,nextMargin})=>{
        document.querySelector('.submit-row').style.columnGap=gap+'px';document.querySelector('.add-post').style.marginInlineEnd=previousMargin+'px';document.querySelector('.publish-column').style.marginInlineStart=nextMargin+'px';
      },{gap,previousMargin,nextMargin}));
      const capture=()=>page.evaluate(()=>{
        const host=document.querySelector('superx-draft-action'),previous=host.previousElementSibling,publish=document.querySelector('.publish'),rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width,y:r.y,height:r.height};};
        const action=rect(host),before=rect(previous),after=rect(publish);
        return {left:action.x-before.right,right:after.x-action.right,action,before,after,geometry:qa.captureGeometry(),previousStyle:previous.getAttribute('style'),publishWrapperStyle:publish.parentElement.getAttribute('style'),overflow:document.documentElement.scrollWidth>innerWidth+1};
      });
      const empty=await capture(),expected=Math.max(8,gap+previousMargin,gap+nextMargin);
      check(`${label}: left and right visual gaps match without rewriting native margins`,Math.abs(empty.left-empty.right)<=1&&Math.abs(empty.left-expected)<=1&&empty.previousStyle.includes('margin-inline-end: '+previousMargin+'px')&&empty.publishWrapperStyle.includes('margin-inline-start: '+nextMargin+'px')&&!empty.overflow,{...empty,expected});
      await page.locator('[contenteditable]').fill('The gaps stay balanced.');await settle(page);const typed=await capture();
      if(gap===6){const filename='draft-controls-symmetric-native-margin-typed-390.png';await page.mouse.move(0,0);await page.screenshot({path:path.join(output,filename),fullPage:true});report.screenshots.push(filename);(report.screenshotStates||={})[filename]={draft:'nonempty',nativePublish:'enabled',nativeColumnGap:gap,nativePublishWrapperMarginStart:nextMargin,leftGap:typed.left,rightGap:typed.right,source:'isolated native spacing fixture; no model request'};}
      await page.locator('[contenteditable]').fill('');await settle(page);const restored=await capture();
      check(`${label}: typing and clearing keep balanced gaps and fixed native layout`,Math.abs(typed.left-typed.right)<=1&&Math.abs(restored.left-restored.right)<=1&&maxGeometryDrift(empty.geometry,typed.geometry)<=1&&maxGeometryDrift(empty.geometry,restored.geometry)<=1,{empty,typed,restored});
      await context.close();
    }
  }
  if(['full','controls','spacing'].includes(focus)){
    // Real reply toolbars can hide the add-post branch and put horizontal
    // spacing inside the counter/publish wrappers. Compare the controls the
    // user sees, not those wrappers' otherwise-equal outer border boxes.
    for(const scene of ['reply-inline','reply-modal'])for(const {direction,reverse} of [{direction:'ltr',reverse:false},{direction:'rtl',reverse:false},{direction:'ltr',reverse:true},{direction:'rtl',reverse:true}])for(const width of [1280,390])for(const variant of ['wrapper-insets','button-margin','counter-inset','centered-counter']){
      const label=`reply visual spacing/${scene}/${direction}/${reverse?'row-reverse':'row'}/${width}/${variant}`,context=await browser.newContext({viewport:{width,height:1000},colorScheme:'dark',reducedMotion:'reduce'});
      await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base||['data:','blob:'].includes(url.protocol))return route.continue();report.externalRequests.push({label,url:url.href});return route.abort();});
      const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push({label,message:error.message}));
      await start(page,scene,'dark',width,'zh-CN','separator',page=>page.evaluate(({direction,reverse,variant})=>{
        const row=document.querySelector('.submit-row'),counter=document.querySelector('.counter-branch'),wrapper=document.querySelector('.publish-column'),publish=document.querySelector('.publish');
        row.dir=direction;row.style.flexDirection=reverse?'row-reverse':'row';row.style.columnGap='6px';
        for(const node of [document.querySelector('.compose-divider'),document.querySelector('.add-post')]){node.hidden=true;node.style.marginInlineEnd='19px';}
        counter.style.paddingInlineEnd=(variant==='counter-inset'?12:variant==='wrapper-insets'?5:0)+'px';
        wrapper.style.paddingInlineStart=(variant==='wrapper-insets'?12:variant==='counter-inset'?4:0)+'px';
        publish.style.marginInlineStart=(variant==='button-margin'?10:0)+'px';
        if(variant==='centered-counter'){
          row.style.columnGap='0px';counter.style.width='30px';counter.style.alignItems='center';wrapper.style.marginInlineStart='12px';
          const svg=counter.querySelector('svg');svg.setAttribute('width','20');svg.setAttribute('height','20');svg.setAttribute('viewBox','0 0 20 20');svg.style.overflow='visible';
          for(const circle of svg.querySelectorAll('circle')){circle.setAttribute('cx','10');circle.setAttribute('cy','10');circle.setAttribute('r','10');}
          row.prepend(document.querySelector('.compose-divider'),document.querySelector('.add-post'));
        }
      },{direction,reverse,variant}));
      const capture=()=>page.evaluate(()=>{
        const host=document.querySelector('superx-draft-action'),button=host.shadowRoot.querySelector('button'),counter=document.querySelector('.counter-branch svg'),publish=document.querySelector('.publish'),row=host.parentElement;
        const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width,y:r.y,height:r.height};};
        const painted=[...counter.querySelectorAll('circle')].map(circle=>{const bounds=rect(circle),style=getComputedStyle(circle),matrix=circle.getScreenCTM(),stroke=style.stroke==='none'?0:(Number.parseFloat(style.strokeWidth)||0),xInset=stroke/2*(matrix?Math.hypot(matrix.a,matrix.c):1),yInset=stroke/2*(matrix?Math.hypot(matrix.b,matrix.d):1);return {x:bounds.x-xInset,right:bounds.right+xInset,y:bounds.y-yInset,bottom:bounds.y+bounds.height+yInset};});
        const before=painted.length?{x:Math.min(...painted.map(box=>box.x)),right:Math.max(...painted.map(box=>box.right)),y:Math.min(...painted.map(box=>box.y)),width:Math.max(...painted.map(box=>box.right))-Math.min(...painted.map(box=>box.x)),height:Math.max(...painted.map(box=>box.bottom))-Math.min(...painted.map(box=>box.y))}:rect(counter);
        const rowStyle=getComputedStyle(row),action=rect(button),after=rect(publish),rtl=(rowStyle.direction==='rtl')!==(rowStyle.flexDirection==='row-reverse');
        return {leading:rtl?before.x-action.right:action.x-before.right,trailing:rtl?action.x-after.right:after.x-action.right,action,before,after,nativeStyles:[document.querySelector('.counter-branch').getAttribute('style'),publish.parentElement.getAttribute('style'),publish.getAttribute('style')],hiddenControls:[document.querySelector('.compose-divider').hidden,document.querySelector('.add-post').hidden],requests:qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length,overflow:document.documentElement.scrollWidth>innerWidth+1};
      });
      const balanced=value=>Math.abs(value.leading-value.trailing)<=1&&value.leading>=8&&value.trailing<=32&&!value.overflow;
      const empty=await capture();check(`${label}: empty reply uses equal visible-control gaps despite wrapper insets and hidden siblings`,balanced(empty)&&empty.hiddenControls.every(Boolean),empty);
      await page.locator('[contenteditable]').fill('用于核查的简短回复。');await settle(page);const typed=await capture();
      check(`${label}: typing preserves balanced gaps and native wrapper styles`,balanced(typed)&&JSON.stringify(typed.nativeStyles)===JSON.stringify(empty.nativeStyles)&&typed.action.width===empty.action.width,typed);
      if(scene==='reply-modal'&&direction==='ltr'&&!reverse&&['wrapper-insets','centered-counter'].includes(variant)){
        const filename=`reply-visual-spacing-${variant}-typed-${width}.png`;await page.screenshot({path:path.join(output,filename),fullPage:true});report.screenshots.push(filename);
      }
      await page.locator('superx-draft-action').getByRole('button').click();await settle(page);
      const request=await page.evaluate(()=>qa.sent.find(message=>message.type==='ANALYZE_DRAFT'));
      await emit(page,{type:'RESULT',requestId:request.requestId,result:{text:'这是隔离界面测试的核查结果。',model:'grok-4.3',usage:{input_tokens:20,output_tokens:10,total_tokens:30}}});await settle(page);
      const open=await capture();await page.locator('superx-draft-action').getByRole('button').click();await settle(page);const closed=await capture();await page.locator('superx-draft-action').getByRole('button').click();await settle(page);const reopened=await capture();
      check(`${label}: showing and hiding a result keeps both visible gaps stable without another request`,[open,closed,reopened].every(balanced)&&[open,closed,reopened].every(value=>Math.abs(value.leading-typed.leading)<=1&&Math.abs(value.trailing-typed.trailing)<=1&&value.requests===1),{typed,open,closed,reopened});
      await page.locator('[contenteditable]').fill('');await settle(page);const cleared=await capture();check(`${label}: clearing returns to the same symmetric empty geometry`,balanced(cleared)&&Math.abs(cleared.leading-empty.leading)<=1&&Math.abs(cleared.trailing-empty.trailing)<=1,cleared);
      if(scene==='reply-modal'&&direction==='ltr'&&!reverse&&['wrapper-insets','centered-counter'].includes(variant)){
        const filename=`reply-visual-spacing-${variant}-empty-${width}.png`;await page.screenshot({path:path.join(output,filename),fullPage:true});report.screenshots.push(filename);
      }
      await context.close();
    }
    for(const scene of ['reply-inline','reply-modal'])for(const {direction,reverse} of [{direction:'ltr',reverse:false},{direction:'rtl',reverse:false},{direction:'ltr',reverse:true},{direction:'rtl',reverse:true}]){
      const label=`reply wide predecessor/${scene}/${direction}/${reverse?'row-reverse':'row'}`,context=await browser.newContext({viewport:{width:1280,height:1000},colorScheme:'dark',reducedMotion:'reduce'});
      await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base||['data:','blob:'].includes(url.protocol))return route.continue();report.externalRequests.push({label,url:url.href});return route.abort();});
      const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push({label,message:error.message}));
      await start(page,scene,'dark',1280,'en','separator',page=>page.evaluate(({direction,reverse})=>{
        const row=document.querySelector('.submit-row'),counter=document.querySelector('.counter-branch'),publish=document.querySelector('.publish');
        row.dir=direction;row.style.cssText=`flex:1;flex-direction:${reverse?'row-reverse':'row'};column-gap:6px`;counter.style.cssText=`flex:1 1 0px;align-items:${reverse?'flex-end':'flex-start'}`;
        document.querySelector('.compose-divider').hidden=true;document.querySelector('.add-post').hidden=true;
        const r=publish.getBoundingClientRect(),box=row.getBoundingClientRect(),style=getComputedStyle(row),rtl=(style.direction==='rtl')!==(style.flexDirection==='row-reverse');
        qa.wideNativeBefore={x:r.x,y:r.y,width:r.width,height:r.height,inlineEndInset:rtl?r.left-box.left:box.right-r.right,topInset:r.top-box.top};
      },{direction,reverse}));
      const capture=()=>page.evaluate(()=>{
        const host=document.querySelector('superx-draft-action'),button=host.shadowRoot.querySelector('button'),publish=document.querySelector('.publish'),style=getComputedStyle(host.parentElement),rtl=(style.direction==='rtl')!==(style.flexDirection==='row-reverse');
        const a=button.getBoundingClientRect(),p=publish.getBoundingClientRect(),box=host.parentElement.getBoundingClientRect();return {trailing:rtl?a.left-p.right:p.left-a.right,actionX:a.x,publishX:p.x,publishY:p.y,inlineEndInset:rtl?p.left-box.left:box.right-p.right,topInset:p.top-box.top,baseline:qa.wideNativeBefore,overflow:document.documentElement.scrollWidth>innerWidth+1,innerWidth};
      });
      // Initial modal attachment can reserve the native scrollbar gutter.
      // Preserve the native button's anchor within its row, rather than
      // requiring the pre-gutter viewport coordinate to remain unchanged.
      const empty=await capture();check(`${label}: distant control does not become a giant local margin`,empty.trailing>=8&&empty.trailing<=24&&!empty.overflow&&Math.abs(empty.inlineEndInset-empty.baseline.inlineEndInset)<=1&&Math.abs(empty.topInset-empty.baseline.topInset)<=1,empty);
      await page.locator('[contenteditable]').fill('The native flexible blank space should stay blank.');await settle(page);
      await page.evaluate(()=>{for(let i=0;i<10;i++)qa.manager.scan();});await settle(page);const typed=await capture();
      check(`${label}: repeated measurement preserves native anchor and compact action gap`,Math.abs(typed.trailing-empty.trailing)<=1&&Math.abs(typed.actionX-empty.actionX)<=1&&Math.abs(typed.publishX-empty.publishX)<=1&&!typed.overflow,{empty,typed});
      await context.close();
    }
  }
  if(focus==='full'){
  for(const scene of ['new-inline','new-modal','reply-modal','reply-inline'])for(const scheme of ['dark','light'])for(const width of [1280,780,390]){
    const label=`${scene}/${scheme}/${width}`;
    const context=await browser.newContext({viewport:{width,height:1000},colorScheme:scheme,reducedMotion:'reduce'});
    await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base||['data:','blob:'].includes(url.protocol))return route.continue();report.externalRequests.push({label,url:route.request().url()});return route.abort();});
    const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push({label,message:error.message}));
    await start(page,scene,scheme,width);
    const editor=page.locator('[data-testid="tweetTextarea_0"]'),action=page.locator('superx-draft-action').getByRole('button').first();
    check(`${label}: exactly one draft action`,await page.locator('superx-draft-action').count()===1);
    const commonDepth=await editor.evaluate(node=>{let depth=0;for(let group=node.parentElement;group;group=group.parentElement,depth++)if(group.querySelector('.publish'))return depth;return -1;});
    check(`${label}: realistic deeply nested native editor remains discoverable`,commonDepth>=20,{commonDepth});
    check(`${label}: empty draft action stays visible and disabled without sending`,await action.isVisible()&&await action.isDisabled()&&await page.evaluate(()=>qa.sent.length===0));
    await editor.fill(t);await settle(page);
    check(`${label}: nonempty draft enables Check action`,await action.isVisible()&&await action.isEnabled()&&(await action.getAttribute('aria-label'))==='Check');
    await editor.evaluate(node=>{node.focus();const range=document.createRange();range.setStart(node.firstChild,8);range.setEnd(node.firstChild,19);getSelection().removeAllRanges();getSelection().addRange(range);});
    const selectedBefore=await page.evaluate(()=>String(getSelection()));
    const fixedGeometry=await geometrySnapshot(page),geometryStates=[];
    const auditFrames=scheme==='dark'&&width!==780;
    if(auditFrames)await startFrameAudit(page);
    await action.click();await settle(page);
    geometryStates.push(await geometrySnapshot(page));
    if(auditFrames){const frames=await finishFrameAudit(page);check(`${label}: opening keeps native geometry and inset line at the same y in every frame`,frames.every(frame=>frame.lineVisible&&frame.ownBorder===0&&maxGeometryDrift(fixedGeometry,frame)<=1&&insetLineMatches(frame,fixedGeometry)),frames.map(frame=>({label:frame.action?.width,divider:frame.nativeLine,lineVisible:frame.lineVisible,shortLine:frame.shortLine,cover:frame.cover})));}
    const requests=await page.evaluate(()=>qa.sent.filter(item=>item.type==='ANALYZE_DRAFT'));
    check(`${label}: one explicit click sends one draft`,requests.length===1&&requests[0].draft.text===t,requests.map(item=>({type:item.type,text:item.draft.text,contextURL:item.draft.context?.url})));
    check(`${label}: click preserves draft and selection`,await editor.innerText()===t&&await page.evaluate(()=>String(getSelection()))===selectedBefore);
    check(`${label}: checking does not publish`,await page.evaluate(()=>qa.nativePublishes===0));
    if(scene.startsWith('reply'))check(`${label}: correct reply mode and parent context`,requests[0].draft.mode==='reply'&&requests[0].draft.context?.url==='https://x.com/nasa/status/1956376225074552934',requests[0].draft);
    else check(`${label}: new post mode has no accidental parent`,requests[0].draft.mode==='post'&&!requests[0].draft.context&&!requests[0].draft.threadContext,requests[0].draft);
    const requestId=requests[0].requestId;
    await emit(page,{type:'QUEUED',requestId});await settle(page);
    check(`${label}: queued state appears inline with spinner`,await page.locator('superx-draft-panel .spinner').isVisible()&&(await page.locator('superx-draft-panel .state-label').innerText()).toLowerCase().includes('queue'));
    await emit(page,{type:'START',requestId});await emit(page,{type:'UPDATE',requestId,text:answer,phase:'verify',sources:[source]});await settle(page);
    check(`${label}: running state appears inline with spinner`,await page.locator('superx-draft-panel .spinner').isVisible()&&(await page.locator('superx-draft-panel .state-label').innerText()).toLowerCase().includes('fact-check'));
    await page.mouse.move(0,0);await settle(page);
    const geometry=await page.evaluate(()=>{const panel=document.querySelector('superx-draft-panel'),toolbar=document.querySelector('[data-testid="toolBar"]'),submit=document.querySelector('.publish'),action=document.querySelector('superx-draft-action'),counter=document.querySelector('[role="progressbar"]'),rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};const nativeStyle=getComputedStyle(submit),labelStyle=getComputedStyle(submit.querySelector('span')),actionStyle=getComputedStyle(action.shadowRoot.querySelector('.action'));return {panel:rect(panel),toolbar:rect(toolbar),submit:rect(submit),action:rect(action),counter:rect(counter),editor:rect(document.querySelector('[contenteditable]')),before:qa.nativeBeforeInjection,stylesMatch:['backgroundColor','height'].every(property=>nativeStyle[property]===actionStyle[property])&&['color','fontSize','fontWeight'].every(property=>labelStyle[property]===actionStyle[property]),nativeParentDiffers:nativeStyle.color!==labelStyle.color&&nativeStyle.fontWeight!==labelStyle.fontWeight,publishColumnDirection:getComputedStyle(submit.parentElement).flexDirection,overflow:document.documentElement.scrollWidth>innerWidth+1,panelText:panel.shadowRoot.querySelector('.answer').textContent};});
    check(`${label}: answer below original toolbar`,geometry.panel.y>=geometry.toolbar.bottom-1,geometry);
    check(`${label}: action stays left of publish without overlap`,geometry.action.right<=geometry.submit.x+1,geometry);
    check(`${label}: action stays directly before native publish branch after counter controls`,await page.locator('superx-draft-action').evaluate(node=>node.nextElementSibling===document.querySelector('.publish-column'))&&geometry.action.x>=geometry.counter.right-1,geometry);
    check(`${label}: solid action matches native publish label instead of misleading parent style`,geometry.stylesMatch&&geometry.nativeParentDiffers,geometry);
    check(`${label}: logo button is circular at the native button height`,Math.abs(geometry.action.width-geometry.action.height)<1&&Math.abs(geometry.action.height-geometry.submit.height)<1,geometry.action);
    check(`${label}: native column wrapper does not stack draft action above submit`,geometry.publishColumnDirection==='column'&&Math.abs(geometry.action.y+geometry.action.height/2-geometry.submit.y-geometry.submit.height/2)<2,geometry);
    check(`${label}: answer insertion preserves configured editor and native submit width`,geometry.editor.width>=fixedGeometry.editor.width-1&&Math.abs(geometry.submit.width-geometry.before.publish.width)<1,geometry);
    check(`${label}: no horizontal overflow`,!geometry.overflow&&geometry.panel.width>200&&geometry.panel.right<=width+1,geometry);
    check(`${label}: streamed answer rendered safely`,geometry.panelText.includes('Finding supported')&&geometry.panelText.includes('ten minutes')===false);
    const panel=page.locator('superx-draft-panel');
    const openGeometry=await geometrySnapshot(page);
    check(`${label}: original full-width separator is reused without a second top border`,openGeometry.nativeBoundary&&openGeometry.lineVisible&&openGeometry.ownBorder===0&&openGeometry.boxMargin==='0px'&&Math.abs(openGeometry.nativeLine.y-fixedGeometry.nativeLine.y)<=1&&openGeometry.lineColor===fixedGeometry.lineColor,openGeometry);
    check(`${label}: visible short line keeps native y color and thickness while covering avatar-side segment`,insetLineMatches(openGeometry,fixedGeometry),openGeometry);
    check(`${label}: expanded answer retains a full-width lower boundary`,openGeometry.bottomBorder.width===fixedGeometry.nativeLine.height&&openGeometry.bottomBorder.color===fixedGeometry.lineColor,openGeometry.bottomBorder);
    check(`${label}: answer text aligns with original toolbar inset`,Math.abs(openGeometry.content.x-geometry.toolbar.x)<=1&&Math.abs(openGeometry.content.right-geometry.toolbar.right)<=1,openGeometry);
    if(scene==='new-inline'&&scheme==='dark'&&width===1280){const pixels=await probeLinePixels(page,openGeometry,'native-divider-open-pixels.png');check('native divider pixels: expanded line is visible only inside composer text inset',pixels.insideMatches&&pixels.outsideMatches,pixels);await page.screenshot({path:path.join(output,'native-divider-open-1280.png'),fullPage:true});report.screenshots.push('native-divider-open-1280.png');}
    check(`${label}: running open panel labels action Hide`,(await action.getAttribute('aria-label'))==='Hide');
    const layoutBeforeHide=await page.evaluate(()=>qa.layoutCalls||0);
    if(auditFrames)await startFrameAudit(page);
    await action.click();await settle(page);
    geometryStates.push(await geometrySnapshot(page));
    if(auditFrames){const frames=await finishFrameAudit(page);check(`${label}: hiding restores native full line without moving its y in every frame`,frames.every(frame=>frame.lineVisible&&frame.ownBorder===0&&maxGeometryDrift(fixedGeometry,frame)<=1&&insetLineMatches(frame,fixedGeometry)),frames.map(frame=>({label:frame.action?.width,divider:frame.nativeLine,lineVisible:frame.lineVisible,shortLine:frame.shortLine,cover:frame.cover})));}
    check(`${label}: external Hide closes panel and becomes Show`,await panel.isHidden()&&(await action.getAttribute('aria-label'))==='Show');
    if(scene==='new-inline'&&scheme==='dark'&&width===1280){const pixels=await probeLinePixels(page,await geometrySnapshot(page),'native-divider-closed-pixels.png');check('native divider pixels: hiding restores full original line at the same row',pixels.insideMatches&&pixels.outsideMatches,pixels);await page.screenshot({path:path.join(output,'native-divider-closed-1280.png'),fullPage:true});report.screenshots.push('native-divider-closed-1280.png');}
    check(`${label}: external panel toggle notifies parent layout`,await page.evaluate(()=>qa.layoutCalls||0)>layoutBeforeHide);
    await emit(page,{type:'UPDATE',requestId,text:answer+'\n\nStream continued while collapsed.',phase:'verify'});
    await action.click();await settle(page);
    geometryStates.push(await geometrySnapshot(page));
    check(`${label}: collapse/reopen restores same running task`,await page.evaluate(()=>qa.sent.filter(item=>item.type==='ANALYZE_DRAFT').length===1)&&await panel.locator('.answer').innerText().then(text=>text.includes('Stream continued')));
    await editor.fill(t+' The draft has changed.');await settle(page);
    check(`${label}: edit visibly marks earlier result stale`,await panel.locator('.stale').isVisible()&&await panel.locator('.stale').innerText().then(text=>text.length>0));
    await emit(page,{type:'RESULT',requestId,result:{text:answer,sources:[source],model:'grok-4.3',usage:{input_tokens:100,output_tokens:25,total_tokens:125}},cached:false});await settle(page);
    check(`${label}: Check Hide Show keep action and all native toolbar geometry fixed`,geometryStates.every(state=>maxGeometryDrift(fixedGeometry,state)<=1),geometryStates.map(state=>({action:state.action,toolbar:state.toolbar,line:state.nativeLine})));
    check(`${label}: completion retains answer and stale marker`,await panel.locator('.answer').innerText().then(text=>text.includes('Finding supported'))&&await panel.locator('.stale').isVisible());
    const links=await panel.locator('a').evaluateAll(nodes=>nodes.map(node=>({href:node.href,target:node.target,rel:node.rel})));
    check(`${label}: evidence links use safe external navigation`,links.some(link=>link.href===source.url)&&links.filter(link=>link.href.startsWith('https://')).every(link=>link.target==='_blank'&&link.rel.includes('noopener')),links);
    check(`${label}: no reading-mode control`,!(await panel.getByRole('button').allTextContents()).some(text=>/reading|enlarge|放大/i.test(text)));
    check(`${label}: reply context is not repeated in the visible interface`,await panel.locator('.context:not(.text-only)').count()===0&&!(await panel.innerText()).includes('Reply context included'));
    const header=await panel.evaluate(node=>{const root=node.shadowRoot,status=root.querySelector('.state'),header=root.querySelector('.header'),heading=root.querySelector('.heading'),retry=root.querySelector('.retry'),rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};};return {title:root.querySelector('.title').textContent,status:status.textContent,hover:status.title,tabindex:status.getAttribute('tabindex'),spinnerHidden:root.querySelector('.spinner').hidden,removedBlocks:root.querySelectorAll('.status,.collapse,.details,.brand').length,retryInsideHeader:header.contains(retry),header:rect(header),heading:rect(heading),retry:rect(retry)};});
    check(`${label}: compact header shows SuperX and completion tokens without old blocks`,header.title==='SuperX'&&header.status.includes('125')&&header.spinnerHidden&&header.removedBlocks===0&&header.retryInsideHeader,header);
    check(`${label}: token hover exposes model and all token counts`,header.hover.includes('grok-4.3')&&header.hover.includes('100')&&header.hover.includes('25')&&header.hover.includes('125')&&header.tabindex==='0',header);
    check(`${label}: header state and retry share one row`,Math.abs(header.heading.y-header.retry.y)<12&&header.heading.right<=header.retry.x+1,header);
    check(`${label}: no draft browser-storage writes`,await page.evaluate(()=>localStorage.length===0&&sessionStorage.length===0));
    if(width===1280||width===390){const filename=`${scene}-${scheme}-${width}.png`;await page.screenshot({path:path.join(output,filename),fullPage:true});report.screenshots.push(filename);}
    // Exercise the publish handler only in these disposable local fixtures.
    await page.locator('.publish').click();check(`${label}: native publish control still works`,await page.evaluate(()=>qa.nativePublishes===1));
    await context.close();
  }
  const boundaryCases=['new-inline','new-modal','reply-modal','reply-inline'].flatMap(scene=>['border','none'].map(boundary=>({scene,boundary,width:390,locale:'en'})));
  boundaryCases.push(...[1280,360].flatMap(width=>[false,true].map(rtl=>({scene:'new-inline',boundary:'narrow-border',width,locale:'en',rtl}))));
  const localizedCases=['zh-CN','de','fr','ja'].flatMap(locale=>[390,315].map(width=>({scene:'new-inline',boundary:'separator',width,locale})));
  for(const {scene,boundary,width,locale,rtl=false} of [...boundaryCases,...localizedCases]){
    const label=`boundary-and-width/${scene}/${boundary}/${locale}/${width}${rtl?'/rtl':''}`,extraContext=await browser.newContext({viewport:{width,height:1000},colorScheme:'dark'});
    await extraContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    const extraPage=await extraContext.newPage();extraPage.on('pageerror',error=>report.pageErrors.push({label,message:error.message}));
    await start(extraPage,scene,'dark',width,locale,boundary);
    if(rtl){await extraPage.evaluate(()=>{document.querySelector('.native-avatar-layout').dir='rtl';qa.manager.refresh();});await settle(extraPage);}
    await extraPage.locator('[contenteditable]').fill('A short draft for fixed width.');await settle(extraPage);
    const initial=await geometrySnapshot(extraPage),action=extraPage.locator('superx-draft-action').getByRole('button'),states=[];
    await action.click();await settle(extraPage);
    const requestId=await extraPage.evaluate(()=>qa.sent.find(message=>message.type==='ANALYZE_DRAFT').requestId);
    await emit(extraPage,{type:'START',requestId});await emit(extraPage,{type:'RESULT',requestId,result:{text:'A compact local answer.',model:'grok-4.3',usage:{input_tokens:20,output_tokens:10,total_tokens:30}}});await settle(extraPage);
    states.push(await geometrySnapshot(extraPage));
    for(let index=0;index<4;index++){await action.click();await settle(extraPage);states.push(await geometrySnapshot(extraPage));}
    check(`${label}: all labels reserve identical width and leave native controls fixed`,states.every(state=>maxGeometryDrift(initial,state)<=1),{initial,states});
    check(`${label}: changing label never sends another request`,await extraPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1));
    const open=states[0];
    if(boundary==='none')check(`${label}: transparent spacer is ignored and fallback draws one border without extra margin`,!open.nativeBoundary&&open.ownBorder===1&&open.boxMargin==='0px'&&Math.abs(open.panel.y-open.toolbar.bottom)<=1,open);
    else check(`${label}: native separator or bottom border stays visible at the original coordinates`,open.nativeBoundary&&open.ownBorder===0&&open.lineVisible&&Math.abs(open.nativeLine.y-initial.nativeLine.y)<=1&&open.lineColor===initial.lineColor,open);
    if(boundary!=='none')check(`${label}: inset visible line and full native cover align in both coordinate systems`,insetLineMatches(open,initial),open);
    if(boundary==='narrow-border')check(`${label}: sibling answer matches narrow avatar-column boundary width and physical left offset`,Math.abs(open.panel.x-open.nativeLine.x)<=1&&Math.abs(open.panel.width-open.nativeLine.width)<=1&&Math.abs(open.content.x-open.toolbar.x)<=1&&Math.abs(open.content.right-open.toolbar.right)<=1,open);
    const measurement=await action.evaluate(button=>{const root=button.getRootNode(),mark=root.querySelector('.mark'),r=button.getBoundingClientRect(),m=mark.getBoundingClientRect();return {scrollWidth:button.scrollWidth,clientWidth:button.clientWidth,labelCount:root.querySelectorAll('.labels,.measure').length,text:button.innerText.trim(),mask:getComputedStyle(mark).maskImage,aria:button.getAttribute('aria-label'),title:button.title,width:r.width,height:r.height,markWidth:m.width,markHeight:m.height,overflow:document.documentElement.scrollWidth>innerWidth+1};});
    check(`${label}: localized accessible action shows only larger circular SuperX logo`,measurement.labelCount===0&&measurement.text===''&&measurement.mask.includes('superx-symbol.svg')&&Math.abs(measurement.width-measurement.height)<1&&measurement.markWidth>20&&measurement.markHeight>20&&measurement.markWidth<measurement.width&&measurement.markHeight<measurement.height&&Boolean(measurement.aria)&&measurement.aria===measurement.title&&!measurement.overflow,measurement);
    if(width===315)check(`${label}: compact circle keeps native button height`,Math.abs(measurement.width-measurement.height)<1&&measurement.width>=30&&measurement.width<=42,measurement);
    if(locale==='de'&&width===390){await extraPage.screenshot({path:path.join(output,'fixed-width-de-390.png'),fullPage:true});report.screenshots.push('fixed-width-de-390.png');}
    await extraContext.close();
  }
  for(const mode of ['grid-parent','table-parent','contents-parent','absolute-composer','fixed-composer','absolute-edge','fixed-edge','flow-root-parent','flex-column-parent']){
    const guardContext=await browser.newContext({viewport:{width:1100,height:1000},colorScheme:'dark'});
    await guardContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    const guardPage=await guardContext.newPage();guardPage.on('pageerror',error=>report.pageErrors.push({label:'boundary-guard/'+mode,message:error.message}));
    await start(guardPage,'new-inline','dark',1100,'en',mode.endsWith('-edge')?'separator':'border');
    await guardPage.evaluate(mode=>{
      const main=document.querySelector('main'),composer=document.querySelector('.composer'),edge=document.querySelector('.native-separator');
      if(mode==='grid-parent')main.style.display='grid';
      if(mode==='table-parent')main.style.display='table';
      if(mode==='contents-parent')main.style.display='contents';
      if(mode==='flow-root-parent')main.style.display='flow-root';
      if(mode==='flex-column-parent'){main.style.display='flex';main.style.flexDirection='column';}
      if(mode.endsWith('-composer')){composer.style.position=mode.startsWith('absolute')?'absolute':'fixed';composer.style.left='100px';composer.style.top='70px';composer.style.width='550px';}
      if(mode.endsWith('-edge')){const r=edge.getBoundingClientRect();edge.style.position=mode.startsWith('absolute')?'absolute':'fixed';edge.style.left=r.left+'px';edge.style.top=r.top+'px';edge.style.width=r.width+'px';}
      qa.manager.scan();
    },mode);await settle(guardPage);
    const shouldAccept=mode==='flow-root-parent'||mode==='flex-column-parent';
    check(`boundary guard: ${mode} ${shouldAccept?'accepts supported':'rejects unsafe'} placement`,await guardPage.locator('superx-draft-panel').evaluate((panel,expected)=>panel.hasAttribute('data-native-boundary')===expected,shouldAccept));
    await guardContext.close();
  }
  for(const width of [1280,390]){
    const label=`native-row-expansion/${width}`,nativeContext=await browser.newContext({viewport:{width,height:1000},colorScheme:'dark'});
    await nativeContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    const nativePage=await nativeContext.newPage();nativePage.on('pageerror',error=>report.pageErrors.push({label,message:error.message}));
    await start(nativePage,'reply-collapsed','dark',width);
    const nativeEditor=nativePage.locator('[contenteditable]'),nativeAction=nativePage.locator('superx-draft-action').getByRole('button').first();
    await nativePage.evaluate(draftText=>{qa.originalAction=document.querySelector('superx-draft-action');qa.originalPublish=document.querySelector('.publish');const editor=document.querySelector('[contenteditable]');editor.textContent=draftText;editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:draftText}));},t);await settle(nativePage);
    const nativeGeometry=()=>nativePage.evaluate(()=>{
      const editor=document.querySelector('[contenteditable]'),publish=document.querySelector('.publish'),action=document.querySelector('superx-draft-action'),panel=document.querySelector('superx-draft-panel'),rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
      let common,depth=0;for(let group=editor.parentElement;group;group=group.parentElement,depth++)if(group.querySelector('.publish')){common=group;break;}
      return {editor:rect(editor),publish:rect(publish),action:rect(action),panel:rect(panel),common:rect(common),depth,direction:getComputedStyle(common).flexDirection,actionCount:document.querySelectorAll('superx-draft-action').length,panelCount:document.querySelectorAll('superx-draft-panel').length,sameAction:action===qa.originalAction,samePublish:publish===qa.originalPublish,overflow:document.documentElement.scrollWidth>innerWidth+1,before:qa.nativeBeforeInjection,panelOutsideNativeRow:!document.querySelector('.native-collapsed-row')?.contains(panel)};
    });
    const collapsed=await nativeGeometry();
    check(`${label}: collapsed native reply discovers row common ancestor at depth 14`,collapsed.depth===14&&collapsed.direction==='row',collapsed);
    await nativeAction.click();await settle(nativePage);
    const nativeRequest=await nativePage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').at(-1));
    await emit(nativePage,{type:'START',requestId:nativeRequest.requestId});await emit(nativePage,{type:'UPDATE',requestId:nativeRequest.requestId,text:'The existing draft stream survives native reply expansion.'});await settle(nativePage);
    const runningCollapsed=await nativeGeometry();
    check(`${label}: collapsed answer sits after full native row`,runningCollapsed.panelOutsideNativeRow&&runningCollapsed.panel.y>=runningCollapsed.common.bottom-1&&runningCollapsed.panel.width>200,runningCollapsed);
    check(`${label}: collapsed native editor and submit remain usable`,runningCollapsed.editor.width>=Math.min(160,collapsed.before.editor.width-110)&&Math.abs(runningCollapsed.publish.width-collapsed.before.publish.width)<1&&Math.abs(runningCollapsed.publish.height-collapsed.before.publish.height)<1&&!runningCollapsed.overflow,runningCollapsed);
    check(`${label}: collapsed action is horizontal beside wrapped native submit`,runningCollapsed.action.right<=runningCollapsed.publish.x+1&&Math.abs(runningCollapsed.action.y+runningCollapsed.action.height/2-runningCollapsed.publish.y-runningCollapsed.publish.height/2)<2,runningCollapsed);
    await nativeEditor.click();await settle(nativePage);
    const expanded=await nativeGeometry();
    check(`${label}: native focus moves submit and deep editor into column`,await nativePage.evaluate(()=>qa.nativeExpanded)&&expanded.depth===19&&expanded.direction==='column'&&expanded.samePublish,expanded);
    check(`${label}: DOM move retains unique original draft action and panel`,expanded.sameAction&&expanded.actionCount===1&&expanded.panelCount===1,expanded);
    check(`${label}: expanded result follows whole native toolbar`,await nativePage.locator('superx-draft-panel').evaluate(panel=>panel.getBoundingClientRect().y>=document.querySelector('[data-testid="toolBar"]').getBoundingClientRect().bottom-1),expanded);
    check(`${label}: expansion does not squeeze textarea or submit`,expanded.editor.width>=collapsed.before.editor.width-1&&Math.abs(expanded.publish.width-collapsed.before.publish.width)<1&&Math.abs(expanded.publish.height-collapsed.before.publish.height)<1&&expanded.action.right<=expanded.publish.x+1&&!expanded.overflow,expanded);
    check(`${label}: native layout migration preserves draft and in-flight result`,await nativeEditor.innerText()===t&&(await nativePage.locator('superx-draft-panel .answer').innerText()).includes('survives native reply expansion')&&await nativePage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1));
    await emit(nativePage,{type:'RESULT',requestId:nativeRequest.requestId,result:{text:'The same request completed after the native reply expanded.'}});await settle(nativePage);
    await nativeAction.click();await settle(nativePage);
    check(`${label}: reopening completed native-migrated answer does not rerun`,(await nativePage.locator('superx-draft-panel .answer').innerText()).includes('same request completed')&&await nativePage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1));
    const filename=`native-reply-expanded-${width}.png`;await nativePage.screenshot({path:path.join(output,filename),fullPage:true});report.screenshots.push(filename);
    await nativeContext.close();
  }
  const compactContext=await browser.newContext({viewport:{width:1100,height:900}});
  await compactContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const compactPage=await compactContext.newPage();compactPage.on('pageerror',error=>report.pageErrors.push({label:'compact-controls',message:error.message}));
  await start(compactPage,'new-inline','dark',1100);
  await compactPage.locator('[contenteditable]').fill(t);await settle(compactPage);
  await compactPage.locator('superx-draft-action').getByRole('button').click();
  const compactRequest=await compactPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').at(-1));
  await emit(compactPage,{type:'START',requestId:compactRequest.requestId});await emit(compactPage,{type:'UPDATE',requestId:compactRequest.requestId,text:'The original task continues while the editor is temporarily empty.'});
  await compactPage.locator('[contenteditable]').fill('');await settle(compactPage);
  check('compact controls: clearing text disables visible action and hides panel without cancelling active work',await compactPage.locator('superx-draft-action').isVisible()&&await compactPage.locator('superx-draft-action').getByRole('button').isDisabled()&&await compactPage.locator('superx-draft-panel').isHidden()&&await compactPage.evaluate(()=>qa.manager.activeCount===1&&qa.sent.every(message=>message.type!=='CANCEL')));
  await emit(compactPage,{type:'UPDATE',requestId:compactRequest.requestId,text:'Hidden-editor task kept generating normally.'});
  await compactPage.locator('[contenteditable]').fill(t);await settle(compactPage);
  check('compact controls: restoring draft reveals Show without reopening or re-requesting',await compactPage.locator('superx-draft-action').isVisible()&&await compactPage.locator('superx-draft-action').getByRole('button').getAttribute('aria-label').then(label=>label==='Show')&&await compactPage.locator('superx-draft-panel').isHidden()&&await compactPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1));
  await compactPage.locator('superx-draft-action').getByRole('button').click();await settle(compactPage);
  check('compact controls: Show restores current running answer without a new call',(await compactPage.locator('superx-draft-panel .answer').innerText()).includes('kept generating')&&await compactPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1));
  await compactPage.evaluate(()=>{qa.originalCompactAction=document.querySelector('superx-draft-action');document.querySelector('.counter-branch').hidden=true;});await settle(compactPage);
  check('compact controls: hidden counter leaves action directly before native publish wrapper',await compactPage.evaluate(()=>{const action=document.querySelector('superx-draft-action');return action===qa.originalCompactAction&&action.nextElementSibling===document.querySelector('.publish-column');}));
  await compactPage.evaluate(()=>{const counter=document.querySelector('.counter-branch');counter.hidden=false;const wrapper=document.createElement('div');wrapper.className='replacement-counter-wrapper';wrapper.style.cssText='display:flex;flex-direction:column';counter.before(wrapper);wrapper.append(counter);counter.querySelector('svg').removeAttribute('data-testid');});await settle(compactPage);
  check('compact controls: dynamically wrapped role-progressbar does not displace action from publish',await compactPage.evaluate(()=>{const action=document.querySelector('superx-draft-action'),counter=document.querySelector('.replacement-counter-wrapper');return action===qa.originalCompactAction&&action.nextElementSibling===document.querySelector('.publish-column')&&action.getBoundingClientRect().x>=counter.getBoundingClientRect().right-1&&document.querySelectorAll('superx-draft-action').length===1;}));
  check('compact controls: counter relocation keeps native separator and add-post control intact',await compactPage.locator('.compose-divider').isVisible()&&await compactPage.locator('.add-post').isVisible()&&await compactPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1));
  await emit(compactPage,{type:'RESULT',requestId:compactRequest.requestId,result:{text:answer,model:'grok-4.3',usage:{input_tokens:111,output_tokens:39,total_tokens:150}}});await settle(compactPage);
  await compactPage.locator('superx-draft-panel .state').hover();
  check('compact controls: completion metadata is available on hover without a details block',(await compactPage.locator('superx-draft-panel .state').getAttribute('title')).includes('grok-4.3')&&await compactPage.locator('superx-draft-panel .details').count()===0);
  await compactPage.locator('superx-draft-panel .retry').click();await settle(compactPage);
  check('compact controls: only header Retry starts a second deliberate request',await compactPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===2)&&await compactPage.locator('superx-draft-panel .spinner').isVisible());
  await compactPage.screenshot({path:path.join(output,'compact-control-dynamic-counter.png'),fullPage:true});report.screenshots.push('compact-control-dynamic-counter.png');
  await compactContext.close();
  const context=await browser.newContext({viewport:{width:1100,height:900}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push({label:'lifecycle',message:error.message}));
  await start(page,'new-inline','dark',1100);
  const editor=page.locator('[data-testid="tweetTextarea_0"]'),action=page.locator('superx-draft-action').getByRole('button').first();
  await editor.fill(t);await action.click();let sent=await page.evaluate(()=>qa.sent.filter(item=>item.type==='ANALYZE_DRAFT'));let id=sent.at(-1).requestId;
  await emit(page,{type:'START',requestId:id});await emit(page,{type:'UPDATE',requestId:id,text:'Partial before background.'});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await emit(page,{type:'UPDATE',requestId:id,text:'Partial continued in background.'});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  check('lifecycle: hidden-tab continuation keeps existing request',await page.locator('superx-draft-panel .answer').innerText().then(text=>text.includes('continued in background'))&&await page.evaluate(()=>qa.sent.filter(item=>item.type==='ANALYZE_DRAFT').length===1));
  const longText=Array.from({length:35},(_,index)=>`Evidence paragraph ${index+1}. Local primary-source detail and a relevant qualification.`).join('\n\n');
  await emit(page,{type:'RESULT',requestId:id,result:{text:longText,sources:[source]}});await settle(page);
  const more=page.locator('superx-draft-panel .more');
  check('lifecycle: long answer offers in-place expansion',await more.isVisible());
  const beforeHeight=await page.locator('superx-draft-panel').evaluate(node=>node.getBoundingClientRect().height),beforeExpandLayout=await page.evaluate(()=>qa.layoutCalls||0);await more.click();await settle(page);
  check('lifecycle: expansion naturally increases panel height',await page.locator('superx-draft-panel').evaluate(node=>node.getBoundingClientRect().height)>beforeHeight+100);
  check('lifecycle: full-answer expansion notifies parent layout',await page.evaluate(()=>qa.layoutCalls||0)>beforeExpandLayout);
  await config(page,{identity:'oauth:account-2',settings:await page.evaluate(()=>({...XGrokCore.DEFAULT_SETTINGS,provider:'oauth'}))});await settle(page);
  await emit(page,{type:'RESULT',requestId:id,result:{text:'Late old-account result must not display.'}});
  check('lifecycle: changing account/source rejects late old results',!(await page.locator('superx-draft-panel .answer').innerText()).includes('Late old-account'));
  check('lifecycle: changing account leaves draft intact',await editor.innerText()===t);
  await page.locator('superx-draft-panel .retry').click();sent=await page.evaluate(()=>qa.sent.filter(item=>item.type==='ANALYZE_DRAFT'));id=sent.at(-1).requestId;
  await emit(page,{type:'START',requestId:id});await emit(page,{type:'UPDATE',requestId:id,text:'Partial retained after error.'});await emit(page,{type:'ERROR',requestId:id,code:'API_ERROR'});await settle(page);
  check('lifecycle: failure preserves genuine partial output',(await page.locator('superx-draft-panel .answer').innerText()).includes('Partial retained'));
  check('lifecycle: failure offers explicit retry',await page.locator('superx-draft-panel .retry').isVisible());
  const beforeReconnect=sent.length;await page.evaluate(()=>qa.manager.connectionLost());await config(page,{connected:true});await settle(page);
  check('lifecycle: reconnect does not replay paid task',await page.evaluate(()=>qa.sent.filter(item=>item.type==='ANALYZE_DRAFT').length)===beforeReconnect);
  await page.evaluate(()=>{const old=document.querySelector('[data-testid="tweetTextarea_0"]');const replacement=old.cloneNode(true);old.replaceWith(replacement);qa.manager.scan();});await settle(page);
  check('lifecycle: editor replacement creates no duplicate action',await page.locator('superx-draft-action').count()===1);
  check('lifecycle: editor replacement preserves draft text',await page.locator('[data-testid="tweetTextarea_0"]').innerText()===t);
  await page.evaluate(()=>qa.manager.destroy());await settle(page);
  check('lifecycle: destroy cleans injected controls',await page.locator('superx-draft-action,superx-draft-panel').count()===0);
  await context.close();
  const multi=await browser.newContext({viewport:{width:1100,height:1000}});
  await multi.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const multiPage=await multi.newPage();multiPage.on('pageerror',error=>report.pageErrors.push({label:'multi-editor',message:error.message}));
  await start(multiPage,'new-inline','dark',1100);
  await multiPage.locator('main').evaluate((node,markup)=>node.insertAdjacentHTML('beforeend',markup),composer('post-secondary'));
  await multiPage.evaluate(()=>qa.manager.scan());await settle(multiPage);
  check('multi-editor: each composer has one independent action',await multiPage.locator('superx-draft-action').count()===2);
  await multiPage.locator('#post-inline [contenteditable]').fill(t);
  await multiPage.locator('#post-secondary [contenteditable]').fill('A second independent local draft.');
  await settle(multiPage);
  await multiPage.locator('#post-inline superx-draft-action').getByRole('button').click();
  await multiPage.locator('#post-secondary superx-draft-action').getByRole('button').click();
  const multiRequests=await multiPage.evaluate(()=>qa.sent.filter(item=>item.type==='ANALYZE_DRAFT'));
  check('multi-editor: distinct requests keep drafts separated',multiRequests.length===2&&multiRequests[0].requestId!==multiRequests[1].requestId&&multiRequests[0].draft.id!==multiRequests[1].draft.id&&multiRequests[0].draft.text===t&&multiRequests[1].draft.text==='A second independent local draft.');
  await emit(multiPage,{type:'START',requestId:multiRequests[0].requestId});await emit(multiPage,{type:'START',requestId:multiRequests[1].requestId});
  await emit(multiPage,{type:'UPDATE',requestId:multiRequests[0].requestId,text:'First composer answer.'});await emit(multiPage,{type:'UPDATE',requestId:multiRequests[1].requestId,text:'Second composer answer.'});
  check('multi-editor: response routing cannot cross composers',(await (await panelFor(multiPage,'#post-inline')).locator('.answer').innerText()).includes('First composer')&&!(await (await panelFor(multiPage,'#post-inline')).locator('.answer').innerText()).includes('Second composer')&&(await (await panelFor(multiPage,'#post-secondary')).locator('.answer').innerText()).includes('Second composer'));
  await multiPage.evaluate(()=>{qa.detached=document.querySelector('#post-inline');qa.detached.remove();});await settle(multiPage);
  await emit(multiPage,{type:'RESULT',requestId:multiRequests[0].requestId,result:{text:'First composer completed while detached.',sources:[source]}});
  await multiPage.evaluate(()=>{document.querySelector('main').prepend(qa.detached);qa.manager.scan();});await settle(multiPage);
  check('multi-editor: temporary removal restores completed task without another request',(await (await panelFor(multiPage,'#post-inline')).locator('.answer').innerText()).includes('completed while detached')&&await multiPage.evaluate(()=>qa.sent.filter(item=>item.type==='ANALYZE_DRAFT').length===2));
  await multiPage.screenshot({path:path.join(output,'multi-editor-routing.png'),fullPage:true});report.screenshots.push('multi-editor-routing.png');
  await multi.close();
  const aliasContext=await browser.newContext({viewport:{width:1100,height:1000}});
  await aliasContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const aliasPage=await aliasContext.newPage();aliasPage.on('pageerror',error=>report.pageErrors.push({label:'reattachment-alias',message:error.message}));
  await start(aliasPage,'new-inline','dark',1100);
  await aliasPage.locator('#post-inline [contenteditable]').fill(t);await settle(aliasPage);
  await aliasPage.locator('#post-inline superx-draft-action').getByRole('button').click();
  let aliasRequests=await aliasPage.evaluate(()=>qa.sent.filter(item=>item.type==='ANALYZE_DRAFT'));
  const beforeResetId=aliasRequests.at(-1).requestId;
  await emit(aliasPage,{type:'START',requestId:beforeResetId});await emit(aliasPage,{type:'UPDATE',requestId:beforeResetId,text:'Answer before reset must be forgotten.'});
  await aliasPage.evaluate(()=>{qa.originalEditor=document.querySelector('#post-inline [contenteditable]');qa.manager.reset();qa.manager.scan();});await settle(aliasPage);
  check('reset: same live editor DOM cannot recover a discarded answer',await aliasPage.evaluate(()=>qa.originalEditor===document.querySelector('#post-inline [contenteditable]')&&[...document.querySelectorAll('superx-draft-panel')].every(panel=>!panel.shadowRoot.querySelector('.answer').textContent.includes('before reset'))));
  await emit(aliasPage,{type:'RESULT',requestId:beforeResetId,result:{text:'Late reset task must stay ignored.'}});await settle(aliasPage);
  check('reset: late original request cannot resurrect after reset',await aliasPage.evaluate(()=>[...document.querySelectorAll('superx-draft-panel')].every(panel=>!panel.shadowRoot.querySelector('.answer').textContent.includes('Late reset'))));
  await aliasPage.locator('#post-inline superx-draft-action').getByRole('button').click();
  aliasRequests=await aliasPage.evaluate(()=>qa.sent.filter(item=>item.type==='ANALYZE_DRAFT'));
  const sharedBeforeId=aliasRequests.at(-1).requestId;
  await emit(aliasPage,{type:'START',requestId:sharedBeforeId});await emit(aliasPage,{type:'UPDATE',requestId:sharedBeforeId,text:'Running task migrated uniquely to B.'});
  await aliasPage.evaluate(()=>{qa.savedA=document.querySelector('#post-inline');qa.savedA.remove();});await settle(aliasPage);
  await aliasPage.locator('main').evaluate((node,{markup,draftText})=>{const holder=document.createElement('div');holder.innerHTML=markup;holder.querySelector('[contenteditable]').textContent=draftText;node.prepend(holder.firstElementChild);},{markup:composer('post-replacement'),draftText:t});
  await aliasPage.evaluate(()=>qa.manager.scan());await settle(aliasPage);
  check('reattachment: replacement B restores the exact running snapshot without another call',(await (await panelFor(aliasPage,'#post-replacement')).locator('.answer').innerText()).includes('migrated uniquely')&&await aliasPage.evaluate(()=>qa.sent.filter(item=>item.type==='ANALYZE_DRAFT').length)===2);
  await aliasPage.evaluate(()=>{document.querySelector('main').append(qa.savedA);qa.manager.scan();});await settle(aliasPage);
  check('reattachment: original A returning cannot steal B panel',await (await panelFor(aliasPage,'#post-replacement')).count()===1&&(await (await panelFor(aliasPage,'#post-replacement')).locator('.answer').innerText()).includes('migrated uniquely')&&await aliasPage.locator('superx-draft-action').count()===2);
  check('reattachment: A and B have distinct panels',await aliasPage.locator('superx-draft-panel').count()===2&&await (await panelFor(aliasPage,'#post-inline')).count()===1);
  await aliasPage.locator('#post-inline superx-draft-action').getByRole('button').click();
  aliasRequests=await aliasPage.evaluate(()=>qa.sent.filter(item=>item.type==='ANALYZE_DRAFT'));
  check('reattachment: A can explicitly start an independent task',aliasRequests.length===3&&aliasRequests.at(-1).draft.id!==aliasRequests[1].draft.id);
  const returnedAId=aliasRequests.at(-1).requestId;
  await emit(aliasPage,{type:'START',requestId:returnedAId});await emit(aliasPage,{type:'UPDATE',requestId:returnedAId,text:'Returned A has its own answer.'});
  await emit(aliasPage,{type:'RESULT',requestId:sharedBeforeId,result:{text:'B completed its migrated task.'}});await settle(aliasPage);
  check('reattachment: late and current responses remain independently routed',(await (await panelFor(aliasPage,'#post-inline')).locator('.answer').innerText()).includes('Returned A')&&(await (await panelFor(aliasPage,'#post-replacement')).locator('.answer').innerText()).includes('B completed'));
  await config(aliasPage,{identity:'api:new-account'});await settle(aliasPage);
  check('reset: account change clears all editor results without erasing drafts',await aliasPage.evaluate(()=>[...document.querySelectorAll('superx-draft-panel')].every(panel=>!panel.shadowRoot.querySelector('.answer').textContent.trim())&&[...document.querySelectorAll('[contenteditable]')].every(editor=>editor.innerText.trim().length>0)));
  await aliasPage.screenshot({path:path.join(output,'editor-replacement-isolation.png'),fullPage:true});report.screenshots.push('editor-replacement-isolation.png');
  await aliasContext.close();
  const remountContext=await browser.newContext({viewport:{width:1100,height:1000}});
  await remountContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const remountPage=await remountContext.newPage();remountPage.on('pageerror',error=>report.pageErrors.push({label:'same-submit-editor-remount',message:error.message}));
  await start(remountPage,'reply-inline','dark',1100);
  await remountPage.locator('[contenteditable]').fill(t);await settle(remountPage);
  await remountPage.locator('superx-draft-action').getByRole('button').evaluate(button=>{button.click();button.dispatchEvent(new MouseEvent('click',{bubbles:true,composed:true}));});await settle(remountPage);
  check('explicit user action: page-script action clicks cannot send a draft',await remountPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===0));
  await remountPage.locator('superx-draft-action').getByRole('button').click();
  const remountRequest=await remountPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').at(-1));
  await emit(remountPage,{type:'START',requestId:remountRequest.requestId});await emit(remountPage,{type:'UPDATE',requestId:remountRequest.requestId,text:'Active answer before editor-only remount.'});
  await remountPage.evaluate(()=>{qa.hostRemovalEditor=document.querySelector('[contenteditable]');qa.hostRemovalAction=document.querySelector('superx-draft-action');qa.hostRemovalPanel=document.querySelector('superx-draft-panel');qa.hostRemovalAction.remove();qa.hostRemovalPanel.remove();});await settle(remountPage);
  check('native host removal: observer automatically reattaches original action and panel',await remountPage.evaluate(()=>qa.hostRemovalAction===document.querySelector('superx-draft-action')&&qa.hostRemovalPanel===document.querySelector('superx-draft-panel')&&document.querySelectorAll('superx-draft-action').length===1&&document.querySelectorAll('superx-draft-panel').length===1));
  check('native host removal: active request, partial and original editor remain intact',await remountPage.evaluate(()=>qa.hostRemovalEditor===document.querySelector('[contenteditable]')&&document.querySelector('superx-draft-panel').shadowRoot.querySelector('.answer').textContent.includes('Active answer before')&&qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1&&qa.manager.activeCount===1));
  await emit(remountPage,{type:'UPDATE',requestId:remountRequest.requestId,text:'Active stream after automatic host reattachment.'});await settle(remountPage);
  check('native host removal: later stream still routes without another request',(await remountPage.locator('superx-draft-panel .answer').innerText()).includes('automatic host reattachment')&&await remountPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1));
  await remountPage.evaluate(()=>{qa.retainedSubmit=document.querySelector('.publish');qa.retainedAction=document.querySelector('superx-draft-action');qa.retainedPanel=document.querySelector('superx-draft-panel');const old=document.querySelector('[contenteditable]');old.replaceWith(old.cloneNode(true));qa.manager.scan();});await settle(remountPage);
  check('same-submit remount: active exact snapshot retains original action, panel and publish',await remountPage.evaluate(()=>qa.retainedSubmit===document.querySelector('.publish')&&qa.retainedAction===document.querySelector('superx-draft-action')&&qa.retainedPanel===document.querySelector('superx-draft-panel')&&document.querySelectorAll('superx-draft-action').length===1&&document.querySelectorAll('superx-draft-panel').length===1));
  await emit(remountPage,{type:'UPDATE',requestId:remountRequest.requestId,text:'Active stream continued after editor-only remount.'});await settle(remountPage);
  check('same-submit remount: active update continues in reattached panel',(await remountPage.locator('superx-draft-panel .answer').innerText()).includes('continued after editor-only'));
  await remountPage.locator('superx-draft-action').getByRole('button').click();await settle(remountPage);
  check('same-submit remount: clicking remounted active editor does not restart request',await remountPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1));
  await emit(remountPage,{type:'RESULT',requestId:remountRequest.requestId,result:{text:'Completed answer survives the same-submit editor remount.',sources:[source]}});await settle(remountPage);
  check('same-submit remount: original active request can still complete',(await remountPage.locator('superx-draft-panel .answer').innerText()).includes('Completed answer survives'));
  await remountPage.evaluate(()=>{const old=document.querySelector('[contenteditable]');old.replaceWith(old.cloneNode(true));qa.manager.scan();});await settle(remountPage);
  check('same-submit remount: completed exact snapshot retains original answer and native controls',await remountPage.evaluate(()=>qa.retainedSubmit===document.querySelector('.publish')&&qa.retainedPanel===document.querySelector('superx-draft-panel')&&document.querySelector('superx-draft-panel').shadowRoot.querySelector('.answer').textContent.includes('Completed answer survives')&&document.querySelector('[contenteditable]').textContent.trim().length>0));
  await remountPage.locator('superx-draft-action').getByRole('button').click();await settle(remountPage);
  check('same-submit remount: completed exact snapshot click reuses result without request',await remountPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1));
  const changedRemountText='A different draft asks about the types of moonquakes rather than their duration.';
  await remountPage.evaluate(changedText=>{const old=document.querySelector('[contenteditable]'),fresh=old.cloneNode(false);fresh.textContent=changedText;old.replaceWith(fresh);qa.manager.scan();},changedRemountText);await settle(remountPage);
  check('same-submit remount: changed draft cannot inherit old completed panel',await remountPage.evaluate(()=>qa.retainedSubmit===document.querySelector('.publish')&&qa.retainedPanel!==document.querySelector('superx-draft-panel')&&!document.querySelector('superx-draft-panel').shadowRoot.querySelector('.answer').textContent.trim()&&qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1&&document.querySelectorAll('superx-draft-action').length===1));
  await emit(remountPage,{type:'UPDATE',requestId:remountRequest.requestId,text:'Late old-draft text must not leak into changed editor.'});await settle(remountPage);
  check('same-submit remount: changed draft ignores late previous snapshot updates',await remountPage.evaluate(()=>!document.querySelector('superx-draft-panel').shadowRoot.querySelector('.answer').textContent.includes('Late old-draft')));
  await remountPage.locator('superx-draft-action').getByRole('button').click();await settle(remountPage);
  const changedRemountRequest=await remountPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').at(-1));
  check('same-submit remount: changed snapshot starts one independent explicit request',changedRemountRequest.requestId!==remountRequest.requestId&&changedRemountRequest.draft.id!==remountRequest.draft.id&&changedRemountRequest.draft.text===changedRemountText&&changedRemountRequest.draft.context?.url===remountRequest.draft.context?.url&&await remountPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===2));
  await emit(remountPage,{type:'START',requestId:changedRemountRequest.requestId});await emit(remountPage,{type:'RESULT',requestId:changedRemountRequest.requestId,result:{text:'Independent changed-draft result.'}});await settle(remountPage);
  check('same-submit remount: independent result renders without old-draft content',(await remountPage.locator('superx-draft-panel .answer').innerText())==='Independent changed-draft result.');
  await config(remountPage,{ready:false,needsProvider:'build.unknown'});await settle(remountPage);
  check('temporary provider unavailability: completed answer survives ready falling',(await remountPage.locator('superx-draft-panel .answer').innerText())==='Independent changed-draft result.');
  await config(remountPage,{ready:true});await settle(remountPage);
  if(await remountPage.locator('superx-draft-panel').isHidden())await remountPage.locator('superx-draft-action').getByRole('button').click();
  await settle(remountPage);
  check('temporary provider unavailability: recovery reopens completed answer without replay',(await remountPage.locator('superx-draft-panel .answer').innerText())==='Independent changed-draft result.'&&await remountPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===2));
  await remountPage.locator('superx-draft-panel .retry').evaluate(button=>{button.click();button.dispatchEvent(new MouseEvent('click',{bubbles:true,composed:true}));});await settle(remountPage);
  check('explicit user action: page-script retry clicks cannot send a draft',await remountPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===2));
  await remountPage.locator('superx-draft-panel .retry').click();await settle(remountPage);
  const interruptedRequest=await remountPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').at(-1));
  await emit(remountPage,{type:'START',requestId:interruptedRequest.requestId});await emit(remountPage,{type:'UPDATE',requestId:interruptedRequest.requestId,text:'Genuine partial retained while the provider is unavailable.'});
  await config(remountPage,{ready:false});await settle(remountPage);
  check('temporary provider unavailability: active task cancels while preserving partial',await remountPage.evaluate(requestId=>qa.sent.some(message=>message.type==='CANCEL'&&message.requestId===requestId)&&qa.manager.activeCount===0,interruptedRequest.requestId)&&(await remountPage.locator('superx-draft-panel .answer').innerText()).includes('Genuine partial retained'));
  await emit(remountPage,{type:'RESULT',requestId:interruptedRequest.requestId,result:{text:'Late unavailable-provider result must stay ignored.'}});await config(remountPage,{ready:true});await settle(remountPage);
  check('temporary provider unavailability: recovery ignores late result and does not replay',(await remountPage.locator('superx-draft-panel .answer').innerText()).includes('Genuine partial retained')&&await remountPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===3));
  await remountPage.locator('superx-draft-panel .retry').click();await settle(remountPage);
  const recoveredRequest=await remountPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').at(-1));
  check('temporary provider unavailability: only explicit retry starts a fresh task',recoveredRequest.requestId!==interruptedRequest.requestId&&await remountPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===4));
  await emit(remountPage,{type:'START',requestId:recoveredRequest.requestId});await emit(remountPage,{type:'RESULT',requestId:recoveredRequest.requestId,result:{text:'Independent changed-draft result.'}});await settle(remountPage);
  await remountPage.screenshot({path:path.join(output,'same-submit-editor-remount.png'),fullPage:true});report.screenshots.push('same-submit-editor-remount.png');
  await remountContext.close();
  }
  if(focus==='full'||focus==='thread'){
  const threadContext=await browser.newContext({viewport:{width:1100,height:1100}});
  await threadContext.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base||['data:','blob:'].includes(url.protocol))return route.continue();report.externalRequests.push({label:'draft-thread',url:route.request().url()});return route.abort();});
  const threadPage=await threadContext.newPage();threadPage.on('pageerror',error=>report.pageErrors.push({label:'draft-thread',message:error.message}));
  const installThread=page=>page.evaluate(({prefix,parent,after})=>{
    history.replaceState({},'','/ThreadAuthor/status/102');
    document.querySelector('main article').outerHTML=prefix+parent;
    document.querySelector('main .following').outerHTML=after;
  },{prefix:threadRoot+threadMiddle,parent:threadParent,after:threadArticle(103,'An unrelated reply below the editor must not enter its context.')});
  await start(threadPage,'reply-inline','dark',1100,'en','separator',installThread);
  await threadPage.locator('[contenteditable]').fill('The incident in the original post did not happen.');await settle(threadPage);
  await threadPage.locator('superx-draft-action').getByRole('button').click();await settle(threadPage);
  const threadRequest=await threadPage.evaluate(()=>qa.sent.find(message=>message.type==='ANALYZE_DRAFT'));
  check('draft thread: status reply keeps direct parent separate from ordered older ancestors',threadRequest.draft.mode==='reply'&&threadRequest.draft.context?.id==='102'&&JSON.stringify(threadRequest.draft.threadContext?.map(value=>value.id))===JSON.stringify(['100','101']),threadRequest.draft);
  check('draft thread: nested quote and below-editor reply never become ancestors',!(threadRequest.draft.threadContext||[]).some(value=>['900','901','103','102'].includes(value.id)),threadRequest.draft.threadContext);
  check('draft thread: second-level quoted source stays attached to its ancestor',threadRequest.draft.threadContext?.[0]?.quotedContext?.[0]?.quotedContext?.[0]?.id==='901',threadRequest.draft.threadContext?.[0]);
  await emit(threadPage,{type:'START',requestId:threadRequest.requestId});await emit(threadPage,{type:'UPDATE',requestId:threadRequest.requestId,text:'A running check retains the captured thread.'});
  await threadPage.evaluate(()=>{const editor=document.querySelector('[contenteditable]');editor.replaceWith(editor.cloneNode(true));qa.manager.scan();});await settle(threadPage);
  check('draft thread: identical chain and editor remount preserve the running task',(await threadPage.locator('superx-draft-panel .answer').innerText()).includes('captured thread')&&await threadPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1));
  await threadPage.evaluate(()=>{document.querySelector('[data-fixture-post="100"] > [data-testid="tweetText"]').textContent='A different original incident changes the reference.';qa.manager.scan();});await settle(threadPage);
  check('draft thread: changing an ancestor marks a captured answer stale',await threadPage.locator('superx-draft-panel .stale').isVisible());
  await threadPage.evaluate(markup=>{document.querySelector('.composer').remove();document.querySelector('.native-separator').insertAdjacentHTML('beforebegin',markup);document.querySelector('[contenteditable]').textContent='The incident in the original post did not happen.';qa.manager.scan();},composer('reply-replacement'));await settle(threadPage);
  check('draft thread: another chain cannot recover an old detached answer',!(await threadPage.locator('superx-draft-panel .answer').innerText()).includes('captured thread')&&await threadPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1));
  await emit(threadPage,{type:'UPDATE',requestId:threadRequest.requestId,text:'Late old-chain stream.'});await settle(threadPage);
  check('draft thread: old-chain output cannot leak into the replacement composer',!(await threadPage.locator('superx-draft-panel .answer').innerText()).includes('old-chain'));
  await threadPage.locator('superx-draft-action').getByRole('button').click();await settle(threadPage);
  const changedThread=await threadPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').at(-1));
  check('draft thread: next explicit check captures the changed ancestor',changedThread.requestId!==threadRequest.requestId&&changedThread.draft.threadContext?.[0]?.text==='A different original incident changes the reference.');
  await threadPage.screenshot({path:path.join(output,'draft-thread-ancestors.png'),fullPage:true});report.screenshots.push('draft-thread-ancestors.png');
  for(const variant of ['captured-status','different-parent','home-feed','navigated-home','own-dialog-chain']){
    const modalPage=await threadContext.newPage();modalPage.on('pageerror',error=>report.pageErrors.push({label:'draft-thread-'+variant,message:error.message}));
    if(variant==='own-dialog-chain'){
      await start(modalPage,'reply-modal','dark',1100,'en','separator',page=>page.evaluate(({prefix,parent})=>{history.replaceState({},'','/home');document.querySelector('.modal-body article').outerHTML=prefix+parent;},{prefix:threadRoot+threadMiddle,parent:threadParent}));
    }else{
      await start(modalPage,variant==='home-feed'?'new-inline':'reply-inline','dark',1100,'en','separator',variant==='home-feed'?page=>page.evaluate(markup=>{document.querySelector('main .following').outerHTML=markup;},threadRoot+threadMiddle+threadParent):installThread);
      if(variant==='captured-status'){
        await modalPage.evaluate(()=>{document.querySelector('.composer').remove();qa.manager.scan();document.querySelectorAll('main article').forEach(node=>node.remove());});
      }
      await modalPage.evaluate(({markup,navigatedHome})=>{
        if(navigatedHome)history.replaceState({},'','/home');
        document.querySelector('main').setAttribute('aria-hidden','true');
        document.body.insertAdjacentHTML('beforeend','<div role="dialog" aria-modal="true" class="dialog"><div class="modal-body">'+markup+'</div></div>');qa.manager.scan();
      },{markup:(variant==='different-parent'?threadArticle(200,'An unrelated direct reply target.'):threadParent)+composer('reply-inherited',{modal:true}),navigatedHome:variant==='navigated-home'});await settle(modalPage);
    }
    await modalPage.locator('[role="dialog"] [contenteditable]').fill('The incident in the original post did not happen.');await settle(modalPage);
    await modalPage.locator('[role="dialog"] superx-draft-action').getByRole('button').click();await settle(modalPage);
    const request=await modalPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').at(-1)),ids=request.draft.threadContext?.map(value=>value.id)||[];
    const expectsAncestors=variant==='captured-status'||variant==='own-dialog-chain';
    check('draft thread: '+variant+' dialog context obeys ancestry boundaries',JSON.stringify(ids)===JSON.stringify(expectsAncestors?['100','101']:[])&&request.draft.context?.id===(variant==='different-parent'?'200':'102'),request.draft);
    if(variant==='captured-status'){
      await modalPage.evaluate(()=>qa.manager.reset());await settle(modalPage);
      await modalPage.locator('[role="dialog"] superx-draft-action').getByRole('button').click();await settle(modalPage);
      const afterReset=await modalPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').at(-1));
      check('draft thread: reset forgets cached ancestry hidden behind the dialog',(afterReset.draft.threadContext||[]).length===0,afterReset.draft.threadContext);
    }
    await modalPage.close();
  }
  const longThreadPage=await threadContext.newPage();longThreadPage.on('pageerror',error=>report.pageErrors.push({label:'draft-thread-limit',message:error.message}));
  await start(longThreadPage,'reply-inline','dark',1100,'en','separator',page=>page.evaluate(({prefix,parent})=>{history.replaceState({},'','/ThreadAuthor/status/112');document.querySelector('main article').outerHTML=prefix+parent;},{prefix:[100,101,102,103,104,105,106,107,108,109,110].map(id=>threadArticle(id,'Ancestor '+id)).join(''),parent:threadArticle(112,'The direct parent stays separate.')}));
  await longThreadPage.locator('[contenteditable]').fill('Check the original incident.');await settle(longThreadPage);
  await longThreadPage.locator('superx-draft-action').getByRole('button').click();await settle(longThreadPage);
  const limitedThread=await longThreadPage.evaluate(()=>qa.sent.find(message=>message.type==='ANALYZE_DRAFT').draft);
  check('draft thread: DOM collection keeps root plus nearest five ancestors',JSON.stringify(limitedThread.threadContext?.map(value=>value.id))===JSON.stringify(['100','106','107','108','109','110']),limitedThread.threadContext);
  const virtualThreadPage=await threadContext.newPage();virtualThreadPage.on('pageerror',error=>report.pageErrors.push({label:'draft-thread-virtualization',message:error.message}));
  await start(virtualThreadPage,'reply-inline','dark',1100,'en','separator',installThread);
  await virtualThreadPage.locator('[contenteditable]').fill('Check the original incident.');await settle(virtualThreadPage);
  await virtualThreadPage.locator('superx-draft-action').getByRole('button').click();await settle(virtualThreadPage);
  const virtualRequest=await virtualThreadPage.evaluate(()=>qa.sent.find(message=>message.type==='ANALYZE_DRAFT'));
  await emit(virtualThreadPage,{type:'START',requestId:virtualRequest.requestId});await emit(virtualThreadPage,{type:'UPDATE',requestId:virtualRequest.requestId,text:'The running result keeps its captured root.'});
  await virtualThreadPage.evaluate(()=>{qa.virtualRoot=document.querySelector('[data-fixture-post="100"]');qa.virtualRoot.remove();const editor=document.querySelector('[contenteditable]');editor.replaceWith(editor.cloneNode(true));qa.manager.scan();});await settle(virtualThreadPage);
  check('draft thread: virtualized root and remounted editor preserve the same running task',await virtualThreadPage.locator('superx-draft-panel .stale').isHidden()&&(await virtualThreadPage.locator('superx-draft-panel .answer').innerText()).includes('captured root')&&await virtualThreadPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1));
  await emit(virtualThreadPage,{type:'RESULT',requestId:virtualRequest.requestId,result:{text:'The captured thread completed.'}});await settle(virtualThreadPage);
  await virtualThreadPage.locator('superx-draft-panel .retry').click();await settle(virtualThreadPage);
  const virtualRetry=await virtualThreadPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').at(-1));
  check('draft thread: explicit recheck still includes root after it leaves the DOM',virtualRetry.requestId!==virtualRequest.requestId&&JSON.stringify(virtualRetry.draft.threadContext?.map(value=>value.id))===JSON.stringify(['100','101']),virtualRetry.draft);
  await virtualThreadPage.evaluate(()=>{document.querySelector('[data-fixture-post="101"]').before(qa.virtualRoot);qa.manager.scan();});await settle(virtualThreadPage);
  check('draft thread: root returning does not invalidate the current request',await virtualThreadPage.locator('superx-draft-panel .stale').isHidden()&&await virtualThreadPage.evaluate(requestId=>qa.sent.every(message=>message.type!=='CANCEL'||message.requestId!==requestId),virtualRetry.requestId));
  const lateAncestorPage=await threadContext.newPage();lateAncestorPage.on('pageerror',error=>report.pageErrors.push({label:'draft-thread-late-ancestor',message:error.message}));
  await start(lateAncestorPage,'reply-inline','dark',1100,'en','separator',async page=>{await installThread(page);await page.locator('[data-fixture-post="101"]').evaluate(node=>node.remove());});
  await lateAncestorPage.evaluate(markup=>{document.querySelector('[data-fixture-post="100"]').remove();document.querySelector('[data-fixture-post="102"]').insertAdjacentHTML('beforebegin',markup);qa.manager.scan();},threadMiddle);await settle(lateAncestorPage);
  await lateAncestorPage.locator('[contenteditable]').fill('Check the original incident.');await settle(lateAncestorPage);
  await lateAncestorPage.locator('superx-draft-action').getByRole('button').click();await settle(lateAncestorPage);
  const lateAncestorRequest=await lateAncestorPage.evaluate(()=>qa.sent.find(message=>message.type==='ANALYZE_DRAFT').draft);
  check('draft thread: newly hydrated middle ancestor retains a previously captured virtualized root',JSON.stringify(lateAncestorRequest.threadContext?.map(value=>value.id))===JSON.stringify(['100','101'])&&lateAncestorRequest.context?.id==='102',lateAncestorRequest);
  for(const scene of ['new-inline','new-modal']){
    const quotePage=await threadContext.newPage();quotePage.on('pageerror',error=>report.pageErrors.push({label:'draft-post-quote-'+scene,message:error.message}));
    await start(quotePage,scene,'dark',1100,'en','separator',page=>page.locator('.editor-row').evaluate((node,markup)=>node.insertAdjacentHTML('afterend',markup),threadArticle(300,'The user is quoting this source in a new post.')));
    await quotePage.locator('[contenteditable]').fill('A new post checks the quoted claim.');await settle(quotePage);
    await quotePage.locator('superx-draft-action').getByRole('button').click();await settle(quotePage);
    const draft=await quotePage.evaluate(()=>qa.sent.find(message=>message.type==='ANALYZE_DRAFT').draft);
    check('draft post: '+scene+' quotation after editor is not mistaken for a reply',draft.mode==='post'&&!draft.context&&!draft.threadContext&&JSON.stringify(draft.quotedContext?.map(value=>value.id))===JSON.stringify(['300']),draft);
    await quotePage.close();
  }
  await threadContext.close();
  }
  if(focus==='full'||focus==='modalcontext'){
    const modalContext=await browser.newContext({viewport:{width:1100,height:1000}});
    await modalContext.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base||['data:','blob:'].includes(url.protocol))return route.continue();report.externalRequests.push({label:'modal-local-context',url:route.request().url()});return route.abort();});
    const parentBody='The visible parent claims that a local incident happened.',parentTime='2026-10-22T08:00:00.000Z';
    const prepare=async({preview=modalPreview(),background='',scene='reply-modal',path:routePath}={})=>{
      const page=await modalContext.newPage();page.on('pageerror',error=>report.pageErrors.push({label:'modal-local-context',message:error.message}));
      await start(page,scene,'dark',1100,'en','separator',page=>page.evaluate(({preview,background,routePath})=>{
        if(routePath)history.replaceState({},'',routePath);
        const body=document.querySelector('.modal-body'),original=body.querySelector('article');
        if(original)original.remove();if(preview)body.insertAdjacentHTML('afterbegin',preview);
        if(background){const main=document.createElement('main');main.dataset.testid='primaryColumn';main.setAttribute('aria-hidden','true');main.innerHTML=background;document.body.prepend(main);}
      },{preview,background,routePath}));
      return page;
    };
    const sendDraft=async page=>{
      await page.locator('[role="dialog"] [contenteditable]').fill('This incident did not happen as described.');await settle(page);
      await page.locator('[role="dialog"] superx-draft-action').getByRole('button').click();
      await page.waitForFunction(()=>qa.sent.some(message=>message.type==='ANALYZE_DRAFT'));await settle(page);
      return page.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').at(-1));
    };
    const linkless=await prepare(),linklessRequest=await sendDraft(linkless),localParent=linklessRequest.draft.context;
    check('modal local context: profile-only parent remains a reply',linklessRequest.draft.mode==='reply'&&localParent?.text===parentBody,linklessRequest.draft);
    check('modal local context: missing permalink is explicit rather than inferred from current status URL',localParent?.snapshotOnly===true&&localParent.id===null&&localParent.url===null&&localParent.username==='replyauthor'&&localParent.timestamp===parentTime,localParent);
    check('modal local context: ordinary feed extraction still ignores a permalink-free preview',await linkless.evaluate(()=>XGrokCore.extractPost(document.querySelector('.native-context-preview'))===null));
    await linkless.screenshot({path:path.join(output,'modalcontext-linkless-parent.png'),fullPage:true});report.screenshots.push('modalcontext-linkless-parent.png');
    const bodyLink=await prepare({preview:modalPreview({body:'The parent refers to <a href="https://x.com/other/status/999">another report</a>.'})}),bodyLinkRequest=await sendDraft(bodyLink);
    check('modal local context: a status link in the parent body cannot become its permalink',bodyLinkRequest.draft.mode==='reply'&&bodyLinkRequest.draft.context?.snapshotOnly===true&&bodyLinkRequest.draft.context.id===null&&bodyLinkRequest.draft.context.url===null&&bodyLinkRequest.draft.context.text.includes('another report'),bodyLinkRequest.draft.context);
    const parentMedia=await prepare();
    await parentMedia.evaluate(()=>{
      const body=document.querySelector('.modal-body'),parent=body.querySelector('.native-context-preview');
      parent.insertAdjacentHTML('beforeend','<div data-testid="tweetPhoto" style="width:100px;height:50px"><img alt="Parent media only" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%2250%22/%3E"></div>');
      body.append(body.querySelector('.native-toolbar'));
    });await settle(parentMedia);
    const parentMediaRequest=await sendDraft(parentMedia);
    check('modal local context: parent media stays outside draft attachments in a shared toolbar scope',!parentMediaRequest.draft.hasMedia&&await parentMedia.locator('superx-draft-panel .text-only').isHidden(),parentMediaRequest.draft);
    const nested=await prepare({preview:modalPreview({nested:modalPreview({tag:'button',username:'quotedauthor',author:'Quoted Author',body:'Nested source text must not become the direct parent.',id:900})})});
    const nestedRequest=await sendDraft(nested),nestedParent=nestedRequest.draft.context;
    check('modal local context: nested quotation cannot replace a permalink-free direct parent',nestedRequest.draft.mode==='reply'&&nestedParent?.snapshotOnly===true&&nestedParent.id===null&&nestedParent.text===parentBody,nestedRequest.draft);
    check('modal local context: nested source is preserved separately',nestedParent?.quotedContext?.some(post=>post.id==='900'&&post.text==='Nested source text must not become the direct parent.')&&!(nestedRequest.draft.threadContext||[]).some(post=>post.id==='900'),nestedParent);
    const wrapped=await prepare({preview:modalPreview({nested:'<div data-testid="quoteTweet">'+modalPreview({tag:'button',username:'quotedauthor',author:'Quoted Author',body:'A quote inside a transparent native wrapper.',id:900})+'</div>'})});
    const wrappedRequest=await sendDraft(wrapped);
    check('modal local context: transparent quote wrapper retains its button snapshot',wrappedRequest.draft.context?.quotedContext?.some(post=>post.id==='900'&&post.text==='A quote inside a transparent native wrapper.'),wrappedRequest.draft.context);
    const quote=await prepare({preview:'',scene:'new-modal',path:'/compose/post'});
    const quoteMarkup=modalPreview({tag:'button',username:'quotedauthor',author:'Quoted Author',body:'A quote preview without links or quote test IDs.',profileLink:false,nested:'<div data-testid="videoPlayer" style="width:80px;height:40px">Quoted media</div>'});
    await quote.locator('.editor-row').evaluate((node,markup)=>node.insertAdjacentHTML('afterend','<div data-testid="attachments">'+markup+'</div>'),quoteMarkup);await settle(quote);
    const quoteRequest=await sendDraft(quote),localQuote=quoteRequest.draft.quotedContext?.[0];
    check('modal local context: plain button in attachments is a new-post quotation',quoteRequest.draft.mode==='post'&&!quoteRequest.draft.context&&localQuote?.snapshotOnly===true&&localQuote.id===null&&localQuote.url===null&&localQuote.text==='A quote preview without links or quote test IDs.',quoteRequest.draft);
    check('modal local context: plain quote card is not classified as an uploaded attachment',!quoteRequest.draft.hasMedia&&await quote.locator('superx-draft-panel .text-only').isHidden(),quoteRequest.draft);
    await quote.screenshot({path:path.join(output,'modalcontext-button-quote.png'),fullPage:true});report.screenshots.push('modalcontext-button-quote.png');
    const attached=await prepare({preview:'',scene:'new-modal',path:'/compose/post'});
    await attached.locator('.editor-row').evaluate((node,markup)=>node.insertAdjacentHTML('afterend','<div data-testid="attachments">'+markup+'</div>'),quoteMarkup);
    await installImageFixture(attached);await settle(attached);
    const attachedRequest=await sendDraft(attached);
    check('modal local context: a PNG draft attachment outside the quote is captured and included',attachedRequest.draft.hasMedia===true&&attachedRequest.draft.images?.length===1&&attachedRequest.draft.images[0].url.startsWith('data:image/png;base64,')&&attachedRequest.draft.quotedContext?.length===1&&await attached.locator('superx-draft-panel .text-only').isHidden(),{imageCount:attachedRequest.draft.images?.length,quotedCount:attachedRequest.draft.quotedContext?.length});
    check('modal local context: only the explicit uploaded attachment is read',await attached.evaluate(()=>qa.imageFetches.length===1));
    for(const variant of ['exact','different-author','different-timestamp','ambiguous','missing-timestamp']){
      const other={id:777,body:parentBody,username:variant==='different-author'?'anotherauthor':'replyauthor',author:variant==='different-author'?'Another Author':'Reply Author',timestamp:variant==='different-timestamp'?'2026-10-22T09:00:00.000Z':parentTime};
      const background=modalPreview(other)+(variant==='ambiguous'?modalPreview({...other,id:778}):'')+modalPreview({id:779,username:'unrelated',body:'Unrelated background content.'});
      const page=await prepare({preview:modalPreview({timestamp:variant==='missing-timestamp'?'':parentTime}),background,path:'/home'}),request=await sendDraft(page),context=request.draft.context;
      check('modal local context: '+variant+' never substitutes unrelated background text',request.draft.mode==='reply'&&context?.text===parentBody&&context.username==='replyauthor'&&!(request.draft.threadContext||[]).length,request.draft);
      check('modal local context: '+variant+' canonical enrichment requires unique author text and timestamp',variant==='exact'?context?.id==='777'&&context.url==='https://x.com/replyauthor/status/777':context?.snapshotOnly===true&&context.id===null&&context.url===null,context);
    }
    const late=await prepare({preview:'',scene:'new-modal',path:'/compose/post'}),lateInitial=await sendDraft(late);
    await emit(late,{type:'RESULT',requestId:lateInitial.requestId,result:{text:'Initial result before the parent preview hydrated.'}});await settle(late);
    await late.locator('.modal-body').evaluate((body,markup)=>body.insertAdjacentHTML('afterbegin',markup),modalPreview());await settle(late);
    check('modal local context: late parent mount marks the earlier result stale without a request',await late.locator('superx-draft-panel .stale').isVisible()&&await late.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1));
    await late.locator('superx-draft-panel .retry').click();await settle(late);
    const lateRequest=await late.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').at(-1));
    check('modal local context: explicit recheck captures the late-mounted parent',lateRequest.requestId!==lateInitial.requestId&&lateRequest.draft.mode==='reply'&&lateRequest.draft.context?.text===parentBody,lateRequest.draft);
    await emit(late,{type:'RESULT',requestId:lateRequest.requestId,result:{text:'Result for the visible preview snapshot.'}});await settle(late);
    await late.locator('.native-context-preview > [data-testid="tweetText"]').evaluate(node=>node.textContent+=' More details were expanded by the user.');await settle(late);
    check('modal local context: expanded parent body becomes stale without duplicate requests',await late.locator('superx-draft-panel .stale').isVisible()&&await late.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===2));
    await late.locator('superx-draft-panel .retry').click();await settle(late);
    const expanded=await late.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').at(-1));
    check('modal local context: explicit recheck uses expanded parent text',expanded.draft.context?.text===parentBody+' More details were expanded by the user.'&&await late.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===3),expanded.draft);
    const deepMarkup=modalPreview({tag:'div',username:'deepquote',author:'Deep Quote Author',body:'Deep referenced claim.',profileLink:false}).replace('<div class=','<div role="link" data-fixture-deep="true" class=');
    const deep=await prepare({preview:modalPreview({nested:modalPreview({tag:'button',username:'quotedauthor',author:'Quoted Author',body:'The middle quoted claim.',profileLink:false,nested:deepMarkup})})});
    const deepRequest=await sendDraft(deep);
    check('modal local context: two nested snapshot levels are represented',deepRequest.draft.context?.quotedContext?.[0]?.quotedContext?.[0]?.text==='Deep referenced claim.',deepRequest.draft.context);
    await emit(deep,{type:'RESULT',requestId:deepRequest.requestId,result:{text:'Result associated with the nested source snapshots.'}});await settle(deep);
    await deep.locator('[data-fixture-deep] > [data-testid="tweetText"]').evaluate(node=>node.textContent='Deep referenced claim was expanded.');await settle(deep);
    check('modal local context: deeper quoted text changes mark the result stale without another request',await deep.locator('superx-draft-panel .stale').isVisible()&&await deep.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1));
    await deep.locator('superx-draft-panel .retry').click();await settle(deep);
    const deepRetry=await deep.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').at(-1));
    check('modal local context: explicit retry captures the changed deepest snapshot',deepRetry.draft.context?.quotedContext?.[0]?.quotedContext?.[0]?.text==='Deep referenced claim was expanded.',deepRetry.draft.context);
    await modalContext.close();
  }
  if(focus==='full'||focus==='metadata'){
    const metadataContext=await browser.newContext({viewport:{width:1100,height:1000}});
    await metadataContext.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base||['data:','blob:'].includes(url.protocol))return route.continue();report.externalRequests.push({label:'draft-search-metadata',url:route.request().url()});return route.abort();});
    const captureMetadata=page=>page.evaluate(()=>{
      const shadow=document.querySelector('superx-draft-panel').shadowRoot,state=shadow.querySelector('.state');
      return {title:state.title,aria:state.getAttribute('aria-label'),tabIndex:state.tabIndex,label:shadow.querySelector('.state-label').textContent,visible:shadow.querySelector('.panel').innerText,focused:shadow.activeElement===state};
    });
    let recordedPage;
    for(const kind of ['recorded','false','missing']){
      const page=await metadataContext.newPage();page.on('pageerror',error=>report.pageErrors.push({label:'draft-search-'+kind,message:error.message}));
      await start(page,'new-inline','dark',1100);
      const labels=await page.evaluate(()=>({recorded:GrokFirstUI.t('draft.searchRecorded','en'),unconfirmed:GrokFirstUI.t('draft.searchUnconfirmed','en'),pending:GrokFirstUI.t('draft.searchPending','en'),note:GrokFirstUI.t('draft.searchEvidenceNote','en')}));
      await page.locator('[contenteditable]').fill('The company doubled its revenue this year.');await settle(page);
      await page.locator('superx-draft-action').getByRole('button').click();await settle(page);
      const request=await page.evaluate(()=>qa.sent.find(message=>message.type==='ANALYZE_DRAFT'));
      await emit(page,{type:'START',requestId:request.requestId});await emit(page,{type:'UPDATE',requestId:request.requestId,text:'A streamed draft assessment.',searched:false});await settle(page);
      const running=await captureMetadata(page);
      check('draft search metadata: '+kind+' running false awaits a report instead of claiming no search',running.title.includes(labels.pending)&&!running.title.includes(labels.unconfirmed),running);
      const result={text:'The comparison needs a matching accounting period.',verificationStatus:'completed',warning:'No search was performed.',model:'grok-4.3',usage:{input_tokens:18,output_tokens:12,total_tokens:30},...(kind==='missing'?{}:{searched:kind==='recorded'})};
      await emit(page,{type:'RESULT',requestId:request.requestId,result});await settle(page);
      const expected=kind==='recorded'?labels.recorded:labels.unconfirmed,done=await captureMetadata(page);
      check('draft search metadata: '+kind+' final exposes accurate search state in token tooltip',done.title.includes(expected)&&!done.title.includes(labels.pending),done);
      check('draft search metadata: '+kind+' keeps visible header concise without a warning row',done.label==='30 tokens'&&!done.visible.includes('Search calls:')&&!done.visible.includes(result.warning),done);
      await page.locator('superx-draft-panel .state').focus();const keyboard=await captureMetadata(page);
      check('draft search metadata: '+kind+' keyboard focus exposes the same tooltip description',keyboard.focused&&keyboard.tabIndex===0&&keyboard.aria.includes(expected)&&keyboard.aria.includes('30'),keyboard);
      if(kind==='recorded'){
        check('draft search metadata: recorded calls include evidence caveat in tooltip only',done.title.includes(labels.note)&&!done.visible.includes(labels.note),done);
        recordedPage=page;
        await page.screenshot({path:path.join(output,'metadata-search-recorded.png'),fullPage:true});report.screenshots.push('metadata-search-recorded.png');
      }else if(kind==='false'){
        await page.screenshot({path:path.join(output,'metadata-search-unconfirmed.png'),fullPage:true});report.screenshots.push('metadata-search-unconfirmed.png');
      }
    }
    const labels=await recordedPage.evaluate(()=>({recorded:GrokFirstUI.t('draft.searchRecorded','en'),unconfirmed:GrokFirstUI.t('draft.searchUnconfirmed','en'),pending:GrokFirstUI.t('draft.searchPending','en')}));
    await recordedPage.locator('superx-draft-panel .retry').click();await settle(recordedPage);
    let current=await recordedPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').at(-1));
    const manualRetry=await captureMetadata(recordedPage);
    check('draft search metadata: manual recheck does not inherit old recorded calls',manualRetry.title.includes(labels.pending)&&!manualRetry.title.includes(labels.recorded),manualRetry);
    await emit(recordedPage,{type:'START',requestId:current.requestId});await emit(recordedPage,{type:'UPDATE',requestId:current.requestId,text:'A partial assessment after a recorded search call.',searched:true});
    await emit(recordedPage,{type:'ERROR',requestId:current.requestId,code:'API_ERROR',partialResult:{text:'A retained partial assessment.',searched:false,usage:{input_tokens:20,output_tokens:10,total_tokens:30}}});await settle(recordedPage);
    const partial=await captureMetadata(recordedPage);
    check('draft search metadata: error partial cannot erase a confirmed call from the same attempt',partial.title.includes(labels.recorded)&&!partial.title.includes(labels.unconfirmed),partial);
    await recordedPage.locator('superx-draft-panel .retry').click();await settle(recordedPage);
    current=await recordedPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').at(-1));
    await emit(recordedPage,{type:'START',requestId:current.requestId});await emit(recordedPage,{type:'UPDATE',requestId:current.requestId,text:'The first attempt had a call.',searched:true});
    await emit(recordedPage,{type:'RETRY_WAIT',requestId:current.requestId});await emit(recordedPage,{type:'START',requestId:current.requestId});await settle(recordedPage);
    const attempt=await captureMetadata(recordedPage);
    check('draft search metadata: automatic retry starts a fresh search record',attempt.title.includes(labels.pending)&&!attempt.title.includes(labels.recorded),attempt);
    await emit(recordedPage,{type:'RESULT',requestId:current.requestId,result:{text:'The retried result returned no search record.',searched:false,usage:{input_tokens:20,output_tokens:10,total_tokens:30}}});await settle(recordedPage);
    const retried=await captureMetadata(recordedPage);
    check('draft search metadata: retry final false stays unconfirmed instead of reusing old true',retried.title.includes(labels.unconfirmed)&&!retried.title.includes(labels.recorded),retried);
    await recordedPage.evaluate(()=>{qa.manager.reset();qa.manager.scan();});await settle(recordedPage);
    const reset=await captureMetadata(recordedPage);
    check('draft search metadata: reset clears all previous search and model metadata',!reset.title.includes(labels.recorded)&&!reset.title.includes('grok-4.3'),reset);
    await recordedPage.locator('superx-draft-action').getByRole('button').click();await settle(recordedPage);
    current=await recordedPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').at(-1));
    await emit(recordedPage,{type:'START',requestId:current.requestId});await emit(recordedPage,{type:'RESULT',requestId:current.requestId,result:{text:'A fresh result after reset.',usage:{input_tokens:20,output_tokens:10,total_tokens:30}}});await settle(recordedPage);
    const afterReset=await captureMetadata(recordedPage);
    check('draft search metadata: reset followed by a missing record is unconfirmed',afterReset.title.includes(labels.unconfirmed)&&!afterReset.title.includes(labels.recorded),afterReset);
    await metadataContext.close();
  }
  if(focus==='full'||focus==='recovery'){
    const recoveryContext=await browser.newContext({viewport:{width:1100,height:1000}});
    await recoveryContext.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base||['data:','blob:'].includes(url.protocol))return route.continue();report.externalRequests.push({label:'draft-provider-recovery',url:route.request().url()});return route.abort();});
    const readiness=async(page,values={})=>config(page,{settings:{...(await page.evaluate(()=>qa.config.settings)),provider:'build'},identity:'build:already-configured',taskRevision:11,needsProvider:'build.notConnected',...values});
    const requestList=page=>page.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT'));
    for(const path of ['initially-unavailable','handshake-unavailable']){
      const page=await recoveryContext.newPage();page.on('pageerror',error=>report.pageErrors.push({label:'draft-recovery-'+path,message:error.message}));
      await start(page,'new-inline','dark',1100);
      if(path==='handshake-unavailable')await page.evaluate(()=>{qa.manager.destroy();qa.manager=qa.createManager();});
      await readiness(page,path==='initially-unavailable'?{ready:false}:{ready:false,connected:false,hasConfig:false,awaitingConfig:true});
      await page.locator('[contenteditable]').fill('This draft must wait for my configured local Grok service.');await settle(page);
      await page.locator('superx-draft-action').getByRole('button').click();await settle(page);
      if(path==='handshake-unavailable'){
        check('draft recovery: pending handshake never sends before authoritative readiness',(await requestList(page)).length===0);
        await readiness(page,{ready:false,connected:true,hasConfig:true,awaitingConfig:false});await settle(page);
      }
      check('draft recovery: '+path+' shows connection action without a provider request',await page.locator('superx-draft-panel .settings').isVisible()&&await page.locator('superx-draft-panel .retry').isHidden()&&(await requestList(page)).length===0);
      await readiness(page,{ready:true,connected:true,hasConfig:true,awaitingConfig:false});await settle(page);
      check('draft recovery: '+path+' restores explicit retry without automatic dispatch',await page.locator('superx-draft-panel .retry').isVisible()&&await page.locator('superx-draft-panel .settings').isHidden()&&(await requestList(page)).length===0);
      await page.locator('superx-draft-panel .retry').click();await settle(page);
      const requests=await requestList(page),request=requests.at(-1);
      check('draft recovery: '+path+' sends exactly once only after explicit retry',requests.length===1&&request.draft.text==='This draft must wait for my configured local Grok service.');
      await emit(page,{type:'START',requestId:request.requestId});await emit(page,{type:'UPDATE',requestId:request.requestId,text:'An answer from the original configured service.'});
      await config(page,{identity:'build:another-credential',taskRevision:12});await settle(page);
      await emit(page,{type:'RESULT',requestId:request.requestId,result:{text:'Late answer must not enter the new credential.'}});await settle(page);
      check('draft recovery: '+path+' true credential changes still cancel and isolate output',await page.evaluate(requestId=>qa.sent.some(message=>message.type==='CANCEL'&&message.requestId===requestId)&&![...document.querySelectorAll('superx-draft-panel')].some(panel=>/original configured|Late answer/.test(panel.shadowRoot.querySelector('.answer').textContent)),request.requestId));
      check('draft recovery: '+path+' credential change does not replay the previous request',(await requestList(page)).length===1);
    }
    const preserved=await recoveryContext.newPage();preserved.on('pageerror',error=>report.pageErrors.push({label:'draft-recovery-preserved-answer',message:error.message}));
    await start(preserved,'new-inline','dark',1100);await readiness(preserved,{ready:true});
    await preserved.locator('[contenteditable]').fill('Original draft with a completed answer.');await settle(preserved);
    await preserved.locator('superx-draft-action').getByRole('button').click();await settle(preserved);
    const completed=(await requestList(preserved))[0];
    await emit(preserved,{type:'RESULT',requestId:completed.requestId,result:{text:'Completed answer for the original draft.',searched:true,model:'grok-4.3',usage:{input_tokens:10,output_tokens:10,total_tokens:20}}});await settle(preserved);
    await preserved.locator('[contenteditable]').fill('Edited draft needs a new check.');await readiness(preserved,{ready:false});await settle(preserved);
    await preserved.locator('superx-draft-panel .retry').click();await settle(preserved);
    check('draft recovery: unavailable recheck preserves old answer and its stale input attribution',(await preserved.locator('superx-draft-panel .answer').innerText())==='Completed answer for the original draft.'&&await preserved.locator('superx-draft-panel .stale').isVisible()&&(await requestList(preserved)).length===1);
    await readiness(preserved,{ready:true});await settle(preserved);
    check('draft recovery: readiness restores retry while retaining completed evidence',(await preserved.locator('superx-draft-panel .answer').innerText())==='Completed answer for the original draft.'&&await preserved.locator('superx-draft-panel .retry').isVisible()&&await preserved.locator('superx-draft-panel .settings').isHidden()&&(await requestList(preserved)).length===1);
    await preserved.locator('superx-draft-panel .retry').click();await settle(preserved);
    const edited=(await requestList(preserved)).at(-1);
    check('draft recovery: only the next explicit recheck captures the edited draft',edited.requestId!==completed.requestId&&edited.draft.text==='Edited draft needs a new check.'&&(await requestList(preserved)).length===2);
    await recoveryContext.close();
  }
  if(focus==='full'||focus==='sticky'){
    for(const [scheme,width,quote] of [['dark',1100,false],['light',390,false],['dark',1100,true]]){
      const stickyContext=await browser.newContext({viewport:{width,height:850},colorScheme:scheme});
      await stickyContext.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base||['data:','blob:'].includes(url.protocol))return route.continue();report.externalRequests.push({label:'sticky-inline',url:route.request().url()});return route.abort();});
      const page=await stickyContext.newPage();page.on('pageerror',error=>report.pageErrors.push({label:'sticky-inline-'+scheme+'-'+width,message:error.message}));
      await start(page,quote?'post-sticky-quote':'reply-sticky',scheme,width);
      await page.locator('[contenteditable]').fill(quote?'This new post comments on the quotation.':'This short inline reply needs evidence.');await settle(page);
      const capture=()=>page.evaluate(()=>{
        const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
        const panel=document.querySelector('superx-draft-panel'),footer=document.querySelector('.native-sticky-footer'),css=getComputedStyle(footer);
        return {group:rect(document.querySelector('.native-common-group')),row:rect(document.querySelector('.native-avatar-row')),editor:rect(document.querySelector('[contenteditable]')),footer:rect(footer),panel:rect(panel),answer:rect(panel.shadowRoot.querySelector('.answer')),insideGroup:Boolean(panel.closest('.native-common-group')),insideRow:Boolean(panel.closest('.native-avatar-row')),sticky:{position:css.position,top:css.top,bottom:css.bottom,zIndex:css.zIndex}};
      });
      const before=await capture();
      await page.locator('superx-draft-action').getByRole('button').click();await settle(page);
      const request=await page.evaluate(()=>qa.sent.find(message=>message.type==='ANALYZE_DRAFT'));
      if(quote)check('sticky new-post quote: request remains a post with quoted context',request.draft.mode==='post'&&!request.draft.context&&!request.draft.threadContext&&JSON.stringify(request.draft.quotedContext?.map(post=>post.id))===JSON.stringify(['300']),request.draft);
      const longText=Array.from({length:18},(_,index)=>'**Evidence '+(index+1)+'.** The same limited observation can have several explanations; dates, original records and denominators must match.').join('\n\n');
      await emit(page,{type:'START',requestId:request.requestId});await emit(page,{type:'UPDATE',requestId:request.requestId,text:longText});await settle(page);
      await page.locator('superx-draft-panel .more').click();await settle(page);
      const expanded=await capture(),label=(quote?'sticky new-post quote/':'sticky inline/')+scheme+'/'+width,screenshotName=(quote?'sticky-post-quote-':'sticky-inline-');
      check(label+': result is outside the entire native avatar row',!expanded.insideGroup&&!expanded.insideRow,expanded);
      check(label+': answer never expands sticky containing block',Math.abs(expanded.group.height-before.group.height)<=1&&Math.abs(expanded.row.height-before.row.height)<=1,{before,expanded});
      check(label+': full native toolbar remains before result',expanded.panel.y>=expanded.footer.bottom-1,expanded);
      check(label+': answer text preserves native editor left inset',Math.abs(expanded.answer.x-expanded.editor.x)<=1,expanded);
      check(label+': native sticky CSS is not rewritten',JSON.stringify(expanded.sticky)===JSON.stringify(before.sticky)&&expanded.sticky.position==='sticky'&&expanded.sticky.bottom==='-1px',expanded.sticky);
      await page.evaluate(()=>window.scrollTo(0,document.querySelector('superx-draft-panel').getBoundingClientRect().top+window.scrollY+160));await settle(page);
      const scrolled=await capture();
      check(label+': scrolling cannot pin the toolbar over the answer',scrolled.footer.bottom<=scrolled.panel.y+1,scrolled);
      await page.screenshot({path:path.join(output,screenshotName+'scrolled-'+scheme+'-'+width+'.png')});report.screenshots.push(screenshotName+'scrolled-'+scheme+'-'+width+'.png');
      await page.locator('superx-draft-action').getByRole('button').click();await settle(page);
      await page.locator('superx-draft-action').getByRole('button').click();await settle(page);
      const reopened=await capture();
      check(label+': Hide and Show preserve native row and toolbar dimensions',Math.abs(reopened.group.height-before.group.height)<=1&&Math.abs(reopened.row.height-before.row.height)<=1&&Math.abs(reopened.footer.height-before.footer.height)<=1,{before,reopened});
      check(label+': Show does not request a second generation',await page.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1));
      await page.screenshot({path:path.join(output,screenshotName+scheme+'-'+width+'.png'),fullPage:true});report.screenshots.push(screenshotName+scheme+'-'+width+'.png');
      await stickyContext.close();
    }
  }
  if(focus==='full'){
  const edgeContext=await browser.newContext({viewport:{width:1100,height:1000}});
  await edgeContext.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base||['data:','blob:'].includes(url.protocol))return route.continue();report.externalRequests.push({label:'text-boundaries',url:route.request().url()});return route.abort();});
  const edgePage=await edgeContext.newPage();edgePage.on('pageerror',error=>report.pageErrors.push({label:'text-boundaries',message:error.message}));
  await start(edgePage,'reply-modal','dark',1100);
  await edgePage.evaluate(()=>{
    const editor=document.querySelector('[contenteditable]');editor.innerHTML='Moon <img alt="🌙" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22/%3E"> facts<br>Second line';
    const body=document.querySelector('.modal-body'),toolbar=document.querySelector('.native-toolbar');body.append(toolbar);
    const parentPhoto=document.createElement('div');parentPhoto.dataset.testid='tweetPhoto';parentPhoto.style.cssText='width:100px;height:50px';parentPhoto.innerHTML='<img alt="Parent image only" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%2250%22/%3E">';body.querySelector('article').append(parentPhoto);
    qa.manager.scan();editor.dispatchEvent(new Event('input',{bubbles:true}));
  });await settle(edgePage);
  await edgePage.locator('superx-draft-action').getByRole('button').click();await settle(edgePage);
  const emojiRequest=await edgePage.evaluate(()=>qa.sent.find(item=>item.type==='ANALYZE_DRAFT'));
  check('text boundaries: typed image-alt emoji survives draft extraction',emojiRequest.draft.text==='Moon 🌙 facts\nSecond line',emojiRequest.draft.text);
  check('text boundaries: parent media does not count as draft attachments',await edgePage.locator('superx-draft-panel .text-only').isHidden());
  check('text boundaries: text-only request does not contain draft media fields',!Object.hasOwn(emojiRequest.draft,'images')&&!Object.hasOwn(emojiRequest.draft,'attachments')&&!JSON.stringify(emojiRequest.draft).includes('data:image'));
  await emit(edgePage,{type:'START',requestId:emojiRequest.requestId});
  await edgePage.evaluate(()=>{const attachment=document.createElement('div');attachment.dataset.testid='attachments';attachment.style.cssText='height:60px;width:120px';attachment.textContent='Local draft attachment preview';document.querySelector('.composer .editor-row').after(attachment);qa.manager.scan();});await settle(edgePage);
  check('text boundaries: draft attachment preview shows accurate text-only notice',await edgePage.locator('superx-draft-panel .text-only').isVisible()&&(await edgePage.locator('superx-draft-panel .text-only').innerText()).includes('attachments are not included'));
  check('text boundaries: adding draft attachment never automatically sends content',await edgePage.evaluate(()=>qa.sent.filter(item=>item.type==='ANALYZE_DRAFT').length===1));
  await edgePage.screenshot({path:path.join(output,'emoji-parent-and-draft-media.png'),fullPage:true});report.screenshots.push('emoji-parent-and-draft-media.png');
  await edgeContext.close();
  const integration=await browser.newContext({viewport:{width:1300,height:1000}});
  await integration.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base||['data:','blob:'].includes(url.protocol))return route.continue();report.externalRequests.push({label:'content-integration',url:route.request().url()});return route.abort();});
  const integrated=await integration.newPage();integrated.on('pageerror',error=>report.pageErrors.push({label:'content-integration',message:error.message}));
  await startIntegrated(integrated);
  await integrated.locator('[contenteditable]').fill(t);await settle(integrated);
  await integrated.locator('superx-draft-action').getByRole('button').click();await settle(integrated);
  let integratedRequests=await integrated.evaluate(()=>qa.sent.filter(item=>item.type==='ANALYZE_DRAFT')),integratedId=integratedRequests.at(-1)?.requestId;
  check('content integration: paused automation and collapsed rail allow explicit draft request',integratedRequests.length===1&&await integrated.evaluate(()=>qa.sent.every(item=>item.type!=='ANALYZE')));
  await integrated.evaluate(requestId=>{qa.emit({type:'START',requestId});qa.emit({type:'UPDATE',requestId,text:'Integrated content stream before config.'});},integratedId);await settle(integrated);
  check('content integration: real content handler routes streamed draft output',(await integrated.locator('superx-draft-panel .answer').innerText()).includes('Integrated content stream'));
  await integrated.evaluate(()=>qa.emitConfig({settings:{...qa.config.settings,interfaceLanguage:'zh-CN',dwellMs:2543,verifyPrompt:'Changed published-post prompt for future tasks only.',draftPrompt:'Changed retained legacy draft preference.',postDraftPrompt:'Changed new-post draft prompt for future tasks only.',replyDraftPrompt:'Changed reply draft prompt for future tasks only.'},taskRevision:7}));await settle(integrated);
  await integrated.evaluate(requestId=>qa.emit({type:'UPDATE',requestId,text:'Integrated stream survived presentation changes.'}),integratedId);await settle(integrated);
  check('content integration: same-revision UI/dwell/published and draft prompt changes preserve started task',(await integrated.locator('superx-draft-panel .answer').innerText()).includes('survived presentation')&&await integrated.evaluate(requestId=>qa.sent.every(item=>item.type!=='CANCEL'||item.requestId!==requestId),integratedId));
  await integrated.evaluate(()=>qa.emitConfig({taskRevision:8}));await settle(integrated);
  await integrated.evaluate(requestId=>qa.emit({type:'UPDATE',requestId,text:'Late task from retired revision.'}),integratedId);await settle(integrated);
  check('content integration: authoritative task revision invalidates active request and rejects late stream',await integrated.evaluate(requestId=>qa.sent.some(item=>item.type==='CANCEL'&&item.requestId===requestId),integratedId)&&!(await integrated.locator('superx-draft-panel .answer').innerText()).includes('Late task'));
  await integrated.locator('superx-draft-panel .retry').click();await settle(integrated);
  integratedRequests=await integrated.evaluate(()=>qa.sent.filter(item=>item.type==='ANALYZE_DRAFT'));integratedId=integratedRequests.at(-1).requestId;
  await integrated.evaluate(requestId=>qa.emit({type:'RESULT',requestId,result:{text:'Completed answer retained through worker sleep.'}}),integratedId);await settle(integrated);
  await integrated.evaluate(()=>{qa.autoConfig=false;qa.currentPort.onDisconnect.emit();});await settle(integrated);
  check('content integration: idle worker disconnect keeps completed result',(await integrated.locator('superx-draft-panel .answer').innerText()).includes('retained through worker sleep'));
  await integrated.locator('superx-draft-panel .retry').click();await settle(integrated);
  check('content integration: explicit recheck wakes worker but waits for CONFIG',await integrated.evaluate(()=>qa.connectCount===2&&qa.sent.filter(item=>item.type==='ANALYZE_DRAFT').length===2));
  await integrated.evaluate(()=>qa.emitConfig({taskRevision:0}));await settle(integrated);
  const wakeReceipt=await integrated.evaluate(()=>({connectCount:qa.connectCount,requests:qa.sent.filter(item=>item.type==='ANALYZE_DRAFT').map(item=>({requestId:item.requestId,draft:item.draft.text})),cancellations:qa.sent.filter(item=>item.type==='CANCEL').map(item=>item.requestId),panelStatus:document.querySelector('superx-draft-panel').shadowRoot.querySelector('.state').textContent}));
  check('content integration: restarted worker revision dispatches pending explicit intent exactly once',wakeReceipt.requests.length===3,wakeReceipt);
  integratedRequests=await integrated.evaluate(()=>qa.sent.filter(item=>item.type==='ANALYZE_DRAFT'));integratedId=integratedRequests.at(-1).requestId;
  await integrated.evaluate(requestId=>qa.emit({type:'RESULT',requestId,result:{text:'Fresh check after worker wake.'}}),integratedId);await settle(integrated);
  await integrated.screenshot({path:path.join(output,'full-content-worker-wake.png'),fullPage:true});report.screenshots.push('full-content-worker-wake.png');
  await integration.close();
  const restoringContext=await browser.newContext({viewport:{width:1100,height:1000}});
  await restoringContext.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base||['data:','blob:'].includes(url.protocol))return route.continue();report.externalRequests.push({label:'oauth-restore-integration',url:route.request().url()});return route.abort();});
  const restoring=await restoringContext.newPage();restoring.on('pageerror',error=>report.pageErrors.push({label:'oauth-restore-integration',message:error.message}));
  await startIntegrated(restoring,{config:false,oauth:true});
  await restoring.locator('[contenteditable]').fill(t);await settle(restoring);await restoring.locator('superx-draft-action').getByRole('button').click();await settle(restoring);
  check('content integration: initial handshake retains explicit draft intent without dispatch',await restoring.evaluate(()=>qa.sent.every(item=>item.type!=='ANALYZE_DRAFT')));
  await restoring.evaluate(()=>qa.emitConfig({ready:false,taskRevision:0,credentialIdentity:'',oauthStatus:{state:'restoring',connected:false}}));await settle(restoring);
  check('content integration: OAuth restoration still waits without losing intent',await restoring.evaluate(()=>qa.sent.every(item=>item.type!=='ANALYZE_DRAFT')));
  await restoring.evaluate(()=>qa.emitConfig({ready:true,credentialIdentity:'oauth:restored-account',taskRevision:0,oauthStatus:{state:'connected',connected:true,modelAvailable:true}}));await settle(restoring);
  check('content integration: restored OAuth identity releases the initial intent once',await restoring.evaluate(()=>qa.sent.filter(item=>item.type==='ANALYZE_DRAFT').length===1));
  await restoring.evaluate(()=>qa.emitConfig({ready:true,credentialIdentity:'oauth:restored-account',taskRevision:0,oauthStatus:{state:'connected',connected:true,modelAvailable:true}}));await settle(restoring);
  check('content integration: duplicate CONFIG never duplicates draft request',await restoring.evaluate(()=>qa.sent.filter(item=>item.type==='ANALYZE_DRAFT').length===1));
  await restoringContext.close();
  classicBrowser=await chromium.launch({channel:'msedge',headless:true,ignoreDefaultArgs:['--hide-scrollbars'],args:['--disable-features=OverlayScrollbar,FluentOverlayScrollbar']});
  for(const variant of ['modal','nested','flex-nested']){
    const label='classic-scrollbar/'+variant,gutterContext=await classicBrowser.newContext({viewport:{width:1100,height:900},colorScheme:'dark'});
    await gutterContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    const gutterPage=await gutterContext.newPage();gutterPage.on('pageerror',error=>report.pageErrors.push({label,message:error.message}));
    await start(gutterPage,'reply-modal','dark',1100,'en','separator',async page=>{
      await page.addStyleTag({content:'*::-webkit-scrollbar{width:18px;height:18px}*::-webkit-scrollbar-track{background:#263238}*::-webkit-scrollbar-thumb{background:#90a4ae}'});
      await page.evaluate(variant=>{
        const dialog=document.querySelector('.dialog'),body=document.querySelector('.modal-body');let actual=dialog;
        dialog.style.maxHeight='480px';
        if(variant==='nested'){dialog.style.overflow='visible';dialog.style.maxHeight='none';actual=document.createElement('div');actual.className='native-nested-scroller';actual.style.cssText='overflow-y:auto;max-height:420px';body.before(actual);actual.append(body);}
        if(variant==='flex-nested'){dialog.style.cssText='display:flex;flex-direction:column;height:480px;max-height:none;overflow:visible';document.querySelector('.modal-head').style.flex='none';body.style.cssText='overflow-y:auto;flex:1;min-height:0';actual=body;}
        actual.id='qa-native-scroller';qa.gutterActual=actual;qa.gutterOriginal=variant==='modal'?'auto':'';qa.gutterPriority=variant==='modal'?'important':'';
        if(qa.gutterOriginal)actual.style.setProperty('scrollbar-gutter',qa.gutterOriginal,qa.gutterPriority);
        const filler=document.createElement('div');filler.style.height='1800px';actual.style.setProperty('scrollbar-gutter','auto');const short=actual.clientWidth;actual.append(filler);const tall=actual.clientWidth;filler.remove();qa.classicProof={short,tall,delta:short-tall};
        if(qa.gutterOriginal)actual.style.setProperty('scrollbar-gutter',qa.gutterOriginal,qa.gutterPriority);else actual.style.removeProperty('scrollbar-gutter');
        const unrelated=document.createElement('div');unrelated.id='qa-unrelated-scroller';unrelated.style.cssText='position:fixed;left:0;top:0;width:100px;height:80px;overflow-y:auto;scrollbar-gutter:auto!important';unrelated.innerHTML='<div style="height:400px">Unrelated</div>';document.body.append(unrelated);
        qa.untouchedStyles={unrelated:unrelated.getAttribute('style'),body:document.body.getAttribute('style'),html:document.documentElement.getAttribute('style'),dialog:dialog===actual?null:dialog.style.getPropertyValue('scrollbar-gutter')};
      },variant);
    });
    const proof=await gutterPage.evaluate(()=>qa.classicProof);
    check(`${label}: fixture proves a real non-overlay 18px scrollbar`,proof.delta>=17,proof);
    check(`${label}: actual native scroller reserves stable gutter before opening`,await gutterPage.evaluate(()=>getComputedStyle(qa.gutterActual).scrollbarGutter.includes('stable')));
    await gutterPage.locator('[contenteditable]').fill(t);await settle(gutterPage);
    const before=await gutterPage.evaluate(()=>({client:qa.gutterActual.clientWidth,editor:document.querySelector('[contenteditable]').getBoundingClientRect().width,action:document.querySelector('superx-draft-action').getBoundingClientRect().x,overflow:getComputedStyle(qa.gutterActual).overflowY}));
    await gutterPage.locator('superx-draft-action').getByRole('button').click();
    const requestId=await gutterPage.evaluate(()=>qa.sent.find(message=>message.type==='ANALYZE_DRAFT').requestId);
    await emit(gutterPage,{type:'START',requestId});await emit(gutterPage,{type:'UPDATE',requestId,text:Array.from({length:25},(_,i)=>`Evidence paragraph ${i+1} keeps the native dialog long enough to require scrolling.`).join('\n\n')});await settle(gutterPage);
    check(`${label}: answer genuinely overflows without changing native client width`,await gutterPage.evaluate(expected=>qa.gutterActual.scrollHeight>qa.gutterActual.clientHeight+20&&qa.gutterActual.clientWidth===expected.client&&Math.abs(document.querySelector('[contenteditable]').getBoundingClientRect().width-expected.editor)<1&&getComputedStyle(qa.gutterActual).overflowY===expected.overflow,before));
    if(variant==='modal'){await gutterPage.screenshot({path:path.join(output,'classic-scrollbar-modal-overflow.png'),fullPage:true});report.screenshots.push('classic-scrollbar-modal-overflow.png');}
    await gutterPage.locator('#qa-native-scroller').evaluate(node=>node.scrollTop=0);await gutterPage.locator('#qa-native-scroller').hover();await gutterPage.mouse.wheel(0,250);await gutterPage.waitForTimeout(100);
    check(`${label}: native wheel scrolling still works`,await gutterPage.evaluate(()=>qa.gutterActual.scrollTop>0));
    await gutterPage.locator('superx-draft-action').getByRole('button').click();await settle(gutterPage);
    check(`${label}: hiding keeps reserved width and does not rerun task`,await gutterPage.evaluate(expected=>qa.gutterActual.clientWidth===expected.client&&qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1,before));
    await gutterPage.locator('superx-draft-action').getByRole('button').click();await settle(gutterPage);
    check(`${label}: reopening keeps width and active result`,await gutterPage.evaluate(expected=>qa.gutterActual.clientWidth===expected.client&&qa.manager.activeCount===1&&qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1,before));
    check(`${label}: unrelated scrollers and root styles are untouched`,await gutterPage.evaluate(()=>document.querySelector('#qa-unrelated-scroller').getAttribute('style')===qa.untouchedStyles.unrelated&&document.body.getAttribute('style')===qa.untouchedStyles.body&&document.documentElement.getAttribute('style')===qa.untouchedStyles.html&&(qa.gutterActual===document.querySelector('.dialog')||document.querySelector('.dialog').style.getPropertyValue('scrollbar-gutter')===qa.untouchedStyles.dialog)));
    await gutterPage.evaluate(()=>{const old=qa.gutterActual,fresh=old.cloneNode(true);fresh.querySelectorAll('superx-draft-action,superx-draft-panel').forEach(node=>node.remove());if(qa.gutterOriginal)fresh.style.setProperty('scrollbar-gutter',qa.gutterOriginal,qa.gutterPriority);else fresh.style.removeProperty('scrollbar-gutter');qa.gutterOld=old;old.replaceWith(fresh);qa.gutterActual=fresh;});await settle(gutterPage);
    check(`${label}: scroller remount releases old inline value and reserves new container`,await gutterPage.evaluate(()=>qa.gutterOld.style.getPropertyValue('scrollbar-gutter')===qa.gutterOriginal&&qa.gutterOld.style.getPropertyPriority('scrollbar-gutter')===qa.gutterPriority&&getComputedStyle(qa.gutterActual).scrollbarGutter.includes('stable')));
    await emit(gutterPage,{type:'UPDATE',requestId,text:'Original task survived native scroller remount.'});await settle(gutterPage);
    check(`${label}: scroller remount preserves running answer and avoids another request`,(await gutterPage.locator('superx-draft-panel .answer').innerText()).includes('survived native scroller')&&await gutterPage.evaluate(draftText=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1&&document.querySelector('[contenteditable]').textContent===draftText,t));
    await gutterPage.screenshot({path:path.join(output,`classic-scrollbar-${variant}.png`),fullPage:true});report.screenshots.push(`classic-scrollbar-${variant}.png`);
    await gutterPage.evaluate(()=>qa.manager.destroy());await settle(gutterPage);
    check(`${label}: destroy restores original inline gutter value and priority`,await gutterPage.evaluate(()=>qa.gutterActual.style.getPropertyValue('scrollbar-gutter')===qa.gutterOriginal&&qa.gutterActual.style.getPropertyPriority('scrollbar-gutter')===qa.gutterPriority));
    await gutterContext.close();
  }
  const gridContext=await classicBrowser.newContext({viewport:{width:1100,height:900}}),gridPage=await gridContext.newPage();
  gridPage.on('pageerror',error=>report.pageErrors.push({label:'grid-auto-height-gutter',message:error.message}));
  await gridContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await start(gridPage,'new-modal','dark',1100,'en','separator',async page=>{
    await page.addStyleTag({content:'*::-webkit-scrollbar{width:18px}*::-webkit-scrollbar-thumb{background:#90a4ae}'});
    await page.evaluate(()=>{const dialog=document.querySelector('.dialog'),body=document.querySelector('.modal-body'),grid=document.createElement('div');dialog.style.cssText='overflow:visible;max-height:none';grid.style.cssText='display:grid;grid-template-rows:minmax(0,1fr);height:340px';body.before(grid);grid.append(body);body.id='qa-grid-scroll';body.style.cssText='overflow-y:auto;min-height:0';qa.gridScroller=body;});
  });
  await gridPage.locator('[contenteditable]').fill(t);await settle(gridPage);
  const gridBefore=await gridPage.locator('#qa-grid-scroll').evaluate(node=>({width:node.clientWidth,gutter:getComputedStyle(node).scrollbarGutter,overflow:node.scrollHeight>node.clientHeight}));
  await gridPage.locator('superx-draft-action').getByRole('button').click();
  const gridRequest=await gridPage.evaluate(()=>qa.sent.find(message=>message.type==='ANALYZE_DRAFT'));
  await emit(gridPage,{type:'START',requestId:gridRequest.requestId});
  await emit(gridPage,{type:'UPDATE',requestId:gridRequest.requestId,text:Array.from({length:20},(_,i)=>`Grid constrained evidence ${i}. The stream introduces the first real overflow.`).join('\n\n')});
  const gridAfter=await gridPage.locator('#qa-grid-scroll').evaluate(node=>({width:node.clientWidth,gutter:getComputedStyle(node).scrollbarGutter,overflow:node.scrollHeight>node.clientHeight}));
  check('grid auto-height: stable gutter is reserved before or synchronously at first streaming overflow',!gridBefore.overflow&&gridAfter.overflow&&gridAfter.gutter.includes('stable')&&(gridBefore.gutter.includes('stable')?gridBefore.width===gridAfter.width:gridBefore.width-gridAfter.width>=17),{before:gridBefore,after:gridAfter});
  await gridPage.locator('superx-draft-action').getByRole('button').click();await settle(gridPage);
  check('grid auto-height: hiding keeps established scroll-owner width',await gridPage.locator('#qa-grid-scroll').evaluate((node,width)=>node.clientWidth===width&&getComputedStyle(node).scrollbarGutter.includes('stable'),gridAfter.width));
  await gridPage.locator('superx-draft-action').getByRole('button').click();await settle(gridPage);
  check('grid auto-height: reopening keeps width without duplicating work',await gridPage.locator('#qa-grid-scroll').evaluate((node,width)=>node.clientWidth===width,gridAfter.width)&&await gridPage.evaluate(()=>qa.sent.filter(message=>message.type==='ANALYZE_DRAFT').length===1));
  await gridPage.evaluate(()=>qa.manager.destroy());await gridContext.close();
  const authorContext=await classicBrowser.newContext({viewport:{width:1100,height:900}}),authorPage=await authorContext.newPage();
  authorPage.on('pageerror',error=>report.pageErrors.push({label:'author-important-gutter',message:error.message}));
  await authorContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await start(authorPage,'new-modal','dark',1100,'en','separator',async page=>{
    await page.addStyleTag({content:'#qa-author-scroll{scrollbar-gutter:auto!important}*::-webkit-scrollbar{width:18px}'});
    await page.evaluate(()=>{const node=document.querySelector('.dialog');node.id='qa-author-scroll';node.style.maxHeight='340px';qa.authorWrites=0;qa.authorObserver=new MutationObserver(changes=>qa.authorWrites+=changes.filter(change=>change.attributeName==='style').length);qa.authorObserver.observe(node,{attributes:true,attributeFilter:['style']});});
  });
  const authorInitial=await authorPage.locator('#qa-author-scroll').evaluate(node=>({computed:getComputedStyle(node).scrollbarGutter,inline:node.style.getPropertyValue('scrollbar-gutter')}));
  check('author important: rejected gutter write immediately restores original inline style',authorInitial.computed==='auto'&&authorInitial.inline==='',authorInitial);
  const writesBefore=await authorPage.evaluate(()=>qa.authorWrites);await authorPage.evaluate(()=>{for(let i=0;i<8;i++){qa.manager.refresh();qa.manager.scan();}});await settle(authorPage);
  check('author important: later renders do not fight an author-important rule',await authorPage.evaluate(count=>qa.authorWrites===count,writesBefore));
  await authorPage.evaluate(()=>{qa.manager.destroy();qa.authorObserver.disconnect();});await authorContext.close();
  const leaseContext=await classicBrowser.newContext({viewport:{width:1100,height:900}}),leasePage=await leaseContext.newPage();
  leasePage.on('pageerror',error=>report.pageErrors.push({label:'gutter-leases',message:error.message}));
  await leaseContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await start(leasePage,'new-modal','dark',1100,'en','separator');
  await leasePage.locator('.modal-body').evaluate((body,markup)=>body.insertAdjacentHTML('beforeend',markup),composer('post-second-in-modal'));
  await leasePage.evaluate(()=>qa.manager.scan());await settle(leasePage);
  check('gutter leases: two draft editors share the modal reservation',await leasePage.evaluate(()=>document.querySelectorAll('superx-draft-action').length===2&&getComputedStyle(document.querySelector('.dialog')).scrollbarGutter.includes('stable')));
  await leasePage.locator('.composer').first().evaluate(node=>node.remove());await settle(leasePage);
  check('gutter leases: removing one editor does not release another editor reservation',await leasePage.evaluate(()=>document.querySelectorAll('superx-draft-action').length===1&&getComputedStyle(document.querySelector('.dialog')).scrollbarGutter.includes('stable')));
  await leasePage.locator('.composer').evaluate(node=>node.remove());await settle(leasePage);
  check('gutter leases: removing the last editor restores the modal inline style',await leasePage.locator('.dialog').evaluate(node=>node.style.getPropertyValue('scrollbar-gutter')===''));
  await leasePage.evaluate(()=>qa.manager.destroy());await leaseContext.close();
  const overrideContext=await classicBrowser.newContext({viewport:{width:1100,height:900}}),overridePage=await overrideContext.newPage();
  overridePage.on('pageerror',error=>report.pageErrors.push({label:'gutter-native-override',message:error.message}));
  await overrideContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await start(overridePage,'new-modal','dark',1100,'en','separator');
  await overridePage.locator('.dialog').evaluate(node=>node.style.setProperty('scrollbar-gutter','stable both-edges','important'));await settle(overridePage);
  await overridePage.evaluate(()=>{qa.manager.scan();qa.manager.destroy();});await settle(overridePage);
  check('gutter leases: later native inline changes are respected after destroy',await overridePage.locator('.dialog').evaluate(node=>node.style.getPropertyValue('scrollbar-gutter')==='stable both-edges'&&node.style.getPropertyPriority('scrollbar-gutter')==='important'));
  await overrideContext.close();await classicBrowser.close();classicBrowser=null;
  for(const [scene,scheme,width]of [['new-inline','dark',1280],['reply-modal','dark',1280],['reply-inline','light',390],['new-modal','light',780]]){
    const label=`chinese-preview/${scene}/${scheme}/${width}`,zhContext=await browser.newContext({viewport:{width,height:1000},colorScheme:scheme});
    await zhContext.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base||['data:','blob:'].includes(url.protocol))return route.continue();report.externalRequests.push({label,url:route.request().url()});return route.abort();});
    const zhPage=await zhContext.newPage();zhPage.on('pageerror',error=>report.pageErrors.push({label,message:error.message}));
    await start(zhPage,scene,scheme,width,'zh-CN');
    await zhPage.evaluate(scene=>{
      const title=document.querySelector('main>header h1');if(title)title.textContent=scene.startsWith('reply')?'帖子':'首页';
      const modalTitle=document.querySelector('.modal-head span');if(modalTitle)modalTitle.textContent=scene.startsWith('reply')?'回复':'发布新帖';
      document.querySelector('.native-publish-label').textContent=scene.startsWith('reply')?'回复':'发布';
      const note=document.createElement('div');note.textContent='本地界面验收 · 未调用 Grok、未发布内容';note.style.cssText='padding:8px 16px;font:12px/1.5 Arial,sans-serif;color:var(--muted);border-bottom:1px solid var(--border)';
      (document.querySelector('.dialog')||document.querySelector('main')).prepend(note);
    },scene);
    await zhPage.locator('[contenteditable]').fill('月震真的能持续数小时吗？这是否意味着所有月震都会持续这么久？');await settle(zhPage);
    await zhPage.locator('superx-draft-action').getByRole('button').click();
    const requestId=await zhPage.evaluate(()=>qa.sent.find(item=>item.type==='ANALYZE_DRAFT').requestId);
    await emit(zhPage,{type:'START',requestId});await emit(zhPage,{type:'RESULT',requestId,result:{text:'**有依据，持续时间因月震类型而异。**\n\nNASA 资料提到月震可持续数小时，部分浅源月震也有超过 10 分钟的记录。应保留月震类型和观测条件，不能把所有月震理解为同样时长。[来源](https://science.nasa.gov/moon/moonquakes/)\n\n*此处仅验证界面呈现，未发起新的模型核查。*',sources:[source],model:'grok-4.3',usage:{input_tokens:100,output_tokens:60,total_tokens:160}},cached:false});await settle(zhPage);
    check(`${label}: Chinese action and result controls readable`,(await zhPage.locator('superx-draft-panel .title').innerText())==='SuperX'&&(await zhPage.locator('superx-draft-panel .state-label').innerText()).includes('160')&&await zhPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    const filename=`preview-zh-${scene}-${scheme}-${width}.png`;await zhPage.screenshot({path:path.join(output,filename),fullPage:true});report.screenshots.push(filename);
    await zhContext.close();
  }
  }
  check('no external request attempted',report.externalRequests.length===0,report.externalRequests);
  check('no browser runtime errors',report.pageErrors.length===0,report.pageErrors);
}catch(error){report.fatal={message:error.message,stack:error.stack};}
finally{
  await classicBrowser?.close();await browser?.close();await new Promise(resolve=>server.close(resolve));
  report.passed=report.checks.filter(item=>item.passed).length;report.failed=report.checks.filter(item=>!item.passed).length;
  await writeFile(path.join(output,reportFile),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,failed:report.failed,screenshots:report.screenshots.length,pageErrors:report.pageErrors,fatal:report.fatal,report:path.relative(root,path.join(output,reportFile))}));
}
assert.ok(!report.fatal&&report.failed===0,'Isolated draft-composer acceptance failed; inspect artifacts/draft-check-preview/'+reportFile);
