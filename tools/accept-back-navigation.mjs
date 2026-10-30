import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';

// Native history/scroll restoration against isolated structural fixtures.
// All network destinations are intercepted. No user profile or provider calls.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const baseline=process.argv.includes('--baseline'),focus=process.argv.includes('--focus'),layoutFocus=process.argv.includes('--layout-focus'),captureOnly=process.argv.includes('--capture-only'),detailCapture=process.argv.includes('--detail-capture'),spacingFocus=process.argv.includes('--spacing-focus'),spacingContrary=process.argv.includes('--spacing-contrary'),nativeInkSpacing=process.argv.includes('--native-ink'),spacing=process.argv.includes('--spacing')||spacingFocus||spacingContrary||nativeInkSpacing,detailControls=process.argv.includes('--detail-controls')||detailCapture||spacing;
const argument=name=>process.argv.find(value=>value.startsWith(name+'='))?.slice(name.length+1);
const runLabel=argument('--run-label')||'';
if(runLabel&&!/^[a-z0-9-]+$/.test(runLabel))throw new Error('Use a simple alphanumeric run label');
const opticalArgument=argument('--optical-scale'),opticalScale=opticalArgument===undefined?null:Number(opticalArgument);
if(opticalScale!==null&&(!Number.isFinite(opticalScale)||opticalScale<1||opticalScale>1.5))throw new Error('Optical scale must be between 1 and 1.5');
const contentFileIndex=process.argv.indexOf('--content-file'),contentFile=contentFileIndex>=0?process.argv[contentFileIndex+1]:null;
const output=path.join(root,'artifacts',(detailControls?`back-navigation-detail-controls-${contentFile?'before':'candidate'}${detailCapture?'-capture':''}`:`back-navigation-${baseline?'baseline':'candidate'}${captureOnly?'-capture':focus?'-focus':layoutFocus?'-layout':''}`)+(runLabel?'-'+runLabel:''));
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{playwright=await import(pathToFileURL(process.env.SUPERX_PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules','playwright','index.mjs')));}
const scriptNames=['x-dom.js','feed-core.js','ui-i18n.js','overlay-layout.js','marked.umd.js','markdown-renderer.js','draft-composer.js','content.js'];
const sources=Object.fromEntries(await Promise.all(scriptNames.map(async name=>[name,await readFile(path.join(root,'extension',name),'utf8')])));
const symbolSVG=await readFile(path.join(root,'extension/assets/superx-symbol.svg'),'utf8');
const nativeGrokPaths=symbolSVG.match(/<g id="official-icon">([\s\S]+?)<\/g>/)?.[1];
if(nativeInkSpacing&&!nativeGrokPaths)throw new Error('The local symbol asset no longer contains its original Grok paths');
if(baseline)sources['content.js']=execFileSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'show','HEAD:extension/content.js'],{cwd:root,encoding:'utf8'});
if(contentFile)sources['content.js']=await readFile(path.resolve(root,contentFile),'utf8');
const report={environment:'Isolated Chromium, native History API and document scrolling, no live account or model calls',source:contentFile|| (baseline?'git HEAD content.js':'working-tree content.js'),opticalScale,spacing,nativeInkSpacing,checks:[],cases:[],pageErrors:[],externalRequests:[],screenshots:[]};
const check=(name,passed,details)=>report.checks.push({name,passed:Boolean(passed),...(details===undefined?{}:{details})});
const settle=async page=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForTimeout(120);};

