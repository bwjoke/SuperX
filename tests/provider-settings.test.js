'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../extension/feed-core.js');

test('manual mode defaults off and only persists explicit boolean choices',()=>{
  assert.equal(Core.DEFAULT_SETTINGS.manualMode,false);
  for(const manualMode of [undefined,null,'true','false',0,1,{},[]])assert.equal(Core.normalizeSettings({manualMode}).manualMode,false);
  for(const manualMode of [true,false]){
    const settings=Core.normalizeSettings({...Core.DEFAULT_SETTINGS,manualMode});assert.equal(settings.manualMode,manualMode);assert.deepEqual(Core.normalizeSettings(settings),settings);
  }
});

test('only established non-text generation families are rejected while saved text and custom model IDs remain intact',()=>{
  const generators=['grok-imagine','grok-imagine-image','grok-imagine-image-quality','grok-imagine-image-2.0','grok-imagine-video','grok-imagine-video-1.5','grok-2-image','grok-2-image-1212'];
  for(const model of generators){assert.equal(Core.isNonTextGenerationModel(model),true,model);assert.equal(Core.isNonTextGenerationModel('  '+model.toUpperCase()+'  '),true,model);for(const provider of ['api','oauth','build']){const settings=Core.normalizeSettings({provider,apiModel:model,oauthModel:model,buildModel:model,buildDefaultsVersion:1});assert.equal(Core.providerModel(settings),model,'Unsupported saved IDs are preserved for an explicit user choice');}}
  for(const model of [...Core.API_MODELS.map(profile=>profile.value),'grok-4.3-latest','grok-4.20','grok-4.20-0309-reasoning','grok-4.20-non-reasoning','grok-4.20-multi-agent','grok-build-0.1','custom-text-model','custom-image-understanding-model','grok-imagineer']){assert.equal(Core.isNonTextGenerationModel(model),false,model);for(const provider of ['api','oauth','build']){const settings=Core.normalizeSettings({provider,apiModel:model,oauthModel:model,buildModel:model,buildDefaultsVersion:1});assert.equal(Core.providerModel(settings),model);}}
  for(const model of [undefined,null,{},[],17])assert.equal(Core.isNonTextGenerationModel(model),false);
  for(const provider of ['api','oauth','build'])assert.deepEqual(Core.autoRetryDecision({provider,code:'MODEL_UNSUPPORTED',verificationFailure:{stage:'verify',code:'UNKNOWN'}}),{retryable:false,reason:'request_rejected'});
});

test('provider diagnostics accept only fixed public codes and never arbitrary upstream strings',()=>{
  assert.equal(Core.apiFailureProviderCode('INVALID-API-KEY'),'invalid_api_key');assert.equal(Core.apiFailureProviderCode('spending_limit'),'spending_limit');
  for(const value of ['PRIVATE_SECRET_CANARY','account-private:spending-limit','xai-'+'a'.repeat(40),'server_error\nPRIVATE','SERVER_ERROR '.repeat(10),{},null])assert.equal(Core.apiFailureProviderCode(value),undefined);
});

test('new installations start with subscription sign-in while legacy and explicit sources are preserved',()=>{
  assert.equal(Core.DEFAULT_SETTINGS.provider,'oauth');
  for(const value of [undefined,null,{},[]])assert.equal(Core.normalizeSettings(value).provider,'oauth');
  for(const provider of [undefined,null,'native','invalid','API'])assert.equal(Core.normalizeSettings({provider}).provider,'api');
  assert.equal(Core.normalizeSettings({language:'ja',apiModel:'grok-4.6'}).provider,'api');
  assert.equal(Core.normalizeSettings({provider:'build'}).provider,'build');
  assert.equal(Core.normalizeSettings({provider:'api'}).provider,'api');
  assert.equal(Core.normalizeSettings({provider:'oauth'}).provider,'oauth');
});

test('API and Build share Grok 4.3 without reasoning as defaults and retain independent settings',()=>{
  const settings=Core.normalizeSettings({});
  assert.equal(settings.buildTransport,'acp');assert.equal(settings.buildModel,'grok-4.3');assert.equal(settings.buildReasoningEffort,'none');assert.equal(settings.buildDefaultsVersion,1);
  assert.equal(settings.apiModel,'grok-4.3');assert.equal(settings.apiReasoningEffort,'none');
  assert.equal(Core.normalizeSettings({buildTransport:'cli'}).buildTransport,'acp');
  for(const buildTransport of ['',null,'shell','CLI'])assert.equal(Core.normalizeSettings({buildTransport}).buildTransport,'acp');
});

