(function () {
  'use strict';
  if (globalThis.__grokFirstLoaded) return;
  globalThis.__grokFirstLoaded = true;
  const workerNonce = new URLSearchParams(location.hash.slice(1)).get('xgrok-worker');
  // Old releases left marked worker pages behind. They must never start a new
  // request after upgrading to the API-only release.
  if (workerNonce) return;

  const Core = XGrokCore, Layout = GrokFirstOverlayLayout, UI = GrokFirstUI;
  let xUILanguage = UI.normalizeLanguage(document.documentElement.getAttribute('lang') || navigator.language || 'en');
  let uiLanguage = UI.resolveLanguage('auto',xUILanguage);
  const t = (key, vars) => UI.t(key, uiLanguage, vars);
  let settings = Core.DEFAULT_SETTINGS, providerReady = false, connected = false, port, used = 0, limited = false, pauseReason = '', collapsed = false;
  let lastPath = location.pathname, scanTimer, reconnectTimer, handshakeTimer, needsPageRefresh = false;
  let surfaceBlocked = false;
  let hasConfig=false,workerSleeping=false,awaitingConfig=false,reconnectFailures=0;
  const wakeActions=new Map(),wakeControls=new Map();
  const entries = new Map(), requests = new Map(), visible = new Set();
  const historySeen = new Set(),historyPending=new Map();
  let historyEnabled = true, historyEpoch = 0, historyLoaded = false,historyRetryAt=0;
  const queue = new Core.BoundedPostQueue({capacity:Infinity});
  // The full-height rail and aligned rows are out of flow. X's columns and
  // articles remain untouched.
  const overlay = document.createElement('grok-first-overlay');
  overlay.id = 'grokfirst-overlay';
  overlay.hidden = true;
  overlay.dataset.version=chrome.runtime.getManifest?.()?.version||'development';
  const overlayShadow = overlay.attachShadow({mode:'open'});
  const overlayStyle = document.createElement('style');
  const symbolURL=chrome.runtime.getURL('assets/superx-symbol.svg');
  overlayStyle.textContent = `
    :host{all:initial;position:fixed;inset:0;display:block;overflow:hidden;pointer-events:none;z-index:2;contain:layout style paint;isolation:isolate;}
    :host([hidden]){display:none!important;}
    .rail{position:absolute;box-sizing:border-box;pointer-events:auto;background:var(--gf-bg,#000);}
    /* Keep this edge above the opaque header and rows. The rail itself must not
       create a stacking context, so the line remains continuous at the corner. */
    .rail::after{content:'';position:absolute;top:0;bottom:0;right:0;width:0;border-right:1px solid var(--gf-border,#2f3336);z-index:3;pointer-events:none;}
    .rail-head{position:absolute;z-index:2;display:flex;align-items:center;gap:6px;min-width:0;box-sizing:border-box;padding:0 12px;overflow:hidden;background:var(--gf-bg,#000);color:var(--gf-fg,#e7e9ea);border-bottom:1px solid var(--gf-border,#2f3336);font:700 17px/20px var(--gf-font,system-ui);pointer-events:auto;}
    .rail-head strong{display:flex;align-items:center;gap:7px;flex:1;min-width:0;overflow:hidden;white-space:nowrap;}.rail-brand-name{min-width:0;overflow:hidden;text-overflow:ellipsis;}.brand-symbol{display:block;flex:none;width:20px;height:20px;background-color:currentColor;-webkit-mask:url(${JSON.stringify(symbolURL)}) center/contain no-repeat;mask:url(${JSON.stringify(symbolURL)}) center/contain no-repeat;mask-mode:alpha;}.rail-head button,.rail-expand{display:flex;align-items:center;justify-content:center;box-sizing:border-box;height:32px;font:400 13px/20px var(--gf-font,system-ui);padding:0 8px;border:0;background:transparent;color:var(--gf-accent,#1d9bf0);cursor:pointer;flex-shrink:0;}.rail-head button:hover,.rail-language:hover,.rail-expand:hover{background:rgba(127,127,127,.12);}.rail-head button:focus-visible,.rail-language:focus-visible,.rail-expand:focus-visible{outline:2px solid var(--gf-accent,#1d9bf0);outline-offset:-2px;}
    .rail-language-control{position:relative;width:104px;max-width:35%;min-width:0;flex-shrink:1;height:32px;}.rail-language{appearance:none;box-sizing:border-box;width:100%;height:32px;font:400 13px/20px var(--gf-font,system-ui);color:var(--gf-fg,#e7e9ea);color-scheme:var(--gf-scheme,dark);background:transparent;border:0;min-width:0;padding:0 26px 0 8px;text-align:right;text-align-last:right;cursor:pointer;}.rail-language option{text-align:start;text-align-last:auto;background:var(--gf-bg,#000);color:var(--gf-fg,#e7e9ea);}.language-chevron{position:absolute;top:50%;right:8px;transform:translateY(-50%);width:12px;height:12px;color:var(--gf-muted,#71767b);pointer-events:none;}.rail-head[data-compact=true] strong{display:none;}.rail-head[data-compact=true] .rail-language-control{flex:1;max-width:none;}
    .rail-head .rail-collapse,.rail-expand{width:32px;padding:0;}.rail-collapse svg,.rail-expand svg{width:18px;height:18px;display:block;}.rail-expand{position:absolute;z-index:2;box-sizing:border-box;border:1px solid var(--gf-border,#2f3336);background:var(--gf-bg,#000);pointer-events:auto;}
    .rail-expand-mark{display:flex;align-items:center;justify-content:center;width:20px;height:20px;color:var(--gf-fg,#e7e9ea);}
    .rail-head .rail-settings,.rail-head .rail-history{width:32px;padding:0;}.rail-settings svg,.rail-history svg{width:18px;height:18px;display:block;}
    .rail[hidden],.rail-head[hidden],.rail-expand[hidden]{display:none!important;}
    .rail-separators{position:absolute;z-index:2;overflow:hidden;pointer-events:none;}
    .rail-separators[hidden]{display:none!important;}
    .rail-separator{position:absolute;left:0;right:0;pointer-events:none;background:var(--gf-border,#2f3336);}
    grok-first-card{position:absolute;z-index:1;display:block;box-sizing:border-box;pointer-events:auto;overflow:hidden;}
    grok-first-card[hidden]{display:none!important;}
  `;
  overlayShadow.append(overlayStyle);
  const rail=node('aside','rail');
  const railHeader=node('header','rail-head'),railBrand=node('strong','rail-brand'),brandMark=node('span','brand-symbol');
  brandMark.setAttribute('aria-hidden','true');railBrand.append(brandMark,node('span','rail-brand-name','SuperX'));railHeader.append(railBrand);
  const railLanguage=node('select','rail-language');
  for(const item of Core.LANGUAGES){const option=node('option','',item.value==='auto'?t('lang.auto').split(' · ')[0]:item.label);option.value=item.value;railLanguage.append(option);}
  railLanguage.value=settings.language;railLanguage.addEventListener('change',()=>{railLanguage.disabled=true;postControl({type:'SET_LANGUAGE',language:railLanguage.value});});
  const railOptions=node('button','rail-settings');railOptions.append(gear());railOptions.addEventListener('click',()=>openSettings());
  const railHistory=node('button','rail-history');railHistory.type='button';
  const historyIcon=document.createElementNS('http://www.w3.org/2000/svg','svg');historyIcon.setAttribute('viewBox','0 0 24 24');historyIcon.setAttribute('fill','none');historyIcon.setAttribute('stroke','currentColor');historyIcon.setAttribute('stroke-width','1.7');historyIcon.setAttribute('aria-hidden','true');
  const historyPath=document.createElementNS('http://www.w3.org/2000/svg','path');historyPath.setAttribute('d','M3 11a9 9 0 1 1 2.6 7.3M3 4v7h7M12 7v5l3 2');historyPath.setAttribute('stroke-linecap','round');historyPath.setAttribute('stroke-linejoin','round');historyIcon.append(historyPath);railHistory.append(historyIcon);railHistory.addEventListener('click',()=>openHistory());
  const railLanguageControl=node('div','rail-language-control'),languageChevron=chevron('down');languageChevron.classList.add('language-chevron');railLanguageControl.append(railLanguage,languageChevron);
  const railCollapse=node('button','rail-collapse');railCollapse.append(chevron('left'));railCollapse.setAttribute('aria-label','收起 SuperX');railCollapse.setAttribute('aria-expanded','true');railCollapse.title='收起右栏，停止新的分析，保留正在生成的结果';railCollapse.addEventListener('click',()=>setCollapsed(true,true));
  const railExpand=node('button','rail-expand'),expandMark=node('span','rail-expand-mark');
  expandMark.setAttribute('aria-hidden','true');expandMark.append(node('span','brand-symbol'));railExpand.append(expandMark);railExpand.setAttribute('aria-label','展开 SuperX');railExpand.setAttribute('aria-expanded','false');railExpand.title='展开 SuperX';railExpand.hidden=true;railExpand.addEventListener('click',()=>setCollapsed(false,true));
  const railSeparators=node('div','rail-separators');railSeparators.setAttribute('aria-hidden','true');
  railHeader.append(railLanguageControl,railHistory,railOptions,railCollapse);overlayShadow.append(rail,railHeader,railExpand,railSeparators);
  refreshHeaderLanguage();
  document.body.append(overlay);
  let layoutFrame = null, themeDirty = true, themeSignature = '', themePrimary = null;
  const observedNativeCells=new Set();
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(()=>scheduleLayout()) : null;
  const observer = new IntersectionObserver(changes=>{
    for(const change of changes) {
      if(change.isIntersecting) visible.add(change.target);
      else {visible.delete(change.target);const entry=entries.get(change.target);if(entry){entry.since=0;entry.pending=false;queue.remove(entry.post.id);if(entry.status==='new')refreshCard(entry);}}
    }
    scheduleLayout();
    tick();
  },{threshold:0});
  const mutations = new MutationObserver(changes=>{
    changes=changes.filter(change=>change.target!==overlay&&!overlay.contains(change.target)&&!change.target?.closest?.('[data-testid="GrokDrawer"], [data-testid="grokDrawer"]'));
    if(!changes.length)return;
    themeDirty=true;
    syncReadingSurface();
    scheduleLayout();
    if(changes.some(change=>change.type!=='attributes'||
        !['class','style','hidden','aria-hidden'].includes(change.attributeName)||affectsDisplayedPostBody(change.target)))scheduleScan();
  });
  mutations.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['href','src','alt','lang','datetime','data-testid','class','style','hidden','aria-hidden','role','aria-modal','open','inert']});
  const themeObserver=new MutationObserver(changes=>{
    themeDirty=true;syncUILanguage();scheduleLayout();
    if(changes.some(change=>change.target===document.documentElement&&['class','style','hidden','aria-hidden'].includes(change.attributeName)))scheduleScan();
  });
  themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['class','style','lang','hidden','aria-hidden']});
  if(document.head)themeObserver.observe(document.head,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['href','media','disabled']});
  for(const event of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(event,()=>{syncReadingSurface();scheduleLayout();});
  window.addEventListener('popstate',()=>{syncReadingSurface();scheduleScan();scheduleLayout();});
  window.addEventListener('scroll',event=>{
    scheduleLayout();
    if(settings.provider==='cli'&&event.target!==overlay&&!overlay.contains(event.target)) {
      for(const entry of entries.values())if(entry.status==='new')entry.since=0;
    }
  },{passive:true,capture:true});
  window.addEventListener('resize',()=>{themeDirty=true;scheduleLayout();},{passive:true});
  window.visualViewport?.addEventListener('resize',scheduleLayout,{passive:true});
  window.visualViewport?.addEventListener('scroll',scheduleLayout,{passive:true});
  connect();
  scheduleScan();
  setInterval(tick,100);
  // A message, rather than an idle open port, keeps the MV3 worker alive during generation.
  setInterval(()=>{if(requests.size && connected)post({type:'PING'});},15000);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) {
      wakeActions.clear();
      // Switching tabs must not discard a response and pay its startup cost
      // again. Stop queued work, but let already-started requests finish.
      pauseUnseenRailQueue();
    }
    else {if(!connected&&!needsPageRefresh)connect();scheduleScan();tick();}
    scheduleLayout();
  });
  window.addEventListener('pagehide',()=>{post({type:'CANCEL_ALL'});try{port?.disconnect();}catch{}});

  function invalidContext(error) {
    try {return needsPageRefresh || !chrome.runtime.id || /extension context invalidated/i.test(String(error?.message || ''));}
    catch {return true;}
  }
  function scheduleReconnect() {
    if(needsPageRefresh || reconnectTimer)return;
    const delay=Math.min(30000,3000*2**Math.min(reconnectFailures++,4));
    reconnectTimer=setTimeout(()=>{reconnectTimer=undefined;if(!document.hidden)connect();},delay);
  }
  function connectionLost(error,sourcePort=port) {
    if(sourcePort && sourcePort!==port)return;
    needsPageRefresh=invalidContext(error);
    // Chrome may suspend an idle MV3 worker. A closed idle port is not an API
    // failure and must not overwrite completed reading or restart paid work.
    const idle=hasConfig&&!awaitingConfig&&!needsPageRefresh&&!error&&!requests.size&&!wakeActions.size&&!wakeControls.size;
    connected=false;awaitingConfig=false;workerSleeping=idle;
    clearTimeout(handshakeTimer);handshakeTimer=undefined;
    if(!idle)providerReady=false;
    const previousPort=port;port=undefined;
    try {previousPort?.disconnect();}catch{/* The old context may already be gone. */}
    railLanguage.disabled=!idle;
    for(const entry of entries.values()) {
      const interrupted=['queued','running'].includes(entry.status)||wakeActions.has(wakeKey(entry,'analysis'));
      if(interrupted){entry.status='error';entry.ui.retry.hidden=false;status(entry,needsPageRefresh?'status.refreshRequired':'status.connectionLost');}
      if(['queued','running'].includes(entry.commentStatus)||wakeActions.has(wakeKey(entry,'comments'))){entry.commentStatus='error';entry.commentError=needsPageRefresh?'status.refreshRequired':'status.connectionLost';}
      if(needsPageRefresh){
        if(entry.status==='done'&&!entry.connectionStatus)entry.connectionStatus={key:entry.statusKey,vars:entry.statusVars};
        status(entry,'status.refreshRequired');
      }
      refreshCard(entry);refreshComments(entry);
    }
    wakeActions.clear();wakeControls.clear();
    requests.clear();queue.clear();refreshHeaderLanguage();scheduleLayout();
    if(needsPageRefresh){clearTimeout(reconnectTimer);reconnectTimer=undefined;}
    else if(!idle)scheduleReconnect();
  }
  function post(message) {
    if(!connected){if(invalidContext())connectionLost();else if(!workerSleeping)scheduleReconnect();return false;}
    try {port.postMessage(message);return true;}catch(error){connectionLost(error);return false;}
  }
  function postControl(message) {
    if(needsPageRefresh)return false;
    if(workerSleeping||awaitingConfig){
      // These are user preferences, not API tasks. Retain the latest value
      // while waking; dispatch it before new analysis uses the old preference.
      wakeControls.set(message.type,message);
      if(!connected)connect();
      return true;
    }
    return post(message);
  }
  function wakeKey(entry,task){return entry.post.id+':'+task;}
  function afterWake(entry,task,action) {
    if(!workerSleeping&&!awaitingConfig)return false;
    if(!providerReady||needsPageRefresh)return false;
    const key=wakeKey(entry,task),identity=Core.apiPostIdentity(entry.post,task==='comments'?undefined:settings),path=location.pathname;
    if(!wakeActions.has(key))wakeActions.set(key,()=>{
      if(entries.get(entry.article)!==entry||path!==location.pathname||
          Core.apiPostIdentity(entry.post,task==='comments'?undefined:settings)!==identity||
          !entry.article.isConnected||!eligibility(entry.article).eligible||document.hidden||collapsed)return;
      action();
    });
    refreshCard(entry);
    if(!connected)connect();
    return true;
  }
  function usableConnection(){return !needsPageRefresh&&providerReady&&(connected||workerSleeping||awaitingConfig);}
  async function openSettings() {
    const message={type:'OPEN_SETTINGS',focus:'api-key'};
    // Settings can add or replace a Key. Restore the feed subscription so its
    // updated CONFIG can reach a tab that previously had no usable credential.
    if(workerSleeping)connect();
    try {
      const result=await chrome.runtime.sendMessage(message);
      if(result?.ok)return;
    }catch(error){if(invalidContext(error)){connectionLost(error);return;}}
    // Older workers only accept this action over their feed port.
    if(!post(message))connectionLost();
  }
  async function openHistory() {
    try { const result=await chrome.runtime.sendMessage({type:'OPEN_HISTORY'});if(result?.ok)return; }
    catch(error){if(invalidContext(error)){connectionLost(error);return;}}
    if(workerSleeping)connect();
    postControl({type:'OPEN_HISTORY'});
  }
  function refreshHeaderLanguage() {
    const direction=uiLanguage==='ar'?'rtl':'ltr';
    rail.setAttribute('lang',uiLanguage);rail.setAttribute('dir',direction);
    railHeader.setAttribute('lang',uiLanguage);railHeader.setAttribute('dir',direction);
    rail.setAttribute('aria-label',t('aria.rail'));railLanguage.setAttribute('aria-label',t('aria.outputLanguage'));
    const auto=Array.from(railLanguage.children).find(option=>option.value==='auto');if(auto)auto.textContent=t('lang.auto').split(' · ')[0];railLanguage.title=t(settings.language==='auto'?'lang.auto':'aria.outputLanguage');
    railOptions.setAttribute('aria-label',t('common.settings'));railOptions.title=t(needsPageRefresh?'status.refreshRequired':!providerReady?(settings.provider==='cli'?'cli.setup':'common.enterKey'):'common.settings');
    railHistory.setAttribute('aria-label',t('common.history'));railHistory.title=t('common.history');
    railCollapse.setAttribute('aria-label',t('common.collapse'));railCollapse.title=t('tooltip.collapse');
    railExpand.setAttribute('aria-label',t('common.expand'));railExpand.title=t('tooltip.expand');
    railHeader.title=t('tooltip.apiMode',{count:settings.apiConcurrency});
  }
  function syncUILanguage() {
    const observed=UI.normalizeLanguage(document.documentElement.getAttribute('lang') || navigator.language || 'en');
    if(observed!==xUILanguage){xUILanguage=observed;post({type:'UI_LANGUAGE',language:xUILanguage});}
    const language=UI.resolveLanguage(settings.interfaceLanguage,xUILanguage);
    if(language===uiLanguage)return;
    uiLanguage=language;refreshHeaderLanguage();
    for(const entry of entries.values()){refreshCard(entry);refreshComments(entry);}
  }
  function renderStatusText(entry,key,vars={}) {
    const target=entry.ui.status;
    if(key==='status.refreshRequired') {
      const marker='\uFFFC',parts=t('status.refreshRequiredAction',{refresh:marker}).split(marker),button=node('button','status-settings',t('common.refreshPage'));
      button.type='button';button.addEventListener('click',()=>location.reload());
      target.replaceChildren(document.createTextNode(parts[0]),button,document.createTextNode(parts.slice(1).join(marker)));return;
    }
    if(key!=='status.needsKey'){target.replaceChildren(document.createTextNode(t(key,vars)));return;}
    // Keep the translated sentence intact while making its Settings word an
    // actual keyboard-accessible control. The marker never becomes page text.
    const marker='\uFFFC',template=t('status.needsKeyAction',{settings:marker});
    const parts=template.split(marker),button=node('button','status-settings',t('common.settings'));
    button.type='button';button.title=t('common.enterKey');
    button.addEventListener('click',()=>openSettings());
    target.replaceChildren(document.createTextNode(parts[0]),button,document.createTextNode(parts.slice(1).join(marker)));
  }
  function status(entry,key,vars={}) {entry.statusKey=key;entry.statusVars=vars;renderStatusText(entry,key,vars);syncLoading(entry);refreshVerificationFailure(entry);}
  function note(entry,key) {entry.noteKey=key;entry.ui.note.textContent=key?t(key):'';}
  const verificationFailureKeys={OUTPUT_LIMIT:'verification.outputLimit',INCOMPLETE:'verification.incomplete',CONNECTION:'verification.connection',TIMEOUT:'verification.timeout',LANGUAGE_MISMATCH:'verification.languageMismatch',RATE_LIMIT:'verification.rateLimit',ACCESS:'verification.access',SERVER:'verification.server',UNKNOWN:'verification.unknown'};
  function setVerificationFailure(entry,value,incomplete) {
    const valid=value?.stage==='verify'&&typeof value.code==='string'&&Object.hasOwn(verificationFailureKeys,value.code),code=valid?value.code:'UNKNOWN';
    const failure={stage:'verify',code};
    if(valid) {
      if(['max_output_tokens','content_filter'].includes(value.reason))failure.reason=value.reason;
      if(['API_INCOMPLETE','API_STREAM_INTERRUPTED','API_STREAM_ERROR','API_LANGUAGE_MISMATCH','RATE_LIMIT','API_ERROR','CANCELED','TIMEOUT'].includes(value.errorCode))failure.errorCode=value.errorCode;
      if(Number.isSafeInteger(value.httpStatus)&&value.httpStatus>=100&&value.httpStatus<=599)failure.httpStatus=value.httpStatus;
    }
    entry.verificationFailure=incomplete?failure:null;
    refreshVerificationFailure(entry);
  }
  function refreshVerificationFailure(entry) {
    const failure=entry.verificationFailure;
    entry.ui.status.title=failure?t(verificationFailureKeys[failure.code]):'';
    if(failure) {
      // Only public categories are displayed. Backend messages and arbitrary
      // response fields never enter the preserved-answer diagnostics.
      entry.ui.diagnosticText.textContent=t(verificationFailureKeys[failure.code])+'\n'+JSON.stringify(failure,null,2);
      entry.ui.diagnostics.hidden=false;entry.verificationDiagnostics=true;
    } else if(entry.verificationDiagnostics) {
      entry.ui.diagnosticText.textContent='';entry.ui.diagnostics.hidden=true;entry.verificationDiagnostics=false;
    }
  }
  function syncLoading(entry) {
    const active=['queued','running'].includes(entry.status);
    const verifying=active&&['verification_queued','verify','verification'].includes(entry.phase);
    const loading=active&&!entry.latestText&&!verifying;
    entry.ui.status.classList.toggle('shimmer',loading||verifying);
    entry.ui.thinking.hidden=!loading;entry.ui.thinkingLabel.textContent=t('status.thinking');
    entry.ui.verificationThinking.hidden=!verifying||Boolean(entry.verificationStarted);
    entry.ui.verificationThinkingLabel.textContent=t('status.thinking');
    entry.ui.analysisDivider.hidden=!entry.answerSplit||!(verifying||entry.verificationRendered?.trim());
    entry.ui.box.setAttribute('aria-busy',String(active));
  }
  function errorKey(code) {
    return ({RATE_LIMIT:'status.rateLimited',NEEDS_KEY:'status.needsKey',KEY_MIGRATION_REQUIRED:'status.needsKey',
      CANCELLED:'status.cancelled',RAIL_COLLAPSED:'status.disabled',URL_SEARCH_REQUIRED:'error.urlSearchRequired',API_LANGUAGE_MISMATCH:'error.outputLanguageMismatch'})[code]||'status.failed';
  }
  function requestSnapshot(entry,requestId,task='analysis') {
    return {requestId,task,entry,postSnapshot:entry.post,apiIdentity:Core.apiPostIdentity(entry.post,task==='comments'?undefined:settings),path:location.pathname,provider:settings.provider,
      language:settings.language,apiModel:settings.provider==='cli'?settings.cliModel:settings.apiModel,
      verifyPrompt:settings.verifyPrompt,commentsPrompt:settings.commentsPrompt};
  }
  function setCollapsed(value,persist=false) {
    collapsed=Boolean(value);
    if(collapsed) {
      queue.clear();
      for(const entry of entries.values()){entry.pending=false;entry.since=0;}
      for(const [id,request] of requests)if(request.task==='comments'?request.entry.commentStatus==='queued':request.entry.status==='queued') {
        post({type:'CANCEL',requestId:id});requests.delete(id);
        if(request.task==='comments'){request.entry.commentStatus='error';request.entry.commentError='status.disabled';refreshComments(request.entry);}
        else {request.entry.status='new';refreshCard(request.entry);}
      }
    }
    if(persist)postControl({type:'SET_RAIL_COLLAPSED',collapsed});
    scheduleLayout();if(!collapsed)tick();
  }
  function connect() {
    if(needsPageRefresh||connected)return;
    clearTimeout(reconnectTimer);reconnectTimer=undefined;
    try {
      const nextPort=chrome.runtime.connect({name:'GROKFIRST_FEED'});port=nextPort;connected=true;workerSleeping=false;awaitingConfig=true;
      nextPort.onMessage.addListener(message=>{if(port===nextPort)handleMessage(message);});
      nextPort.onDisconnect.addListener(()=>{if(port===nextPort)connectionLost(undefined,nextPort);});
      handshakeTimer=setTimeout(()=>{if(port===nextPort&&awaitingConfig)connectionLost(new Error('Background configuration timed out'),nextPort);},8000);
      post({type:'UI_LANGUAGE',language:xUILanguage});
    } catch(error){connectionLost(error);}
  }
  function handleMessage(message) {
    if(message.type==='HISTORY_CONFIG') {configureHistory(message.enabled,message.epoch);return;}
    if(message.type==='HISTORY_ACK') {
      const batch=historyPending.get(message.batchId);if(!batch)return;
      historyPending.delete(message.batchId);
      if(batch.epoch!==historyEpoch||message.epoch!==historyEpoch)return;
      if(message.ok!==true){for(const id of batch.ids)historySeen.delete(id);historyRetryAt=Date.now()+5000;}
      return;
    }
    if(message.type==='RAIL_VISIBILITY'){setCollapsed(message.collapsed);return;}
    if(message.type==='CONFIG') {
      hasConfig=true;awaitingConfig=true;workerSleeping=false;reconnectFailures=0;
      clearTimeout(handshakeTimer);handshakeTimer=undefined;
      const nextSettings=Core.normalizeSettings(message.settings),previousOptions={...settings},nextOptions={...nextSettings};
      // Editing prompts affects new requests. Interface language only relabels
      // controls; accepted jobs and visible answers retain their task snapshot.
      for(const field of ['explainPrompt','verifyPrompt','commentsPrompt','interfaceLanguage']){delete previousOptions[field];delete nextOptions[field];}
      const allChanged=JSON.stringify(previousOptions)!==JSON.stringify(nextOptions);
      const presentationOrPromptsOnlyChanged=!allChanged&&JSON.stringify(settings)!==JSON.stringify(nextSettings);
      const previous=JSON.stringify([settings.provider,settings.cliModel,settings.cliWebSearch,settings.apiModel,settings.language,settings.webSearch,settings.xSearch,settings.apiVerification,settings.explanationMode]);
      const wasReady=providerReady;
      settings=nextSettings;
      configureHistory(message.historyEnabled,message.historyEpoch);
      providerReady=Boolean(message.ready);used=message.used || 0;
      syncUILanguage();
      for(const entry of entries.values())if(entry.connectionStatus){
        if(entry.status==='done'&&entry.connectionStatus.key)status(entry,entry.connectionStatus.key,entry.connectionStatus.vars);
        delete entry.connectionStatus;
      }
      if(!Core.LANGUAGES.some(item=>item.value===settings.language)&&!Array.from(railLanguage.children).some(item=>item.value===settings.language)){const option=node('option','',settings.language);option.value=settings.language;railLanguage.append(option);}
      railLanguage.value=settings.language;railLanguage.disabled=false;
      refreshHeaderLanguage();
      const changed=previous!==JSON.stringify([settings.provider,settings.cliModel,settings.cliWebSearch,settings.apiModel,settings.language,settings.webSearch,settings.xSearch,settings.apiVerification,settings.explanationMode]);
      if(!presentationOrPromptsOnlyChanged){queue.clear();limited=false;pauseReason='';}
      if(allChanged || !settings.enabled || (wasReady&&!providerReady)) {
        post({type:'CANCEL_ALL'});requests.clear();
        for(const entry of entries.values()) {
          if(changed||['queued','running'].includes(entry.status)){entry.status='new';entry.pending=false;entry.since=0;entry.result=null;entry.analysisUsage=null;setVerificationFailure(entry,null,false);renderAnswer(entry,'',true);renderSources(entry,[]);note(entry,'');entry.ui.retry.hidden=true;}
          if(changed||['queued','running'].includes(entry.commentStatus)){entry.commentStatus='idle';entry.comments=[];entry.commentUsage=null;refreshComments(entry);}
        }
      }
      if(typeof message.collapsed==='boolean')setCollapsed(message.collapsed);
      awaitingConfig=false;
      for(const [type,control] of wakeControls){
        wakeControls.delete(type);
        if(type==='SET_LANGUAGE'&&control.language===settings.language)continue;
        if(type==='SET_LANGUAGE')awaitingConfig=true;
        if(!post(control))return;
      }
      for(const entry of entries.values())refreshCard(entry);
      scheduleLayout();
      // SET_LANGUAGE is acknowledged by a new CONFIG. Wait for that snapshot
      // so a waking feed cannot bill for an obsolete answer language.
      if(awaitingConfig){railLanguage.disabled=true;handshakeTimer=setTimeout(()=>connectionLost(new Error('Language configuration timed out')),8000);return;}
      const actions=[...wakeActions.values()];wakeActions.clear();
      if(providerReady)for(const action of actions){if(!connected||awaitingConfig)break;action();}
      for(const entry of entries.values())refreshCard(entry);
      scheduleScan();return;
    }
    if(message.type==='FATAL'){
      providerReady=false;queue.clear();requests.clear();
      for(const entry of entries.values()){
        entry.status='error';status(entry,'status.failed');entry.ui.retry.hidden=false;
        if(['queued','running'].includes(entry.commentStatus)){entry.commentStatus='error';entry.commentError='status.failed';refreshComments(entry);}
        refreshCard(entry);
      }
      scheduleLayout();return;
    }
    const request=requests.get(message.requestId);
    if(!request) return;
    const {entry}=request;
    const unchanged=Core.apiPostIdentity(entry.post,request.task==='comments'?undefined:settings)===request.apiIdentity;
    if(!unchanged || !entry.article.isConnected){finishRequest(message);return;}
    if(request.railCancellation&&['ERROR','COMMENT_ERROR'].includes(message.type)&&message.code==='CANCELLED') {
      // The worker confirms that this job never started. A delayed START or
      // RESULT, on the other hand, still belongs to the paid request we retain.
      requests.delete(message.requestId);
      if(request.task==='comments'){entry.commentStatus='error';entry.commentError='status.cancelled';entry.commentUsage=null;refreshComments(entry);}
      else {entry.status='new';entry.pending=false;entry.analysisUsage=null;refreshCard(entry);}
      scheduleLayout();tick();return;
    }
    if(request.task==='comments') {
      if(message.type==='COMMENT_START'){request.railCancellation=false;entry.commentStatus='running';}
      if(message.type==='COMMENT_RESULT'){
        captureUsage(entry,'comments',message,request,Boolean(message.cached),true);
        const values=message.comments;
        if(Array.isArray(values)&&values.length===3&&values.every(text=>typeof text==='string'&&text.trim()&&Array.from(text).length<=280)&&new Set(values).size===3){entry.comments=values;entry.commentStatus='done';}
        else {entry.commentStatus='error';entry.commentError='status.failed';}
      }
      if(message.type==='COMMENT_ERROR'){captureUsage(entry,'comments',message,request,false);entry.commentStatus='error';entry.commentError=errorKey(message.code);}
      refreshComments(entry);
      if(message.type==='COMMENT_RESULT'&&entry.commentStatus==='done'&&entry.ui.box.scrollTo) {
        const end=Math.max(entry.ui.comments.offsetTop+entry.ui.comments.offsetHeight,entry.ui.tokenUsage.offsetTop+entry.ui.tokenUsage.offsetHeight);
        const top=Math.max(0,end-entry.ui.box.clientHeight+16);
        entry.ui.box.scrollTo({top,behavior:globalThis.matchMedia?.('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
      }
      finishRequest(message);scheduleLayout();return;
    }
    if(message.type==='QUEUED'){entry.status='queued';status(entry,'status.queued');}
    if(message.type==='START'){request.railCancellation=false;entry.status='running';used=Math.max(used,message.used||0);status(entry,'status.analyzing');}
    if(message.type==='UPDATE'){
      captureUsage(entry,'analysis',message,request,false);
      entry.status='running';
      const verifying=['verification_queued','verify','verification'].includes(message.phase);
      if(verifying&&!['verification_queued','verify','verification'].includes(entry.phase)) {
        entry.verificationBase=entry.latestText||'';entry.verificationStarted=false;entry.verificationStart=undefined;
      }
      if(message.phase==='verification_queued'&&typeof message.text==='string')entry.verificationBase=message.text;
      if(validVerificationBoundary(message.text,message.verificationStart)) {
        entry.verificationStart=message.verificationStart;
        entry.verificationBase=message.text.slice(0,message.verificationStart-2);
      }
      if(verifying&&message.phase!=='verification_queued') {
        // API progress identifies the actual check text separately from the
        // preserved explanation.
        const checkText=typeof message.verificationText==='string'?message.verificationText:
          typeof message.text==='string'&&message.text.startsWith(entry.verificationBase||'')?
            message.text.slice((entry.verificationBase||'').length):message.text||'';
        if(checkText.trim())entry.verificationStarted=true;
      }
      entry.phase=request.phase=message.phase;
      const phases={starting:'status.analyzing',explain:'status.explaining',verification_queued:'status.verificationQueued',verify:'status.verifying',inline:'status.inline'};
      status(entry,phases[message.phase]||'status.analyzing');
      if(message.text)renderAnswer(entry,message.text);
      else if(verifying&&entry.latestText)renderAnswer(entry,entry.latestText);
      if(message.sources)renderSources(entry,message.sources);
      if(message.warning)note(entry,['explain','verification_queued'].includes(message.phase)?'note.checkIncomplete':'note.possibleErrors');
    }
    if(message.type==='RESULT') {
      captureUsage(entry,'analysis',message.result,request,Boolean(message.cached),true);
      entry.status='done';entry.result=message.result;entry.verificationStart=message.result.verificationStart;
      renderAnswer(entry,message.result.text,true);renderSources(entry,message.result.sources||[]);
      const incomplete=['incomplete','failed'].includes(message.result.verificationStatus);
      setVerificationFailure(entry,message.result.verificationFailure,incomplete);
      const sourceKey=incomplete?'status.incomplete':message.result.searched?'status.searched':'status.unverified';
      entry.cached=Boolean(message.cached);status(entry,sourceKey);
      note(entry,incomplete?'note.preserved':message.result.provider==='cli'?'cli.resultNote':'note.possibleErrors');entry.ui.retry.hidden=false;
      finishRequest(message);
    }
    if(message.type==='ERROR') {
      captureUsage(entry,'analysis',{...message.partialResult,...message},request,false);
      const partialVerification=message.partialResult&&(['incomplete','failed'].includes(message.partialResult.verificationStatus)||message.partialResult.verificationFailure);
      setVerificationFailure(entry,message.partialResult?.verificationFailure,Boolean(partialVerification));
      entry.status='error';entry.errorCode=message.code;status(entry,partialVerification?'status.incomplete':errorKey(message.code));note(entry,'');entry.ui.retry.hidden=false;
      if(message.code==='API_LANGUAGE_MISMATCH'){entry.cached=false;entry.result=null;renderAnswer(entry,'',true);renderSources(entry,[]);}
      if(message.partialResult){entry.verificationStart=message.partialResult.verificationStart;renderAnswer(entry,message.partialResult.text,true);renderSources(entry,message.partialResult.sources||[]);note(entry,'note.preserved');}
      if(!partialVerification) {
        entry.ui.diagnostics.hidden=!message.diagnostics&&!message.error;
        entry.ui.diagnosticText.textContent=JSON.stringify({code:message.code,error:message.error,...message.diagnostics,...(message.usage?{usage:message.usage}:{})},null,2).slice(0,4000);
      }
      if(['NEEDS_KEY','KEY_MIGRATION_REQUIRED'].includes(message.code)){
        providerReady=false;queue.clear();
        for(const pending of entries.values())refreshCard(pending);
      }
      if(message.code==='RATE_LIMIT'){
        limited=true;pauseReason=errorKey(message.code);queue.clear();
        for(const pending of entries.values())if(pending.status==='new')refreshCard(pending);
      }
      finishRequest(message);
    }
    refreshCard(entry);scheduleLayout();
    if(['RESULT','ERROR'].includes(message.type))tick();
  }
  // API launch spacing belongs to the shared background scheduler; this page
  // submits all visible work without waiting for earlier answers to finish.
  function finishRequest(message) { if(!['RESULT','ERROR','COMMENT_RESULT','COMMENT_ERROR'].includes(message.type))return;requests.delete(message.requestId); }
  function affectsDisplayedPostBody(target) {
    // X can keep both bodies mounted and switch visibility through their own
    // or ancestor attributes. Media and metric styling do not change the body.
    const ownBody=body=>{
      const article=body?.closest?.('article[data-testid="tweet"]');
      if(!article)return false;
      for(let cursor=body.parentElement;cursor&&cursor!==article;cursor=cursor.parentElement) {
        const testId=cursor.getAttribute?.('data-testid')||'',tag=String(cursor.tagName||'').toLowerCase();
        if(tag==='article'||/^(?:quoteTweet|quotedTweet|quoted-post|card\.wrapper)$/i.test(testId)||
            (tag!=='a'&&cursor.getAttribute?.('role')==='link'))return false;
      }
      return true;
    };
    const containingBody=target?.closest?.('[data-testid="tweetText"]');
    if(containingBody&&ownBody(containingBody))return true;
    return Array.from(target?.querySelectorAll?.('[data-testid="tweetText"]')||[]).some(ownBody);
  }
  function syncReadingSurface() {
    // X renders its photo viewer above the timeline without removing the feed.
    // Its portal can sit below our body-level stacking context. Hide the whole
    // extension surface rather than competing with X's z-index hierarchy.
    const mediaRoute=/\/status\/\d+\/(?:photo|video)\/\d+(?:\/|$)/.test(location.pathname);
    const modal=[...document.querySelectorAll('[role="dialog"],[aria-modal="true"],dialog[open]')].some(element=>{
      if(element.closest('[hidden],[aria-hidden="true"],[inert]')||!element.getClientRects().length)return false;
      const style=getComputedStyle(element),rect=element.getBoundingClientRect();
      return style.display!=='none'&&style.visibility!=='hidden'&&style.visibility!=='collapse'&&
        rect.width>0&&rect.height>0&&rect.bottom>0&&rect.right>0&&rect.top<innerHeight&&rect.left<innerWidth;
    });
    const blocked=Boolean(mediaRoute||document.fullscreenElement||document.webkitFullscreenElement||modal);
    if(blocked!==surfaceBlocked){
      surfaceBlocked=blocked;
      if(blocked)pauseUnseenRailQueue();
      scheduleScan();scheduleLayout();
    }
    if(blocked)overlay.hidden=true;
    return blocked;
  }
  function scheduleScan(){if(scanTimer)return;scanTimer=setTimeout(()=>{scanTimer=null;scan();},0);}
  function supportedPage(){return !/^\/(?:messages|i\/(?:chat|grok|flow|premium|settings))\b/.test(location.pathname);}
  function scheduleLayout(){if(layoutFrame!==null)return;layoutFrame=requestAnimationFrame(()=>{layoutFrame=null;positionCards();});}
  function opaqueColor(value) {
    if(typeof value!=='string')return null;
    const parts=value.match(/^rgba?\(([^)]+)\)$/i)?.[1]?.replace(/\//g,' ').split(/[,\s]+/).filter(Boolean).map(Number);
    return parts&&parts.length>=3&&parts.every(Number.isFinite)&&(parts.length<4||parts[3]>=0.99)?{value,rgb:parts.slice(0,3)}:null;
  }
  function syncTheme(primary) {
    if(!themeDirty&&themePrimary===primary)return;
    themeDirty=false;themePrimary=primary;
    const computed=element=>element?getComputedStyle(element):{};
    let bg;
    for(let element=primary;element&&!bg;element=element.parentElement)bg=opaqueColor(computed(element).backgroundColor);
    bg ||= opaqueColor(computed(document.body).backgroundColor)||opaqueColor(computed(document.documentElement).backgroundColor);
    const light=bg?bg.rgb[0]*0.2126+bg.rgb[1]*0.7152+bg.rgb[2]*0.0722>160:false;
    const dim=!light&&bg&&Math.max(...bg.rgb)>12;
    const palette=light?{bg:'#fff',fg:'#0f1419',muted:'#536471',border:'#eff3f4'}:dim?{bg:'#15202b',fg:'#f7f9f9',muted:'#8b98a5',border:'#38444d'}:{bg:'#000',fg:'#e7e9ea',muted:'#71767b',border:'#2f3336'};
    const article=primary.querySelector('article[data-testid="tweet"]');
    const text=article?.querySelector('[data-testid="tweetText"]')||article||primary;
    const type=computed(text), primaryStyle=computed(primary), postStyle=computed(article);
    const border=parseFloat(primaryStyle.borderRightWidth)>0?opaqueColor(primaryStyle.borderRightColor):parseFloat(postStyle.borderBottomWidth)>0?opaqueColor(postStyle.borderBottomColor):null;
    const values={
      '--gf-bg':bg?.value||palette.bg,'--gf-fg':opaqueColor(type.color)?.value||palette.fg,
      '--gf-muted':opaqueColor(computed(article?.querySelector('time')).color)?.value||palette.muted,
      '--gf-border':border?.value||palette.border,'--gf-accent':opaqueColor(computed(text?.querySelector('a[href]')).color)?.value||'#1d9bf0',
      '--gf-font':type.fontFamily||'system-ui,-apple-system,"Segoe UI",sans-serif',
      '--gf-size':type.fontSize||'15px','--gf-leading':type.lineHeight&&type.lineHeight!=='normal'?type.lineHeight:'1.4',
      '--gf-scheme':light?'light':'dark'
    };
    const signature=JSON.stringify(values);if(signature===themeSignature)return;themeSignature=signature;
    for(const [name,value] of Object.entries(values))overlay.style.setProperty(name,value);
  }
  function rowGeometry(article) {
    const cell=article.closest('[data-testid="cellInnerDiv"]');
    const own=cell?Array.from(cell.querySelectorAll('article[data-testid="tweet"]')).filter(node=>!node.parentElement?.closest('article[data-testid="tweet"]')):[];
    const frame=own.length===1&&own[0]===article?cell:article,rect=frame.getBoundingClientRect();
    let borderWidth=0,borderColor='var(--gf-border,#2f3336)',borderTop=rect.bottom,borderDistance=Infinity;
    const sample=node=>{
      const box=node.getBoundingClientRect();
      // Full-width native row dividers only; quoted posts and media frames must
      // not create extra rail lines. Keep the border's own fractional position.
      if(box.width<rect.width-2||Math.abs(box.bottom-rect.bottom)>2)return;
      const style=getComputedStyle(node),width=parseFloat(style.borderBottomWidth)||0;
      if(width<=0||style.borderBottomStyle==='none'||style.borderBottomStyle==='hidden')return;
      const distance=Math.abs(box.bottom-rect.bottom);
      if(distance>borderDistance)return;
      borderWidth=width;borderColor=opaqueColor(style.borderBottomColor)?.value||borderColor;
      borderTop=box.bottom-width;borderDistance=distance;
    };
    // Thread cells can contain several articles. Even when the content frame is
    // the article, its divider may belong to a parent within that shared cell.
    for(let node=article;node;node=node.parentElement){sample(node);if(node===(cell||article))break;}
    if(!borderWidth&&cell){
      // X may put a divider on a sibling wrapper. A bounded, shallow walk avoids
      // traversing media/quoted content on every scroll frame.
      let level=[cell],visited=0;
      for(let depth=0;depth<4&&level.length&&visited<48;depth++){
        const next=[];
        for(const parent of level)for(const child of parent.children){
          if(++visited>48)break;
          if(child===article||child.tagName==='ARTICLE')continue;
          sample(child);next.push(child);
        }
        level=next;
      }
    }
    return {rect,borderWidth,borderColor,borderTop};
  }
  function nativeCellSeparators(cell,primaryRect,viewport) {
    const rect=cell.getBoundingClientRect(),lines=[];
    if(rect.height<=0||rect.bottom<=0||rect.top>=viewport.height)return lines;
    const sample=element=>{
      const box=element.getBoundingClientRect();
      // Only native lines spanning the unmodified center column qualify.
      if(box.width<=0||Math.abs(box.left-primaryRect.left)>2||Math.abs(box.right-primaryRect.right)>2)return;
      const style=getComputedStyle(element);
      if(style.display==='none'||style.visibility==='hidden')return;
      for(const edge of ['Top','Bottom']) {
        const width=parseFloat(style['border'+edge+'Width'])||0,color=opaqueColor(style['border'+edge+'Color']);
        if(width>0&&color&&style['border'+edge+'Style']!=='none'&&style['border'+edge+'Style']!=='hidden')
          lines.push({top:edge==='Top'?box.top:box.bottom-width,width,color:color.value});
      }
      // X also paints dividers as thin filled elements inside padded spacers.
      // Their own position, not the enclosing cell's bottom, is the boundary.
      const fill=opaqueColor(style.backgroundColor);
      if(box.height>0&&box.height<=2&&fill&&!(parseFloat(style.borderTopWidth)||parseFloat(style.borderBottomWidth)))
        lines.push({top:box.top,width:box.height,color:fill.value});
    };
    let level=[cell],visited=0;
    for(let depth=0;depth<5&&level.length&&visited<64;depth++) {
      const next=[];
      for(const element of level) {
        if(++visited>64)break;
        if(element!==cell&&(element.tagName==='ARTICLE'||element.getAttribute('data-testid')==='cellInnerDiv'))continue;
        sample(element);next.push(...element.children);
      }
      level=next;
    }
    return lines;
  }
  function syncNativeCells(primary,primaryRect) {
    const cells=new Set();
    if(primary&&primaryRect)for(const cell of primary.querySelectorAll('[data-testid="cellInnerDiv"]')) {
      if(cell.closest('article[data-testid="tweet"]')||cell.querySelector('article[data-testid="tweet"]')||cell.parentElement?.closest('[data-testid="cellInnerDiv"]'))continue;
      const rect=cell.getBoundingClientRect();
      if(rect.width<=0||Math.abs(rect.left-primaryRect.left)>2||Math.abs(rect.right-primaryRect.right)>2)continue;
      cells.add(cell);if(!observedNativeCells.has(cell))resizeObserver?.observe(cell);
    }
    for(const cell of observedNativeCells)if(!cells.has(cell))resizeObserver?.unobserve(cell);
    observedNativeCells.clear();for(const cell of cells)observedNativeCells.add(cell);
    return cells;
  }
  function positionSeparators(items,bounds,viewport,headerHeight,extraLines=[]) {
    const ordered=items.slice().sort((a,b)=>a.rect.top-b.rect.top),lines=[...extraLines];
    for(const item of ordered)if(item.borderWidth>0)lines.push({top:item.borderTop,width:item.borderWidth,color:item.borderColor});
    // Extend the timeline's first-post boundary across the otherwise empty
    // rail above its first answer, including at the initial feed position.
    const first=ordered[0];
    if(first){const width=first.borderWidth||1;lines.push({top:first.rect.top-width,width,color:first.borderColor});}
    const visibleLines=Layout.placeRailSeparators(lines,viewport,{headerHeight});
    const geometry={left:bounds.left,top:headerHeight,width:bounds.width,height:Math.max(0,viewport.height-headerHeight)};
    for(const [name,value] of Object.entries(geometry))if(railSeparators.style[name]!==value+'px')railSeparators.style[name]=value+'px';
    while(railSeparators.children.length>visibleLines.length)railSeparators.children[railSeparators.children.length-1].remove();
    visibleLines.forEach((line,index)=>{
      let rule=railSeparators.children[index];if(!rule){rule=node('div','rail-separator');railSeparators.append(rule);}
      const styles={top:line.top-headerHeight+'px',height:line.width+'px',background:line.color};
      for(const [name,value] of Object.entries(styles))if(rule.style[name]!==value)rule.style[name]=value;
    });
  }
  function headerGeometry(primary,viewport) {
    const tabs=primary.querySelector('[role="tablist"]')||primary.querySelector('[data-testid="grokFirstDemoHeader"]');
    let source=tabs,rect=tabs?.getBoundingClientRect(),borderWidth=1;
    if(rect&&rect.height>=32&&rect.height<=100) {
      for(let node=tabs;node&&node!==primary;node=node.parentElement) {
        const candidate=node.getBoundingClientRect(),width=parseFloat(getComputedStyle(node).borderBottomWidth)||0;
        if(candidate.height>110)break;
        if(width>0&&Math.abs(candidate.bottom-rect.bottom)<2){source=node;rect=candidate;borderWidth=width;break;}
      }
      if(source===tabs)borderWidth=parseFloat(getComputedStyle(source).borderBottomWidth)||0;
      // A partially clipped tab bar keeps its visible bottom edge. Once the
      // source bar is entirely offscreen, dock our controls at the viewport top.
      if(rect.bottom<=0||rect.top>=viewport.height)return {top:0,height:Math.min(53,viewport.height),borderWidth};
      const top=Math.max(0,rect.top),height=Math.max(0,Math.min(viewport.height,rect.bottom)-top);
      return {top,height,borderWidth};
    }
    return {top:0,height:Math.min(53,viewport.height),borderWidth};
  }
  function currentRailBounds() {
    const viewport={width:document.documentElement.clientWidth||innerWidth,height:innerHeight};
    const primary=document.querySelector('[data-testid="primaryColumn"]'),sidebar=document.querySelector('[data-testid="sidebarColumn"]');
    return Layout.railBounds(primary?.getBoundingClientRect(),sidebar?.getBoundingClientRect(),viewport);
  }
  function pauseUnseenRailQueue() {
    // No room for the result means no new paid work. Preserve requests whose
    // START has arrived, and only cancel work that is still waiting to begin.
    queue.clear();
    for(const entry of entries.values()){entry.pending=false;entry.since=0;}
    for(const [id,request] of requests)if(request.task==='comments'?request.entry.commentStatus==='queued':request.entry.status==='queued') {
      if(request.railCancellation)continue;
      request.railCancellation=true;
      // Leave the request attached until cancellation is acknowledged. It may
      // already be running while the START message is still crossing the port.
      post({type:'CANCEL_IF_QUEUED',requestId:id});
    }
  }
  function positionCards() {
    overlay.hidden=syncReadingSurface() || document.hidden || !settings.enabled || !supportedPage();
    if(overlay.hidden){syncNativeCells(null,null);return;}
    // Focusing a descendant can scroll an overflow-hidden ancestor. Only each
    // answer box should scroll; keep the fixed rail and row hosts stationary.
    if(overlay.scrollTop)overlay.scrollTop=0;
    if(overlay.scrollLeft)overlay.scrollLeft=0;
    const items=[],nativeRows=[];
    const geometryByArticle=new Map();
    // Decorations follow all native rows, even when a row has no analysis
    // entry. They never depend on request state or answer content clipping.
    for(const article of document.querySelectorAll('article[data-testid="tweet"]')){
      if(article.parentElement?.closest('article[data-testid="tweet"]'))continue;
      const rect=article.getBoundingClientRect();if(rect.width<=0||rect.height<=0)continue;
      const geometry=rowGeometry(article);geometryByArticle.set(article,geometry);nativeRows.push(geometry);
    }
    for(const entry of entries.values()) {
      if(entry.card.scrollTop)entry.card.scrollTop=0;
      if(entry.card.scrollLeft)entry.card.scrollLeft=0;
      if(!entry.article.isConnected){entry.card.hidden=true;continue;}
      const geometry=geometryByArticle.get(entry.article)||rowGeometry(entry.article);
      items.push({id:entry,...geometry});
    }
    const viewport={width:document.documentElement.clientWidth||innerWidth,height:innerHeight};
    const primary=document.querySelector('[data-testid="primaryColumn"]');
    const sidebar=document.querySelector('[data-testid="sidebarColumn"]');
    const primaryRect=primary?.getBoundingClientRect(),nativeCells=syncNativeCells(primary,primaryRect);
    const bounds=Layout.railBounds(primaryRect,sidebar?.getBoundingClientRect(),viewport);
    rail.hidden=railHeader.hidden=railSeparators.hidden=bounds.hidden||collapsed;railExpand.hidden=bounds.hidden||!collapsed;
    if(bounds.hidden){pauseUnseenRailQueue();for(const item of items)item.id.card.hidden=true;return;}
    syncTheme(primary);
    const header=headerGeometry(primary,viewport),headerHeight=header.top+header.height;
    railHeader.dataset.compact=String(bounds.width<310);
    railHeader.style.borderBottomWidth=header.borderWidth+'px';
    for(const [element,geometry] of [[rail,bounds],[railHeader,{...bounds,top:header.top,height:header.height}],[railExpand,{left:bounds.left,top:header.top,width:32,height:header.height}]])for(const name of ['left','top','width','height']) {
      const value=geometry[name]+'px';if(element.style[name]!==value)element.style[name]=value;
    }
    if(collapsed){for(const item of items)item.id.card.hidden=true;return;}
    const extraLines=[];
    for(const cell of nativeCells)extraLines.push(...nativeCellSeparators(cell,primaryRect,viewport));
    positionSeparators(nativeRows,bounds,viewport,headerHeight,extraLines);
    for(const placement of Layout.placeRailRows(items,viewport,{headerHeight})) {
      const entry=placement.id,card=entry.card;
      card.hidden=placement.hidden;
      if(placement.hidden)continue;
      const geometry={left:bounds.left,top:placement.top,width:bounds.width,height:placement.height};
      for(const name of ['left','top','width','height']) {
        const value=geometry[name]+'px';
        if(card.style[name]!==value)card.style[name]=value;
      }
      // Separators live above every card, so a clipped or overlapping card
      // cannot erase the native row boundary.
      const native=geometryByArticle.get(entry.article),visibleBorder=native?.borderWidth&&native.borderTop>=placement.visibleTop&&native.borderTop<placement.visibleBottom?Math.min(native.borderWidth,placement.visibleBottom-native.borderTop):0;
      const offset=placement.contentOffset+'px',height=Math.max(0,placement.contentHeight-visibleBorder)+'px';
      if(entry.ui.box.style.top!==offset)entry.ui.box.style.top=offset;
      if(entry.ui.box.style.height!==height)entry.ui.box.style.height=height;
    }
    tick();
  }
  function removeEntry(article,entry) {
    observer.unobserve(article);resizeObserver?.unobserve(article);resizeObserver?.unobserve(entry.ui.box);
    visible.delete(article);queue.remove(entry.post.id);
    for(const [id,request] of requests)if(request.entry===entry){post({type:'CANCEL',requestId:id});requests.delete(id);}
    if(entry.answerFrame!==undefined)cancelAnimationFrame(entry.answerFrame);
    entry.card.remove();entries.delete(article);
  }
  function scan() {
    // Opening media is temporary: keep timeline entries, answers and running
    // requests attached to their original posts until the viewer closes.
    if(syncReadingSurface())return;
    if(location.pathname!==lastPath){historySeen.clear();historyPending.clear();historyRetryAt=0;lastPath=location.pathname;queue.clear();post({type:'CANCEL_ALL'});requests.clear();for(const entry of entries.values()){entry.since=0;entry.pending=false;if(['queued','running'].includes(entry.status)){entry.status='new';renderAnswer(entry,'',true);refreshCard(entry);}if(['queued','running'].includes(entry.commentStatus)){entry.commentStatus='error';entry.commentError='status.cancelled';refreshComments(entry);}}}
    for(const [article,entry] of entries)if(!article.isConnected)removeEntry(article,entry);
    if(!supportedPage()){scheduleLayout();return;}
    for(const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      const data=Core.extractPost(article);if(!data){const previous=entries.get(article);if(previous)removeEntry(article,previous);continue;}
      const signature=JSON.stringify([Core.postFingerprint(data),Boolean(data.isPromoted)]);let entry=entries.get(article);
      if(entry&&entry.signature===signature&&entry.card.isConnected)continue;
      if(entry&&entry.post.id===data.id&&(entry.post.text!==data.text||entry.post.language!==data.language))historySeen.delete(data.id);
      const identity=post=>Core.apiPostIdentity(post,settings);
      if(entry&&entry.card.isConnected&&
          Boolean(data.isPromoted)===Boolean(entry.post.isPromoted)&&identity(data)===identity(entry.post)) {
        // All API analysis uses the original URL and survives preview changes. Comment drafts still use
        // the supplied text, so cancel/clear only those when their input changes.
        if(Core.apiPostIdentity(data)!==Core.apiPostIdentity(entry.post)) {
          for(const [id,request] of requests)if(request.entry===entry&&request.task==='comments'){post({type:'CANCEL',requestId:id});requests.delete(id);}
          entry.commentStatus='idle';entry.comments=[];entry.commentUsage=null;refreshComments(entry);
        }
        entry.post=data;entry.signature=signature;continue;
      }
      if(entry)removeEntry(article,entry);
      entry={article,post:data,signature,status:'new',since:0,result:null,commentStatus:'idle',comments:[]};
      const {card,ui}=createCard(entry);entry.card=card;entry.ui=ui;
      overlayShadow.append(card);entries.set(article,entry);observer.observe(article);
      resizeObserver?.observe(article);resizeObserver?.observe(ui.box);
      card.hidden=true;refreshCard(entry);
      if(eligibility(article).eligible)visible.add(article);
    }
    scheduleLayout();tick();
  }
  function refreshCard(entry) {
    entry.ui.box.setAttribute('aria-label',t('aria.result'));
    entry.ui.retry.textContent=t(settings.provider==='cli'&&entry.status==='new'?'cli.understand':'common.retry');entry.ui.generateComments.textContent=t('common.generateComments');
    entry.ui.diagnosticLabel.textContent=t('common.diagnostics');
    if(entry.status==='new') {
      status(entry,!connected&&!workerSleeping?(needsPageRefresh?'status.refreshRequired':'status.connectionLost'):limited?(pauseReason||'status.disabled'):!providerReady?(settings.provider==='cli'?'cli.unavailable':'status.needsKey'):entry.pending?'status.queued':settings.provider==='cli'?(settings.cliAutoAnalyze?'cli.waitDwell':'cli.waitManual'):'status.waiting',{seconds:settings.cliDwellSeconds});
      note(entry,limited?(pauseReason==='status.rateLimited'?'note.rateLimited':'note.settingsRequired'):'');
      entry.ui.retry.hidden=!limited&&settings.provider!=='cli';
    }
    else if(entry.statusKey)status(entry,entry.statusKey,entry.statusVars);
    if(entry.noteKey)entry.ui.note.textContent=t(entry.noteKey);
    if(entry.cached)entry.ui.status.prepend(document.createTextNode(t('status.cached')+' · '));
    entry.ui.retry.disabled=!usableConnection()||!settings.enabled||['queued','running'].includes(entry.status)||wakeActions.has(wakeKey(entry,'analysis'));
    if(!providerReady)entry.ui.retry.hidden=true;
    else if(['done','error'].includes(entry.status))entry.ui.retry.hidden=false;
    refreshComments(entry);syncLoading(entry);refreshUsage(entry);
  }
  function eligibility(article) {
    return Core.visibilityEligibility(article.getBoundingClientRect(),{width:innerWidth,height:innerHeight},{minRatio:0,minVisiblePx:1});
  }
  function tick() {
    if(syncReadingSurface())return;
    recordHistory();
    if(document.hidden || collapsed || !settings.enabled || !providerReady || limited || !supportedPage())return;
    if(currentRailBounds().hidden){pauseUnseenRailQueue();return;}
    if(location.pathname!==lastPath){scheduleScan();return;}
    if(!connected){
      if(workerSleeping&&[...visible].some(article=>{
        const entry=entries.get(article);return entry?.status==='new'&&article.isConnected&&eligibility(article).eligible;
      }))connect();
      return;
    }
    if(awaitingConfig)return;
    const now=Date.now();
    // Obsolete requests must not delay the posts the user is reading.
    // The grace interval avoids cancelling for a brief scroll adjustment.
    for(const [id,running] of requests) {
      const rect=running.entry.article.getBoundingClientRect();
      if(rect.bottom<=0 || rect.top>=innerHeight) {
        running.offscreenSince ||= now;
        const queued=running.task==='comments'?running.entry.commentStatus==='queued':running.entry.status==='queued';
        if(queued||now-running.offscreenSince>=1000) {
          post({type:'CANCEL',requestId:id});requests.delete(id);
          if(running.task==='comments'){running.entry.commentStatus='error';running.entry.commentError='status.cancelled';refreshComments(running.entry);}
          else {
            running.entry.status='new';running.entry.pending=false;running.entry.since=0;
            refreshCard(running.entry);
            if(running.entry.ui.answer.textContent)note(running.entry,'note.cancelled');
          }
        }
      } else running.offscreenSince=0;
    }
    for(const article of visible) {
      const entry=entries.get(article);if(!entry||!article.isConnected)continue;
      const visibility=eligibility(article);
      if(!visibility.eligible){entry.since=0;entry.pending=false;queue.remove(entry.post.id);continue;}
      if(entry.status!=='new')continue;
      if(settings.provider==='cli') {
        const readable=Core.visibilityEligibility(article.getBoundingClientRect(),{width:innerWidth,height:innerHeight}).eligible;
        if(!Core.cliDwellReady(entry,settings,readable,now)){entry.pending=false;queue.remove(entry.post.id);continue;}
      }
      entry.pending=queue.enqueue(entry.post,1/(1+Math.max(0,article.getBoundingClientRect().top)));refreshCard(entry);
    }
    let candidate;
    while((candidate=queue.take())) {
      const entry=[...entries.values()].find(e=>e.post.id===candidate.id&&e.status==='new'&&visible.has(e.article));
      if(!entry)continue;
      if(!eligibility(entry.article).eligible){entry.pending=false;refreshCard(entry);continue;}
      submit(entry,false);
    }
  }
  function configureHistory(enabled,epoch) {
    const nextEpoch=Number.isSafeInteger(epoch)?epoch:historyEpoch;
    if(nextEpoch!==historyEpoch){historyPending.clear();historyRetryAt=0;}
    historyEnabled=enabled!==false;historyEpoch=nextEpoch;historyLoaded=true;
    if(!historyEnabled){historySeen.clear();historyPending.clear();historyRetryAt=0;}
  }
  function recordHistory() {
    // Record visibility independently of paid work, without polling writes for
    // stationary posts. A clear does not immediately re-add the current view.
    if(!historyLoaded||!historyEnabled||!settings.enabled||document.hidden||!supportedPage()){historySeen.clear();historyPending.clear();return;}
    if(location.pathname!==lastPath)return;
    for(const [batchId,batch] of historyPending)if(Date.now()-batch.sentAt>=10000){historyPending.delete(batchId);for(const id of batch.ids)historySeen.delete(id);historyRetryAt=Date.now()+5000;}
    if(Date.now()<historyRetryAt)return;
    const displayed=new Map();
    for(const article of visible){const entry=entries.get(article);if(entry&&article.isConnected&&eligibility(article).eligible)displayed.set(entry.post.id,entry.post);}
    for(const id of historySeen)if(!displayed.has(id))historySeen.delete(id);
    const unseen=[...displayed.values()].filter(item=>!historySeen.has(item.id));
    if(!unseen.length)return;
    if(!connected){if(workerSleeping)connect();return;}
    if(awaitingConfig)return;
    for(let index=0;index<unseen.length;index+=30){
      const posts=unseen.slice(index,index+30),batchId=crypto.randomUUID(),ids=posts.map(item=>item.id);
      historyPending.set(batchId,{ids,epoch:historyEpoch,sentAt:Date.now()});for(const id of ids)historySeen.add(id);
      if(!post({type:'HISTORY_VISIT',posts,historyEpoch,batchId})){historyPending.delete(batchId);for(const id of ids)historySeen.delete(id);historyRetryAt=Date.now()+5000;return;}
    }
  }
  function submit(entry,force) {
    if(syncReadingSurface())return;
    if(force&&afterWake(entry,'analysis',()=>submit(entry,true)))return;
    if(!settings.enabled||!connected||!providerReady||currentRailBounds().hidden)return;
    if(awaitingConfig)return;
    if([...requests.values()].some(r=>r.entry===entry&&r.task==='analysis'))return;
    if(force&&!clearComments(entry))return;
    // Cancelling a comment can synchronously invalidate the shared port.
    if(!connected||!providerReady)return;
    const requestId=crypto.randomUUID();
    entry.pending=false;queue.remove(entry.post.id);entry.status='queued';entry.phase='';entry.verificationBase='';entry.verificationStarted=false;entry.verificationStart=undefined;entry.result=null;entry.cached=false;setVerificationFailure(entry,null,false);status(entry,'status.queued');entry.ui.retry.hidden=true;
    if(force||!entry.ui.answer.textContent)renderAnswer(entry,'',true);
    renderSources(entry,[]);note(entry,'');entry.ui.diagnostics.hidden=true;entry.ui.diagnosticText.textContent='';
    requests.set(requestId,requestSnapshot(entry,requestId));
    entry.analysisUsage=null;captureUsage(entry,'analysis',{},requests.get(requestId),false,true);refreshUsage(entry);
    post({type:'ANALYZE',requestId,post:entry.post,force});scheduleLayout();
  }
  function clearComments(entry) {
    for(const [id,request] of requests)if(request.entry===entry&&request.task==='comments'){
      if(!post({type:'CANCEL',requestId:id}))return false;
      requests.delete(id);
    }
    entry.comments=[];entry.commentUsage=null;entry.commentStatus='idle';entry.commentError='';entry.copyStatusKey='';entry.ui.copyStatus.textContent='';refreshComments(entry);
    return true;
  }
  function generateComments(entry) {
    if(syncReadingSurface())return;
    if(['queued','running'].includes(entry.commentStatus))return;
    if(collapsed||document.hidden||!supportedPage()||currentRailBounds().hidden||!entry.article.isConnected||!eligibility(entry.article).eligible)return;
    if(afterWake(entry,'comments',()=>generateComments(entry)))return;
    if(!connected||!providerReady||awaitingConfig)return;
    const requestId=crypto.randomUUID(),request=requestSnapshot(entry,requestId,'comments');
    request.analysis={text:entry.latestText||'',verificationStatus:entry.result?.verificationStatus||'unverified',warning:entry.result?.warning||'',sources:entry.result?.sources||[]};
    const force=entry.commentStatus==='error'||entry.comments.length>0;
    entry.commentStatus='queued';entry.commentError='';entry.copyStatusKey='';entry.ui.copyStatus.textContent='';requests.set(requestId,request);captureUsage(entry,'comments',{},request,false,true);refreshComments(entry);
    post({type:'GENERATE_COMMENTS',requestId,post:entry.post,analysis:request.analysis,force});scheduleLayout();
  }
  function refreshComments(entry) {
    const ui=entry.ui;if(!ui)return;
    const loading=['queued','running'].includes(entry.commentStatus);
    ui.generateComments.textContent=t(entry.commentStatus==='error'?'common.retryComments':'common.generateComments');
    ui.generateComments.hidden=!usableConnection()||entry.status==='unsupported'||settings.provider==='cli'&&entry.status==='new';ui.generateComments.disabled=loading||!usableConnection()||wakeActions.has(wakeKey(entry,'comments'));
    ui.comments.setAttribute('aria-label',t('aria.comments'));ui.comments.setAttribute('aria-busy',String(loading));
    ui.commentHeading.textContent=t('common.comments');ui.commentHint.textContent=t('comments.copyHint');ui.commentHeading.hidden=ui.commentHint.hidden=!entry.comments.length;
    if(entry.copyStatusKey)ui.copyStatus.textContent=t(entry.copyStatusKey);
    ui.commentStatus.hidden=!loading&&entry.commentStatus!=='error';
    ui.commentStatus.textContent=loading?t(entry.commentStatus==='running'?'comments.loading':'comments.pending'):t(entry.commentError||'status.failed');
    ui.commentStatus.classList.toggle('shimmer',loading);
    for(const item of ui.comments.children){item.setAttribute('aria-label',t('common.copy')+': '+item.textContent);item.title=t('common.copy');}
    ui.comments.hidden=!entry.comments.length;
    refreshUsage(entry);
    // Locale changes update controls only; the suggested text remains in the
    // selected output language and keeps its own direction.
    if(ui.comments.children.length===entry.comments.length&&entry.comments.every((text,i)=>ui.comments.children[i].dataset.text===text))return;
    ui.comments.replaceChildren();
    for(const text of entry.comments){const button=node('button','comment-copy',text);button.dataset.text=text;button.setAttribute('dir','auto');button.setAttribute('aria-label',t('common.copy')+': '+text);button.title=t('common.copy');
      button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(text);entry.copyStatusKey='common.copied';}catch{entry.copyStatusKey='common.copyFailed';}ui.copyStatus.textContent=t(entry.copyStatusKey);});ui.comments.append(button);}
  }
  function tokenCount(value) {return Number.isSafeInteger(value)&&value>=0?value:null;}
  function safeModel(value) {return typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(value)?value:'';}
  function usageFields(value) {
    const usage={};
    for(const key of ['total_tokens','input_tokens','output_tokens'])if(tokenCount(value?.[key])!==null)usage[key]=value[key];
    return usage;
  }
  function usageTotal(usage) {
    if(tokenCount(usage.total_tokens)!==null)return usage.total_tokens;
    return tokenCount(usage.input_tokens)!==null&&tokenCount(usage.output_tokens)!==null?tokenCount(usage.input_tokens+usage.output_tokens):null;
  }
  function captureUsage(entry,task,metadata,request,cached,replace=false) {
    const key=task==='comments'?'commentUsage':'analysisUsage',previous=replace?{}:entry[key]||{};
    const record={...previous,requestedModel:safeModel(request.apiModel),cached};
    if(replace||metadata.usage!==undefined)record.usage=usageFields(metadata.usage);
    if(replace||metadata.usageByStage!==undefined) {
      record.byStage={};
      for(const stage of ['url','inline','explain','verify','comments'])if(metadata.usageByStage?.[stage]&&typeof metadata.usageByStage[stage]==='object')record.byStage[stage]=usageFields(metadata.usageByStage[stage]);
    }
    if(replace||metadata.model!==undefined)record.model=safeModel(metadata.model);
    if(replace||metadata.modelByStage!==undefined) {
      record.models=[];
      for(const stage of ['url','inline','explain','verify','comments']){const model=safeModel(metadata.modelByStage?.[stage]);if(model&&!record.models.includes(model))record.models.push(model);}
    }
    if(typeof metadata.usageComplete==='boolean')record.complete=metadata.usageComplete;
    else if(replace)record.complete=undefined;
    entry[key]=record;
  }
  function refreshUsage(entry) {
    const label=entry.ui?.tokenUsage;if(!label)return;
    const records=[['analysis',entry.analysisUsage,entry.status],['comments',entry.commentUsage,entry.commentStatus]].filter(([,record])=>record);
    const formatter=new Intl.NumberFormat(uiLanguage),countText=count=>formatter.format(count);
    const lines=[t('usage.scope')];let total=0,known=false,incomplete=false,pending=false;
    for(const [task,record,state] of records) {
      const active=['queued','running'].includes(state);pending||=active;
      const stages=Object.values(record.byStage||{}),values=stages.length?stages:[record.usage||{}];
      const totals=values.map(usageTotal),available=totals.filter(value=>value!==null);
      const subtotal=tokenCount(available.reduce((sum,value)=>sum+value,0));
      const complete=record.complete!==false&&available.length===values.length&&subtotal!==null&&!active;
      if(available.length&&subtotal!==null){known=true;total+=subtotal;}
      incomplete||=!complete;
      lines.push(t(task==='analysis'?'usage.analysis':'usage.comments')+': '+(available.length&&subtotal!==null?t(complete?'usage.total':'usage.known',{count:countText(subtotal)}):t(active?'usage.pending':'usage.unavailable')));
      const models=[...new Set([record.model,...record.models||[]].filter(Boolean))];
      if(models.length)lines.push(t('usage.model',{model:models.join(', ')}));
      else {lines.push(t('usage.unknownModel'));if(record.requestedModel)lines.push(t('usage.requested',{model:record.requestedModel}));}
      for(const [field,key] of [['input_tokens','usage.input'],['output_tokens','usage.output']]) {
        const counts=values.map(value=>tokenCount(value[field]));
        if(counts.every(value=>value!==null)){const sum=counts.reduce((a,b)=>a+b,0);if(tokenCount(sum)!==null)lines.push(t(key,{count:countText(sum)}));}
      }
      if(record.cached)lines.push(t('usage.cached'));
    }
    label.hidden=!entry.latestText&&!entry.comments.length&&!known;
    // Completed provenance belongs with the usage details rather than a
    // repeated heading. Keep progress, onboarding and incomplete/error states
    // visible even when the row also owns a reported token subtotal.
    const completedMetadata=entry.status==='done'&&['status.searched','status.unverified'].includes(entry.statusKey);
    entry.ui.status.hidden=completedMetadata&&!label.hidden;
    if(completedMetadata)lines.push(t(entry.statusKey));
    const text=known&&tokenCount(total)!==null?t(incomplete?'usage.known':'usage.total',{count:countText(total)}):t(pending?'usage.pending':'usage.unavailable');
    if(label.textContent!==text)label.textContent=text;
    if(incomplete&&known)lines.push(t('usage.partial'));
    const title=lines.join('\n'),aria=text+'\n'+title;
    if(label.title!==title)label.title=title;
    if(label.getAttribute('aria-label')!==aria)label.setAttribute('aria-label',aria);
  }
  function node(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text)e.textContent=text;return e;}
  function chevron(direction){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
    path.setAttribute('d',direction==='left'?'M15 5l-7 7 7 7':direction==='right'?'M9 5l7 7-7 7':'M5 9l7 7 7-7');
    path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','2');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);return svg;
  }
  function gear(){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
    const points=Array.from({length:48},(_,index)=>{const angle=(index/48)*Math.PI*2-Math.PI/2,radius=[7.2,7.2,9.2,9.2,7.2,7.2][index%6];return `${(12+Math.cos(angle)*radius).toFixed(2)} ${(12+Math.sin(angle)*radius).toFixed(2)}`;});
    path.setAttribute('d','M'+points.join('L')+'Z M15.2 12a3.2 3.2 0 1 1-6.4 0 3.2 3.2 0 0 1 6.4 0');
    path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.6');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);return svg;
  }
  function waitingIndicator(className='thinking') {
    const indicator=node('div',className),dots=node('span','dots'),label=node('span');dots.setAttribute('aria-hidden','true');
    for(let index=0;index<9;index++){const dot=node('span','dot');dot.style.setProperty('--dot',index);dots.append(dot);}
    indicator.append(dots,label);indicator.hidden=true;return {indicator,label};
  }
  function createCard(entry) {
    const card=document.createElement('grok-first-card'),shadow=card.attachShadow({mode:'open'});
    card.tabIndex=0;
    const css=node('style');css.textContent=`
      :host{all:initial;font-family:var(--gf-font,system-ui);color:var(--gf-fg,#e7e9ea);font-size:var(--gf-size,15px);line-height:var(--gf-leading,1.4);cursor:auto;color-scheme:var(--gf-scheme,dark);}
      :host([hidden]){display:none!important;}:host(:focus-visible){outline:2px solid var(--gf-accent,#1d9bf0);outline-offset:-2px;}*{box-sizing:border-box;min-width:0;}.card{position:absolute;left:0;right:0;max-width:100%;overflow-x:hidden;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--gf-muted,#71767b) var(--gf-bg,#000);background:var(--gf-bg,#000);padding:12px 16px;}
      button{font:inherit;color:var(--gf-accent,#1d9bf0);border:0;background:transparent;cursor:pointer;padding:2px 0}button:hover{text-decoration:underline;}button:disabled{color:var(--gf-muted,#71767b);cursor:default;text-decoration:none}button:focus-visible,a:focus-visible{outline:2px solid var(--gf-accent,#1d9bf0);outline-offset:2px}
      .status{color:var(--gf-muted,#71767b);font-size:12px;margin-bottom:10px;overflow-wrap:anywhere}.status[hidden]{display:none}.answer{white-space:normal;overflow-wrap:anywhere;}
      .status-settings{font:inherit;padding:0;vertical-align:baseline}
      .answer p{margin:0 0 12px}.answer h1,.answer h2,.answer h3,.answer h4,.answer h5,.answer h6{font-size:1em;font-weight:700;line-height:1.4;margin:16px 0 8px}.answer h1{font-size:1.15em}.answer h2{font-size:1.08em}.answer>:first-child{margin-top:0}.answer>:last-child{margin-bottom:0}
      .answer ul,.answer ol{margin:8px 0 12px;padding-inline-start:24px}.answer li{margin:4px 0}.answer li>p{margin:4px 0}.answer li>ul,.answer li>ol{margin:4px 0}.answer blockquote{margin:12px 0;padding-inline-start:12px;border-inline-start:2px solid var(--gf-border,#2f3336);color:var(--gf-muted,#71767b)}.answer blockquote>:last-child{margin-bottom:0}
      .answer code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.9em;white-space:pre-wrap;overflow-wrap:anywhere;background:rgba(127,127,127,.13);padding:1px 4px}.answer pre{max-width:100%;margin:12px 0;padding:10px;border:1px solid var(--gf-border,#2f3336);white-space:pre-wrap;overflow-wrap:anywhere}.answer pre code{display:block;font-size:.85em;background:transparent;padding:0;white-space:pre-wrap;overflow-wrap:anywhere}.answer hr{border:0;border-top:1px solid var(--gf-border,#2f3336);margin:16px 0}
      .answer .analysis-section>:first-child{margin-top:0}.answer .analysis-section>:last-child{margin-bottom:0}.answer .analysis-divider{margin:16px 0}.answer .analysis-divider[hidden],.answer .verification-answer[hidden]{display:none}
      .answer table{width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse;font-size:.9em;margin:12px 0}.answer th,.answer td{border:1px solid var(--gf-border,#2f3336);padding:6px;text-align:start;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}.answer th{font-weight:700}.answer .md-align-left{text-align:left}.answer .md-align-center{text-align:center}.answer .md-align-right{text-align:right}.answer .markdown-literal{white-space:pre-wrap}
      a{color:var(--gf-accent,#1d9bf0);text-decoration:none;overflow-wrap:anywhere;word-break:break-word;}a:hover{text-decoration:underline}.sources{font-size:13px;display:grid;grid-template-columns:minmax(0,1fr);gap:4px;margin-top:12px}.sources:empty{display:none}.note{color:var(--gf-muted,#71767b);font-size:12px;margin-top:12px;overflow-wrap:anywhere;}.note:empty{display:none}
      .actions{display:none;flex-wrap:wrap;gap:12px;margin-top:12px;font-size:13px}.actions:has(button:not([hidden])){display:flex}.actions button[hidden]{display:none}
      .thinking{display:flex;align-items:center;gap:10px;color:var(--gf-muted,#71767b);font-size:13px;margin:12px 0}.thinking[hidden]{display:none}.dots{display:grid;grid-template-columns:repeat(3,3px);gap:3px;flex:none}.dot{width:3px;height:3px;background:currentColor;border-radius:50%;animation:gf-dot 1.2s ease-in-out infinite;animation-delay:calc(var(--dot)*.09s)}
      .shimmer{background-image:linear-gradient(to right,#64696d 0%,#b6b9bc 20%,#595d62 40%,#64696d 100%);background-size:9em 100%;background-clip:text;-webkit-background-clip:text;color:transparent;animation:gf-shimmer .7s linear infinite}
      @keyframes gf-shimmer{0%{background-position-x:-2em}100%{background-position-x:7em}}@keyframes gf-dot{0%,100%{opacity:.28}50%{opacity:1}}
      .comments{display:grid;gap:0;margin-top:12px;border-top:1px solid var(--gf-border,#2f3336)}.comments[hidden],.comment-status[hidden]{display:none}.comments .comment-copy{display:block;width:100%;padding:10px 0;text-align:start;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--gf-fg,#e7e9ea);font-size:14px;border-bottom:1px solid var(--gf-border,#2f3336)}.comments .comment-copy:hover{background:rgba(127,127,127,.1);text-decoration:none}.comment-heading{font-size:13px;font-weight:700;margin-top:16px}.comment-hint{font-size:12px;color:var(--gf-muted,#71767b);margin-top:4px}.comment-heading[hidden],.comment-hint[hidden]{display:none}.comment-status,.copy-status{font-size:12px;color:var(--gf-muted,#71767b);overflow-wrap:anywhere;margin-top:10px}.copy-status:empty{display:none}
      @media(prefers-reduced-motion:reduce){.dot{animation:none;opacity:.7}.shimmer{animation:none;background:none;color:var(--gf-muted,#71767b)}}
      .diagnostics{font-size:12px;color:var(--gf-muted,#71767b);margin-top:12px}.diagnostics[hidden]{display:none}.diagnostics summary{cursor:pointer}.diagnostics pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}
      .token-usage{display:block;color:var(--gf-muted,#71767b);font-size:12px;margin-bottom:10px;overflow-wrap:anywhere;cursor:help}.token-usage[hidden]{display:none}.token-usage:focus-visible{outline:2px solid var(--gf-accent,#1d9bf0);outline-offset:2px}
    `;
    const box=node('section','card');box.setAttribute('aria-label',t('aria.result'));
    const status=node('div','status'),answer=node('div','answer'),sources=node('div','sources'),note=node('div','note'),actions=node('div','actions');status.setAttribute('role','status');
    answer.setAttribute('dir','auto');
    const explanationAnswer=node('div','analysis-section explanation-answer'),verificationAnswer=node('div','analysis-section verification-answer'),analysisDivider=node('hr','analysis-divider');analysisDivider.hidden=true;
    const {indicator:thinking,label:thinkingLabel}=waitingIndicator();
    const {indicator:verificationThinking,label:verificationThinkingLabel}=waitingIndicator('thinking verification-thinking');
    verificationThinkingLabel.classList.add('shimmer');
    const diagnostics=node('details','diagnostics'),diagnosticText=node('pre'),diagnosticLabel=node('summary','',t('common.diagnostics'));diagnostics.hidden=true;diagnostics.append(diagnosticLabel,diagnosticText);
    const retry=node('button','retry',t('common.retry'));retry.hidden=true;retry.addEventListener('click',()=>{if(retry.disabled||[...requests.values()].some(r=>r.entry===entry&&r.task==='analysis'))return;limited=false;pauseReason='';for(const pending of entries.values())if(pending.status==='new')refreshCard(pending);submit(entry,true);});
    const generateButton=node('button','generate-comments',t('common.generateComments'));generateButton.addEventListener('click',()=>generateComments(entry));
    const comments=node('div','comments'),commentStatus=node('div','comment-status'),copyStatus=node('div','copy-status');commentStatus.hidden=true;comments.hidden=true;commentStatus.setAttribute('role','status');copyStatus.setAttribute('role','status');
    const commentHeading=node('div','comment-heading'),commentHint=node('div','comment-hint');commentHeading.hidden=commentHint.hidden=true;
    const tokenUsage=node('span','token-usage');tokenUsage.hidden=true;tokenUsage.tabIndex=0;
    actions.append(retry,generateButton);box.append(tokenUsage,status,thinking,answer,verificationThinking,sources,note,diagnostics,actions,commentStatus,commentHeading,commentHint,comments,copyStatus);shadow.append(css,box);
    // Card controls belong to the overlay, separate from X's navigation handlers.
    for(const type of ['click','pointerdown','keydown'])card.addEventListener(type,event=>event.stopPropagation());
    card.addEventListener('scroll',scheduleLayout,{passive:true});
    return {card,ui:{box,status,thinking,thinkingLabel,verificationThinking,verificationThinkingLabel,answer,explanationAnswer,verificationAnswer,analysisDivider,sources,note,retry,generateComments:generateButton,comments,commentStatus,commentHeading,commentHint,copyStatus,diagnostics,diagnosticLabel,diagnosticText,tokenUsage}};
  }
  function validVerificationBoundary(text,start) {
    return typeof text==='string'&&Number.isSafeInteger(start)&&start>2&&start<=text.length&&text.slice(start-2,start)==='\n\n'&&Boolean(text.slice(0,start-2).trim());
  }
  function renderAnswerContent(entry) {
    const text=entry.latestText,ui=entry.ui;
    const verifying=['queued','running'].includes(entry.status)&&['verification_queued','verify','verification'].includes(entry.phase);
    let start=validVerificationBoundary(text,entry.verificationStart)?entry.verificationStart:undefined;
    // The live stage snapshot also supports an older background worker during
    // reload. Cached text without metadata is never split by guessed headings.
    const base=entry.verificationBase;
    if(start===undefined&&base?.trim()&&text.startsWith(base+'\n\n'))start=base.length+2;
    const pending=start===undefined&&verifying&&base?.trim()&&text===base;
    const explanation=start===undefined?text:text.slice(0,start-2),check=start===undefined?'':text.slice(start);
    if(explanation.trim()&&(pending||(start!==undefined&&(check.trim()||verifying)))) {
      if(!entry.answerSplit)ui.answer.replaceChildren(ui.explanationAnswer,ui.analysisDivider,ui.verificationAnswer);
      entry.answerSplit=true;
      // Once explanation is complete, retain its DOM while verification streams.
      if(entry.explanationRendered!==explanation){renderText(ui.explanationAnswer,explanation);entry.explanationRendered=explanation;}
      if(entry.verificationRendered!==check){renderText(ui.verificationAnswer,check);entry.verificationRendered=check;}
      ui.verificationAnswer.hidden=!check.trim();
    } else {
      entry.answerSplit=false;entry.explanationRendered=entry.verificationRendered=undefined;
      renderText(ui.answer,text);
    }
    syncLoading(entry);
  }
  function renderAnswer(entry,text,immediate=false) {
    entry.latestText=String(text||'');
    if(!entry.latestText){entry.verificationStart=undefined;entry.verificationBase='';}
    syncLoading(entry);
    if(immediate){if(entry.answerFrame!==undefined)cancelAnimationFrame(entry.answerFrame);entry.answerFrame=undefined;renderAnswerContent(entry);renderSources(entry);return;}
    if(entry.answerFrame!==undefined)return;
    entry.answerFrame=requestAnimationFrame(()=>{entry.answerFrame=undefined;if(!entry.card.isConnected)return;renderAnswerContent(entry);renderSources(entry);scheduleLayout();});
  }
  function renderText(target,text) {
    GrokFirstMarkdown.render(target,text);
  }
  function sourceUrl(value) {
    try {const url=new URL(value);return /^https?:$/.test(url.protocol)&&!url.username&&!url.password?url:null;}catch{return null;}
  }
  function sourceLabel(source,url) {
    const title=typeof source.title==='string'?source.title.trim():'';
    const numbered=/^[\s\[\](){}【】#.*]*\d+[\s\[\](){}【】#.*]*$/.test(title);
    if(title&&!numbered&&!sourceUrl(title))return title.slice(0,200);
    // Never invent a publication title or fetch a page just to label a link.
    let path=url.pathname==='/'?'':url.pathname;
    try {path=decodeURIComponent(path);}catch{}
    return (url.hostname+path+url.search+url.hash).slice(0,200);
  }
  function renderSources(entry,sources) {
    if(sources!==undefined)entry.sourceList=Array.isArray(sources)?sources:[];
    const target=entry.ui.sources;target.replaceChildren();
    const seen=new Set(Array.from(entry.ui.answer.querySelectorAll('a')).map(link=>sourceUrl(link.href)?.href).filter(Boolean));
    let count=0;
    for(const source of entry.sourceList||[]) {
      const url=sourceUrl(source?.url);if(!url||seen.has(url.href))continue;
      seen.add(url.href);
      const link=node('a','',sourceLabel(source,url));link.href=url.href;link.title=url.href;link.target='_blank';link.rel='noopener noreferrer';target.append(link);
      if(++count===12)break;
    }
  }
})();