function fixture({modern,narrow,wrapping,nativeSize=32,stretch=false,compact=false,direction='ltr',reverse=false,detailStyle=null}){
  return `<!doctype html><html lang="en" dir="${direction}"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}html{font:15px/1.45 Arial,sans-serif;background:#000;color:#eee;overflow-y:scroll}body{margin:0}.columns{display:flex;margin:0 auto;max-width:1100px;align-items:flex-start}main{width:${narrow?350:620}px;flex:none;border-inline:1px solid #333}aside{width:380px;min-height:800px;padding:20px}.page-header{position:sticky;top:0;z-index:2;background:#000;height:56px;border-bottom:1px solid #333;padding:16px}.post-shell{border-bottom:1px solid #333;padding:14px 16px;position:relative}.post-shell article{margin:0}.post-heading{display:flex;align-items:${stretch?'stretch':'flex-start'};gap:8px}.identity{min-width:0;flex:1}.identity a{display:block;overflow-wrap:anywhere}${compact?'.identity{height:16px;line-height:16px;overflow:hidden}.identity a{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.identity a:not(:first-child){display:none}':''}.post-actions{display:flex;align-items:${stretch?'stretch':'center'};gap:4px;${wrapping?`width:${nativeSize*2+4}px;flex:none;flex-wrap:wrap`:'flex:none;flex-wrap:nowrap'}}.native-button{display:inline-flex;width:${nativeSize}px;height:${stretch?'auto':nativeSize+'px'};min-height:${nativeSize}px;flex:none;align-items:center;justify-content:center;padding:0;border:0;background:transparent;color:#71767b;border-radius:50%}.native-button svg{width:${Math.min(20,nativeSize)}px;height:${Math.min(20,nativeSize)}px;fill:none;stroke:currentColor}.post-text{margin:12px 0;line-height:22px}.engagement{display:flex;gap:45px;height:30px;align-items:center}.engagement button{color:#777;background:none;border:0}a{color:inherit;text-decoration:none}.native-body-link{display:block}#detail{min-height:1500px;padding:25px}.grok-icon{pointer-events:none}[hidden]{display:none!important}
  .columns{direction:ltr}.post-heading{direction:${direction};flex-direction:${reverse?'row-reverse':'row'}}
  ${detailStyle?.gap!==undefined?`.post-heading{gap:${detailStyle.gap}px}.post-actions{gap:${detailStyle.gap}px}`:''}
  ${detailStyle?`.post-heading{align-items:center}.author-area{display:flex;align-items:center;gap:10px;flex:1;min-width:0}.author-area .identity{flex:1;min-width:0;line-height:20px}.author-area .identity a{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.native-avatar{width:40px;height:40px;border-radius:50%;background:#444;flex:none;display:grid;place-items:center}.post-actions{align-self:${detailStyle.align};align-items:center;flex-wrap:nowrap}.native-cta{width:82px;height:32px;border-radius:20px;border:1px solid #777;background:transparent;color:inherit;padding:0;flex:none}.native-icon-group{display:flex;gap:4px;align-items:center;flex:none}`:''}
  ${detailStyle?.nativeMargins?'.native-button[aria-label="Ask Grok"]{margin-inline-start:2px;margin-inline-end:3px}.native-cta{margin-inline-end:2px}':''}
  </style></head><body><div class="columns"><main ${modern?'':'data-testid="primaryColumn"'}><header class="page-header"><nav role="tablist">For you　Following</nav></header><div id="native-list"></div></main><aside ${modern?'':'data-testid="sidebarColumn"'}>Native sidebar</aside></div>
  <script>
  const MODERN=${modern}, WRAPPING=${wrapping}, DETAIL=${JSON.stringify(detailStyle)}, NATIVE_GROK=${JSON.stringify(nativeGrokPaths||'')};
  const icon=(kind)=>'<svg '+(MODERN?'data-icon="'+kind+'"':'')+' viewBox="'+(DETAIL?.nativeInk&&kind==='icon-logo-grok'?'0 0 35 33':'0 0 24 24')+'">'+(DETAIL?.nativeInk?(kind==='icon-logo-grok'?'<g fill="currentColor" stroke="none">'+NATIVE_GROK+'</g>':'<g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></g>'):'<path d="M4 4l16 16M20 4L4 20"/>')+'</svg>';
  const controls=()=>{const native='<button class="native-button" '+(MODERN?'data-slot="xds-button"':'data-testid="grok"')+' aria-label="Ask Grok">'+icon('icon-logo-grok')+'</button><button class="native-button" '+(MODERN?'data-slot="xds-menu-trigger"':'data-testid="caret"')+' aria-label="More">'+icon('icon-more-dots-hor')+'</button>';return '<div class="post-actions">'+(DETAIL?.cta?'<button class="native-cta" aria-label="'+DETAIL.cta+'">'+DETAIL.cta+'</button>':'')+(DETAIL?.nested?'<span class="native-icon-group">'+native+'</span>':native)+'</div>';};
  const post=(i,detail=false)=>{const id=String(1000000000000000+i),url='/Writer/status/'+id;
    const identity='<div class="'+(MODERN?'x-middot-group ':'')+'identity" '+(MODERN?'':'data-testid="User-Name"')+'><a href="/Writer">Long display name for a native timeline author '+i+'</a><a href="/Writer">@Writer</a>'+(!DETAIL?'<a href="'+url+'"><time datetime="2026-10-31T00:00:00Z">1h</time></a>':'')+'</div>';
    const head='<div class="post-heading">'+(DETAIL?'<div class="author-area"><span class="native-avatar" aria-hidden="true">U</span>'+identity+'</div>':identity)+controls()+'</div>';
    const body='<a class="native-body-link" href="'+url+'" data-open="'+i+'"><div class="post-text'+(MODERN?' whitespace-pre-wrap':'')+'" '+(MODERN?'dir="auto"':'data-testid="tweetText"')+'>A fabricated factual claim '+i+'. This native content is long enough to wrap naturally on narrow layouts. '+('Additional native text. '.repeat(i%3+1))+'</div></a>';
    const actions='<div class="engagement"><button '+(MODERN?'data-engagement-action="reply"':'data-testid="reply"')+'>Reply</button><button>Like</button></div>';
    const article='<article '+(!MODERN?'data-testid="tweet"':'')+'>'+head+body+(DETAIL?'<a href="'+url+'"><time datetime="2026-10-31T00:00:00Z">10:00 · October 31, 2026</time></a>':'')+actions+'</article>';
    return MODERN?'<div id="post-'+i+'" class="post-shell" data-navigation-stop '+(detail?'tabindex="-1"':'role="link" tabindex="0" data-href="'+url+'"')+'>'+article+'</div>':article.replace('<article ','<article id="post-'+i+'" class="post-shell" ');
  };
  window.nativeState={savedY:0,frames:[],recording:false};
  const measure=()=>{const target=document.getElementById('post-12'),header=target?.querySelector('.post-heading'),actions=target?.querySelector('.post-actions');return {time:performance.now(),y:scrollY,documentHeight:document.documentElement.scrollHeight,documentWidth:document.documentElement.scrollWidth,targetTop:target?.getBoundingClientRect().top??null,targetHeight:target?.getBoundingClientRect().height??null,headerHeight:header?.getBoundingClientRect().height??null,actionsHeight:actions?.getBoundingClientRect().height??null,actionsWidth:actions?.getBoundingClientRect().width??null,actionChildren:actions?.children.length??null,hosts:document.querySelectorAll('superx-post-check').length};};
  window.measureNative=measure;
  function mountFeed(){document.getElementById('native-list').innerHTML=Array.from({length:28},(_,i)=>post(i)).join('');document.querySelector('.page-header').innerHTML='<nav role="tablist">For you　Following</nav>';}
  function mountDetail(i){document.getElementById('native-list').innerHTML='<div id="detail">'+post(i,true)+'</div>';document.querySelector('.page-header').innerHTML='<button id="native-back">Back</button>';document.getElementById('native-back').onclick=()=>history.back();scrollTo(0,0);}
  function recordFrames(){nativeState.frames=[];nativeState.recording=true;let remaining=35;function frame(){nativeState.frames.push(measure());if(--remaining>0)requestAnimationFrame(frame);else nativeState.recording=false;}requestAnimationFrame(frame);}
  document.addEventListener('click',e=>{const link=e.target.closest('[data-open]');if(!link)return;e.preventDefault();nativeState.savedY=scrollY;history.replaceState({view:'feed',y:scrollY},'', '/home');history.pushState({view:'detail',index:Number(link.dataset.open)},'',link.getAttribute('href'));mountDetail(Number(link.dataset.open));});
  addEventListener('popstate',e=>{if(e.state?.view==='detail'){mountDetail(e.state.index);recordFrames();return;}mountFeed();scrollTo(0,e.state?.y??nativeState.savedY);recordFrames();});
  if(DETAIL){history.replaceState({view:'detail',index:12},'', '/Writer/status/1000000000000012');mountDetail(12);}else{history.replaceState({view:'feed',y:0},'', '/home');mountFeed();}
  </script></body></html>`;
}

function mock(initial){
  const listeners=[],qa=window.qa={sent:[],settings:initial};
  const configuration=()=>({type:'CONFIG',settings:XGrokCore.normalizeSettings(qa.settings),ready:true,keyState:'ready',historyEnabled:false,historyEpoch:0,taskRevision:0,triggerGuideCompleted:true,triggerGuidePersisted:true,credentialIdentity:'',used:0,collapsed:false});
  qa.emit=message=>listeners.forEach(fn=>fn(message));
  qa.configure=patch=>{qa.settings={...qa.settings,...patch};qa.emit(configuration());};
  window.chrome={runtime:{id:'back-navigation-local-fixture',getManifest:()=>({version:'1.1.5-test'}),getURL:name=>'https://fixture.superx.test/extension/'+name,onMessage:{addListener(){}},sendMessage:async message=>({ok:true}),connect:()=>{
    const port={onMessage:{addListener:fn=>listeners.push(fn)},onDisconnect:{addListener(){}},disconnect(){},postMessage(message){qa.sent.push(structuredClone(message));
      if(message.type==='LOOKUP_CACHED_POST')queueMicrotask(()=>qa.emit({type:'RESULT',requestId:message.requestId,cacheLookup:true,cached:true,result:{provider:'api',text:'A cached factual finding for this synthetic post.',sources:[],verificationStatus:'completed',usage:{total_tokens:40}}}));
      if(message.type==='PING')queueMicrotask(()=>qa.emit({type:'PONG'}));
      if(message.type==='ANALYZE')queueMicrotask(()=>qa.emit({type:'RESULT',requestId:message.requestId,result:{provider:'api',text:'Local fixture only.',sources:[],verificationStatus:'completed'}}));
    }};setTimeout(()=>qa.emit(configuration()),0);return port;
  }},storage:{local:{get:async()=>({})},session:{get:async()=>({}),remove:async()=>{}},onChanged:{addListener(){}}}};
}

let browser;
await mkdir(output,{recursive:true});
function detailGeometry(){
  const article=document.getElementById('post-12'),header=article?.querySelector('.post-heading'),group=article?.querySelector('.post-actions');
  const rectangle=node=>{if(!node)return null;const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,centerX:r.x+r.width/2,centerY:r.y+r.height/2};};
  const grok=article?.querySelector('[aria-label="Ask Grok"]'),more=article?.querySelector('[aria-label="More"]'),cta=article?.querySelector('.native-cta'),host=article?.querySelector('superx-post-check');
  const ink=button=>{const svg=button?.querySelector('svg');if(!svg)return null;const box=svg.getBBox(),matrix=svg.getScreenCTM();if(!matrix)return null;const points=[new DOMPoint(box.x,box.y),new DOMPoint(box.x+box.width,box.y+box.height)].map(point=>point.matrixTransform(matrix));return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),width:Math.abs(points[1].x-points[0].x)};};
  const mark=rectangle(host?.shadowRoot?.querySelector('.symbol'));
  // The two mirrored paths span x=.36364..34.63636 in the 35-wide brand asset.
  // Its internal cutouts do not change this visible outer extent.
  const superxInk=mark?{left:mark.centerX-mark.width*(34.27272/35)/2,right:mark.centerX+mark.width*(34.27272/35)/2,width:mark.width*(34.27272/35)}:null;
  return {article:rectangle(article),header:rectangle(header),group:rectangle(group),grok:rectangle(grok),more:rectangle(more),cta:rectangle(cta),superx:rectangle(host?.shadowRoot?.querySelector('button')),grokInk:ink(grok),moreInk:ink(more),superxInk,iconWidth:grok?.querySelector('svg')?.getBoundingClientRect().width,hostMargins:host?{start:getComputedStyle(host).marginInlineStart,end:getComputedStyle(host).marginInlineEnd}:null,groupChildren:group?.children.length,nativeOrder:[...group?.querySelectorAll('.native-button,.native-cta')||[]].map(node=>node.getAttribute('aria-label')),scrollY,documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth};
}
async function checkSymbolScale(page,name){
  if(opticalScale===null)return;
  const control=page.locator('#post-12 superx-post-check button.post-check');
  if(!await control.count())return;
  const measure=countdown=>{
    const post=document.getElementById('post-12'),host=post.querySelector('superx-post-check'),button=host.shadowRoot.querySelector('button'),base=button.querySelector('.symbol'),progress=button.querySelector('.symbol-progress'),grok=post.querySelector('[aria-label="Ask Grok"] svg');
    if(countdown){button.style.setProperty('--sp-hover-duration','10000ms');button.setAttribute('data-hover-countdown','a');getComputedStyle(progress).animationName;const animation=progress.getAnimations()[0];if(animation)animation.currentTime=5000;}
    const rect=node=>{const r=node.getBoundingClientRect();return {width:r.width,height:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};};
    const mask=node=>{const s=getComputedStyle(node);return [s.maskImage,s.maskSize,s.maskPosition].join('|');};
    const value={base:rect(base),progress:rect(progress),button:rect(button),nativeIcon:rect(grok),sameMask:mask(base)===mask(progress),hoverScale:Number(getComputedStyle(host).getPropertyValue('--sp-hover-scale'))||1,progressOpacity:getComputedStyle(progress).opacity,progressClip:getComputedStyle(progress).clipPath};
    if(countdown){button.removeAttribute('data-hover-countdown');button.style.removeProperty('--sp-hover-duration');}
    return value;
  };
  for(const state of ['idle','hover','countdown']){
    const hovered=state!=='idle';
    if(hovered)await control.hover();else await page.mouse.move(1200,850);
    await page.waitForTimeout(220);const values=await page.evaluate(measure,state==='countdown'),scale=opticalScale*(hovered?values.hoverScale:1);
    check(`${name}: ${state} optical scale matches native icon`,Math.abs(values.base.width-values.nativeIcon.width*scale)<.12&&Math.abs(values.base.height-values.nativeIcon.height*scale)<.12,values);
    check(`${name}: ${state} foreground and countdown share painted frame`,['width','height','cx','cy'].every(key=>Math.abs(values.base[key]-values.progress[key])<.12)&&values.sameMask,values);
    check(`${name}: ${state} symbol remains centered in unchanged hitbox`,Math.abs(values.base.cx-values.button.cx)<.12&&Math.abs(values.base.cy-values.button.cy)<.12,values);
    if(state==='countdown')check(`${name}: active countdown is painted in the same frame`,Number(values.progressOpacity)===1&&!/100%/.test(values.progressClip),values);
    if(state==='hover'&&/^detail\/(?:legacy|modern)\/flex-start\/icons\/ltr$/.test(name)){const file=path.join(output,`${name.includes('/modern/')?'modern':'legacy'}-detail-icons-hover.png`);await page.screenshot({path:file});report.screenshots.push(file);}
  }
  await page.mouse.move(1200,850);
}
try{
  try{browser=await playwright.chromium.launch({channel:'msedge',headless:true});}catch{browser=await playwright.chromium.launch({headless:true});}
  if(detailControls){
    const standardVariants=[
      {align:'flex-start'}, {align:'center'},
      {align:'flex-start',cta:'Subscribe'}, {align:'center',cta:'Follow'},
      {align:'flex-start',cta:'Subscribe',nested:true}, {align:'center',cta:'Follow',nested:true},
      {align:'flex-start',cta:'Subscribe',direction:'rtl'}, {align:'flex-start',cta:'Follow',reverse:true}
    ];
    const spacingLayouts=[
      {align:'flex-start'},
      {align:'flex-start',cta:'Subscribe'},
      {align:'flex-start',cta:'Subscribe',nested:true},
      {align:'flex-start',cta:'Subscribe',direction:'rtl'},
      {align:'flex-start',cta:'Subscribe',nested:true,direction:'rtl'},
      {align:'flex-start',cta:'Follow',reverse:true}
    ];
    const spacingVariants=[
      ...[0,4,8,12].flatMap(gap=>spacingLayouts.map(item=>({...item,gap}))),
      ...spacingLayouts.map(item=>({...item,gap:8,narrow:true})),
      ...spacingLayouts.slice(0,3).map(item=>({...item,gap:8,nativeSize:32})),
      ...spacingLayouts.map(item=>({...item,gap:4,nativeMargins:true}))
    ];
    const inkVariants=[{align:'flex-start',gap:8,nativeInk:true},{align:'flex-start',cta:'Subscribe',gap:12,nativeInk:true,nativeMargins:true},{align:'flex-start',cta:'Subscribe',nested:true,gap:8,nativeInk:true},{align:'flex-start',cta:'Subscribe',gap:12,nativeSize:32,nativeInk:true}];
    const variants=spacing?(nativeInkSpacing?inkVariants:spacingContrary?[{align:'flex-start',nested:true,reverse:true,gap:8},{align:'flex-start',nested:true,reverse:true,gap:8,direction:'rtl'}]:spacingFocus?spacingVariants.filter(item=>item.gap===8&&!item.narrow&&!item.nativeSize&&!item.nativeMargins&&!item.direction&&!item.reverse):spacingVariants):standardVariants;
    for(const modern of [false,true])for(const variant of detailCapture?variants.filter(item=>item.align==='flex-start'&&!item.nested&&!item.direction&&!item.reverse&&(!item.cta||item.cta==='Subscribe')):variants){
      const name=`detail/${modern?'modern':'legacy'}/${variant.align}/${variant.cta||'icons'}${variant.nested?'/nested':''}/${variant.direction||'ltr'}${variant.reverse?'/reverse':''}${spacing?`/gap-${variant.gap}/${variant.narrow?'narrow':'wide'}/${variant.nativeSize||20}${variant.nativeMargins?'/native-margins':''}`:''}`;
      const context=await browser.newContext({viewport:{width:1280,height:900}});
      await context.addInitScript(mock,{provider:'api',enabled:true,triggerMode:'custom',dwellMs:30000,customTriggers:{manual:true,buttonHover:false,postHover:false,detailMain:false,detailReplies:false}});
      await context.route('**/*',async route=>{const url=new URL(route.request().url());
        if(url.hostname==='x.com'&&route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:fixture({modern,nativeSize:variant.nativeSize||20,narrow:variant.narrow||false,detailStyle:variant,direction:variant.direction||'ltr',reverse:variant.reverse||false})});
        if(url.hostname==='fixture.superx.test'&&url.pathname==='/extension/assets/superx-symbol.svg')return route.fulfill({contentType:'image/svg+xml',body:await readFile(path.join(root,'extension/assets/superx-symbol.svg'))});
        report.externalRequests.push(url.origin+url.pathname);return route.abort();
      });
      const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push({name,error:error.message}));
      try{
        await page.goto('https://x.com/Writer/status/1000000000000012');const native=await page.evaluate(detailGeometry);
        for(const file of scriptNames)await page.addScriptTag({content:sources[file]});await settle(page);
        const actual=await page.evaluate(detailGeometry),sx=actual.superx,grok=actual.grok,more=actual.more,cta=actual.cta;
        check(name+': SuperX exists',Boolean(sx));
        if(sx&&grok){
          const centerDelta=Math.abs(sx.centerY-grok.centerY),gap=Math.min(Math.abs(sx.right-grok.left),Math.abs(grok.right-sx.left));
          const between=Boolean(cta&&cta.centerX>Math.min(sx.centerX,grok.centerX)&&cta.centerX<Math.max(sx.centerX,grok.centerX));
          check(name+': SuperX and Grok share center Y',centerDelta<=1,{centerDelta,actual});
          check(name+(spacingContrary?': SuperX remains outside the conflicting-direction native group':': SuperX is adjacent to Grok with no CTA between'),(spacingContrary||nativeInkSpacing||gap<=12)&&!between,{gap,between,actual});
          check(name+': native action group does not wrap',Math.abs(grok.centerY-more.centerY)<=1&&Math.abs(actual.group.height-native.group.height)<=1,{native,actual});
          check(name+': native header and post heights unchanged',Math.abs(actual.header.height-native.header.height)<=1&&Math.abs(actual.article.height-native.article.height)<=1,{native,actual});
          check(name+': native Grok vertical placement unchanged',Math.abs((actual.grok.top-actual.header.top)-(native.grok.top-native.header.top))<=1,{native,actual});
          check(name+': native button order is preserved',JSON.stringify(native.nativeOrder)===JSON.stringify(actual.nativeOrder));
          if(!variant.cta)check(name+': plain icon group retains only its native pair',actual.groupChildren===native.groupChildren,{before:native.groupChildren,after:actual.groupChildren});
          if(spacing){
            const separation=(a,b)=>Math.max(a.left,b.left)-Math.min(a.right,b.right);
            const baseGap=Math.min(6,Math.max(4,Math.round(actual.iconWidth*.3))),grokGap=separation(sx,grok),ctaGap=cta?separation(sx,cta):null,expectedCTAGap=baseGap+(grok.width-actual.iconWidth)/2;
            const controls=[['SuperX',sx],['Grok',grok],['More',more],...(cta?[['CTA',cta]]:[])],overlaps=[];
            for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const [aName,a]=controls[i],[bName,b]=controls[j];if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>.2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.2)overlaps.push([aName,bName]);}
            check(name+': action hitboxes never overlap',overlaps.length===0,{overlaps,actual});
            if(nativeInkSpacing){
              const referenceInkGap=separation(native.grokInk,native.moreInk),actualInkGap=separation(actual.superxInk,actual.grokInk),ctaInkGap=cta?separation(actual.superxInk,cta):null;
              check(name+': visible SuperX/Grok gap matches native Grok/More',Math.abs(actualInkGap-referenceInkGap)<=.5,{referenceInkGap,actualInkGap,actual,native});
              if(cta)check(name+': visible CTA/SuperX gap matches native Grok/More',Math.abs(ctaInkGap-referenceInkGap)<=.5,{referenceInkGap,ctaInkGap,actual,native});
            }else{
              if(!spacingContrary)check(name+': Grok-side spacing uses the same balanced target',Math.abs(grokGap-baseGap)<=.2,{grokGap,expected:baseGap,actual});
              if(cta)check(name+': CTA-side spacing includes native icon padding',Math.abs(ctaGap-expectedCTAGap)<=.2,{ctaGap,expected:expectedCTAGap,actual});
            }
            check(name+': native icons and CTA keep their hitbox sizes',[['grok',native.grok],['more',native.more],...(cta?[['cta',native.cta]]:[])].every(([key,reference])=>Math.abs(actual[key].width-reference.width)<=.2&&Math.abs(actual[key].height-reference.height)<=.2),{native,actual});
            check(name+': no horizontal document overflow',actual.documentWidth===native.documentWidth,{native,actual});
            for(let repeat=0;repeat<3;repeat++){await page.evaluate(()=>qa.configure({}));await settle(page);}
            const repeated=await page.evaluate(detailGeometry);
            check(name+': repeated reconciliation does not accumulate spacing or movement',['header','group','grok','more','superx',...(cta?['cta']:[])].every(key=>['left','top','width','height'].every(axis=>Math.abs(actual[key][axis]-repeated[key][axis])<=.2)),{actual,repeated});
            const representative=(nativeInkSpacing||variant.gap===8&&!variant.nativeMargins)&&!variant.direction&&!variant.reverse&&variant.nativeSize!==32;
            if(representative){const file=path.join(output,`${modern?'modern':'legacy'}-balanced-${variant.cta?(variant.nested?'nested-subscribe':'subscribe'):'icons'}-${variant.narrow?'narrow':'wide'}.png`);await page.screenshot({path:file});report.screenshots.push(file);}
          }
          if(!spacing&&variant.align==='flex-start'&&!variant.nested&&!variant.direction&&!variant.reverse&&(!variant.cta||variant.cta==='Subscribe')){const file=path.join(output,`${modern?'modern':'legacy'}-detail-${variant.cta?'subscribe':'icons'}.png`);await page.screenshot({path:file});report.screenshots.push(file);}
          await checkSymbolScale(page,name);
          report.cases.push({name,modern,variant,native,actual,centerDelta,gap,between});
          console.log(JSON.stringify({name,centerDelta,gap,between}));
        }
        const sent=await page.evaluate(()=>qa.sent.filter(m=>['ANALYZE','ANALYZE_DRAFT','GENERATE_COMMENTS'].includes(m.type)));
        check(name+': cached detail display starts no generation',sent.length===0,sent);
      }catch(error){check(name,false,String(error.stack||error));}
      await context.close();
    }
  }else{
  const layoutProfiles=[{nativeSize:32,narrow:false,wrapping:true},{nativeSize:32,narrow:true,wrapping:false},{nativeSize:16,narrow:true,wrapping:false,compact:true,direction:'rtl'},{nativeSize:16,narrow:true,wrapping:false,compact:true,reverse:true},{nativeSize:16,narrow:true,wrapping:false,compact:true,direction:'rtl',reverse:true}];
  const profiles=captureOnly?[{nativeSize:16,narrow:true,wrapping:false,compact:true}]:focus?[{nativeSize:16,narrow:true,wrapping:false,compact:true},{nativeSize:20,narrow:true,wrapping:false,compact:true,stretch:true}]:layoutFocus?layoutProfiles:[{nativeSize:32,narrow:false,wrapping:false},{nativeSize:32,narrow:false,wrapping:true},{nativeSize:20,narrow:true,wrapping:false,compact:true},{nativeSize:16,narrow:true,wrapping:false,compact:true},{nativeSize:20,narrow:true,wrapping:false,compact:true,stretch:true}];
  for(const modern of [false,true])for(const profile of profiles)for(const mode of captureOnly?['custom']:focus||layoutFocus?['custom','paused']:['native','custom','custom-no-button','paused','automatic']){
    const {narrow,wrapping,nativeSize,stretch,compact,direction='ltr',reverse=false}=profile;
    const name=`${modern?'modern':'legacy'}/${narrow?'narrow':'wide'}/${wrapping?'wrap':'nowrap'}/${nativeSize}${stretch?'-stretch':''}/${direction}${reverse?'-reverse':''}/${mode}`;
    const context=await browser.newContext({viewport:{width:1280,height:900}});
    const settings={provider:'api',enabled:mode!=='paused',triggerMode:mode==='paused'?'paused':mode==='automatic'?'automatic':'custom',dwellMs:30000,customTriggers:{manual:mode!=='custom-no-button',buttonHover:false,postHover:false,detailMain:false,detailReplies:false}};
    if(mode!=='native')await context.addInitScript(mock,settings);
    await context.route('**/*',async route=>{const url=new URL(route.request().url());
      if(url.hostname==='x.com'&&route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:fixture({modern,...profile})});
      if(url.hostname==='fixture.superx.test'&&url.pathname==='/extension/assets/superx-symbol.svg')return route.fulfill({contentType:'image/svg+xml',body:await readFile(path.join(root,'extension/assets/superx-symbol.svg'))});
      report.externalRequests.push(url.origin+url.pathname);return route.abort();
    });
    const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push({name,error:error.message}));
    try{
      await page.goto('https://x.com/home');
      const native=await page.evaluate(()=>measureNative());
      if(mode!=='native')for(const file of scriptNames)await page.addScriptTag({content:sources[file]});
      await settle(page);
      const initial=await page.evaluate(()=>{const target=document.getElementById('post-12');scrollTo(0,target.getBoundingClientRect().top+scrollY-100);return measureNative();});
      await settle(page);const before=await page.evaluate(()=>measureNative());
      await checkSymbolScale(page,name);
      const capture=async stage=>{const file=path.join(output,`${modern?'modern':'legacy'}-${stage}.png`);await page.screenshot({path:file});report.screenshots.push(file);};
      if(captureOnly)await capture('before');
      await page.locator('#post-12 [data-open]').click();await settle(page);
      check(name+': enters native detail route',/\/Writer\/status\//.test(new URL(page.url()).pathname));
      await page.goBack();await page.waitForFunction(()=>!nativeState.recording);await settle(page);
      const back=await page.evaluate(()=>({after:measureNative(),frames:nativeState.frames,savedY:nativeState.savedY,sent:window.qa?.sent||[]}));
      if(captureOnly)await capture('back');
      await page.goForward();await settle(page);check(name+': native forward returns to detail',/\/Writer\/status\//.test(new URL(page.url()).pathname));
      await page.goBack();await page.waitForFunction(()=>!nativeState.recording);await settle(page);
      const second=await page.evaluate(()=>({after:measureNative(),frames:nativeState.frames,sent:window.qa?.sent||[]}));
      const frameYs=back.frames.map(f=>f.y),range=Math.max(...frameYs)-Math.min(...frameYs),drift=Math.abs(back.after.targetTop-before.targetTop),finalDrift=Math.abs(second.after.targetTop-before.targetTop);
      const generations=second.sent.filter(m=>['ANALYZE','ANALYZE_DRAFT','GENERATE_COMMENTS'].includes(m.type));
      check(name+': no duplicate generation while restoring cached findings',generations.length===0,generations.map(m=>m.type));
      check(name+': restored anchor does not drift',drift<=1&&finalDrift<=1,{drift,finalDrift,range,before,after:back.after});
      check(name+': no post-restoration vertical oscillation',range<=1,{range});
      check(name+': control does not grow native header',Math.abs(initial.headerHeight-native.headerHeight)<=1,{native: native.headerHeight,withExtension:initial.headerHeight});
      const beforeBottom=await page.evaluate(()=>{scrollTo(0,document.documentElement.scrollHeight);return measureNative();});
      const lastControl=page.locator('#post-27 superx-post-check button.post-check');
      if(await lastControl.count()){
        await lastControl.evaluate(button=>button.focus({preventScroll:true}));const box=await lastControl.boundingBox();if(box)await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
      }
      await settle(page);const afterBottom=await page.evaluate(()=>measureNative());
      check(name+': hover/focus creates no document overflow',beforeBottom.documentHeight===afterBottom.documentHeight&&beforeBottom.documentWidth===afterBottom.documentWidth,{beforeBottom,afterBottom});
      check(name+': native actions retain their own geometry',Math.abs(initial.actionsHeight-native.actionsHeight)<=1&&Math.abs(initial.actionsWidth-native.actionsWidth)<=1&&initial.actionChildren===native.actionChildren,{native:{height:native.actionsHeight,width:native.actionsWidth,children:native.actionChildren},actual:{height:initial.actionsHeight,width:initial.actionsWidth,children:initial.actionChildren}});
      report.cases.push({name,modern,...profile,mode,native,initial,before,back:{...back,sent:undefined},second:{...second,sent:undefined},range,drift,finalDrift,generations:generations.length,beforeBottom,afterBottom});
      console.log(JSON.stringify({name,range,drift,finalDrift,headerGrowth:initial.headerHeight-native.headerHeight,generations:generations.length}));
    }catch(error){check(name,false,String(error.stack||error));}
    await context.close();
  }
  }
}finally{await browser?.close();}
check('no live network requests',report.externalRequests.length===0,report.externalRequests);
check('no uncaught page errors',report.pageErrors.length===0,report.pageErrors);
report.passed=report.checks.filter(item=>item.passed).length;report.failed=report.checks.length-report.passed;
await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,failed:report.failed,cases:report.cases.map(({name,range,drift,finalDrift,generations})=>({name,range,drift,finalDrift,generations})),pageErrors:report.pageErrors,externalRequests:report.externalRequests,output},null,2));
if(report.failed)process.exitCode=1;
