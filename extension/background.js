/* SuperX: credentials and provider calls stay in the extension worker. */
importScripts('feed-core.js', 'api-provider.js', 'cli-provider.js', 'ui-i18n.js', 'key-store.js', 'history-store.js');
const Core = XGrokCore;
const UI = GrokFirstUI;
const KeyStore = SuperXKeyStore;
const history = SuperXHistoryStore.create(chrome.storage.local);
const HISTORY_ALARM = 'SUPERX_HISTORY_CLEANUP';
const clients = new Set();
const jobs = new Map();
const runningJobs = new Set();
const apiSlots = new Set();
let queue = [], verifyQueue = [], pumping = false, primaryBurst = 0, settings, cache = {}, quotas = {}, railStates = {}, revision = 0, cacheEpoch = 0;
let ratePaused = false, uiLanguage = UI.browserLanguage(globalThis);
let quotaWrites = Promise.resolve(), cacheWrites = Promise.resolve(), railStateWrites = Promise.resolve(), uiLanguageWrites = Promise.resolve();
let securityWrites = Promise.resolve(), securityPending = 0, securityGeneration = 0;
let hasSavedKey = false, rememberApiKey = true, credentialReady = false, securityFault = false, sealAttempted = false;
let cliReady = false;
let cliStatus = 'bridge_missing';
let cliCheckedAt = 0;
let cliCheck;
async function refreshCLI(force=false) {
  if(!force && Date.now()-cliCheckedAt<30000)return cliReady;
  if(cliCheck)return cliCheck;
  cliCheck=(async()=>{
    try{const result=await SuperXCLI.check();cliReady=Boolean(result.installed && result.hasLogin);cliStatus=!result.installed?'cli_missing':!result.hasLogin?'login_required':'ready';}
    catch{cliReady=false;cliStatus='bridge_missing';}
    cliCheckedAt=Date.now();cliCheck=null;return cliReady;
  })();
  return cliCheck;
}
function providerAllowsCalls(){return settings?.provider==='cli'?cliReady:securityAllowsCalls();}
const CACHE_TTL = 24 * 60 * 60 * 1000;
const ready = initialize();

