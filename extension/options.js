"use strict";

(() => {
  const core = globalThis.XGrokCore;
  const ui = globalThis.GrokFirstUI;
  const $ = id => document.getElementById(id);
  const promptFields = [
    {name:"verify",setting:"verifyPrompt",id:"verify-prompt"},
    {name:"postDraft",setting:"postDraftPrompt",id:"post-draft-prompt"},
    {name:"replyDraft",setting:"replyDraftPrompt",id:"reply-draft-prompt"},
    {name:"comments",setting:"commentsPrompt",id:"comments-prompt"},
  ];
  const promptLimit = core.MAX_PROMPT_LENGTH || 12000;
  let currentSettings = core.normalizeSettings(core.DEFAULT_SETTINGS);
  let observedUILanguage = ui.browserLanguage(globalThis);
  let uiLanguage = observedUILanguage;
  let localeRevision = 0;
  let statusMessage = null;
  const fieldErrors=new Map();
  let displayedExplanationMode;
  let keyChanged = false;
  let rememberChanged = false;
  let originalKey = "";
  let security = {keyState:"missing",remember:true,hasSavedKey:false};
  let securityLoaded = false;
  let busy = false;
  let optionsFocusPending = false;
  let lastOptionsFocusNonce;
  let diagnosticsBusy=false,diagnosticsStatusKey=null,diagnosticsText="",diagnosticsRetentionHours=24,diagnosticsMaxEntries=30;
  let buildStatus = null, buildChecking = false, buildCheckRevision = 0;
  let buildConnection={configured:false,port:2419},buildSecretChanged=false,buildGenerating=false;
  let oauthStatus={state:"idle",connected:false,remember:true,catalogModels:null},oauthActionBusy=false,oauthLoginPending=false,oauthActionRevision=0,oauthLoaded=false,oauthPollTimer,oauthReadRevision=0,oauthActionError=null;
  const apiControlIds = ["api-key","remember-key","api-model","api-reasoning-effort","fast-preset","clear-key"];
  const buildControlIds = ["build-platform","build-port","build-secret","generate-build-command","copy-build-command","clear-build-connection","build-model","build-reasoning-effort","check-build","build-guide"];
  const oauthControlIds=["oauth-login","oauth-cancel","oauth-logout","oauth-remember","oauth-copy-code","oauth-model","oauth-reasoning-effort","oauth-refresh-models"];
  const isBuild = () => $("provider").value === "build";
  const isOAuth = () => $("provider").value === "oauth";
  const isAPI = () => $("provider").value === "api";
  function oauthErrorKey(code){return ({OAUTH_ACCESS_DENIED:"oauth.denied",OAUTH_AUTHORIZATION_DENIED:"oauth.denied",OAUTH_AUTHORIZATION_EXPIRED:"oauth.expired",OAUTH_DEVICE_EXPIRED:"oauth.expired",OAUTH_EXPIRED_TOKEN:"oauth.expired",OAUTH_NETWORK_ERROR:"oauth.networkError",OAUTH_AUTH_UNAVAILABLE:"oauth.networkError",OAUTH_NETWORK:"oauth.networkError",OAUTH_STORAGE_ERROR:"oauth.storageError",OAUTH_REAUTH_REQUIRED:"oauth.reauthRequired",OAUTH_REFRESH_UNCERTAIN:"oauth.reauthRequired",OAUTH_ACCOUNT_CHANGED:"oauth.reauthRequired",OAUTH_NOT_CONNECTED:"oauth.needsLogin",OAUTH_LOGIN_REQUIRED:"oauth.needsLogin",OAUTH_CANCELLED:"oauth.canceled",OAUTH_CATALOG_ERROR:"oauth.catalogUnavailable",OAUTH_CATALOG_FAILED:"oauth.catalogUnavailable",OAUTH_CATALOG_UNAVAILABLE:"oauth.catalogUnavailable"})[code]||"oauth.unavailable";}
  function officialOAuthURL(value){
    if(typeof value!=="string"||value.length>2048)return "";
    try{const url=new URL(value);if(!["https://accounts.x.ai","https://auth.x.ai"].includes(url.origin)||url.username||url.password||url.hash||!/^\/oauth2\/device(?:\/|$)/.test(url.pathname))return "";for(const key of url.searchParams.keys())if(!["user_code","client_id"].includes(key))return "";return url.href;}catch{return "";}
  }
  function safeOAuthStatus(raw){
    const states={disconnected:"idle",starting:"authorizing",awaiting_authorization:"authorizing",idle:"idle",authorizing:"authorizing",connected:"connected",refreshing:"refreshing",restoring:"restoring",reauth_required:"reauth_required",error:"error",logging_out:"logging_out"};
    const result={state:states[raw?.state]||"idle",connected:raw?.connected===true,remember:typeof raw?.remember==="boolean"?raw.remember:currentSettings.oauthRemember!==false,catalogModels:null};
    if(typeof raw?.errorCode==="string")result.errorKey=oauthErrorKey(raw.errorCode);
    if(raw?.catalogErrorCode)result.catalogError=true;
    if(result.connected&&Array.isArray(raw?.catalogModels))result.catalogModels=raw.catalogModels.slice(0,100).flatMap(entry=>{const id=typeof entry==="string"?entry:entry?.id;if(typeof id!=="string"||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(id))return [];return [{id,available:entry?.available!==false,...(Array.isArray(entry?.efforts)?{efforts:entry.efforts.filter(value=>["none","minimal","low","medium","high","xhigh","auto"].includes(value))}:{})}];});
    const code=raw?.device?.userCode,url=officialOAuthURL(raw?.device?.verificationUriComplete);
    if(result.state==="authorizing"&&typeof code==="string"&&/^[A-Za-z0-9-]{3,32}$/.test(code)&&url)result.device={userCode:code,url};
    return result;
  }
  function oauthEfforts(model){const entry=oauthStatus.catalogModels?.find(item=>item.id===model),profile=core.modelProfile(model);return entry?.efforts||profile?.efforts||["auto"];}
  function modelChoices(savedModel) {
    const choices=[...core.API_MODELS];
    // Preserve a previous configuration without advertising the provider's
    // complete catalog, which also includes image and video generators.
    if(!choices.some(item=>item.value===savedModel))choices.push({value:savedModel,label:ui.t(core.isNonTextGenerationModel(savedModel)?"options.unsupportedModel":"options.savedModel",uiLanguage,{model:savedModel})});
    return choices;
  }
  function modelChoiceLabel(item) {
    return item.value === "grok-4.3" ? ui.t("options.recommendedChoice",uiLanguage,{label:item.label}) : item.label;
  }
  function reasoningChoiceLabel(value) {
    const label=ui.t("options.reasoning."+value,uiLanguage);
    return value === "none" ? ui.t("options.recommendedChoice",uiLanguage,{label}) : label;
  }
  function populateOAuthModels(model=currentSettings.oauthModel||"grok-4.3",effort=$("oauth-reasoning-effort").value||currentSettings.oauthReasoningEffort||"none",modelChanged=false){
    const select=$("oauth-model");select.replaceChildren();
    for(const item of modelChoices(currentSettings.oauthModel)){const {value}=item,option=document.createElement("option");option.value=value;option.textContent=modelChoiceLabel(item);option.disabled=core.isNonTextGenerationModel(value)||Array.isArray(oauthStatus.catalogModels)&&!oauthStatus.catalogModels.some(entry=>entry.id===value&&entry.available!==false);select.append(option);}select.value=model;
    const reasoning=$("oauth-reasoning-effort"),efforts=oauthEfforts(model),preferred=core.reasoningEffort(model),selected=efforts.includes(effort)?effort:!modelChanged&&["none","minimal","low","medium","high","xhigh","auto"].includes(effort)?effort:efforts.includes(preferred)?preferred:efforts[0]||"";reasoning.replaceChildren();
    for(const value of [...efforts,...(selected&&!efforts.includes(selected)?[selected]:[])]){const option=document.createElement("option");option.value=value;option.textContent=reasoningChoiceLabel(value);option.disabled=!efforts.includes(value);reasoning.append(option);}reasoning.value=selected;
  }
  function renderOAuth(){
    const selected=isOAuth(),pending=["authorizing","restoring","refreshing","logging_out"].includes(oauthStatus.state),authorizing=oauthStatus.state==="authorizing",connected=oauthStatus.connected;
    $("oauth-intro").hidden=connected||oauthStatus.state==="refreshing";
    for(const id of oauthControlIds)$(id).disabled=busy||oauthActionBusy||!selected;
    $("oauth-login").hidden=authorizing||connected||["restoring","logging_out"].includes(oauthStatus.state);$("oauth-cancel").hidden=!authorizing;$("oauth-logout").hidden=!connected&&oauthStatus.state!=="reauth_required";$("oauth-remember").disabled=busy||oauthActionBusy||!selected||["restoring","logging_out"].includes(oauthStatus.state);
    $("oauth-refresh-models").disabled=busy||oauthActionBusy||!selected||!connected||pending;
    const statusKey=oauthActionError||(oauthStatus.state==="error"?oauthStatus.errorKey||"oauth.unavailable":({idle:"oauth.idle",authorizing:"oauth.authorizing",connected:"oauth.connected",refreshing:"oauth.refreshing",restoring:"oauth.restoring",reauth_required:"oauth.reauthRequired",logging_out:"oauth.loggingOut"})[oauthStatus.state]||"oauth.unavailable");
    $("oauth-status").textContent=ui.t(statusKey,uiLanguage);$("oauth-status").dataset.state=oauthActionError?"error":oauthStatus.state;$("oauth-status").hidden=oauthStatus.state==="idle"&&!oauthActionError;
    const device=oauthStatus.device;$("oauth-device").hidden=!device;$("oauth-user-code").textContent=device?.userCode||"";if(device)$("oauth-official-link").setAttribute("href",device.url);else $("oauth-official-link").removeAttribute("href");
    const model=$("oauth-model").value,available=!Array.isArray(oauthStatus.catalogModels)||oauthStatus.catalogModels.some(entry=>entry.id===model&&entry.available!==false),effort=oauthEfforts(model).includes($("oauth-reasoning-effort").value);
    clearResolvedError("oauth-model",connected,["oauth.needsLogin","oauth.unavailable","oauth.denied","oauth.expired","oauth.storageError","oauth.networkError","oauth.reauthRequired","oauth.canceled"]);
    clearResolvedError("oauth-model",connected&&!oauthStatus.catalogError&&available,["oauth.catalogUnavailable","oauth.modelUnavailable"]);
    clearResolvedError("oauth-model",!core.isNonTextGenerationModel(model),["error.modelUnsupported"]);
    clearResolvedError("oauth-reasoning-effort",effort,["options.reasoningInvalid"]);
    $("oauth-model-status").textContent=core.isNonTextGenerationModel(model)?ui.t("error.modelUnsupported",uiLanguage):oauthStatus.catalogError?ui.t("oauth.catalogUnavailable",uiLanguage):!available?ui.t("oauth.modelUnavailable",uiLanguage,{model}):!effort?ui.t("options.reasoningInvalid",uiLanguage):"";
  }
  function scheduleOAuthPoll(){
    if(oauthPollTimer!==undefined)globalThis.clearTimeout?.(oauthPollTimer);oauthPollTimer=undefined;
    if(isOAuth()&&["authorizing","restoring","refreshing","logging_out"].includes(oauthStatus.state)&&globalThis.setTimeout)oauthPollTimer=setTimeout(()=>{oauthPollTimer=undefined;void refreshOAuthStatus();},1500);
  }
  function applyOAuthStatus(raw){oauthStatus=safeOAuthStatus(raw);oauthLoaded=true;$("oauth-remember").checked=oauthStatus.remember;currentSettings={...currentSettings,oauthRemember:oauthStatus.remember};populateOAuthModels($("oauth-model").value||currentSettings.oauthModel,$("oauth-reasoning-effort").value||currentSettings.oauthReasoningEffort);renderOAuth();scheduleOAuthPoll();}
  async function refreshOAuthStatus(){const revision=++oauthReadRevision;try{const result=await send({type:"GET_OAUTH_STATUS"});if(revision===oauthReadRevision&&result.oauthStatus){oauthActionError=null;applyOAuthStatus(result.oauthStatus);}}catch{if(revision===oauthReadRevision){oauthActionError="oauth.unavailable";renderOAuth();}}}
  async function oauthAction(type,values={}){
    if(busy||oauthActionBusy||!isOAuth())return;const revision=++oauthActionRevision;oauthActionBusy=true;oauthLoginPending=type==="OAUTH_LOGIN";oauthActionError=null;oauthReadRevision++;renderOAuth();
    try{const result=await chrome.runtime.sendMessage({type,...values});if(revision!==oauthActionRevision)return;if(result?.oauthStatus)applyOAuthStatus(result.oauthStatus);if(!result?.ok){oauthActionError=oauthErrorKey(result?.errorCode||result?.oauthStatus?.errorCode);renderOAuth();}else if(!result.oauthStatus)throw new Error("Missing OAuth status");}
    catch{if(revision===oauthActionRevision){oauthActionError="oauth.unavailable";$("oauth-remember").checked=oauthStatus.remember;renderOAuth();}}
    finally{if(revision===oauthActionRevision){oauthActionBusy=false;oauthLoginPending=false;renderOAuth();scheduleOAuthPoll();}}
  }
  async function cancelOAuthLoginOnProviderChange(){
    if(isOAuth()||!oauthLoginPending&&oauthStatus.state!=="authorizing")return;
    const revision=++oauthActionRevision;oauthReadRevision++;oauthActionBusy=false;oauthLoginPending=false;oauthActionError=null;oauthStatus={...oauthStatus,state:"idle",connected:false,device:undefined};renderOAuth();scheduleOAuthPoll();
    try{const result=await send({type:"OAUTH_CANCEL_LOGIN"});if(revision===oauthActionRevision&&result.oauthStatus)applyOAuthStatus(result.oauthStatus);}
    catch{if(revision===oauthActionRevision&&isOAuth()){oauthActionError="oauth.unavailable";renderOAuth();}}
  }
  function buildStateKey() {
    if (buildChecking) return "build.checking";
    if (!buildStatus) return "build.unknown";
    if (buildStatus.errorCode === "BUILD_PERMISSION_REQUIRED") return "build.permission";
    if (buildStatus.ready === true) return "build.ready";
    if (buildStatus.errorCode === "BUILD_CANCEL_UNCONFIRMED") return "build.cancelUnconfirmed";
    if (["BUILD_CONNECTION_REQUIRED","BUILD_NOT_CONFIGURED","BUILD_SECRET_REQUIRED"].includes(buildStatus.errorCode)) return "build.codeRequired";
    if (["BUILD_AUTH_FAILED","BUILD_INVALID_SECRET"].includes(buildStatus.errorCode)) return "build.codeInvalid";
    if (["BUILD_NOT_CONNECTED","BUILD_CONNECTION_FAILED","BUILD_UNAVAILABLE","BUILD_DISCONNECTED"].includes(buildStatus.errorCode)) return "build.missing";
    if (buildStatus.authenticated === false || ["BUILD_AUTH_REQUIRED","BUILD_LOGIN_REQUIRED"].includes(buildStatus.errorCode)) return "build.login";
    if (["BUILD_VERSION_UNSUPPORTED","BUILD_UNSUPPORTED_VERSION","BUILD_PROTOCOL_UNSUPPORTED","BUILD_TOOL_POLICY","BUILD_CONFIG_UNSUPPORTED"].includes(buildStatus.errorCode)) return "build.unsupported";
    return "build.unavailable";
  }
  function renderBuildStatus() {
    $("build-status").textContent = ui.t(buildStateKey(),uiLanguage);
    $("build-status").dataset.state = buildStatus?.ready === true ? "ready" : "unknown";
    $("check-build").disabled = busy || buildChecking || buildGenerating || !isBuild();
    $("generate-build-command").disabled=busy||buildGenerating||buildChecking||!isBuild();
    if(isBuild())$("save").disabled=busy||buildChecking||buildGenerating;
    $("clear-build-connection").hidden=!buildConnection.configured;
    $("build-secret").placeholder=ui.t(buildConnection.configured ? "build.savedCode" : "build.codePlaceholder",uiLanguage);
    $("build-address").textContent=`ws://127.0.0.1:${$("build-port").value || 2419}`;
    const catalog = buildStatus?.modelCatalog;
    const selected = $("build-model").value;
    const unavailable = Array.isArray(catalog) && !catalog.some(item => (typeof item === "string" ? item : item.id) === selected && item.available !== false);
    const efforts=catalog?.find(item=>item&&typeof item==='object'&&item.id===selected)?.efforts;
    const effortUnavailable=Array.isArray(efforts)&&!efforts.includes($("build-reasoning-effort").value);
    if(buildStatus?.ready===true&&fieldErrors.get("build-secret")?.key.startsWith("build."))clearFieldError("build-secret");
    clearResolvedError("build-model",!unavailable,["options.buildModelUnavailable"]);
    clearResolvedError("build-model",!core.isNonTextGenerationModel(selected),["error.modelUnsupported"]);
    clearResolvedError("build-reasoning-effort",Boolean($("build-reasoning-effort").value)&&!effortUnavailable,["options.reasoningInvalid"]);
    $("build-model-status").textContent = core.isNonTextGenerationModel(selected) ? ui.t("error.modelUnsupported",uiLanguage) : unavailable ? ui.t("options.buildModelUnavailable",uiLanguage,{model:selected}) : effortUnavailable ? ui.t("options.reasoningInvalid",uiLanguage) : "";
    $("build-fast-help").textContent = ui.t("options.buildFastHelp",uiLanguage);
    $("build-fast-help").hidden = !/fast/i.test(selected);
  }
  function renderProvider() {
    const build = isBuild(),oauth=isOAuth();
    $("api-fields").hidden = !isAPI();$("build-fields").hidden = !build;$("oauth-fields").hidden=!oauth;
    for (const id of apiControlIds) $(id).disabled = busy || !isAPI();
    for (const id of buildControlIds) $(id).disabled = busy || !build;
    $("api-concurrency-field").hidden=build;$("api-concurrency").disabled=busy||build;
    $("source-description").textContent = build ? ui.t("options.buildDescription",uiLanguage) : "";
    $("source-description").hidden = !build;
    $("save").disabled = busy;
    $("verification-help").textContent=ui.t(oauth?"oauth.verificationHelp":"options.verificationHelp",uiLanguage);
    renderBuildStatus();renderOAuth();
  }
  function requestLocalAccess(){try{return chrome.permissions?.request({origins:["http://127.0.0.1/*"]}) || Promise.resolve(false);}catch{return Promise.resolve(false);}}

  function renderDiagnostics(){
    $("diagnostics-help").textContent=ui.t("options.diagnosticsHelp",uiLanguage,{hours:diagnosticsRetentionHours,maxEntries:diagnosticsMaxEntries});
    $("diagnostics-status").textContent=diagnosticsStatusKey?ui.t(diagnosticsStatusKey,uiLanguage):"";
    $("diagnostics-output").textContent=diagnosticsText;$("diagnostics-output").hidden=!diagnosticsText;
    for(const id of ["diagnostics-refresh","diagnostics-clear"])$(id).disabled=busy||diagnosticsBusy;
    $("diagnostics-copy").disabled=busy||diagnosticsBusy||!diagnosticsText;
  }
  function diagnosticEntries(value){
    if(!Array.isArray(value)||typeof core.sanitizedRequestDiagnostics!=="function")throw new Error("Invalid diagnostics response");
    const errorCodes=new Set(["API_INCOMPLETE","API_STREAM_INTERRUPTED","API_STREAM_ERROR","API_LANGUAGE_MISMATCH","API_CAPACITY","RATE_LIMIT","API_ERROR","CANCELED","TIMEOUT","COMMENTS_INVALID_RESPONSE"]);
    const failureCodes=new Set(["OUTPUT_LIMIT","INCOMPLETE","CONNECTION","TIMEOUT","LANGUAGE_MISMATCH","RATE_LIMIT","ACCESS","SERVER","UNKNOWN"]);
    return value.slice(0,30).flatMap(entry=>{
      if(!entry||!Number.isSafeInteger(entry.recordedAt)||entry.recordedAt<0)return [];
      const requestDiagnostics=core.sanitizedRequestDiagnostics(entry.requestDiagnostics);
      if(!requestDiagnostics||!Object.keys(requestDiagnostics).length)return [];
      const code=errorCodes.has(entry.code)?entry.code:"API_ERROR",failure=entry.verificationFailure;
      let verificationFailure;
      if(failure?.stage==="verify"&&failureCodes.has(failure.code)){
        verificationFailure={stage:"verify",code:failure.code};
        if(errorCodes.has(failure.errorCode))verificationFailure.errorCode=failure.errorCode;
        if(Number.isInteger(failure.httpStatus)&&failure.httpStatus>=100&&failure.httpStatus<=599)verificationFailure.httpStatus=failure.httpStatus;
        const providerCode=core.apiFailureProviderCode(failure.providerCode);if(providerCode)verificationFailure.providerCode=providerCode;
        if(["max_output_tokens","content_filter"].includes(failure.reason))verificationFailure.reason=failure.reason;
      }
      return [{recordedAt:entry.recordedAt,code,requestDiagnostics,...(verificationFailure?{verificationFailure}:{})}];
    });
  }
  async function refreshDiagnostics(){
    if(busy||diagnosticsBusy)return;diagnosticsBusy=true;diagnosticsStatusKey="common.loading";renderDiagnostics();
    try{
      const result=await send({type:"GET_API_DIAGNOSTICS"}),entries=diagnosticEntries(result.entries);
      diagnosticsText=entries.length?JSON.stringify(entries,null,2):"";
      diagnosticsRetentionHours=Number.isInteger(result.retentionHours)&&result.retentionHours>0&&result.retentionHours<=168?result.retentionHours:24;
      diagnosticsMaxEntries=Number.isInteger(result.maxEntries)&&result.maxEntries>0&&result.maxEntries<=30?result.maxEntries:30;
      diagnosticsStatusKey=entries.length?null:"options.diagnosticsEmpty";
    }catch{diagnosticsStatusKey="options.diagnosticsUnavailable";}
    finally{diagnosticsBusy=false;renderDiagnostics();}
  }

  function setStatus(key, state = "success", vars = {}) {
    statusMessage = {key,state,vars};
    $("status").textContent = ui.t(key,uiLanguage,vars);
    $("status").dataset.state = state;
  }
  function fieldError(id,key,vars={}) {
    const errorId=id==="api-key"?"key-security-state":id.startsWith("api-")?"api-model-status":id.startsWith("oauth-")?"oauth-model-status":id.startsWith("build-model")||id==="build-reasoning-effort"?"build-model-status":id.startsWith("build-")?"build-status":id==="x-search"||id==="web-search"?"search-status":null;
    fieldErrors.set(id,{key,vars,errorId});setStatus("options.checkFields","error");
    const input=$(id),output=errorId&&$(errorId);input.setAttribute("aria-invalid","true");
    if(output){output.textContent=ui.t(key,uiLanguage,vars);output.hidden=false;input.setAttribute("aria-errormessage",errorId);const described=(input.getAttribute("aria-describedby")||"").split(/\s+/).filter(Boolean);if(!described.includes(errorId))input.setAttribute("aria-describedby",[...described,errorId].join(" "));}
    for(let detail=input.closest?.("details");detail;detail=detail.parentElement?.closest?.("details"))detail.open=true;
    input.focus();input.scrollIntoView?.({block:"nearest"});
  }
  function clearFieldError(id){const previous=fieldErrors.get(id);fieldErrors.delete(id);$(id).removeAttribute("aria-invalid");$(id).removeAttribute("aria-errormessage");const output=previous?.errorId&&$(previous.errorId);if(output&&previous.errorId.endsWith("-model-status")&&output.textContent===ui.t(previous.key,uiLanguage,previous.vars))output.textContent="";}
  function clearResolvedError(id,resolved,keys){if(resolved&&keys.includes(fieldErrors.get(id)?.key))clearFieldError(id);}
  function renderSearchFeedback(){
    const missing=!$("web-search").checked&&!$("x-search").checked,output=$("search-status");
    if(output){output.hidden=!missing;output.textContent=missing?ui.t("options.urlSearchRequired",uiLanguage):"";}
    for(const id of ["web-search","x-search"]){if(missing)$(id).setAttribute("aria-invalid","true");else clearFieldError(id);}
  }
  function setBusy(value) {
    busy = value;
    for (const control of $("settings-form").elements) control.disabled = value;
    renderSecurity();
    renderProvider();
    renderDiagnostics();
    renderAnalysisMode();
    if (!value && optionsFocusPending) void consumeOptionsFocus();
  }
  function keyInputClear() {
    $("api-key").value = "";originalKey = "";keyChanged = false;
  }
  function keyNeedsSave() { return keyChanged || rememberChanged; }
  function renderSecurity() {
    clearResolvedError("api-key",securityLoaded&&security.keyState==="ready",["options.keyRequired","errors.noResponse"]);
    const stateKeys = {ready:security.hasSavedKey ? "options.keyReadySaved" : "options.keyReady",migration:"options.keyMigration",missing:"options.keyMissing"};
    $("key-security-state").textContent = ui.t(stateKeys[security.keyState] || stateKeys.missing,uiLanguage);
    $("key-security-state").dataset.state = security.keyState;
    $("clear-key").hidden = !securityLoaded || security.keyState !== "ready" && !security.hasSavedKey;
    $("save").disabled = busy;
  }
  async function refreshSecurity(fillKey = false, preserveDraft = false) {
    const result = await send({type:"GET_SECURITY_STATUS"});
    if (!["ready","missing","migration"].includes(result.keyState)
      || typeof result.remember !== "boolean" || typeof result.hasSavedKey !== "boolean") {
      throw new Error(ui.t("errors.noResponse",uiLanguage));
    }
    security = result;securityLoaded = true;
    if (fillKey) {
      const stored = security.keyState === "ready" ? await chrome.storage.session.get("apiKey") : {};
      const latestKey = stored.apiKey || "";
      // A change in another Settings tab updates the untouched input, while an
      // explicitly edited replacement Key remains this tab's unsaved draft.
      if (!preserveDraft || !keyChanged) {
        $("api-key").value = latestKey;
      }
      originalKey = latestKey;
      keyChanged = $("api-key").value.trim() !== originalKey.trim();
    }
    renderSecurity();return result;
  }
  function markDraft() {
    if (busy) return;
    const changed = keyChanged || rememberChanged
      || $("provider").value !== currentSettings.provider
      || buildSecretChanged || Number($("build-port").value) !== currentSettings.buildPort
      || $("build-model").value !== currentSettings.buildModel
      || $("build-reasoning-effort").value !== currentSettings.buildReasoningEffort
      || $("oauth-model").value !== (currentSettings.oauthModel||"grok-4.3")
      || $("oauth-reasoning-effort").value !== (currentSettings.oauthReasoningEffort||"none")
      || $("enabled").checked !== currentSettings.enabled
      || $("manual-mode").checked !== currentSettings.manualMode
      || $("explanation-mode").value !== currentSettings.explanationMode
      || $("api-model").value !== currentSettings.apiModel
      || $("api-reasoning-effort").value !== currentSettings.apiReasoningEffort
      || Number($("api-concurrency").value) !== currentSettings.apiConcurrency
      || Math.round(Number($("analysis-dwell").value) * 1000) !== currentSettings.dwellMs
      || $("web-search").checked !== currentSettings.webSearch
      || $("x-search").checked !== currentSettings.xSearch
      || $("language").value !== currentSettings.language
      || $("interface-language").value !== currentSettings.interfaceLanguage
      || promptFields.some(field => $(field.id).value !== currentSettings[field.setting]);
    if (changed) setStatus("options.unsavedChanges");
    else if (statusMessage?.key === "options.unsavedChanges") {
      statusMessage = null;$("status").textContent = "";delete $("status").dataset.state;
    }
  }
  async function consumeOptionsFocus() {
    optionsFocusPending = true;
    if (busy || (isAPI() && !securityLoaded)) return;
    optionsFocusPending = false;
    try {
      const stored = await chrome.storage.session.get("superxOptionsFocus");
      const request = stored.superxOptionsFocus;
      if (!request || !["api-key","unlock-passphrase","build","oauth"].includes(request.id)
        || !["string","number"].includes(typeof request.nonce) || request.nonce === lastOptionsFocusNonce) return;
      if (busy) { optionsFocusPending = true;return; }
      lastOptionsFocusNonce = request.nonce;
      // Focus an actionable control for the current connection state. A
      // restored login must never send focus to its hidden sign-in button.
      let id=request.id==="oauth"?"provider":request.id === "build" || isBuild() ? isBuild() ? "check-build" : "provider" : "api-key";
      if(isOAuth()){
        const modelAvailable=!Array.isArray(oauthStatus.catalogModels)||oauthStatus.catalogModels.some(entry=>entry.id===$("oauth-model").value&&entry.available!==false);
        if(oauthStatus.connected&&!modelAvailable&&!$("oauth-model").disabled)id="oauth-model";
        else if(!$("oauth-login").hidden&&!$("oauth-login").disabled)id="oauth-login";
        else if(oauthStatus.device&&!$("oauth-device").hidden&&$("oauth-official-link").getAttribute("href"))id="oauth-official-link";
        else id="provider";
      }
      if($(id).hidden||$(id).disabled)id="provider";
      await chrome.storage.session.remove("superxOptionsFocus");
      $(id).scrollIntoView?.({block:"center",behavior:"instant"});
      $(id).focus({preventScroll:true});
    } catch { /* Opening Settings still works if a focus request cannot be consumed. */ }
  }
  function showExplanationMode() {
    const mode = $("explanation-mode").value || currentSettings.explanationMode || "preset";
    $("analysis-prompts").hidden = mode !== "custom";
    if($("prompt-editing-help"))$("prompt-editing-help").hidden=mode!=="custom";
    $("reset-prompts").hidden=mode!=="custom";
    if(mode==="custom"&&displayedExplanationMode!==mode&&$("comments-customization"))$("comments-customization").open=true;
    displayedExplanationMode=mode;
    const key = mode === "custom" ? "options.customModeHelp" : "options.presetModeHelp";
    $("explanation-mode-help").textContent = ui.t(key,uiLanguage);
  }
  function populateLanguages(language) {
    const select = $("language");
    select.replaceChildren();
    for (const item of core.LANGUAGES) {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.value === "auto" ? ui.t("lang.auto",uiLanguage) : item.label;
      select.append(option);
    }
    if (!core.LANGUAGES.some(item => item.value === language)) {
      const option = document.createElement("option");
      option.value = language;
      option.textContent = ui.t("options.customLanguage",uiLanguage,{language});
      select.append(option);
    }
    select.value = language;
  }
  function applyLanguage(language) {
    observedUILanguage = ui.normalizeLanguage(language);
    renderLanguage();
  }
  function populateInterfaceLanguages(language) {
    const select = $("interface-language");
    select.replaceChildren();
    for (const item of ui.INTERFACE_LANGUAGES) {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.value === "auto" ? ui.t("lang.interfaceAuto",uiLanguage) : item.label;
      select.append(option);
    }
    select.value = language;
  }
  function populateModels(model) {
    const select = $("api-model");
    select.replaceChildren();
    for (const item of modelChoices(currentSettings.apiModel)) {
      const option = document.createElement("option");
      option.value = item.value;option.textContent = modelChoiceLabel(item);
      option.disabled=core.isNonTextGenerationModel(item.value);
      select.append(option);
    }
    select.value = model;
  }
  function populateReasoning(model, effort) {
    const select = $("api-reasoning-effort");
    select.replaceChildren();
    for (const value of core.modelProfile(model)?.efforts || ["auto"]) {
      const option = document.createElement("option");
      option.value = value;option.textContent = reasoningChoiceLabel(value);
      select.append(option);
    }
    select.value = core.reasoningEffort(model,effort);
    clearResolvedError("api-reasoning-effort",Boolean(select.value),["options.reasoningInvalid"]);
  }
  function buildModelChoices() {
    return modelChoices(currentSettings.buildModel);
  }
  function populateBuildModels(model) {
    const select = $("build-model");select.replaceChildren();
    for (const item of buildModelChoices()) {
      const option = document.createElement("option");option.value=item.value;option.textContent=modelChoiceLabel(item);
      const catalog = buildStatus?.modelCatalog;
      option.disabled = core.isNonTextGenerationModel(item.value) || Array.isArray(catalog) && !catalog.some(entry => (typeof entry === "string" ? entry : entry.id) === item.value && entry.available !== false);
      select.append(option);
    }
    select.value = model;
  }
  function populateBuildReasoning(model,effort,modelChanged=false) {
    const select = $("build-reasoning-effort");select.replaceChildren();
    const entry = buildStatus?.modelCatalog?.find(item => typeof item === "object" && item.id === model);
    // Grok Build negotiates ACP levels independently of API model profiles.
    const supported = ["none","minimal","low","medium","high","xhigh"];
    const efforts = Array.isArray(entry?.efforts) ? supported.filter(value => entry.efforts.includes(value)) : supported;
    for (const value of efforts) {
      const option=document.createElement("option");option.value=value;option.textContent=reasoningChoiceLabel(value);select.append(option);
    }
    const preferred=core.buildReasoningEffort(model);
    const selected=efforts.includes(effort) ? effort : !modelChanged&&supported.includes(effort) ? effort : efforts.includes(preferred) ? preferred : efforts[0] || "";
    // A connection refresh must not silently turn 'none' into a reasoning
    // level. Keep an unavailable saved choice visible until explicitly edited.
    if(selected&&!efforts.includes(selected)){
      const option=document.createElement("option");option.value=selected;option.textContent=reasoningChoiceLabel(selected);option.disabled=true;select.append(option);
    }
    select.value=selected;
  }
  function renderLanguage() {
    const interfaceLanguage = $("interface-language").value || currentSettings.interfaceLanguage;
    uiLanguage = ui.resolveLanguage(interfaceLanguage,observedUILanguage);
    ui.apply(document,uiLanguage);
    // Keep a real, fixed-destination link inside localized plain text. Locale
    // refreshes must neither parse HTML nor reset the user's details toggle.
    const subscriptionName="The X Subscription",subscriptionHelp=ui.t("options.apiSubscriptionHelp",uiLanguage);
    const subscriptionIndex=subscriptionHelp.indexOf(subscriptionName);
    $("api-subscription-before").textContent=subscriptionIndex<0?subscriptionHelp:subscriptionHelp.slice(0,subscriptionIndex);
    $("api-subscription-link").hidden=subscriptionIndex<0;
    $("api-subscription-after").textContent=subscriptionIndex<0?"":subscriptionHelp.slice(subscriptionIndex+subscriptionName.length);
    document.title = `SuperX · ${ui.t("common.settings",uiLanguage)}`;
    $("extension-version").textContent = ui.t("options.version",uiLanguage,{version:chrome.runtime.getManifest().version});
    populateLanguages($("language").value || currentSettings.language);
    populateInterfaceLanguages(interfaceLanguage);
    const model = $("api-model").value || currentSettings.apiModel;
    const effort = $("api-reasoning-effort").value || currentSettings.apiReasoningEffort;
    populateModels(model);populateReasoning(model,effort);
    const buildModel=$("build-model").value || currentSettings.buildModel;
    const buildEffort=$("build-reasoning-effort").value || currentSettings.buildReasoningEffort;
    populateBuildModels(buildModel);populateBuildReasoning(buildModel,buildEffort);
    populateOAuthModels($("oauth-model").value||currentSettings.oauthModel,$("oauth-reasoning-effort").value||currentSettings.oauthReasoningEffort);
    showExplanationMode();
    renderSecurity();
    renderProvider();
    renderDiagnostics();
    renderSearchFeedback();
    for(const [id,error]of fieldErrors){if(error.errorId&&$(error.errorId))$(error.errorId).textContent=ui.t(error.key,uiLanguage,error.vars);}
    if (statusMessage) setStatus(statusMessage.key,statusMessage.state,statusMessage.vars);
  }
  function populate(settings) {
    $("enabled").checked = settings.enabled;
    $("manual-mode").checked = settings.manualMode;
    renderAnalysisMode();
    $("provider").value = settings.provider;
    $("build-port").value = settings.buildPort;
    populateBuildModels(settings.buildModel);populateBuildReasoning(settings.buildModel,settings.buildReasoningEffort);
    populateOAuthModels(settings.oauthModel||"grok-4.3",settings.oauthReasoningEffort||"none");$("oauth-remember").checked=oauthLoaded?oauthStatus.remember:settings.oauthRemember!==false;
    $("explanation-mode").value = settings.explanationMode === "custom" ? "custom" : "preset";
    populateModels(settings.apiModel);
    populateReasoning(settings.apiModel,settings.apiReasoningEffort);
    $("api-concurrency").value = settings.apiConcurrency;
    $("analysis-dwell").value = settings.dwellMs / 1000;
    $("web-search").checked = settings.webSearch;
    $("x-search").checked = settings.xSearch;
    for (const field of promptFields) $(field.id).value = settings[field.setting];
    populateLanguages(settings.language);
    populateInterfaceLanguages(settings.interfaceLanguage);
    showExplanationMode();
    renderProvider();
    renderSearchFeedback();
  }
  async function send(message) {
    const result = await chrome.runtime.sendMessage(message);
    if (!result?.ok) throw new Error(result?.errorKey ? ui.t(result.errorKey,uiLanguage,result.vars || {}) : result?.error || ui.t("errors.noResponse",uiLanguage));
    return result;
  }
  async function load() {
    setBusy(true);
    const revision = localeRevision;
    try {
      // This reply waits for worker initialization, including legacy-source
      // migration. Read settings afterwards rather than keeping a pre-migration
      // storage snapshot that a later Save could write back over the result.
      const locale=await chrome.runtime.sendMessage({type:"GET_UI_LANGUAGE"}).catch(() => null);
      const local=await chrome.storage.local.get(["settings","uiLanguage"]);
      // The worker hydrates remembered Keys before replying. Read its current
      // session mirror only afterwards so a browser restart cannot look empty.
      currentSettings = core.normalizeSettings(local.settings);
      populate(currentSettings);
      try {const connection=await send({type:"GET_BUILD_CONNECTION"});buildConnection={configured:connection.configured===true,port:connection.port||currentSettings.buildPort};$("build-port").value=buildConnection.port;}catch{/* Existing API setup stays usable if the local connection is unavailable. */}
      try {await refreshSecurity(true);} catch(error) {if(currentSettings.provider==="api")throw error;}
      await refreshOAuthStatus();
      $("remember-key").checked = security.remember;
      if (localeRevision === revision) applyLanguage(locale?.language || local.uiLanguage || observedUILanguage);
      else renderLanguage();
    } catch (error) {
      populate(currentSettings);setStatus("errors.load","error",{error:error.message});
    } finally { setBusy(false);await consumeOptionsFocus(); }
  }
  $("explanation-mode").addEventListener("change",() => { showExplanationMode();markDraft(); });
  $("provider").addEventListener("change",() => { void cancelOAuthLoginOnProviderChange();renderProvider();markDraft();scheduleOAuthPoll();if(isOAuth())void refreshOAuthStatus(); });
  $("oauth-login").addEventListener("click",()=>oauthAction("OAUTH_LOGIN",{remember:$("oauth-remember").checked}));
  $("oauth-cancel").addEventListener("click",()=>oauthAction("OAUTH_CANCEL_LOGIN"));
  $("oauth-logout").addEventListener("click",()=>oauthAction("OAUTH_LOGOUT"));
  $("oauth-remember").addEventListener("change",()=>oauthAction("OAUTH_SET_REMEMBER",{remember:$("oauth-remember").checked}));
  $("oauth-refresh-models").addEventListener("click",()=>oauthAction("OAUTH_REFRESH_CATALOG"));
  $("oauth-model").addEventListener("change",()=>{populateOAuthModels($("oauth-model").value,$("oauth-reasoning-effort").value,true);renderOAuth();markDraft();});
  $("oauth-reasoning-effort").addEventListener("change",()=>{renderOAuth();markDraft();});
  $("oauth-copy-code").addEventListener("click",async()=>{if(!oauthStatus.device)return;try{await navigator.clipboard.writeText(oauthStatus.device.userCode);setStatus("common.copied");}catch{setStatus("common.copyFailed","error");}});
  $("build-model").addEventListener("change",() => { populateBuildReasoning($("build-model").value,$("build-reasoning-effort").value,true);renderBuildStatus();markDraft(); });
  $("build-reasoning-effort").addEventListener("change",() => { renderBuildStatus();markDraft(); });
  $("check-build").addEventListener("click",async () => {
    if (busy || buildChecking || !isBuild()) return;
    const revision=++buildCheckRevision;
    buildChecking=true;renderBuildStatus();
    // Optional loopback access is requested only from this explicit gesture.
    const permission=requestLocalAccess();
    try {
      if(await permission!==true){if(revision===buildCheckRevision)buildStatus={ready:false,errorCode:"BUILD_PERMISSION_REQUIRED"};return;}
      if(revision!==buildCheckRevision)return;
      const result=await send({type:"GET_BUILD_STATUS",port:Number($("build-port").value),...(buildSecretChanged?{secret:$("build-secret").value.trim()}: {})});
      if (revision!==buildCheckRevision) return;
      buildStatus=result;
      const model=$("build-model").value,effort=$("build-reasoning-effort").value;
      populateBuildModels(model);populateBuildReasoning(model,effort);
      markDraft();
    } catch {if(revision===buildCheckRevision)buildStatus={ready:false,errorCode:"BUILD_STATUS_UNKNOWN"};}
    finally {if(revision===buildCheckRevision){buildChecking=false;renderBuildStatus();}}
  });
  $("build-guide").addEventListener("click",async () => {
    try {await send({type:"OPEN_CONNECTOR_GUIDE"});}
    catch(error){setStatus("errors.operation","error",{error:error.message});}
  });
  function resetBuildCheck() {
    buildCheckRevision++;buildChecking=false;buildStatus=null;
    const model=$("build-model").value,effort=$("build-reasoning-effort").value;
    populateBuildModels(model);populateBuildReasoning(model,effort);renderBuildStatus();markDraft();
  }
  $("build-platform").value=/Mac/i.test(navigator.userAgentData?.platform||navigator.platform||"")?"macos":"windows";
  for(const id of ["build-port","build-secret"]){$(id).addEventListener("input",()=>{if(id==="build-secret")buildSecretChanged=!buildConnection.configured||Boolean($(id).value.trim());$("build-launch").hidden=true;$("build-command").textContent="";resetBuildCheck();});}
  $("build-platform").addEventListener("change",()=>{$("build-launch").hidden=true;});
  $("generate-build-command").addEventListener("click",async()=>{
    if(busy||buildGenerating||!isBuild())return;
    buildGenerating=true;renderBuildStatus();
    try{
      const launch=await send({type:"GET_BUILD_LAUNCH",platform:$("build-platform").value,port:Number($("build-port").value)});
      if(typeof launch.command!=="string"||typeof launch.secret!=="string"||!launch.secret)throw new Error(ui.t("errors.noResponse",uiLanguage));
      $("build-command").textContent=launch.command;$("build-secret").value=launch.secret;$("build-port").value=launch.port;buildSecretChanged=true;
      $("build-launch").hidden=false;resetBuildCheck();setStatus("build.commandReady");
    }catch(error){setStatus("errors.operation","error",{error:error.message});}
    finally{buildGenerating=false;renderBuildStatus();}
  });
  $("copy-build-command").addEventListener("click",async()=>{
    try{await navigator.clipboard.writeText($("build-command").textContent);setStatus("build.commandCopied");}
    catch{setStatus("common.copyFailed","error");}
  });
  $("clear-build-connection").addEventListener("click",async()=>{
    if(busy||!isBuild())return;setBusy(true);
    try{await send({type:"CLEAR_BUILD_CONNECTION"});buildConnection={configured:false,port:currentSettings.buildPort};$("build-secret").value="";buildSecretChanged=false;$("build-launch").hidden=true;$("build-command").textContent="";resetBuildCheck();setStatus("build.cleared");}
    catch(error){setStatus("errors.operation","error",{error:error.message});}finally{setBusy(false);}
  });
  $("interface-language").addEventListener("change",() => { renderLanguage();markDraft(); });
  $("api-model").addEventListener("change",() => { populateReasoning($("api-model").value,$("api-reasoning-effort").value);markDraft(); });
  function renderAnalysisMode() {
    $("automatic-mode").checked = !$("manual-mode").checked;
    $("analysis-dwell").disabled = busy || $("manual-mode").checked;
  }
  for (const id of ["automatic-mode","manual-mode"]) {
    $(id).addEventListener("change",() => {
      if (!$(id).checked) return;
      $("manual-mode").checked = id === "manual-mode";
      renderAnalysisMode();markDraft();
    });
  }
  for (const id of ["enabled","build-reasoning-effort","api-reasoning-effort","api-concurrency","analysis-dwell","web-search","x-search","language",...promptFields.map(field => field.id)]) {
    $(id).addEventListener("input",markDraft);
    $(id).addEventListener("change",markDraft);
  }
  for(const id of ["api-key","api-model","api-reasoning-effort","oauth-model","oauth-reasoning-effort","build-model","build-reasoning-effort","build-port","build-secret"]){for(const event of ["input","change"])$(id).addEventListener(event,()=>clearFieldError(id));}
  for(const id of ["web-search","x-search"]){for(const event of ["input","change"])$(id).addEventListener(event,renderSearchFeedback);}
  function restorePrompt(field) {
    $(field.id).value = core.DEFAULT_PROMPTS[field.name];
  }
  for (const field of promptFields) {
    $("reset-" + field.id).addEventListener("click",() => {
      if (busy) return;
      restorePrompt(field);setStatus("options.promptsReset");
    });
  }
  $("reset-prompts").addEventListener("click",() => {
    if (busy) return;
    for (const field of promptFields) restorePrompt(field);
    setStatus("options.promptsReset");
  });
  $("fast-preset").addEventListener("click",() => {
    $("api-model").value = "grok-4.3";
    populateReasoning("grok-4.3","none");
    $("api-concurrency").value = core.DEFAULT_SETTINGS.apiConcurrency;
    $("analysis-dwell").value = core.DEFAULT_SETTINGS.dwellMs / 1000;
    showExplanationMode();setStatus("options.presetReady");
  });
  $("reload-extension").addEventListener("click",() => {
    if (busy) return;setStatus("options.reloading");chrome.runtime.reload();
  });
  function revealMaintenance(){
    const hash=globalThis.location?.hash||"";
    if(["#maintenance-heading","#cache-heading","#reload-heading","#api-diagnostics"].includes(hash)&&$("maintenance"))$("maintenance").open=true;
  }
  $("maintenance-link")?.addEventListener("click",()=>{if($("maintenance"))$("maintenance").open=true;});
  globalThis.addEventListener?.("hashchange",revealMaintenance);revealMaintenance();
  $("api-key").addEventListener("input",() => { keyChanged = $("api-key").value.trim() !== originalKey.trim();renderSecurity();markDraft(); });
  $("remember-key").addEventListener("change",() => { rememberChanged = $("remember-key").checked !== security.remember;renderSecurity();markDraft(); });
  async function syncAfterSecurityAction(preserveDraft = false) {
    try {
      await refreshSecurity();
      if (!preserveDraft) $("remember-key").checked = security.remember;
      rememberChanged = $("remember-key").checked !== security.remember;
    } catch {
      // Runnable credential changes need a fresh Key state. Pausing and
      // unrelated preferences remain available after a failed mutation.
      securityLoaded = false;
    }
  }
  $("settings-form").addEventListener("submit",async event => {
    event.preventDefault();
    if (busy) return;
    const enabled=$("enabled").checked,provider=$("provider").value;
    const modelId=isOAuth()?"oauth-model":isBuild()?"build-model":"api-model",effortId=isOAuth()?"oauth-reasoning-effort":isBuild()?"build-reasoning-effort":"api-reasoning-effort";
    const modelField=isOAuth()?"oauthModel":isBuild()?"buildModel":"apiModel",effortField=isOAuth()?"oauthReasoningEffort":isBuild()?"buildReasoningEffort":"apiReasoningEffort";
    const connectionChanged=isAPI()?keyNeedsSave():isBuild()&&(buildSecretChanged||Number($("build-port").value)!==buildConnection.port);
    const strict=enabled&&(!currentSettings.enabled||provider!==currentSettings.provider||$(modelId).value!==currentSettings[modelField]||$(effortId).value!==currentSettings[effortField]||$("web-search").checked!==currentSettings.webSearch||$("x-search").checked!==currentSettings.xSearch||connectionChanged);
    // A stale catalog or unfinished connection must not prevent pausing or
    // saving unrelated preferences. Native required checks still apply to
    // ordinary settings, while unchanged connection fields are not submitted.
    const ignored=!strict?[modelId,effortId,...(isBuild()?["build-port"]:[])]:[],disabled=ignored.map(id=>[$(id),$(id).disabled]);
    let valid;try{for(const [input]of disabled)input.disabled=true;valid=event.currentTarget.reportValidity();}finally{for(const [input,value]of disabled)input.disabled=value;}
    if(!valid)return;
    const oversized = promptFields.find(field => $(field.id).value.length > promptLimit);
    if (oversized) {
      setStatus("options.promptTooLong","error",{limit:promptLimit});
      $(oversized.id).focus();return;
    }
    const settings = core.normalizeSettings({
      ...currentSettings,
      analysisDefaultsVersion:core.DEFAULT_SETTINGS.analysisDefaultsVersion,
      enabled:$("enabled").checked,
      manualMode:$("manual-mode").checked,
      provider:$("provider").value,
      buildTransport:"acp",
      buildPort:enabled&&isBuild()&&connectionChanged?Number($("build-port").value):currentSettings.buildPort,
      buildModel:enabled?$("build-model").value||currentSettings.buildModel:currentSettings.buildModel,
      buildReasoningEffort:enabled?$("build-reasoning-effort").value||currentSettings.buildReasoningEffort:currentSettings.buildReasoningEffort,
      oauthModel:enabled?$("oauth-model").value||currentSettings.oauthModel:currentSettings.oauthModel,
      oauthReasoningEffort:enabled?$("oauth-reasoning-effort").value||currentSettings.oauthReasoningEffort:currentSettings.oauthReasoningEffort,
      oauthRemember:$("oauth-remember").checked,
      explanationMode:$("explanation-mode").value,
      apiModel:enabled?$("api-model").value.trim()||currentSettings.apiModel:currentSettings.apiModel,
      apiReasoningEffort:enabled?$("api-reasoning-effort").value||currentSettings.apiReasoningEffort:currentSettings.apiReasoningEffort,
      apiConcurrency:Number($("api-concurrency").value),
      dwellMs:Math.round(Number($("analysis-dwell").value) * 1000),
      apiVerification:"only",
      webSearch:$("web-search").checked,
      xSearch:$("x-search").checked,
      language:$("language").value,
      interfaceLanguage:$("interface-language").value,
      verifyPrompt:$("verify-prompt").value,
      postDraftPrompt:$("post-draft-prompt").value,
      replyDraftPrompt:$("reply-draft-prompt").value,
      commentsPrompt:$("comments-prompt").value,
    });
    const apiKey = $("api-key").value.trim();
    const saveKey = enabled && isAPI() && connectionChanged;
    const saveBuildConnection=enabled&&isBuild()&&connectionChanged;
    const connectionDrafts=!enabled&&(keyNeedsSave()||buildSecretChanged||Number($("build-port").value)!==currentSettings.buildPort||["api","build","oauth"].some(source=>$(source+"-model").value!==currentSettings[source+"Model"]||$(source+"-reasoning-effort").value!==currentSettings[source+"ReasoningEffort"]));
    const remember = $("remember-key").checked;
    const selectedModelId=isOAuth()?"oauth-model":isBuild()?"build-model":"api-model";
    if(strict&&core.isNonTextGenerationModel($(selectedModelId).value)){
      fieldError(selectedModelId,"error.modelUnsupported");return;
    }
    if(strict&&isBuild()&&!buildConnection.configured&&!$("build-secret").value.trim()){
      fieldError("build-secret","build.codeRequired");return;
    }
    if(strict&&isAPI()&&(!securityLoaded||!saveKey&&security.keyState!=="ready")){fieldError("api-key",securityLoaded?"options.keyRequired":"errors.noResponse");return;}
    if(strict&&isOAuth()&&!oauthStatus.connected){fieldError("oauth-model",oauthStatus.errorKey||"oauth.needsLogin");return;}
    if(strict&&isBuild()&&buildStatus&&buildStatus.ready!==true){fieldError("build-secret",buildStateKey());return;}
    if (saveKey && !apiKey) {
      fieldError("api-key","options.keyRequired");return;
    }
    if (saveKey && (apiKey.length > 500 || /[\r\n]/.test(apiKey))) {
      fieldError("api-key","errors.keyInvalid");return;
    }
    if (strict&&isAPI() && !core.API_MODELS.some(item => item.value === $("api-model").value)
      && $("api-model").value !== currentSettings.apiModel) {
      fieldError("api-model","options.modelInvalid");return;
    }
    if (strict&&isAPI() && (!$("api-reasoning-effort").value || $("api-reasoning-effort").value !== settings.apiReasoningEffort)) {
      fieldError("api-reasoning-effort","options.reasoningInvalid");return;
    }
    if (strict&&isBuild() && (!buildModelChoices().some(item => item.value === $("build-model").value)
      || Array.isArray(buildStatus?.modelCatalog) && !buildStatus.modelCatalog.some(item => (typeof item === "string" ? item : item.id) === settings.buildModel && item.available !== false))) {
      fieldError("build-model","options.buildModelUnavailable",{model:settings.buildModel});return;
    }
    const buildEfforts=buildStatus?.modelCatalog?.find(item=>item&&typeof item==='object'&&item.id===settings.buildModel)?.efforts;
    if (strict&&isBuild() && (!$("build-reasoning-effort").value || $("build-reasoning-effort").value !== settings.buildReasoningEffort
      || Array.isArray(buildEfforts)&&!buildEfforts.includes(settings.buildReasoningEffort))) {
      fieldError("build-reasoning-effort","options.reasoningInvalid");return;
    }
    if(strict&&isOAuth()&&Array.isArray(oauthStatus.catalogModels)&&!oauthStatus.catalogModels.some(entry=>entry.id===settings.oauthModel&&entry.available!==false)){fieldError("oauth-model",oauthStatus.catalogError?"oauth.catalogUnavailable":"oauth.modelUnavailable",{model:settings.oauthModel});return;}
    if(strict&&isOAuth()&&(!$("oauth-reasoning-effort").value||!oauthEfforts(settings.oauthModel).includes($("oauth-reasoning-effort").value)||settings.oauthReasoningEffort!==$("oauth-reasoning-effort").value)){fieldError("oauth-reasoning-effort","options.reasoningInvalid");return;}
    if (strict&&!settings.webSearch && !settings.xSearch) {
      renderSearchFeedback();fieldError("x-search","options.urlSearchRequired");return;
    }
    setBusy(true);setStatus("options.saving");
    const localPermission=saveBuildConnection?requestLocalAccess():null;
    try {
      if(localPermission&&await localPermission!==true){setStatus("build.permission","error");return;}
      // Apply a replacement Key and its settings in one worker transaction.
      // A settings-only save never erases or replaces an untouched credential.
      if (saveKey) {
        await send({type:"SAVE_KEY",apiKey,remember,settings});
        keyChanged = false;rememberChanged = false;
        originalKey = apiKey;
      } else if(saveBuildConnection) {
        await send({type:"SAVE_BUILD_CONNECTION",port:settings.buildPort,settings,...(buildSecretChanged?{secret:$("build-secret").value.trim()}: {})});
        buildConnection={configured:true,port:settings.buildPort};buildSecretChanged=false;$("build-secret").value="";$("build-launch").hidden=true;$("build-command").textContent="";
      } else await send({type:"SAVE_SETTINGS",settings});
      currentSettings = settings;
      if (saveKey) await refreshSecurity();
      if(strict)for(const id of [...fieldErrors.keys()])clearFieldError(id);
      if(enabled){populate(currentSettings);renderLanguage();}
      else {renderProvider();renderSearchFeedback();}
      setStatus(connectionDrafts?"options.pausedWithDrafts":"options.saved");
    } catch (error) {
      setStatus("errors.operation","error",{error:error.message});
      // Re-read the actual state, retaining a replacement draft for retry.
      await syncAfterSecurityAction(true);
    }
    finally { setBusy(false); }
  });
  $("clear-key").addEventListener("click",async () => {
    if (busy || !isAPI()) return;setBusy(true);
    try {
      await send({type:"SAVE_KEY",apiKey:"",remember:$("remember-key").checked});
      keyInputClear();rememberChanged = false;await refreshSecurity();setStatus("options.keyCleared");
    } catch (error) {
      setStatus("errors.operation","error",{error:error.message});
      // A failed storage operation may leave a changed credential state.
      // Reflect the worker's actual state instead of assuming it was cleared.
      try { await refreshSecurity(true); } catch { securityLoaded = false; }
    }
    finally { rememberChanged = false;await syncAfterSecurityAction();setBusy(false); }
  });
  $("clear-cache").addEventListener("click",async () => {
    if (busy) return;setBusy(true);
    try { await send({type:"CLEAR_CACHE"});setStatus("options.cacheCleared"); }
    catch (error) { setStatus("errors.operation","error",{error:error.message}); }
    finally { setBusy(false); }
  });
  $("diagnostics-summary").addEventListener("click",()=>{if(!$("api-diagnostics").open)void refreshDiagnostics();});
  $("diagnostics-refresh").addEventListener("click",()=>refreshDiagnostics());
  $("diagnostics-copy").addEventListener("click",async()=>{
    if(busy||diagnosticsBusy||!diagnosticsText)return;
    diagnosticsBusy=true;renderDiagnostics();
    try{await navigator.clipboard.writeText(diagnosticsText);diagnosticsStatusKey="options.diagnosticsCopied";}
    catch{diagnosticsStatusKey="common.copyFailed";}finally{diagnosticsBusy=false;renderDiagnostics();}
  });
  $("diagnostics-clear").addEventListener("click",async()=>{
    if(busy||diagnosticsBusy)return;diagnosticsBusy=true;diagnosticsText="";diagnosticsStatusKey="common.loading";renderDiagnostics();
    try{await send({type:"CLEAR_API_DIAGNOSTICS"});diagnosticsText="";diagnosticsStatusKey="options.diagnosticsEmpty";}
    catch{diagnosticsStatusKey="options.diagnosticsUnavailable";}
    finally{diagnosticsBusy=false;renderDiagnostics();}
  });
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "UI_LANGUAGE_CHANGED") { localeRevision++;applyLanguage(message.language); }
    if((message?.type==="OAUTH_STATUS_CHANGED"||message?.type==="CONFIG")&&message.oauthStatus){oauthReadRevision++;oauthActionError=null;applyOAuthStatus(message.oauthStatus);}
  });
  chrome.storage.onChanged.addListener((changes,area) => {
    if((area==="local"||area==="session")&&Object.keys(changes).some(key=>/^oauth/i.test(key))&&!oauthActionBusy)void refreshOAuthStatus();
    if(area==="local"&&changes.buildConnectionEncrypted&&!busy&&!buildSecretChanged&&Number($("build-port").value)===buildConnection.port){
      send({type:"GET_BUILD_CONNECTION"}).then(connection=>{if(!busy&&!buildSecretChanged&&Number($("build-port").value)===buildConnection.port){buildConnection={configured:connection.configured===true,port:connection.port||currentSettings.buildPort};$("build-port").value=buildConnection.port;currentSettings={...currentSettings,buildPort:buildConnection.port};resetBuildCheck();}}).catch(()=>{});
    }
    if (area === "local" && changes.uiLanguage) { localeRevision++;applyLanguage(changes.uiLanguage.newValue); }
    if (area === "local" && changes.settings && !busy) {
      const previousInterfaceLanguage = currentSettings.interfaceLanguage;
      const interfaceDraft = $("interface-language").value !== previousInterfaceLanguage;
      const nextSettings = core.normalizeSettings(changes.settings.newValue);
      // Other Settings tabs can change the interface without discarding this
      // tab's answer language, prompts, or replacement Key drafts.
      currentSettings = {...currentSettings,interfaceLanguage:nextSettings.interfaceLanguage};
      if (!interfaceDraft) populateInterfaceLanguages(nextSettings.interfaceLanguage);
      renderLanguage();markDraft();
    }
    if (area === "session" && changes.superxOptionsFocus) void consumeOptionsFocus();
    if (!busy && (area === "session" && (changes.apiKey || changes.securityFault) || area === "local" && (changes.apiKeyEncrypted || changes.apiKey || changes.apiKeyVault || changes.rememberApiKey))) {
      refreshSecurity(true,true).then(() => {
        if (!rememberChanged) $("remember-key").checked = security.remember;
        rememberChanged = $("remember-key").checked !== security.remember;
        renderSecurity();
        if (statusMessage?.key === "options.unsavedChanges") markDraft();
      }).catch(() => { securityLoaded = false;setStatus("errors.noResponse","error");renderSecurity(); });
    }
  });
  applyLanguage(observedUILanguage);load();
})();
