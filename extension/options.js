"use strict";

(() => {
  const core = globalThis.XGrokCore;
  const ui = globalThis.GrokFirstUI;
  const $ = id => document.getElementById(id);
  const promptFields = [
    {name:"explain",setting:"explainPrompt"},
    {name:"verify",setting:"verifyPrompt"},
    {name:"comments",setting:"commentsPrompt"},
  ];
  const promptLimit = core.MAX_PROMPT_LENGTH || 12000;
  let currentSettings = core.normalizeSettings(core.DEFAULT_SETTINGS);
  let observedUILanguage = ui.browserLanguage(globalThis);
  let uiLanguage = observedUILanguage;
  let localeRevision = 0;
  let statusMessage = null;
  let keyChanged = false;
  let rememberChanged = false;
  let originalKey = "";
  let security = {keyState:"missing",remember:true,hasSavedKey:false};
  let securityLoaded = false;
  let busy = false;
  let optionsFocusPending = false;
  let lastOptionsFocusNonce;
  let historyReady=false, historyBusy=false,historyStatusKey=null;

  function setHistoryStatus(key) {historyStatusKey=key;$("history-status").textContent=key?ui.t(key,uiLanguage):"";}

  function setStatus(key, state = "success", vars = {}) {
    statusMessage = {key,state,vars};
    $("status").textContent = ui.t(key,uiLanguage,vars);
    $("status").dataset.state = state;
  }
  function setBusy(value) {
    busy = value;
    for (const control of $("settings-form").elements) control.disabled = value;
    $("history-enabled").disabled=value||!historyReady||historyBusy;
    renderSecurity();showProvider();
    if (!value && optionsFocusPending) void consumeOptionsFocus();
  }
  function keyInputClear() {
    $("api-key").value = "";originalKey = "";keyChanged = false;
  }
  function keyNeedsSave() { return keyChanged || rememberChanged; }
  function renderSecurity() {
    const stateKeys = {ready:security.hasSavedKey ? "options.keyReadySaved" : "options.keyReady",migration:"options.keyMigration",missing:"options.keyMissing"};
    $("key-security-state").textContent = ui.t(stateKeys[security.keyState] || stateKeys.missing,uiLanguage);
    $("key-security-state").dataset.state = security.keyState;
    $("clear-key").hidden = !securityLoaded || security.keyState !== "ready" && !security.hasSavedKey;
    $("save").disabled = busy || !securityLoaded;
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
  function showProvider() {
    const cli = $("provider").value === "cli";
    $("api-fields").hidden = cli;$("cli-fields").hidden = !cli;
    for(const control of $("api-fields").querySelectorAll("input,select,button"))control.disabled=busy||cli;
    for(const control of $("cli-fields").querySelectorAll("input,button"))control.disabled=busy||!cli;
    $("cli-dwell-seconds").disabled=busy||!cli||!$("cli-auto-analyze").checked;
    $("provider-description").textContent=ui.t(cli?"cli.description":"options.providerAPI",uiLanguage);
  }
  let cliState = 'checking', checkingCLI = false;
  function renderCLI() {
    const keys={checking:'cli.checking',ready:'cli.readyToUse',bridge_missing:'cli.bridgeMissing',cli_missing:'cli.notInstalled',login_required:'cli.loginNeeded'};
    $("cli-status").textContent=ui.t(keys[cliState]||'cli.unavailable',uiLanguage);
    $("cli-setup-guide").hidden=cliState==='ready'||cliState==='checking';
    $("cli-login-needed").hidden=cliState!=='login_required';
    if(cliState==='cli_missing'||cliState==='login_required')$("cli-install-guide").open=true;
  }
  async function checkCLI() {
    if(checkingCLI)return;
    checkingCLI=true;
    try {const result=await send({type:"GET_CLI_STATUS"});cliState=result.ready?'ready':result.status||'bridge_missing';}
    catch {cliState='bridge_missing';}
    finally{checkingCLI=false;renderCLI();}
  }
  $("cli-connect-command").textContent='python3 native/install.py --extension-id '+chrome.runtime.id;
  for(const [id,command] of [["copy-cli-install",'curl -fsSL https://x.ai/cli/install.sh | bash'],["copy-cli-login",'grok login'],["copy-cli-connect",$("cli-connect-command").textContent]]) {
    $(id).addEventListener('click',async()=>{
      try{await navigator.clipboard.writeText(command);$("cli-copy-status").textContent=ui.t('common.copied',uiLanguage);}
      catch{$("cli-copy-status").textContent=ui.t('common.copyFailed',uiLanguage);}
    });
  }
  $("check-cli").addEventListener('click',()=>void checkCLI());
  window.addEventListener('focus',()=>{if(!busy&&$("provider").value==='cli')void checkCLI();});
  $("provider").addEventListener("change",()=>{showProvider();markDraft();if($("provider").value==="cli")void checkCLI();});
  $("test-cli").addEventListener("click",async()=>{
    if(busy)return;setBusy(true);$("cli-status").textContent=ui.t("cli.testing",uiLanguage);
    try{await send({type:"TEST_CLI"});$("cli-status").textContent=ui.t("cli.testOK",uiLanguage);}
    catch(error){$("cli-status").textContent=error.message;}
    finally{setBusy(false);}
  });
  function markDraft() {
    if (busy || !securityLoaded) return;
    const changed = keyChanged || rememberChanged
      || $("provider").value !== currentSettings.provider
      || $("cli-model").value !== currentSettings.cliModel
      || $("cli-web-search").checked !== currentSettings.cliWebSearch
      || $("cli-auto-analyze").checked !== currentSettings.cliAutoAnalyze
      || Number($("cli-dwell-seconds").value) !== currentSettings.cliDwellSeconds
      || $("enabled").checked !== currentSettings.enabled
      || $("explanation-mode").value !== currentSettings.explanationMode
      || $("api-model").value !== currentSettings.apiModel
      || Number($("api-concurrency").value) !== currentSettings.apiConcurrency
      || $("api-verification").value !== currentSettings.apiVerification
      || $("web-search").checked !== currentSettings.webSearch
      || $("x-search").checked !== currentSettings.xSearch
      || $("language").value !== currentSettings.language
      || $("interface-language").value !== currentSettings.interfaceLanguage
      || promptFields.some(field => $(field.name + "-prompt").value !== currentSettings[field.setting]);
    if (changed) setStatus("options.unsavedChanges");
    else if (statusMessage?.key === "options.unsavedChanges") {
      statusMessage = null;$("status").textContent = "";delete $("status").dataset.state;
    }
  }
  async function consumeOptionsFocus() {
    optionsFocusPending = true;
    if (busy || !securityLoaded) return;
    optionsFocusPending = false;
    try {
      const stored = await chrome.storage.session.get("superxOptionsFocus");
      const request = stored.superxOptionsFocus;
      if (!request || !["provider","api-key","unlock-passphrase"].includes(request.id)
        || !["string","number"].includes(typeof request.nonce) || request.nonce === lastOptionsFocusNonce) return;
      if (busy) { optionsFocusPending = true;return; }
      lastOptionsFocusNonce = request.nonce;
      // All Settings entry points start at the credential field. A previous
      // extension version may still leave an unlock-password focus marker.
      const id = $("provider").value === "cli" ? "provider" : "api-key";
      await chrome.storage.session.remove("superxOptionsFocus");
      $(id).scrollIntoView?.({block:"center",behavior:"instant"});
      $(id).focus({preventScroll:true});
    } catch { /* Opening Settings still works if a focus request cannot be consumed. */ }
  }
  function showExplanationMode() {
    const mode = $("explanation-mode").value || currentSettings.explanationMode || "preset";
    $("analysis-prompts").hidden = mode !== "custom";
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
  function renderLanguage() {
    const interfaceLanguage = $("interface-language").value || currentSettings.interfaceLanguage;
    uiLanguage = ui.resolveLanguage(interfaceLanguage,observedUILanguage);
    ui.apply(document,uiLanguage);
    setHistoryStatus(historyStatusKey);
    document.title = `SuperX · ${ui.t("common.settings",uiLanguage)}`;
    $("extension-version").textContent = ui.t("options.version",uiLanguage,{version:chrome.runtime.getManifest().version});
    populateLanguages($("language").value || currentSettings.language);
    populateInterfaceLanguages(interfaceLanguage);
    showExplanationMode();
    renderSecurity();showProvider();renderCLI();
    if (statusMessage) setStatus(statusMessage.key,statusMessage.state,statusMessage.vars);
  }
  function populate(settings) {
    $("provider").value=settings.provider;
    $("cli-model").value=settings.cliModel;
    $("cli-web-search").checked=settings.cliWebSearch;
    $("cli-auto-analyze").checked=settings.cliAutoAnalyze;
    $("cli-dwell-seconds").value=settings.cliDwellSeconds;
    showProvider();
    $("enabled").checked = settings.enabled;
    $("explanation-mode").value = settings.explanationMode === "custom" ? "custom" : "preset";
    $("api-model").value = settings.apiModel;
    $("api-concurrency").value = settings.apiConcurrency;
    $("api-verification").value = settings.apiVerification;
    $("web-search").checked = settings.webSearch;
    $("x-search").checked = settings.xSearch;
    for (const field of promptFields) $(field.name + "-prompt").value = settings[field.setting];
    populateLanguages(settings.language);
    populateInterfaceLanguages(settings.interfaceLanguage);
    showExplanationMode();
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
      const [local,locale] = await Promise.all([
        chrome.storage.local.get(["settings","uiLanguage"]),
        chrome.runtime.sendMessage({type:"GET_UI_LANGUAGE"}).catch(() => null),
      ]);
      // The worker hydrates remembered Keys before replying. Read its current
      // session mirror only afterwards so a browser restart cannot look empty.
      await refreshSecurity(true);
      currentSettings = core.normalizeSettings(local.settings);
      populate(currentSettings);
      $("remember-key").checked = security.remember;
      if (localeRevision === revision) applyLanguage(locale?.language || local.uiLanguage || observedUILanguage);
      else renderLanguage();
    } catch (error) {
      populate(currentSettings);setStatus("errors.load","error",{error:error.message});
    } finally { setBusy(false);await consumeOptionsFocus(); }
  }
  $("explanation-mode").addEventListener("change",() => { showExplanationMode();markDraft(); });
  $("interface-language").addEventListener("change",() => { renderLanguage();markDraft(); });
  for (const id of ["cli-model","cli-web-search","cli-auto-analyze","cli-dwell-seconds","enabled","api-model","api-concurrency","api-verification","web-search","x-search","language",...promptFields.map(field => field.name + "-prompt")]) {
    $(id).addEventListener("input",markDraft);
    $(id).addEventListener("change",markDraft);
  }
  $("cli-auto-analyze").addEventListener("change",showProvider);
  function restorePrompt(field) {
    $(field.name + "-prompt").value = core.DEFAULT_PROMPTS[field.name];
  }
  for (const field of promptFields) {
    $("reset-" + field.name + "-prompt").addEventListener("click",() => {
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
    $("api-concurrency").value = 4;$("api-verification").value = "background";
    showExplanationMode();setStatus("options.presetReady");
  });
  $("reload-extension").addEventListener("click",() => {
    if (busy) return;setStatus("options.reloading");chrome.runtime.reload();
  });
  $("api-key").addEventListener("input",() => { keyChanged = $("api-key").value.trim() !== originalKey.trim();renderSecurity();markDraft(); });
  $("remember-key").addEventListener("change",() => { rememberChanged = $("remember-key").checked !== security.remember;renderSecurity();markDraft(); });
  async function syncAfterSecurityAction(preserveDraft = false) {
    try {
      await refreshSecurity();
      if (!preserveDraft) $("remember-key").checked = security.remember;
      rememberChanged = $("remember-key").checked !== security.remember;
    } catch {
      // Do not permit saving if the current Key state cannot be read after a
      // partially failed mutation.
      securityLoaded = false;
    }
  }
  $("settings-form").addEventListener("submit",async event => {
    event.preventDefault();
    if (busy || !securityLoaded || !event.currentTarget.reportValidity()) return;
    const oversized = promptFields.find(field => $(field.name + "-prompt").value.length > promptLimit);
    if (oversized) {
      setStatus("options.promptTooLong","error",{limit:promptLimit});
      $(oversized.name + "-prompt").focus();return;
    }
    const settings = core.normalizeSettings({
      ...currentSettings,
      enabled:$("enabled").checked,
      provider:$("provider").value,
      cliModel:$("cli-model").value.trim(),
      cliWebSearch:$("cli-web-search").checked,
      cliAutoAnalyze:$("cli-auto-analyze").checked,
      cliDwellSeconds:Number($("cli-dwell-seconds").value),
      explanationMode:$("explanation-mode").value,
      apiModel:$("api-model").value.trim(),
      apiConcurrency:Number($("api-concurrency").value),
      apiVerification:$("api-verification").value,
      webSearch:$("web-search").checked,
      xSearch:$("x-search").checked,
      language:$("language").value,
      interfaceLanguage:$("interface-language").value,
      explainPrompt:$("explain-prompt").value,
      verifyPrompt:$("verify-prompt").value,
      commentsPrompt:$("comments-prompt").value,
    });
    const apiKey = $("api-key").value.trim();
    const saveKey = settings.provider === "api" && keyNeedsSave();
    const remember = $("remember-key").checked;
    if (saveKey && !apiKey) {
      setStatus("options.keyRequired","error");$("api-key").focus();return;
    }
    if (saveKey && (apiKey.length > 500 || /[\r\n]/.test(apiKey))) {
      setStatus("errors.keyInvalid","error");$("api-key").focus();return;
    }
    if (settings.provider === "api" && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test($("api-model").value.trim())) {
      setStatus("options.modelInvalid","error");$("api-model").focus();return;
    }
    if (settings.provider === "cli" && $("cli-model").value.trim() && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test($("cli-model").value.trim())) {setStatus("options.modelInvalid","error");$("cli-model").focus();return;}
    if (settings.provider === "api" && !settings.webSearch && !settings.xSearch) {
      setStatus("options.urlSearchRequired","error");$("x-search").focus();return;
    }
    setBusy(true);setStatus("options.saving");
    try {
      // Apply a replacement Key and its settings in one worker transaction.
      // A settings-only save never erases or replaces an untouched credential.
      if (saveKey) {
        await send({type:"SAVE_KEY",apiKey,remember,settings});
        keyChanged = false;rememberChanged = false;
        originalKey = apiKey;
      } else await send({type:"SAVE_SETTINGS",settings});
      currentSettings = settings;
      await refreshSecurity();populate(currentSettings);renderLanguage();
      setStatus("options.saved");
    } catch (error) {
      setStatus("errors.operation","error",{error:error.message});
      // Re-read the actual state, retaining a replacement draft for retry.
      await syncAfterSecurityAction(true);
    }
    finally { setBusy(false); }
  });
  $("clear-key").addEventListener("click",async () => {
    if (busy) return;setBusy(true);
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
  async function loadHistory() {
    try {const result=await send({type:"GET_HISTORY_STATUS"});if(typeof result.enabled!=="boolean")throw new Error(ui.t("errors.noResponse",uiLanguage));$("history-enabled").checked=result.enabled;historyReady=true;}
    catch {historyReady=false;setHistoryStatus("history.error");}
    $("history-enabled").disabled=busy||historyBusy||!historyReady;
  }
  $("history-enabled").addEventListener("change",async () => {
    if(busy||historyBusy||!historyReady)return;
    const desired=$("history-enabled").checked;historyBusy=true;$("history-enabled").disabled=true;
    try {const result=await send({type:"SET_HISTORY_ENABLED",enabled:desired});if(typeof result.enabled!=="boolean")throw new Error("Invalid history response");$("history-enabled").checked=result.enabled;setHistoryStatus("history.saved");}
    catch {$("history-enabled").checked=!desired;setHistoryStatus("history.error");}
    finally {historyBusy=false;$("history-enabled").disabled=busy||!historyReady;}
  });
  $("open-history").addEventListener("click",async () => {
    try {await send({type:"OPEN_HISTORY"});}
    catch {setHistoryStatus("history.error");}
  });
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "UI_LANGUAGE_CHANGED") { localeRevision++;applyLanguage(message.language); }
  });
  chrome.storage.onChanged.addListener((changes,area) => {
    if (area === "local" && changes.uiLanguage) { localeRevision++;applyLanguage(changes.uiLanguage.newValue); }
    if(area==="local"&&changes.superxHistoryEnabled&&!historyBusy){$("history-enabled").checked=changes.superxHistoryEnabled.newValue!==false;historyReady=true;$("history-enabled").disabled=busy;}
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
  applyLanguage(observedUILanguage);load();void loadHistory();void checkCLI();
})();