async function initialize() {
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  await chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  const local = await chrome.storage.local.get(['settings','uiLanguage','apiKey','apiKeyEncrypted','apiKeyVault','rememberApiKey']);
  const session = await chrome.storage.session.get(['quotas','railStates','uiLanguage','apiKey','cache','securityFault']);
  settings = Core.normalizeSettings(local.settings);
  securityFault = session.securityFault === true;
  const storedCredential=KeyStore.envelopePresent(local.apiKeyEncrypted)||validKey(local.apiKey)||local.apiKeyVault!==undefined;
  rememberApiKey = typeof local.rememberApiKey === 'boolean' ? local.rememberApiKey : Boolean(storedCredential) || !validKey(session.apiKey);
  try {
    // A saved cipher decrypts automatically. Missing/corrupt durable keys never
    // fall back to a stale plaintext copy or create a new decryption key.
    const encrypted=KeyStore.envelopePresent(local.apiKeyEncrypted);
    const available=encrypted?await KeyStore.open(local.apiKeyEncrypted):validKey(local.apiKey)?local.apiKey.trim():validKey(session.apiKey)?session.apiKey.trim():'';
    if(encrypted&&!validKey(available))throw new Error('Invalid stored credential.');
    if(encrypted||validKey(local.apiKey)||local.apiKeyVault!==undefined&&available){
      if(rememberApiKey) {
        if(!encrypted)await persistEncryptedKey(available);
        else await chrome.storage.local.remove(['apiKey','apiKeyVault']);
      } else {
        await chrome.storage.local.remove(['apiKey','apiKeyEncrypted','apiKeyVault']);
        await KeyStore.clear();
      }
      await chrome.storage.session.set({apiKey:available});session.apiKey=available;
    }
  } catch {
    securityFault=true;
    session.apiKey=undefined;
    try{await chrome.storage.session.remove('apiKey');}catch{/* The fault gate prevents stale session use if deletion fails. */}
    try{await chrome.storage.session.set({securityFault:true});}catch{/* Keep this worker closed if storage cannot record the fault. */}
  }
  const stored=await chrome.storage.local.get(['apiKey','apiKeyEncrypted','apiKeyVault']);
  hasSavedKey=KeyStore.envelopePresent(stored.apiKeyEncrypted)||validKey(stored.apiKey)||stored.apiKeyVault!==undefined;
  credentialReady=validKey(session.apiKey);
  cache = pruneCache(session.cache); quotas = session.quotas || {};railStates = session.railStates || {};
  // Delete the old persistent post cache without reading or migrating its data.
  await chrome.storage.local.remove('cache');
  // Browser-session data expires after 24 hours, without a provider call.
  if(session.cache!==undefined&&(!session.cache||typeof session.cache!=='object'||Array.isArray(session.cache)||Object.keys(session.cache).length!==Object.keys(cache).length)) {
    try{await persistCache(cacheEpoch);}catch{/* Clean memory stays usable if session cleanup fails; later cache writes retry. */}
  }
  // Only X reports are persisted; browser locale remains a fresh-install fallback.
  uiLanguage = UI.normalizeLanguage(session.uiLanguage || local.uiLanguage || uiLanguage);
  // Persist the supported selection while keeping credentials in their existing storage.
  if(JSON.stringify(local.settings)!==JSON.stringify(settings))await chrome.storage.local.set({settings});
  // Remember the preference separately; existing session-only keys stay in session storage.
  if(typeof local.rememberApiKey!=='boolean')await chrome.storage.local.set({rememberApiKey});
  // History has its own storage queue. A failed cleanup cannot block Key restore
  // or paid work, and no credential is passed to this store.
  void history.prune().then(()=>broadcastHistoryConfig()).catch(()=>{});
  try{await chrome.alarms?.create(HISTORY_ALARM,{periodInMinutes:60});}catch{/* Reads and writes still remove expired records. */}
}
function validKey(value) { return typeof value==='string' && Boolean(value.trim()) && value.length<=500 && !/[\r\n]/.test(value); }
function securityAllowsCalls() { return !securityFault && credentialReady && securityPending===0; }
function securityStatus() {
  return {keyState:securityAllowsCalls()?'ready':hasSavedKey&&!credentialReady?'migration':'missing',
    remember:rememberApiKey,hasSavedKey};
}
function isX(url) { try { return ['x.com','twitter.com'].includes(new URL(url).hostname) && new URL(url).protocol === 'https:'; } catch { return false; } }
function isFeed(url) { return isX(url) && !/^\/(?:messages|i\/(?:chat|grok|flow|premium|settings))\b/.test(new URL(url).pathname); }
function trustedUI(sender) { try { const url=new URL(sender.url),base=new URL(chrome.runtime.getURL(''));return sender.id===chrome.runtime.id&&url.protocol===base.protocol&&url.host===base.host&&['/options.html','/popup.html','/history.html'].includes(url.pathname); }catch{return false;} }
function trustedFeed(sender) { return sender.id===chrome.runtime.id && sender.frameId===0 && Number.isInteger(sender.tab?.id) && isFeed(sender.url); }
function send(port, message) { try { port.postMessage(message); } catch { /* Tab closed. */ } }
async function publicConfig() {
  const generation=securityGeneration,canRefresh=securityPending===0;
  const session = await chrome.storage.session.get('apiKey');
  // A lookup started before a Key change or while a mutation was pending cannot
  // overwrite the newer operation's readiness with an old storage snapshot.
  if(canRefresh && generation===securityGeneration && securityPending===0)credentialReady = validKey(session.apiKey);
  const status=securityStatus();
  const historyConfig=history.config();
  if(settings.provider==='cli')await refreshCLI();
  return {settings,ready:providerAllowsCalls(),keyState:status.keyState,historyEnabled:historyConfig.enabled,historyEpoch:historyConfig.epoch};
}
async function notifyHistoryChanged(){await chrome.runtime.sendMessage({type:'HISTORY_CHANGED',...history.config()}).catch(()=>{});}
async function broadcastHistoryConfig(){
  const config=history.config();
  for(const client of clients)send(client.port,{type:'HISTORY_CONFIG',...config});
  await notifyHistoryChanged();
}
function historyTicket(post){return history.capture(post.id).catch(()=>null);}
function rememberHistoryResult(ticket,result,comments=false,language=''){
  void Promise.resolve(ticket).then(value=>comments?history.comments(value,{...result,language}):history.analysis(value,{...result,language})).then(()=>notifyHistoryChanged()).catch(()=>{});
}
async function broadcastConfig() { const config = await publicConfig(); for (const client of clients) send(client.port,{type:'CONFIG',...config,used:quotas[client.tabId] || 0,collapsed:Boolean(railStates[client.tabId]),uiLanguage:client.uiLanguage}); pump(); }
async function currentUILanguage() {
  try {
    const tabs=await chrome.tabs.query({active:true,lastFocusedWindow:true});
    const active=tabs.find(tab=>isFeed(tab.pendingUrl||tab.url));
    const client=active&&[...clients].find(value=>value.tabId===active.id);
    if(client)return client.uiLanguage;
  } catch { /* The last reported public UI locale remains available. */ }
  return uiLanguage;
}
function updateUILanguage(client,value) {
  client.uiLanguage=UI.normalizeLanguage(value);uiLanguage=client.uiLanguage;
  const language=uiLanguage;
  for(const peer of clients)if(peer.tabId===client.tabId)peer.uiLanguage=language;
  // UI locale never enters paid-task settings or increments their revision.
  uiLanguageWrites=uiLanguageWrites.catch(()=>{}).then(async()=>{
    await Promise.all([chrome.storage.session.set({uiLanguage:language}),chrome.storage.local.set({uiLanguage:language})]);
    await chrome.runtime.sendMessage({type:'UI_LANGUAGE_CHANGED',language}).catch(()=>{});
  });
  return uiLanguageWrites;
}
function sanitizePost(raw) {
  const url = Core.canonicalPostUrl(raw?.url);
  const id = url?.match(/\/status\/(\d+)$/)?.[1];
  if (!id || id !== String(raw?.id)) throw new Error('无法识别帖子地址。');
  const text = value => typeof value === 'string' ? value.slice(0,12000) : '';
  const language = value => { const hint=Core.resolvePostLanguage('auto',{language:value,text:''});return hint==='auto'?'':hint; };
  const context = p => ({id:text(p.id),url:Core.canonicalPostUrl(p.url),text:text(p.text),language:language(p.language),author:text(p.author).slice(0,200),timestamp:text(p.timestamp).slice(0,60),hasMedia:Boolean(p.hasMedia),images:(Array.isArray(p.images)?p.images:[]).slice(0,4).map(img=>({url:GrokFirstAPI.safeUrl(img.url),alt:text(img.alt).slice(0,500)})).filter(img=>img.url && new URL(img.url).hostname === 'pbs.twimg.com')});
  return {...context(raw),id,url,quotedContext:(Array.isArray(raw.quotedContext)?raw.quotedContext:[]).slice(0,2).map(context)};
}
function cacheKey(post, s, inputFingerprint) {
  const mode=Core.explanationMode(s);
  const prompts=['prompts-v1',mode==='preset'?Core.DEFAULT_PROMPTS.explain:s.explainPrompt,mode==='preset'?Core.DEFAULT_PROMPTS.verify:s.verifyPrompt];
  return JSON.stringify(['GrokFirst-v1',s.provider,...(s.provider==='cli'?[s.cliModel,s.cliWebSearch]:[]),s.apiModel,s.language,s.webSearch,s.xSearch,
    'api-v7-reader-output',mode,s.apiVerification || 'background',
    Core.apiPostIdentity(post,s),...prompts]);
}
function sanitizeAnalysis(raw) {
  const value=typeof raw==='string'?{text:raw}:raw&&typeof raw==='object'?raw:{};
  return {text:typeof value.text==='string'?value.text.slice(0,30000):'',
    verificationStatus:typeof value.verificationStatus==='string'?value.verificationStatus.slice(0,40):'',
    warning:typeof value.warning==='string'?value.warning.slice(0,1000):'',
    sources:(Array.isArray(value.sources)?value.sources:[]).slice(0,20).map(source=>({url:GrokFirstAPI.safeUrl(source?.url),title:typeof source?.title==='string'?source.title.slice(0,200):''})).filter(source=>source.url)};
}
function commentCacheKey(post,s,inputFingerprint,analysis) {
  const prompts=['comments-prompt-v1',s.commentsPrompt];
  return JSON.stringify(['GrokFirst-comments-v2-language',s.provider,...(s.provider==='cli'?[s.cliModel]:[]),s.apiModel,s.language,Core.postFingerprint(post),analysis,...prompts]);
}
function commentsJob(job) { return job.settings.task==='comments'; }
function billingMetadata(value,provider) { return ['api','cli'].includes(provider)?GrokFirstAPI.sanitizedMetadata(value):{}; }
function verificationMetadata(value,mode,text=String(value?.text||'').slice(0,30000)) {
  const start=value?.verificationStart;
  if(mode!=='background')return {};
  const failure=GrokFirstAPI.sanitizedVerificationFailure(value?.verificationFailure);
  return {...(Number.isSafeInteger(start)&&start>=2&&start<=text.length&&text.slice(start-2,start)==='\n\n'?{verificationStart:start}:{}),
    ...(failure?{verificationFailure:failure}:{})};
}
function withBillingMetadata(value,provider,verificationMode) {
  const result={...value};
  for(const field of ['usage','usageComplete','usageByStage','model','modelByStage','verificationStart','verificationFailure'])delete result[field];
  return {...result,...billingMetadata(value,provider),...verificationMetadata(value,verificationMode)};
}
function jobError(job,error,code,extra={}) { send(job.client.port,{type:commentsJob(job)?'COMMENT_ERROR':'ERROR',requestId:job.requestId,error,code,...extra}); }
function freshCacheEntry(entry,now) {
  return entry&&typeof entry==='object'&&!Array.isArray(entry)&&Number.isFinite(entry.completedAt)&&entry.completedAt>=0&&entry.completedAt<=now&&now-entry.completedAt<CACHE_TTL;
}
function pruneCache(input,now=Date.now()) {
  const entries=input&&typeof input==='object'&&!Array.isArray(input)?Object.entries(input):[];
  const recent=entries.filter(([,value])=>freshCacheEntry(value,now)).sort((a,b)=>b[1].completedAt-a[1].completedAt).slice(0,160);
  const kept=[];let bytes=0;
  for(const entry of recent){bytes+=new TextEncoder().encode(JSON.stringify(entry)).byteLength;if(bytes>4_000_000)break;kept.push(entry);}
  return Object.fromEntries(kept);
}
function cachedResult(key) { const entry = cache[key]; if (freshCacheEntry(entry,Date.now())) return entry; delete cache[key]; return null; }
function persistQuotas() {
  // Concurrent reservations and resets must not leave an older storage snapshot
  // behind a newer one. Read the latest counters when this write starts.
  quotaWrites=quotaWrites.catch(()=>{}).then(()=>chrome.storage.session.set({quotas:{...quotas}}));
  return quotaWrites;
}
function persistCache(epoch) {
  cacheWrites=cacheWrites.catch(()=>{}).then(()=>epoch===cacheEpoch?chrome.storage.session.set({cache:{...cache}}):undefined);
  return cacheWrites;
}
function clearStoredCache() {
  cache={};cacheEpoch++;
  cacheWrites=cacheWrites.catch(()=>{}).then(async()=>{
    const results=await Promise.allSettled([chrome.storage.session.remove('cache'),chrome.storage.local.remove('cache')]);
    const failed=results.find(value=>value.status==='rejected');
    if(failed)throw failed.reason;
  });
  return cacheWrites;
}
function persistRailStates() {
  railStateWrites=railStateWrites.catch(()=>{}).then(()=>chrome.storage.session.set({railStates:{...railStates}}));
  return railStateWrites;
}
function removeJob(job) { if(jobs.get(job.key)===job)jobs.delete(job.key); }
function abortJob(job) { job.controller.abort(); removeJob(job); queue = queue.filter(j=>j!==job); pump(); }
function cancelClient(client) { client.cancelEpoch++; for (const job of [...jobs.values()]) if(job.client===client) abortJob(job); }
// Browser message promises do not reject when an AbortSignal is cancelled.
// Settle our await independently so a silent provider cannot hold a dispatch slot.
function waitForAbort(promise, signal) {
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(ok,value)=>{
      if(settled)return;settled=true;signal.removeEventListener('abort',cancel);
      if(ok)resolve(value);else reject(value);
    };
    const cancel=()=>finish(false,signal.reason || new DOMException('Cancelled','AbortError'));
    Promise.resolve(promise).then(value=>finish(true,value),error=>finish(false,error));
    if(signal.aborted)cancel();else signal.addEventListener('abort',cancel,{once:true});
  });
}