test('only the unversioned former Build default pair migrates once without changing API or timing choices',()=>{
  for(const provider of ['api','build'])for(const buildDefaultsVersion of [undefined,0]){
    const original={provider,buildDefaultsVersion,buildModel:'grok-4.7',buildReasoningEffort:'low',apiModel:'grok-4.6',apiReasoningEffort:'high',analysisDefaultsVersion:1,dwellMs:0,apiConcurrency:4,language:'ja',interfaceLanguage:'zh-CN',verifyPrompt:'Keep this custom fact-check prompt.'};
    const settings=Core.normalizeSettings(original);
    assert.equal(settings.buildModel,'grok-4.3');assert.equal(settings.buildReasoningEffort,'none');assert.equal(settings.buildDefaultsVersion,1);
    for(const field of ['provider','apiModel','apiReasoningEffort','analysisDefaultsVersion','dwellMs','apiConcurrency','language','interfaceLanguage','verifyPrompt'])assert.equal(settings[field],original[field],field);
    assert.deepEqual(Core.normalizeSettings(settings),settings);
    assert.equal(original.buildModel,'grok-4.7');assert.equal(original.buildReasoningEffort,'low');
  }
});

test('Build migration preserves other combinations and later explicit selections of the former default',()=>{
  for(const [buildModel,buildReasoningEffort]of [['grok-4.7','high'],['grok-4.6','low'],['grok-4.3','minimal'],['custom-build-model','medium']]){
    const settings=Core.normalizeSettings({buildModel,buildReasoningEffort});
    assert.equal(settings.buildModel,buildModel);assert.equal(settings.buildReasoningEffort,buildReasoningEffort);assert.equal(settings.buildDefaultsVersion,1);
  }
  const settings=Core.normalizeSettings({buildDefaultsVersion:1,buildModel:'grok-4.7',buildReasoningEffort:'low'});
  assert.equal(settings.buildModel,'grok-4.7');assert.equal(settings.buildReasoningEffort,'low');assert.deepEqual(Core.normalizeSettings(settings),settings);
});

test('switching providers preserves each provider model and effort without copying credentials',()=>{
  const original={provider:'api',apiModel:'grok-4.6',apiReasoningEffort:'xhigh',buildModel:'grok-4.5',buildReasoningEffort:'medium',buildTransport:'cli',apiKey:'never part of settings'};
  const build=Core.normalizeSettings({...original,provider:'build'});
  assert.equal(build.apiModel,'grok-4.6');assert.equal(build.apiReasoningEffort,'xhigh');
  assert.equal(build.buildModel,'grok-4.5');assert.equal(build.buildReasoningEffort,'medium');assert.equal(build.buildTransport,'acp');
  assert.equal(Object.hasOwn(build,'apiKey'),false);assert.equal(original.apiKey,'never part of settings');
  const api=Core.normalizeSettings({...build,provider:'api'});
  assert.deepEqual({...api,provider:'build'},build);
});

test('Build preserves valid custom and API-only model IDs for explicit runtime negotiation',()=>{
  for(const buildModel of ['grok-4.3','custom-build-model','grok-4.7-latest']) {
    const settings=Core.normalizeSettings({provider:'build',buildModel,buildReasoningEffort:'high'});
    assert.equal(settings.buildModel,buildModel);
    assert.equal(settings.buildReasoningEffort,Core.buildReasoningEffort(buildModel,'high'));
  }
  for(const buildModel of ['',null,'bad model','grok;touch','../grok','x'.repeat(81)])assert.equal(Core.normalizeSettings({buildModel}).buildModel,'grok-4.3');
  assert.equal(Core.normalizeSettings({buildModel:'grok-4.3',buildReasoningEffort:'xhigh'}).buildReasoningEffort,'xhigh');
  assert.equal(Core.normalizeSettings({buildModel:'grok-4.7',buildReasoningEffort:'none'}).buildReasoningEffort,'none');
  assert.equal(Core.buildReasoningEffort('grok-4.3','minimal'),'minimal');
  assert.equal(Core.reasoningEffort('grok-4.7-build-fast','high'),'auto');
  assert.equal(Core.buildReasoningEffort('grok-4.7-build-fast','high'),'high');
  assert.equal(Core.normalizeSettings({buildModel:'grok-4.7-build-fast',buildReasoningEffort:'none'}).buildReasoningEffort,'none');
  assert.equal(Core.normalizeSettings({buildModel:'grok-4.7-build-fast'}).buildReasoningEffort,'low');
});

test('provider changes retain user language, editable task and API concurrency preferences',()=>{
  const settings=Core.normalizeSettings({provider:'build',language:'fr',interfaceLanguage:'zh-TW',explanationMode:'custom',verifyPrompt:'Check primary evidence.',commentsPrompt:'Offer useful questions.',apiConcurrency:7});
  assert.equal(settings.language,'fr');assert.equal(settings.interfaceLanguage,'zh-TW');assert.equal(settings.verifyPrompt,'Check primary evidence.');
  assert.equal(settings.commentsPrompt,'Offer useful questions.');assert.equal(settings.apiConcurrency,7);assert.equal(settings.apiVerification,'only');
});
