(function (root, factory) {
  'use strict';
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  if (root) root.XGrokCore = core;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // These sections can contain payment, authentication or private account data.
  // A path check is defense in depth, not an origin-level security boundary.
  const SENSITIVE_X_SECTIONS = Object.freeze([
    'account', 'accounts', 'billing', 'chat', 'flow', 'grok', 'login', 'logout',
    'messages', 'monetization', 'money', 'oauth', 'payment', 'payments',
    'premium', 'settings', 'signup', 'wallet', 'wallets'
  ]);
  function isSupportedXPath(pathname) {
    if (typeof pathname !== 'string' || pathname.length > 4096 || !pathname.startsWith('/')) return false;
    let path;
    try { path = decodeURIComponent(pathname); } catch { return false; }
    // Fail closed for ambiguous, malformed and multiply encoded paths.
    if (/[\\%?#\u0000-\u0020\u007f]/.test(path) || path.split('/').some(part => part === '.' || part === '..')) return false;
    const parts = path.toLowerCase().split('/').filter(Boolean);
    const section = parts[0] === 'i' ? parts[1] : parts[0];
    return !SENSITIVE_X_SECTIONS.includes(section);
  }
  function isSupportedXPage(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && ['x.com', 'twitter.com'].includes(url.hostname) &&
        !url.port && !url.username && !url.password && isSupportedXPath(url.pathname);
    } catch { return false; }
  }

  const LANGUAGES = Object.freeze([
    { value: 'auto', label: '自动 · 帖子当前显示语言' },
    { value: 'en', label: 'English' },
    { value: 'zh-CN', label: '简体中文' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
    { value: 'zh-TW', label: '繁體中文' },
    { value: 'es', label: 'Español' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
    { value: 'pt', label: 'Português' },
    { value: 'ar', label: 'العربية' },
    { value: 'ru', label: 'Русский' },
    { value: 'hi', label: 'हिन्दी' }
  ].map(Object.freeze));

  const API_MODELS = Object.freeze([
    {value:'grok-4.3',label:'Grok 4.3',efforts:['none','low','medium','high'],defaultEffort:'none'},
    {value:'grok-4.5',label:'Grok 4.5',efforts:['low','medium','high'],defaultEffort:'low'},
    {value:'grok-4.6',label:'Grok 4.6',efforts:['low','medium','high','xhigh'],defaultEffort:'low'},
    {value:'grok-4.7',label:'Grok 4.7',efforts:['low','medium','high','xhigh'],defaultEffort:'low'}
  ].map(profile=>Object.freeze({...profile,efforts:Object.freeze(profile.efforts)})));
  function modelProfile(model) {
    const value=model==='grok-4.3-latest'?'grok-4.3':model;
    return API_MODELS.find(profile=>profile.value===value)||null;
  }
  function isNonTextGenerationModel(model) {
    // A catalog contains image/video generators as well as text models.
    // Reject only established generation families; an unknown text/custom ID
    // remains a compatible saved choice rather than silently becoming 4.3.
    return typeof model==='string'&&/^grok-(?:imagine|2-image)(?:[-.]|$)/i.test(model.trim());
  }
  function reasoningEffort(model,value) {
    const profile=modelProfile(model);
    // Unknown/custom model IDs retain their server defaults instead of
    // receiving a parameter whose compatibility has not been established.
    return profile?(profile.efforts.includes(value)?value:profile.defaultEffort):'auto';
  }
  function buildReasoningEffort(model,value) {
    // ACP negotiates concrete runtime levels independently of the API model
    // catalog. Keep 'none', 'minimal' and 'low' distinct; the live catalog
    // must advertise the chosen level before a request can run.
    return ['none','minimal','low','medium','high','xhigh'].includes(value)?value:
      ['grok-4.3','grok-4.3-latest'].includes(model)?'none':'low';
  }
  function oauthReasoningEffort(value) {
    // The signed-in account's live catalog decides availability. Preserve an
    // explicit level rather than substituting another model's API default.
    return ['auto','none','minimal','low','medium','high','xhigh'].includes(value)?value:'none';
  }
  function providerModel(settings) {
    return settings?.provider==='oauth'?settings.oauthModel||'grok-4.3':settings?.provider==='build'?settings.buildModel||'grok-4.3':settings?.apiModel||'grok-4.3';
  }
  function providerEffort(settings) {
    return settings?.provider==='oauth'?oauthReasoningEffort(settings.oauthReasoningEffort):settings?.provider==='build'?buildReasoningEffort(providerModel(settings),settings.buildReasoningEffort):reasoningEffort(providerModel(settings),settings?.apiReasoningEffort);
  }
  const API_FAILURE_PROVIDER_CODES=new Set(['invalid_request_error','invalid_request','bad_request','invalid_api_key','authentication_error','unauthenticated','permission_error','permission_denied','forbidden','insufficient_quota','insufficient_credits','spending_limit','usage_limit_exceeded','rate_limit_exceeded','rate_limit_error','too_many_requests','resource_exhausted','model_not_found','model_not_supported','unsupported_model','unsupported_parameter','invalid_parameter','invalid_argument','context_length_exceeded','server_error','internal_server_error','internal_error','service_unavailable','service_unavailable_error','overloaded_error','timeout','request_timeout','gateway_timeout','tool_error','tool_unavailable','search_error','search_unavailable','content_filter']);
  function apiFailureProviderCode(value){
    if(typeof value!=='string'||value.length>64)return undefined;
    const code=value.toLowerCase().replace(/-/g,'_');
    return API_FAILURE_PROVIDER_CODES.has(code)?code:undefined;
  }
  const AUTO_RETRY_DELAY_MS=3000;
  const AUTO_RETRY_LIMIT=5;
  const RETRY_CANCEL_CODES=new Set(['CANCELED','CANCELLED','BUILD_CANCELED','BUILD_CANCELLED','BUILD_CANCEL_UNCONFIRMED','RAIL_COLLAPSED']);
  const RETRY_SETUP_CODES=new Set(['NEEDS_KEY','KEY_MIGRATION_REQUIRED','POST_INVALID','URL_SEARCH_REQUIRED','BUILD_CONNECTION_REQUIRED','BUILD_AUTH_FAILED','BUILD_PERMISSION_REQUIRED','BUILD_LOGIN_REQUIRED','BUILD_NATIVE_MISSING','BUILD_UNAVAILABLE','BUILD_VERSION_UNSUPPORTED','BUILD_CONFIG_UNSUPPORTED','BUILD_MODEL_UNSUPPORTED','BUILD_EFFORT_UNSUPPORTED','BUILD_TOOL_POLICY','BUILD_PROTOCOL_ERROR','BUILD_ACCESS_DENIED']);
  const RETRY_BUDGET_CODES=new Set(['insufficient_quota','insufficient_credits','spending_limit','usage_limit_exceeded']);
  const RETRY_ACCESS_CODES=new Set(['invalid_request_error','invalid_request','bad_request','invalid_api_key','authentication_error','unauthenticated','permission_error','permission_denied','forbidden','model_not_found','model_not_supported','unsupported_model','unsupported_parameter','invalid_parameter','invalid_argument','context_length_exceeded','content_filter']);
  const RETRY_SERVICE_CODES=new Set(['API_ERROR','API_INCOMPLETE','API_STREAM_INTERRUPTED','API_STREAM_ERROR','API_LANGUAGE_MISMATCH','API_CAPACITY','RATE_LIMIT','TIMEOUT','COMMENTS_INVALID_RESPONSE','BUILD_BUSY','BUILD_TIMEOUT','BUILD_DISCONNECTED','BUILD_RATE_LIMIT','BUILD_QUOTA','BUILD_OUTPUT_INVALID','BUILD_LANGUAGE_MISMATCH','BUILD_SEARCH_NOT_PERFORMED','UNKNOWN']);
  function autoRetryDecision(value) {
    // A terminal error and its retained partial answer belong to one attempt.
    // Stronger structured refusal/cancellation evidence wins over a generic
    // network classification. Never inspect or return provider prose here.
    const object=item=>item&&typeof item==='object'&&!Array.isArray(item)?item:null;
    const values=[object(value),object(value?.partialResult)].filter(Boolean);
    if(!values.length)return {retryable:false,reason:'not_failure'};
    const failures=values.flatMap(item=>[object(item.verificationFailure),object(item.failureDetails)]).filter(Boolean);
    const codes=values.map(item=>item.code).concat(failures.map(item=>item.errorCode));
    const providers=failures.map(item=>apiFailureProviderCode(item.providerCode)).filter(Boolean);
    const statuses=failures.map(item=>item.httpStatus).concat(values.map(item=>item.requestDiagnostics?.transportStatus)).filter(item=>Number.isInteger(item)&&item>=400&&item<=599);
    if(values.some(item=>item.name==='AbortError')||codes.some(code=>RETRY_CANCEL_CODES.has(code)))return {retryable:false,reason:'cancelled'};
    if(codes.includes('MODEL_UNSUPPORTED'))return {retryable:false,reason:'request_rejected'};
    if(codes.some(code=>RETRY_SETUP_CODES.has(code)))return {retryable:false,reason:'setup_required'};
    if(providers.some(code=>RETRY_BUDGET_CODES.has(code))||statuses.includes(402))return {retryable:false,reason:'account_limit'};
    if(failures.some(item=>item.code==='OUTPUT_LIMIT'||['max_output_tokens','content_filter'].includes(item.reason))||codes.includes('BUILD_LIMIT'))return {retryable:false,reason:'output_limit'};
    if(providers.some(code=>RETRY_ACCESS_CODES.has(code)))return {retryable:false,reason:'request_rejected'};
    if(statuses.some(status=>status<500&&![408,425,429].includes(status)))return {retryable:false,reason:'request_rejected'};
    if(failures.some(item=>item.code==='ACCESS'))return {retryable:false,reason:'request_rejected'};
    // OAuth refresh is owned by the credential manager. A model request whose
    // result is unknown must never be replayed by the generic retry scheduler.
    if(values.some(item=>item.provider==='oauth')||codes.some(code=>typeof code==='string'&&code.startsWith('OAUTH_')))return {retryable:false,reason:'oauth_no_replay'};
    if(codes.includes('API_CAPACITY'))return {retryable:true,reason:'capacity'};
    if(codes.some(code=>['RATE_LIMIT','BUILD_RATE_LIMIT','BUILD_QUOTA','BUILD_BUSY'].includes(code))||statuses.includes(429)||failures.some(item=>item.code==='RATE_LIMIT'))return {retryable:true,reason:'rate_limit'};
    if(statuses.some(status=>status>=500))return {retryable:true,reason:'server'};
    if(statuses.some(status=>status===408||status===425)||values.some(item=>item.requestDiagnostics?.failureOrigin==='network')||failures.some(item=>['CONNECTION','TIMEOUT'].includes(item.code))||codes.some(code=>['TIMEOUT','BUILD_TIMEOUT','BUILD_DISCONNECTED','API_STREAM_INTERRUPTED','API_STREAM_ERROR'].includes(code)))return {retryable:true,reason:'connection'};
    if(codes.some(code=>RETRY_SERVICE_CODES.has(code))||failures.some(item=>['INCOMPLETE','LANGUAGE_MISMATCH','SERVER','UNKNOWN'].includes(item.code))||values.some(item=>['incomplete','failed'].includes(item.verificationStatus)))return {retryable:true,reason:'service'};
    return {retryable:false,reason:'not_failure'};
  }
  const REQUEST_FAILURE_ORIGINS=new Set(['http','stream','network']);
  const REQUEST_EFFORTS=new Set(['auto','none','minimal','low','medium','high','xhigh','max']);
  const DIAGNOSTIC_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function safeProviderMessage(value) {
    if(typeof value!=='string'||value.length>8192)return undefined;
    const text=value.normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/https?:\/\/[^\s<>"')]+/gi,raw=>{
      try{const url=new URL(raw);return url.origin+url.pathname;}catch{return '[redacted URL]';}
    }).replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,'Bearer [redacted]')
      .replace(/\b(?:xai-|sk-)[A-Za-z0-9_./+=-]*/gi,'[redacted]')
      .replace(/[\p{L}\p{N}.!#$%&'*+\/=?^_`{|}~-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu,'[redacted email]')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,'[redacted ID]')
      .replace(/[A-Za-z0-9_-]{24,}/g,'[redacted ID]')
      .replace(/\b\d{8,}\b/g,'[redacted ID]')
      .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,' ')
      .replace(/\s+/g,' ').trim();
    return text?Array.from(text).slice(0,600).join(''):undefined;
  }
  function sanitizedRequestDiagnostics(value) {
    if(!value||typeof value!=='object'||!REQUEST_FAILURE_ORIGINS.has(value.failureOrigin))return undefined;
    const result={failureOrigin:value.failureOrigin};
    if(Number.isInteger(value.transportStatus)&&value.transportStatus>=100&&value.transportStatus<=599)result.transportStatus=value.transportStatus;
    for(const field of ['requestId','responseId'])if(typeof value[field]==='string'&&DIAGNOSTIC_UUID.test(value[field]))result[field]=value[field].toLowerCase();
    const message=safeProviderMessage(value.providerMessage);if(message)result.providerMessage=message;
    for(const field of ['startedAt','failedAt'])if(Number.isSafeInteger(value[field])&&value[field]>=0&&value[field]<=8_640_000_000_000_000)result[field]=value[field];
    if(Number.isSafeInteger(value.elapsedMs)&&value.elapsedMs>=0&&value.elapsedMs<=86_400_000)result.elapsedMs=value.elapsedMs;
    for(const field of ['model','requestedModel'])if(typeof value[field]==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(value[field])&&!/^(?:xai-|sk-)/i.test(value[field]))result[field]=value[field];
    if(REQUEST_EFFORTS.has(value.requestedEffort))result.requestedEffort=value.requestedEffort;
    return result;
  }

  const MAX_PROMPT_LENGTH = 12000;
  // Recognize only our exact former default, including copies saved by the
  // custom editor. Preserve every genuinely edited instruction verbatim.
  const RETIRED_VERIFY_PROMPT = 'Fact-check the important, checkable claims in this post. Start directly with useful findings: what the evidence supports, contradicts or leaves unresolved, with corrections and clickable primary sources beside the relevant finding. Add only information the reader cannot already see in the post. Do not summarize, paraphrase, translate or repeat the original post; use at most a minimal identifying claim fragment when needed to make a correction clear. Keep the response concise and let the evidence determine its natural form, without a stock introduction, rigid checklist or generic disclaimer. If there is no meaningful checkable claim, say so briefly instead of manufacturing a fact check.';
  const RETIRED_DRAFT_PROMPT = 'Fact-check only the user\'s unpublished draft, not the post they are replying to. Examine the draft\'s explicit claims, implied factual premises and checkable comparisons. Use reply context only to resolve references or understand what the draft asserts. Every finding must directly support, correct or qualify a claim or implication of the draft; do not add facts merely because they appear in the parent post. For opinions, jokes or broad superlatives, explain the relevant criteria and investigate useful factual implications without turning personal taste into an objective verdict. Go deeper where useful while keeping the scope anchored to the draft. Start with the most useful conclusion about the draft, followed by concise, directly relevant evidence and clickable primary sources when available. Match the answer\'s length to the draft\'s actual claims. Do not summarize either text, enumerate unrelated parent claims, or rewrite the user\'s wording.';
  const RETIRED_SHARED_DRAFT_PROMPT = 'Go deeper into the user\'s unpublished draft by investigating its explicit claims, implied factual premises and useful comparisons. First resolve references such as "this incident", "the original post" or "that number" from the supplied thread root, earlier ancestors and direct reply context. A short reply may affirm or deny a concrete event described earlier in the conversation; identify and investigate that event instead of requiring the draft to repeat its details. When the draft makes a factual claim, denies an event, or adopts a checkable premise, use available search tools to trace original reports, dates, places, mechanisms, numbers and relevant cases. Follow leads far enough to test the draft, including chronology or statistics when they matter. For purely subjective opinions, explain relevant criteria without pretending there is a universal objective ranking. Every finding must help assess the draft or its resolved referent; do not turn the task into an unrelated audit of every parent claim. Start with the most useful conclusion, followed by concise evidence and clickable primary sources. Explain a remaining information gap only after using the available context and relevant search leads. Do not summarize either text, add generic disclaimers or rewrite the user\'s wording.';
  const POST_DRAFT_PROMPT = 'The target is the user\'s unpublished new post. Apply the shared fact-check instructions to that draft. Quoted posts are auxiliary context, not direct parents or independent targets. Resolve references using the draft and any relevant quoted context without assuming a reply relationship.';
  const REPLY_DRAFT_PROMPT = 'The target is the user\'s unpublished reply. Apply the shared fact-check instructions to that draft and its resolved referents. Use the thread root, earlier ancestors and direct parent to resolve expressions such as "this incident", "the original post" or "that number". A short reply can affirm or deny an earlier event without repeating its details. Use relevant original-post URLs to complete truncated context; do not replace the reply target with an unrelated audit of parent claims.';
  const DEFAULT_PROMPTS = Object.freeze({
    verify: 'Go deeper into this post by investigating its explicit factual claims, reasonably implied factual premises and checkable details. Follow relevant leads in original sources, context, numbers, comparisons and causal reasoning. Start directly with useful findings: what the evidence supports, contradicts or leaves unresolved, with corrections and clickable primary sources beside the relevant finding. Add only information the reader cannot already see in the post. Do not summarize, paraphrase, translate or repeat the original post; use at most a minimal identifying claim fragment when needed to make a correction clear. Keep the response concise and let the evidence determine its natural form, without a stock introduction, rigid checklist or generic disclaimer.',
    postDraft: POST_DRAFT_PROMPT,
    replyDraft: REPLY_DRAFT_PROMPT,
    draft: REPLY_DRAFT_PROMPT,
    comments: 'Draft exactly three distinct optional comments responding to the original X post. Each comment must be one concise natural sentence with a different useful angle. Offer natural and relevant perspectives suitable for the user to review and copy.'
  });
  function normalizePrompt(value, fallback) {
    if (fallback === DEFAULT_PROMPTS.verify && typeof value === 'string' && value.trim() === RETIRED_VERIFY_PROMPT) return fallback;
    if ([DEFAULT_PROMPTS.postDraft,DEFAULT_PROMPTS.replyDraft].includes(fallback) && typeof value === 'string' && [RETIRED_DRAFT_PROMPT,RETIRED_SHARED_DRAFT_PROMPT].includes(value.trim())) return fallback;
    return typeof value === 'string' && value.trim() && value.length <= MAX_PROMPT_LENGTH ? value : fallback;
  }
  function legacyCustomDraftPrompt(value) {
    return typeof value==='string'&&value.trim()&&value.length<=MAX_PROMPT_LENGTH&&
      ![RETIRED_DRAFT_PROMPT,RETIRED_SHARED_DRAFT_PROMPT,DEFAULT_PROMPTS.postDraft,DEFAULT_PROMPTS.replyDraft].includes(value.trim())?value:undefined;
  }
  // Defensive presentation only: these values are never executed as commands.
  const TOOL_ARGUMENTS = Object.freeze({
    web_search:['query','queries','num_results','max_results','search_query','domains','recency','from_date','to_date'],
    web_search_with_snippets:['query','queries','num_results','max_results'],
    web_search_with_search_results:['query','queries','num_results','max_results'],
    browse_page:['url','instructions'],
    x_thread_fetch:['post_id','tweet_id','thread_id','id'],
    x_keyword_search:['query','mode','limit','num_results','from_date','to_date'],
    x_semantic_search:['query','limit','num_results','from_date','to_date','min_score'],
    x_user_search:['query','count','limit','num_results'],
    view_image:['image_url','url'],
    view_x_image:['image_url','url'],
    view_x_video:['video_url','url'],
    x_get_tweet:['post_id','tweet_id','id'],
    x_get_user:['user_id','username','id']
  });
  function toolInvocation(value) {
    if(Array.isArray(value))return value.length>0&&value.every(toolInvocation);
    if(!value||typeof value!=='object')return false;
    const name=value.absolute_path;
    if(typeof name!=='string'||!Object.hasOwn(TOOL_ARGUMENTS,name))return false;
    const keys=Object.keys(value);
    return keys.length>1&&keys.every(key=>key==='absolute_path'||TOOL_ARGUMENTS[name].includes(key));
  }
  function readerOutput(value,{final=false}={}) {
    const text=typeof value==='string'?value:'';
    const body=text.trim();
    if(!body)return {kind:'empty',text:''};
    const content=()=>({kind:'content',text});
    const hidden=kind=>({kind,text:''});
    let cursor=0,found=false,inFence=false;
    const whitespace=()=>{while(/\s/.test(body[cursor]||'')&&cursor<body.length)cursor++;};
    while(cursor<body.length) {
      whitespace();
      if(cursor>=body.length)break;
      if(body[cursor]==='`'||body[cursor]==='~') {
        const rest=body.slice(cursor),marker=rest[0].repeat(3);
        if(rest.length<3&&marker.startsWith(rest))return final?content():hidden('pending');
        if(!rest.startsWith(marker))return content();
        if(inFence) {cursor+=3;inFence=false;continue;}
        const lineEnd=rest.indexOf('\n');
        const label=(lineEnd<0?rest.slice(3):rest.slice(3,lineEnd)).trim().toLowerCase();
        if(!['','json'].includes(label)) {
          if(!final&&lineEnd<0&&'json'.startsWith(label))return hidden('pending');
          return content();
        }
        if(lineEnd<0)return final?content():hidden('pending');
        cursor+=lineEnd+1;inFence=true;continue;
      }
      if(!['{','['].includes(body[cursor]))return content();
      const start=cursor,stack=[];
      let quoted=false,escaped=false,complete=false;
      for(;cursor<body.length;cursor++) {
        const char=body[cursor];
        if(quoted) {
          if(escaped)escaped=false;
          else if(char==='\\')escaped=true;
          else if(char==='"')quoted=false;
        } else if(char==='"')quoted=true;
        else if(char==='{'||char==='[')stack.push(char);
        else if(char==='}'||char===']') {
          const open=stack.pop();
          if(open!==(char==='}'?'{':'['))return content();
          if(!stack.length){cursor++;complete=true;break;}
        }
      }
      if(!complete) {
        if(!final)return hidden('pending');
        // A truncated known invocation cannot become a retained partial answer.
        // Ordinary unfinished JSON, paths and technical code remain visible.
        const fragment=body.slice(start);
        const match=fragment.match(/"absolute_path"\s*:\s*"([a-z_]+)"/);
        if(match&&Object.hasOwn(TOOL_ARGUMENTS,match[1]))return hidden('tool_only');
        return content();
      }
      let parsed;
      try{parsed=JSON.parse(body.slice(start,cursor));}catch{return content();}
      if(!toolInvocation(parsed))return content();
      found=true;
    }
    return found?hidden(inFence&&!final?'pending':'tool_only'):content();
  }
  function explanationMode(settings) {
    return ['preset', 'custom'].includes(settings?.explanationMode) ? settings.explanationMode : 'preset';
  }
  const DEFAULT_SETTINGS = Object.freeze({
    provider: 'oauth',
    enabled: true,
    analysisDefaultsVersion: 1,
    dwellMs: 1000,
    maxPerSession: 0,
    cooldownMs: 0,
    language: 'auto',
    interfaceLanguage: 'auto',
    apiModel: 'grok-4.3',
    apiReasoningEffort: 'none',
    oauthModel: 'grok-4.3',
    oauthReasoningEffort: 'none',
    oauthRemember: true,
    buildDefaultsVersion: 1,
    buildTransport: 'acp',
    buildPort: 2419,
    buildModel: 'grok-4.3',
    buildReasoningEffort: 'none',
    apiConcurrency: 3,
    apiVerification: 'only',
    webSearch: true,
    xSearch: true,
    explanationMode: 'preset',
    verifyPrompt: DEFAULT_PROMPTS.verify,
    postDraftPrompt: DEFAULT_PROMPTS.postDraft,
    replyDraftPrompt: DEFAULT_PROMPTS.replyDraft,
    draftPrompt: DEFAULT_PROMPTS.draft,
    commentsPrompt: DEFAULT_PROMPTS.comments
  });

  function boundedNumber(value, fallback, min, max) {
    if (value === '' || value === null || typeof value === 'boolean') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
  }

  function validLanguage(language) {
    if (language === 'auto') return true;
    // Preserve tags accepted by previous versions without changing their spelling.
    if (/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language)) return true;
    if (!language || language.length > 255) return false;
    try { return Intl.getCanonicalLocales(language).length === 1; } catch (_) { return false; }
  }

  function responseLanguageKey(value) {
    if (typeof value !== 'string' || value === 'auto' || !validLanguage(value)) return 'auto';
    return LANGUAGES.find(item => item.value !== 'auto' && item.value.toLowerCase() === value.toLowerCase())?.value || value;
  }

  function inferredTextLanguage(text) {
    // A missing DOM language must not send us to a quoted post or search result.
    // Infer only from the author's displayed prose, excluding URLs and handles.
    const prose = String(text || '').replace(/https?:\/\/\S+|@[A-Za-z0-9_]+/g, '');
    const count = pattern => (prose.match(pattern) || []).length;
    const latin = count(/[A-Za-z\u00c0-\u024f]/g);
    const kana = count(/[\u3040-\u30ff]/g);
    const han = count(/[\u3400-\u4dbf\u4e00-\u9fff]/g);
    const hangul = count(/[\uac00-\ud7af\u1100-\u11ff]/g);
    const scripts = [
      ['ja', kana >= 2 ? kana + han : 0], ['ko', hangul],
      ['zh-CN', kana ? 0 : han]
    ].sort((a, b) => b[1] - a[1]);
    if (scripts[0][1] >= 2 && scripts[0][1] >= latin * 0.3) return scripts[0][0];
    // Cyrillic, Arabic and Devanagari each serve multiple languages. Their
    // script alone cannot justify locking Russian, Arabic or Hindi.
    // Latin script alone cannot distinguish English from French, Spanish, etc.
    // Require several English function words instead of guessing from a name.
    const words = prose.toLowerCase().match(/\b[a-z]+\b/g) || [];
    const english = words.filter(word => /^(?:the|and|this|that|these|those|is|are|was|were|has|have|with|from|for|your|you|it|its|their|they|will|would|can|could|should|of|to|in|on|as|but|not)$/.test(word));
    if (words.length >= 4 && english.length >= 2 && english.length / words.length >= 0.15) return 'en';
    return 'auto';
  }

  function resolvePostLanguage(value, post) {
    const selected = responseLanguageKey(value);
    if (selected !== 'auto') return selected;
    const hint = typeof post?.language === 'string' ? post.language : '';
    if (hint && hint !== 'auto' && !/^(?:und|mul|zxx)(?:-|$)/i.test(hint) && validLanguage(hint)) {
      try {
        const canonical = Intl.getCanonicalLocales(hint)[0], base = canonical.split('-')[0];
        if (base === 'zh') return /(?:^|-)(?:Hant|TW|HK|MO)(?:-|$)/i.test(canonical) ? 'zh-TW' : 'zh-CN';
        return LANGUAGES.some(item => item.value === base) ? base : canonical;
      } catch (_) { /* Fall back to the displayed text, never the page language. */ }
    }
    return inferredTextLanguage(post?.text);
  }

  function normalizeSettings(input) {
    const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    // New installations start with subscription sign-in. Nonempty legacy
    // settings without a source keep their previous API default on upgrade.
    const defaultProvider = Object.keys(value).length ? 'api' : DEFAULT_SETTINGS.provider;
    const language = typeof value.language === 'string' ? value.language.trim() : '';
    const interfaceLanguage = typeof value.interfaceLanguage === 'string' ? value.interfaceLanguage.trim().toLowerCase() : '';
    const model = typeof value.apiModel === 'string' ? value.apiModel.trim() : '';
    const normalizedModel = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(model) ? model : DEFAULT_SETTINGS.apiModel;
    const oauthModel = typeof value.oauthModel === 'string' ? value.oauthModel.trim() : '';
    const normalizedOAuthModel = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(oauthModel) ? oauthModel : DEFAULT_SETTINGS.oauthModel;
    const buildModel = typeof value.buildModel === 'string' ? value.buildModel.trim() : '';
    // Former records did not track whether 4.7/low was manually selected.
    // Migrate only that exact former default once. The marker preserves a
    // later explicit selection of the same pair and all other combinations.
    const migrateBuildDefaults=value.buildDefaultsVersion!==DEFAULT_SETTINGS.buildDefaultsVersion&&buildModel==='grok-4.7'&&value.buildReasoningEffort==='low';
    const normalizedBuildModel = migrateBuildDefaults ? DEFAULT_SETTINGS.buildModel : /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(buildModel) ? buildModel : DEFAULT_SETTINGS.buildModel;
    const currentDefaults=value.analysisDefaultsVersion===DEFAULT_SETTINGS.analysisDefaultsVersion;
    const dwell=boundedNumber(value.dwellMs,DEFAULT_SETTINGS.dwellMs,0,30000);
    const concurrency=boundedNumber(value.apiConcurrency,DEFAULT_SETTINGS.apiConcurrency,1,8);
    return {
      // The retired page automation provider is unrelated to Grok Build.
      provider: ['api','build','oauth'].includes(value.provider) ? value.provider : defaultProvider,
      enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_SETTINGS.enabled,
      // Upgrade former zero-delay/default-four records once. The versioned
      // output preserves later explicit selections of zero or four.
      analysisDefaultsVersion: DEFAULT_SETTINGS.analysisDefaultsVersion,
      dwellMs: !currentDefaults&&dwell===0?DEFAULT_SETTINGS.dwellMs:dwell,
      // The old per-session cap and launch-spacing controls remain retired.
      maxPerSession: 0,
      cooldownMs: 0,
      language: validLanguage(language) ? language : DEFAULT_SETTINGS.language,
      interfaceLanguage: LANGUAGES.find(item => item.value.toLowerCase() === interfaceLanguage)?.value || DEFAULT_SETTINGS.interfaceLanguage,
      apiModel: normalizedModel,
      apiReasoningEffort: reasoningEffort(normalizedModel,value.apiReasoningEffort),
      oauthModel: normalizedOAuthModel,
      oauthReasoningEffort: oauthReasoningEffort(value.oauthReasoningEffort),
      oauthRemember: typeof value.oauthRemember==='boolean'?value.oauthRemember:DEFAULT_SETTINGS.oauthRemember,
      buildDefaultsVersion: DEFAULT_SETTINGS.buildDefaultsVersion,
      buildTransport: DEFAULT_SETTINGS.buildTransport,
      buildPort: boundedNumber(value.buildPort, DEFAULT_SETTINGS.buildPort, 1024, 65535),
      buildModel: normalizedBuildModel,
      buildReasoningEffort: buildReasoningEffort(normalizedBuildModel,migrateBuildDefaults?DEFAULT_SETTINGS.buildReasoningEffort:value.buildReasoningEffort),
      apiConcurrency: !currentDefaults&&concurrency===4?DEFAULT_SETTINGS.apiConcurrency:concurrency,
      // Legacy explanation/combined/off choices all become one fact-check task.
      apiVerification: 'only',
      webSearch: typeof value.webSearch === 'boolean' ? value.webSearch : DEFAULT_SETTINGS.webSearch,
      xSearch: typeof value.xSearch === 'boolean' ? value.xSearch : DEFAULT_SETTINGS.xSearch,
      explanationMode: explanationMode(value),
      // A temporarily retired editor must not erase a user's existing draft.
      // This dormant field has no default and is never used by live requests.
      ...(typeof value.explainPrompt === 'string' && value.explainPrompt.trim() && value.explainPrompt.length <= MAX_PROMPT_LENGTH ? {explainPrompt: value.explainPrompt} : {}),
      verifyPrompt: normalizePrompt(value.verifyPrompt, DEFAULT_PROMPTS.verify),
      postDraftPrompt: normalizePrompt(Object.hasOwn(value,'postDraftPrompt')?value.postDraftPrompt:legacyCustomDraftPrompt(value.draftPrompt),DEFAULT_PROMPTS.postDraft),
      replyDraftPrompt: normalizePrompt(Object.hasOwn(value,'replyDraftPrompt')?value.replyDraftPrompt:legacyCustomDraftPrompt(value.draftPrompt),DEFAULT_PROMPTS.replyDraft),
      draftPrompt: normalizePrompt(value.draftPrompt, DEFAULT_PROMPTS.draft),
      commentsPrompt: normalizePrompt(value.commentsPrompt, DEFAULT_PROMPTS.comments)
    };
  }

  function canonicalPostUrl(href) {
    if (typeof href !== 'string' || !href.trim()) return null;
    try {
      const url = new URL(href, 'https://x.com');
      if (!/^https?:$/.test(url.protocol) || !/^(?:www\.)?(?:x\.com|twitter\.com)$/i.test(url.hostname)) return null;
      const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)(?:\/|$)/) ||
        url.pathname.match(/^\/i\/web\/status\/(\d+)(?:\/|$)/);
      if (!match) return null;
      if (match.length === 2) return `https://x.com/i/web/status/${match[1]}`;
      return `https://x.com/${match[1].toLowerCase()}/status/${match[2]}`;
    } catch (_) {
      return null;
    }
  }

  function all(element, selector) {
    return element && typeof element.querySelectorAll === 'function' ? Array.from(element.querySelectorAll(selector)) : [];
  }

  function attribute(element, name) {
    return element && typeof element.getAttribute === 'function' ? element.getAttribute(name) || '' : '';
  }

  function textOf(element) {
    if (!element) return '';
    const value = typeof element.innerText === 'string' ? element.innerText : element.textContent;
    return String(value || '').replace(/\r/g, '').split('\n').map(line => line.replace(/[\t ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function displayed(element, scope, visibility) {
    const view = element?.ownerDocument?.defaultView;
    for (let cursor = element; cursor; cursor = cursor.parentElement) {
      if (visibility.has(cursor)) {
        if (!visibility.get(cursor)) return false;
      } else {
        let hidden = typeof cursor.getAttribute === 'function' && cursor.getAttribute('hidden') !== null;
        hidden ||= attribute(cursor, 'aria-hidden').toLowerCase() === 'true';
        const inline = attribute(cursor, 'style');
        hidden ||= /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))\s*(?:!important\s*)?(?:;|$)/i.test(inline);
        if (!hidden && typeof view?.getComputedStyle === 'function') {
          const style = view.getComputedStyle(cursor);
          hidden = style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse';
        }
        visibility.set(cursor, !hidden);
        if (hidden) return false;
      }
      if (cursor === scope) return true;
    }
    return false;
  }

  function isArticle(element) {
    return String(element && element.tagName || '').toLowerCase() === 'article';
  }

  function quoteRootFor(element, article) {
    let cursor = element && element.parentElement;
    let result = null;
    while (cursor && cursor !== article) {
      const testId = attribute(cursor, 'data-testid');
      const tag = String(cursor.tagName || '').toLowerCase();
      if (isArticle(cursor) || /^(?:quoteTweet|quotedTweet|quoted-post|card\.wrapper)$/i.test(testId) ||
          (tag !== 'a' && attribute(cursor, 'role') === 'link')) result = cursor;
      cursor = cursor.parentElement;
    }
    return cursor === article ? result : null;
  }

  function ownedBy(element, scope, article, quoteRoot = quoteRootFor) {
    const root = quoteRoot(element, article);
    return scope === article ? !root : root === scope;
  }

  function anchorsFor(scope, article, quoteRoot = quoteRootFor) {
    return all(scope, 'a[href]').filter(anchor => ownedBy(anchor, scope, article, quoteRoot) && canonicalPostUrl(attribute(anchor, 'href')));
  }

  function mainAnchorFor(scope, article, quoteRoot = quoteRootFor) {
    const anchors = anchorsFor(scope, article, quoteRoot);
    return anchors.find(anchor => all(anchor, 'time').length > 0) || anchors[0] || null;
  }

  function imagesFor(scope, article, quoteRoot = quoteRootFor) {
    const images = [];
    const seen = new Set();
    for (const img of all(scope, 'img')) {
      if (!ownedBy(img, scope, article, quoteRoot)) continue;
      const src = attribute(img, 'src') || img.currentSrc || '';
      let url;
      try { url = new URL(src, 'https://x.com'); } catch (_) { continue; }
      if (url.protocol !== 'https:' || !/^pbs\.twimg\.com$/i.test(url.hostname) ||
          !/^\/(?:media|(?:ext_tw_|amplify_|tweet_)?video_thumb)\//.test(url.pathname)) continue;
      // X changes image sizes as virtualized posts enter view; size changes do not change content.
      url.searchParams.delete('name');
      const normalized = url.toString();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      const thumbnail = /\/(?:ext_tw_|amplify_|tweet_)?video_thumb\//.test(url.pathname);
      images.push({ url: normalized, alt: attribute(img, 'alt').trim(), ...(thumbnail ? {kind:'video-thumbnail'} : {}) });
    }
    return images;
  }

  function scopePost(scope, article, quoteRoot = quoteRootFor, anchorFor = mainAnchorFor) {
    const anchor = anchorFor(scope, article, quoteRoot);
    const url = anchor ? canonicalPostUrl(attribute(anchor, 'href')) : null;
    const timestamp = (anchor ? all(anchor, 'time') : []).find(element => ownedBy(element, scope, article, quoteRoot)) ||
      all(scope, 'time').find(element => ownedBy(element, scope, article, quoteRoot));
    const userName = all(scope, '[data-testid="User-Name"]').find(element => ownedBy(element, scope, article, quoteRoot));
    const visibility = new WeakMap();
    const textNodes = all(scope, '[data-testid="tweetText"]').filter(element => ownedBy(element, scope, article, quoteRoot) && displayed(element, scope, visibility));
    const texts = textNodes.map(textOf).filter(Boolean);
    const language = textNodes.filter(element => textOf(element)).map(element => attribute(element, 'lang'))
      .find(value => value !== 'auto' && !/^(?:und|mul|zxx)(?:-|$)/i.test(value) && validLanguage(value)) || '';
    const images = imagesFor(scope, article, quoteRoot);
    const idMatch = url && url.match(/\/status\/(\d+)$/);
    const username = url && !url.includes('/i/web/status/') ? url.split('/')[3] : '';
    let author = textOf(userName);
    // The header often contains the timestamp after a middle-dot separator.
    if (author) author = author.split(/\n?\s*·\s*\n?/)[0].replace(/\n+/g, ' ').trim();
    if (!author && username) author = `@${username}`;
    const hasVideo = all(scope, 'video, [data-testid="videoPlayer"], [data-testid="videoComponent"]').some(element => ownedBy(element, scope, article, quoteRoot));
    return {
      id: idMatch ? idMatch[1] : null,
      url,
      text: Array.from(new Set(texts)).join('\n\n'),
      language,
      author,
      username,
      timestamp: timestamp ? attribute(timestamp, 'datetime') : '',
      images,
      hasMedia: images.length > 0 || hasVideo,
      ...(hasVideo || images.some(image => image.kind === 'video-thumbnail') ? {hasVideo:true} : {})
    };
  }

  function extractPost(article) {
    if (!article || typeof article.querySelectorAll !== 'function') return null;
    const post = scopePost(article, article);
    if (!post.id || !post.url) return null;
    const roots = new Set();
    for (const element of all(article, 'a[href], [data-testid="tweetText"], time')) {
      const quoteRoot = quoteRootFor(element, article);
      if (quoteRoot) roots.add(quoteRoot);
    }
    // Keep the main post's established identity/language extraction, but use
    // owned scopes for quoted cards so nested media/text stays with its source.
    const quotedContext = Array.from(roots).map(scope => extractPostContext(scope, 1)).filter(Boolean);
    return { ...post, quotedContext, isPromoted: isPromoted(article) };
  }

  // Composer previews can be native buttons and can omit a permalink entirely.
  // Keep this wider recognition separate from ordinary feed-post extraction.
  function contextQuoteRootFor(element, scope) {
    let cursor = element && element.parentElement, result = null;
    while (cursor && cursor !== scope) {
      const testId = attribute(cursor, 'data-testid'),tag = String(cursor.tagName || '').toLowerCase();
      const previewButton = (tag === 'button' || attribute(cursor, 'role') === 'button') &&
        all(cursor, '[data-testid="User-Name"]').length && all(cursor, '[data-testid="tweetText"], time').length;
      if (isArticle(cursor) || /^(?:quoteTweet|quotedTweet|quoted-post|card\.wrapper)$/i.test(testId) ||
          (tag !== 'a' && attribute(cursor, 'role') === 'link') || previewButton) result = cursor;
      cursor = cursor.parentElement;
    }
    return cursor === scope ? result : null;
  }
  function contextAnchorFor(scope, article, quoteRoot) {
    const contains=(root,node)=>{for(let cursor=node;cursor;cursor=cursor.parentElement){if(cursor===root)return true;if(cursor===scope)break;}return false;};
    const bodies=all(scope,'[data-testid="tweetText"]'),visibility=new WeakMap();
    const anchors=anchorsFor(scope,article,quoteRoot).filter(anchor=>displayed(anchor,scope,visibility)&&!bodies.some(body=>contains(body,anchor)));
    const timed=anchors.find(anchor=>all(anchor,'time').some(time=>ownedBy(time,scope,article,quoteRoot)));
    if(timed)return timed;
    const headers=all(scope,'[data-testid="User-Name"]').filter(name=>ownedBy(name,scope,article,quoteRoot));
    // A linked citation in body/media is not the preview's own permalink.
    return anchors.find(anchor=>headers.some(name=>contains(name,anchor)))||null;
  }
  function contextUsername(scope) {
    const name = all(scope, '[data-testid="User-Name"]').find(element => ownedBy(element, scope, scope, contextQuoteRootFor));
    if (!name) return '';
    const handles = [...new Set(Array.from(textOf(name).matchAll(/(?:^|\s)@([A-Za-z0-9_]{1,15})(?=\s|·|$)/g),match => match[1].toLowerCase()))];
    if (handles.length !== 1) return '';
    const profiles = new Set();
    for (const anchor of all(name, 'a[href]')) {
      try {
        const url = new URL(attribute(anchor, 'href'), 'https://x.com');
        if (!/^https?:$/.test(url.protocol) || url.username || url.password || !/^(?:www\.)?(?:x\.com|twitter\.com)$/i.test(url.hostname)) continue;
        const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
        if (match) profiles.add(match[1].toLowerCase());
      } catch { /* A malformed profile link cannot supply an identity. */ }
    }
    return profiles.size && (profiles.size !== 1 || !profiles.has(handles[0])) ? '' : handles[0];
  }
  function contextTextTruncated(scope) {
    const visibility = new WeakMap(),owns = element => ownedBy(element, scope, scope, contextQuoteRootFor);
    if (all(scope, '[data-testid="tweet-text-show-more-link"]').some(element => owns(element) && displayed(element,scope,visibility))) return true;
    return all(scope, '[data-testid="tweetText"]').some(element => {
      if (!owns(element) || !displayed(element,scope,visibility)) return false;
      const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
      const inline = attribute(element,'style').match(/(?:^|;)\s*(?:-webkit-)?line-clamp\s*:\s*(\d+)/i)?.[1];
      const clamp = Number(style?.webkitLineClamp || style?.getPropertyValue?.('-webkit-line-clamp') || style?.lineClamp || inline);
      return clamp > 0 && Number.isFinite(clamp) && Number(element.clientHeight) > 0 && Number(element.scrollHeight) > Number(element.clientHeight) + 1;
    });
  }
  function extractPostContext(scope, depth = 0) {
    if (!scope || typeof scope.querySelectorAll !== 'function') return null;
    const post = scopePost(scope,scope,contextQuoteRootFor,contextAnchorFor);
    const roots = new Set();
    for (const element of all(scope,'a[href], [data-testid="tweetText"], time')) {
      const quote = contextQuoteRootFor(element,scope);if (quote) roots.add(quote);
    }
    // X sometimes wraps the actual preview button in a quoteTweet shell.
    // An empty shell is not another post or another nesting level.
    if (!post.id && !post.text && !post.hasMedia) return roots.size===1?extractPostContext(roots.values().next().value,depth):null;
    if (!post.id) post.username = contextUsername(scope);
    const quotedContext = depth<2?Array.from(roots).slice(0,2).map(root => extractPostContext(root,depth+1)).filter(Boolean):[];
    return {...post,...(depth===0||quotedContext.length||!post.id?{quotedContext}:{}),...(depth===0?{isPromoted:isPromoted(scope)}:{}),
      ...(!post.id?{snapshotOnly:true}:{}),...(contextTextTruncated(scope)?{textTruncated:true}:{})};
  }

  function isPromoted(article) {
    if(all(article, '[data-testid="promotedIndicator"], [data-testid="promotedTweet"]').some(node=>ownedBy(node,article,article)))return true;
    const name=all(article,'[data-testid="User-Name"]').find(node=>ownedBy(node,article,article));
    // placementTracking also appears on ordinary media. Only use the explicit
    // Ad/Promoted label in the author's header row, never words in post text.
    for(let row=name?.parentElement;row&&row!==article;row=row.parentElement) {
      if(all(row,'[data-testid="tweetText"]').some(node=>ownedBy(node,article,article)))break;
      if(!all(row,'[data-testid="caret"]').some(node=>ownedBy(node,article,article)))continue;
      if(all(row,'span').some(node=>ownedBy(node,article,article)&&/^(?:Ad|Promoted|广告|廣告|推广|推廣)$/.test(textOf(node))))return true;
    }
    return false;
  }

  function mediaIdentity(image) {
    if (!image) return '';
    const raw = typeof image === 'string' ? image : image.url;
    try {
      const url = new URL(raw);
      url.searchParams.delete('name');
      return `${url.origin}${url.pathname}${url.search}|${typeof image === 'object' ? image.alt || '' : ''}`;
    } catch (_) { return String(raw || ''); }
  }

  function postFingerprint(post) {
    if (!post) return '';
    const context = value => [value.id || '', value.text || '', value.language || '', value.author || '', value.timestamp || '',
      Boolean(value.hasMedia), (value.images || []).map(mediaIdentity)];
    // Keep the full stable input: no hash collision can serve analysis for a different edit.
    return JSON.stringify([context(post), (post.quotedContext || []).map(context)]);
  }

  // Native Grok analyzes the original post inside X. Media thumbnails and
  // quoted previews hydrate/recycle while a video plays; those render changes
  // must not cancel an already attributed answer for the unchanged parent post.
  function nativePostIdentity(post) {
    return post ? JSON.stringify([String(post.id || ''), canonicalPostUrl(post.url),
      post.text || '', post.author || '', post.timestamp || '']) : '';
  }

  // Every API analysis style retrieves the full post from its canonical URL.
  // Visible text supplies display-language context, so expansion and preview
  // hydration cannot replace the original post or restart a paid analysis.
  function apiPostIdentity(post, settings) {
    // Comments still pass no settings because they use their visible snapshot
    // and analysis context. Native tasks keep their existing local attribution.
    if(post&&settings&&settings.task!=='comments')return JSON.stringify(['post-input-v4-source-full-url',['build','oauth'].includes(settings.provider)?settings.provider:'api',canonicalPostUrl(post.url),resolvePostLanguage(settings.language,post)]);
    return post ? JSON.stringify([nativePostIdentity(post),
      (Array.isArray(post.quotedContext) ? post.quotedContext : []).map(nativePostIdentity)]) : '';
  }

  function visibilityEligibility(rect, viewport, options) {
    const view = typeof viewport === 'number' ? { height: viewport } : viewport || {};
    const settings = options || {};
    const viewportHeight = Number(view.height || view.innerHeight || 0);
    const viewportWidth = Number(view.width || view.innerWidth || Number.MAX_SAFE_INTEGER);
    const top = Number(rect && rect.top);
    const left = Number(rect && rect.left || 0);
    const height = Number(rect && (rect.height || (rect.bottom - rect.top)));
    const width = Number(rect && (rect.width || (rect.right - rect.left)) || viewportWidth);
    if (![top, left, height, width, viewportHeight, viewportWidth].every(Number.isFinite) || height <= 0 || width <= 0 || viewportHeight <= 0 || viewportWidth <= 0) {
      return { eligible: false, visibleRatio: 0, visiblePixels: 0, priority: 0 };
    }
    const visibleHeight = Math.max(0, Math.min(top + height, viewportHeight) - Math.max(top, 0));
    const visibleWidth = Math.max(0, Math.min(left + width, viewportWidth) - Math.max(left, 0));
    const minRatio = Number.isFinite(settings.minRatio) ? settings.minRatio : 0.55;
    const minPixels = Number.isFinite(settings.minVisiblePx) ? settings.minVisiblePx : 96;
    const requiredHeight = Math.max(Math.min(minPixels, height), Math.min(height * minRatio, viewportHeight * 0.5));
    const widthRatio = visibleWidth / width;
    const visibleRatio = visibleHeight * visibleWidth / (height * width);
    const visibleCenter = (Math.max(0, top) + Math.min(top + height, viewportHeight)) / 2;
    const centerCloseness = Math.max(0, 1 - Math.abs(visibleCenter - viewportHeight * 0.45) / viewportHeight);
    return {
      eligible: visibleHeight >= requiredHeight && widthRatio >= 0.5,
      visibleRatio,
      visiblePixels: visibleHeight,
      priority: visibleHeight / viewportHeight + centerCloseness
    };
  }

  class BoundedPostQueue {
    constructor(options) {
      const settings = typeof options === 'number' ? { capacity: options } : options || {};
      this.capacity = settings.capacity === Infinity || settings.capacity === undefined
        ? Infinity : boundedNumber(settings.capacity, Infinity, 1, Number.MAX_SAFE_INTEGER);
      this.items = new Map();
      this.sequence = 0;
    }

    get size() { return this.items.size; }

    enqueue(post, priority) {
      if (!post || !post.id) return false;
      const key = String(post.id);
      const score = Number.isFinite(priority) ? priority : 0;
      this.items.set(key, { post, priority: score, sequence: ++this.sequence });
      if (this.items.size > this.capacity) {
        const last = this.sorted().pop();
        this.items.delete(String(last.post.id));
      }
      return this.items.has(key);
    }

    sorted() {
      return Array.from(this.items.values()).sort((a, b) => b.priority - a.priority || b.sequence - a.sequence);
    }

    take() {
      const next = this.sorted()[0];
      if (!next) return null;
      this.items.delete(String(next.post.id));
      return next.post;
    }

    remove(id) { return this.items.delete(String(id)); }
    has(id) { return this.items.has(String(id)); }
    clear() { this.items.clear(); }
  }

  return Object.freeze({ SENSITIVE_X_SECTIONS, isSupportedXPath, isSupportedXPage, LANGUAGES, API_MODELS, modelProfile, isNonTextGenerationModel, reasoningEffort, buildReasoningEffort, oauthReasoningEffort, providerModel, providerEffort, apiFailureProviderCode, AUTO_RETRY_DELAY_MS, AUTO_RETRY_LIMIT, autoRetryDecision, sanitizedRequestDiagnostics, DEFAULT_SETTINGS, DEFAULT_PROMPTS, MAX_PROMPT_LENGTH, normalizePrompt, readerOutput, explanationMode, normalizeSettings, resolvePostLanguage, canonicalPostUrl, extractPost, extractPostContext, postFingerprint, nativePostIdentity, apiPostIdentity, visibilityEligibility, BoundedPostQueue });
});