async function openSettings() {
  // Replace stale focus requests even when the caller uses a generic Settings
  // entry point or sends an unlock target from an older content script.
  try { await chrome.storage.session.set({superxOptionsFocus:{id:settings.provider==='cli'?'provider':'api-key',nonce:crypto.randomUUID()}}); }
  catch { /* The settings page remains reachable when session storage fails. */ }
  await chrome.runtime.openOptionsPage();
}
async function openHistory(){await chrome.tabs.create({url:chrome.runtime.getURL('history.html')});}
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'GROKFIRST_FEED' || port.sender?.frameId !== 0 || !isFeed(port.sender?.url)) { port.disconnect(); return; }
  const client = {port,tabId:port.sender.tab.id,cancelEpoch:0,uiLanguage:null,requestCancellations:new Map()}; clients.add(client);
  ready.then(async()=>{client.uiLanguage=UI.normalizeLanguage(client.uiLanguage || uiLanguage);send(port,{type:'CONFIG',...await publicConfig(),used:quotas[client.tabId] || 0,collapsed:Boolean(railStates[client.tabId]),uiLanguage:client.uiLanguage});}).catch(()=>send(port,{type:'FATAL',error:'扩展初始化失败，请重新加载扩展。'}));
  port.onMessage.addListener(message=>{
    const receivedEpoch=client.cancelEpoch,receivedRevision=revision;
    const messageRequestId=String(message.requestId || '').slice(0,80);
    // Cancellation can arrive before an asynchronous readiness lookup has
    // created a job. Capture a receipt generation so it cannot dispatch later;
    // an explicit new request with the same ID captures the new generation.
    if(['CANCEL','CANCEL_IF_QUEUED'].includes(message.type)&&messageRequestId)client.requestCancellations.set(messageRequestId,Symbol());
    const receivedCancellation=client.requestCancellations.get(messageRequestId);
    ready.then(async()=>{
      if(!clients.has(client))return;
      if(message.type==='PING') { send(port,{type:'PONG'}); return; }
      if(message.type==='UI_LANGUAGE') { await updateUILanguage(client,message.language);return; }
      if(message.type==='CANCEL_ALL') { cancelClient(client); return; }
      if(message.type==='OPEN_SETTINGS') { await openSettings(); return; }
      if(message.type==='OPEN_HISTORY'&&trustedFeed(port.sender)){await openHistory();return;}
      if(message.type==='HISTORY_VISIT'){
        // No Key, provider call or dwell timer is required to record visibility.
        // Epochs reject batches sent before Clear/Delete/recording changes.
        if(!trustedFeed(port.sender))return;
        const batchId=String(message.batchId||'').slice(0,80),ack=ok=>{if(batchId)send(port,{type:'HISTORY_ACK',batchId,ok,epoch:history.config().epoch});};
        if(!settings.enabled||!Array.isArray(message.posts)||message.posts.length>30||message.historyEpoch!==history.config().epoch){ack(false);return;}
        const posts=[];for(const raw of message.posts){try{posts.push(sanitizePost(raw));}catch{/* An invalid record cannot make a trusted batch fail. */}}
        try{const status=await history.visit(posts,message.historyEpoch);ack(status.enabled&&message.historyEpoch===status.epoch&&posts.length>0);}catch{ack(false);/* History failure never affects the analysis queue. */}return;
      }
      if(message.type==='SET_ENABLED') { await queueSettingsMutation(()=>({...settings,enabled:Boolean(message.enabled)})); return; }
      if(message.type==='SET_LANGUAGE') { await queueSettingsMutation(()=>({...settings,language:message.language})); return; }
      if(message.type==='SET_RAIL_COLLAPSED') {
        railStates[client.tabId]=Boolean(message.collapsed);
        if(railStates[client.tabId]) {
          for(const waiting of queue.filter(job=>job.client.tabId===client.tabId)) {
            removeJob(waiting);jobError(waiting,'右栏已收起，未开始的分析已暂停。','RAIL_COLLAPSED');
          }
          queue=queue.filter(job=>job.client.tabId!==client.tabId);pump();
        }
        for(const peer of clients)if(peer.tabId===client.tabId)send(peer.port,{type:'RAIL_VISIBILITY',collapsed:Boolean(railStates[client.tabId])});
        await persistRailStates();return;
      }
      if(message.type==='CANCEL') { const job=jobs.get(`${client.tabId}:${message.requestId}`); if(job?.client===client) abortJob(job); return; }
      if(message.type==='CANCEL_IF_QUEUED') {
        const job=jobs.get(`${client.tabId}:${messageRequestId}`);
        if(job?.client===client && runningJobs.has(job))return;
        if(job?.client===client)abortJob(job);
        send(port,{type:'ERROR',requestId:messageRequestId,error:'未开始的分析已暂停。',code:'CANCELLED'});return;
      }
      if(!['ANALYZE','GENERATE_COMMENTS'].includes(message.type)) return;
      const comments=message.type==='GENERATE_COMMENTS';
      const report=(error,code)=>send(port,{type:comments?'COMMENT_ERROR':'ERROR',requestId,error,code});
      const requestId=messageRequestId;
      if(!requestId) return;
      if(client.requestCancellations.get(requestId)!==receivedCancellation)return;
      if(client.cancelEpoch!==receivedEpoch || receivedRevision!==revision){report('任务已取消。','CANCELLED');return;}
      if(settings.provider==='api' && (securityPending || securityFault)) { report('API Key 设置需要重新确认，请在设置中重试。','NEEDS_KEY');return; }
      const snapshot={...settings,...(comments?{task:'comments'}:{})};
      if(!settings.enabled&&!comments) { report('已暂停自动分析。','PAUSED'); return; }
      if(railStates[client.tabId]){report('右栏已收起。','RAIL_COLLAPSED');return;}
      let post,inputFingerprint;
      try { inputFingerprint=Core.postFingerprint(message.post);post=sanitizePost(message.post); } catch(e) { report(e.message,'POST_INVALID'); return; }
      if(snapshot.provider==='api'&&!comments&&!snapshot.webSearch&&!snapshot.xSearch) { report('通过帖子链接读取全文需要启用 X 搜索或网页搜索。','URL_SEARCH_REQUIRED');return; }
      const analysis=comments?sanitizeAnalysis(message.analysis):undefined;
      const fingerprint=comments?commentCacheKey(post,snapshot,inputFingerprint,analysis):cacheKey(post,snapshot,inputFingerprint);
      const ticket=historyTicket(post),historyLanguage=Core.resolvePostLanguage(snapshot.language,post);
      const cached=message.force ? null : cachedResult(fingerprint);
      if(cached) { rememberHistoryResult(ticket,cached,comments,historyLanguage);send(port,comments?{type:'COMMENT_RESULT',requestId,comments:cached.comments,cached:true,...billingMetadata(cached,snapshot.provider)}:{type:'RESULT',requestId,result:withBillingMetadata(cached,snapshot.provider,snapshot.apiVerification),cached:true}); return; }
      const config=await publicConfig();
      if(!clients.has(client)||client.cancelEpoch!==receivedEpoch||receivedRevision!==revision||client.requestCancellations.get(requestId)!==receivedCancellation)return;
      if(railStates[client.tabId]){report('右栏已收起。','RAIL_COLLAPSED');return;}
      if(!config.ready) { report(settings.provider==='cli'?'请打开设置检查本地 Grok CLI 连接。':'请打开设置并输入 xAI API Key。',settings.provider==='cli'?'CLI_UNAVAILABLE':'NEEDS_KEY'); return; }
      const key=`${client.tabId}:${requestId}`;
      if(jobs.has(key)) return;
      if(ratePaused && !message.force) { report('Grok 已限速，自动队列已暂停，请稍后手动重试。','RATE_LIMIT'); return; }
      if(message.force)ratePaused=false;
      const job={key,requestId,post,inputFingerprint,analysis,client,clientEpoch:receivedEpoch,settings:snapshot,revision:receivedRevision,fingerprint,historyTicket:ticket,historyLanguage,controller:new AbortController()};
      jobs.set(key,job);
      const before=comments?queue.findIndex(waiting=>!commentsJob(waiting)):-1;
      if(before>=0)queue.splice(before,0,job);else queue.push(job);
      if(!comments)send(port,{type:'QUEUED',requestId});pump();
    }).catch(()=>send(port,{type:message.type==='GENERATE_COMMENTS'?'COMMENT_ERROR':'ERROR',requestId:message.requestId,error:'处理失败，请重新加载扩展。'}));
  });
  port.onDisconnect.addListener(()=>{clients.delete(client);cancelClient(client);});
});

