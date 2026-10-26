'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../extension/feed-core.js');

const failure=(details={})=>({stage:'verify',code:'UNKNOWN',...details});
const decision=value=>Core.autoRetryDecision(value);

test('automatic retries wait three seconds and allow five extra attempts',()=>{
  assert.equal(Core.AUTO_RETRY_DELAY_MS,3000);
  assert.equal(Core.AUTO_RETRY_LIMIT,5);
});

test('transient service errors including unclassified provider errors permit retry',()=>{
  for(const code of ['API_ERROR','API_INCOMPLETE','API_STREAM_INTERRUPTED','API_STREAM_ERROR','API_LANGUAGE_MISMATCH','API_CAPACITY','RATE_LIMIT','TIMEOUT','COMMENTS_INVALID_RESPONSE','BUILD_BUSY','BUILD_TIMEOUT','BUILD_DISCONNECTED','BUILD_RATE_LIMIT','BUILD_OUTPUT_INVALID','BUILD_LANGUAGE_MISMATCH','BUILD_SEARCH_NOT_PERFORMED','UNKNOWN']){
    assert.equal(decision({code}).retryable,true,code);
  }
  assert.deepEqual(decision({code:'API_ERROR'}),{retryable:true,reason:'service'});
  assert.deepEqual(decision({code:'API_CAPACITY'}),{retryable:true,reason:'capacity'});
  assert.deepEqual(decision({verificationFailure:failure()}),{retryable:true,reason:'service'});
});

test('incomplete partial answers retain the original retry classification',()=>{
  for(const code of ['INCOMPLETE','CONNECTION','LANGUAGE_MISMATCH','RATE_LIMIT','SERVER','TIMEOUT','UNKNOWN']){
    const result={text:'Useful retained finding',verificationStatus:'incomplete',verificationFailure:failure({code})};
    assert.equal(decision(result).retryable,true,code);
    assert.equal(decision({code:'API_ERROR',partialResult:result}).retryable,true,code);
  }
  const buildPartial={code:'BUILD_TIMEOUT',partialResult:{text:'A useful finding',verificationStatus:'incomplete',verificationFailure:failure({code:'CONNECTION'})}};
  assert.deepEqual(decision(buildPartial),{retryable:true,reason:'connection'});
  assert.deepEqual(decision({text:'A useful finding',verificationStatus:'incomplete'}),{retryable:true,reason:'service'});
  assert.deepEqual(decision({verificationStatus:'failed'}),{retryable:true,reason:'service'});
});

test('network diagnostics and transient HTTP statuses permit retry',()=>{
  assert.deepEqual(decision({requestDiagnostics:{failureOrigin:'network'}}),{retryable:true,reason:'connection'});
  assert.deepEqual(decision({code:'BUILD_DISCONNECTED'}),{retryable:true,reason:'connection'});
  for(const status of [408,425,429,500,502,503,504,529,599]){
    assert.equal(decision({code:'API_ERROR',verificationFailure:failure({httpStatus:status})}).retryable,true,String(status));
    assert.equal(decision({requestDiagnostics:{failureOrigin:'http',transportStatus:status}}).retryable,true,String(status));
  }
  assert.deepEqual(decision({code:'API_ERROR',verificationFailure:failure({code:'SERVER',errorCode:'API_CAPACITY'}),requestDiagnostics:{failureOrigin:'stream',transportStatus:200}}),{retryable:true,reason:'capacity'});
});

