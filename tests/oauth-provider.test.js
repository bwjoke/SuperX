'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const OAuth=require('../extension/oauth-provider.js');
const clone=value=>value===undefined?undefined:structuredClone(value),tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function until(predicate,label='OAuth work'){for(let count=0;count<100;count++){if(predicate())return;await tick();}assert.fail('Timed out waiting for '+label);}
function area(data={},hooks={},roundTrip=clone){return {data,async get(keys){await hooks.get?.(keys);return Object.fromEntries((typeof keys==='string'?[keys]:keys).filter(key=>Object.hasOwn(data,key)).map(key=>[key,roundTrip(data[key])]));},async set(values){await hooks.set?.(values);Object.assign(data,clone(values));},async remove(keys){await hooks.remove?.(keys);for(const key of typeof keys==='string'?[keys]:keys)delete data[key];}};}
function sortedStorage(value){return Array.isArray(value)?value.map(sortedStorage):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sortedStorage(value[key])])):value;}
function cryptoStore(profile={key:null}){
  return {profile,isEnvelope:value=>value?.version===1&&value.algorithm==='AES-GCM'&&typeof value.iv==='string'&&typeof value.ciphertext==='string',
    async seal(raw){profile.key||=await webcrypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);const iv=webcrypto.getRandomValues(new Uint8Array(12));const buffer=await webcrypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('oauth-test')},profile.key,new TextEncoder().encode(raw));return {version:1,algorithm:'AES-GCM',iv:Buffer.from(iv).toString('base64'),ciphertext:Buffer.from(buffer).toString('base64')};},
    async open(value){if(!profile.key)throw Error('PRIVATE_CRYPTO_MISSING');return new TextDecoder().decode(await webcrypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(value.iv,'base64'),additionalData:new TextEncoder().encode('oauth-test')},profile.key,Buffer.from(value.ciphertext,'base64')));},async clear(){profile.key=null;}};
}
const AT='ACCESS_TOKEN_PRIVATE_FIXTURE',RT='REFRESH_TOKEN_PRIVATE_FIXTURE',DEVICE='DEVICE_CODE_PRIVATE_FIXTURE';
const deviceResponse=(extra={})=>({device_code:DEVICE,user_code:'TEST-ONLY',verification_uri:'https://accounts.x.ai/oauth2/device',verification_uri_complete:'https://accounts.x.ai/oauth2/device?user_code=TEST-ONLY',expires_in:600,interval:5,...extra});
const grant=(extra={})=>({access_token:AT,refresh_token:RT,token_type:'Bearer',expires_in:3600,...extra});
const response=(value,status=200)=>new Response(typeof value==='string'?value:JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
function harness(options={}){
  let time=options.time||1800000000000;const timers=[],calls=[],changes=[],alarms=new Map(),profile=options.profile||{key:null};
  const local=area(options.local||{},options.localHooks,options.storageRoundTrip),session=area(options.session||{},options.sessionHooks,options.storageRoundTrip);
  const clock={now:()=>time,setTimeout(fn,delay){const timer={fn,delay,due:time+delay,cancelled:false};timers.push(timer);return timer;},clearTimeout(timer){if(timer)timer.cancelled=true;}};
  const chrome={storage:{local,session},alarms:{async get(name){return clone(alarms.get(name));},async create(name,value){alarms.set(name,{name,scheduledTime:value.when});},async clear(name){return alarms.delete(name);}}};
  const h={time:()=>time,local,session,profile,alarms,timers,calls,changes,advance(ms){time+=ms;for(const timer of timers.filter(value=>!value.cancelled&&value.due<=time)){timer.cancelled=true;timer.fn();}},
    async alarm(name,advance=0){if(advance)time+=advance;return h.oauth.handleAlarm({name});},
    count(endpoint,grantType){return calls.filter(call=>call.url===endpoint&&(!grantType||call.form?.get('grant_type')===grantType)).length;}};
  const fetch=async(url,input)=>{const call={url,input,form:input.body?new URLSearchParams(input.body):null};calls.push(call);if(options.fetch){const result=await options.fetch(call,h);if(result!==undefined)return result;}
    if(url===OAuth.CONFIG.deviceEndpoint)return response(deviceResponse());
    if(url===OAuth.CONFIG.tokenEndpoint)return response(grant());
    if(url===OAuth.CONFIG.modelsEndpoint)return response({data:[{id:'grok-4.3'},{id:'grok-4.7'},{id:'grok-4.3'},{id:'UNSAFE_NOT_A_GROK_MODEL'}]});
    if(url===OAuth.CONFIG.revokeEndpoint)return response({});throw Error('Unexpected endpoint '+url);};
  h.oauth=OAuth.create({chrome,fetch,crypto:webcrypto,keyStore:options.keyStore||cryptoStore(profile),...clock,onChange:value=>changes.push(clone(value))});
  h.login=async(remember=true)=>{await h.oauth.initialize();const pending=await h.oauth.startLogin({remember});assert.equal(pending.state,'awaiting_authorization');h.advance(5000);await h.oauth.handleAlarm({name:OAuth.ALARMS.poll});assert.equal(h.oauth.status().connected,true);return h.oauth.status();};
  return h;
}
function noSecrets(value){const text=JSON.stringify(value);for(const secret of [AT,RT,DEVICE])assert.equal(text.includes(secret),false);assert.doesNotMatch(text,/access_token|refresh_token|device_code|refreshEncrypted|accessToken|refreshToken|deviceCode/);}

test('public shared-client device flow uses fixed official endpoints and exposes only a short authorization code',async()=>{
  const h=harness();const status=await h.login();assert.equal(status.state,'connected');assert.deepEqual(status.catalogModels,['grok-4.3','grok-4.7']);assert.equal(status.catalogErrorCode,null);assert.match(status.credentialId,/^[0-9a-f-]{36}$/);assert.equal(h.count(OAuth.CONFIG.modelsEndpoint),1);
  assert.equal(h.calls.some(call=>call.url.includes('/responses')),false);const start=h.calls.find(call=>call.url===OAuth.CONFIG.deviceEndpoint);assert.equal(start.form.get('client_id'),'b1a00492-073a-47ea-816f-4c329264a828');assert.deepEqual(start.form.get('scope').split(' '),['openid','offline_access','grok-cli:access','api:access']);assert.equal(start.form.get('scope').split(' ').some(scope=>['profile','email'].includes(scope)),false);assert.equal(start.form.has('client_secret'),false);
  for(const call of h.calls){assert.equal(call.input.redirect,'error');assert.equal(call.input.credentials,'omit');assert.equal(call.input.cache,'no-store');assert.equal(call.input.referrerPolicy,'no-referrer');assert.equal(Object.keys(call.input.headers).some(key=>/grok-client|user.?id|kilo|proxy/i.test(key)),false);}
  const catalogue=h.calls.find(call=>call.url===OAuth.CONFIG.modelsEndpoint);assert.deepEqual(catalogue.input.headers,{Authorization:'Bearer '+AT});assert.equal(catalogue.input.method,'GET');noSecrets(status);noSecrets(h.changes);
  const local=h.local.data[OAuth.STORAGE_KEY],session=h.session.data[OAuth.STORAGE_KEY];assert.equal(JSON.stringify(local).includes(RT),false);assert.equal(JSON.stringify(local).includes(AT),false);assert.equal(session.accessToken,AT);assert.equal(session.refreshToken,undefined);assert.equal(session.credentialId,local.credentialId);assert.equal(session.revision,local.revision);assert.equal(local.phase,'ready');
});

test('authorization rejects nonofficial origins, unexpected paths, credentials, fragments and unsafe query parameters',async()=>{
  for(const uri of ['http://accounts.x.ai/oauth2/device?user_code=TEST-ONLY','https://evil.test/oauth2/device?user_code=TEST-ONLY','https://accounts.x.ai.evil.test/oauth2/device?user_code=TEST-ONLY','https://name:password@accounts.x.ai/oauth2/device?user_code=TEST-ONLY','https://accounts.x.ai/oauth2/token?user_code=TEST-ONLY','https://accounts.x.ai/oauth2/device?user_code=TEST-ONLY#secret','https://accounts.x.ai/oauth2/device?user_code=TEST-ONLY&access_token=CANARY','https://accounts.x.ai/oauth2/device?user_code=TEST-ONLY&device%5fcode=CANARY','https://accounts.x.ai/oauth2/device?user_code=OTHER','https://accounts.x.ai/oauth2/device?user_code=TEST-ONLY&user_code=TEST-ONLY']){
    const h=harness({fetch:call=>call.url===OAuth.CONFIG.deviceEndpoint?response(deviceResponse({verification_uri_complete:uri})):undefined});await h.oauth.initialize();const status=await h.oauth.startLogin();assert.equal(status.state,'error');assert.equal(status.errorCode,'OAUTH_DEVICE_INVALID');assert.equal(status.device,undefined);assert.equal(h.count(OAuth.CONFIG.tokenEndpoint),0);noSecrets(status);
  }
});

test('missing complete URI is derived only from a validated official device page and the exact user code',async()=>{
  const h=harness({fetch:call=>call.url===OAuth.CONFIG.deviceEndpoint?response(deviceResponse({verification_uri_complete:undefined,verification_uri:'https://auth.x.ai/oauth2/device'})):undefined});await h.oauth.initialize();const status=await h.oauth.startLogin();assert.equal(status.device.verificationUriComplete,'https://auth.x.ai/oauth2/device?user_code=TEST-ONLY');assert.equal(status.device.userCode,'TEST-ONLY');noSecrets(status);
});

test('device polling honors server interval, authorization_pending, slow_down and temporary server errors',async()=>{
  const replies=[response({error:'authorization_pending'},400),response({error:'slow_down'},400),response('Temporary server failure',503),response(grant())];
  const h=harness({fetch:call=>call.url===OAuth.CONFIG.deviceEndpoint?response(deviceResponse({interval:7})):call.url===OAuth.CONFIG.tokenEndpoint?replies.shift():undefined});await h.oauth.initialize();await h.oauth.startLogin();h.advance(6999);await h.oauth.handleAlarm({name:OAuth.ALARMS.poll});assert.equal(h.count(OAuth.CONFIG.tokenEndpoint),0);
  h.advance(1);await h.oauth.handleAlarm({name:OAuth.ALARMS.poll});assert.equal(h.count(OAuth.CONFIG.tokenEndpoint),1);h.advance(7000);await h.oauth.handleAlarm({name:OAuth.ALARMS.poll});assert.equal(h.count(OAuth.CONFIG.tokenEndpoint),2);
  h.advance(11999);await h.oauth.handleAlarm({name:OAuth.ALARMS.poll});assert.equal(h.count(OAuth.CONFIG.tokenEndpoint),2);h.advance(1);await h.oauth.handleAlarm({name:OAuth.ALARMS.poll});assert.equal(h.count(OAuth.CONFIG.tokenEndpoint),3);h.advance(12000);await h.oauth.handleAlarm({name:OAuth.ALARMS.poll});assert.equal(h.oauth.status().connected,true);assert.equal(h.count(OAuth.CONFIG.tokenEndpoint),4);
});

test('expired or declined device authorization stops polling without exposing upstream text',async()=>{
  for(const [server,expected] of [['access_denied','OAUTH_ACCESS_DENIED'],['expired_token','OAUTH_DEVICE_EXPIRED']]){
    const h=harness({fetch:call=>call.url===OAuth.CONFIG.tokenEndpoint?response({error:server,error_description:RT+' PRIVATE_ERROR'},400):undefined});await h.oauth.initialize();await h.oauth.startLogin();h.advance(5000);await h.oauth.handleAlarm({name:OAuth.ALARMS.poll});assert.equal(h.oauth.status().errorCode,expected);assert.equal(h.oauth.status().device,undefined);h.advance(60000);await h.oauth.handleAlarm({name:OAuth.ALARMS.poll});assert.equal(h.count(OAuth.CONFIG.tokenEndpoint),1);noSecrets(h.changes);
  }
  const expired=harness({fetch:call=>call.url===OAuth.CONFIG.deviceEndpoint?response(deviceResponse({expires_in:3,interval:5})):undefined});await expired.oauth.initialize();await expired.oauth.startLogin();expired.advance(3000);await expired.oauth.handleAlarm({name:OAuth.ALARMS.poll});assert.equal(expired.oauth.status().errorCode,'OAUTH_DEVICE_EXPIRED');assert.equal(expired.count(OAuth.CONFIG.tokenEndpoint),0);
});

test('cancelling a pending device-code request prevents late links or credentials from restoring login',async()=>{
  const gate=deferred();const h=harness({fetch:call=>call.url===OAuth.CONFIG.deviceEndpoint?gate.promise:undefined});await h.oauth.initialize();const pending=h.oauth.startLogin();await until(()=>h.count(OAuth.CONFIG.deviceEndpoint)===1);await h.oauth.cancelLogin();gate.resolve(response(deviceResponse()));await pending;assert.equal(h.oauth.status().state,'disconnected');assert.equal(h.oauth.status().device,undefined);assert.equal(h.count(OAuth.CONFIG.tokenEndpoint),0);assert.equal(h.local.data[OAuth.STORAGE_KEY].kind,'signed_out');
});

test('a token grant arriving after cancellation is revoked and cannot overwrite a newer authorization',async()=>{
  const gate=deferred();let tokens=0;const h=harness({fetch:call=>call.url===OAuth.CONFIG.tokenEndpoint&&++tokens===1?gate.promise:undefined});await h.oauth.initialize();await h.oauth.startLogin();h.advance(5000);const polling=h.oauth.handleAlarm({name:OAuth.ALARMS.poll});await until(()=>h.count(OAuth.CONFIG.tokenEndpoint)===1);await h.oauth.cancelLogin();await h.oauth.startLogin();const newerCode=h.oauth.status().device.userCode;gate.resolve(response(grant({refresh_token:'LATE_REFRESH_PRIVATE'})));await polling;
  assert.equal(h.oauth.status().state,'awaiting_authorization');assert.equal(h.oauth.status().device.userCode,newerCode);assert.equal(h.calls.some(call=>call.url===OAuth.CONFIG.revokeEndpoint&&call.form.get('token')==='LATE_REFRESH_PRIVATE'),true);assert.equal(h.session.data[OAuth.STORAGE_KEY].kind,'device');
});

test('two concurrent refreshes single-flight after durable intent and publish only a fully saved rotated pair',async()=>{
  const gate=deferred();let seenIntent=false;const h=harness({fetch:(call,ctx)=>{
    if(call.form?.get('grant_type')==='refresh_token'){seenIntent=ctx.local.data[OAuth.STORAGE_KEY].phase==='refreshing'&&ctx.session.data[OAuth.STORAGE_KEY].phase==='refreshing';return gate.promise;}
  }});const before=await h.login();const first=h.oauth.ensureAccessToken({forceRefresh:true}),second=h.oauth.ensureAccessToken({forceRefresh:true});await until(()=>h.count(OAuth.CONFIG.tokenEndpoint,'refresh_token')===1);assert.equal(seenIntent,true);assert.equal(h.oauth.status().state,'refreshing');assert.equal(h.oauth.status().connected,true);assert.equal(h.oauth.status().credentialId,before.credentialId);
  gate.resolve(response(grant({access_token:'ACCESS_ROTATED',refresh_token:'REFRESH_ROTATED',expires_in:123})));const values=await Promise.all([first,second]);assert.deepEqual(values,[{accessToken:'ACCESS_ROTATED',credentialId:before.credentialId},{accessToken:'ACCESS_ROTATED',credentialId:before.credentialId}]);assert.equal(h.count(OAuth.CONFIG.tokenEndpoint,'refresh_token'),1);assert.equal(h.oauth.status().expiresAt,h.time()+123000);
  const local=h.local.data[OAuth.STORAGE_KEY],session=h.session.data[OAuth.STORAGE_KEY];assert.equal(local.phase,'ready');assert.equal(session.phase,'ready');assert.equal(local.revision,session.revision);assert.equal(await cryptoStore(h.profile).open(local.refreshEncrypted),'REFRESH_ROTATED');assert.equal(session.accessToken,'ACCESS_ROTATED');assert.equal(JSON.stringify(local).includes('REFRESH_ROTATED'),false);
});

test('refresh responses may omit a refresh token, and a stale 401 cannot rotate an already replaced access token twice',async()=>{
  const h=harness({fetch:call=>call.form?.get('grant_type')==='refresh_token'?response(grant({access_token:'AT_NEW',refresh_token:undefined})):undefined});const logged=await h.login();const refreshed=await h.oauth.ensureAccessToken({forceRefresh:true,rejectedAccessToken:AT,expectedCredentialId:logged.credentialId});assert.equal(refreshed.accessToken,'AT_NEW');assert.equal(await cryptoStore(h.profile).open(h.local.data[OAuth.STORAGE_KEY].refreshEncrypted),RT);
  assert.deepEqual(await h.oauth.ensureAccessToken({forceRefresh:true,rejectedAccessToken:AT,expectedCredentialId:logged.credentialId}),refreshed);assert.equal(h.count(OAuth.CONFIG.tokenEndpoint,'refresh_token'),1);
  await assert.rejects(h.oauth.ensureAccessToken({expectedCredentialId:webcrypto.randomUUID()}),{code:'OAUTH_ACCOUNT_CHANGED'});assert.equal(h.count(OAuth.CONFIG.tokenEndpoint,'refresh_token'),1);
});

test('worker restart reuses a matched live session and repairs alarms; a browser restart restores using one refresh grant',async()=>{
  const first=harness();const initial=await first.login();first.oauth.dispose();
  const worker=harness({local:clone(first.local.data),session:clone(first.session.data),profile:first.profile,time:first.time()});const status=await worker.oauth.initialize();assert.equal(status.connected,true);assert.equal(status.credentialId,initial.credentialId);assert.equal(worker.count(OAuth.CONFIG.tokenEndpoint),0);assert.equal(worker.alarms.has(OAuth.ALARMS.refresh),true);worker.oauth.dispose();
  const browser=harness({local:clone(worker.local.data),session:{},profile:worker.profile,time:worker.time()});const restored=await browser.oauth.initialize();assert.equal(restored.connected,true);assert.equal(restored.credentialId,initial.credentialId);assert.equal(browser.count(OAuth.CONFIG.tokenEndpoint,'refresh_token'),1);assert.equal(browser.calls.some(call=>call.url.includes('/responses')),false);assert.equal(browser.session.data[OAuth.STORAGE_KEY].accessToken,AT);
});

test('access expiry follows the returned lifetime and late or missing alarms have an on-demand refresh fallback',async()=>{
  const h=harness({fetch:call=>call.url===OAuth.CONFIG.tokenEndpoint?response(grant({expires_in:100})):undefined});await h.login();assert.equal(h.oauth.status().expiresAt,h.time()+100000);const expires=h.oauth.status().expiresAt;
  assert.equal(h.alarms.get(OAuth.ALARMS.refresh).scheduledTime,expires-10000);h.alarms.clear();h.advance(91000);await h.oauth.ensureAccessToken();assert.equal(h.count(OAuth.CONFIG.tokenEndpoint,'refresh_token'),1);assert.equal(h.alarms.has(OAuth.ALARMS.refresh),true);
});

test('network-uncertain or invalid-grant refreshes never consume the previous refresh token again, including after worker restart',async()=>{
  for(const kind of ['network','invalid_grant','server','malformed']){
    const h=harness({fetch:call=>{if(call.form?.get('grant_type')==='refresh_token'){if(kind==='network')throw Error(RT+' PRIVATE_NETWORK');if(kind==='invalid_grant')return response({error:'invalid_grant',error_description:RT},400);if(kind==='server')return response({error:'server_error'},503);return response(grant({access_token:''}));}}});await h.login();
    const errors=await Promise.allSettled([h.oauth.ensureAccessToken({forceRefresh:true}),h.oauth.ensureAccessToken({forceRefresh:true})]);assert.equal(errors.every(value=>value.status==='rejected'),true);assert.equal(h.count(OAuth.CONFIG.tokenEndpoint,'refresh_token'),1);assert.equal(h.oauth.status().state,'reauth_required');assert.equal(h.oauth.status().connected,false);noSecrets(h.oauth.status());
    await assert.rejects(h.oauth.ensureAccessToken());assert.equal(h.count(OAuth.CONFIG.tokenEndpoint,'refresh_token'),1);h.oauth.dispose();const restarted=harness({local:clone(h.local.data),session:clone(h.session.data),profile:h.profile,time:h.time()});await restarted.oauth.initialize();assert.equal(restarted.oauth.status().connected,false);await assert.rejects(restarted.oauth.ensureAccessToken());assert.equal(restarted.count(OAuth.CONFIG.tokenEndpoint),0);
  }
});

test('crashing with a persisted refresh intent requires a fresh login instead of replaying a possibly consumed token',async()=>{
  const gate=deferred();const h=harness({fetch:call=>call.form?.get('grant_type')==='refresh_token'?gate.promise:undefined});await h.login();const pending=h.oauth.ensureAccessToken({forceRefresh:true}).catch(error=>error);await until(()=>h.count(OAuth.CONFIG.tokenEndpoint,'refresh_token')===1);const local=clone(h.local.data),session=clone(h.session.data);h.oauth.dispose();
  const restarted=harness({local,session,profile:h.profile,time:h.time()});await restarted.oauth.initialize();assert.equal(restarted.oauth.status().errorCode,'OAUTH_REAUTH_REQUIRED');assert.equal(restarted.count(OAuth.CONFIG.tokenEndpoint),0);gate.resolve(response(grant({refresh_token:'STALE_ROTATED_TOKEN'})));assert.equal((await pending).code,'OAUTH_CANCELLED');assert.equal(h.calls.some(call=>call.url===OAuth.CONFIG.revokeEndpoint&&call.form.get('token')==='STALE_ROTATED_TOKEN'),true);
});

test('both stores must match the same credential and revision before a restored token can be used',async()=>{
  const h=harness();await h.login();h.oauth.dispose();const local=clone(h.local.data),session=clone(h.session.data);session[OAuth.STORAGE_KEY].revision=webcrypto.randomUUID();const restored=harness({local,session,profile:h.profile,time:h.time()});await restored.oauth.initialize();assert.equal(restored.oauth.status().connected,false);assert.equal(restored.oauth.status().errorCode,'OAUTH_REAUTH_REQUIRED');assert.equal(restored.calls.length,0);
});

test('a failed intent write sends no refresh grant and a failed rotated-pair commit cannot publish the new access token',async()=>{
  for(const phase of ['intent','local-stage','session-ready','local-ready']){
    let fail=false;const h=harness({localHooks:{set(values){const value=values[OAuth.STORAGE_KEY];if(fail&&((phase==='intent'&&value?.phase==='refreshing')||(phase==='local-stage'&&value?.phase==='committing')||(phase==='local-ready'&&value?.phase==='ready'))){fail=false;throw Error('PRIVATE_STORAGE_FAILURE');}}},sessionHooks:{set(values){if(fail&&phase==='session-ready'&&values[OAuth.STORAGE_KEY]?.phase==='ready'){fail=false;throw Error('PRIVATE_STORAGE_FAILURE');}}},fetch:call=>call.form?.get('grant_type')==='refresh_token'?response(grant({access_token:'AT_MUST_NOT_PUBLISH',refresh_token:'RT_MUST_NOT_REPLAY'})):undefined});await h.login();fail=true;await assert.rejects(h.oauth.ensureAccessToken({forceRefresh:true}),{code:'OAUTH_STORAGE_ERROR'});assert.equal(h.oauth.status().connected,false);assert.equal(h.count(OAuth.CONFIG.tokenEndpoint,'refresh_token'),phase==='intent'?0:1);assert.equal(h.oauth.status().errorCode,'OAUTH_STORAGE_ERROR');assert.equal(h.changes.some(change=>JSON.stringify(change).includes('AT_MUST_NOT_PUBLISH')),false);
    h.oauth.dispose();const restored=harness({local:clone(h.local.data),session:clone(h.session.data),profile:h.profile,time:h.time()});await restored.oauth.initialize();assert.equal(restored.oauth.status().connected,false);assert.equal(restored.count(OAuth.CONFIG.tokenEndpoint),0);
  }
});

test('session-only login and remember changes preserve one account without storing refresh plaintext locally',async()=>{
  const h=harness();const status=await h.login(false);assert.equal(h.local.data[OAuth.STORAGE_KEY].refreshEncrypted,undefined);assert.equal(h.session.data[OAuth.STORAGE_KEY].refreshToken,RT);assert.equal(JSON.stringify(h.local.data).includes(RT),false);
  await h.oauth.setRemember(true);assert.equal(h.oauth.status().credentialId,status.credentialId);assert.ok(h.local.data[OAuth.STORAGE_KEY].refreshEncrypted);assert.equal(h.session.data[OAuth.STORAGE_KEY].refreshToken,undefined);
  await h.oauth.setRemember(false);assert.equal(h.oauth.status().connected,true);assert.equal(h.local.data[OAuth.STORAGE_KEY].refreshEncrypted,undefined);assert.equal(h.session.data[OAuth.STORAGE_KEY].refreshToken,RT);h.oauth.dispose();const restart=harness({local:clone(h.local.data),session:{},profile:h.profile,time:h.time()});await restart.oauth.initialize();assert.equal(restart.oauth.status().connected,false);assert.equal(restart.count(OAuth.CONFIG.tokenEndpoint),0);
});

test('remember preference persistence and a simultaneous forced refresh serialize without using an old revision',async()=>{
  const gate=deferred();let hold=false,waiting=false;const h=harness({localHooks:{async set(values){if(hold&&values[OAuth.STORAGE_KEY]?.phase==='committing'&&values[OAuth.STORAGE_KEY]?.remember===false){waiting=true;await gate.promise;}}}});await h.login();hold=true;const preference=h.oauth.setRemember(false);await until(()=>waiting);const refreshing=h.oauth.ensureAccessToken({forceRefresh:true});await tick();assert.equal(h.count(OAuth.CONFIG.tokenEndpoint,'refresh_token'),0);hold=false;gate.resolve();await preference;assert.equal((await refreshing).accessToken,AT);assert.equal(h.oauth.status().remember,false);assert.equal(h.oauth.status().connected,true);assert.equal(h.count(OAuth.CONFIG.tokenEndpoint,'refresh_token'),1);
});

test('logout invalidates an in-flight refresh before clearing storage and late rotation cannot clear a newer login',async()=>{
  const gate=deferred();let oldRefresh=true;const h=harness({fetch:call=>call.form?.get('grant_type')==='refresh_token'&&oldRefresh?(oldRefresh=false,gate.promise):undefined});const initial=await h.login();const refresh=h.oauth.ensureAccessToken({forceRefresh:true}).catch(error=>error);await until(()=>h.count(OAuth.CONFIG.tokenEndpoint,'refresh_token')===1);await h.oauth.logout();assert.equal(h.oauth.status().connected,false);assert.equal(h.local.data[OAuth.STORAGE_KEY].kind,'signed_out');assert.equal(h.alarms.size,0);
  const newer=await h.login();assert.notEqual(newer.credentialId,initial.credentialId);const stored=clone(h.local.data[OAuth.STORAGE_KEY]);gate.resolve(response(grant({refresh_token:'LATE_OLD_ROTATED_RT'})));assert.equal((await refresh).code,'OAUTH_CANCELLED');assert.equal(h.oauth.status().credentialId,newer.credentialId);assert.equal(h.oauth.status().connected,true);assert.deepEqual(h.local.data[OAuth.STORAGE_KEY],stored);assert.equal(h.calls.some(call=>call.url===OAuth.CONFIG.revokeEndpoint&&call.form.get('token')==='LATE_OLD_ROTATED_RT'),true);
});

test('logout can complete while initial storage restoration is pending and the late load cannot restore auth',async()=>{
  const old=harness();await old.login();old.oauth.dispose();const gate=deferred();let hold=true,seen=false;const h=harness({local:clone(old.local.data),session:clone(old.session.data),profile:old.profile,localHooks:{async get(){if(hold){hold=false;seen=true;await gate.promise;}}}});const boot=h.oauth.initialize();await until(()=>seen);await h.oauth.logout();assert.equal(h.oauth.status().state,'disconnected');gate.resolve();await boot;assert.equal(h.oauth.status().connected,false);assert.equal(h.count(OAuth.CONFIG.tokenEndpoint),0);assert.equal(h.local.data[OAuth.STORAGE_KEY].kind,'signed_out');
});

test('one caller aborting a shared refresh does not cancel another caller or invalidate the connection',async()=>{
  const gate=deferred();const h=harness({fetch:call=>call.form?.get('grant_type')==='refresh_token'?gate.promise:undefined});await h.login();const controller=new AbortController();const first=h.oauth.ensureAccessToken({forceRefresh:true,signal:controller.signal}),second=h.oauth.ensureAccessToken({forceRefresh:true});await until(()=>h.count(OAuth.CONFIG.tokenEndpoint,'refresh_token')===1);controller.abort();await assert.rejects(first,{code:'OAUTH_CANCELLED'});assert.equal(h.calls.findLast(call=>call.form?.get('grant_type')==='refresh_token').input.signal.aborted,false);gate.resolve(response(grant({access_token:'AT_SHARED_NEW'})));assert.equal((await second).accessToken,'AT_SHARED_NEW');assert.equal(h.oauth.status().connected,true);
});

test('temporary catalog errors remain separate from login state and never select an unavailable default model',async()=>{
  let unavailable=true;const h=harness({fetch:call=>call.url===OAuth.CONFIG.modelsEndpoint?(unavailable?response({error:'server_error'},503):response({data:[{id:'grok-4.7'}]})):undefined});const logged=await h.login();assert.equal(logged.connected,true);assert.equal(logged.catalogErrorCode,'OAUTH_CATALOG_UNAVAILABLE');assert.deepEqual(logged.catalogModels,[]);assert.equal(logged.errorCode,null);unavailable=false;const loaded=await h.oauth.catalog();assert.equal(loaded.connected,true);assert.equal(loaded.catalogErrorCode,null);assert.deepEqual(loaded.catalogModels,['grok-4.7']);assert.equal(loaded.model,undefined);assert.equal(h.count(OAuth.CONFIG.tokenEndpoint,'refresh_token'),0);assert.equal(h.calls.some(call=>call.url.endsWith('/responses')),false);
});

test('pending device authorization restores its matching session and recreates a missing polling alarm',async()=>{
  const first=harness();await first.oauth.initialize();await first.oauth.startLogin();const saved=clone(first.session.data),local=clone(first.local.data);assert.equal(local[OAuth.STORAGE_KEY].scope,OAuth.CONFIG.scope);assert.equal(saved[OAuth.STORAGE_KEY].scope,OAuth.CONFIG.scope);first.oauth.dispose();const resumed=harness({local,session:saved,profile:first.profile,time:first.time()});await resumed.oauth.initialize();assert.equal(resumed.oauth.status().state,'awaiting_authorization');assert.equal(resumed.alarms.has(OAuth.ALARMS.poll),true);assert.equal(resumed.count(OAuth.CONFIG.tokenEndpoint),0);resumed.advance(5000);await resumed.oauth.handleAlarm({name:OAuth.ALARMS.poll});assert.equal(resumed.oauth.status().connected,true);
});

test('legacy, unmarked or mismatched pending scopes are cleared without resuming or starting authorization',async()=>{
  const oldScope='openid profile email offline_access grok-cli:access api:access';
  for(const [localScope,sessionScope] of [[oldScope,oldScope],[undefined,undefined],[OAuth.CONFIG.scope,oldScope],[oldScope,OAuth.CONFIG.scope],[OAuth.CONFIG.scope,undefined]]){
    const first=harness();await first.oauth.initialize();await first.oauth.startLogin({remember:false});first.oauth.dispose();const local=clone(first.local.data),session=clone(first.session.data);
    for(const [area,scope] of [[local,localScope],[session,sessionScope]]){if(scope===undefined)delete area[OAuth.STORAGE_KEY].scope;else area[OAuth.STORAGE_KEY].scope=scope;}
    const restored=harness({storageRoundTrip:sortedStorage,local,session,profile:first.profile,time:first.time()});const status=await restored.oauth.initialize();assert.equal(status.state,'disconnected');assert.equal(status.connected,false);assert.equal(status.remember,false);assert.equal(status.errorCode,null);assert.equal(status.device,undefined);assert.equal(restored.calls.length,0);assert.equal(restored.alarms.size,0);assert.equal(restored.local.data[OAuth.STORAGE_KEY].kind,'signed_out');assert.equal(restored.session.data[OAuth.STORAGE_KEY].kind,'signed_out');
    restored.advance(6000);await restored.oauth.handleAlarm({name:OAuth.ALARMS.poll});assert.equal(restored.calls.length,0);
    await restored.oauth.startLogin({remember:false});assert.equal(restored.count(OAuth.CONFIG.deviceEndpoint),1);assert.equal(restored.oauth.status().state,'awaiting_authorization');assert.equal(restored.calls[0].form.get('scope'),OAuth.CONFIG.scope);
  }
});

test('scope reduction leaves connected old grants and their refresh credentials usable without reauthorization',async()=>{
  const first=harness();const initial=await first.login();first.oauth.dispose();const local=clone(first.local.data),session=clone(first.session.data);assert.equal(local[OAuth.STORAGE_KEY].scope,undefined);assert.equal(session[OAuth.STORAGE_KEY].scope,undefined);const encrypted=clone(local[OAuth.STORAGE_KEY].refreshEncrypted);
  const worker=harness({storageRoundTrip:sortedStorage,local,session,profile:first.profile,time:first.time()});await worker.oauth.initialize();assert.equal(worker.oauth.status().connected,true);assert.equal(worker.oauth.status().credentialId,initial.credentialId);assert.equal((await worker.oauth.ensureAccessToken()).accessToken,AT);assert.deepEqual(worker.local.data[OAuth.STORAGE_KEY].refreshEncrypted,encrypted);assert.equal(worker.calls.length,0);worker.oauth.dispose();
  const browser=harness({storageRoundTrip:sortedStorage,local:clone(worker.local.data),session:{},profile:worker.profile,time:worker.time()});await browser.oauth.initialize();assert.equal(browser.oauth.status().connected,true);assert.equal(browser.oauth.status().credentialId,initial.credentialId);assert.equal(browser.count(OAuth.CONFIG.tokenEndpoint,'refresh_token'),1);assert.equal(browser.count(OAuth.CONFIG.deviceEndpoint),0);assert.equal(browser.count(OAuth.CONFIG.revokeEndpoint),0);
});

test('unknown alarms and disconnected startup do not perform authentication or model requests',async()=>{
  const h=harness();await h.oauth.initialize();await h.oauth.handleAlarm({name:'OTHER_EXTENSION_ALARM'});assert.equal(h.calls.length,0);assert.equal(h.oauth.status().state,'disconnected');assert.equal(h.local.data[OAuth.STORAGE_KEY],undefined);await assert.rejects(h.oauth.ensureAccessToken(),{code:'OAUTH_LOGIN_REQUIRED'});noSecrets(h.changes);
});

test('a request deadline aborts its fetch and a refresh timeout is never replayed automatically',async()=>{
  for(const phase of ['device','refresh']){
    const h=harness({fetch:call=>((phase==='device'&&call.url===OAuth.CONFIG.deviceEndpoint)||(phase==='refresh'&&call.form?.get('grant_type')==='refresh_token'))?new Promise((resolve,reject)=>call.input.signal.addEventListener('abort',()=>reject(Error('PRIVATE_TIMEOUT '+RT)),{once:true})):undefined});
    let pending;if(phase==='device'){await h.oauth.initialize();pending=h.oauth.startLogin();await until(()=>h.count(OAuth.CONFIG.deviceEndpoint)===1);}else{await h.login();pending=h.oauth.ensureAccessToken({forceRefresh:true}).catch(error=>error);await until(()=>h.count(OAuth.CONFIG.tokenEndpoint,'refresh_token')===1);}
    h.advance(30000);await pending;assert.equal(h.oauth.status().connected,false);assert.equal(h.oauth.status().errorCode,phase==='device'?'OAUTH_AUTH_UNAVAILABLE':'OAUTH_REFRESH_UNCERTAIN');noSecrets(h.changes);if(phase==='refresh'){await assert.rejects(h.oauth.ensureAccessToken());assert.equal(h.count(OAuth.CONFIG.tokenEndpoint,'refresh_token'),1);}
  }
});

test('redirected auth responses and oversized response bodies fail without disclosing provider payloads',async()=>{
  for(const mode of ['redirect','oversize']){
    const h=harness({fetch:call=>{if(call.url!==OAuth.CONFIG.deviceEndpoint)return;const result=mode==='redirect'?response(deviceResponse()):response(JSON.stringify({private:RT+'x'.repeat(1024*1024)}));if(mode==='redirect'){Object.defineProperty(result,'redirected',{value:true});Object.defineProperty(result,'url',{value:'https://evil.test/credentials'});}return result;}});await h.oauth.initialize();const status=await h.oauth.startLogin();assert.equal(status.connected,false);assert.equal(status.errorCode,'OAUTH_AUTH_UNAVAILABLE');assert.equal(status.device,undefined);assert.equal(h.count(OAuth.CONFIG.tokenEndpoint),0);noSecrets(status);
  }
});

test('malformed token grants are rejected and any newly known valid refresh token is revoked',async()=>{
  for(const changed of [{access_token:''},{access_token:'contains\nnewline'},{refresh_token:undefined},{token_type:'Basic'},{expires_in:-1},{refresh_token:'r'.repeat(16385)}]){
    const h=harness({fetch:call=>call.url===OAuth.CONFIG.tokenEndpoint?response(grant(changed)):undefined});await h.oauth.initialize();await h.oauth.startLogin();h.advance(5000);await h.oauth.handleAlarm({name:OAuth.ALARMS.poll});assert.equal(h.oauth.status().connected,false);assert.equal(h.oauth.status().state,'reauth_required');assert.equal(h.count(OAuth.CONFIG.modelsEndpoint),0);assert.equal(h.session.data[OAuth.STORAGE_KEY].kind,'blocked');noSecrets(h.changes);
    if(changed.refresh_token===undefined&&Object.hasOwn(changed,'refresh_token')||typeof changed.refresh_token==='string')continue;
    assert.equal(h.calls.some(call=>call.url===OAuth.CONFIG.revokeEndpoint&&call.form.get('token')===RT),true);
  }
});

test('changing remember preference while a device token grant is pending waits for that account commit',async()=>{
  const gate=deferred();const h=harness({fetch:call=>call.url===OAuth.CONFIG.tokenEndpoint?gate.promise:undefined});await h.oauth.initialize();await h.oauth.startLogin();h.advance(5000);const poll=h.oauth.handleAlarm({name:OAuth.ALARMS.poll});await until(()=>h.count(OAuth.CONFIG.tokenEndpoint)===1);const preference=h.oauth.setRemember(false);await tick();gate.resolve(response(grant()));await poll;await preference;assert.equal(h.oauth.status().connected,true);assert.equal(h.oauth.status().remember,false);assert.equal(h.session.data[OAuth.STORAGE_KEY].refreshToken,RT);assert.equal(h.local.data[OAuth.STORAGE_KEY].refreshEncrypted,undefined);assert.equal(h.oauth.status().errorCode,null);
});

test('a browser restart during a pending device-token result cannot replay that uncertain device code',async()=>{
  const gate=deferred();const h=harness({fetch:call=>call.url===OAuth.CONFIG.tokenEndpoint?gate.promise:undefined});await h.oauth.initialize();await h.oauth.startLogin();h.advance(5000);const pending=h.oauth.handleAlarm({name:OAuth.ALARMS.poll});await until(()=>h.count(OAuth.CONFIG.tokenEndpoint)===1);assert.equal(h.session.data[OAuth.STORAGE_KEY].device.polling,true);const local=clone(h.local.data),session=clone(h.session.data);h.oauth.dispose();const worker=harness({local,session,profile:h.profile,time:h.time()});await worker.oauth.initialize();assert.equal(worker.oauth.status().state,'reauth_required');assert.equal(worker.count(OAuth.CONFIG.tokenEndpoint),0);gate.resolve(response(grant({refresh_token:'DEAD_DEVICE_LATE_RT'})));await pending;assert.equal(h.calls.some(call=>call.url===OAuth.CONFIG.revokeEndpoint&&call.form.get('token')==='DEAD_DEVICE_LATE_RT'),true);
});

test('a persisted refresh intent also blocks replay after a full browser restart loses all session records',async()=>{
  const gate=deferred();const h=harness({fetch:call=>call.form?.get('grant_type')==='refresh_token'?gate.promise:undefined});await h.login();const pending=h.oauth.ensureAccessToken({forceRefresh:true}).catch(error=>error);await until(()=>h.count(OAuth.CONFIG.tokenEndpoint,'refresh_token')===1);const local=clone(h.local.data);h.oauth.dispose();const browser=harness({local,session:{},profile:h.profile,time:h.time()});await browser.oauth.initialize();assert.equal(browser.oauth.status().state,'reauth_required');assert.equal(browser.count(OAuth.CONFIG.tokenEndpoint),0);gate.resolve(response(grant()));await pending;
});

test('missing local encryption material never falls back to session access or refresh tokens',async()=>{
  const h=harness();await h.login();h.oauth.dispose();h.profile.key=null;const restored=harness({local:clone(h.local.data),session:clone(h.session.data),profile:h.profile,time:h.time()});await restored.oauth.initialize();assert.equal(restored.oauth.status().connected,false);assert.equal(restored.oauth.status().errorCode,'OAUTH_STORAGE_ERROR');assert.equal(restored.count(OAuth.CONFIG.modelsEndpoint),0);assert.equal(restored.count(OAuth.CONFIG.tokenEndpoint),0);await assert.rejects(restored.oauth.ensureAccessToken(),{code:'OAUTH_STORAGE_ERROR'});
});

test('safe catalogue model identifiers cannot echo current access or refresh credentials',async()=>{
  const at='grok-PrivateAccessToken',rt='grok-PrivateRefreshToken';const h=harness({fetch:call=>call.url===OAuth.CONFIG.tokenEndpoint?response(grant({access_token:at,refresh_token:rt})):call.url===OAuth.CONFIG.modelsEndpoint?response({data:[{id:at},{id:rt},{id:'grok-prefix-'+at+'-suffix'},{model:'grok-prefix-'+rt+'-suffix'},{id:'grok-4.3'}]}):undefined});const status=await h.login();assert.deepEqual(status.catalogModels,['grok-4.3']);for(const secret of [at,rt]){assert.equal(JSON.stringify(h.changes).includes(secret),false);assert.equal(JSON.stringify(h.local.data).includes(secret),false);assert.equal(JSON.stringify(h.session.data[OAuth.STORAGE_KEY].catalogModels).includes(secret),false);}
});

test('catalogue 401 recovery refreshes once and uses the new Bearer without any inference requests',async()=>{
  let rejected=false,again=false;const h=harness({fetch:call=>{
    if(call.url===OAuth.CONFIG.modelsEndpoint&&rejected){if(!again){again=true;return response({error:'unauthorized'},401);}return response({data:[{id:'grok-4.3'}]});}
    if(call.form?.get('grant_type')==='refresh_token')return response(grant({access_token:'NEW_CATALOG_ACCESS',refresh_token:'NEW_CATALOG_REFRESH'}));
  }});await h.login();rejected=true;const status=await h.oauth.catalog();assert.equal(status.connected,true);assert.equal(status.catalogErrorCode,null);assert.equal(h.count(OAuth.CONFIG.tokenEndpoint,'refresh_token'),1);assert.equal(h.calls.filter(call=>call.url===OAuth.CONFIG.modelsEndpoint).at(-1).input.headers.Authorization,'Bearer NEW_CATALOG_ACCESS');assert.equal(h.calls.some(call=>call.url.endsWith('/responses')),false);
});

test('a remember preference chosen before login survives worker restart without any authentication calls',async()=>{
  const h=harness();await h.oauth.initialize();await h.oauth.setRemember(false);assert.equal(h.oauth.status().remember,false);h.oauth.dispose();const next=harness({local:clone(h.local.data),session:clone(h.session.data),profile:h.profile,time:h.time()});await next.oauth.initialize();assert.equal(next.oauth.status().remember,false);assert.equal(next.oauth.status().state,'disconnected');assert.equal(next.calls.length,0);
});

test('device secrets cannot overlap the displayed user code or authorization link',async()=>{
  for(const deviceCode of ['TEST-ONLY','TEST','oauth2',OAuth.CONFIG.clientId]){
    const withClient=deviceCode===OAuth.CONFIG.clientId?'&client_id='+encodeURIComponent(OAuth.CONFIG.clientId).replaceAll('-', '%2D'):'';
    const h=harness({fetch:call=>call.url===OAuth.CONFIG.deviceEndpoint?response(deviceResponse({device_code:deviceCode,verification_uri_complete:'https://accounts.x.ai/oauth2/device?user_code=TEST-ONLY'+withClient})):undefined});
    await h.oauth.initialize();const status=await h.oauth.startLogin();assert.equal(status.errorCode,'OAUTH_DEVICE_INVALID');assert.equal(status.device,undefined);assert.equal(h.count(OAuth.CONFIG.tokenEndpoint),0);assert.equal(h.changes.some(value=>value.device),false);
  }
});

test('restoring a device challenge validates its identity and never publishes a colliding secret',async()=>{
  const first=harness();await first.oauth.initialize();await first.oauth.startLogin();first.oauth.dispose();
  for(const change of [saved=>{saved.deviceCode=saved.userCode;},saved=>{saved.deviceCode='TEST';},saved=>{saved.deviceCode='oauth2';},saved=>{saved.id=webcrypto.randomUUID();}]){
    const local=clone(first.local.data),session=clone(first.session.data);change(session[OAuth.STORAGE_KEY].device);
    const resumed=harness({local,session,profile:first.profile,time:first.time()});const status=await resumed.oauth.initialize();assert.equal(status.state,'reauth_required');assert.equal(status.device,undefined);assert.equal(resumed.changes.some(value=>value.device),false);assert.equal(resumed.count(OAuth.CONFIG.tokenEndpoint),0);
  }
});

test('cancel, logout or disposal while login waits for initialization cannot revive the authorization',async()=>{
  for(const action of ['cancelLogin','logout','dispose']){
    const gate=deferred();let seen=false,held=false;const h=harness({localHooks:{async get(){if(!held){held=true;seen=true;await gate.promise;}}}});
    const pending=h.oauth.startLogin();await until(()=>seen);await h.oauth[action]();gate.resolve();await pending;
    assert.equal(h.count(OAuth.CONFIG.deviceEndpoint),0);assert.equal(h.count(OAuth.CONFIG.tokenEndpoint),0);assert.equal(h.oauth.status().device,undefined);assert.equal(h.changes.some(value=>value.state==='starting'),false);
  }
});

test('only the latest login request waiting for initialization can start a device authorization',async()=>{
  const gate=deferred();let seen=false,held=false;const h=harness({localHooks:{async get(){if(!held){held=true;seen=true;await gate.promise;}}}});
  const first=h.oauth.startLogin({remember:true});await until(()=>seen);const second=h.oauth.startLogin({remember:false});gate.resolve();await Promise.all([first,second]);
  assert.equal(h.count(OAuth.CONFIG.deviceEndpoint),1);assert.equal(h.oauth.status().state,'awaiting_authorization');assert.equal(h.oauth.status().remember,false);assert.equal(h.session.data[OAuth.STORAGE_KEY].remember,false);
});

test('Chrome-like storage key sorting preserves device login, token commits, refresh, preferences and restart',async()=>{
  let rotation=0;const h=harness({storageRoundTrip:sortedStorage,fetch:call=>call.form?.get('grant_type')==='refresh_token'?response(grant({access_token:'SORTED_ACCESS_'+(++rotation),refresh_token:'SORTED_REFRESH_'+rotation})):undefined});
  const initial=await h.login();assert.equal(h.count(OAuth.CONFIG.deviceEndpoint),1);assert.equal(h.count(OAuth.CONFIG.tokenEndpoint),1);assert.equal(h.local.data[OAuth.STORAGE_KEY].phase,'ready');
  const refreshed=await h.oauth.ensureAccessToken({forceRefresh:true});assert.equal(refreshed.accessToken,'SORTED_ACCESS_1');assert.equal(refreshed.credentialId,initial.credentialId);assert.equal(await cryptoStore(h.profile).open(h.local.data[OAuth.STORAGE_KEY].refreshEncrypted),'SORTED_REFRESH_1');
  await h.oauth.setRemember(false);assert.equal(h.oauth.status().connected,true);assert.equal(h.local.data[OAuth.STORAGE_KEY].refreshEncrypted,undefined);assert.equal(h.session.data[OAuth.STORAGE_KEY].refreshToken,'SORTED_REFRESH_1');
  await h.oauth.setRemember(true);assert.equal(h.oauth.status().connected,true);assert.equal(h.session.data[OAuth.STORAGE_KEY].refreshToken,undefined);h.oauth.dispose();
  const worker=harness({storageRoundTrip:sortedStorage,local:clone(h.local.data),session:clone(h.session.data),profile:h.profile,time:h.time()});await worker.oauth.initialize();assert.equal(worker.oauth.status().connected,true);assert.equal(worker.oauth.status().credentialId,initial.credentialId);assert.equal(worker.count(OAuth.CONFIG.tokenEndpoint),0);worker.oauth.dispose();
  const browser=harness({storageRoundTrip:sortedStorage,local:clone(worker.local.data),session:{},profile:worker.profile,time:worker.time()});await browser.oauth.initialize();assert.equal(browser.oauth.status().connected,true);assert.equal(browser.oauth.status().credentialId,initial.credentialId);assert.equal(browser.count(OAuth.CONFIG.tokenEndpoint,'refresh_token'),1);assert.equal(browser.changes.some(value=>value.errorCode==='OAUTH_STORAGE_ERROR'),false);
});

test('storage read-back still rejects extra, missing, changed and nested credential fields',async()=>{
  for(const corrupt of [value=>{value.unexpected=true;},value=>{delete value.schema;},value=>{value.remember=!value.remember;},value=>{value.refreshEncrypted.ciphertext+='AA==';}]){
    const h=harness({storageRoundTrip:value=>{const saved=sortedStorage(value);if(saved?.kind==='auth'&&saved.phase==='committing')corrupt(saved);return saved;}});
    await h.oauth.initialize();await h.oauth.startLogin();h.advance(5000);await h.oauth.handleAlarm({name:OAuth.ALARMS.poll});assert.equal(h.oauth.status().connected,false);assert.equal(h.oauth.status().errorCode,'OAUTH_STORAGE_ERROR');assert.equal(h.count(OAuth.CONFIG.tokenEndpoint),1);assert.equal(h.count(OAuth.CONFIG.modelsEndpoint),0);assert.equal(h.calls.some(call=>call.url===OAuth.CONFIG.revokeEndpoint&&call.form.get('token')===RT),true);
  }
});

test('storage read-back treats catalog array order as meaningful before consuming a refresh token',async()=>{
  let corrupt=false;const h=harness({storageRoundTrip:value=>{const saved=sortedStorage(value);if(corrupt&&saved?.kind==='auth'&&saved.catalogModels?.length>1)saved.catalogModels.reverse();return saved;}});await h.login();corrupt=true;
  await assert.rejects(h.oauth.ensureAccessToken({forceRefresh:true}),{code:'OAUTH_STORAGE_ERROR'});assert.equal(h.oauth.status().connected,false);assert.equal(h.count(OAuth.CONFIG.tokenEndpoint,'refresh_token'),0);
});

test('initial catalog failure exposes bounded classifications without changing connected credentials',async()=>{
  const cases=[
    [403,{error:{code:'insufficient_credits',message:RT}},'credits','insufficient_credits'],
    [403,{error:{code:'private-team:spending_limit',message:AT}},'spending','spending_limit'],
    [429,{error:{code:'insufficient_quota'}},'quota','insufficient_quota'],
    [429,{error:{code:'usage_limit_exceeded'}},'quota','usage_limit_exceeded'],
    [429,{error:{code:'rate_limit_exceeded'}},'rate','rate_limit_exceeded'],
    [429,{error:{message:'private quota prose '+RT}},'limited',undefined],
    [403,{error:{message:'private quota prose '+AT}},'access',undefined],
    [401,{error:'unauthorized'},'auth',undefined],
    [400,{error:{message:'private unknown failure '+AT}},'unavailable',undefined],
    [404,{error:{message:'not found '+AT}},'unavailable',undefined],
    [503,'<html>private '+DEVICE+'</html>','server',undefined],
    [200,'not JSON '+AT,'response',undefined],
    [200,{models:['grok-4.3']},'response',undefined]
  ];
  for(const [httpStatus,body,reason,providerCode] of cases){
    const h=harness({fetch:call=>call.url===OAuth.CONFIG.modelsEndpoint?response(body,httpStatus):undefined});
    const status=await h.login();
    assert.equal(status.connected,true);assert.equal(status.errorCode,null);assert.equal(status.catalogErrorCode,'OAUTH_CATALOG_UNAVAILABLE');
    assert.deepEqual(status.catalogDiagnostics,{reason,httpStatus,...(providerCode?{providerCode}:{})});
    assert.deepEqual(status.catalogModels,[]);assert.equal(h.count(OAuth.CONFIG.tokenEndpoint,'refresh_token'),0);
    noSecrets(status);noSecrets(h.changes);assert.equal(JSON.stringify(h.local.data).includes('catalogDiagnostics'),false);
  }
});

test('catalog refresh preserves the last successful model list and clears diagnostics only after recovery',async()=>{
  let mode='ok';const h=harness({fetch:call=>call.url===OAuth.CONFIG.modelsEndpoint&&mode==='fail'?response({error:{code:'insufficient_credits',message:RT}},403):undefined});
  const initial=await h.login();mode='fail';const failed=await h.oauth.catalog();
  assert.deepEqual(failed.catalogModels,initial.catalogModels);assert.equal(failed.catalogDiagnostics.reason,'credits');
  assert.equal(failed.connected,true);assert.equal(failed.errorCode,null);mode='ok';
  const recovered=await h.oauth.catalog();assert.equal(recovered.catalogDiagnostics,null);assert.equal(recovered.catalogErrorCode,null);
  mode='fail';await h.oauth.catalog();await h.oauth.logout();assert.equal(h.oauth.status().catalogDiagnostics,null);
});

test('catalog diagnostics keep only bounded valid Retry-After waits',async()=>{
  for(const [header,expected] of [['7',7],['-2',undefined],['1000000',undefined],[RT,undefined]]){
    const h=harness({fetch:call=>call.url===OAuth.CONFIG.modelsEndpoint?new Response(JSON.stringify({error:{code:'rate_limit_error'}}),{status:429,headers:{'Retry-After':header}}):undefined});
    const status=await h.login();assert.equal(status.catalogDiagnostics.reason,'rate');assert.equal(status.catalogDiagnostics.retryAfterSeconds,expected);noSecrets(status);
  }
  const date=new Date(1800000000000+65000).toUTCString();
  const h=harness({fetch:call=>call.url===OAuth.CONFIG.modelsEndpoint?new Response('{}',{status:429,headers:{'Retry-After':date}}):undefined});
  const status=await h.login();assert.equal(status.catalogDiagnostics.retryAfterSeconds,60);
});

test('catalog transport diagnostics distinguish network failures and timeout without raw messages',{timeout:10000},async()=>{
  const network=harness({fetch:call=>{if(call.url===OAuth.CONFIG.modelsEndpoint)throw new Error('private network '+RT);}});
  assert.deepEqual((await network.login()).catalogDiagnostics,{reason:'network'});noSecrets(network.changes);
  const requestStarted=deferred();
  const timed=harness({fetch:call=>call.url===OAuth.CONFIG.modelsEndpoint?new Promise((resolve,reject)=>{
    call.input.signal.addEventListener('abort',()=>reject(new Error(AT)),{once:true});
    requestStarted.resolve();
  }):undefined});
  await timed.oauth.initialize();await timed.oauth.startLogin();timed.advance(5000);
  // Credential encryption runs in native WebCrypto work before catalog fetch.
  // Wait for that fetch's listener to be installed, not an event-loop turn count.
  const polling=timed.oauth.handleAlarm({name:OAuth.ALARMS.poll});await requestStarted.promise;
  assert.equal(timed.count(OAuth.CONFIG.modelsEndpoint),1);
  timed.advance(30000);await polling;assert.equal(timed.oauth.status().connected,true);assert.deepEqual(timed.oauth.status().catalogDiagnostics,{reason:'timeout'});noSecrets(timed.changes);
});
