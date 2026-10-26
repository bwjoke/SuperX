'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../extension/ui-i18n.js');
const core = require('../extension/feed-core.js');

const reasons = ['outputLimit','incomplete','connection','languageMismatch','rateLimit','access','server','unknown','timeout'];
test('API failure statuses explain recovery in every interface language without requiring raw provider prose',()=>{
  const keys=['apiKeyRejected','apiUsage','apiAccess','apiRequest','apiServer','apiConnection','apiTimeout','apiOutputLimit','apiIncomplete','apiFailed'];
  for(const language of ui.SUPPORTED_LANGUAGES)for(const suffix of keys){const key='error.'+suffix,value=ui.catalog[language][key];assert.ok(value?.trim(),`${language}: ${key}`);if(language!=='en')assert.notEqual(value,ui.catalog.en[key]);assert.ok(Array.from(value).length<180);assert.doesNotMatch(value,/\{(?:error|message|body)\}/);}
  assert.match(ui.t('error.apiUsage','en'),/budget or usage/);assert.match(ui.t('error.apiServer','zh-CN'),/xAI 服务/);
  for(const language of ui.SUPPORTED_LANGUAGES){assert.ok(ui.catalog[language]['note.accountLimit']?.trim());if(language!=='en')assert.notEqual(ui.t('note.accountLimit',language),ui.t('note.accountLimit','en'));}
  assert.match(ui.t('note.accountLimit','en'),/This request.*usage or budget limit/);assert.match(ui.t('note.accountLimit','zh-CN'),/这条请求.*用量或预算限制/);
});
test('local diagnostics controls are translated and explain bounded session-only retention',()=>{
  const keys=['diagnosticsTitle','diagnosticsHelp','diagnosticsRefresh','diagnosticsCopy','diagnosticsClear','diagnosticsEmpty','diagnosticsUnavailable','diagnosticsCopied'];
  for(const language of ui.SUPPORTED_LANGUAGES)for(const suffix of keys){const value=ui.catalog[language]['options.'+suffix];assert.ok(value?.trim(),`${language}: ${suffix}`);if(language!=='en')assert.notEqual(value,ui.catalog.en['options.'+suffix]);}
  const help=ui.t('options.diagnosticsHelp','en',{hours:24,maxEntries:30});assert.match(help,/30.*24.*session/);assert.doesNotMatch(help,/\{hours\}|\{maxEntries\}/);
  assert.doesNotMatch(ui.t('verification.unknown','en'),/service did not return/i);
});

test('model capacity errors describe the request without pausing other posts or giving account advice',()=>{
  for(const language of ui.SUPPORTED_LANGUAGES){
    const value=ui.catalog[language]['error.apiCapacity'];assert.ok(value?.trim(),language);
    if(language!=='en')assert.notEqual(value,ui.catalog.en['error.apiCapacity']);
    assert.ok(Array.from(value).length<180,language);assert.doesNotMatch(value,/API Key|quota|budget|balance|UNKNOWN|余额|额度|预算|密钥/i);
    assert.notEqual(value,ui.t('error.apiUsage',language));assert.notEqual(value,ui.t('error.apiKeyRejected',language));
  }
  assert.equal(ui.t('error.apiCapacity','en'),'The Grok model is temporarily busy.');
  assert.equal(ui.t('error.apiCapacity','zh-CN'),'Grok 模型暂时繁忙。');
});