test('account balances and subscription limits never repeat automatically',()=>{
  for(const providerCode of ['insufficient_quota','insufficient_credits','spending_limit','usage_limit_exceeded']){
    for(const code of ['API_ERROR','RATE_LIMIT','BUILD_RATE_LIMIT']){
      assert.deepEqual(decision({code,verificationFailure:failure({code:'RATE_LIMIT',providerCode})}),{retryable:false,reason:'account_limit'},code+':'+providerCode);
    }
  }
  assert.deepEqual(decision({code:'API_ERROR',verificationFailure:failure({httpStatus:402}),requestDiagnostics:{failureOrigin:'stream',transportStatus:200}}),{retryable:false,reason:'account_limit'});
  assert.deepEqual(decision({code:'RATE_LIMIT',partialResult:{verificationFailure:failure({httpStatus:402})}}),{retryable:false,reason:'account_limit'});
  // Comment-generation errors come straight from runStage before the verify
  // wrapper adds verificationFailure. Stream transport status can still be 200.
  assert.deepEqual(decision({code:'API_ERROR',failureDetails:{code:'ACCESS',providerCode:'spending_limit'},requestDiagnostics:{failureOrigin:'stream',transportStatus:200}}),{retryable:false,reason:'account_limit'});
  assert.deepEqual(decision({code:'API_ERROR',failureDetails:{code:'ACCESS',httpStatus:401}}),{retryable:false,reason:'request_rejected'});
});

test('invalid credentials models parameters and rejected HTTP requests require a manual change',()=>{
  for(const providerCode of ['invalid_request_error','bad_request','invalid_api_key','authentication_error','unauthenticated','permission_error','forbidden','model_not_found','model_not_supported','unsupported_model','unsupported_parameter','invalid_parameter','invalid_argument','context_length_exceeded','content_filter']){
    assert.deepEqual(decision({code:'API_ERROR',verificationFailure:failure({providerCode})}),{retryable:false,reason:'request_rejected'},providerCode);
  }
  for(const status of [400,401,403,404,405,409,413,415,422,451,499]){
    assert.equal(decision({code:'API_ERROR',requestDiagnostics:{failureOrigin:'http',transportStatus:status}}).retryable,false,String(status));
  }
  assert.deepEqual(decision({code:'API_ERROR',verificationFailure:failure({code:'ACCESS'})}),{retryable:false,reason:'request_rejected'});
});

test('explicit image input failures never retry the same rejected image automatically',()=>{
  assert.deepEqual(decision({code:'API_IMAGE_INPUT'}),{retryable:false,reason:'request_rejected'});
  for(const providerCode of ['invalid_image','invalid_image_url','image_parse_error']){
    assert.equal(Core.apiFailureProviderCode(providerCode),providerCode);
    assert.deepEqual(decision({code:'API_ERROR',verificationFailure:failure({code:'ACCESS',providerCode})}),{retryable:false,reason:'request_rejected'});
  }
});

test('setup and safety policy failures override broad connection categories',()=>{
  for(const code of ['NEEDS_KEY','KEY_MIGRATION_REQUIRED','POST_INVALID','URL_SEARCH_REQUIRED','BUILD_CONNECTION_REQUIRED','BUILD_AUTH_FAILED','BUILD_PERMISSION_REQUIRED','BUILD_LOGIN_REQUIRED','BUILD_NATIVE_MISSING','BUILD_UNAVAILABLE','BUILD_VERSION_UNSUPPORTED','BUILD_CONFIG_UNSUPPORTED','BUILD_MODEL_UNSUPPORTED','BUILD_EFFORT_UNSUPPORTED','BUILD_TOOL_POLICY','BUILD_PROTOCOL_ERROR','BUILD_ACCESS_DENIED']){
    const value={code,verificationFailure:failure({code:'CONNECTION'}),requestDiagnostics:{failureOrigin:'network'}};
    assert.deepEqual(decision(value),{retryable:false,reason:'setup_required'},code);
  }
});

test('user cancellations and unconfirmed runtime cancellation never restart',()=>{
  for(const code of ['CANCELED','CANCELLED','BUILD_CANCELED','BUILD_CANCELLED','BUILD_CANCEL_UNCONFIRMED','RAIL_COLLAPSED']){
    assert.deepEqual(decision({code,partialResult:{verificationFailure:failure({code:'CONNECTION'})}}),{retryable:false,reason:'cancelled'},code);
  }
  assert.deepEqual(decision(Object.assign(new Error('Canceled'),{name:'AbortError'})),{retryable:false,reason:'cancelled'});
  assert.deepEqual(decision({code:'API_INCOMPLETE',partialResult:{verificationFailure:failure({errorCode:'CANCELED'})}}),{retryable:false,reason:'cancelled'});
});

