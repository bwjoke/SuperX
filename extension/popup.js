"use strict";

(() => {
  const core = globalThis.XGrokCore;
  const ui = globalThis.GrokFirstUI;
  const $ = id => document.getElementById(id);
  let currentSettings = core.normalizeSettings(core.DEFAULT_SETTINGS);
  let observedUILanguage = ui.browserLanguage(globalThis);
  let uiLanguage = observedUILanguage;
  let localeRevision = 0;
  let errorMessage = null;
  let busy = true;
  let loaded = false;
  let config = {ready:false,keyState:"missing"};
  function buildBlockedReason() {
    const status=config.buildStatus || {};
    if(status.errorCode==='BUILD_CANCEL_UNCONFIRMED')return 'build.cancelUnconfirmed';
    if(status.errorCode==='BUILD_PERMISSION_REQUIRED')return 'build.permission';
    if (["BUILD_CONNECTION_REQUIRED","BUILD_NOT_CONFIGURED","BUILD_SECRET_REQUIRED"].includes(status.errorCode)) return "build.codeRequired";
    if (["BUILD_AUTH_FAILED","BUILD_INVALID_SECRET"].includes(status.errorCode)) return "build.codeInvalid";
    if (["BUILD_NOT_CONNECTED","BUILD_CONNECTION_FAILED","BUILD_UNAVAILABLE","BUILD_DISCONNECTED"].includes(status.errorCode)) return "build.missing";
    if (status.authenticated===false || ["BUILD_AUTH_REQUIRED","BUILD_LOGIN_REQUIRED"].includes(status.errorCode)) return "build.login";
    if (["BUILD_VERSION_UNSUPPORTED","BUILD_UNSUPPORTED_VERSION","BUILD_PROTOCOL_UNSUPPORTED"].includes(status.errorCode)) return "build.unsupported";
    return "build.unknown";
  }
  function blockedReason() {
    if (!config.ready) {
      if(currentSettings.provider==="oauth"){
        const state=config.oauthStatus||{};
        if(["starting","awaiting_authorization","authorizing"].includes(state.state))return "oauth.authorizing";
        if(["refreshing","restoring"].includes(state.state))return "oauth.refreshing";
        if(state.state==="reauth_required")return "oauth.reauthRequired";
        if(state.connected===true)return "oauth.modelUnavailable";
        return "oauth.needsLogin";
      }
      return currentSettings.provider === "build" ? buildBlockedReason() : "status.needsKey";
    }
    return null;
  }
  function toggleLabel(reason) {
    if(!loaded)return "common.loading";
    if(!reason)return currentSettings.enabled ? "common.pause" : "common.resume";
    if(currentSettings.provider==="build")return "popup.setupBuild";
    if(currentSettings.provider!=="oauth")return "popup.addKey";
    const state=config.oauthStatus||{};
    return state.connected||["starting","awaiting_authorization","authorizing","refreshing","restoring"].includes(state.state)?"common.openSettings":"popup.signInGrok";
  }
  function render() {
    ui.apply(document,uiLanguage);
    const reason = loaded ? blockedReason() : null;
    const enabledLabel = !currentSettings.enabled ? "common.paused" : currentSettings.manualMode ? "options.manualMode" : "common.enabled";
    $("enabled-label").textContent = ui.t(loaded ? reason || enabledLabel : "common.loading",uiLanguage,{model:currentSettings.oauthModel});
    $("indicator").dataset.enabled = String(loaded && !reason && currentSettings.enabled);
    const build=currentSettings.provider==="build",oauth=currentSettings.provider==="oauth";
    $("provider-label").textContent = ui.t(oauth?"popup.oauthLabel":build ? "popup.buildLabel" : "popup.apiLabel",uiLanguage,{count:currentSettings.apiConcurrency,transport:currentSettings.buildTransport.toUpperCase()});
    $("provider-hint").textContent = ui.t(oauth?"popup.oauthHint":build ? "popup.buildHint" : "popup.apiHint",uiLanguage);
    $("toggle").textContent = ui.t(toggleLabel(reason),uiLanguage);
    $("toggle").disabled = busy || !loaded;
    $("options").hidden = Boolean(reason);
    $("status").textContent = errorMessage ? ui.t(errorMessage.key,uiLanguage,{error:errorMessage.error}) : "";
  }
  function applyLanguage(language) {
    observedUILanguage = ui.normalizeLanguage(language);
    uiLanguage = ui.resolveLanguage(currentSettings.interfaceLanguage,observedUILanguage);
    render();
  }
  function showError(key,error) { errorMessage = {key,error};render(); }
  async function openKeySettings() {
    const result = await chrome.runtime.sendMessage({type:"OPEN_SETTINGS",focus:currentSettings.provider==="oauth"?"oauth":currentSettings.provider==="build" ? "build" : "api-key"});
    if (!result?.ok) throw new Error(ui.t("errors.noResponse",uiLanguage));
  }
  async function load() {
    const revision = localeRevision;
    try {
      const [local,locale,result] = await Promise.all([
        chrome.storage.local.get(["uiLanguage"]),
        chrome.runtime.sendMessage({type:"GET_UI_LANGUAGE"}).catch(() => null),
        chrome.runtime.sendMessage({type:"GET_CONFIG"}),
      ]);
      if (!result?.ok || typeof result.ready !== "boolean") throw new Error(ui.t("errors.noResponse",uiLanguage));
      config = result;currentSettings = core.normalizeSettings(config.settings);loaded = true;
      if (localeRevision === revision) observedUILanguage = ui.normalizeLanguage(locale?.language || local.uiLanguage || observedUILanguage);
      uiLanguage = ui.resolveLanguage(currentSettings.interfaceLanguage,observedUILanguage);
    } catch (error) { errorMessage = {key:"errors.load",error:error.message}; }
    finally { busy = false;render(); }
  }
  $("toggle").addEventListener("click",async () => {
    if (busy || !loaded) return;
    if (blockedReason()) {
      busy=true;errorMessage=null;render();
      try {
        if(["build","oauth"].includes(currentSettings.provider)){
          const latest=await chrome.runtime.sendMessage({type:"GET_CONFIG"});
          if(!latest?.ok||typeof latest.ready!=="boolean")throw new Error(ui.t("errors.noResponse",uiLanguage));
          config=latest;currentSettings=core.normalizeSettings(latest.settings);
          if(blockedReason())await openKeySettings();
        } else await openKeySettings();
      } catch(error){showError("errors.operation",error.message);}
      finally{busy=false;render();}
      return;
    }
    busy = true;errorMessage = null;render();
    try {
      const latest = await chrome.runtime.sendMessage({type:"GET_CONFIG"});
      if (!latest?.ok) throw new Error(ui.t("errors.noResponse",uiLanguage));
      config = latest;
      currentSettings=core.normalizeSettings(latest.settings);
      if (blockedReason()) { await openKeySettings();return; }
      const latestSettings = core.normalizeSettings(latest.settings);
      const settings = core.normalizeSettings({...latestSettings,enabled:!latestSettings.enabled});
      const result = await chrome.runtime.sendMessage({type:"SAVE_SETTINGS",settings});
      if (!result?.ok) throw new Error(result?.errorKey ? ui.t(result.errorKey,uiLanguage,result.vars || {}) : result?.error || ui.t("errors.noResponse",uiLanguage));
      currentSettings = settings;
      uiLanguage = ui.resolveLanguage(currentSettings.interfaceLanguage,observedUILanguage);
    } catch (error) { errorMessage = {key:"errors.operation",error:error.message}; }
    finally { busy = false;render(); }
  });
  $("options").addEventListener("click",() => {
    openKeySettings().catch(error => showError("errors.operation",error.message));
  });
  $("history").addEventListener("click",async () => {
    try {const result=await chrome.runtime.sendMessage({type:"OPEN_HISTORY"});if(!result?.ok)throw new Error(ui.t("errors.noResponse",uiLanguage));}
    catch(error){showError("errors.operation",error.message);}
  });
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "UI_LANGUAGE_CHANGED") { localeRevision++;applyLanguage(message.language); }
    if(message?.type==="OAUTH_STATUS_CHANGED"&&currentSettings.provider==="oauth"&&!busy){busy=true;void load();}
    if(message?.type==="CONFIG"&&message.settings&&typeof message.ready==="boolean"&&!busy){
      config=message;currentSettings=core.normalizeSettings(message.settings);loaded=true;
      uiLanguage=ui.resolveLanguage(currentSettings.interfaceLanguage,observedUILanguage);render();
    }
  });
  chrome.storage.onChanged.addListener((changes,area) => {
    if((area==="local"||area==="session")&&Object.keys(changes).some(key=>/^oauth/i.test(key))&&currentSettings.provider==="oauth"&&!busy){busy=true;void load();return;}
    if (area === "session" && (changes.apiKey || changes.securityFault) || area === "local" && (changes.apiKeyVault || changes.rememberApiKey || changes.apiKey)) {
      if (!busy) { busy = true;load(); }
      return;
    }
    if (area !== "local") return;
    if (changes.settings && !busy) {
      const previousProvider=currentSettings.provider;
      currentSettings=core.normalizeSettings(changes.settings.newValue);
      if(previousProvider!==currentSettings.provider){config.ready=false;busy=true;void load();}
    }
    if (changes.uiLanguage) { localeRevision++;observedUILanguage = ui.normalizeLanguage(changes.uiLanguage.newValue); }
    uiLanguage = ui.resolveLanguage(currentSettings.interfaceLanguage,observedUILanguage);
    render();
  });
  render();load();
})();
