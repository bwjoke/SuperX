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
  function blockedReason() {
    if (!config.ready) return currentSettings.provider === "cli" ? "cli.unavailable" : "status.needsKey";
    return null;
  }
  function render() {
    ui.apply(document,uiLanguage);
    const reason = loaded ? blockedReason() : null;
    $("enabled-label").textContent = ui.t(loaded ? reason || (currentSettings.enabled ? "common.enabled" : "common.paused") : "common.loading",uiLanguage);
    $("indicator").dataset.enabled = String(loaded && !reason && currentSettings.enabled);
    $("provider-label").textContent = ui.t(currentSettings.provider === "cli" ? "cli.name" : "popup.apiLabel",uiLanguage,{count:currentSettings.apiConcurrency});
    $("provider-hint").textContent = ui.t(currentSettings.provider === "cli" ? "cli.description" : "popup.apiHint",uiLanguage);
    $("toggle").textContent = ui.t(loaded ? (reason ? (currentSettings.provider === "cli" ? "cli.setup" : "popup.addKey") : currentSettings.enabled ? "common.pause" : "common.resume") : "common.loading",uiLanguage);
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
    const result = await chrome.runtime.sendMessage({type:"OPEN_SETTINGS",focus:"api-key"});
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
    if (blockedReason()) { busy = true;errorMessage = null;render();try { await openKeySettings(); } catch (error) { showError("errors.operation",error.message); } finally { busy = false;render(); }return; }
    busy = true;errorMessage = null;render();
    try {
      const latest = await chrome.runtime.sendMessage({type:"GET_CONFIG"});
      if (!latest?.ok) throw new Error(ui.t("errors.noResponse",uiLanguage));
      config = latest;
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
  });
  chrome.storage.onChanged.addListener((changes,area) => {
    if (area === "session" && (changes.apiKey || changes.securityFault) || area === "local" && (changes.apiKeyVault || changes.rememberApiKey || changes.apiKey)) {
      if (!busy) { busy = true;load(); }
      return;
    }
    if (area !== "local") return;
    if (changes.settings && !busy) currentSettings = core.normalizeSettings(changes.settings.newValue);
    if (changes.uiLanguage) { localeRevision++;observedUILanguage = ui.normalizeLanguage(changes.uiLanguage.newValue); }
    uiLanguage = ui.resolveLanguage(currentSettings.interfaceLanguage,observedUILanguage);
    render();
  });
  render();load();
})();