function liveJob(job) {
  return providerAllowsCalls() && runningJobs.has(job) && jobs.get(job.key)===job && !job.controller.signal.aborted && job.revision===revision && job.clientEpoch===job.client.cancelEpoch && clients.has(job.client);
}
function apiLimit(s) { if(s.provider==='cli')return 1; return Math.max(1,Math.min(8,Math.trunc(Number(s.apiConcurrency))||4)); }
function rateLimitError() { return Object.assign(new Error('Grok 已限速，自动队列已暂停，请稍后手动重试。'),{code:'RATE_LIMIT'}); }
function clearAPIDeadline(job) { clearTimeout(job.deadline);job.deadline=undefined; }
function startAPIDeadline(job) {
  clearAPIDeadline(job);
  const stage=job.slotPhase;
  job.deadline=setTimeout(()=>job.controller.abort(Object.assign(new Error('分析超时，Grok 未能完成响应；可手动重试。'),{code:'TIMEOUT',
    ...(stage==='verify'?{verificationFailure:{code:'TIMEOUT',stage:'verify',errorCode:'TIMEOUT'}}:{})})),job.settings.provider==='cli'?180000:150000);
}
function releaseAPISlot(job) { clearAPIDeadline(job);apiSlots.delete(job);job.slotHeld=false;job.slotPhase=null; }
function scheduleVerification(job,task) {
  releaseAPISlot(job);
  if(!liveJob(job))return Promise.reject(job.controller.signal.reason || new DOMException('Cancelled','AbortError'));
  if(ratePaused){pump();return Promise.reject(rateLimitError());}
  return new Promise((resolve,reject)=>{
    const entry={job,task,resolve,reject};
    entry.cancel=()=>{
      verifyQueue=verifyQueue.filter(value=>value!==entry);
      job.controller.signal.removeEventListener('abort',entry.cancel);
      reject(job.controller.signal.reason || new DOMException('Cancelled','AbortError'));pump();
    };
    job.controller.signal.addEventListener('abort',entry.cancel,{once:true});
    verifyQueue.push(entry);pump();
  });
}
async function executeVerification(entry) {
  const {job}=entry;
  job.controller.signal.removeEventListener('abort',entry.cancel);
  try {
    if(!liveJob(job))throw job.controller.signal.reason || new DOMException('Cancelled','AbortError');
    startAPIDeadline(job);
    const result=await waitForAbort(Promise.resolve().then(()=>{
      if(!liveJob(job))throw job.controller.signal.reason || new DOMException('Cancelled','AbortError');
      return entry.task();
    }),job.controller.signal);
    entry.resolve(result);
  } catch(e) {
    // Pause before freeing this HTTP slot. Otherwise a waiting explanation could
    // start between the verify rejection and the provider attaching its partial.
    if(e.code==='RATE_LIMIT' && liveJob(job))pauseWaitingJobs();
    entry.reject(e);
  }
  finally {releaseAPISlot(job);pump();}
}
function pauseWaitingJobs() {
  ratePaused=true;
  for(const waiting of queue) {
    jobError(waiting,rateLimitError().message,'RATE_LIMIT');
    removeJob(waiting);
  }
  queue=[];
  const waitingVerification=verifyQueue;verifyQueue=[];
  for(const entry of waitingVerification) {
    entry.job.controller.signal.removeEventListener('abort',entry.cancel);
    // The provider attaches the completed first explanation to this error.
    entry.reject(rateLimitError());
  }
}
function pump() {
  if(pumping || !providerAllowsCalls())return;
  pumping=true;
  try {
    queue=queue.filter(job=>jobs.get(job.key)===job && !job.controller.signal.aborted && job.revision===revision && job.clientEpoch===job.client.cancelEpoch && clients.has(job.client));
    if(!verifyQueue.length)primaryBurst=0;
    while(queue.length || verifyQueue.length) {
      // First text is prioritized, but a continuous feed cannot starve checks.
      // Count only new tasks dispatched while a check is actually waiting.
      if(!verifyQueue.length)primaryBurst=0;
      const next=queue[0]||verifyQueue[0]?.job;
      const limit=apiLimit(next.settings);
      const checkRoom=limit===1||[...apiSlots].filter(value=>value.slotPhase==='verify').length<limit-1;
      const verification=verifyQueue.length&&checkRoom&&(!queue.length||primaryBurst>=limit)?verifyQueue[0]:null;
      const job=verification?verification.job:queue[0];
      if(!job)break;
      const running=apiSlots.size;
      if(running>=limit)break;
      // Keep one API slot ready for newly visible posts while long background
      // checks continue. Single-slot users retain the original serial behavior.
      if(verification && limit>1 && [...apiSlots].filter(value=>value.slotPhase==='verify').length>=limit-1)break;
      if(verification){verifyQueue.shift();primaryBurst=0;}
      else {if(verifyQueue.length)primaryBurst++;queue.shift();runningJobs.add(job);}
      // Dispatch immediately when an API concurrency slot is free.
      job.slotHeld=true;job.slotPhase=verification?'verify':commentsJob(job)?'comments':'explain';apiSlots.add(job);
      if(verification)void executeVerification(verification);else void executeJob(job);
    }
  } finally { pumping=false; }
}
async function executeJob(job) {
  const {client,requestId}=job,signal=job.controller.signal;
  const epoch=cacheEpoch;
  try {
    // Legacy session counts are informational only, never a dispatch limit.
    // Manual comment drafts are a separate task and do not increment them.
    const used=commentsJob(job)?quotas[client.tabId]||0:quotas[client.tabId]=(quotas[client.tabId] || 0)+1;
    startAPIDeadline(job);
    if(!commentsJob(job))void persistQuotas().catch(()=>{});
    if(!liveJob(job))return;
    send(client.port,{type:commentsJob(job)?'COMMENT_START':'START',requestId,...(commentsJob(job)?{}:{used})});
    const onUpdate=update=>{
      job.billing=billingMetadata(update,job.settings.provider);
      const text=String(update.text||'').slice(0,30000);
      if(job.settings.apiVerification==='background'&&text.trim()&&(update.phase==='verification_queued'||update.phase==='verify'&&update.verificationText==='')) {
        job.retainedExplanation={...sanitizeAnalysis(update),provider:'api',apiVerification:'background',verified:false,searched:update.searched===true};
        if(liveJob(job)&&!job.historyExplanationSaved){job.historyExplanationSaved=true;rememberHistoryResult(job.historyTicket,{...job.retainedExplanation,...job.billing,verificationStatus:'incomplete',completedAt:Date.now()},false,job.historyLanguage);}
      }
      if(liveJob(job)&&!commentsJob(job))send(client.port,{type:'UPDATE',requestId,text,phase:update.phase,
        ...(job.settings.apiVerification==='background'&&typeof update.verificationText==='string'?{verificationText:update.verificationText.slice(0,30000)}:{}),
        verificationStatus:update.verificationStatus,warning:update.warning,sources:update.sources,...job.billing,...verificationMetadata(update,job.settings.apiVerification,text)});
    };
    const result=withBillingMetadata(await waitForAbort(runAPI(job,onUpdate),signal),job.settings.provider,commentsJob(job)?undefined:job.settings.apiVerification);
    if(!liveJob(job))return;
    job.billing=billingMetadata(result,job.settings.provider);
    releaseAPISlot(job);pump();
    if(commentsJob(job))result.comments=GrokFirstAPI.validateComments(result.comments);
    else result.text=String(result.text).slice(0,30000);
    result.completedAt=Date.now();
    rememberHistoryResult(job.historyTicket,result,commentsJob(job),job.historyLanguage);
    if(epoch===cacheEpoch && !['incomplete','failed'].includes(result.verificationStatus)) {
      cache[job.fingerprint]=result;
      cache=pruneCache(cache);
      try{await waitForAbort(persistCache(epoch),signal);}catch(e){if(signal.aborted)throw e;/* Storage failure must not hide a complete answer. */}
    }
    if(liveJob(job))send(client.port,commentsJob(job)?{type:'COMMENT_RESULT',requestId,comments:result.comments,cached:false,...job.billing}:{type:'RESULT',requestId,result,cached:false});
  } catch(e) {
    if(liveJob(job)) {
      const errorBilling={...job.billing,...billingMetadata(e.partialResult,job.settings.provider),...billingMetadata(e,job.settings.provider)};
      const partialResult=e.partialResult?withBillingMetadata({...e.partialResult,...errorBilling,text:String(e.partialResult.text||'').slice(0,30000),verificationStatus:'incomplete'},job.settings.provider,job.settings.apiVerification):undefined;
      const safeError=GrokFirstAPI.publicError(e);
      if(partialResult)rememberHistoryResult(job.historyTicket,{...partialResult,completedAt:Date.now()},false,job.historyLanguage);
      jobError(job,safeError.error,safeError.code,{...errorBilling,...(commentsJob(job)?{}:{...verificationMetadata({verificationFailure:e.verificationFailure||partialResult?.verificationFailure},job.settings.apiVerification),partialResult})});
      if(e.code==='RATE_LIMIT')pauseWaitingJobs();
      if(job.settings.provider==='cli'&&['CLI_AUTH','CLI_UNAVAILABLE','CLI_DISCONNECTED'].includes(e.code)){
        cliReady=false;cliCheckedAt=Date.now();
        for(const waiting of queue){jobError(waiting,safeError.error,safeError.code);removeJob(waiting);}
        queue=[];await broadcastConfig();
      }
    } else if(signal.aborted && clients.has(client) && job.revision===revision && (!jobs.has(job.key)||jobs.get(job.key)===job)) {
      const reason=signal.reason;
      const explained=reason?.code==='TIMEOUT';
      const partialResult=explained&&job.retainedExplanation?withBillingMetadata({...job.retainedExplanation,...job.billing,verificationStatus:'incomplete',
        ...verificationMetadata(reason,job.settings.apiVerification)},job.settings.provider,job.settings.apiVerification):undefined;
      if(partialResult)rememberHistoryResult(job.historyTicket,{...partialResult,completedAt:Date.now()},false,job.historyLanguage);
      jobError(job,explained?GrokFirstAPI.publicError(reason).error:'请求已取消；可手动重试。',explained?reason.code:'CANCELLED',
        {...job.billing,...(partialResult?{partialResult,...verificationMetadata(reason,job.settings.apiVerification)}:{})});
    }
  } finally {
    clearAPIDeadline(job);removeJob(job);runningJobs.delete(job);
    releaseAPISlot(job);
    pump();
  }
}
async function runAPI(job,onUpdate) {
  const signal=job.controller.signal;
  if(job.settings.provider==='cli')return SuperXCLI.run(job.post,job.settings,{signal,onUpdate,analysis:job.analysis});
  const session=await waitForAbort(chrome.storage.session.get('apiKey'),signal);
  const key=session.apiKey;
  if(!liveJob(job))throw signal.reason || new DOMException('Cancelled','AbortError');
  if(!validKey(key))throw Object.assign(new Error('请打开设置并输入 API Key。'),{code:'NEEDS_KEY'});
  if(commentsJob(job))return GrokFirstAPI.generateComments(job.post,job.settings,key,{analysis:job.analysis,signal});
  return GrokFirstAPI.run(job.post,job.settings,key,{signal:job.controller.signal,onUpdate,scheduleVerification:task=>scheduleVerification(job,task)});
}
function invalidateSecurityJobs() {
  revision++;
  for(const job of [...jobs.values()])abortJob(job);
  ratePaused=false;
}
function securityError() {
  return {ok:false,errorKey:'errors.keyStorage'};
}
async function refreshSecurityState() {
  const [local,session]=await Promise.all([
    chrome.storage.local.get(['apiKey','apiKeyEncrypted','apiKeyVault','rememberApiKey','settings']),
    chrome.storage.session.get('apiKey')
  ]);
  // A superseded write may already have committed its optional settings. Read
  // the committed value so a later Key-only clear or replacement cannot leave
  // this worker's configuration different from the next worker's startup.
  settings=Core.normalizeSettings(local.settings);
  rememberApiKey=typeof local.rememberApiKey==='boolean'?local.rememberApiKey:rememberApiKey;
  hasSavedKey=KeyStore.envelopePresent(local.apiKeyEncrypted)||validKey(local.apiKey)||local.apiKeyVault!==undefined;
  credentialReady=validKey(session.apiKey);
}
async function persistEncryptedKey(apiKey,values={},current=()=>true) {
  sealAttempted=true;
  const envelope=await KeyStore.seal(apiKey);
  if(!current())return false;
  if(!KeyStore.isEnvelope(envelope)||await KeyStore.open(envelope)!==apiKey)throw new Error('Key storage validation failed.');
  if(!current())return false;
  await chrome.storage.local.set({...values,apiKeyEncrypted:envelope});
  if(!current())return false;
  // Confirm the committed cipher decrypts before discarding migration sources.
  const stored=await chrome.storage.local.get('apiKeyEncrypted');
  if(!current())return false;
  if(!KeyStore.isEnvelope(stored.apiKeyEncrypted)||await KeyStore.open(stored.apiKeyEncrypted)!==apiKey)throw new Error('Key storage validation failed.');
  if(!current())return false;
  await chrome.storage.local.remove(['apiKey','apiKeyVault']);
  return current();
}
async function mutateSecurity(message,generation) {
  const current=()=>generation===securityGeneration;
  if(!current())return;
  const apiKey=message.apiKey,remember=typeof message.remember==='boolean'?message.remember:rememberApiKey;
  const values={rememberApiKey:remember,...(message.settings?{settings:message.settings}:{})};
  // Remove the old session credential before changing persisted configuration.
  // No intermediate state can issue paid work with mixed old/new settings.
  await chrome.storage.session.remove('apiKey');
  if(!current())return;
  if(apiKey&&remember) {
    if(!await persistEncryptedKey(apiKey,values,current))return;
  } else {
    // A fresh, explicitly session-only save needs no IndexedDB. Clear and real
    // demotion still wait for durable deletion; faults or an earlier seal may
    // indicate an orphaned durable key that must also be removed.
    const needsDurableDeletion=!apiKey||message.remember!==false||hasSavedKey||sealAttempted||securityFault;
    await chrome.storage.local.remove(['apiKey','apiKeyEncrypted','apiKeyVault']);
    if(!current())return;
    if(needsDurableDeletion)await KeyStore.clear();
    if(!current())return;
    await chrome.storage.local.set(values);
  }
  if(!current())return;
  if(message.settings)settings=message.settings;
  if(apiKey)await chrome.storage.session.set({apiKey});
}
function queueSecurityMutation(message) {
  const generation=++securityGeneration;
  securityPending++;
  invalidateSecurityJobs();
  cache={};cacheEpoch++;
  // Invalidate at receipt, before asynchronous storage or settings changes.
  void ready.then(()=>broadcastConfig()).catch(()=>{});
  const operation=securityWrites.catch(()=>{}).then(async()=>{
    await ready;
    let failure;
    try {
      try { await clearStoredCache(); }
      catch(error) { failure=securityError(); }
      // Even when clearing post content failed, try the credential operation.
      try { await mutateSecurity(message,generation); }
      catch(error) { failure=securityError(); }
      try { await refreshSecurityState(); }
      catch(error) { failure=securityError();credentialReady=false; }
      if(failure) {
        securityFault=true;
        try { await chrome.storage.session.set({securityFault:true}); }catch{/* The in-memory gate stays closed even if this marker cannot be saved. */}
      } else if(generation===securityGeneration) {
        try { await chrome.storage.session.remove('securityFault');securityFault=false; }
        catch(error) {
          securityFault=true;failure=securityError();
          try { await chrome.storage.session.set({securityFault:true}); }catch{/* Readiness remains closed in this worker. */}
        }
      }
    }
    finally {
      securityPending--;
    }
    await broadcastConfig();
    return failure || {ok:true,...securityStatus()};
  });
  securityWrites=operation;
  return operation;
}
async function saveSettings(input) {
  const next=Core.normalizeSettings(input);
  if(JSON.stringify(next)!==JSON.stringify(settings)) {
    const jobSettings=value=>{
      const {explainPrompt,verifyPrompt,commentsPrompt,interfaceLanguage,...other}=value;
      return other;
    };
    const cancelsJobs=JSON.stringify(jobSettings(next))!==JSON.stringify(jobSettings(settings));
    // Prompts are frozen when a job is accepted. Saving a new instruction or
    // interface locale never discards an already paid generation.
    if(cancelsJobs){revision++;for(const job of [...jobs.values()])abortJob(job);}
    settings=next;
    if(cancelsJobs){ratePaused=false;pump();}
    await chrome.storage.local.set({settings});
  }
  await broadcastConfig();
}
function queueSettingsMutation(input) {
  const operation=securityWrites.catch(()=>{}).then(async()=>{
    await ready;
    await saveSettings(typeof input==='function'?input():input);
    return {ok:true};
  });
  securityWrites=operation;
  return operation;
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(trustedUI(sender) && message?.type==='SAVE_KEY') {
    // Reject invalid input without cancelling a valid paid task or touching Key
    // storage. Optional settings join the same blocked credential transaction.
    const raw=message.apiKey,apiKey=typeof raw==='string'?raw.trim():raw==null?'':null;
    if(apiKey===null||typeof raw==='string'&&(/[\r\n]/.test(raw)||raw.trim()&&!validKey(raw))) {respond({ok:false,errorKey:'errors.keyInvalid'});return true;}
    if(message.remember!==undefined&&typeof message.remember!=='boolean') {respond({ok:false,errorKey:'errors.keyInvalid'});return true;}
    const next=message.settings===undefined?undefined:Core.normalizeSettings(message.settings);
    if(next?.provider==='api'&&!next.webSearch&&!next.xSearch) {respond({ok:false,errorKey:'options.urlSearchRequired'});return true;}
    queueSecurityMutation({apiKey,remember:message.remember,settings:next})
      .then(respond).catch(()=>respond(securityError()));
    return true;
  }
  if(trustedUI(sender) && message?.type==='SAVE_SETTINGS') {
    const next=Core.normalizeSettings(message.settings);
    if(next.provider==='api'&&!next.webSearch&&!next.xSearch) {respond({ok:false,errorKey:'options.urlSearchRequired'});return true;}
    // Join the credential chain at receipt so even same-tick saves apply in the
    // user's requested order and cannot overwrite a newer atomic Key save.
    queueSettingsMutation(next).then(respond).catch(()=>respond({ok:false,error:'扩展操作失败，请重新加载扩展。'}));
    return true;
  }
  (async()=>{
    await ready;
    if(message?.type==='OPEN_SETTINGS' && (trustedUI(sender)||trustedFeed(sender))) {await openSettings();return {ok:true};}
    if(message?.type==='OPEN_HISTORY' && (trustedUI(sender)||trustedFeed(sender))) {await openHistory();return {ok:true};}
    if(!trustedUI(sender)) return {ok:false,error:'此操作仅允许在扩展设置页中执行。'};
    if(message.type==='GET_UI_LANGUAGE')return {ok:true,language:await currentUILanguage()};
    if(message.type==='GET_SECURITY_STATUS')return {ok:true,...securityStatus()};
    if(message.type==='TEST_CLI'){
      try{await SuperXCLI.test();cliCheckedAt=0;await broadcastConfig();return {ok:true};}
      catch(error){return {ok:false,...GrokFirstAPI.publicError(error)};}
    }
    if(message.type==='GET_CLI_STATUS'){const previous=cliReady;await refreshCLI(true);if(previous!==cliReady)await broadcastConfig();return {ok:true,ready:cliReady,status:cliStatus};}
    if(message.type==='GET_CONFIG')return {ok:true,...await publicConfig()};
    if(message.type==='GET_HISTORY'||message.type==='GET_HISTORY_STATUS'){
      try{return {ok:true,...await history[message.type==='GET_HISTORY'?'get':'status']()};}
      catch{return {ok:false,errorKey:'history.storageError'};}
    }
    if(['CLEAR_HISTORY','DELETE_HISTORY','SET_HISTORY_ENABLED'].includes(message.type)){
      if(message.type==='DELETE_HISTORY'&&!/^\d{1,25}$/.test(String(message.id||''))||message.type==='SET_HISTORY_ENABLED'&&typeof message.enabled!=='boolean')return {ok:false,errorKey:'history.storageError'};
      try{
        const result=await (message.type==='CLEAR_HISTORY'?history.clear():message.type==='DELETE_HISTORY'?history.delete(message.id):history.setEnabled(message.enabled));
        await broadcastHistoryConfig();return {ok:true,...result};
      }catch{return {ok:false,errorKey:'history.storageError'};}
    }
    if(message.type==='CLEAR_CACHE') { await clearStoredCache();return {ok:true}; }
    return {ok:false,error:'未知操作。'};
  })().then(respond).catch(()=>respond({ok:false,error:'扩展操作失败，请重新加载扩展。'}));
  return true;
});
chrome.alarms?.onAlarm.addListener(alarm=>{
  if(alarm.name===HISTORY_ALARM)void ready.then(()=>history.prune()).then(()=>notifyHistoryChanged()).catch(()=>{});
});
chrome.tabs.onRemoved.addListener(tabId=>{
  ready.then(async()=>{delete quotas[tabId];delete railStates[tabId];await Promise.all([persistQuotas(),persistRailStates()]);});
  for(const client of clients) if(client.tabId===tabId) cancelClient(client);
});
