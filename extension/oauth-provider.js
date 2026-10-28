/* SuperX: device authorization and rotating tokens stay in the trusted worker. */
(function(root){
  'use strict';
  const Core=root.XGrokCore||(typeof require==='function'?require('./feed-core.js'):null);
  const CONFIG=Object.freeze({clientId:'b1a00492-073a-47ea-816f-4c329264a828',scope:'openid offline_access grok-cli:access api:access',
    deviceEndpoint:'https://auth.x.ai/oauth2/device/code',tokenEndpoint:'https://auth.x.ai/oauth2/token',revokeEndpoint:'https://auth.x.ai/oauth2/revoke',modelsEndpoint:'https://api.x.ai/v1/models'});
  const STORAGE_KEY='superxOAuthCredential',ALARMS=Object.freeze({poll:'SUPERX_OAUTH_DEVICE_POLL',refresh:'SUPERX_OAUTH_REFRESH'});
  const MAX_TOKEN=16384,MAX_JSON=1024*1024,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const MESSAGES=Object.freeze({OAUTH_LOGIN_REQUIRED:'Sign in to Grok to continue.',OAUTH_REAUTH_REQUIRED:'Sign in to Grok again to restore this connection.',
    OAUTH_REFRESH_UNCERTAIN:'The login refresh could not be confirmed. Sign in to Grok again.',OAUTH_STORAGE_ERROR:'The Grok login could not be saved safely. Sign in again.',
    OAUTH_CANCELLED:'The Grok login operation was cancelled.',OAUTH_ACCOUNT_CHANGED:'The Grok account changed before this request completed.',
    OAUTH_DEVICE_EXPIRED:'This authorization code expired. Start a new Grok login.',OAUTH_ACCESS_DENIED:'Grok authorization was declined.',
    OAUTH_AUTH_UNAVAILABLE:'Grok authorization is temporarily unavailable.',OAUTH_DEVICE_INVALID:'Grok returned an invalid authorization link or response.',
    OAUTH_CATALOG_UNAVAILABLE:'The available Grok models could not be loaded. Retry loading the models.'});
  const OAUTH_ERRORS=new Set(['authorization_pending','slow_down','access_denied','expired_token','invalid_grant','invalid_client','unauthorized_client','invalid_scope','invalid_request','temporarily_unavailable','server_error']);
  const token=value=>typeof value==='string'&&value.length>0&&value.length<=MAX_TOKEN&&/^[\x21-\x7e]+$/.test(value);
  const finiteTime=value=>Number.isSafeInteger(value)&&value>=0&&value<=8_640_000_000_000_000;
  const lifetime=value=>Number.isInteger(value)&&value>0&&value<=366*24*60*60;
  function failure(code){const error=new Error(MESSAGES[code]||MESSAGES.OAUTH_REAUTH_REQUIRED);error.code=Object.hasOwn(MESSAGES,code)?code:'OAUTH_REAUTH_REQUIRED';return error;}
  function models(value){return [...new Set((Array.isArray(value)?value:[]).filter(id=>typeof id==='string'&&/^grok-[a-z0-9_.-]{1,110}$/i.test(id)))].slice(0,500);}
  // Chrome storage can reorder dictionary keys; fields, values and array order
  // still have to survive the read-back exactly before credentials are used.
  function sameStoredValue(left,right){
    if(left===right)return true;
    if(!left||!right||typeof left!=='object'||typeof right!=='object'||Array.isArray(left)!==Array.isArray(right))return false;
    if(Array.isArray(left)&&left.length!==right.length)return false;
    const keys=Object.keys(left);return keys.length===Object.keys(right).length&&keys.every(key=>Object.hasOwn(right,key)&&sameStoredValue(left[key],right[key]));
  }
  function verificationUri(value,userCode,{complete=false}={}){
    if(typeof value!=='string'||value.length>2048)throw failure('OAUTH_DEVICE_INVALID');
    let url;try{url=new URL(value);}catch{throw failure('OAUTH_DEVICE_INVALID');}
    if(!['https://auth.x.ai','https://accounts.x.ai'].includes(url.origin)||url.username||url.password||url.hash||!['/oauth2/device','/oauth2/device/'].includes(url.pathname))throw failure('OAUTH_DEVICE_INVALID');
    const pairs=[...url.searchParams];
    if(pairs.some(([key,content])=>key==='user_code'?content!==userCode:key==='client_id'?content!==CONFIG.clientId:true)||new Set(pairs.map(([key])=>key)).size!==pairs.length||complete&&!url.searchParams.has('user_code'))throw failure('OAUTH_DEVICE_INVALID');
    return url.href;
  }
  function privateDeviceCode(deviceCode,userCode,complete){return ![userCode,complete,...new URL(complete).searchParams.values()].some(value=>value.includes(deviceCode));}
  function create(options={}){
    const chrome=options.chrome||root.chrome,fetchImpl=options.fetch||root.fetch?.bind(root),crypto=options.crypto||root.crypto;
    const keyStore=options.keyStore||root.SuperXKeyStore?.create({purpose:'oauth-refresh'}),now=options.now||(()=>Date.now());
    const setTimer=options.setTimeout||root.setTimeout.bind(root),clearTimer=options.clearTimeout||root.clearTimeout.bind(root);
    let auth=null,device=null,state='disconnected',remember=true,errorCode='',catalogModels=[],catalogErrorCode='',catalogDiagnostics=null,generation=0,loginAction=0,disposed=false;
    let initialized=false,initializing=null,refreshFlight=null,pollFlight=null,catalogFlight=null,preferenceFlight=null,writes=Promise.resolve(),pollTimer;
    const controllers=new Set();
    const current=ticket=>!disposed&&ticket===generation;
    function assertCurrent(ticket){if(!current(ticket))throw failure('OAUTH_CANCELLED');}
    function status(){
      return {state,connected:Boolean(auth&&!auth.blocked&&auth.accessToken&&['connected','refreshing'].includes(state)),remember,
        expiresAt:auth?.expiresAt||null,credentialId:auth?.credentialId||null,errorCode:errorCode||null,catalogModels:[...catalogModels],catalogErrorCode:catalogErrorCode||null,catalogDiagnostics:catalogDiagnostics?{...catalogDiagnostics}:null,
        ...(device?{device:{userCode:device.userCode,verificationUriComplete:device.verificationUriComplete,expiresAt:device.expiresAt}}:{})};
    }
    function changed(){try{options.onChange?.(status());}catch{/* UI notification never changes credential ownership. */}}
    function safeModels(value){const secrets=[auth?.accessToken,auth?.refreshToken,device?.deviceCode].filter(value=>typeof value==='string'&&value.length);return models(value).filter(id=>!secrets.some(secret=>id.includes(secret)));}
    function catalogFailure(response){
      const httpStatus=Number.isInteger(response?.status)&&response.status>=100&&response.status<=599?response.status:undefined;
      const secrets=[auth?.accessToken,auth?.refreshToken,device?.deviceCode].filter(Boolean),data=response?.data;
      const nodes=[data?.error,data].filter(node=>node&&typeof node==='object'&&!Array.isArray(node));
      const candidates=[typeof data?.error==='string'?data.error:null,...nodes.flatMap(node=>[node.code,node.error_code,node.type])];
      let providerCode;
      for(const raw of candidates){
        if(typeof raw!=='string'||raw.length>256||secrets.some(secret=>raw.includes(secret)))continue;
        const normalized=/:spending[-_]limit$/i.test(raw)?'spending_limit':raw;
        providerCode=Core.apiFailureProviderCode(normalized);if(providerCode)break;
      }
      const reason=Core.accountLimitReason({httpStatus,providerCode})||(httpStatus===401?'auth':httpStatus===403?'access':httpStatus>=500?'server':httpStatus>=200&&httpStatus<300?'response':'unavailable');
      const retryAfterSeconds=Number.isInteger(response?.retryAfterSeconds)&&response.retryAfterSeconds>0&&response.retryAfterSeconds<=86400?response.retryAfterSeconds:undefined;
      return {reason,...(httpStatus!==undefined?{httpStatus}:{}),...(providerCode?{providerCode}:{}),...(retryAfterSeconds!==undefined?{retryAfterSeconds}:{})};
    }
    function failedCatalog(error){
      catalogErrorCode='OAUTH_CATALOG_UNAVAILABLE';
      catalogDiagnostics=error?.catalogDiagnostics||{reason:['OAUTH_LOGIN_REQUIRED','OAUTH_REAUTH_REQUIRED','OAUTH_REFRESH_UNCERTAIN','OAUTH_STORAGE_ERROR'].includes(error?.code)?'auth':'unavailable'};
      changed();
    }
    function serial(ticket,work){const operation=writes.catch(()=>{}).then(async()=>{assertCurrent(ticket);return work();});writes=operation.catch(()=>{});return operation;}
    function invalidate(){generation++;clearTimer(pollTimer);pollTimer=undefined;for(const controller of controllers)controller.abort();controllers.clear();return generation;}
    function waitSignal(promise,signal){
      if(!signal)return promise;if(signal.aborted)return Promise.reject(failure('OAUTH_CANCELLED'));
      return new Promise((resolve,reject)=>{const abort=()=>finish(false,failure('OAUTH_CANCELLED'));let settled=false;
        function finish(ok,value){if(settled)return;settled=true;signal.removeEventListener('abort',abort);if(ok)resolve(value);else reject(value);}
        signal.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(value=>finish(true,value),error=>finish(false,error));});
    }
    async function readJSON(response){
      let text='';
      if(response.body?.getReader){const reader=response.body.getReader(),decoder=new TextDecoder();let size=0;
        try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_JSON){try{await reader.cancel();}catch{}throw failure('OAUTH_AUTH_UNAVAILABLE');}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock?.();}}
      else{text=await response.text();if(text.length>MAX_JSON)throw failure('OAUTH_AUTH_UNAVAILABLE');}
      let value;try{value=JSON.parse(text);}catch{throw failure('OAUTH_AUTH_UNAVAILABLE');}
      if(!value||typeof value!=='object'||Array.isArray(value))throw failure('OAUTH_AUTH_UNAVAILABLE');return value;
    }
    async function request(endpoint,{form,accessToken,method='POST',ticket=generation}={}){
      assertCurrent(ticket);const controller=new AbortController();controllers.add(controller);let timedOut=false,responseReceived=false,httpStatus;
      const timer=setTimer(()=>{timedOut=true;controller.abort();},30000),startedAt=now(),isCatalog=endpoint===CONFIG.modelsEndpoint;
      try{
        const headers=accessToken?{Authorization:`Bearer ${accessToken}`}:{'Content-Type':'application/x-www-form-urlencoded'};
        const response=await fetchImpl(endpoint,{method,headers,...(form?{body:new URLSearchParams(form).toString()}:{}),signal:controller.signal,credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer'});
        responseReceived=true;httpStatus=response.status;
        if(response.redirected||response.url&&response.url!==endpoint)throw failure('OAUTH_AUTH_UNAVAILABLE');
        let data;try{data=await readJSON(response);}catch(error){if(response.ok)throw error;data={};}
        const raw=typeof data.error==='string'?data.error:data.error?.code;
        const retryAfter=response.headers?.get?.('Retry-After');let retryAfterSeconds;
        if(isCatalog&&typeof retryAfter==='string'&&retryAfter.length<=128){
          const trimmed=retryAfter.trim(),seconds=/^\d+$/.test(trimmed)?Number(trimmed):Math.ceil((Date.parse(trimmed)-now())/1000);
          if(Number.isInteger(seconds)&&seconds>0&&seconds<=86400)retryAfterSeconds=seconds;
        }
        return {ok:response.ok,status:response.status,data,error:OAUTH_ERRORS.has(raw)?raw:'unknown_error',startedAt,receivedAt:now(),...(retryAfterSeconds!==undefined?{retryAfterSeconds}:{})};
      }catch{
        const error=failure(current(ticket)?'OAUTH_AUTH_UNAVAILABLE':'OAUTH_CANCELLED');
        if(isCatalog&&current(ticket))error.catalogDiagnostics={reason:timedOut?'timeout':responseReceived?'response':'network',...(Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599?{httpStatus}:{})};
        throw error;
      }
      finally{clearTimer(timer);controllers.delete(controller);}
    }
    function base(value,phase){return {schema:1,kind:'auth',phase,credentialId:value.credentialId,revision:value.revision,remember:value.remember,expiresAt:value.expiresAt,lifetimeMs:value.lifetimeMs,catalogModels:[...catalogModels]};}
    async function writeVerified(area,value,ticket){assertCurrent(ticket);await area.set({[STORAGE_KEY]:value});assertCurrent(ticket);const saved=await area.get(STORAGE_KEY);assertCurrent(ticket);if(!sameStoredValue(saved[STORAGE_KEY],value))throw failure('OAUTH_STORAGE_ERROR');}
    async function commit(value,ticket){
      return serial(ticket,async()=>{
        try{
          let refreshEncrypted;
          if(value.remember){refreshEncrypted=await keyStore.seal(value.refreshToken);assertCurrent(ticket);if(!keyStore.isEnvelope(refreshEncrypted)||await keyStore.open(refreshEncrypted)!==value.refreshToken)throw failure('OAUTH_STORAGE_ERROR');assertCurrent(ticket);}
          const local={...base(value,'committing'),...(refreshEncrypted?{refreshEncrypted}:{})};
          const session={...base(value,'ready'),accessToken:value.accessToken,...(!value.remember?{refreshToken:value.refreshToken}:{})};
          await writeVerified(chrome.storage.local,local,ticket);
          await writeVerified(chrome.storage.session,session,ticket);
          await writeVerified(chrome.storage.local,{...local,phase:'ready'},ticket);
        }catch(error){if(!current(ticket))throw failure('OAUTH_CANCELLED');throw failure('OAUTH_STORAGE_ERROR');}
      });
    }
    async function intent(value,ticket){
      return serial(ticket,async()=>{
        try{
          const local=(await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY],session=(await chrome.storage.session.get(STORAGE_KEY))[STORAGE_KEY];assertCurrent(ticket);
          if(!same(local,value)||local.phase!=='ready'||session&&(session.phase!=='ready'||!same(session,value)))throw failure('OAUTH_REAUTH_REQUIRED');
          await writeVerified(chrome.storage.local,{...local,phase:'refreshing'},ticket);
          await writeVerified(chrome.storage.session,{...base(value,'refreshing')},ticket);
        }catch(error){if(!current(ticket))throw failure('OAUTH_CANCELLED');throw failure(error.code==='OAUTH_REAUTH_REQUIRED'?error.code:'OAUTH_STORAGE_ERROR');}
      });
    }
    function same(record,value){return record?.schema===1&&record.kind==='auth'&&UUID.test(record.credentialId||'')&&UUID.test(record.revision||'')&&record.credentialId===value.credentialId&&record.revision===value.revision&&record.remember===value.remember&&record.expiresAt===value.expiresAt;}
    async function alarmsClear(ticket){return serial(ticket,async()=>{for(const name of Object.values(ALARMS)){assertCurrent(ticket);await chrome.alarms.clear(name);}});}
    async function alarm(name,when,ticket){return serial(ticket,async()=>{assertCurrent(ticket);const previous=await chrome.alarms.get?.(name);assertCurrent(ticket);const due=Math.max(now()+1000,when);if(!previous||previous.scheduledTime!==due)await chrome.alarms.create(name,{when:due});});}
    async function refreshAlarm(ticket){if(!auth||auth.blocked)return;const margin=Math.min(60000,Math.max(50,auth.lifetimeMs*0.1));try{await alarm(ALARMS.refresh,auth.expiresAt-margin,ticket);}catch{/* Every inference also checks freshness. */}}
    async function schedulePoll(ticket){
      if(!device)return;clearTimer(pollTimer);const when=Math.min(device.expiresAt,device.nextPollAt);
      try{await alarm(ALARMS.poll,when,ticket);}catch{/* The live worker timer is an independent fallback. */}
      if(current(ticket)&&device)pollTimer=setTimer(()=>{pollTimer=undefined;void poll().catch(()=>{});},Math.max(1,when-now()));
    }
    async function revoke(refreshToken){
      if(!token(refreshToken)||typeof fetchImpl!=='function')return;
      const controller=new AbortController(),timer=setTimer(()=>controller.abort(),15000);
      try{const response=await fetchImpl(CONFIG.revokeEndpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CONFIG.clientId,token:refreshToken,token_type_hint:'refresh_token'}).toString(),credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});try{await response.body?.cancel?.();}catch{}}catch{/* Local logout does not depend on the revocation server. */}finally{clearTimer(timer);}
    }
    async function clearStored(ticket){
      await serial(ticket,async()=>{
        let failed=false;const tombstone={schema:1,kind:'signed_out',revision:crypto.randomUUID(),remember};
        for(const area of [chrome.storage.local,chrome.storage.session]){try{await writeVerified(area,tombstone,ticket);}catch(error){if(!current(ticket))throw error;failed=true;}}
        assertCurrent(ticket);try{await keyStore.clear();}catch{failed=true;}assertCurrent(ticket);if(failed)throw failure('OAUTH_STORAGE_ERROR');
      });
      await alarmsClear(ticket);
    }
    async function block(code,ticket){
      if(!current(ticket))return;
      if(auth)auth={...auth,blocked:true,accessToken:''};device=null;state='reauth_required';errorCode=code;changed();clearTimer(pollTimer);pollTimer=undefined;
      try{await serial(ticket,async()=>{const marker={schema:1,kind:'blocked',credentialId:auth?.credentialId||null,errorCode:code};for(const area of [chrome.storage.local,chrome.storage.session]){assertCurrent(ticket);try{await writeVerified(area,marker,ticket);}catch(error){if(!current(ticket))throw error;}}assertCurrent(ticket);try{await keyStore.clear();}catch{}});}catch{}
      try{await alarmsClear(ticket);}catch{}
    }
    function tokenResponse(response,previous,initial=false){
      const value=response.data;if(!response.ok||!token(value.access_token)||!lifetime(value.expires_in)||(initial?String(value.token_type).toLowerCase()!=='bearer':value.token_type!==undefined&&String(value.token_type).toLowerCase()!=='bearer')||initial&&!token(value.refresh_token)||value.refresh_token!==undefined&&!token(value.refresh_token))throw failure('OAUTH_REAUTH_REQUIRED');
      const refreshToken=value.refresh_token===undefined?previous?.refreshToken:value.refresh_token;if(!token(refreshToken))throw failure('OAUTH_REAUTH_REQUIRED');
      return {credentialId:previous?.credentialId||crypto.randomUUID(),revision:crypto.randomUUID(),accessToken:value.access_token,refreshToken,expiresAt:response.startedAt+value.expires_in*1000,lifetimeMs:value.expires_in*1000,remember:previous?.remember??remember};
    }
    async function refresh(ticket){
      const previous=auth;if(!previous||previous.blocked||!token(previous.refreshToken))throw failure('OAUTH_LOGIN_REQUIRED');
      state=state==='restoring'?'restoring':'refreshing';errorCode='';changed();
      try{
        await intent(previous,ticket);assertCurrent(ticket);
        const response=await request(CONFIG.tokenEndpoint,{form:{grant_type:'refresh_token',client_id:CONFIG.clientId,refresh_token:previous.refreshToken},ticket});
        if(!current(ticket)){if(response.ok)await revoke(token(response.data.refresh_token)?response.data.refresh_token:previous.refreshToken);throw failure('OAUTH_CANCELLED');}
        if(!response.ok)throw failure(response.error==='invalid_grant'||response.error==='access_denied'?'OAUTH_LOGIN_REQUIRED':'OAUTH_REFRESH_UNCERTAIN');
        let next;try{next=tokenResponse(response,previous);}catch{await revoke(token(response.data.refresh_token)?response.data.refresh_token:previous.refreshToken);throw failure('OAUTH_REFRESH_UNCERTAIN');}
        try{await commit(next,ticket);}catch(error){await revoke(next.refreshToken);throw error;}
        assertCurrent(ticket);auth=next;remember=next.remember;state='connected';errorCode='';changed();await refreshAlarm(ticket);return {accessToken:next.accessToken,credentialId:next.credentialId};
      }catch(error){if(!current(ticket))throw failure('OAUTH_CANCELLED');const code=['OAUTH_LOGIN_REQUIRED','OAUTH_STORAGE_ERROR','OAUTH_REAUTH_REQUIRED'].includes(error.code)?error.code:'OAUTH_REFRESH_UNCERTAIN';await block(code,ticket);throw failure(code);}
    }
    function beginRefresh(ticket){
      if(refreshFlight?.ticket===ticket)return refreshFlight.promise;
      const flight={ticket,promise:null};flight.promise=refresh(ticket).finally(()=>{if(refreshFlight===flight)refreshFlight=null;});refreshFlight=flight;return flight.promise;
    }
    async function ensureAccessToken({signal,forceRefresh=false,expectedCredentialId,rejectedAccessToken}={}){
      await waitSignal(initialize(),signal);const ticket=generation;assertCurrent(ticket);
      if(preferenceFlight?.ticket===ticket)await waitSignal(preferenceFlight.promise,signal);
      assertCurrent(ticket);
      if(expectedCredentialId&&expectedCredentialId!==auth?.credentialId)throw failure('OAUTH_ACCOUNT_CHANGED');
      if(!auth||auth.blocked)throw failure(errorCode&&Object.hasOwn(MESSAGES,errorCode)?errorCode:'OAUTH_LOGIN_REQUIRED');
      const margin=Math.min(60000,Math.max(50,auth.lifetimeMs*0.1));
      if(refreshFlight?.ticket===ticket)return waitSignal(refreshFlight.promise,signal);
      const forced=forceRefresh&&(!rejectedAccessToken||rejectedAccessToken===auth.accessToken);
      if(!forced&&token(auth.accessToken)&&auth.expiresAt-now()>margin)return {accessToken:auth.accessToken,credentialId:auth.credentialId};
      return waitSignal(beginRefresh(ticket),signal);
    }
    async function catalog({signal}={}){
      await waitSignal(initialize(),signal);if(catalogFlight?.ticket===generation)return waitSignal(catalogFlight.promise,signal);
      const ticket=generation,flight={ticket,promise:null};
      flight.promise=(async()=>{try{
        let access=await ensureAccessToken({signal,expectedCredentialId:auth?.credentialId});
        let response=await request(CONFIG.modelsEndpoint,{method:'GET',accessToken:access.accessToken,ticket});
        if(response.status===401){access=await ensureAccessToken({forceRefresh:true,rejectedAccessToken:access.accessToken,expectedCredentialId:access.credentialId});response=await request(CONFIG.modelsEndpoint,{method:'GET',accessToken:access.accessToken,ticket});}
        assertCurrent(ticket);if(!response.ok||!Array.isArray(response.data.data))throw Object.assign(failure('OAUTH_CATALOG_UNAVAILABLE'),{catalogDiagnostics:catalogFailure(response)});
        catalogModels=safeModels(response.data.data.flatMap(item=>[item?.id,item?.model]));catalogErrorCode='';catalogDiagnostics=null;changed();
        const snapshot=auth;
        await serial(ticket,async()=>{if(auth!==snapshot||state!=='connected')return;for(const area of [chrome.storage.local,chrome.storage.session]){const record=(await area.get(STORAGE_KEY))[STORAGE_KEY];assertCurrent(ticket);if(same(record,snapshot)&&record.phase==='ready')await writeVerified(area,{...record,catalogModels:[...catalogModels]},ticket);}}).catch(()=>{});
      }catch(error){if(current(ticket))failedCatalog(error);}return status();})();
      catalogFlight=flight;try{return await waitSignal(flight.promise,signal);}finally{if(catalogFlight===flight)catalogFlight=null;}
    }
    async function saveDevice(ticket){return serial(ticket,async()=>{if(!device)throw failure('OAUTH_CANCELLED');try{const local={schema:1,kind:'device',credentialId:device.id,remember,scope:CONFIG.scope};await writeVerified(chrome.storage.local,local,ticket);await writeVerified(chrome.storage.session,{...local,device:{...device}},ticket);}catch(error){if(!current(ticket))throw error;throw failure('OAUTH_STORAGE_ERROR');}});}
    async function poll(){
      const ticket=generation;if(pollFlight?.ticket===ticket)return pollFlight.promise;if(!device||!current(ticket))return status();
      const flight={ticket,promise:null};flight.promise=(async()=>{
        try{
          if(now()>=device.expiresAt){await block('OAUTH_DEVICE_EXPIRED',ticket);return status();}
          if(now()<device.nextPollAt){await schedulePoll(ticket);return status();}
          const challenge=device;device={...challenge,polling:true,nextPollAt:now()+challenge.intervalMs};await saveDevice(ticket);
          const response=await request(CONFIG.tokenEndpoint,{form:{grant_type:'urn:ietf:params:oauth:grant-type:device_code',client_id:CONFIG.clientId,device_code:challenge.deviceCode},ticket});
          if(!current(ticket)){if(response.ok&&token(response.data.refresh_token))await revoke(response.data.refresh_token);return status();}
          if(!response.ok){
            if(['authorization_pending','slow_down'].includes(response.error)||response.status>=500||response.status===429){device={...device,polling:false,intervalMs:device.intervalMs+(response.error==='slow_down'?5000:0)};device.nextPollAt=now()+device.intervalMs;await saveDevice(ticket);await schedulePoll(ticket);return status();}
            await block(response.error==='expired_token'?'OAUTH_DEVICE_EXPIRED':response.error==='access_denied'?'OAUTH_ACCESS_DENIED':'OAUTH_LOGIN_REQUIRED',ticket);return status();
          }
          let next;try{next=tokenResponse(response,null,true);}catch(error){if(token(response.data.refresh_token))await revoke(response.data.refresh_token);throw error;}
          try{await commit(next,ticket);}catch(error){await revoke(next.refreshToken);throw error;}
          assertCurrent(ticket);auth=next;device=null;state='connected';errorCode='';catalogModels=[];changed();clearTimer(pollTimer);pollTimer=undefined;
          await serial(ticket,()=>chrome.alarms.clear(ALARMS.poll));await refreshAlarm(ticket);
          // Only a free model-directory request follows login, never inference.
          await loadCatalogAfterAuthentication(ticket);return status();
        }catch(error){if(current(ticket))await block(error.code==='OAUTH_STORAGE_ERROR'?error.code:error.code==='OAUTH_AUTH_UNAVAILABLE'?'OAUTH_AUTH_UNAVAILABLE':'OAUTH_REAUTH_REQUIRED',ticket);return status();}
      })();pollFlight=flight;try{return await flight.promise;}finally{if(pollFlight===flight)pollFlight=null;}
    }
    // This internal path avoids initialize -> catalog -> initialize recursion.
    async function loadCatalogAfterAuthentication(ticket){
      try{const snapshot=auth;const response=await request(CONFIG.modelsEndpoint,{method:'GET',accessToken:snapshot.accessToken,ticket});assertCurrent(ticket);if(!response.ok||!Array.isArray(response.data.data))throw Object.assign(failure('OAUTH_CATALOG_UNAVAILABLE'),{catalogDiagnostics:catalogFailure(response)});catalogModels=safeModels(response.data.data.flatMap(item=>[item?.id,item?.model]));catalogErrorCode='';catalogDiagnostics=null;changed();
        await serial(ticket,async()=>{if(auth!==snapshot)return;for(const area of [chrome.storage.local,chrome.storage.session]){const record=(await area.get(STORAGE_KEY))[STORAGE_KEY];assertCurrent(ticket);if(same(record,snapshot)&&record.phase==='ready')await writeVerified(area,{...record,catalogModels:[...catalogModels]},ticket);}}).catch(()=>{});
      }catch(error){if(current(ticket))failedCatalog(error);}
    }
    function initialize(){
      if(initialized)return Promise.resolve(status());if(initializing)return initializing;
      const ticket=generation;state='restoring';changed();
      initializing=(async()=>{
        try{
          const [localData,sessionData]=await Promise.all([chrome.storage.local.get(STORAGE_KEY),chrome.storage.session.get(STORAGE_KEY)]);assertCurrent(ticket);
          const local=localData[STORAGE_KEY],session=sessionData[STORAGE_KEY];
          if(!local||local.kind==='signed_out'){remember=typeof local?.remember==='boolean'?local.remember:true;state='disconnected';try{await alarmsClear(ticket);}catch{}return status();}
          if(local.kind==='blocked'){state='reauth_required';errorCode=Object.hasOwn(MESSAGES,local.errorCode)?local.errorCode:'OAUTH_REAUTH_REQUIRED';try{await alarmsClear(ticket);}catch{}return status();}
          if(local.kind==='device'){
            // An issued challenge keeps its original requested permissions.
            // Only a new user action may replace a legacy wider-scope login.
            if(local.scope!==CONFIG.scope||session?.scope!==CONFIG.scope){remember=local.remember!==false;await clearStored(ticket);state='disconnected';errorCode='';return status();}
            const saved=session?.device;if(local.schema===1&&UUID.test(local.credentialId||'')&&session?.schema===1&&session.kind==='device'&&session.credentialId===local.credentialId&&saved&&saved.id===local.credentialId&&saved.polling===false&&token(saved.deviceCode)&&typeof saved.userCode==='string'&&/^[A-Za-z0-9-]{4,32}$/.test(saved.userCode)&&finiteTime(saved.expiresAt)&&Number.isSafeInteger(saved.intervalMs)&&saved.intervalMs>=1000&&saved.intervalMs<=3600000&&finiteTime(saved.nextPollAt)){
              if(saved.expiresAt<=now()){await block('OAUTH_DEVICE_EXPIRED',ticket);return status();}
              const complete=verificationUri(saved.verificationUriComplete,saved.userCode,{complete:true});if(!privateDeviceCode(saved.deviceCode,saved.userCode,complete))throw failure('OAUTH_DEVICE_INVALID');
              device={id:saved.id,deviceCode:saved.deviceCode,userCode:saved.userCode,verificationUriComplete:complete,expiresAt:saved.expiresAt,intervalMs:saved.intervalMs,nextPollAt:saved.nextPollAt,polling:false};remember=local.remember!==false;state='awaiting_authorization';await schedulePoll(ticket);return status();
            }
            if(!session){state='disconnected';return status();}await block('OAUTH_REAUTH_REQUIRED',ticket);return status();
          }
          if(local.kind!=='auth'||local.phase!=='ready'||!UUID.test(local.credentialId||'')||!UUID.test(local.revision||'')||typeof local.remember!=='boolean'||!finiteTime(local.expiresAt)||!Number.isFinite(local.lifetimeMs)||local.lifetimeMs<=0||session&&(session.phase!=='ready'||!same(session,local))){await block('OAUTH_REAUTH_REQUIRED',ticket);return status();}
          remember=local.remember;catalogModels=models(session?.catalogModels||local.catalogModels);
          let refreshToken;
          if(remember){
            if(!keyStore.isEnvelope(local.refreshEncrypted))throw failure('OAUTH_STORAGE_ERROR');
            try{refreshToken=await keyStore.open(local.refreshEncrypted);}catch{throw failure('OAUTH_STORAGE_ERROR');}
            if(!current(ticket)){await revoke(refreshToken);throw failure('OAUTH_CANCELLED');}
          }
          else refreshToken=session?.refreshToken;
          if(!token(refreshToken)){if(!remember&&!session){state='disconnected';return status();}throw failure('OAUTH_REAUTH_REQUIRED');}
          auth={credentialId:local.credentialId,revision:local.revision,remember,expiresAt:local.expiresAt,lifetimeMs:local.lifetimeMs,refreshToken,accessToken:token(session?.accessToken)?session.accessToken:''};
          catalogModels=safeModels(catalogModels);
          const margin=Math.min(60000,Math.max(50,auth.lifetimeMs*0.1));
          if(!auth.accessToken||auth.expiresAt-now()<=margin)await beginRefresh(ticket);
          else{state='connected';errorCode='';changed();await refreshAlarm(ticket);}
          if(current(ticket)&&auth&&!auth.blocked&&!catalogModels.length)await loadCatalogAfterAuthentication(ticket);
        }catch(error){if(current(ticket))await block(error.code==='OAUTH_STORAGE_ERROR'?'OAUTH_STORAGE_ERROR':'OAUTH_REAUTH_REQUIRED',ticket);}
        finally{if(current(ticket)){initialized=true;changed();}}
        return status();
      })();return initializing;
    }
    async function startLogin({remember:choice=true}={}){
      const action=++loginAction;await initialize();if(action!==loginAction||disposed)return status();
      const previous=auth?.refreshToken,ticket=invalidate();initialized=true;auth=null;device=null;catalogModels=[];catalogErrorCode='';catalogDiagnostics=null;remember=choice!==false;state='starting';errorCode='';changed();
      if(previous)void revoke(previous);
      try{
        await clearStored(ticket);assertCurrent(ticket);
        const response=await request(CONFIG.deviceEndpoint,{form:{client_id:CONFIG.clientId,scope:CONFIG.scope},ticket});assertCurrent(ticket);
        if(!response.ok)throw failure('OAUTH_AUTH_UNAVAILABLE');const value=response.data;
        if(!token(value.device_code)||typeof value.user_code!=='string'||!/^[A-Za-z0-9-]{4,32}$/.test(value.user_code)||!lifetime(value.expires_in)||value.interval!==undefined&&(!Number.isInteger(value.interval)||value.interval<1||value.interval>3600))throw failure('OAUTH_DEVICE_INVALID');
        const plain=verificationUri(value.verification_uri,value.user_code),complete=value.verification_uri_complete?verificationUri(value.verification_uri_complete,value.user_code,{complete:true}):(()=>{const url=new URL(plain);url.searchParams.set('user_code',value.user_code);return verificationUri(url.href,value.user_code,{complete:true});})();
        if(!privateDeviceCode(value.device_code,value.user_code,complete))throw failure('OAUTH_DEVICE_INVALID');
        device={id:crypto.randomUUID(),deviceCode:value.device_code,userCode:value.user_code,verificationUriComplete:complete,expiresAt:response.startedAt+value.expires_in*1000,intervalMs:(value.interval||5)*1000,nextPollAt:now()+(value.interval||5)*1000,polling:false};
        state='awaiting_authorization';await saveDevice(ticket);assertCurrent(ticket);changed();await schedulePoll(ticket);
      }catch(error){if(current(ticket)){device=null;state='error';errorCode=Object.hasOwn(MESSAGES,error.code)?error.code:'OAUTH_AUTH_UNAVAILABLE';changed();}}
      return status();
    }
    async function cancelLogin(){
      loginAction++;
      if(auth&&!device&&!['starting','awaiting_authorization'].includes(state))return status();
      const ticket=invalidate();initialized=true;auth=null;device=null;state='disconnected';errorCode='';catalogModels=[];catalogErrorCode='';catalogDiagnostics=null;changed();
      try{await clearStored(ticket);}catch{if(current(ticket)){state='error';errorCode='OAUTH_STORAGE_ERROR';changed();}}return status();
    }
    async function logout(){
      loginAction++;
      const previous=auth?.refreshToken,ticket=invalidate();initialized=true;auth=null;device=null;state='disconnected';errorCode='';catalogModels=[];catalogErrorCode='';catalogDiagnostics=null;changed();
      if(previous)void revoke(previous);
      try{await clearStored(ticket);}catch{if(current(ticket)){state='error';errorCode='OAUTH_STORAGE_ERROR';changed();}}return status();
    }
    function setRemember(value){
      const ticket=generation,previous=preferenceFlight,flight={ticket,promise:null};
      flight.promise=(async()=>{
        if(previous?.ticket===ticket)try{await previous.promise;}catch{}
        await initialize();if(!current(ticket))return status();
        if(refreshFlight?.ticket===ticket)try{await refreshFlight.promise;}catch{}
        if(pollFlight?.ticket===ticket)try{await pollFlight.promise;}catch{}
        if(!current(ticket))return status();remember=value!==false;
        if(device){try{await saveDevice(ticket);}catch{await block('OAUTH_STORAGE_ERROR',ticket);}changed();return status();}
        if(!auth||auth.blocked){
          if(!auth&&!device&&state==='disconnected')try{await serial(ticket,async()=>{const marker={schema:1,kind:'signed_out',revision:crypto.randomUUID(),remember};await writeVerified(chrome.storage.local,marker,ticket);await writeVerified(chrome.storage.session,marker,ticket);});}catch{if(current(ticket)){state='error';errorCode='OAUTH_STORAGE_ERROR';}}
          changed();return status();
        }
        const next={...auth,remember,revision:crypto.randomUUID()};
        try{await commit(next,ticket);assertCurrent(ticket);auth=next;state='connected';changed();await refreshAlarm(ticket);}catch(error){if(current(ticket))await block('OAUTH_STORAGE_ERROR',ticket);}return status();
      })().finally(()=>{if(preferenceFlight===flight)preferenceFlight=null;});
      preferenceFlight=flight;return flight.promise;
    }
    async function handleAlarm(value){
      if(!Object.values(ALARMS).includes(value?.name))return status();await initialize();
      if(value.name===ALARMS.poll)return poll();
      if(auth&&!auth.blocked){try{await ensureAccessToken();await refreshAlarm(generation);}catch{}}return status();
    }
    function dispose(){loginAction++;invalidate();disposed=true;}
    return Object.freeze({initialize,status,startLogin,cancelLogin,logout,setRemember,ensureAccessToken,catalog,handleAlarm,dispose});
  }
  const api=Object.freeze({create,CONFIG,ALARMS,STORAGE_KEY});root.SuperXOAuth=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