test('output limits and content filtering do not replay the same ineffective request',()=>{
  for(const details of [{code:'OUTPUT_LIMIT'},{reason:'max_output_tokens'},{reason:'content_filter'}]){
    assert.deepEqual(decision({code:'API_INCOMPLETE',verificationFailure:failure(details)}),{retryable:false,reason:'output_limit'});
    assert.deepEqual(decision({code:'API_ERROR',partialResult:{verificationFailure:failure(details)}}),{retryable:false,reason:'output_limit'});
  }
  assert.deepEqual(decision({code:'BUILD_LIMIT'}),{retryable:false,reason:'output_limit'});
});

test('known permanent evidence wins over generic transient error codes or network metadata',()=>{
  const value={code:'API_CAPACITY',verificationFailure:failure({httpStatus:401}),requestDiagnostics:{failureOrigin:'network'},partialResult:{verificationFailure:failure({code:'CONNECTION'})}};
  assert.deepEqual(decision(value),{retryable:false,reason:'request_rejected'});
  assert.deepEqual(decision({code:'RATE_LIMIT',verificationFailure:failure({providerCode:'SPENDING-LIMIT'})}),{retryable:false,reason:'account_limit'});
});

test('policy returns only fixed classifications and does not mutate retained answers',()=>{
  const input=Object.freeze({code:'API_ERROR',error:'private text',verificationFailure:Object.freeze(failure()),partialResult:Object.freeze({text:'private retained answer'}),requestDiagnostics:Object.freeze({failureOrigin:'stream',transportStatus:200,providerMessage:'private diagnostic text'})});
  assert.deepEqual(decision(input),{retryable:true,reason:'service'});
  assert.equal(input.partialResult.text,'private retained answer');
  assert.equal(JSON.stringify(decision(input)).includes('private'),false);
});

test('completed answers malformed input and unknown local codes are not error retry triggers',()=>{
  for(const value of [undefined,null,false,[],{},'API_ERROR',{verificationStatus:'completed',text:'A completed finding'},{code:'NEW_SETUP_FAILURE'}]){
    assert.deepEqual(decision(value),{retryable:false,reason:'not_failure'});
  }
});

test('OAuth model requests never replay automatically after submission or authentication uncertainty',()=>{
  for(const code of ['API_ERROR','API_INCOMPLETE','API_STREAM_INTERRUPTED','API_CAPACITY','RATE_LIMIT','TIMEOUT']){
    assert.equal(decision({provider:'oauth',code}).retryable,false,code);
    assert.equal(decision({code,partialResult:{provider:'oauth',verificationStatus:'incomplete'}}).retryable,false,code);
  }
  for(const code of ['OAUTH_LOGIN_REQUIRED','OAUTH_REAUTH_REQUIRED','OAUTH_REFRESH_UNCERTAIN','OAUTH_STORAGE_ERROR','OAUTH_CANCELLED','OAUTH_ACCOUNT_CHANGED','OAUTH_DEVICE_EXPIRED','OAUTH_ACCESS_DENIED','OAUTH_AUTH_UNAVAILABLE','OAUTH_DEVICE_INVALID','OAUTH_CATALOG_UNAVAILABLE'])assert.equal(decision({code}).retryable,false,code);
  assert.deepEqual(decision({provider:'oauth',code:'API_ERROR',verificationFailure:failure({httpStatus:402,providerCode:'spending_limit'})}),{retryable:false,reason:'account_limit'});
  assert.deepEqual(decision({provider:'oauth',verificationStatus:'incomplete'}),{retryable:false,reason:'oauth_no_replay'});
});
