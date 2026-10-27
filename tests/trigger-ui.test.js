'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Core=require('../extension/feed-core.js'),UI=require('../extension/ui-i18n.js');

function popupFixture({provider='oauth',ready=false,mode='automatic',failure=false,language='en',customTriggers}={}){
  const elements=new Map(),storageListeners=[],runtimeListeners=[],messages=[];
  const html=fs.readFileSync(path.join(__dirname,'../extension/popup.html'),'utf8');
  for(const match of html.matchAll(/<[a-z][^>]*\bid="([^"]+)"[^>]*>/g))elements.set(match[1],{checked:false,disabled:false,hidden:false,dataset:{},textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}});
  const document={documentElement:{},getElementById:id=>elements.get(id),querySelectorAll:()=>[]};
  let settings=Core.normalizeSettings({...Core.DEFAULT_SETTINGS,provider,triggerMode:mode,customTriggers:customTriggers||{...Core.DEFAULT_SETTINGS.customTriggers,postHover:true,postHoverMs:2700},language:'ja'});
  const config=()=>({ok:true,settings,ready,keyState:'missing',oauthStatus:{state:'disconnected',connected:false},buildStatus:{errorCode:'BUILD_NOT_CONNECTED'}});
  const chrome={runtime:{onMessage:{addListener:fn=>runtimeListeners.push(fn)},async sendMessage(message){
    messages.push(message);
    if(message.type==='GET_UI_LANGUAGE')return {ok:true,language};
    if(message.type==='GET_CONFIG')return config();
    if(message.type==='SET_TRIGGER_PREFERENCES'){
      if(failure)return {ok:false,error:'Fixture save failed'};
      settings=Core.normalizeSettings({...settings,triggerMode:message.triggerMode});return {ok:true,settings};
    }
    if(['OPEN_SETTINGS','OPEN_HISTORY'].includes(message.type))return {ok:true};
    throw Error('Unexpected message '+message.type);
  }},storage:{local:{async get(){return {uiLanguage:language};}},onChanged:{addListener:fn=>storageListeners.push(fn)}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../extension/popup.js'),'utf8'),{XGrokCore:Core,GrokFirstUI:UI,document,chrome,navigator:{language},console});
  return {elements,messages,document,settings:()=>settings,emitConfig(value){settings=Core.normalizeSettings({...settings,...value});runtimeListeners.forEach(fn=>fn({...config(),type:'CONFIG'}));},choose(mode){for(const name of ['automatic','custom','paused'])elements.get('trigger-mode-'+name).checked=name===mode;elements.get('trigger-mode-'+mode).listeners.change();}};
}
const settle=async()=>{for(let i=0;i<3;i++)await new Promise(resolve=>setImmediate(resolve));};

test('all providers can pause from the popup without a working login or replacing settings',async()=>{
  for(const provider of ['api','oauth','build']){
    const p=popupFixture({provider});await settle();p.choose('paused');await settle();
    assert.equal(p.settings().triggerMode,'paused');assert.equal(p.settings().enabled,false);
    assert.deepEqual(JSON.parse(JSON.stringify(p.messages.filter(m=>m.type==='SET_TRIGGER_PREFERENCES'))),[{type:'SET_TRIGGER_PREFERENCES',triggerMode:'paused'}]);
    assert.equal(p.messages.some(m=>m.type==='SAVE_SETTINGS'||m.type==='OPEN_SETTINGS'),false);
    assert.equal(p.elements.get('options').hidden,false);assert.equal(p.elements.get('trigger-mode-paused').checked,true);
    assert.equal(p.elements.get('enabled-label').textContent,UI.t('trigger.pausedStatus','en'));
    assert.equal(p.elements.get('provider-hint').textContent,UI.t('trigger.pausedHelp','en'));
    assert.equal(p.settings().customTriggers.postHoverMs,2700);assert.equal(p.settings().language,'ja');
  }
});

test('popup switches retain custom choices and follow an external mode update',async()=>{
  const p=popupFixture({ready:true});await settle();p.choose('custom');await settle();
  assert.equal(p.settings().triggerMode,'custom');assert.equal(p.settings().customTriggers.postHover,true);
  assert.equal(p.elements.get('enabled-label').textContent,UI.t('trigger.customStatus','en'));
  assert.equal(p.elements.get('provider-hint').hidden,true);
  assert.equal(p.elements.get('provider-hint').textContent,'');
  p.emitConfig({triggerMode:'paused'});assert.equal(p.elements.get('trigger-mode-paused').checked,true);
  assert.equal(p.elements.get('provider-hint').hidden,false);
  assert.equal(p.elements.get('provider-hint').textContent,UI.t('trigger.pausedHelp','en'));
  p.choose('automatic');await settle();assert.equal(p.settings().triggerMode,'automatic');
  assert.equal(p.elements.get('provider-hint').hidden,false);
  assert.equal(p.elements.get('provider-hint').textContent,UI.t('popup.oauthHint','en'));
  assert.equal(p.settings().customTriggers.postHoverMs,2700);
});

test('a failed popup mode save restores the prior selected state and exposes the error',async()=>{
  const p=popupFixture({ready:true,failure:true});await settle();p.choose('custom');await settle();
  assert.equal(p.elements.get('trigger-mode-automatic').checked,true);assert.equal(p.elements.get('trigger-mode-custom').checked,false);
  assert.match(p.elements.get('status').textContent,/Fixture save failed/);
  assert.equal(p.elements.get('trigger-mode-paused').disabled,false);
});

test('every supported language has the complete trigger settings and interaction vocabulary',()=>{
  const keys=Object.keys(UI.catalog.en).filter(key=>key.startsWith('trigger.'));
  assert.equal(keys.length,32);
  for(const language of UI.SUPPORTED_LANGUAGES)for(const key of keys){assert.ok(Object.hasOwn(UI.catalog[language],key),language+': '+key);assert.ok(UI.t(key,language).trim());assert.notEqual(UI.t(key,language),key);}
  assert.equal(UI.t('trigger.paused','en'),'Pause');
  assert.equal(UI.t('trigger.pausedStatus','en'),'Post fact-checking paused');
});

test('custom popup summary shows defaults without changing saved trigger conditions',async()=>{
  const p=popupFixture({mode:'custom',customTriggers:Core.DEFAULT_CUSTOM_TRIGGERS});await settle();
  assert.equal(p.elements.get('custom-trigger-summary').hidden,false);
  const expected={manual:['on','popup.triggerOn'], 'post-hover':['on','popup.triggerSeconds'],
    'button-hover':['on','popup.triggerSeconds'], 'detail-main':['on','popup.triggerOn'], 'detail-replies':['off','popup.triggerOff']};
  for(const [id,[state,key]] of Object.entries(expected)){
    const element=p.elements.get('summary-trigger-'+id);
    assert.equal(element.dataset.state,state,id);assert.equal(element.textContent,UI.t(key,'en',{seconds:'1'}),id);
  }
  assert.equal(p.messages.some(message=>message.type==='SET_TRIGGER_PREFERENCES'||message.type==='SAVE_SETTINGS'),false);
});

test('custom popup summary preserves a saved whole-post hover opt-out',async()=>{
  const p=popupFixture({mode:'custom',customTriggers:{postHover:false,postHoverMs:2500}});await settle();
  const element=p.elements.get('summary-trigger-post-hover');
  assert.equal(element.dataset.state,'off');
  assert.equal(element.textContent,UI.t('popup.triggerSecondsOff','en',{seconds:'2.5'}));
  p.choose('automatic');await settle();p.choose('custom');await settle();
  assert.equal(p.settings().customTriggers.postHover,false);
  assert.equal(p.settings().customTriggers.postHoverMs,2500);
  assert.equal(element.dataset.state,'off');
  assert.equal(p.messages.some(message=>message.type==='SAVE_SETTINGS'),false);
});

test('custom popup summary follows saved values, dependency and external updates',async()=>{
  const p=popupFixture({mode:'custom',language:'zh-CN',customTriggers:{...Core.DEFAULT_CUSTOM_TRIGGERS,manual:false,postHover:true,postHoverMs:2700,buttonHoverMs:650}});await settle();
  assert.equal(p.elements.get('summary-trigger-post-hover').textContent,UI.t('popup.triggerSeconds','zh-CN',{seconds:'2.7'}));
  assert.equal(p.elements.get('summary-trigger-button-hover').dataset.state,'unavailable');
  assert.equal(p.elements.get('summary-trigger-button-hover').textContent,UI.t('popup.triggerUnavailable','zh-CN',{seconds:'0.65'}));
  p.emitConfig({customTriggers:{...p.settings().customTriggers,manual:true,detailReplies:true,buttonHoverMs:1500}});
  assert.equal(p.elements.get('summary-trigger-button-hover').textContent,UI.t('popup.triggerSeconds','zh-CN',{seconds:'1.5'}));
  assert.equal(p.elements.get('summary-trigger-detail-replies').dataset.state,'on');
  p.emitConfig({triggerMode:'paused'});assert.equal(p.elements.get('custom-trigger-summary').hidden,true);
  p.emitConfig({triggerMode:'automatic'});assert.equal(p.elements.get('custom-trigger-summary').hidden,true);
  p.choose('custom');await settle();assert.equal(p.elements.get('custom-trigger-summary').hidden,false);
  assert.equal(p.elements.get('summary-trigger-button-hover').textContent,UI.t('popup.triggerSeconds','zh-CN',{seconds:'1.5'}));
});

test('every supported language translates the compact popup summary',()=>{
  const keys=Object.keys(UI.catalog.en).filter(key=>key.startsWith('popup.trigger'));
  assert.equal(keys.length,12);
  for(const language of UI.SUPPORTED_LANGUAGES)for(const key of keys){
    assert.ok(Object.hasOwn(UI.catalog[language],key),language+': '+key);
    const value=UI.t(key,language,{seconds:'1.5'});assert.notEqual(value,key);assert.ok(value.trim());assert.doesNotMatch(value,/\{seconds\}/);
  }
});