test('automatic retry progress and exhaustion are localized with dynamic attempt and delay values',()=>{
  const placeholders={waiting:['attempt','max','seconds'],running:['attempt','max'],exhausted:['max']};
  for(const language of ui.SUPPORTED_LANGUAGES)for(const [suffix,expected] of Object.entries(placeholders)){
    const key='retry.'+suffix,value=ui.catalog[language][key];
    assert.ok(value?.trim(),`${language}: ${key}`);
    if(language!=='en')assert.notEqual(value,ui.catalog.en[key],`${language}: ${key}`);
    assert.deepEqual([...value.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort(),expected,`${language}: ${key} placeholders`);
    const rendered=ui.t(key,language,{seconds:7,attempt:1,max:2});
    assert.doesNotMatch(rendered,/\{\w+\}/,`${language}: ${key}`);
    assert.match(rendered,/2/,`${language}: ${key} uses supplied maximum`);
    if(suffix!=='exhausted')assert.match(rendered,/1\/2/,`${language}: ${key} shows current attempt`);
    if(suffix==='waiting')assert.match(rendered,/7/,`${language}: ${key} shows delay`);
    assert.ok(Array.from(value).length<180,`${language}: ${key}`);
  }
  assert.equal(ui.t('retry.waiting','en',{seconds:7,attempt:1,max:2}),'Retrying in 7s (1/2)');
  assert.equal(ui.t('retry.running','en',{attempt:1,max:2}),'Automatic retry 1/2');
  assert.match(ui.t('retry.exhausted','zh-CN',{max:2}),/自动重试 2 次.*手动重试/);
});

test('individual request errors do not claim to pause or resume the shared analysis queue',()=>{
  const keys=['error.apiCapacity','note.accountLimit','note.rateLimited','error.apiServer','error.apiConnection','error.apiTimeout','error.apiIncomplete','error.apiFailed','error.outputLanguageMismatch'];
  const globalPause=/\bpaused?\b|\bresume\b|暂停|暫停|停止しました|停止しています|일시 중지|pausad|suspendu|pausiert|إيقاف|أوقف|приостанов|रुके|रुका|रुकी/i;
  for(const language of ui.SUPPORTED_LANGUAGES)for(const key of keys){
    assert.doesNotMatch(ui.t(key,language),globalPause,`${language}: ${key}`);
  }
  assert.equal(ui.t('note.rateLimited','en'),"This request reached the provider's rate limit.");
  assert.match(ui.t('note.rateLimited','zh-CN'),/这条请求.*频率限制/);
  assert.equal(ui.t('common.paused','en'),'Automatic fact-checking paused');
  assert.equal(ui.t('status.disabled','en'),'Auto analysis paused');
});

test('language mismatch summaries leave retry policy to the separate progress message',()=>{
  for(const language of ui.SUPPORTED_LANGUAGES){
    const value=ui.t('error.outputLanguageMismatch',language);
    assert.ok(value?.trim(),language);
    if(language!=='en')assert.notEqual(value,ui.catalog.en['error.outputLanguageMismatch']);
    assert.ok(Array.from(value).length<90,language);
    assert.doesNotMatch(value,/retry|Reanalyze|重试|追加请求|再試行|追加リクエスト|재시도|reintentar|réessayer|Wiederholung|tentar|إضافي|повтор|दोबारा/i,language);
  }
  assert.equal(ui.t('error.outputLanguageMismatch','en'),'The answer did not follow the requested language.');
  assert.equal(ui.t('error.outputLanguageMismatch','zh-CN'),'回答未遵循要求的语言。');
});

test('English UI consistently names the feature fact check while internal localization keys stay compatible', () => {
  assert.equal(ui.t('common.verification','en'),'Fact check');
  assert.equal(ui.t('status.verifying','en'),'Fact-checking…');
  assert.equal(ui.t('status.verificationQueued','en'),'Fact check queued');
  assert.equal(ui.t('status.inline','en'),'Fact-checking…');
  assert.equal(ui.t('status.explaining','en'),'Fact-checking…');
  assert.equal(ui.t('status.unverified','en'),'Not fact-checked');
  assert.equal(ui.t('options.verification','en'),'Fact check');
  assert.equal(ui.t('options.verifyPrompt','en'),'Shared fact-check prompt');
  assert.equal(ui.t('options.explanationMode','en'),'Fact-check style');
  assert.match(ui.t('options.verificationHelp','en'),/Fact checks read the full linked post/);
  for (const key of ['options.background','options.inline','options.off','options.explainPrompt']) assert.equal(ui.catalog.en[key],undefined);
  for (const [key,value] of Object.entries(ui.catalog.en)) {
    assert.doesNotMatch(value,/\b(?:verify|verifies|verified|verifying|verification|unverified)\b/i,`${key}: English UI should use fact check`);
  }
  assert.equal(ui.t('status.verifying','zh-CN'),'正在求证…');
  assert.equal(ui.t('options.verifyPrompt','zh-CN'),'通用核查提示词');
});

test('incomplete verification describes the unfinished fact check without claiming an explanation was retained', () => {
  assert.equal(ui.t('status.incomplete','en'),'Fact check incomplete');
  assert.equal(ui.t('note.preserved','en'),'Partial result retained.');
  assert.equal(ui.t('status.incomplete','zh-CN'),'求证未完成');
  assert.equal(ui.t('note.preserved','zh-CN'),'已保留部分结果。');
  assert.equal(ui.t('verification.outputLimit','en'),'Response reached its output limit.');
  assert.equal(ui.t('verification.languageMismatch','en'),'Fact-check output did not match the requested language.');
  assert.equal(ui.t('verification.unknown','en'),'No specific failure category was identified. See the diagnostic details.');
  assert.equal(ui.t('verification.timeout','en'),'Fact-check request timed out.');
  assert.equal(ui.t('verification.timeout','zh-CN'),'求证请求超时。');
  assert.doesNotMatch(ui.t('status.incomplete','en'),/Partial answer/);
  assert.doesNotMatch(ui.t('note.preserved','en'),/previous/i);
});

test('all locales describe a single fact-check task and independent comment generation', () => {
  const keys=['options.providerAPI','options.verificationHelp','options.explanationMode','options.presetModeHelp','options.customModeHelp','popup.apiHint','comments.placeholder','comments.pending'];
  for(const language of ui.SUPPORTED_LANGUAGES) {
    for(const key of keys) {
      assert.ok(ui.catalog[language][key]?.trim(),`${language}: ${key}`);
      if(language!=='en')assert.notEqual(ui.catalog[language][key],ui.catalog.en[key],`${language}: ${key} should be localized`);
    }
    assert.equal(ui.t('status.explaining',language),ui.t('status.verifying',language));
    assert.equal(ui.t('status.inline',language),ui.t('status.verifying',language));
  }
  assert.doesNotMatch(keys.map(key=>ui.t(key,'en')).join(' '),/explain|second request|background fact-check/i);
  assert.doesNotMatch(keys.map(key=>ui.t(key,'zh-CN')).join(' '),/解释|第二次请求|后台求证/);
});

test('all supported X UI languages supply distinct, concise verification failure reasons', () => {
  assert.equal(ui.SUPPORTED_LANGUAGES.length,12);
  for (const language of ui.SUPPORTED_LANGUAGES) {
    const values = reasons.map(reason => {
      const key = `verification.${reason}`;
      const value = ui.catalog[language][key];
      assert.equal(typeof value,'string',`${language}: ${key}`);
      assert.ok(value.trim(),`${language}: ${key}`);
      assert.equal(ui.t(key,language),value,`${language}: ${key}`);
      assert.ok(Array.from(value).length<=140,`${language}: ${key} should fit a compact tooltip`);
      assert.doesNotMatch(value,/\{[A-Za-z][A-Za-z0-9_]*\}/,`${language}: ${key} requires no raw error text`);
      assert.doesNotMatch(value,/Grok can make mistakes|Reanalyze|retry|重试|重新分析|再試行|إعادة المحاولة|повторите|फिर कोशिश/i,`${language}: ${key} should only explain the reason`);
      if(language!=='en')assert.notEqual(value,ui.catalog.en[key],`${language}: ${key} should be localized`);
      return value;
    });
    assert.equal(new Set(values).size,reasons.length,`${language}: reasons must remain distinguishable`);
    for (const key of ['status.incomplete','note.preserved']) {
      assert.ok(ui.catalog[language][key].trim(),`${language}: ${key}`);
      if(language!=='en')assert.notEqual(ui.catalog[language][key],ui.catalog.en[key],`${language}: ${key} should be localized`);
    }
  }
});

test('answer and interface languages default to Auto and preserve independent manual choices', () => {
  assert.equal(core.DEFAULT_SETTINGS.language,'auto');
  assert.equal(core.DEFAULT_SETTINGS.interfaceLanguage,'auto');
  assert.equal(core.normalizeSettings({language:'ja'}).interfaceLanguage,'auto');
  assert.equal(core.normalizeSettings({interfaceLanguage:'zh-CN'}).language,'auto');
  assert.deepEqual(ui.INTERFACE_LANGUAGES.map(item=>item.value).sort(),['auto',...ui.SUPPORTED_LANGUAGES].sort());
  assert.deepEqual(ui.INTERFACE_LANGUAGES.map(item=>item.value),core.LANGUAGES.map(item=>item.value));
  for(const language of ui.SUPPORTED_LANGUAGES) {
    const settings=core.normalizeSettings({language:'pt-BR',interfaceLanguage:language});
    assert.equal(settings.language,'pt-BR');
    assert.equal(settings.interfaceLanguage,language);
    assert.equal(ui.resolveLanguage(settings.interfaceLanguage,'ja'),language);
  }
  assert.equal(core.normalizeSettings({interfaceLanguage:' ZH-cn '}).interfaceLanguage,'zh-CN');
  for(const invalid of ['it','en-US','<script>','zh Hant','ja\n<script>',true,{},null]) {
    assert.equal(core.normalizeSettings({interfaceLanguage:invalid}).interfaceLanguage,'auto');
    assert.equal(ui.resolveLanguage(invalid,'de-DE'),'de');
  }
});

test('Auto interface language follows observed X locale without changing the answer language', () => {
  for(const observed of ['zh-TW','zh_HK','ja-JP','de-DE','en-US']) {
    assert.equal(ui.resolveLanguage('auto',observed),ui.normalizeLanguage(observed));
    assert.equal(ui.resolveLanguage(undefined,observed),ui.normalizeLanguage(observed));
  }
  assert.equal(ui.resolveLanguage('zh-CN','ja-JP'),'zh-CN');
  assert.equal(ui.resolveLanguage('auto',undefined),'en');
  const post={id:'42',url:'https://x.com/person/status/42',language:'en',text:'This is an English post.'};
  const automatic=core.normalizeSettings({language:'auto',interfaceLanguage:'zh-CN'});
  assert.equal(core.resolvePostLanguage(automatic.language,post),'en');
  assert.equal(core.apiPostIdentity(post,automatic),core.apiPostIdentity(post,{...automatic,interfaceLanguage:'ja'}));
});

test('all UI locales describe separate language controls and saved versus session-only Key states', () => {
  const keys=['options.languageTitle','options.answerLanguage','options.interfaceLanguage','options.interfaceLanguageHelp','lang.interfaceAuto','options.uiHint','options.keyReadySaved','options.keyReady'];
  for(const language of ui.SUPPORTED_LANGUAGES) {
    for(const key of keys) {
      assert.equal(typeof ui.catalog[language][key],'string',`${language}: ${key}`);
      assert.ok(ui.catalog[language][key].trim(),`${language}: ${key}`);
      assert.equal(ui.t(key,language),ui.catalog[language][key]);
      if(language!=='en') assert.notEqual(ui.catalog[language][key],ui.catalog.en[key],`${language}: ${key} should be localized`);
    }
    assert.notEqual(ui.t('options.keyReadySaved',language),ui.t('options.keyReady',language));
    assert.notEqual(ui.t('options.answerLanguage',language),ui.t('options.interfaceLanguage',language));
  }
  assert.equal(ui.t('options.keyReadySaved','zh-CN'),'已保存在本机。');
  assert.equal(ui.t('options.keyReady','en'),'Available until the browser closes.');
  assert.equal(ui.t('options.keyReadySaved','en'),'Saved on this device.');
  assert.match(ui.t('options.rememberHelp','en'),/Encrypted locally.*restored after restart.*Uncheck.*only until the browser closes/);
});

test('analysis timing, shared concurrency and API access guidance are complete in all twelve languages',()=>{
  const keys=['options.dwell','options.dwellHelp','options.concurrencyHelp','options.apiAccess','options.apiSubscriptionTitle',
    'options.apiSubscriptionHelp','options.apiSubscriptionLink','options.apiMeteredTitle','options.apiMeteredHelp','options.apiMeteredLink',
    'options.apiPriorityHelp','options.apiPriorityLink'];
  const brandNames=new Set(['options.apiSubscriptionTitle','options.apiSubscriptionLink','options.apiMeteredLink']);
  for(const language of ui.SUPPORTED_LANGUAGES)for(const key of keys){
    const value=ui.catalog[language][key];assert.equal(typeof value,'string',`${language}: ${key}`);assert.ok(value.trim(),`${language}: ${key}`);
    assert.equal(ui.t(key,language),value);assert.doesNotMatch(value,/<\/?[A-Za-z][^>]*>|\{[A-Za-z][A-Za-z0-9_]*\}/,`${language}: ${key} is plain complete text`);
    if(language!=='en'&&!brandNames.has(key))assert.notEqual(value,ui.catalog.en[key],`${language}: ${key} is translated`);
  }
  assert.equal(ui.t('options.dwell','en'),'Analyze after (seconds)');assert.equal(ui.t('options.dwell','zh-CN'),'自动分析前停留（秒）');
  assert.match(ui.t('options.dwellHelp','en'),/stay visible.*Default: 1 second; 0 starts immediately.*Manual actions do not wait/);
  assert.match(ui.t('options.dwellHelp','zh-CN'),/持续可见.*默认 1 秒.*0.*手动操作无需等待/);
  assert.equal(ui.t('options.concurrencyHelp','en'),'Default: 3. All X tabs and comment requests share this limit.');
  assert.match(ui.t('options.concurrencyHelp','zh-CN'),/默认 3.*所有 X 标签页和评论请求共享/);
});

test('both providers require scrolling to stop and continuous visibility for the configured time',()=>{
  const configured={en:/configured/, 'zh-CN':/设置/, 'zh-TW':/設定/,ja:/設定した/,ko:/설정한/,es:/configurad/,fr:/configur/,de:/eingestellte/,pt:/configurad/,ar:/المحددة/,ru:/задан/,hi:/तय/};
  const stopped={en:/scrolling stops/, 'zh-CN':/停止滚动/, 'zh-TW':/停止捲動/,ja:/スクロール停止後/,ko:/스크롤이 멈춘 후/,es:/detener el desplazamiento/,fr:/arrêt du défilement/,de:/Scrollen endet/,pt:/parar a rolagem/,ar:/توقف التمرير/,ru:/остановки прокрутки/,hi:/स्क्रॉलिंग रुकने/};
  const visible={en:/remain visible/, 'zh-CN':/持续可见/, 'zh-TW':/持續可見/,ja:/表示され続ける/,ko:/계속 보이면/,es:/permanec/,fr:/rest/,de:/sichtbar bleiben/,pt:/continuam visíveis/,ar:/تبقى مرئية|بقائها مرئية/,ru:/остаются видимыми|непрерывной видимости/,hi:/लगातार दिखने/};
  for(const language of ui.SUPPORTED_LANGUAGES){
    for(const key of ['options.providerIntro','options.subtitle','popup.apiHint','popup.buildHint']){
      const value=ui.t(key,language);assert.match(value,configured[language],`${language}: ${key}`);
      assert.match(value,stopped[language],`${language}: ${key} waits for scrolling to stop`);
      assert.match(value,visible[language],`${language}: ${key} requires continuous visibility`);
    }
    assert.match(ui.t('options.presetReady',language),/1|واحدة/,`${language}: preset names the one-second delay`);
    assert.match(ui.t('options.presetReady',language),/3/,`${language}: preset names shared concurrency three`);
  }
  assert.doesNotMatch(['options.providerIntro','options.subtitle','popup.apiHint','popup.buildHint'].map(key=>ui.t(key,'en')).join(' '),/immediat|instantly|as soon as/i);
  assert.match(ui.t('popup.buildHint','en'),/one task at a time/);
  assert.match(ui.t('options.presetReady','en'),/1-second.*3 shared concurrent API requests.*Save/);
});

test('dwell help keeps the requested English card copy and localized timing guidance',()=>{
  for(const language of ui.SUPPORTED_LANGUAGES){
    const help=ui.t('options.dwellHelp',language);
    if(language!=='en')assert.match(help,/SuperX/,`${language}: help identifies sidebar scrolling separately`);
    assert.match(help,/0/,`${language}: zero remains available`);
    assert.doesNotMatch(help,/\b(?:100|200|250|300|500)\s*(?:ms|milliseconds)\b|quiet period/i);
  }
  assert.equal(ui.t('options.dwellHelp','en'),'After scrolling stops, posts must stay visible for this long before automatic analysis. Default: 1 second; 0 starts immediately. Manual actions do not wait.');
  assert.match(ui.t('options.dwellHelp','zh-CN'),/停止滚动信息流或页面后.*持续可见.*再次滚动会重新计时.*SuperX 右栏内部不会影响.*默认 1 秒.*0.*立即开始.*手动操作无需等待/);
});

test('API access copy separates subscription allowance, metered billing and optional paid priority without performance promises',()=>{
  assert.match(ui.t('options.apiSubscriptionHelp','en'),/eligible API allowance.*The X Subscription.*Grok Dashboard account.*availability and limits/);
  assert.match(ui.t('options.apiMeteredHelp','en'),/API credits.*Tokens and tools.*usage and billing in xAI Console/);
  assert.match(ui.t('options.apiPriorityHelp','en'),/standard API credits does not enable Priority Processing.*SuperX uses standard requests.*explicit opt-in at an extra cost.*may reduce peak-time latency.*does not guarantee availability/);
  assert.match(ui.t('options.apiPriorityHelp','zh-CN'),/标准 API credits 不会开启.*SuperX 使用标准请求.*明确选择并额外付费.*可能降低高峰期延迟.*不保证/);
  assert.doesNotMatch([ui.t('options.apiSubscriptionHelp','en'),ui.t('options.apiMeteredHelp','en')].join(' '),/faster|more stable|priority|unlimited|free/i);
  for(const language of ui.SUPPORTED_LANGUAGES){
    assert.match(ui.t('options.apiSubscriptionHelp',language),/Grok Dashboard/);assert.match(ui.t('options.apiMeteredHelp',language),/xAI Console/);
    assert.match(ui.t('options.apiPriorityHelp',language),/Priority/);assert.match(ui.t('options.apiPriorityHelp',language),/SuperX/);
  }
});

test('compact connection and Key guidance is translated without guessing account type or claiming authentication',()=>{
  const keys=['options.source','options.enable','options.apiKeyLabel','options.keyPlaceholder','options.apiKeyHint','options.apiAccess',
    'options.apiSubscriptionTitle','options.apiSubscriptionHelp','options.apiSubscriptionSetup','options.apiSubscriptionLink','options.dashboardUsage','options.recommended',
    'options.apiMeteredTitle','options.apiMeteredHelp','options.apiMeteredLink','options.apiAccountHelp','options.rememberHelp',
    'options.keyReadySaved','options.keyReady','options.keyMissing','options.keyMigration','options.modelHelp','options.reasoningHelp'];
  for(const language of ui.SUPPORTED_LANGUAGES){
    for(const key of keys){
      const value=ui.catalog[language][key];assert.equal(typeof value,'string',`${language}: ${key}`);assert.ok(value.trim(),`${language}: ${key}`);
      assert.equal(ui.t(key,language),value);assert.doesNotMatch(value,/<\/?[A-Za-z][^>]*>|\{[A-Za-z][A-Za-z0-9_]*\}/,`${language}: ${key}`);
      if(language!=='en'&&!['options.apiKeyLabel','options.apiSubscriptionTitle'].includes(key))assert.notEqual(value,ui.catalog.en[key],`${language}: ${key} is translated`);
    }
    assert.match(ui.t('options.enable',language),/SuperX/);
    assert.equal(ui.t('options.apiKeyLabel',language),'Grok API Key');
    assert.equal(ui.t('options.apiSubscriptionTitle',language),'grok.com · The X Subscription');
    assert.match(ui.t('options.apiKeyHint',language),/grok\.com/);assert.match(ui.t('options.apiKeyHint',language),/xAI Console/);
    assert.match(ui.t('options.apiSubscriptionSetup',language),/Grok Inference/);assert.match(ui.t('options.apiSubscriptionSetup',language),/Cursor/);assert.match(ui.t('options.apiSubscriptionSetup',language),/Chat/);
    assert.match(ui.t('options.modelHelp',language),/grok-4\.3/);assert.doesNotMatch(ui.t('options.modelHelp',language),/grok-4\.[567]/);
    assert.doesNotMatch(ui.t('options.reasoningHelp',language),/Fast|Priority/);
    for(const key of ['options.keyReadySaved','options.keyReady','options.keyMissing','options.keyMigration']){
      assert.ok(Array.from(ui.t(key,language)).length<95,`${language}: ${key} stays concise`);
      assert.doesNotMatch(ui.t(key,language),/authenticat|validat|verif|account confirmed|认证成功|验证成功|帳戶驗證/i);
    }
  }
  assert.equal(ui.t('options.source','en'),'Connection');assert.equal(ui.t('options.source','zh-CN'),'连接');
  assert.equal(ui.t('options.enable','en'),'Enable SuperX');assert.equal(ui.t('options.enable','zh-CN'),'启用 SuperX');
  assert.equal(ui.t('options.keyPlaceholder','en'),'Paste your Grok API Key');
  assert.equal(ui.t('options.apiKeyHint','en'),'Grok API Keys from grok.com and xAI Console both work here.');
  assert.equal(ui.t('options.apiAccess','en'),'Get a Grok API Key or check usage');
  assert.equal(ui.t('options.apiSubscriptionTitle','en'),'grok.com · The X Subscription');
  assert.equal(ui.t('options.apiSubscriptionLink','en'),'Create Grok API Key');assert.equal(ui.t('options.dashboardUsage','en'),'View Usage');
  assert.equal(ui.t('options.apiMeteredTitle','en'),'xAI Console · Pay as you go');assert.equal(ui.t('options.apiMeteredLink','en'),'Keys & billing');
  assert.equal(ui.t('options.apiAccountHelp','en'),'Check usage and charges at the site where you created your Key.');
  assert.equal(ui.t('options.keyMissing','en'),'Paste a Grok API Key above and save settings.');
  assert.equal(ui.t('options.keyMigration','en'),'Paste your Grok API Key again and save settings.');
});

test('Key entry points and actionable errors consistently say Grok API Key in every language',()=>{
  const keys=['options.providerKey','options.apiKeyLabel','options.keyPlaceholder','options.apiKeyHint','options.apiAccess','options.apiSubscriptionLink',
    'options.apiSetup','options.keyMissing','options.keyMigration','options.keyRequired','status.needsKey','status.needsKeyAction',
    'common.enterKey','note.settingsRequired','popup.addKey','error.apiKeyRejected','errors.keyInvalid','errors.keyStorage'];
  const bareLabels=new Set(['options.providerKey','options.apiKeyLabel']);
  for(const language of ui.SUPPORTED_LANGUAGES){
    for(const key of keys){
      const value=ui.catalog[language][key];assert.ok(value?.trim(),`${language}: ${key}`);assert.match(value,/Grok API Key/,`${language}: ${key}`);
      assert.doesNotMatch(value,/(?<!Grok )API Key\b|Grok (?:Api|api)|Grok API key|Grok Grok|xAI Grok API/,`${language}: ${key}`);
      if(language!=='en'&&!bareLabels.has(key))assert.notEqual(value,ui.catalog.en[key],`${language}: ${key} preserves localization`);
    }
    for(const key of bareLabels)assert.equal(ui.t(key,language),'Grok API Key');
    const hint=ui.t('options.apiKeyHint',language);assert.match(hint,/grok\.com/);assert.match(hint,/xAI Console/);
    const settings='SETTINGS_TARGET',action=ui.t('status.needsKeyAction',language,{settings});
    assert.match(action,/Grok API Key/);assert.match(action,/SETTINGS_TARGET/);assert.doesNotMatch(action,/\{settings\}/);
    assert.notEqual(ui.t('options.keyReadySaved',language),ui.t('options.keyMissing',language));
  }
  assert.equal(ui.t('status.needsKey','en'),'Set a Grok API Key in Settings');
  assert.equal(ui.t('popup.addKey','en'),'Add Grok API Key');
});

test('Build model help explains independent settings and connection-time choices without changing defaults',()=>{
  const independent={en:/independently of API mode/, 'zh-CN':/与 API 模式独立保存/, 'zh-TW':/與 API 模式獨立儲存/,ja:/API モードとは別に保存/,ko:/API 모드와 별도로 저장/,es:/por separado del modo API/,fr:/séparément du mode API/,de:/unabhängig vom API-Modus gespeichert/,pt:/separadamente do modo API/,ar:/بشكل مستقل عن وضع API/,ru:/отдельно от режима API/,hi:/API मोड से अलग सहेजी/};
  for(const language of ui.SUPPORTED_LANGUAGES){
    const value=ui.catalog[language]['options.buildModelHelp'];assert.ok(value?.trim(),language);assert.match(value,independent[language],language);
    if(language!=='en')assert.notEqual(value,ui.catalog.en['options.buildModelHelp']);
    assert.doesNotMatch(value,/grok-4\.[34567]|Priority|Fast/);
  }
  assert.match(ui.t('options.buildModelHelp','en'),/After connecting, confirm the available models and reasoning levels/);
  assert.equal(ui.t('options.buildModelHelp','zh-CN'),'此模式的模型设置与 API 模式独立保存；连接后确认可用模型和推理档位。');
  assert.equal(core.DEFAULT_SETTINGS.apiModel,'grok-4.3');assert.equal(core.DEFAULT_SETTINGS.apiReasoningEffort,'none');
  assert.equal(core.DEFAULT_SETTINGS.buildModel,'grok-4.3');assert.equal(core.DEFAULT_SETTINGS.buildReasoningEffort,'none');
});

test('draft search tooltip describes call records without claiming retrieval success in every language',()=>{
  const states=['draft.searchRecorded','draft.searchUnconfirmed','draft.searchPending'];
  for(const language of ui.SUPPORTED_LANGUAGES){
    assert.equal(new Set(states.map(key=>ui.t(key,language))).size,3,`${language}: distinct search states`);
    for(const key of [...states,'draft.searchEvidenceNote']){
      const value=ui.catalog[language][key];assert.ok(value?.trim(),`${language}: ${key}`);
      if(language!=='en')assert.notEqual(value,ui.catalog.en[key],`${language}: ${key}`);
      assert.ok(Array.from(value).length<120,`${language}: concise tooltip`);
      assert.doesNotMatch(value,/\{\w+\}/,`${language}: no inferred count`);
    }
  }
  assert.equal(ui.t('draft.searchRecorded','en'),'Search calls: recorded');
  assert.equal(ui.t('draft.searchUnconfirmed','en'),'Search calls: not confirmed');
  assert.equal(ui.t('draft.searchPending','en'),'Search calls: awaiting report');
  assert.equal(ui.t('draft.searchUnconfirmed','zh-CN'),'检索调用：未确认');
  assert.equal(ui.t('draft.searchPending','zh-CN'),'检索调用：等待报告');
  assert.equal(ui.t('draft.searchEvidenceNote','zh-CN'),'有调用记录不代表已取得有效证据或结论一定正确。');
  for(const retired of ['draft.searchConfirmed','draft.searchNotObserved','draft.searchUnknown'])assert.equal(Object.hasOwn(ui.catalog.en,retired),false);
});
