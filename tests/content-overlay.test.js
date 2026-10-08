'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const core = require('../extension/feed-core.js');
// This suite exercises API behavior; CLI defaults are covered in cli.test.cjs.
const API_SETTINGS = {...core.DEFAULT_SETTINGS, provider:'api'};
const layout = require('../extension/overlay-layout.js');
const ui = require('../extension/ui-i18n.js');

test('failed history writes retry with bounded backoff without repeating paid analysis',()=>{
  const page=fixture({postCount:1,historyAck:false});page.configure();
  const first=page.port.sent.find(message=>message.type==='HISTORY_VISIT');assert.ok(first);
  page.port.onMessage.emit({type:'HISTORY_ACK',batchId:first.batchId,ok:false,epoch:0});page.flush();page.tick(4999);
  assert.equal(page.port.sent.filter(message=>message.type==='HISTORY_VISIT').length,1);
  page.tick(1);assert.equal(page.port.sent.filter(message=>message.type==='HISTORY_VISIT').length,2);
  const retry=page.port.sent.filter(message=>message.type==='HISTORY_VISIT')[1];
  page.port.onMessage.emit({type:'HISTORY_ACK',batchId:retry.batchId,ok:true,epoch:0});page.tick(60000);
  assert.equal(page.port.sent.filter(message=>message.type==='HISTORY_VISIT').length,2);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);
});

test('missing history acknowledgements and old epochs cannot create a rapid retry loop or undo a clear',()=>{
  const page=fixture({postCount:1,historyAck:false});page.configure();
  const first=page.port.sent.find(message=>message.type==='HISTORY_VISIT');page.tick(10000);
  assert.equal(page.port.sent.filter(message=>message.type==='HISTORY_VISIT').length,1);
  page.tick(5000);assert.equal(page.port.sent.filter(message=>message.type==='HISTORY_VISIT').length,2);
  page.port.onMessage.emit({type:'HISTORY_CONFIG',enabled:true,epoch:1});
  page.port.onMessage.emit({type:'HISTORY_ACK',batchId:first.batchId,ok:false,epoch:1});page.tick(60000);
  assert.equal(page.port.sent.filter(message=>message.type==='HISTORY_VISIT').length,2);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);
});

test('changing a visible post between original and translation updates its saved snapshot',()=>{
  const page=fixture({postCount:1});page.articles[0].postData.language='en';page.configure({language:'ja'});
  page.articles[0].postData={...page.articles[0].postData,text:'当前显示的中文翻译',language:'zh-CN'};
  page.mutate();page.intersect();page.tick();
  const visits=page.port.sent.filter(message=>message.type==='HISTORY_VISIT');assert.equal(visits.length,2);
  assert.equal(visits[1].posts[0].text,'当前显示的中文翻译');assert.equal(visits[1].posts[0].language,'zh-CN');
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1,'A history snapshot update never resends an unchanged fixed-language analysis');
});

test('history records every visible post before paid analysis and needs no available Key',()=>{
  const page=fixture({postCount:3});
  page.port.onMessage.emit({type:'CONFIG',settings:API_SETTINGS,ready:false,historyEnabled:true,historyEpoch:4});
  page.flush();page.intersect();page.tick();
  const visits=page.port.sent.filter(message=>message.type==='HISTORY_VISIT');
  assert.equal(visits.length,1);assert.equal(visits[0].historyEpoch,4);
  assert.deepEqual(Array.from(visits[0].posts,post=>post.id),['100','101','102']);
  assert.equal(page.port.sent.some(message=>message.type==='ANALYZE'),false);
  page.tick(60000);page.tick();assert.equal(page.port.sent.filter(message=>message.type==='HISTORY_VISIT').length,1,'Stationary posts do not continuously refresh their 24 hour retention');
});

test('history records when the rail is collapsed and a later re-entry creates another visit',()=>{
  const page=fixture({postCount:1});
  page.port.onMessage.emit({type:'CONFIG',settings:API_SETTINGS,ready:false,collapsed:true,historyEnabled:true,historyEpoch:0});
  page.flush();page.intersect();page.tick();
  assert.equal(page.port.sent.filter(message=>message.type==='HISTORY_VISIT').length,1);
  page.scroll(1000);page.tick();page.scroll(-1000);page.tick();
  assert.equal(page.port.sent.filter(message=>message.type==='HISTORY_VISIT').length,2);
  assert.equal(page.port.sent.some(message=>message.type==='ANALYZE'),false);
});

test('clearing history invalidates old batches without immediately re-recording unchanged visible posts',()=>{
  const page=fixture({postCount:2});page.articles[1].rect={...page.articles[1].rect,top:1200,bottom:1480};
  page.port.onMessage.emit({type:'CONFIG',settings:API_SETTINGS,ready:false,historyEnabled:true,historyEpoch:0});
  page.flush();page.intersect();page.tick();
  assert.equal(page.port.sent.filter(message=>message.type==='HISTORY_VISIT').length,1);
  page.port.onMessage.emit({type:'HISTORY_CONFIG',enabled:true,epoch:1});page.flush();page.tick();
  assert.equal(page.port.sent.filter(message=>message.type==='HISTORY_VISIT').length,1);
  page.articles[1].rect={...page.articles[1].rect,top:400,bottom:680};page.intersect();page.tick();
  const visit=page.port.sent.filter(message=>message.type==='HISTORY_VISIT')[1];
  assert.equal(visit.historyEpoch,1);assert.deepEqual(Array.from(visit.posts,post=>post.id),['101']);
});

test('turning off history does not prevent analysis and hidden tabs never record new visits',()=>{
  const page=fixture({postCount:1});
  page.port.onMessage.emit({type:'CONFIG',settings:API_SETTINGS,ready:true,historyEnabled:false,historyEpoch:0});
  page.flush();page.intersect();page.tick();
  assert.equal(page.port.sent.some(message=>message.type==='HISTORY_VISIT'),false);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);
  page.document.hidden=true;page.document.emit('visibilitychange');
  page.port.onMessage.emit({type:'HISTORY_CONFIG',enabled:true,epoch:1});page.flush();page.tick();
  assert.equal(page.port.sent.some(message=>message.type==='HISTORY_VISIT'),false);
  page.document.hidden=false;page.document.emit('visibilitychange');page.flush();page.tick();
  assert.equal(page.port.sent.filter(message=>message.type==='HISTORY_VISIT').length,1);
});

test('the rail history icon opens local history independently of analysis readiness',async()=>{
  const page=fixture({postCount:1});
  page.port.onMessage.emit({type:'CONFIG',settings:API_SETTINGS,ready:false,historyEnabled:true,historyEpoch:0});page.flush();
  const button=page.nodes.find(node=>node.className==='rail-history');assert.ok(button);
  assert.equal(button.getAttribute('aria-label'),ui.t('common.history','zh-CN'));
  button.emit('click');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(page.runtimeMessages.some(message=>message.type==='OPEN_HISTORY'),true);
  assert.equal(page.port.sent.some(message=>['ANALYZE','GENERATE_COMMENTS'].includes(message.type)),false);
});

// The fake DOM records writes to the actual X nodes while giving the extension
// its own shadow roots. Geometry arithmetic is covered by overlay-layout.test.
function fixture({postCount=2,connectError=null,historyAck=true}={}) {
  const writes = [], nodes = [], timeouts = new Map(), frames = new Map(), intervals = [];
  const intersectionObservers = [], mutationObservers = [], resizeObservers = [];
  const copied=[];let copyFailure=false;
  let nextTimer = 0, now = 1800000000000, postExtractions = 0;
  const events = () => {
    const listeners = new Map();
    return {
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
      removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter(item => item !== fn)); },
      emit(type, detail = {}) { for (const fn of listeners.get(type) || []) fn({ type, target:this, stopPropagation(){}, preventDefault(){}, ...detail }); }
    };
  };
  const record = (node, operation) => { if (node.original) writes.push(`${node.label || node.tagName}: ${operation}`); };
  class Element {
    constructor(tag, label) {
      this.tagName = tag.toUpperCase(); this.label = label; this.original = false;
      this.childNodes = []; this.parentNode = null; this.attributes = new Map();
      this._text = ''; this._hidden = false; this.rect = { top: 0, bottom: 180, left: 0, right: 320, width: 320, height: 180 };
      Object.assign(this, events());
      const values = Object.create(null);
      this.style = new Proxy({
        setProperty: (key, value) => { record(this, `style.${key}`); values[key] = String(value); },
        removeProperty: key => { record(this, `style.${key}`); delete values[key]; },
        getPropertyValue: key => values[key] || ''
      }, {
        get(target, key) { return key in target ? target[key] : values[key] || ''; },
        set: (target, key, value) => { record(this, `style.${String(key)}`); values[key] = String(value); return true; }
      });
      this.classList = {
        add: (...names) => this.className = [...new Set([...this.className.split(/\s+/), ...names])].filter(Boolean).join(' '),
        remove: (...names) => this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '),
        contains: name => this.className.split(/\s+/).includes(name),
        toggle: (name, force) => { const add = force === undefined ? !this.classList.contains(name) : force; add ? this.classList.add(name) : this.classList.remove(name); return add; }
      };
      this.dataset = new Proxy({}, {
        get: (_, name) => this.getAttribute(`data-${String(name).replace(/[A-Z]/g, value => `-${value.toLowerCase()}`)}`),
        set: (_, name, value) => { this.setAttribute(`data-${String(name).replace(/[A-Z]/g, value => `-${value.toLowerCase()}`)}`, value); return true; }
      });
      nodes.push(this);
    }
    get children() { return this.childNodes.filter(node => node instanceof Element); }
    get parentElement() { return this.parentNode instanceof Element ? this.parentNode : null; }
    get isConnected() { return this === document.body || this === document.head || Boolean(this.parentNode?.isConnected || this.host?.isConnected); }
    get className() { return this.attributes.get('class') || ''; }
    set className(value) { this.setAttribute('class', value); }
    get id() { return this.attributes.get('id') || ''; }
    set id(value) { this.setAttribute('id', value); }
    get lang() { return this.getAttribute('lang') || ''; }
    set lang(value) { this.setAttribute('lang',value); }
    get hidden() { return this._hidden; }
    set hidden(value) { record(this, 'hidden'); this._hidden = Boolean(value); }
    get textContent() { return this._text + this.childNodes.map(node => node.textContent || '').join(''); }
    set textContent(value) { record(this, 'textContent'); this._text = String(value); this.childNodes = []; }
    get scrollHeight() { return 180; }
    get offsetHeight() { return Number.parseFloat(this.style.height) || 180; }
    get offsetWidth() { return Number.parseFloat(this.style.width) || 320; }
    get clientHeight() { return this.offsetHeight; }
    get clientWidth() { return this.offsetWidth; }
    setAttribute(name, value) { record(this, `attribute ${name}`); this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { record(this, `remove attribute ${name}`); this.attributes.delete(name); }
    toggleAttribute(name, force) { const add = force ?? !this.hasAttribute(name); add ? this.setAttribute(name, '') : this.removeAttribute(name); return add; }
    append(...children) {
      record(this, 'append');
      for (let child of children) {
        if (typeof child === 'string') child = { textContent: child, parentNode: null };
        if (child.parentNode) child.remove();
        child.parentNode = this; this.childNodes.push(child);
      }
    }
    appendChild(child) { this.append(child); return child; }
    prepend(...children) { record(this, 'prepend'); for (const child of [...children].reverse()) { if (child.parentNode) child.remove(); child.parentNode = this; this.childNodes.unshift(child); } }
    replaceChildren(...children) { record(this, 'replaceChildren'); for (const child of this.childNodes) child.parentNode = null; this.childNodes = []; this._text = ''; this.append(...children); }
    remove() { if (this.parentNode) { record(this.parentNode, 'removeChild'); this.parentNode.childNodes = this.parentNode.childNodes.filter(node => node !== this); this.parentNode = null; } }
    attachShadow() { record(this, 'attachShadow'); const shadow = new Element('#shadow-root'); shadow.host = this; this.testShadow = shadow; return shadow; }
    contains(node) { return node === this || this.childNodes.some(child => child.contains?.(node)) || this.testShadow?.contains(node) || false; }
    getBoundingClientRect() {
      if (this.original) return { ...this.rect };
      const left = Number.parseFloat(this.style.left) || 0, top = Number.parseFloat(this.style.top) || 0;
      const width = this.offsetWidth, height = this.offsetHeight;
      return { left, top, width, height, right: left + width, bottom: top + height };
    }
    querySelectorAll(selector) { return descendants(this).filter(node => matches(node, selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    matches(selector) { return matches(this, selector); }
    closest(selector) { let current = this; while (current) { if (current.matches?.(selector)) return current; current = current.parentElement; } return null; }
  }
  function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }
  function matches(node, selector) {
    if(selector.includes(','))return selector.split(',').some(part=>matches(node,part.trim()));
    if (selector === 'article[data-testid="tweet"]') return node.tagName === 'ARTICLE' && node.getAttribute('data-testid') === 'tweet';
    const testId = selector.match(/^\[data-testid=["']([^"']+)["']\]$/)?.[1];
    if (testId) return node.getAttribute('data-testid') === testId;
    if (selector.startsWith('#')) return node.id === selector.slice(1);
    if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
    return node.tagName.toLowerCase() === selector;
  }
  const document = { ...events(), hidden: false, visibilityState: 'visible' };
  document.body = new Element('body', 'body'); document.head = new Element('head', 'head');
  document.documentElement = new Element('html', 'html');
  document.documentElement.append(document.head,document.body);
  document.documentElement.lang='zh-CN';
  document.createElement = tag => new Element(tag);
  document.createElementNS = (_namespace, tag) => new Element(tag);
  document.createTextNode = text => ({ textContent: text, parentNode: null,
    remove() {if(this.parentNode){this.parentNode.childNodes=this.parentNode.childNodes.filter(child=>child!==this);this.parentNode=null;}}
  });
  document.querySelectorAll = selector => [...document.body.querySelectorAll(selector), ...document.head.querySelectorAll(selector)];
  document.querySelector = selector => document.querySelectorAll(selector)[0] || null;
  document.getElementById = id => document.querySelector(`#${id}`);
  const navigation = new Element('header', 'left navigation');
  const primary = new Element('div', 'center feed'); primary.setAttribute('data-testid', 'primaryColumn');
  primary.rect = {left:270,right:870,top:0,bottom:960,width:600,height:960};
  const sidebar = new Element('aside', 'right sidebar'); sidebar.setAttribute('data-testid', 'sidebarColumn');
  sidebar.rect = {left:900,right:1250,top:0,bottom:960,width:350,height:960};
  document.body.append(navigation, primary, sidebar);
  const articles = Array.from({length:postCount},(_,index)=>index).map(index => {
    const article = new Element('article', `post ${index + 1}`); article.setAttribute('data-testid', 'tweet');
    article.rect = { left: 270, right: 870, top: 90 + index * 280, bottom: 370 + index * 280, width: 600, height: 280 };
    article.postData = { id: String(100 + index), url: `https://x.com/test/status/${100 + index}`, text: `Original post ${index}`, author: '@test', images: [], quotedContext: '' };
    article.append(new Element('div', `post ${index + 1} body`)); primary.append(article); return article;
  });
  const originals = [navigation, primary, sidebar, ...articles, ...articles.flatMap(article => article.children)];
  for (const node of originals) node.original = true;
  // Appending the extension's own top-level root is permitted; other writes to
  // the page's body/head are tracked explicitly below.
  const bodyClass = document.body.classList;
  for (const name of ['add', 'remove', 'toggle']) document.body.classList[name] = (...args) => { writes.push(`body: classList.${name}`); return bodyClass === document.body.classList ? undefined : bodyClass[name](...args); };
  const runtimeEvent = () => { const listeners = []; return { addListener(fn) { listeners.push(fn); }, emit(message) { for (const fn of listeners) fn(message); } }; };
  let connectFailure=connectError,sendFailure=null,runtimeFailure=null,connectAttempts=0,reloads=0;
  const makePort=()=>({ onMessage: runtimeEvent(), onDisconnect: runtimeEvent(), sent: [], postMessage(message) { if(sendFailure)throw sendFailure;this.sent.push(message);if(historyAck&&message.type==='HISTORY_VISIT')this.onMessage.emit({type:'HISTORY_ACK',batchId:message.batchId,ok:true,epoch:message.historyEpoch}); }, disconnect() {} });
  let port=makePort();
  const runtimeMessages=[],nativeHooks={install:0,run:0,messageListeners:0};
  const window = events();
  const location = { hash: '', pathname: '/home', href: 'https://x.com/home',reload(){reloads++;} };
  class ClockDate extends Date { static now() { return now; } }
  const context = vm.createContext({
    document, window, location, URL, URLSearchParams, AbortController, crypto, Date: ClockDate,
    innerWidth: 1440, innerHeight: 960,
    XGrokCore: { ...core, DEFAULT_SETTINGS:API_SETTINGS, extractPost: article => {postExtractions++;return article.postData ? ({ ...article.postData }) : null;} }, GrokFirstOverlayLayout: layout,
    chrome: { runtime: { id: 'test-extension', connect: () => {connectAttempts++;if(connectFailure)throw connectFailure;return port;}, getURL: asset => `chrome-extension://test-extension/${asset}`,
      onMessage:{addListener(){nativeHooks.messageListeners++;}},
      async sendMessage(message){runtimeMessages.push(message);if(runtimeFailure)throw runtimeFailure;return {ok:true};}
    } },
    navigator:{language:'zh-CN',languages:['zh-CN'],clipboard:{async writeText(value){if(copyFailure)throw new Error('Clipboard unavailable');copied.push(value);}}},
    // Obsolete globals may survive on an existing page after an upgrade. They
    // are traps only: the API-only content script must never call either one.
    GrokFirstFeedNative:{install(){nativeHooks.install++;throw new Error('Native bridge must not install');}},
    XGrokNative:{run(){nativeHooks.run++;throw new Error('Native generation must not run');}},
    getComputedStyle: element => ({ position: 'static', display: 'block', overflow: 'visible', width: `${element.rect.width}px`,backgroundColor:'rgba(0, 0, 0, 0)',...element.computed }),
    setTimeout(fn, delay) { const id = ++nextTimer; timeouts.set(id, { fn, delay }); return id; }, clearTimeout: id => timeouts.delete(id),
    setInterval(fn, delay) { intervals.push({ fn, delay }); return intervals.length; }, clearInterval() {},
    requestAnimationFrame(fn) { const id = ++nextTimer; frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id),
    IntersectionObserver: class { constructor(callback) { this.callback = callback; this.observed = new Set(); intersectionObservers.push(this); } observe(node) { this.observed.add(node); } unobserve(node) { this.observed.delete(node); } disconnect() { this.observed.clear(); } },
    MutationObserver: class { constructor(callback) { this.callback = callback;this.observations=[];mutationObservers.push(this); } observe(target,options) {this.observations.push({target,options});} disconnect() {this.observations=[];} },
    ResizeObserver: class { constructor(callback) { this.callback = callback; this.observed = new Set(); resizeObservers.push(this); } observe(node) { this.observed.add(node); } unobserve(node) { this.observed.delete(node); } disconnect() { this.observed.clear(); } }
  });
  window.visualViewport = { ...events(), width: 1440, height: 960, offsetLeft: 0, offsetTop: 0 };
  Object.defineProperty(document.documentElement, 'clientWidth', { get: () => context.innerWidth });
  Object.defineProperty(document.documentElement, 'clientHeight', { get: () => context.innerHeight });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension/ui-i18n.js'), 'utf8'), context, { filename: 'ui-i18n.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension/marked.umd.js'), 'utf8'), context, { filename: 'marked.umd.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension/markdown-renderer.js'), 'utf8'), context, { filename: 'markdown-renderer.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension/content.js'), 'utf8'), context, { filename: 'content.js' });
  const harness = {
    context, document, window, location, get port(){return port;}, nodes, writes, originals, articles, primary, sidebar, runtimeMessages,nativeHooks,copied,
    failClipboard(value=true){copyFailure=value;},
    failConnect(error){connectFailure=error;},
    failPortSend(error){sendFailure=error;},
    failRuntimeSend(error){runtimeFailure=error;},
    connectionAttempts(){return connectAttempts;},
    reloadCount(){return reloads;},
    replacePort(){const previous=port;port=makePort();return previous;},
    runTimeouts(maxDelay=3000){for(const [id,timer] of [...timeouts])if(timer.delay<=maxDelay){timeouts.delete(id);timer.fn();}harness.flush();},
    pendingTimeouts(){return [...timeouts.values()].map(timer=>timer.delay);},
    configure(overrides = {}) { port.onMessage.emit({ type: 'CONFIG', settings: { ...API_SETTINGS, provider: 'api', dwellMs: 300, ...overrides }, ready: true, used: 0 }); harness.flush(); },
    flush() {
      for (let pass = 0; pass < 8; pass++) {
        const timers = [...timeouts].filter(([, timer]) => timer.delay <= 160); const pendingFrames = [...frames];
        if (!timers.length && !pendingFrames.length) break;
        for (const [id, timer] of timers) { timeouts.delete(id); timer.fn(); }
        for (const [id, fn] of pendingFrames) { frames.delete(id); fn(now); }
      }
    },
    mutationObservers,resizeObservers,
    extractionCount() {return postExtractions;},
    mutate(records=[{type:'childList',target:primary}]) {
      for(const observer of mutationObservers) {
        const observed=records.filter(change=>observer.observations.some(({target,options})=>
          (target===change.target||(options.subtree&&target.contains(change.target)))&&
          (change.type==='attributes'?options.attributes&&(!options.attributeFilter||options.attributeFilter.includes(change.attributeName)):
            change.type==='characterData'?options.characterData:options.childList)));
        if(observed.length)observer.callback(observed);
      }
      harness.flush();
    },
    intersect() { for (const observer of intersectionObservers) observer.callback(articles.filter(article => article.isConnected).map(target => ({ target, isIntersecting: true }))); harness.flush(); },
    tick(ms = 0) { now += ms; for (const interval of intervals) if (interval.delay === 100) interval.fn(); harness.flush(); },
    scroll(delta) { for (const article of articles) { article.rect.top -= delta; article.rect.bottom -= delta; } window.emit('scroll'); document.emit('scroll'); harness.flush(); },
    resize(width) { context.innerWidth = width; window.visualViewport.width = width; window.emit('resize'); for (const observer of resizeObservers) observer.callback([]); harness.flush(); },
    cards() { return nodes.filter(node => node.tagName === 'GROK-FIRST-CARD' && node.isConnected); },
    displayedCards() { return harness.cards().filter(node => { let cursor = node; while (cursor) { if (cursor.hidden) return false; cursor = cursor.parentNode || cursor.host; } return true; }); },
    clearWrites() { writes.length = 0; }
  };
  return harness;
}

function railLines(page) {
  const layer=page.nodes.find(node=>node.className==='rail-separators');
  assert.ok(layer,'The rail owns an independent separator layer');
  return layer.children.map(line=>({
    top:Number.parseFloat(layer.style.top)+Number.parseFloat(line.style.top),
    thickness:Number.parseFloat(line.style.height),color:line.style.background
  }));
}
function assertRailLine(page,top,thickness,color) {
  const line=railLines(page).find(line=>Math.abs(line.top-top)<1e-7);
  assert.ok(line,`A rail line must match native y=${top}`);
  assert.ok(Math.abs(line.thickness-thickness)<1e-7,'Preserve native fractional border thickness');
  if(color)assert.equal(line.color,color);
  return line;
}

test('visible posts show Key guidance before credentials are ready without sending analysis', () => {
  const page=fixture();page.flush();page.intersect();page.tick(2000);
  assert.ok(page.extractionCount()>0);assert.equal(page.cards().length,2);
  assert.ok(page.cards().every(card=>card.testShadow.querySelector('.status').textContent===ui.t('status.needsKey','zh-CN')));
  assert.equal(page.port.sent.filter(message=>['ANALYZE','GENERATE_COMMENTS'].includes(message.type)).length,0);
  page.configure();page.tick();assert.ok(page.port.sent.some(message=>message.type==='ANALYZE'));
});

test('missing Key guidance opens Settings at the Key field without offering unusable generation actions',async()=>{
  const page=fixture();page.flush();page.intersect();page.tick(2000);
  const card=page.cards()[0],settings=card.testShadow.querySelector('.status-settings');
  assert.ok(settings,'The Settings word in onboarding is an interactive control');
  assert.equal(settings.tagName,'BUTTON');assert.equal(settings.type,'button');
  assert.equal(settings.textContent,ui.t('common.settings','zh-CN'));
  assert.equal(card.testShadow.querySelector('.generate-comments').hidden,true);
  assert.equal(card.testShadow.querySelector('.retry').hidden,true);
  assert.equal(card.testShadow.querySelector('.retry').disabled,true);
  settings.emit('click');card.testShadow.querySelector('.generate-comments').emit('click');card.testShadow.querySelector('.retry').emit('click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(page.runtimeMessages.filter(message=>message.type==='OPEN_SETTINGS'))),[{type:'OPEN_SETTINGS',focus:'api-key'}]);
  assert.equal(page.port.sent.some(message=>message.type==='OPEN_SETTINGS'),false);
  assert.equal(page.port.sent.some(message=>['ANALYZE','GENERATE_COMMENTS'].includes(message.type)),false);
  assert.deepEqual(page.writes,[]);
});

test('Settings onboarding follows X locale and always opens at the API Key without forcing password focus',async()=>{
  const page=fixture();page.flush();
  for(const language of ui.SUPPORTED_LANGUAGES||['en','zh-CN','zh-TW','ja','ko','es','fr','de','pt','ar','ru','hi']) {
    page.document.documentElement.lang=language;
    page.mutate([{type:'attributes',attributeName:'lang',target:page.document.documentElement}]);
    const status=page.cards()[0].testShadow.querySelector('.status'),button=status.querySelector('.status-settings');
    assert.ok(button,language);assert.equal(button.textContent,ui.t('common.settings',language));
    assert.equal(status.textContent,ui.t('status.needsKeyAction',language,{settings:ui.t('common.settings',language)}));
    assert.doesNotMatch(status.textContent,/\uFFFC|status\.needsKeyAction/);
  }
  page.port.onMessage.emit({type:'CONFIG',settings:API_SETTINGS,ready:false,keyState:'missing'});page.flush();
  const card=page.cards()[0],button=card.testShadow.querySelector('.status-settings');
  assert.equal(card.testShadow.querySelector('.status').textContent,ui.t('status.needsKeyAction','hi',{settings:ui.t('common.settings','hi')}));
  button.emit('click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(page.runtimeMessages.findLast(message=>message.type==='OPEN_SETTINGS'))),{type:'OPEN_SETTINGS',focus:'api-key'});
  assert.equal(card.testShadow.querySelector('.generate-comments').hidden,true);
  const count=page.port.sent.filter(message=>message.type==='ANALYZE').length;
  page.configure();page.tick();assert.ok(page.port.sent.filter(message=>message.type==='ANALYZE').length>count);
  assert.equal(card.testShadow.querySelector('.status-settings'),null);
  assert.equal(card.testShadow.querySelector('.generate-comments').hidden,false);
  assert.deepEqual(page.writes,[]);
});

test('a credential error arriving before CONFIG offers recovery and blocks stale paid actions',async()=>{
  const page=fixture({postCount:1});page.configure();
  const request=page.port.sent.find(message=>message.type==='ANALYZE');assert.ok(request);
  page.port.onMessage.emit({type:'ERROR',requestId:request.requestId,code:'NEEDS_KEY',error:'Key required'});page.flush();
  const card=page.cards()[0],settings=card.testShadow.querySelector('.status-settings');assert.ok(settings);
  assert.equal(card.testShadow.querySelector('.generate-comments').hidden,true);
  assert.equal(card.testShadow.querySelector('.retry').hidden,true);
  card.testShadow.querySelector('.generate-comments').emit('click');card.testShadow.querySelector('.retry').emit('click');page.tick(2000);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);
  assert.equal(page.port.sent.some(message=>message.type==='GENERATE_COMMENTS'),false);
  settings.emit('click');await new Promise(resolve=>setImmediate(resolve));assert.equal(page.runtimeMessages.findLast(message=>message.type==='OPEN_SETTINGS').focus,'api-key');
  assert.deepEqual(page.writes,[]);
});

test('a legacy consent flag does not block a ready personal API Key',()=>{
  const page=fixture();
  page.port.onMessage.emit({type:'CONFIG',settings:API_SETTINGS,ready:true,consentGranted:false});
  page.flush();page.intersect();page.tick();
  assert.equal(page.cards().length,2);
  assert.ok(page.port.sent.some(message=>message.type==='ANALYZE'));
});

test('unavailable credentials cancel requests and rejects late output without extracting secrets',()=>{
  const page=fixture();page.configure();page.intersect();page.tick();
  const request=page.port.sent.find(message=>message.type==='ANALYZE');assert.ok(request);
  page.port.onMessage.emit({type:'CONFIG',settings:API_SETTINGS,ready:false,keyState:'missing'});page.flush();
  assert.ok(page.port.sent.some(message=>message.type==='CANCEL_ALL'));
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,text:'Late private output'});page.flush();
  assert.ok(page.cards().every(card=>!card.testShadow.querySelector('.answer').textContent.includes('Late private output')));
  const count=page.port.sent.filter(message=>message.type==='ANALYZE').length;
  page.tick(2000);assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,count);
});

test('feed cards live outside X columns and never restyle or modify original posts', () => {
  const page = fixture(); const originalChildren = page.articles.map(article => [...article.children]);
  page.configure(); page.intersect();
  assert.equal(page.cards().length, 2);
  for (const card of page.cards()) for (const original of page.originals) assert.equal(original.contains(card), false);
  page.articles.forEach((article, index) => assert.deepEqual(article.children, originalChildren[index]));
  assert.deepEqual(page.writes, []);
  assert.equal(page.document.head.querySelectorAll('style').length, 0, 'No global CSS may alter X columns');
});

test('SuperX rail uses the new product name while retaining compatible overlay internals',()=>{
  const page=fixture({postCount:1});page.configure();
  const header=page.nodes.find(node=>node.className==='rail-head');
  assert.equal(header.querySelector('strong').textContent,'SuperX');
  assert.equal(page.nodes.find(node=>node.className==='rail-collapse').getAttribute('aria-label'),ui.t('common.collapse','zh-CN'));
  assert.equal(page.nodes.find(node=>node.className==='rail-expand').getAttribute('aria-label'),ui.t('common.expand','zh-CN'));
  assert.doesNotMatch(header.textContent,/GrokFirst/);
  assert.equal(page.cards()[0].tagName,'GROK-FIRST-CARD','An existing overlay host name is compatible across the rebrand');
  assert.deepEqual(page.nativeHooks,{install:0,run:0,messageListeners:0});
  assert.deepEqual(page.writes,[]);
});

test('legacy native and URL-only settings migrate to built-in API analysis without installing a native bridge',()=>{
  const page=fixture({postCount:1});
  page.configure({provider:'native',explanationMode:'url',nativeMode:'quick',nativeVerification:true});page.intersect();page.tick();
  const request=page.port.sent.find(message=>message.type==='ANALYZE');assert.ok(request);
  assert.deepEqual(page.nativeHooks,{install:0,run:0,messageListeners:0});
  assert.equal(page.runtimeMessages.some(message=>String(message.type).startsWith('NATIVE_')),false);
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text:'A migrated API explanation.',sources:[]}});page.flush();
  assert.equal(page.cards()[0].testShadow.querySelector('.answer').textContent,'A migrated API explanation.');
  const before=page.port.sent.length;
  page.configure({provider:'api',explanationMode:'preset'});page.intersect();page.tick();
  assert.equal(page.port.sent.slice(before).some(message=>['ANALYZE','CANCEL','CANCEL_ALL'].includes(message.type)),false,'The equivalent normalized settings do not create a second paid request');
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);
  assert.deepEqual(page.nativeHooks,{install:0,run:0,messageListeners:0});assert.deepEqual(page.writes,[]);
});

test('scroll and viewport resizing reposition only the independent overlay', () => {
  const page = fixture(); page.configure(); page.intersect();
  const card = page.displayedCards()[0]; assert.ok(card, 'A card should be visible with right-side room');
  const initial = card.getBoundingClientRect();
  assert.equal(initial.left, page.primary.rect.right);
  assert.equal(initial.right, page.sidebar.rect.right, 'The card must reach the widest sidebar edge');
  assert.equal(initial.top, page.articles[0].rect.top);
  assert.equal(initial.bottom,page.articles[0].rect.bottom,'Result rows end at the same separator as their posts');
  page.scroll(40);
  assert.equal(card.getBoundingClientRect().top, initial.top - 40);
  page.resize(950);
  assert.equal(page.displayedCards().length, 0, 'Insufficient right-side room must hide cards, without pushing the feed');
  page.resize(1440);
  assert.equal(page.displayedCards().length, 2);
  assert.deepEqual(page.writes, []);
});

test('a viewport without space for the result rail sends no automatic paid request and resumes when widened',()=>{
  const page=fixture();page.resize(950);page.configure();page.intersect();page.tick(10000);
  assert.equal(page.displayedCards().length,0);
  assert.equal(page.port.sent.some(message=>['ANALYZE','GENERATE_COMMENTS'].includes(message.type)),false);
  page.resize(1440);
  assert.equal(page.displayedCards().length,2);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,2,'Restoring the readable rail immediately submits visible work');
  page.tick(2000);assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,2);
  assert.deepEqual(page.writes,[]);
});

test('losing result rail space cancels waiting requests but retains started results and avoids rebilling them',()=>{
  const page=fixture();page.configure();
  const [running,waiting]=page.port.sent.filter(message=>message.type==='ANALYZE');assert.ok(running&&waiting);
  page.port.onMessage.emit({type:'START',requestId:running.requestId});
  page.port.onMessage.emit({type:'UPDATE',requestId:running.requestId,phase:'explain',text:'Already-started explanation'});page.flush();
  page.resize(950);
  assert.equal(page.displayedCards().length,0);
  assert.ok(page.port.sent.some(message=>message.type==='CANCEL_IF_QUEUED'&&message.requestId===waiting.requestId));
  assert.equal(page.port.sent.some(message=>['CANCEL','CANCEL_IF_QUEUED'].includes(message.type)&&message.requestId===running.requestId),false);
  assert.equal(page.port.sent.some(message=>message.type==='CANCEL_ALL'),false);
  page.port.onMessage.emit({type:'ERROR',requestId:waiting.requestId,code:'CANCELLED'});page.flush();
  page.port.onMessage.emit({type:'RESULT',requestId:running.requestId,result:{provider:'api',text:'A completed explanation in the hidden rail',sources:[]}});page.flush();
  page.port.onMessage.emit({type:'RESULT',requestId:waiting.requestId,result:{provider:'api',text:'Late cancelled answer',sources:[]}});page.flush();
  page.tick(5000);assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,2);
  assert.equal(page.cards().some(card=>card.testShadow.querySelector('.answer').textContent.includes('Late cancelled answer')),false);
  page.resize(1440);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE'&&message.post.id===running.post.id).length,1);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE'&&message.post.id===waiting.post.id).length,2);
  assert.ok(page.cards().some(card=>card.testShadow.querySelector('.answer').textContent==='A completed explanation in the hidden rail'));
  assert.deepEqual(page.writes,[]);
});

test('a START crossing a queued-only resize cancellation retains its paid response instead of generating another request',()=>{
  const page=fixture({postCount:1});page.configure();
  const request=page.port.sent.find(message=>message.type==='ANALYZE');assert.ok(request);
  page.resize(950);page.tick(2000);
  assert.equal(page.port.sent.filter(message=>message.type==='CANCEL_IF_QUEUED').length,1,'One cancellation probe waits for the worker acknowledgment');
  assert.equal(page.port.sent.some(message=>message.type==='CANCEL'),false);
  // The worker had already started before it received the cancellation probe;
  // its START notification arrives after the rail was hidden.
  page.port.onMessage.emit({type:'START',requestId:request.requestId});
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'explain',text:'Paid stream still arrives'});page.flush();
  assert.equal(page.cards()[0].testShadow.querySelector('.answer').textContent,'Paid stream still arrives');
  page.resize(1440);page.tick(2000);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text:'The original paid response completed',sources:[]}});page.flush();
  assert.equal(page.cards()[0].testShadow.querySelector('.answer').textContent,'The original paid response completed');
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);assert.deepEqual(page.writes,[]);
});

test('restoring rail space before cancellation acknowledgement waits and submits only once after the queued job is cancelled',()=>{
  const page=fixture({postCount:1});page.configure();
  const request=page.port.sent.find(message=>message.type==='ANALYZE');
  page.resize(950);page.resize(1440);page.tick(2000);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1,'An unacknowledged job is not duplicated');
  page.port.onMessage.emit({type:'ERROR',requestId:request.requestId,code:'CANCELLED'});page.flush();
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,2,'The acknowledged unstarted job is safely resubmitted');
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text:'Stale cancelled answer',sources:[]}});page.flush();
  assert.equal(page.cards()[0].testShadow.querySelector('.answer').textContent,'');
  page.tick(2000);assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,2);assert.deepEqual(page.writes,[]);
});

test('queued-only cancellation of a comment draft preserves its explanation and waits for a manual draft retry',()=>{
  for(const type of ['ERROR','COMMENT_ERROR']) {
    const page=fixture({postCount:1});page.configure();const {card,generate}=completeFirst(page);
    generate.emit('click');const comments=page.port.sent.find(message=>message.type==='GENERATE_COMMENTS');assert.ok(comments);
    page.resize(950);
    assert.ok(page.port.sent.some(message=>message.type==='CANCEL_IF_QUEUED'&&message.requestId===comments.requestId));
    page.port.onMessage.emit({type,requestId:comments.requestId,code:'CANCELLED'});page.flush();page.resize(1440);
    assert.equal(card.testShadow.querySelector('.answer').textContent,'Completed original explanation');
    assert.equal(page.port.sent.filter(message=>message.type==='GENERATE_COMMENTS').length,1);
    assert.equal(generate.textContent,ui.t('common.retryComments','zh-CN'));
    generate.emit('click');page.flush();
    assert.equal(page.port.sent.filter(message=>message.type==='GENERATE_COMMENTS').length,2);
    assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);assert.deepEqual(page.writes,[]);
  }
});

test('the full rail can collapse and expand without disabling analysis or changing X geometry',()=>{
  const page=fixture();page.configure();page.intersect();
  const rail=page.nodes.find(node=>node.className==='rail'),header=page.nodes.find(node=>node.className==='rail-head');
  assert.ok(rail);assert.equal(rail.style.left,'870px');assert.equal(rail.style.width,'380px');
  assert.equal(rail.style.top,'0px');assert.equal(rail.style.height,'960px');assert.equal(header.style.left,rail.style.left);
  const collapse=header.children.find(node=>node.className==='rail-collapse');collapse.emit('click');page.flush();
  const expand=page.nodes.find(node=>node.className==='rail-expand');
  assert.ok(rail.hidden);assert.ok(header.hidden);assert.equal(expand.hidden,false);
  assert.ok(page.port.sent.some(message=>message.type==='SET_RAIL_COLLAPSED'&&message.collapsed===true));
  assert.equal(page.port.sent.some(message=>message.type==='SET_ENABLED'),false);
  assert.equal(page.displayedCards().length,0);const before=page.port.sent.filter(message=>message.type==='ANALYZE').length;page.tick(2000);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,before);
  expand.emit('click');page.flush();assert.equal(rail.hidden,false);assert.equal(expand.hidden,true);
  assert.equal(page.displayedCards().length,2);page.tick(400);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,4,'Both cancelled queued posts are re-submitted on expand');
  assert.deepEqual(page.writes,[]);
});

test('long posts keep their explanation readable below the rail header as the feed scrolls',()=>{
  const page=fixture();page.articles[0].rect={...page.articles[0].rect,top:-500,bottom:600,height:1100};
  page.articles[1].rect={...page.articles[1].rect,top:600,bottom:880};
  page.configure();page.intersect();
  const card=page.displayedCards()[0],box=card.testShadow.children.find(node=>node.className==='card');
  assert.equal(card.style.top,'-500px');assert.equal(card.style.height,'1100px');
  assert.equal(box.style.top,'553px');assert.equal(box.style.height,'547px');
  page.scroll(100);
  assert.equal(card.style.top,'-600px');assert.equal(box.style.top,'653px');assert.equal(box.style.height,'447px');
  assert.equal(page.cards()[0],card);assert.deepEqual(page.writes,[]);
});

test('collapsing drops queued work but retains running output and restores it without a duplicate request',()=>{
  const page=fixture();page.configure({dwellMs:120});page.intersect();page.tick();page.tick(130);
  const [first,second]=page.port.sent.filter(message=>message.type==='ANALYZE');
  page.port.onMessage.emit({type:'START',requestId:first.requestId,used:1});
  page.port.onMessage.emit({type:'UPDATE',requestId:first.requestId,text:'Initial text',phase:'explain'});page.flush();
  page.nodes.find(node=>node.className==='rail-collapse').emit('click');page.flush();
  assert.equal(page.port.sent.some(message=>message.type==='CANCEL'&&message.requestId===first.requestId),false);
  assert.equal(page.port.sent.some(message=>message.type==='CANCEL'&&message.requestId===second.requestId),true);
  page.port.onMessage.emit({type:'RESULT',requestId:first.requestId,result:{text:'Finished while collapsed',sources:[],provider:'api'}});page.flush();page.tick(5000);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,2);
  page.nodes.find(node=>node.className==='rail-expand').emit('click');page.flush();page.tick(130);
  assert.match(page.cards()[0].testShadow.textContent,/Finished while collapsed/);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE'&&message.post.id===first.post.id).length,1);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE'&&message.post.id===second.post.id).length,2);
  assert.deepEqual(page.writes,[]);
});

test('persisted rail visibility and header language controls keep the per-post UI minimal',()=>{
  const page=fixture();page.port.onMessage.emit({type:'CONFIG',settings:API_SETTINGS,ready:true,used:0,collapsed:true});page.flush();page.intersect();page.tick(2000);
  assert.equal(page.displayedCards().length,0);assert.equal(page.port.sent.some(message=>message.type==='ANALYZE'),false);
  page.port.onMessage.emit({type:'RAIL_VISIBILITY',collapsed:false});page.flush();
  const select=page.nodes.find(node=>node.className==='rail-language');
  assert.equal(select.value,'auto');assert.ok(select.children.some(node=>node.value==='ja'));
  select.value='ja';select.emit('change');
  assert.equal(select.disabled,true);assert.ok(page.port.sent.some(message=>message.type==='SET_LANGUAGE'&&message.language==='ja'));
  page.configure({language:'ja'});assert.equal(select.disabled,false);assert.equal(select.value,'ja');
  page.configure({language:'pt-BR'});assert.equal(select.value,'pt-BR');assert.ok(select.children.some(node=>node.value==='pt-BR'));
  for(const card of page.cards()) {
    assert.equal(card.testShadow.querySelectorAll('button').some(button=>button.textContent==='设置'),false);
    assert.equal(card.testShadow.querySelectorAll('a').length,0,'No repeated original-post link');
    const visibleText=card.testShadow.children.filter(node=>node.tagName!=='STYLE').map(node=>node.textContent).join('');
    assert.doesNotMatch(visibleText,/xAI API|xai api|X 内置/);
  }
  assert.deepEqual(page.writes,[]);
});

test('row borders follow fractional cell boundaries and header origin rather than inner article edges',()=>{
  const page=fixture();
  const first=page.articles[0],second=page.articles[1];
  const cell=page.document.createElement('div');cell.setAttribute('data-testid','cellInnerDiv');
  page.primary.append(cell);cell.append(first);
  cell.rect={...first.rect,top:90.5,bottom:384.25,height:293.75};cell.computed={borderBottomWidth:'0.8px',borderBottomColor:'rgb(47, 51, 54)'};cell.original=true;
  first.rect={...first.rect,top:94.5,bottom:370.25,height:275.75};
  second.rect={...second.rect,top:384.25,bottom:650.75,height:266.5};
  const header=page.document.createElement('div');header.setAttribute('data-testid','grokFirstDemoHeader');
  header.rect={...page.primary.rect,top:21.5,bottom:74.3,height:52.8};header.computed={borderBottomWidth:'0.8px'};page.primary.prepend(header);header.original=true;
  page.clearWrites();page.configure();page.intersect();
  const card=page.cards().find(node=>node.style.top==='90.5px'),next=page.cards().find(node=>node.style.top==='384.25px'),railHead=page.nodes.find(node=>node.className==='rail-head');
  assert.ok(card);assert.equal(card.getBoundingClientRect().bottom,384.25);
  assertRailLine(page,384.25-0.8,0.8,'rgb(47, 51, 54)');
  assertRailLine(page,90.5-0.8,0.8,'rgb(47, 51, 54)');
  assert.equal(railLines(page).some(line=>Math.abs(line.top-next.getBoundingClientRect().bottom)<1),false,'No bottom line fabricated on a borderless native row');
  assert.equal(railHead.style.top,'21.5px');assert.equal(railHead.style.height,'52.8px');assert.equal(railHead.style.borderBottomWidth,'0.8px');
  assert.deepEqual(page.writes,[]);
});

test('native borders on shared thread wrappers and full-width sibling dividers extend into the rail',()=>{
  const threaded=fixture(),cell=threaded.document.createElement('div');cell.setAttribute('data-testid','cellInnerDiv');
  threaded.primary.append(cell);for(const article of threaded.articles)cell.append(article);
  cell.rect={...threaded.articles[0].rect,bottom:650.4,height:560.4};
  cell.computed={borderBottomWidth:'0.8px',borderBottomColor:'rgb(47, 51, 54)'};cell.original=true;
  threaded.clearWrites();threaded.configure();threaded.intersect();
  assert.deepEqual(threaded.cards().map(card=>Number.parseFloat(card.style.height)),[280,280]);
  assertRailLine(threaded,649.6,0.8,'rgb(47, 51, 54)');
  assert.equal(railLines(threaded).some(line=>Math.abs(line.top-370)<1),false,'A shared cell border belongs only to its ending article');
  assert.deepEqual(threaded.writes,[]);

  const sibling=fixture(),first=sibling.articles[0],row=sibling.document.createElement('div');row.setAttribute('data-testid','cellInnerDiv');
  sibling.primary.append(row);row.append(first);row.rect={...first.rect,bottom:372,height:282};row.original=true;
  const divider=sibling.document.createElement('div');row.append(divider);
  divider.rect={...first.rect,top:370.5,bottom:371.5,height:1};divider.computed={borderBottomWidth:'1px',borderBottomColor:'rgb(60, 65, 70)'};divider.original=true;
  sibling.articles[1].rect={...sibling.articles[1].rect,top:372};
  sibling.clearWrites();sibling.configure();sibling.intersect();
  assertRailLine(sibling,370.5,1,'rgb(60, 65, 70)');assert.deepEqual(sibling.writes,[]);
});

test('fractional native dividers after non-post timeline modules extend into the rail',()=>{
  const page=fixture(),module=page.document.createElement('div'),divider=page.document.createElement('div');
  module.setAttribute('data-testid','cellInnerDiv');page.primary.append(module);module.append(divider);
  module.rect={...page.primary.rect,top:370,bottom:600.25,height:230.25};module.original=true;
  divider.rect={...module.rect};divider.computed={borderBottomWidth:'0.8px',borderBottomStyle:'solid',borderBottomColor:'rgb(60, 65, 70)'};divider.original=true;
  page.articles[1].rect={...page.articles[1].rect,top:600.25,bottom:880.25,height:280};
  page.clearWrites();page.configure();page.intersect();
  assertRailLine(page,599.45,0.8,'rgb(60, 65, 70)');
  assert.equal(page.cards().length,2,'A recommendation module never acquires an answer card');
  assert.equal(page.cards()[1].style.top,'600.25px','The next answer retains its native post anchor');
  assert.deepEqual(page.writes,[]);
});

test('a thin filled native separator retains its interior offset inside a non-post spacer',()=>{
  const page=fixture(),spacer=page.document.createElement('div'),wrapper=page.document.createElement('div'),divider=page.document.createElement('div');
  spacer.setAttribute('data-testid','cellInnerDiv');page.primary.append(spacer);spacer.append(wrapper);wrapper.append(divider);
  spacer.rect={...page.primary.rect,top:428.84375,bottom:437.84375,height:9};spacer.original=true;
  wrapper.rect={...spacer.rect};wrapper.original=true;
  divider.rect={...spacer.rect,top:432.84375,bottom:433.84375,height:1};
  divider.computed={borderTopWidth:'0px',borderBottomWidth:'0px',backgroundColor:'rgb(47, 51, 54)'};divider.original=true;
  page.articles[1].rect={...page.articles[1].rect,top:437.84375,bottom:717.84375,height:280};
  page.clearWrites();page.configure();page.intersect();
  assertRailLine(page,432.84375,1,'rgb(47, 51, 54)');
  assert.equal(railLines(page).some(line=>Math.abs(line.top-436.84375)<1e-7),false,'The spacer bottom is not the painted divider');
  assert.equal(page.cards().length,2);assert.deepEqual(page.writes,[]);
});

test('borderless modules and narrow, shifted, sidebar or nested separators never invent rail lines',()=>{
  const page=fixture(),module=page.document.createElement('div');module.setAttribute('data-testid','cellInnerDiv');page.primary.append(module);
  module.rect={...page.primary.rect,top:370,bottom:610,height:240};module.original=true;
  const narrow=page.document.createElement('div');module.append(narrow);
  narrow.rect={...module.rect,left:370,right:770,width:400,top:410,bottom:411,height:1};narrow.computed={backgroundColor:'rgb(47, 51, 54)',borderBottomWidth:'1px',borderBottomStyle:'solid'};narrow.original=true;
  const shifted=page.document.createElement('div');module.append(shifted);
  shifted.rect={...module.rect,left:275,right:875,top:480,bottom:481,height:1};shifted.computed={backgroundColor:'rgb(47, 51, 54)'};shifted.original=true;
  const sidebar=page.document.createElement('div');sidebar.setAttribute('data-testid','cellInnerDiv');page.sidebar.append(sidebar);
  sidebar.rect={...page.primary.rect,top:700,bottom:701,height:1};sidebar.computed={backgroundColor:'rgb(47, 51, 54)'};sidebar.original=true;
  const nested=page.document.createElement('div');nested.setAttribute('data-testid','cellInnerDiv');page.articles[0].append(nested);
  nested.rect={...page.primary.rect,top:245,bottom:246,height:1};nested.computed={backgroundColor:'rgb(47, 51, 54)',borderBottomWidth:'1px',borderBottomStyle:'solid'};nested.original=true;
  page.articles[1].rect={...page.articles[1].rect,top:610,bottom:890,height:280};
  page.clearWrites();page.configure();page.intersect();
  assert.equal(railLines(page).length,1,'Only the deliberate first-post top boundary is drawn');assertRailLine(page,89,1);
  assert.deepEqual(page.writes,[]);
});

test('a leading non-post module preserves the deliberate first-post top boundary',()=>{
  const page=fixture(),module=page.document.createElement('div');module.setAttribute('data-testid','cellInnerDiv');page.primary.prepend(module);
  module.rect={...page.primary.rect,top:70,bottom:180,height:110};module.original=true;
  page.articles[0].rect={...page.articles[0].rect,top:180,bottom:460,height:280};
  page.articles[1].rect={...page.articles[1].rect,top:460,bottom:740,height:280};
  page.clearWrites();page.configure();page.intersect();assertRailLine(page,179,1);
  assert.equal(railLines(page).length,1,'A borderless recommendation does not gain a synthetic top rule');assert.deepEqual(page.writes,[]);
});

test('native non-post resize observations refresh separator positions and clean up removed cells',()=>{
  const page=fixture(),module=page.document.createElement('div');module.setAttribute('data-testid','cellInnerDiv');page.primary.append(module);
  module.rect={...page.primary.rect,top:370,bottom:600.25,height:230.25};
  module.computed={borderBottomWidth:'0.8px',borderBottomStyle:'solid',borderBottomColor:'rgb(47, 51, 54)'};module.original=true;
  page.articles[1].rect={...page.articles[1].rect,top:600.25,bottom:880.25,height:280};
  page.clearWrites();page.configure();page.intersect();assertRailLine(page,599.45,0.8,'rgb(47, 51, 54)');
  const observers=page.resizeObservers.filter(observer=>observer.observed.has(module));
  assert.ok(observers.length,'Tweet-free native cells are observed for size changes');
  module.rect={...module.rect,bottom:620.75,height:250.75};page.articles[1].rect={...page.articles[1].rect,top:620.75,bottom:900.75,height:280};
  for(const observer of observers)observer.callback([{target:module,contentRect:{...module.rect}}]);page.flush();
  assertRailLine(page,619.95,0.8,'rgb(47, 51, 54)');
  assert.equal(railLines(page).some(line=>Math.abs(line.top-599.45)<1e-7),false,'A native resize cannot retain the old module divider');
  module.remove();page.clearWrites();page.mutate();
  assert.equal(page.resizeObservers.some(observer=>observer.observed.has(module)),false,'Removed native cells are no longer retained by resize observers');
  assert.equal(railLines(page).some(line=>Math.abs(line.top-619.95)<1e-7),false,'Removed modules leave no stale rail divider');
  assert.deepEqual(page.writes,[]);
});

test('fractional overlap cannot erase a native separator when the preceding answer is clipped',()=>{
  const page=fixture(),first=page.articles[0];
  first.rect={...first.rect,bottom:370.8,height:280.8};first.computed={borderBottomWidth:'0.8px',borderBottomColor:'rgb(47, 51, 54)'};
  page.configure();page.intersect();
  assert.equal(page.cards()[0].getBoundingClientRect().bottom,page.articles[1].rect.top,'Overlapping answers still stop at the following post');
  assertRailLine(page,370,0.8,'rgb(47, 51, 54)');
  const layer=page.nodes.find(node=>node.className==='rail-separators');
  assert.equal(layer.style.left,'870px');assert.equal(layer.style.width,'380px','The separator spans the entire rail');
  page.scroll(10.25);assertRailLine(page,359.75,0.8,'rgb(47, 51, 54)');assert.deepEqual(page.writes,[]);
});

test('the first-post top boundary fills the blank initial rail and follows scrolling without stale lines',()=>{
  const page=fixture();page.articles[0].rect={...page.articles[0].rect,top:180,bottom:460,height:280};
  page.articles[1].rect={...page.articles[1].rect,top:460,bottom:740,height:280};
  page.configure();page.intersect();assertRailLine(page,179,1);
  page.scroll(35.5);assertRailLine(page,143.5,1);
  assert.equal(railLines(page).some(line=>Math.abs(line.top-179)<1e-7),false,'Old first-post coordinates do not survive a scroll');
  page.scroll(100);assert.equal(railLines(page).length,0,'The initial line disappears underneath the rail header');
  assert.deepEqual(page.writes,[]);
});

test('native separator coordinates refresh after media resize, removal and collapse',()=>{
  const page=fixture(),first=page.articles[0];first.computed={borderBottomWidth:'1px',borderBottomColor:'rgb(47, 51, 54)'};
  page.configure();page.intersect();assertRailLine(page,369,1);
  first.rect={...first.rect,bottom:520.5,height:430.5};page.articles[1].rect={...page.articles[1].rect,top:520.5,bottom:800.5,height:280};
  page.resize(1440);assertRailLine(page,519.5,1);
  assert.equal(railLines(page).some(line=>Math.abs(line.top-369)<1e-7),false,'Hydrated media cannot retain the old row border');
  page.nodes.find(node=>node.className==='rail-collapse').emit('click');page.flush();
  assert.equal(page.nodes.find(node=>node.className==='rail-separators').hidden,true);
  page.nodes.find(node=>node.className==='rail-expand').emit('click');page.flush();
  assert.equal(page.nodes.find(node=>node.className==='rail-separators').hidden,false);assertRailLine(page,519.5,1);
  first.remove();page.clearWrites();page.mutate();
  assert.equal(railLines(page).some(line=>Math.abs(line.top-519.5)<1e-7),true,'The remaining first post gains its top boundary at the same position');
  page.articles[1].remove();page.clearWrites();page.mutate();assert.equal(railLines(page).length,0,'Removing every post also removes every stale separator');
  assert.deepEqual(page.writes,[]);
});

test('quoted and narrow media borders never create full-width rail dividers',()=>{
  const page=fixture(),first=page.articles[0],cell=page.document.createElement('div');cell.setAttribute('data-testid','cellInnerDiv');
  page.primary.append(cell);cell.append(first);cell.rect={...first.rect};cell.original=true;
  const narrow=page.document.createElement('div');cell.append(narrow);
  narrow.rect={...first.rect,left:350,right:850,width:500,top:320,height:50};narrow.computed={borderBottomWidth:'1px',borderBottomColor:'rgb(47, 51, 54)'};narrow.original=true;
  const quote=page.document.createElement('article');quote.setAttribute('data-testid','tweet');first.append(quote);
  quote.rect={...first.rect,top:320,height:50};quote.computed={borderBottomWidth:'1px',borderBottomColor:'rgb(47, 51, 54)'};quote.original=true;
  page.clearWrites();page.configure();page.intersect();
  assert.equal(railLines(page).length,1,'Only the deliberate first-post top boundary is drawn');assertRailLine(page,89,1);
  assert.deepEqual(page.writes,[]);
});

test('a shared cell with multiple top-level posts does not expand their results into one row',()=>{
  const page=fixture(),cell=page.document.createElement('div');cell.setAttribute('data-testid','cellInnerDiv');page.primary.append(cell);
  for(const article of page.articles)cell.append(article);cell.original=true;cell.rect={...page.primary.rect};page.clearWrites();
  page.configure();page.intersect();
  assert.deepEqual(page.cards().map(card=>Number.parseFloat(card.style.height)),[280,280]);assert.deepEqual(page.writes,[]);
});

test('partially clipped headers preserve the visible bottom edge and dock controls once fully offscreen',()=>{
  const page=fixture(),tabs=page.document.createElement('div');tabs.setAttribute('data-testid','grokFirstDemoHeader');
  tabs.rect={...page.primary.rect,top:-20,bottom:33,height:53};tabs.computed={borderBottomWidth:'0.8px'};page.primary.prepend(tabs);tabs.original=true;page.clearWrites();
  page.configure();page.intersect();const head=page.nodes.find(node=>node.className==='rail-head');
  assert.equal(head.style.top,'0px');assert.equal(head.style.height,'33px');assert.equal(head.getBoundingClientRect().bottom,tabs.rect.bottom);
  tabs.rect={...tabs.rect,top:-60,bottom:-7};page.mutate();assert.equal(head.style.top,'0px');assert.equal(head.style.height,'53px');
  assert.deepEqual(page.writes,[]);
});

test('rail colors and typography follow X page themes and do not change original nodes',()=>{
  const page=fixture();page.document.body.computed={backgroundColor:'rgb(0, 0, 0)'};
  page.primary.computed={borderRightWidth:'1px',borderRightColor:'rgb(47, 51, 54)'};
  page.articles[0].computed={color:'rgb(231, 233, 234)',fontFamily:'TwitterChirp, Arial',fontSize:'15px',lineHeight:'20px'};
  page.configure();page.intersect();const overlay=page.document.getElementById('grokfirst-overlay');
  assert.equal(overlay.style.getPropertyValue('--gf-bg'),'rgb(0, 0, 0)');
  assert.equal(overlay.style.getPropertyValue('--gf-fg'),'rgb(231, 233, 234)');
  assert.equal(overlay.style.getPropertyValue('--gf-font'),'TwitterChirp, Arial');
  assert.equal(overlay.style.getPropertyValue('--gf-border'),'rgb(47, 51, 54)');
  assert.equal(overlay.style.getPropertyValue('--gf-scheme'),'dark');
  page.document.body.computed.backgroundColor='rgb(255, 255, 255)';page.articles[0].computed.color='rgb(15, 20, 25)';page.mutate();
  assert.equal(overlay.style.getPropertyValue('--gf-bg'),'rgb(255, 255, 255)');assert.equal(overlay.style.getPropertyValue('--gf-scheme'),'light');
  page.document.body.computed.backgroundColor='rgb(21, 32, 43)';page.mutate();
  assert.equal(overlay.style.getPropertyValue('--gf-bg'),'rgb(21, 32, 43)');assert.equal(overlay.style.getPropertyValue('--gf-scheme'),'dark');
  assert.deepEqual(page.writes,[]);
});

test('recycled and removed X articles cannot keep stale overlay cards or results', () => {
  const page = fixture(); page.configure(); page.intersect(); page.tick(); page.tick(400);
  const request = page.port.sent.find(message => message.type === 'ANALYZE'); assert.ok(request);
  const index = page.articles.findIndex(article => article.postData.id === request.post.id);
  const staleCard = page.cards()[index];
  const article = page.articles[index]; article.postData = { ...article.postData, id: '999', url: 'https://x.com/test/status/999', text: 'Recycled post' };
  page.mutate();
  assert.equal(staleCard.isConnected, false);
  assert.equal(page.cards().length, 2);
  page.port.onMessage.emit({ type: 'RESULT', requestId: request.requestId, result: { text: 'STALE RESULT SHOULD NOT APPEAR', provider: 'api', sources: [] } }); page.flush();
  assert.equal(page.cards().some(card => card.testShadow.textContent.includes('STALE RESULT SHOULD NOT APPEAR')), false);
  article.remove(); page.clearWrites(); page.mutate();
  assert.equal(page.cards().length, 1);
  assert.deepEqual(page.writes, []);
});

test('disabled mode and excluded routes hide overlays without changing the page layout', () => {
  const page = fixture(); page.configure(); page.intersect();
  assert.equal(page.displayedCards().length, 2);
  page.configure({ enabled: false }); assert.equal(page.displayedCards().length, 0);
  page.configure({ enabled: true }); assert.equal(page.displayedCards().length, 2);
  page.location.pathname = '/i/grok'; page.mutate(); assert.equal(page.displayedCards().length, 0);
  page.location.pathname = '/home'; page.mutate(); assert.equal(page.displayedCards().length, 2);
  assert.deepEqual(page.writes, []);
});

test('saving task prompts keeps accepted jobs and visible answers until an explicit reanalysis',()=>{
  const page=fixture();page.configure();page.intersect();page.tick();
  const first=page.port.sent.find(message=>message.type==='ANALYZE');assert.ok(first);
  page.port.onMessage.emit({type:'START',requestId:first.requestId,used:1});page.flush();
  page.port.sent.length=0;
  page.configure({explainPrompt:'New explanation style',verifyPrompt:'New check style',commentsPrompt:'New comment style'});
  assert.equal(page.port.sent.some(message=>message.type==='CANCEL_ALL'||message.type==='CANCEL'),false,'Saving prompts cannot discard accepted paid work');
  page.port.onMessage.emit({type:'RESULT',requestId:first.requestId,result:{provider:'api',text:'Original request completed',sources:[]}});page.flush();
  const card=page.cards().find(item=>item.testShadow.textContent.includes('Original request completed'));assert.ok(card);
  page.configure({explainPrompt:'Another future style',verifyPrompt:'New check style',commentsPrompt:'New comment style'});
  assert.match(card.testShadow.textContent,/Original request completed/);
  const requestsBefore=page.port.sent.filter(message=>message.type==='ANALYZE').length;
  const retry=card.testShadow.querySelectorAll('button').find(button=>button.textContent==='重新分析');assert.ok(retry);retry.emit('click');page.flush();page.tick();
  assert.ok(page.port.sent.filter(message=>message.type==='ANALYZE').length>requestsBefore);
  assert.deepEqual(page.writes,[]);
});

test('streaming results and citations render inside the card without touching X content', () => {
  const page = fixture(); page.configure(); page.intersect(); page.tick(); page.tick(400);
  const request = page.port.sent.find(message => message.type === 'ANALYZE'); assert.ok(request);
  page.port.onMessage.emit({ type: 'UPDATE', requestId: request.requestId, text: 'Explanation [reference](https://example.com/source)' });
  page.port.onMessage.emit({ type: 'RESULT', requestId: request.requestId, result: { text: 'Verified explanation <script>literal text</script>', provider: 'api', sources: [{ title: 'Source', url: 'https://example.com/source' }] } }); page.flush();
  const rendered = page.cards().map(card => card.testShadow.textContent).join('\n');
  assert.match(rendered, /Verified explanation <script>literal text<\/script>/);
  assert.equal(page.nodes.filter(node => node.tagName === 'SCRIPT').length, 0);
  assert.deepEqual(page.writes, []);
});

function citationFixture(provider='api') {
  const page=fixture({postCount:1});page.configure({provider});
  const request=page.port.sent.find(message=>message.type==='ANALYZE');assert.ok(request);
  const card=page.cards()[0];assert.ok(card);
  return {page,request,card,answer:card.testShadow.querySelector('.answer'),sources:card.testShadow.querySelector('.sources')};
}

test('Markdown answers use semantic blocks and inline formatting for streamed and cached API results',()=>{
  const text='# Main point\n\n## Context\n\n### Details\n\nA **strong** point, *emphasis*, ~~outdated~~ and `literal code`.\n\n- First item\n- Second item\n  - Nested item\n\n3. Third item\n4. Fourth item\n\n> A quoted explanation.\n\n[Primary evidence](https://example.com/report)\n\n---';
  for(const provider of ['api'])for(const cached of [false,true]) {
    const {page,request,answer}=citationFixture(provider);
    const before=page.port.sent.filter(message=>message.type==='ANALYZE').length;
    const assertFormatting=()=>{
      assert.equal(answer.querySelector('h1').textContent,'Main point');
      assert.equal(answer.querySelector('h2').textContent,'Context');
      assert.equal(answer.querySelector('h3').textContent,'Details');
      assert.equal(answer.querySelector('strong').textContent,'strong');
      assert.equal(answer.querySelector('em').textContent,'emphasis');
      assert.equal(answer.querySelector('del').textContent,'outdated');
      assert.equal(answer.querySelector('code').textContent,'literal code');
      const unordered=answer.querySelectorAll('ul'),ordered=answer.querySelector('ol');
      assert.equal(unordered.length,2,'Nested list structure survives rendering');
      assert.equal(unordered[0].children.length,2);
      assert.equal(unordered[1].children[0].textContent,'Nested item');
      assert.equal(ordered.children.length,2);
      assert.equal(String(ordered.start||ordered.getAttribute('start')),'3','An ordered list preserves its original starting number');
      assert.equal(answer.querySelector('blockquote').textContent,'A quoted explanation.');
      assert.equal(answer.querySelectorAll('hr').length,1);
      assert.equal(answer.querySelector('a').textContent,'Primary evidence');
      assert.equal(answer.querySelector('a').href,'https://example.com/report');
      assert.doesNotMatch(answer.textContent,/# Main point|\*\*strong\*\*|~~outdated~~/,'Formatting delimiters are not displayed as prose');
      assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,before,'Formatting does not submit another paid analysis');
      assert.deepEqual(page.writes,[]);
    };
    page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'explain',text});page.flush();assertFormatting();
    page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,cached,result:{provider,text,sources:[]}});page.flush();assertFormatting();
  }
});

test('Markdown tables preserve header and body cells without replacing the answer with plain Markdown',()=>{
  const {page,request,answer}=citationFixture();
  const text='| Item | Evidence |\n| :--- | ---: |\n| **Claim** | [Report](https://example.com/report) |\n| Next | `a + b` |';
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text,sources:[]}});page.flush();
  const table=answer.querySelector('table');assert.ok(table);
  assert.deepEqual(table.querySelectorAll('th').map(cell=>cell.textContent),['Item','Evidence']);
  assert.equal(table.querySelector('thead').querySelectorAll('tr').length,1);
  assert.equal(table.querySelector('tbody').querySelectorAll('tr').length,2);
  assert.deepEqual(table.querySelectorAll('td').map(cell=>cell.textContent),['Claim','Report','Next','a + b']);
  assert.equal(table.querySelector('strong').textContent,'Claim');
  assert.equal(table.querySelector('a').href,'https://example.com/report');
  assert.equal(table.querySelector('code').textContent,'a + b');
  assert.deepEqual(page.writes,[]);
});

test('fenced and inline code remain literal and never create links or execute model HTML',()=>{
  const {page,request,answer,sources}=citationFixture();
  const raw='<script>run()</script>\n**bold** [link](https://example.com/code)\nhttps://example.com/plain';
  const text='Inline `**literal** https://example.com/inline <img src=x>` stays literal.\n\n```js\n'+raw+'\n```\n\nActual [evidence](https://example.com/evidence).';
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text,sources:[{url:'https://example.com/code',title:'Code sample source'},{url:'https://example.com/evidence',title:'1'}]}});page.flush();
  const code=answer.querySelectorAll('code');assert.equal(code.length,2);
  assert.equal(code[0].textContent,'**literal** https://example.com/inline <img src=x>');
  assert.equal(code[1].textContent,raw,'Code content is preserved without its fence delimiters');
  assert.equal(answer.querySelector('pre').querySelector('code'),code[1]);
  assert.equal(answer.querySelectorAll('strong').length,0,'Code does not interpret its Markdown delimiters');
  assert.equal(answer.querySelectorAll('img').length,0);assert.equal(answer.querySelectorAll('script').length,0);
  assert.deepEqual(answer.querySelectorAll('a').map(link=>link.href),['https://example.com/evidence']);
  assert.deepEqual(sources.querySelectorAll('a').map(link=>link.href),['https://example.com/code'],'A URL displayed only as code does not falsely hide its clickable source');
  assert.deepEqual(page.writes,[]);
});

test('Markdown raw HTML and image tokens remain inert and unsafe links never become anchors',()=>{
  const {page,request,answer}=citationFixture();
  const text='<a href="javascript:alert(1)" onclick="run()">raw link</a>\n\n<img src=x onerror=run()>\n\n<script>run()</script>\n\n![A useful image caption](https://example.com/tracker.png)\n\n[Script destination](javascript:alert(1)) [Data destination](data:text/html,bad) [Credential destination](https://user:secret@example.com/report) [Safe evidence](https://example.com/report)';
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text,sources:[]}});page.flush();
  assert.equal(answer.querySelectorAll('img').length,0,'Model image Markdown cannot issue a tracking request');
  assert.equal(answer.querySelectorAll('script').length,0);assert.equal(answer.querySelectorAll('iframe').length,0);
  const links=answer.querySelectorAll('a');assert.equal(links.length,1);
  assert.equal(links[0].textContent,'Safe evidence');assert.equal(links[0].href,'https://example.com/report');
  assert.equal(links[0].target,'_blank');assert.equal(links[0].rel,'noopener noreferrer');
  assert.match(answer.textContent,/<a href="javascript:alert\(1\)" onclick="run\(\)">raw link<\/a>/);
  assert.match(answer.textContent,/<img src=x onerror=run\(\)>/);assert.match(answer.textContent,/<script>run\(\)<\/script>/);
  assert.match(answer.textContent,/A useful image caption/,'A blocked image still conveys its meaningful caption');
  assert.match(answer.textContent,/Script destination/);assert.match(answer.textContent,/Data destination/);assert.match(answer.textContent,/Credential destination/);
  assert.deepEqual(page.writes,[]);
});

test('unfinished streamed Markdown recovers into final formatting without losing prose or reissuing analysis',()=>{
  for(const provider of ['api']) {
    const {page,request,answer}=citationFixture(provider);
    const count=page.port.sent.filter(message=>message.type==='ANALYZE').length;
    const partials=['## Con','## Context\n\nA **part','## Context\n\nA **point** and [evi','## Context\n\nA **point** and [evidence](https://example.com/rep'];
    for(const text of partials) {
      page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'explain',text});page.flush();
      assert.equal(answer.querySelector('h2').textContent,text.startsWith('## Context')?'Context':'Con');
      assert.ok(answer.textContent.includes(text.includes('point')?'point':text.includes('part')?'part':'Con'),'Streamed useful prose is never silently discarded');
      assert.equal(answer.querySelectorAll('script').length,0);
    }
    const completed='## Context\n\nA **point** and [evidence](https://example.com/report).';
    page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider,text:completed,sources:[]}});page.flush();
    assert.equal(answer.querySelector('h2').textContent,'Context');assert.equal(answer.querySelector('strong').textContent,'point');
    assert.equal(answer.querySelector('a').textContent,'evidence');assert.equal(answer.querySelector('a').href,'https://example.com/report');
    assert.equal(answer.textContent,'Context\n\nA point and evidence.','The final prose and paragraph separation are retained');
    assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,count);
    assert.deepEqual(page.writes,[]);
  }
});

test('a queued Markdown rendering frame cannot overwrite completion or restore obsolete inline citations',()=>{
  for(const provider of ['api'])for(const cached of [false,true]) {
    const {page,request,answer,sources}=citationFixture(provider);
    page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,text:'**Old prefix** [old evidence](https://example.com/old)',sources:[{url:'https://example.com/old',title:'1'}]});
    const final='## Final answer\n\nThe **completed point**.[[2]](https://example.com/final)';
    page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,cached,result:{provider,text:final,sources:[{url:'https://example.com/final',title:'2'},{url:'https://example.com/extra',title:'Extra evidence'}]}});page.flush();
    assert.equal(answer.querySelector('h2').textContent,'Final answer');
    assert.equal(answer.querySelector('strong').textContent,'completed point');
    assert.doesNotMatch(answer.textContent,/Old prefix|old evidence/);
    assert.deepEqual(answer.querySelectorAll('a').map(link=>link.href),['https://example.com/final']);
    assert.equal(answer.querySelector('a').textContent,'[2]');
    assert.deepEqual(sources.querySelectorAll('a').map(link=>link.href),['https://example.com/extra']);
    assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);
    assert.deepEqual(page.writes,[]);
  }
});

test('fullwidth URL closing punctuation never makes the following Chinese paragraph clickable',()=>{
  const url='https://t.co/dZ1jiqrxX';
  const before='帖子附带两张图片，另一张回复中附的链接图片（';
  const after='），可能为相关截图或证明材料，但内容未在文本中展开。回复中有人表示“原来打个电话付十刀就能直邮，学到了”，显示该信息对部分香港用户有实用参考价值。';
  const text=before+url+after;
  for(const provider of ['api'])for(const cached of [false,true]) {
    const {page,request,answer}=citationFixture(provider);
    const assertBoundaries=()=>{
      const links=answer.querySelectorAll('a');assert.equal(links.length,1);
      assert.equal(links[0].href,url);assert.equal(links[0].textContent,url);
      assert.equal(answer.textContent,text,'No excluded punctuation or prose may disappear');
      const paragraph=links[0].parentNode;
      assert.equal(paragraph.childNodes[paragraph.childNodes.indexOf(links[0])+1].textContent,after,'The entire paragraph after the URL must remain an ordinary text node');
      assert.deepEqual(page.writes,[]);
    };
    page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'explain',text});page.flush();assertBoundaries();
    page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,cached,result:{provider,text,sources:[]}});page.flush();assertBoundaries();
  }
});

test('clean inline URLs with Chinese suffixes still deduplicate source metadata',()=>{
  for(const provider of ['api']) {
    const {page,request,answer,sources}=citationFixture(provider);
    const url='https://example.com/report',extra='https://other.example/evidence';
    page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,cached:true,result:{provider,text:`参考（${url}），这里是解释。`,sources:[{url,title:'1'},{url:extra,title:'Additional evidence'}]}});page.flush();
    assert.deepEqual(answer.querySelectorAll('a').map(link=>link.href),[url]);
    assert.deepEqual(sources.querySelectorAll('a').map(link=>link.href),[extra]);
  }
});

test('URL boundaries preserve Unicode domains paths queries and encoded punctuation',()=>{
  const {page,request,answer}=citationFixture();
  const urls=[
    'https://例子.测试/资料/中文?标签=中文&next=%E3%80%82#细节',
    'https://example.com/a%29b%2Cc?query=%3F%21&path=%E4%B8%AD%E6%96%87',
    'https://example.com/search?q=one,two&part=x:y#résumé'
  ];
  const text=urls.map(url=>`参考（${url}），相关说明。`).join('\n');
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text,sources:[]}});page.flush();
  const links=answer.querySelectorAll('a');assert.equal(links.length,urls.length);
  links.forEach((link,index)=>{assert.equal(new URL(link.href).href,new URL(urls[index]).href);assert.equal(link.textContent,urls[index]);});
  assert.equal(answer.textContent,text);
});

test('balanced ASCII parentheses and brackets belong to both plain and named Markdown URLs',()=>{
  const {page,request,answer}=citationFixture();
  const url='https://en.wikipedia.org/wiki/Function_(mathematics)?items[]=one&mode=(brief)#Section_(1)';
  const ipv6='http://[2001:db8::1]/article_(2)?q=one';
  const text=`Plain (${url}). Named [Mathematics](${url}) and [IPv6](${ipv6}).`;
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text,sources:[]}});page.flush();
  const links=answer.querySelectorAll('a');assert.equal(links.length,3);
  assert.deepEqual(links.map(link=>new URL(link.href).href),[url,url,ipv6].map(value=>new URL(value).href));
  assert.deepEqual(links.map(link=>link.textContent),[url,'Mathematics','IPv6']);
  assert.equal(answer.textContent,`Plain (${url}). Named Mathematics and IPv6.`);
});

test('prose punctuation ends plain URL anchors and preserves later links and punctuation',()=>{
  const {page,request,answer}=citationFixture();
  const urls=['https://example.com/a','https://example.com/b','https://example.com/c','https://example.com/d','https://example.com/e'];
  const text=`${urls[0]}，后文；“${urls[1]}”。 (${urls[2]}); then ${urls[3]}! Finally ${urls[4]}...`;
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text,sources:[]}});page.flush();
  assert.deepEqual(answer.querySelectorAll('a').map(link=>link.href),urls);
  assert.equal(answer.textContent,text,'All prose delimiters survive exactly once');
});

test('link rendering keeps model HTML inert and rejects credential and non-http destinations',()=>{
  const {page,request,answer}=citationFixture();
  const text='<img src=x onerror=alert(1)>\n\n[blocked](javascript:alert(1)) [local](file:///tmp/test) https://reader:secret@example.com/private https://example.com/report\");<script>alert(1)</script> https://example.com/other';
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text,sources:[]}});page.flush();
  const links=answer.querySelectorAll('a');
  assert.deepEqual(links.map(link=>link.href),['https://example.com/report','https://example.com/other']);
  links.forEach(link=>{assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');});
  assert.match(answer.textContent,/<img src=x onerror=alert\(1\)>/,'Raw HTML is visible literal text');
  assert.match(answer.textContent,/blocked/);assert.match(answer.textContent,/local/);
  assert.match(answer.textContent,/https:\/\/reader:secret@example\.com\/private/,'A blocked credential URL remains visible without becoming a link');
  assert.match(answer.textContent,/<script>alert\(1\)<\/script>/,'Raw script text is preserved rather than parsed as a script');
  assert.equal(answer.querySelectorAll('img').length,0);assert.equal(answer.querySelectorAll('script').length,0);
  assert.deepEqual(page.writes,[]);
});

test('streaming a URL before its fullwidth delimiter never retains an oversized anchor',()=>{
  const {page,request,answer,sources}=citationFixture();
  const url='https://t.co/dZ1jiqrxX',extra='https://example.com/other';
  for(const text of ['图片（https://t.co/','图片（'+url,`图片（${url}），这里的中文是解释。另见 ${extra}。`]) {
    page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,text,sources:[{url,title:'1'},{url:extra,title:'2'}]});page.flush();
    assert.equal(answer.textContent,text);
    for(const link of answer.querySelectorAll('a'))assert.doesNotMatch(link.textContent,/中文|解释|这里/);
  }
  assert.deepEqual(answer.querySelectorAll('a').map(link=>link.href),[url,extra]);
  assert.equal(sources.querySelectorAll('a').length,0,'Finished inline links replace the separate source rows');
});

test('inline citation URLs already shown in the answer do not become duplicate numbered source rows',()=>{
  for(const provider of ['api'])for(const cached of [false,true]) {
    const {page,request,answer,sources}=citationFixture(provider);
    const text='A claim.[[1]](https://example.com/report) More [evidence](https://other.example/paper).\nhttps://x.com/i/status/2107113780966494644';
    page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,cached,result:{provider,text,sources:[
      {url:'https://example.com/report',title:'1'},
      {url:'https://other.example/paper',title:'2'},
      {url:'https://x.com/i/status/2107113780966494644',title:'3'}
    ]}});page.flush();
    assert.equal(answer.querySelectorAll('a').length,3,'Existing Markdown and plain URLs must remain clickable');
    assert.match(answer.textContent,/A claim\.\[1\]/,'xAI citation syntax renders a compact numbered citation');
    assert.equal(answer.querySelectorAll('a')[0].textContent,'[1]','The citation number is part of its clickable label');
    assert.equal(sources.querySelectorAll('a').length,0,'Each inline destination already provides its source');
    assert.deepEqual(page.writes,[]);
  }
});

test('additional citation destinations keep meaningful titles or distinguishable URL labels instead of bare numbers',()=>{
  const {page,request,sources}=citationFixture();
  const labels=[
    {url:'https://example.com/report/one',title:'1'},
    {url:'https://example.com/report/two',title:' [2] '},
    {url:'https://example.com/report/three?q=detail#section',title:'[[3]]'},
    {url:'https://example.com/report/four',title:'   '},
    {url:'https://example.com/report/five',title:'https://example.com/report/five'},
    {url:'https://primary.example/report',title:'Independent primary report'}
  ];
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text:'A concise explanation.',sources:labels}});page.flush();
  const links=sources.querySelectorAll('a');assert.equal(links.length,labels.length);
  assert.equal(links.at(-1).textContent,'Independent primary report');
  for(let index=0;index<labels.length-1;index++) {
    const link=links[index];
    assert.match(link.textContent,/example\.com\/report\//,'Fallbacks name the site and page instead of just a number');
    assert.equal(link.href,labels[index].url);assert.equal(link.title,labels[index].url);
    assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');
  }
  assert.match(links[2].textContent,/\?q=detail#section/,'Distinct query and fragment destinations remain identifiable');
  assert.equal(new Set(links.map(link=>link.textContent)).size,labels.length);
  assert.deepEqual(page.writes,[]);
});

test('citation filtering normalizes safe URLs, deduplicates metadata and applies the display cap after inline filtering',()=>{
  const {page,request,sources}=citationFixture();
  const inline=Array.from({length:12},(_,index)=>({url:`https://example.com/inline/${index}`,title:String(index+1)}));
  const extra=Array.from({length:15},(_,index)=>({url:`https://extra.example/report/${index}`,title:`Report ${index}`}));
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text:inline.map(source=>source.url).join('\n'),sources:[
    ...inline,
    {url:'javascript:alert(1)',title:'Unsafe script'},
    {url:'data:text/html,unsafe',title:'Unsafe data'},
    {url:'https://user:secret@credential.example/report',title:'Credential URL'},
    null,{},
    extra[0],{url:'https://EXTRA.EXAMPLE:443/report/0',title:'Duplicate normalized URL'},...extra.slice(1)
  ]}});page.flush();
  const links=sources.querySelectorAll('a');assert.equal(links.length,12,'Inline duplicates and invalid destinations do not consume the display cap');
  assert.deepEqual(links.map(link=>link.href),extra.slice(0,12).map(source=>source.url));
  assert.doesNotMatch(sources.textContent,/Unsafe|Credential|Duplicate/);
  assert.deepEqual(page.writes,[]);
});

test('streaming citation metadata is refreshed when later answer text adds or removes inline URLs',()=>{
  for(const provider of ['api']) {
    const {page,request,answer,sources}=citationFixture(provider);
    const citation={url:'https://example.com/report',title:'1'},extra={url:'https://example.com/extra',title:'Extra evidence'};
    page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'explain',sources:[citation,extra]});page.flush();
    assert.equal(sources.querySelectorAll('a').length,2);
    page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'explain',text:'An interpretation.[[1]](https://example.com/report)'});page.flush();
    assert.equal(answer.querySelectorAll('a').length,1);
    assert.deepEqual(sources.querySelectorAll('a').map(link=>link.href),[extra.url],'A later answer frame removes only citations already shown inline');
    page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,text:'A revised interpretation with the source still available separately.'});page.flush();
    assert.equal(sources.querySelectorAll('a').length,2,'Filtering must retain metadata rather than permanently discard hidden entries');
    page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,text:`A final interpretation. ${citation.url}`,sources:[citation,extra]});page.flush();
    assert.deepEqual(sources.querySelectorAll('a').map(link=>link.href),[extra.url]);
    assert.deepEqual(page.writes,[]);
  }
});

test('partial answers retain only extra sources and reanalysis does not resurrect old citation metadata',()=>{
  for(const provider of ['api']) {
    const {page,request,card,sources}=citationFixture(provider);
    const inline={url:'https://example.com/inline',title:'1'},extra={url:'https://example.com/extra',title:'Extra evidence'};
    page.port.onMessage.emit({type:'ERROR',requestId:request.requestId,code:'NETWORK_ERROR',partialResult:{provider,text:`Preserved interpretation. ${inline.url}`,sources:[inline,extra]}});page.flush();
    assert.deepEqual(sources.querySelectorAll('a').map(link=>link.href),[extra.url]);
    card.testShadow.querySelector('.retry').emit('click');page.flush();
    const next=page.port.sent.find(message=>message.type==='ANALYZE'&&message.requestId!==request.requestId);assert.ok(next);
    assert.equal(sources.querySelectorAll('a').length,0);
    page.port.onMessage.emit({type:'UPDATE',requestId:next.requestId,text:'New answer without sources.'});page.flush();
    assert.equal(sources.querySelectorAll('a').length,0,'An answer frame must not revive previous-request sources');
    page.port.onMessage.emit({type:'RESULT',requestId:next.requestId,result:{provider,text:'Finished new answer.',sources:[]}});page.flush();
    assert.equal(sources.querySelectorAll('a').length,0);
    assert.deepEqual(page.writes,[]);
  }
});

test('language mismatch and configuration resets clear retained source metadata before a new answer frame',()=>{
  const {page,request,card,sources}=citationFixture();
  const old={url:'https://example.com/old',title:'Old evidence'};
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,text:'Wrong language output.',sources:[old]});page.flush();
  assert.equal(sources.querySelectorAll('a').length,1);
  page.port.onMessage.emit({type:'ERROR',requestId:request.requestId,code:'API_LANGUAGE_MISMATCH'});page.flush();
  assert.equal(sources.querySelectorAll('a').length,0);
  card.testShadow.querySelector('.retry').emit('click');page.flush();
  const next=page.port.sent.find(message=>message.type==='ANALYZE'&&message.requestId!==request.requestId);assert.ok(next);
  page.port.onMessage.emit({type:'UPDATE',requestId:next.requestId,text:'Fresh output without citation metadata.'});page.flush();
  assert.equal(sources.querySelectorAll('a').length,0);
  page.port.onMessage.emit({type:'RESULT',requestId:next.requestId,result:{provider:'api',text:'Finished answer.',sources:[old]}});page.flush();
  assert.equal(sources.querySelectorAll('a').length,1);
  page.configure({language:'ja'});page.intersect();page.tick();
  const translated=page.port.sent.filter(message=>message.type==='ANALYZE').at(-1);assert.notEqual(translated.requestId,next.requestId);
  page.port.onMessage.emit({type:'UPDATE',requestId:translated.requestId,text:'新しい回答です。'});page.flush();
  assert.equal(sources.querySelectorAll('a').length,0,'A settings reset must not restore metadata from an old answer');
  assert.deepEqual(page.writes,[]);
});

test('a virtualized article that loses post data removes its answer rather than retaining a stale association', () => {
  const page = fixture(); page.configure(); page.intersect();
  const discardedCard = page.cards()[0];
  page.articles[0].postData = null; page.mutate();
  assert.equal(discardedCard.isConnected, false);
  assert.equal(page.cards().length, 1);
  assert.deepEqual(page.writes, []);
});

test('background visibility hides the overlay and prevents a new analysis until the feed is visible again', () => {
  const page = fixture(); page.configure(); page.intersect();
  const count=page.port.sent.filter(message=>message.type==='ANALYZE').length;
  page.document.hidden = true; page.document.visibilityState = 'hidden'; page.document.emit('visibilitychange'); page.flush();
  assert.equal(page.displayedCards().length, 0);
  page.tick(1000);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,count);
  page.document.hidden = false; page.document.visibilityState = 'visible'; page.document.emit('visibilitychange'); page.flush();
  assert.equal(page.displayedCards().length, 2);
  assert.deepEqual(page.writes, []);
});

test('API-only analysis can read promoted posts after legacy native settings migrate', () => {
  const page=fixture();page.articles[0].postData.isPromoted=true;page.articles[1].remove();page.clearWrites();page.mutate();
  page.configure({provider:'native'});page.intersect();page.tick();page.tick(400);
  assert.equal(page.port.sent.some(m=>m.type==='ANALYZE'&&m.post.id===page.articles[0].postData.id),true);
  assert.deepEqual(page.nativeHooks,{install:0,run:0,messageListeners:0});
  assert.deepEqual(page.writes,[]);
});


function verificationUI(card) {
  const shadow=card.testShadow;
  return {status:shadow.querySelector('.status'),answer:shadow.querySelector('.answer'),wait:shadow.querySelector('.verification-thinking'),initialWait:shadow.querySelector('.thinking'),sources:shadow.querySelector('.sources'),box:shadow.querySelector('.card'),
    get divider(){return shadow.querySelector('.analysis-divider');},
    get explanation(){return shadow.querySelector('.explanation-answer');},
    get verification(){return shadow.querySelector('.verification-answer');}
  };
}

function beginVerification(page,request,card) {
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'explain',text:'Preserved explanation'});
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'verification_queued',text:'Preserved explanation',verificationText:'',verificationStart:'Preserved explanation'.length+2});
  page.flush();return verificationUI(card);
}

test('API verification queues and waits at the answer tail, then keeps its status animated while text streams',()=>{
  const page=fixture();page.configure({explanationMode:'preset'});
  const [request,other]=page.port.sent.filter(message=>message.type==='ANALYZE');
  const first=verificationUI(page.cards()[0]),second=verificationUI(page.cards()[1]);
  assert.equal(first.status.classList.contains('shimmer'),true,'Initial queued analysis still uses its original animation');
  assert.equal(first.initialWait.hidden,false);assert.equal(first.wait.hidden,true);
  beginVerification(page,request,page.cards()[0]);
  assert.equal(first.answer.textContent,'Preserved explanation');
  assert.equal(first.status.textContent,ui.t('status.verificationQueued','zh-CN'));
  assert.equal(first.status.classList.contains('shimmer'),true);
  assert.equal(first.initialWait.hidden,true);assert.equal(first.wait.hidden,false);
  assert.equal(first.wait.querySelectorAll('.dot').length,9);
  assert.equal(first.divider.tagName,'HR');assert.equal(first.divider.textContent,'','The stage boundary adds a quiet line without a generated heading');
  assert.equal(first.explanation.textContent,'Preserved explanation');assert.equal(first.verification.hidden,true);
  assert.deepEqual(first.answer.children.map(node=>node.className),['analysis-section explanation-answer','analysis-divider','analysis-section verification-answer']);
  const children=first.box.children;
  assert.ok(children.indexOf(first.answer)<children.indexOf(first.wait)&&children.indexOf(first.wait)<children.indexOf(first.sources),'The waiting indicator appears below the divider and before citations');
  for(const verificationText of ['', ' \n\t']) {
    page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'verify',text:'Preserved explanation\n\n'+verificationText,verificationText,verificationStart:'Preserved explanation'.length+2});page.flush();
    assert.equal(first.wait.hidden,false,'Empty and whitespace-only verification deltas are still waiting');
    assert.equal(first.status.classList.contains('shimmer'),true);
    assert.equal(first.answer.textContent.trim(),'Preserved explanation');
    assert.equal(first.divider.hidden,false);assert.equal(first.verification.hidden,true);
  }
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'verify',text:'Preserved explanation\n\nEvidence arrives.',verificationText:'Evidence arrives.',verificationStart:'Preserved explanation'.length+2});page.flush();
  assert.equal(first.wait.hidden,true);assert.equal(first.status.classList.contains('shimmer'),true);
  assert.equal(first.box.getAttribute('aria-busy'),'true');assert.match(first.answer.textContent,/Evidence arrives/);
  assert.equal(first.explanation.textContent,'Preserved explanation');assert.equal(first.verification.textContent,'Evidence arrives.');assert.equal(first.verification.hidden,false);
  assert.equal(second.divider,null,'Another queued post does not inherit this stage boundary');
  assert.equal(second.answer.textContent,'');assert.equal(second.wait.hidden,true,'A different queued post does not acquire this post\'s verification state');
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text:'Preserved explanation\n\nComplete check.',sources:[],searched:true,verificationStatus:'completed',verificationStart:'Preserved explanation'.length+2}});page.flush();
  assert.equal(first.wait.hidden,true);assert.equal(first.status.classList.contains('shimmer'),false);assert.equal(first.box.getAttribute('aria-busy'),'false');
  assert.equal(first.divider.hidden,false);assert.equal(first.verification.textContent,'Complete check.');
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'verify',text:'Late check',verificationText:''});page.flush();
  assert.equal(first.status.classList.contains('shimmer'),false);assert.doesNotMatch(first.answer.textContent,/Late check/);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,2,'Progress indicators never schedule extra analysis');
  assert.equal(page.port.sent.some(message=>message.type==='CANCEL'&&message.requestId===other.requestId),false);
  assert.deepEqual(page.writes,[]);
});

test('verification progress without separate delta metadata does not mistake the preserved explanation for a first token',()=>{
  const page=fixture({postCount:1});page.configure({explanationMode:'custom'});
  const request=page.port.sent.find(message=>message.type==='ANALYZE'),card=page.cards()[0],progress=beginVerification(page,request,card);
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'verify',text:'Preserved explanation\n\n'});page.flush();
  assert.equal(progress.wait.hidden,false);assert.equal(progress.answer.textContent.trim(),'Preserved explanation');
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'verify',text:'Preserved explanation\n\nFirst useful check.'});page.flush();
  assert.equal(progress.wait.hidden,true);assert.equal(progress.status.classList.contains('shimmer'),true);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);assert.deepEqual(page.writes,[]);
});

test('live and cached background answers preserve the UTF-16 stage boundary without adding section titles',()=>{
  const initial='**解释🙂。**',check='[出处](https://example.com/check) 支持这项修正。',verificationStart=initial.length+2;
  for(const cached of [false,true]) {
    const page=fixture({postCount:1});page.configure({explanationMode:'preset'});
    const request=page.port.sent.find(message=>message.type==='ANALYZE'),progress=verificationUI(page.cards()[0]);
    let explanationNode;
    if(!cached) {
      page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'explain',text:initial});page.flush();
      assert.equal(progress.divider,null,'The initial explanation has no premature stage line');
      page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'verification_queued',text:initial,verificationText:'',verificationStart});page.flush();
      assert.equal(progress.wait.hidden,false);assert.equal(progress.verification.hidden,true);
      explanationNode=progress.explanation.querySelector('strong');
      for(const partial of ['[出处](https://example.com/check)',check]) {
        page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'verify',text:initial+'\n\n'+partial,verificationText:partial,verificationStart});page.flush();
        assert.equal(progress.explanation.querySelector('strong'),explanationNode,'Verification streaming keeps the readable explanation DOM stable');
        assert.equal(progress.wait.hidden,true);assert.equal(progress.divider.hidden,false);
      }
    }
    page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,cached,result:{provider:'api',apiVerification:'background',verificationStatus:'completed',text:initial+'\n\n'+check,verificationStart,sources:[]}});page.flush();
    assert.equal(progress.answer.querySelectorAll('.analysis-divider').length,1);
    assert.equal(progress.divider.tagName,'HR');assert.equal(progress.divider.textContent,'');assert.equal(progress.divider.hidden,false);
    assert.equal(progress.explanation.textContent,'解释🙂。');assert.equal(progress.verification.textContent,'出处 支持这项修正。');
    assert.equal(progress.verification.hidden,false);assert.equal(progress.wait.hidden,true);
    assert.equal(progress.answer.querySelectorAll('h1,h2,h3,h4,h5,h6').length,0,'The UI does not invent explanation or fact-check titles');
    assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);assert.deepEqual(page.writes,[]);
  }
});

test('both rendered stages keep Markdown safe and deduplicate source links across the divider',()=>{
  const page=fixture({postCount:1});page.configure({explanationMode:'custom'});
  const request=page.port.sent.find(message=>message.type==='ANALYZE'),progress=verificationUI(page.cards()[0]);
  const initial='**Explanation** [first](https://example.com/first)',check='A correction from [second](https://example.com/second). `<img src=x onerror=run()>` and [blocked](javascript:run())';
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',apiVerification:'background',verificationStatus:'completed',text:initial+'\n\n'+check,verificationStart:initial.length+2,sources:[
    {url:'https://example.com/first',title:'1'},{url:'https://example.com/second',title:'2'},{url:'https://example.com/extra',title:'Additional evidence'}
  ]}});page.flush();
  assert.equal(progress.divider.hidden,false);assert.equal(progress.explanation.querySelector('strong').textContent,'Explanation');
  assert.deepEqual(progress.answer.querySelectorAll('a').map(link=>link.href),['https://example.com/first','https://example.com/second']);
  assert.deepEqual(progress.sources.querySelectorAll('a').map(link=>link.href),['https://example.com/extra']);
  assert.equal(progress.answer.querySelectorAll('img,script,iframe').length,0);
  assert.equal(progress.verification.querySelector('code').textContent,'<img src=x onerror=run()>');
  assert.match(progress.verification.textContent,/blocked/);assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);assert.deepEqual(page.writes,[]);
});

test('one-stage answers and old cached text never gain a guessed divider from paragraphs or model headings',()=>{
  const text='## Explanation\n\nUseful context.\n\n---\n\n## 事实核查\n\nA later paragraph in the same response.';
  for(const mode of ['inline','off','legacy-background-cache']) {
    const page=fixture({postCount:1});page.configure({apiVerification:mode==='legacy-background-cache'?'background':mode});
    const request=page.port.sent.find(message=>message.type==='ANALYZE'),progress=verificationUI(page.cards()[0]);
    if(mode!=='legacy-background-cache') {
      page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:mode==='inline'?'inline':'explain',text});page.flush();
      assert.equal(progress.divider,null);assert.equal(progress.wait.hidden,true);
    }
    page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,cached:mode==='legacy-background-cache',result:{provider:'api',apiVerification:mode==='legacy-background-cache'?'background':mode,verificationStatus:'completed',text,sources:[]}});page.flush();
    assert.equal(progress.divider,null);assert.equal(progress.explanation,null);assert.equal(progress.verification,null);
    assert.equal(progress.answer.querySelectorAll('h2').length,2,'Model-supplied headings remain ordinary Markdown');
    assert.equal(progress.answer.querySelectorAll('hr').length,1,'A model-supplied horizontal rule is retained without pretending it is a stage boundary');
    assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);assert.deepEqual(page.writes,[]);
  }
});

test('invalid boundary offsets and blank retained checks do not fabricate verification sections',()=>{
  const initial='An explanation.',text=initial+'\n\nA completed check.';
  for(const verificationStart of [undefined,0,-1,NaN,Infinity,1.5,'17',Number.MAX_SAFE_INTEGER+1,initial.length+1,text.length]) {
    const page=fixture({postCount:1});page.configure();
    const request=page.port.sent.find(message=>message.type==='ANALYZE'),progress=verificationUI(page.cards()[0]);
    page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,cached:true,result:{provider:'api',apiVerification:'background',text,verificationStatus:'completed',verificationStart,sources:[]}});page.flush();
    assert.equal(progress.divider,null,String(verificationStart));
    assert.match(progress.answer.textContent,/An explanation/);assert.match(progress.answer.textContent,/A completed check/);
    assert.deepEqual(page.writes,[]);
  }
  const page=fixture({postCount:1});page.configure();
  const request=page.port.sent.find(message=>message.type==='ANALYZE'),progress=verificationUI(page.cards()[0]);
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',apiVerification:'background',text:initial+'\n\n \n',verificationStart:initial.length+2,verificationStatus:'incomplete',sources:[]}});page.flush();
  assert.equal(progress.divider,null);assert.equal(progress.wait.hidden,true);assert.equal(progress.answer.textContent.trim(),initial);assert.deepEqual(page.writes,[]);
});

test('verification with no preserved explanation cannot show an empty dividing line',()=>{
  const page=fixture({postCount:1});page.configure();
  const request=page.port.sent.find(message=>message.type==='ANALYZE'),progress=verificationUI(page.cards()[0]);
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'verify',text:'Only available text.',verificationText:'Only available text.'});page.flush();
  assert.equal(progress.divider,null);assert.match(progress.answer.textContent,/Only available text/);
  page.port.onMessage.emit({type:'ERROR',requestId:request.requestId,code:'NETWORK_ERROR',partialResult:{text:'Only available text.',sources:[]}});page.flush();
  assert.equal(progress.divider,null);assert.equal(progress.wait.hidden,true);assert.deepEqual(page.writes,[]);
});

test('a preserved verification result remains divided after an error but cancelled empty waits leave no visible line',()=>{
  const retained=fixture({postCount:1});retained.configure();
  const request=retained.port.sent.find(message=>message.type==='ANALYZE'),progress=beginVerification(retained,request,retained.cards()[0]);
  const initial='Preserved explanation',check='A useful completed correction.';
  retained.port.onMessage.emit({type:'ERROR',requestId:request.requestId,code:'RATE_LIMIT',partialResult:{provider:'api',text:initial+'\n\n'+check,verificationStart:initial.length+2,sources:[]}});retained.flush();
  assert.equal(progress.wait.hidden,true);assert.equal(progress.divider.hidden,false);assert.equal(progress.explanation.textContent,initial);assert.equal(progress.verification.textContent,check);
  retained.cards()[0].testShadow.querySelector('.retry').emit('click');retained.flush();
  assert.equal(progress.divider,null);assert.equal(progress.answer.textContent,'');assert.equal(progress.initialWait.hidden,false);
  const cancelled=fixture({postCount:1});cancelled.configure();
  const queued=cancelled.port.sent.find(message=>message.type==='ANALYZE'),waiting=beginVerification(cancelled,queued,cancelled.cards()[0]);
  cancelled.port.onDisconnect.emit();cancelled.flush();
  assert.equal(waiting.wait.hidden,true);assert.ok(!waiting.divider||waiting.divider.hidden,'A stopped empty verification stage leaves no visible rule');
  assert.deepEqual(retained.writes,[]);assert.deepEqual(cancelled.writes,[]);
});


test('verification errors stop both indicators and retry starts fresh without reviving the old request',()=>{
  const page=fixture({postCount:1});page.configure({explanationMode:'preset'});
  const request=page.port.sent.find(message=>message.type==='ANALYZE'),card=page.cards()[0],progress=beginVerification(page,request,card);
  page.port.onMessage.emit({type:'ERROR',requestId:request.requestId,code:'NETWORK_ERROR',partialResult:{text:'Preserved explanation',sources:[]}});page.flush();
  assert.equal(progress.wait.hidden,true);assert.equal(progress.status.classList.contains('shimmer'),false);assert.equal(progress.answer.textContent,'Preserved explanation');
  assert.equal(progress.divider,null,'A failed check without retained verification text leaves no empty divider');
  card.testShadow.querySelector('.retry').emit('click');page.flush();
  const retried=page.port.sent.filter(message=>message.type==='ANALYZE').at(-1);
  assert.notEqual(retried.requestId,request.requestId);
  assert.equal(progress.wait.hidden,true);assert.equal(progress.initialWait.hidden,false);assert.equal(progress.answer.textContent,'');
  assert.equal(progress.divider,null,'Reanalysis starts with a fresh unsplit answer');
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'verify',text:'Stale failed request',verificationText:''});page.flush();
  assert.equal(progress.wait.hidden,true);assert.equal(progress.answer.textContent,'');
  beginVerification(page,retried,card);assert.equal(progress.wait.hidden,false,'A fresh task gets a fresh waiting phase');
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,2);assert.deepEqual(page.writes,[]);
});

test('disconnect and disabled configuration stop verification waits and reject late progress',()=>{
  for(const stop of ['disconnect','disabled']) {
    const page=fixture({postCount:1});page.configure({explanationMode:'preset'});
    const request=page.port.sent.find(message=>message.type==='ANALYZE'),card=page.cards()[0],progress=beginVerification(page,request,card);
    if(stop==='disconnect')page.port.onDisconnect.emit();else page.configure({explanationMode:'preset',enabled:false});
    page.flush();
    assert.equal(progress.wait.hidden,true,stop);assert.equal(progress.status.classList.contains('shimmer'),false,stop);
    assert.equal(progress.box.getAttribute('aria-busy'),'false');
    page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'verify',text:'Obsolete waiting task',verificationText:''});page.flush();
    assert.equal(progress.wait.hidden,true);assert.equal(progress.status.classList.contains('shimmer'),false);assert.doesNotMatch(progress.answer.textContent,/Obsolete waiting task/);
    assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);assert.deepEqual(page.writes,[]);
  }
});

test('a fatal connection failure ends verification, retains the explanation and cannot restart stale work',()=>{
  const page=fixture({postCount:1});page.configure({explanationMode:'preset'});
  const request=page.port.sent.find(message=>message.type==='ANALYZE'),progress=beginVerification(page,request,page.cards()[0]);
  page.port.onMessage.emit({type:'FATAL'});page.flush();
  assert.equal(progress.wait.hidden,true);assert.equal(progress.status.classList.contains('shimmer'),false);assert.equal(progress.box.getAttribute('aria-busy'),'false');
  assert.equal(progress.status.textContent,ui.t('status.failed','zh-CN'));assert.equal(progress.answer.textContent,'Preserved explanation');
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'verify',text:'Late fatal request',verificationText:''});
  page.tick(10000);page.intersect();page.flush();
  assert.equal(progress.wait.hidden,true);assert.equal(progress.status.classList.contains('shimmer'),false);assert.equal(progress.answer.textContent,'Preserved explanation');
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1,'FATAL cannot turn into an automatic paid retry');assert.deepEqual(page.writes,[]);
});

test('offscreen cancellation stops only its own verification indicator and ignores late tokens',()=>{
  const page=fixture();page.configure({explanationMode:'preset'});
  const [first,second]=page.port.sent.filter(message=>message.type==='ANALYZE');
  const firstUI=beginVerification(page,first,page.cards()[0]),secondUI=beginVerification(page,second,page.cards()[1]);
  page.articles[0].rect={...page.articles[0].rect,top:-500,bottom:-200};page.tick(100);page.tick(1100);
  assert.ok(page.port.sent.some(message=>message.type==='CANCEL'&&message.requestId===first.requestId));
  assert.equal(firstUI.wait.hidden,true);assert.equal(firstUI.status.classList.contains('shimmer'),false);assert.equal(firstUI.answer.textContent,'Preserved explanation');
  assert.equal(secondUI.wait.hidden,false);assert.equal(secondUI.status.classList.contains('shimmer'),true);
  page.port.onMessage.emit({type:'UPDATE',requestId:first.requestId,phase:'verify',text:'Late cancelled check',verificationText:'Late cancelled check'});page.flush();
  assert.equal(firstUI.wait.hidden,true);assert.doesNotMatch(firstUI.answer.textContent,/Late cancelled check/);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,2);assert.deepEqual(page.writes,[]);
});

test('changing the X interface locale updates a verification waiting label without restarting analysis',()=>{
  const page=fixture({postCount:1});page.configure({explanationMode:'preset',language:'en'});
  const request=page.port.sent.find(message=>message.type==='ANALYZE'),progress=beginVerification(page,request,page.cards()[0]);
  assert.ok(progress.wait.textContent.includes(ui.t('status.thinking','zh-CN')));
  const before=page.port.sent.length;
  page.document.documentElement.lang='ja';page.mutate([{type:'attributes',attributeName:'lang',target:page.document.documentElement}]);
  assert.equal(progress.status.textContent,ui.t('status.verificationQueued','ja'));assert.ok(progress.wait.textContent.includes(ui.t('status.thinking','ja')));
  assert.equal(progress.wait.hidden,false);assert.equal(progress.answer.textContent,'Preserved explanation');
  assert.equal(page.port.sent.slice(before).some(message=>['ANALYZE','CANCEL','CANCEL_ALL','SET_LANGUAGE'].includes(message.type)),false);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);assert.deepEqual(page.writes,[]);
});

test('all visible API posts are submitted together including partial viewport edges',()=>{
  const page=fixture({postCount:7});
  page.articles.forEach((article,index)=>{article.rect={...article.rect,top:90+index*130,bottom:370+index*130};});
  page.articles[6].rect.top=957;page.articles[6].rect.bottom=1237;
  page.configure({dwellMs:120,apiConcurrency:4});page.intersect();page.tick();page.tick(130);
  const sent=page.port.sent.filter(m=>m.type==='ANALYZE');
  assert.equal(sent.length,7,'Background controls HTTP slots; frontend must not wait for four complete fact checks');
  assert.deepEqual(sent.map(m=>m.post.id),page.articles.map(a=>a.postData.id),'Dispatch top to bottom');
  page.tick(500);assert.equal(page.port.sent.filter(m=>m.type==='ANALYZE').length,7,'No duplicate generation');
  assert.deepEqual(page.writes,[]);
});


test('parallel API results are independently attributed and rendering frames cannot overwrite completion',()=>{
  const page=fixture();page.configure({dwellMs:120});page.intersect();page.tick();page.tick(130);
  const requests=page.port.sent.filter(m=>m.type==='ANALYZE');assert.equal(requests.length,2);
  const first=requests[0],second=requests[1];
  page.port.onMessage.emit({type:'UPDATE',requestId:first.requestId,phase:'explain',text:'Early first'});
  page.port.onMessage.emit({type:'UPDATE',requestId:second.requestId,phase:'explain',text:'Early second'});
  page.port.onMessage.emit({type:'RESULT',requestId:first.requestId,result:{provider:'api',text:'Finished first',sources:[]}});
  page.flush();
  const firstCard=page.cards()[page.articles.findIndex(article=>article.postData.id===first.post.id)];
  const secondCard=page.cards()[page.articles.findIndex(article=>article.postData.id===second.post.id)];
  assert.match(firstCard.testShadow.textContent,/Finished first/);assert.doesNotMatch(firstCard.testShadow.textContent,/Early second|Early first/);
  assert.match(secondCard.testShadow.textContent,/Early second/);assert.doesNotMatch(secondCard.testShadow.textContent,/Finished first/);
  assert.deepEqual(page.writes,[]);
});

test('rate limits retain complete early explanation and stay paused after prompt edits on new API cards',()=>{
  const page=fixture({postCount:3});page.articles[2].rect={...page.articles[2].rect,top:1200,bottom:1480};
  page.configure({dwellMs:120});page.intersect();page.tick();page.tick(130);
  const request=page.port.sent.find(m=>m.type==='ANALYZE');
  page.port.onMessage.emit({type:'ERROR',requestId:request.requestId,code:'RATE_LIMIT',error:'API 已限速',partialResult:{text:'Complete early explanation',sources:[],warning:'联网求证未完成'}});page.flush();
  assert.match(page.cards().map(c=>c.testShadow.textContent).join(''),/Complete early explanation/);
  assert.ok(page.cards().map(c=>c.testShadow.textContent).join('').includes(ui.t('note.preserved','zh-CN')));
  page.configure({explainPrompt:'A new explanation style for future requests'});
  page.articles[2].rect={...page.articles[2].rect,top:650,bottom:930};page.tick(1000);
  assert.equal(page.port.sent.filter(m=>m.type==='ANALYZE').length,2);
  assert.ok(page.cards()[2].testShadow.textContent.includes(ui.t('status.rateLimited','zh-CN')));
  assert.equal(page.cards()[2].testShadow.querySelector('.note').textContent,ui.t('note.rateLimited','zh-CN'));
  assert.doesNotMatch(page.cards()[2].testShadow.querySelector('.note').textContent,/API Key/,'An exhausted quota is not a missing credential');
});

test('API media hydration preserves one paid task and its completed explanation',()=>{
  const page=fixture();const article=page.articles[0];
  article.postData={...article.postData,quotedContext:[{id:'300',url:'https://x.com/quote/status/300',text:'Quoted claim'}]};
  page.configure({dwellMs:120});page.intersect();page.tick();page.tick(130);
  const request=page.port.sent.find(m=>m.type==='ANALYZE'&&m.post.id===article.postData.id),card=page.cards()[0];
  article.postData={...article.postData,hasMedia:true,images:[{url:'https://pbs.twimg.com/media/loaded.jpg',alt:'Loaded preview'}],quotedContext:[{...article.postData.quotedContext[0],hasMedia:true,images:[{url:'https://pbs.twimg.com/media/quote.jpg'}]}]};
  page.mutate();page.intersect();page.tick(1000);
  assert.equal(page.cards()[0],card);assert.equal(page.port.sent.some(m=>m.type==='CANCEL'&&m.requestId===request.requestId),false);
  assert.equal(page.port.sent.filter(m=>m.type==='ANALYZE'&&m.post.id===article.postData.id).length,1);
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,text:'Preserved explanation',phase:'explain'});page.flush();
  assert.match(card.testShadow.textContent,/Preserved explanation/);
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text:'Complete explanation',sources:[],verificationStatus:'incomplete',warning:'联网求证未完成'}});
  article.postData={...article.postData,images:[],quotedContext:[{...article.postData.quotedContext[0],images:[]}]};page.mutate();page.tick(1000);
  assert.equal(page.cards()[0],card);assert.match(card.testShadow.textContent,/Complete explanation/);
  assert.ok(card.testShadow.textContent.includes(ui.t('status.incomplete','zh-CN')));
  assert.equal(page.port.sent.filter(m=>m.type==='ANALYZE'&&m.post.id===article.postData.id).length,1);
  assert.deepEqual(page.writes,[]);
});

test('all API modes cancel a recycled post and ignore its late answer',()=>{
  for(const explanationMode of ['preset','custom']) {
    const page=fixture(),article=page.articles[0];article.postData.language='en';
    page.configure({explanationMode});page.intersect();page.tick();
    const request=page.port.sent.find(m=>m.type==='ANALYZE'&&m.post.id===article.postData.id);
    article.postData={...article.postData,id:'999',url:'https://x.com/recycled/status/999',text:'A different English post'};
    page.mutate();page.intersect();page.tick();page.tick(130);
    assert.equal(page.port.sent.some(m=>m.type==='CANCEL'&&m.requestId===request.requestId),true,explanationMode);
    page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text:'Obsolete answer',sources:[]}});page.flush();
    assert.doesNotMatch(page.cards().map(card=>card.testShadow.textContent).join(''),/Obsolete answer/,explanationMode);
    const sent=page.port.sent.filter(m=>m.type==='ANALYZE'&&m.post.id==='999');
    assert.equal(sent.length,1);assert.deepEqual(sent[0].post,article.postData);
    assert.deepEqual(page.writes,[]);
  }
});

test('all API modes survive same-language text expansion and quote hydration without another paid request',()=>{
  for(const explanationMode of ['preset','custom']) {
  const page=fixture(),article=page.articles[0];article.postData.language='en';page.configure({explanationMode});page.intersect();page.tick();
  const request=page.port.sent.find(value=>value.type==='ANALYZE'&&value.post.id===article.postData.id),card=page.cards()[0];
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'explain',text:'Natural original-post explanation'});page.flush();
  article.postData={...article.postData,text:'Expanded original English preview',language:'en',quotedContext:[{id:'300',text:'Hydrated quote'}]};
  page.mutate();page.intersect();page.tick();
  assert.equal(page.cards()[0],card);assert.match(card.testShadow.textContent,/Natural original-post explanation/);
  assert.equal(page.port.sent.some(value=>value.type==='CANCEL'&&value.requestId===request.requestId),false);
  assert.equal(page.port.sent.filter(value=>value.type==='ANALYZE'&&value.post.id===article.postData.id).length,1);
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text:'Complete natural answer',searched:true,verified:false,verificationStatus:'completed',sources:[]}});page.flush();
  assert.match(card.testShadow.textContent,/Complete natural answer/);assert.deepEqual(page.writes,[]);
  }
});

test('all API modes follow X original/translation toggles in Auto and reject the previous language stream',()=>{
  for(const explanationMode of ['preset','custom']) {
  const page=fixture(),article=page.articles[0];article.postData.language='en';page.configure({explanationMode});page.intersect();page.tick();
  const currentCard=()=>page.cards().find(card=>card.getBoundingClientRect().top===article.rect.top);
  const original=page.port.sent.find(value=>value.type==='ANALYZE'&&value.post.id===article.postData.id);
  page.port.onMessage.emit({type:'UPDATE',requestId:original.requestId,phase:'explain',text:'English stream before translation'});page.flush();
  article.postData={...article.postData,text:'原帖正文的中文译文。',language:'zh-CN'};page.mutate();page.intersect();page.tick();
  const translated=page.port.sent.filter(value=>value.type==='ANALYZE'&&value.post.id===article.postData.id).at(-1);
  assert.notEqual(translated.requestId,original.requestId);assert.equal(translated.post.language,'zh-CN');
  assert.ok(page.port.sent.some(value=>value.type==='CANCEL'&&value.requestId===original.requestId));
  page.port.onMessage.emit({type:'RESULT',requestId:original.requestId,result:{provider:'api',text:'Late old-language result',sources:[]}});page.flush();
  assert.doesNotMatch(currentCard().testShadow.textContent,/Late old-language result|English stream before translation/);
  page.port.onMessage.emit({type:'RESULT',requestId:translated.requestId,result:{provider:'api',text:'中文解释。',sources:[]}});page.flush();
  assert.match(currentCard().testShadow.textContent,/中文解释/);
  article.postData={...article.postData,text:'Original post 0',language:'en'};page.mutate();page.intersect();page.tick();
  const restored=page.port.sent.filter(value=>value.type==='ANALYZE'&&value.post.id===article.postData.id).at(-1);
  assert.equal(restored.post.language,'en');assert.notEqual(restored.requestId,translated.requestId);
  page.port.onMessage.emit({type:'RESULT',requestId:restored.requestId,cached:true,result:{provider:'api',text:'Cached English explanation',sources:[]}});page.flush();
  assert.match(currentCard().testShadow.textContent,/Cached English explanation/);assert.doesNotMatch(currentCard().testShadow.textContent,/中文解释/);
  assert.equal(page.port.sent.filter(value=>value.type==='ANALYZE'&&value.post.id===article.postData.id).length,3);
  assert.deepEqual(page.writes,[]);
  }
});

test('all API modes keep a fixed output language through display-language toggles and X UI locale changes',()=>{
  for(const explanationMode of ['preset','custom']) {
  const page=fixture(),article=page.articles[0];article.postData.language='en';page.configure({language:'ja',explanationMode});page.intersect();page.tick();
  const original=page.port.sent.find(value=>value.type==='ANALYZE'&&value.post.id===article.postData.id),card=page.cards()[0];
  page.port.onMessage.emit({type:'UPDATE',requestId:original.requestId,phase:'explain',text:'指定した日本語の解説です。'});page.flush();
  article.postData={...article.postData,text:'原帖正文的中文译文。',language:'zh-CN'};page.mutate();page.intersect();page.tick();
  page.document.documentElement.lang='en';page.mutate([{type:'attributes',attributeName:'lang',target:page.document.documentElement}]);page.tick();
  assert.ok(page.cards()[0]===card);assert.match(card.testShadow.textContent,/指定した日本語/);
  assert.equal(page.port.sent.filter(value=>value.type==='ANALYZE'&&value.post.id===article.postData.id).length,1);
  assert.equal(page.port.sent.some(value=>value.type==='CANCEL'&&value.requestId===original.requestId),false);
  page.port.onMessage.emit({type:'RESULT',requestId:original.requestId,result:{provider:'api',text:'日本語の回答を維持します。',sources:[]}});page.flush();
  assert.match(card.testShadow.textContent,/日本語の回答/);assert.deepEqual(page.writes,[]);
  }
});

test('all API modes follow attribute-only original and translation visibility switches in Auto',()=>{
  const cases=[['class','body'],['style','article'],['hidden','body'],['aria-hidden','article'],
    ['style','descendant'],['class','feed'],['class','html'],['style','html']];
  for(const explanationMode of ['preset','custom'])for(const [attributeName,scope] of cases) {
    const page=fixture({postCount:1}),article=page.articles[0],body=article.children[0];body.setAttribute('data-testid','tweetText');
    const descendant=page.document.createElement('span');body.append(descendant);
    const target={body,article,descendant,feed:page.primary,html:page.document.documentElement}[scope];
    article.postData.language='en';page.configure({explanationMode});page.intersect();page.tick();
    const initial=page.port.sent.find(message=>message.type==='ANALYZE');
    page.port.onMessage.emit({type:'UPDATE',requestId:initial.requestId,phase:'explain',text:'English explanation before translation'});page.flush();
    const bodyObservation=page.mutationObservers.flatMap(observer=>observer.observations).find(value=>value.target===page.document.body);
    assert.ok(bodyObservation.options.attributeFilter.includes('hidden'));assert.ok(bodyObservation.options.attributeFilter.includes('aria-hidden'));
    article.postData={...article.postData,text:'这是当前显示的中文翻译内容。',language:'zh-CN'};
    target.setAttribute(attributeName,attributeName==='style'?'display:block':attributeName==='aria-hidden'?'false':'translated');
    page.clearWrites();page.mutate([{type:'attributes',attributeName,target}]);page.tick();
    const translated=page.port.sent.filter(message=>message.type==='ANALYZE').at(-1),card=page.cards()[0];
    assert.equal(translated.post.language,'zh-CN',`${explanationMode} ${scope} ${attributeName}`);
    assert.notEqual(translated.requestId,initial.requestId);
    assert.ok(page.port.sent.some(message=>message.type==='CANCEL'&&message.requestId===initial.requestId));
    page.port.onMessage.emit({type:'UPDATE',requestId:initial.requestId,phase:'explain',text:'Stale English stream'});
    page.port.onMessage.emit({type:'RESULT',requestId:initial.requestId,result:{provider:'api',text:'Stale English result',sources:[]}});page.flush();
    assert.doesNotMatch(card.testShadow.textContent,/English explanation before translation|Stale English/);
    page.port.onMessage.emit({type:'RESULT',requestId:translated.requestId,result:{provider:'api',text:'中文解读。',sources:[]}});page.flush();
    assert.match(card.testShadow.textContent,/中文解读/);
    article.postData={...article.postData,text:'This is the restored English original.',language:'en'};
    target.removeAttribute(attributeName);page.clearWrites();page.mutate([{type:'attributes',attributeName,target}]);page.tick();
    const restored=page.port.sent.filter(message=>message.type==='ANALYZE').at(-1);
    assert.equal(restored.post.language,'en');assert.notEqual(restored.requestId,translated.requestId);
    page.port.onMessage.emit({type:'RESULT',requestId:restored.requestId,cached:true,result:{provider:'api',text:'Restored cached English answer',sources:[]}});page.flush();
    assert.match(page.cards()[0].testShadow.textContent,/Restored cached English/);assert.doesNotMatch(page.cards()[0].testShadow.textContent,/中文解读/);
    assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,3);assert.deepEqual(page.writes,[]);
  }
});

test('visibility attribute switches preserve a forced output language in every API mode',()=>{
  for(const explanationMode of ['preset','custom'])for(const attributeName of ['class','style','hidden','aria-hidden']) {
    const page=fixture({postCount:1}),article=page.articles[0];article.children[0].setAttribute('data-testid','tweetText');article.postData.language='en';page.configure({explanationMode,language:'ja'});page.tick();
    const initial=page.port.sent.find(message=>message.type==='ANALYZE'),card=page.cards()[0];
    page.port.onMessage.emit({type:'UPDATE',requestId:initial.requestId,phase:'explain',text:'指定された日本語の解説です。'});page.flush();
    const before=page.extractionCount();article.postData={...article.postData,text:'这是中文翻译内容。',language:'zh-CN'};
    page.mutate([{type:'attributes',attributeName,target:article}]);page.tick();
    assert.equal(page.extractionCount(),before+1,'The displayed snapshot is refreshed');
    assert.equal(page.cards()[0],card);assert.match(card.testShadow.textContent,/指定された日本語/);
    assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);
    assert.equal(page.port.sent.some(message=>message.type==='CANCEL'&&message.requestId===initial.requestId),false);
  }
});

test('unrelated metrics, media, quoted bodies and owned UI styling do not rescan or restart analysis',()=>{
  const page=fixture({postCount:1}),article=page.articles[0];article.children[0].setAttribute('data-testid','tweetText');article.postData.language='en';
  const metrics=page.document.createElement('div'),media=page.document.createElement('video');article.append(metrics,media);
  const quote=page.document.createElement('div'),quotedBody=page.document.createElement('div');quote.setAttribute('role','link');quotedBody.setAttribute('data-testid','tweetText');quote.append(quotedBody);article.append(quote);
  const drawer=page.document.createElement('div'),drawerBody=page.document.createElement('div');drawer.setAttribute('data-testid','GrokDrawer');drawerBody.setAttribute('data-testid','tweetText');drawer.append(drawerBody);page.document.body.append(drawer);
  page.configure();page.tick();const before=page.extractionCount();
  article.postData={...article.postData,text:'这是只应在真正切换正文时读取的中文翻译。',language:'zh-CN'};
  const ownRoot=page.nodes.find(node=>node.id==='grokfirst-overlay');
  for(const target of [metrics,media,quote,quotedBody,drawer,drawerBody,ownRoot]) {
    for(const attributeName of ['class','style','hidden','aria-hidden'])page.mutate([{type:'attributes',attributeName,target}]);
  }
  page.tick(2000);assert.equal(page.extractionCount(),before);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);assert.equal(page.port.sent.some(message=>message.type==='CANCEL'),false);
  page.mutate([{type:'attributes',attributeName:'class',target:article}]);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,2);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').at(-1).post.language,'zh-CN');
});

test('a batched visibility switch coalesces body and root observations into one refreshed request',()=>{
  for(const explanationMode of ['preset','custom']) {
    const page=fixture({postCount:1}),article=page.articles[0];article.children[0].setAttribute('data-testid','tweetText');article.postData.language='en';page.configure({explanationMode});page.tick();
    const initial=page.port.sent.find(message=>message.type==='ANALYZE'),before=page.extractionCount();
    article.postData={...article.postData,text:'这是一组同步更新后的中文翻译。',language:'zh-CN'};
    page.mutate([...['class','style','hidden','aria-hidden'].map(attributeName=>({type:'attributes',attributeName,target:article})),
      {type:'attributes',attributeName:'class',target:page.document.documentElement}]);page.tick();
    assert.equal(page.extractionCount(),before+1);
    assert.equal(page.port.sent.filter(message=>message.type==='CANCEL'&&message.requestId===initial.requestId).length,1);
    assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,2);
    assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').at(-1).post.language,'zh-CN');
  }
});

test('an output-language error clears the wrong prefix, exposes retry and does not auto-request again',()=>{
  const page=fixture();page.articles[0].postData.language='en';page.configure();page.intersect();page.tick();
  const request=page.port.sent.find(value=>value.type==='ANALYZE'),card=page.cards()[0];
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'explain',text:'これは誤った言語の短い回答です。',sources:[{url:'https://example.com',title:'Old source'}]});page.flush();
  page.port.onMessage.emit({type:'ERROR',requestId:request.requestId,code:'API_LANGUAGE_MISMATCH',error:'Wrong language',usage:{output_tokens:20}});page.flush();
  assert.doesNotMatch(card.testShadow.textContent,/これは誤った|Old source/);
  assert.ok(card.testShadow.textContent.includes(ui.t('error.outputLanguageMismatch','zh-CN')));
  const retry=card.testShadow.querySelector('.retry');assert.equal(retry.hidden,false);
  assert.match(card.testShadow.querySelector('pre').textContent,/output_tokens/);
  page.tick(10000);page.intersect();page.mutate();page.tick();
  assert.equal(page.port.sent.filter(value=>value.type==='ANALYZE'&&value.post.id===request.post.id).length,1);
  retry.emit('click');page.flush();page.tick();
  assert.equal(page.port.sent.filter(value=>value.type==='ANALYZE'&&value.post.id===request.post.id).length,2);
  assert.deepEqual(page.writes,[]);
});

test('mode changes reset existing answers and reject late results from the previous style',()=>{
  const page=fixture();page.configure({explanationMode:'custom'});page.intersect();page.tick();
  const request=page.port.sent.find(value=>value.type==='ANALYZE');
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text:'Old custom answer',sources:[]}});page.flush();
  assert.match(page.cards()[0].testShadow.textContent,/Old custom answer/);
  page.configure({explanationMode:'preset'});page.intersect();page.tick();
  assert.doesNotMatch(page.cards()[0].testShadow.textContent,/Old custom answer/);
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'explain',text:'Late obsolete stream'});page.flush();
  assert.doesNotMatch(page.cards()[0].testShadow.textContent,/Late obsolete stream/);
  assert.equal(page.port.sent.filter(value=>value.type==='ANALYZE'&&value.post.id===request.post.id).length,2);
  assert.deepEqual(page.writes,[]);
});

test('all API modes cancel stale visible-text comments on expansion and preserve the full-post analysis',()=>{
  for(const explanationMode of ['preset','custom']) {
  const page=fixture();page.articles[0].postData.language='en';page.configure({explanationMode});page.intersect();page.tick();
  const request=page.port.sent.find(value=>value.type==='ANALYZE'),card=page.cards()[0],article=page.articles[0];
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text:'Original natural answer',sources:[]}});page.flush();
  card.testShadow.querySelectorAll('button').find(button=>button.textContent===ui.t('common.generateComments','zh-CN')).emit('click');page.flush();
  const comment=page.port.sent.find(value=>value.type==='GENERATE_COMMENTS');assert.ok(comment);
  article.postData={...article.postData,text:'Expanded comment input'};page.mutate();page.tick();
  assert.equal(page.cards()[0],card);assert.match(card.testShadow.textContent,/Original natural answer/);
  assert.ok(page.port.sent.some(value=>value.type==='CANCEL'&&value.requestId===comment.requestId));
  assert.equal(page.port.sent.filter(value=>value.type==='ANALYZE'&&value.post.id===request.post.id).length,1);
  page.port.onMessage.emit({type:'COMMENT_RESULT',requestId:comment.requestId,comments:['Stale draft one.','Stale draft two.','Stale draft three.']});page.flush();
  assert.doesNotMatch(card.testShadow.textContent,/Stale draft/);assert.deepEqual(page.writes,[]);
  }
});

test('queued and running offscreen API work cancels independently without erasing other cards',()=>{
  const page=fixture();page.configure({dwellMs:120});page.intersect();page.tick();page.tick(130);
  const requests=page.port.sent.filter(m=>m.type==='ANALYZE');const first=requests[0],second=requests[1];
  page.port.onMessage.emit({type:'START',requestId:first.requestId,used:1});
  page.port.onMessage.emit({type:'UPDATE',requestId:first.requestId,phase:'explain',text:'Retained preview'});page.flush();
  page.articles[0].rect={...page.articles[0].rect,top:-500,bottom:-200};page.tick(100);page.tick(1100);
  assert.ok(page.port.sent.some(m=>m.type==='CANCEL'&&m.requestId===first.requestId));
  assert.equal(page.port.sent.some(m=>m.type==='CANCEL'&&m.requestId===second.requestId),false);
  assert.match(page.cards()[0].testShadow.textContent,/Retained preview/);
  assert.ok(page.cards()[0].testShadow.textContent.includes(ui.t('note.cancelled','zh-CN')));
  page.port.onMessage.emit({type:'RESULT',requestId:first.requestId,result:{provider:'api',text:'Ignored late answer',sources:[]}});page.flush();
  assert.doesNotMatch(page.cards()[0].testShadow.textContent,/Ignored late answer/);
});

test('API failure diagnostics stay in an optional detail and clear before retry', () => {
  const page=fixture();page.configure();page.intersect();page.tick();page.tick(400);
  const request=page.port.sent.find(m=>m.type==='ANALYZE');assert.ok(request);
  page.port.onMessage.emit({type:'ERROR',requestId:request.requestId,error:'Network unavailable',code:'API_STREAM_ERROR',diagnostics:{responseEvents:1,status:'interrupted'}});
  const rendered=page.cards().map(c=>c.testShadow.textContent).join('');
  assert.ok(rendered.includes(ui.t('common.diagnostics','zh-CN')));assert.match(rendered,/responseEvents/);
  assert.equal(page.nodes.filter(n=>n.tagName==='DETAILS'&&!n.hidden).length,1);
  const retry=page.nodes.find(n=>n.className==='retry'&&!n.hidden);
  retry.emit('click');page.flush();
  assert.equal(page.nodes.filter(n=>n.tagName==='DETAILS'&&!n.hidden).length,0);
  assert.deepEqual(page.writes,[]);
});

function verificationFailureUI(card) {
  const shadow=card.testShadow;
  return {status:shadow.querySelector('.status'),answer:shadow.querySelector('.answer'),note:shadow.querySelector('.note'),
    diagnostics:shadow.querySelector('.diagnostics'),detail:shadow.querySelector('.diagnostics').querySelector('pre'),
    wait:shadow.querySelector('.verification-thinking'),retry:shadow.querySelector('.retry')};
}

const verificationFailureCases=[
  ['OUTPUT_LIMIT','verification.outputLimit'],['INCOMPLETE','verification.incomplete'],
  ['CONNECTION','verification.connection'],['LANGUAGE_MISMATCH','verification.languageMismatch'],
  ['RATE_LIMIT','verification.rateLimit'],['ACCESS','verification.access'],
  ['SERVER','verification.server'],['TIMEOUT','verification.timeout'],['UNKNOWN','verification.unknown']
];

test('unfinished live and cached fact checks identify a safe local reason while retaining the explanation',()=>{
  for(const cached of [false,true])for(const [code,key] of verificationFailureCases) {
    const page=fixture({postCount:1});page.configure({explanationMode:'preset',language:'en'});
    const request=page.port.sent.find(message=>message.type==='ANALYZE'),card=page.cards()[0],failure=verificationFailureUI(card);
    if(!cached)beginVerification(page,request,card);
    page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,cached,result:{provider:'api',text:'Preserved explanation',sources:[],searched:true,
      verificationStatus:'incomplete',verificationFailure:{stage:'verify',code,reason:'raw-backend-reason-canary'},warning:'raw-backend-warning-canary'}});page.flush();
    const label=ui.t('status.incomplete','zh-CN');
    assert.equal(failure.status.textContent,cached?ui.t('status.cached','zh-CN')+' · '+label:label,code);
    assert.equal(failure.status.title,ui.t(key,'zh-CN'),code);
    assert.equal(failure.answer.textContent,'Preserved explanation');assert.equal(failure.note.textContent,ui.t('note.preserved','zh-CN'));
    assert.equal(failure.diagnostics.hidden,false);assert.ok(failure.detail.textContent.startsWith(ui.t(key,'zh-CN')+'\n'));
    const publicMetadata=JSON.parse(failure.detail.textContent.slice(failure.detail.textContent.indexOf('\n')+1));
    assert.deepEqual(publicMetadata,{stage:'verify',code});
    assert.doesNotMatch(card.testShadow.textContent+failure.status.title,/raw-backend-(?:reason|warning)-canary|Partial answer/);
    assert.equal(failure.wait.hidden,true);assert.equal(failure.status.classList.contains('shimmer'),false);
    assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1,'Showing an incomplete check does not trigger a paid automatic retry');
    assert.deepEqual(page.writes,[]);
  }
});

test('legacy unfinished cached checks report an unknown reason without guessing from old warning text',()=>{
  for(const verificationStatus of ['incomplete','failed']) {
    const page=fixture({postCount:1});page.configure({language:'en'});
    const request=page.port.sent.find(message=>message.type==='ANALYZE'),card=page.cards()[0],failure=verificationFailureUI(card);
    page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,cached:true,result:{provider:'api',text:'Legacy preserved explanation',sources:[],
      verificationStatus,warning:'Legacy max_output_tokens limit connection HTTP 429 raw-warning-canary'}});page.flush();
    assert.equal(failure.status.textContent,ui.t('status.cached','zh-CN')+' · '+ui.t('status.incomplete','zh-CN'));
    assert.equal(failure.status.title,ui.t('verification.unknown','zh-CN'));
    assert.match(failure.detail.textContent,/"code": "UNKNOWN"/);assert.doesNotMatch(failure.detail.textContent,/OUTPUT_LIMIT|CONNECTION|RATE_LIMIT|raw-warning-canary/);
    assert.equal(failure.answer.textContent,'Legacy preserved explanation');assert.equal(failure.note.textContent,ui.t('note.preserved','zh-CN'));
    assert.equal(failure.diagnostics.hidden,false);assert.equal(failure.wait.hidden,true);assert.deepEqual(page.writes,[]);
  }
});

test('malformed verification metadata cannot leak backend text or create markup in failure diagnostics',()=>{
  const hostile='private-key-canary <img src=x onerror=run()> https://secret.example/?token=hidden';
  const cases=[
    [null,'UNKNOWN'],[hostile,'UNKNOWN'],[{stage:'explain',code:'OUTPUT_LIMIT',reason:hostile},'UNKNOWN'],
    [{stage:'verify',code:hostile,reason:hostile},'UNKNOWN'],[{stage:'verify',code:{message:hostile}},'UNKNOWN'],
    [{stage:'verify',code:'__proto__',reason:hostile},'UNKNOWN'],[{stage:'verify',code:'constructor',reason:hostile},'UNKNOWN'],
    [{stage:'verify',code:'ACCESS',reason:hostile,message:hostile,diagnostics:{key:hostile}},'ACCESS']
  ];
  for(const [verificationFailure,expectedCode] of cases) {
    const page=fixture({postCount:1});page.configure({language:'en'});
    const request=page.port.sent.find(message=>message.type==='ANALYZE'),card=page.cards()[0],failure=verificationFailureUI(card);
    page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,cached:true,result:{provider:'api',text:'Useful explanation',sources:[],verificationStatus:'incomplete',
      verificationFailure,warning:hostile,error:hostile,diagnostics:{response:hostile}}});page.flush();
    const key=verificationFailureCases.find(([code])=>code===expectedCode)[1];
    assert.equal(failure.status.title,ui.t(key,'zh-CN'));
    assert.deepEqual(JSON.parse(failure.detail.textContent.slice(failure.detail.textContent.indexOf('\n')+1)),{stage:'verify',code:expectedCode});
    assert.doesNotMatch(card.testShadow.textContent+failure.status.title,/private-key-canary|onerror|secret\.example|token=hidden|constructor|__proto__/);
    assert.equal(failure.diagnostics.querySelectorAll('img,script,iframe,a').length,0);
    assert.equal(failure.answer.textContent,'Useful explanation');assert.deepEqual(page.writes,[]);
  }
});

test('fact check diagnostics retain known stop reasons and bounded HTTP statuses for locating the actual failure',()=>{
  const cases=[
    {code:'OUTPUT_LIMIT',reason:'max_output_tokens',errorCode:'API_INCOMPLETE',httpStatus:200},
    {code:'INCOMPLETE',reason:'content_filter',errorCode:'API_INCOMPLETE'},
    {code:'CONNECTION',errorCode:'API_STREAM_INTERRUPTED'},
    {code:'CONNECTION',errorCode:'API_STREAM_ERROR'},
    {code:'LANGUAGE_MISMATCH',errorCode:'API_LANGUAGE_MISMATCH'},
    {code:'RATE_LIMIT',errorCode:'RATE_LIMIT',httpStatus:429},
    {code:'SERVER',errorCode:'API_ERROR',httpStatus:503},
    {code:'INCOMPLETE',errorCode:'CANCELED'},
    {code:'TIMEOUT',errorCode:'TIMEOUT'}
  ];
  for(const metadata of cases) {
    const page=fixture({postCount:1});page.configure({language:'en'});
    const request=page.port.sent.find(message=>message.type==='ANALYZE'),card=page.cards()[0],failure=verificationFailureUI(card);
    page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text:'Useful retained explanation.',sources:[],verificationStatus:'incomplete',
      verificationFailure:{stage:'verify',...metadata,message:'private-message-canary',headers:{authorization:'private-header-canary'}}}});page.flush();
    assert.deepEqual(JSON.parse(failure.detail.textContent.slice(failure.detail.textContent.indexOf('\n')+1)),{stage:'verify',...metadata});
    assert.equal(failure.status.title,ui.t(verificationFailureCases.find(([code])=>code===metadata.code)[1],'zh-CN'));
    assert.doesNotMatch(failure.detail.textContent,/private-message-canary|private-header-canary|authorization/);
    assert.equal(failure.answer.textContent,'Useful retained explanation.');assert.deepEqual(page.writes,[]);
  }
});

test('unknown failure categories and invalid HTTP or stop-reason fields do not enter the public diagnosis',()=>{
  const cases=[
    {stage:'verify',code:'OUTPUT_LIMIT',reason:'arbitrary-secret-canary',errorCode:'API_KEY_arbitrary-secret-canary',httpStatus:'429'},
    {stage:'verify',code:'CONNECTION',reason:{message:'arbitrary-secret-canary'},errorCode:['API_STREAM_ERROR'],httpStatus:429.5},
    {stage:'verify',code:'SERVER',httpStatus:99},{stage:'verify',code:'SERVER',httpStatus:600},
    {stage:'verify',code:'SERVER',httpStatus:NaN},{stage:'verify',code:'SERVER',httpStatus:Infinity},
    {stage:'verify',code:'SERVER',httpStatus:Number.MAX_SAFE_INTEGER+1},
    {stage:'explain',code:'OUTPUT_LIMIT',reason:'max_output_tokens',errorCode:'API_INCOMPLETE',httpStatus:200},
    {stage:'verify',code:'invalid',reason:'max_output_tokens',errorCode:'API_INCOMPLETE',httpStatus:200}
  ];
  for(const verificationFailure of cases) {
    const page=fixture({postCount:1});page.configure({language:'en'});
    const request=page.port.sent.find(message=>message.type==='ANALYZE'),card=page.cards()[0],failure=verificationFailureUI(card);
    page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text:'Retained explanation.',sources:[],verificationStatus:'incomplete',verificationFailure}});page.flush();
    const code=verificationFailure.stage==='verify'&&verificationFailure.code!=='invalid'?verificationFailure.code:'UNKNOWN';
    assert.deepEqual(JSON.parse(failure.detail.textContent.slice(failure.detail.textContent.indexOf('\n')+1)),{stage:'verify',code});
    assert.doesNotMatch(failure.detail.textContent,/arbitrary-secret-canary|max_output_tokens|API_INCOMPLETE|httpStatus|NaN|Infinity/);
    assert.equal(failure.answer.textContent,'Retained explanation.');assert.deepEqual(page.writes,[]);
  }
});

test('a failed background check retains useful text and exposes only its classified failure rather than raw API diagnostics',()=>{
  for(const verificationStatus of ['incomplete',undefined]) {
    const page=fixture({postCount:1});page.configure({language:'en'});
    const request=page.port.sent.find(message=>message.type==='ANALYZE'),card=page.cards()[0];beginVerification(page,request,card);
    const failure=verificationFailureUI(card),initial='Preserved explanation',check='A useful partial check.';
    page.port.onMessage.emit({type:'ERROR',requestId:request.requestId,code:'API_STREAM_ERROR',error:'raw-api-error-canary',diagnostics:{response:'raw-response-canary'},
      partialResult:{provider:'api',text:initial+'\n\n'+check,verificationStart:initial.length+2,sources:[],verificationStatus,
        verificationFailure:{stage:'verify',code:'CONNECTION',reason:'raw-reason-canary'}}});page.flush();
    assert.equal(failure.status.textContent,ui.t('status.incomplete','zh-CN'));assert.equal(failure.status.title,ui.t('verification.connection','zh-CN'));assert.equal(failure.diagnostics.hidden,false);
    assert.ok(failure.detail.textContent.startsWith(ui.t('verification.connection','zh-CN')+'\n'));
    assert.match(failure.detail.textContent,/"code": "CONNECTION"/);assert.doesNotMatch(card.testShadow.textContent+failure.status.title,/raw-(?:api-error|response|reason)-canary/);
    const progress=verificationUI(card);assert.equal(progress.explanation.textContent,initial);assert.equal(progress.verification.textContent,check);
    assert.equal(progress.divider.hidden,false);assert.equal(failure.wait.hidden,true);assert.equal(failure.note.textContent,ui.t('note.preserved','zh-CN'));
    assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);assert.deepEqual(page.writes,[]);
  }
});

test('a timed-out fact check preserves its completed explanation, evidence and reported billing without an automatic retry',()=>{
  const page=fixture({postCount:1});page.configure({language:'en'});
  const request=page.port.sent.find(message=>message.type==='ANALYZE'),card=page.cards()[0];beginVerification(page,request,card);
  const failure=verificationFailureUI(card),source={url:'https://example.com/retrieved',title:'Original evidence'},usage={input_tokens:20,output_tokens:10,total_tokens:30};
  page.port.onMessage.emit({type:'ERROR',requestId:request.requestId,code:'TIMEOUT',error:'raw-timeout-diagnostic-canary',usage,usageComplete:false,model:'grok-explanation',
    partialResult:{provider:'api',text:'Completed explanation before the check.',sources:[source],verificationStatus:'incomplete',
      verificationFailure:{stage:'verify',code:'TIMEOUT',errorCode:'TIMEOUT'},usage,usageComplete:false,model:'grok-explanation'}});page.flush();
  assert.equal(failure.status.textContent,ui.t('status.incomplete','zh-CN'));assert.equal(failure.status.title,ui.t('verification.timeout','zh-CN'));
  assert.equal(failure.answer.textContent,'Completed explanation before the check.');assert.equal(failure.note.textContent,ui.t('note.preserved','zh-CN'));
  assert.equal(failure.wait.hidden,true);assert.equal(failure.status.classList.contains('shimmer'),false);assert.equal(failure.diagnostics.hidden,false);
  assert.deepEqual(JSON.parse(failure.detail.textContent.slice(failure.detail.textContent.indexOf('\n')+1)),{stage:'verify',code:'TIMEOUT',errorCode:'TIMEOUT'});
  assert.deepEqual(card.testShadow.querySelector('.sources').querySelectorAll('a').map(link=>link.href),[source.url]);
  assertTokenCount(card,30);assert.match(tokenHeader(card).title,/grok-explanation/);assert.doesNotMatch(card.testShadow.textContent,/raw-timeout-diagnostic-canary/);
  page.tick(10000);page.intersect();
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);assert.deepEqual(page.writes,[]);
});

test('unfinished check reasons follow the X interface language without changing the retained answer or issuing another analysis',()=>{
  const page=fixture({postCount:1});page.configure({language:'en'});page.document.documentElement.lang='en';page.mutate([{type:'attributes',attributeName:'lang',target:page.document.documentElement}]);
  const request=page.port.sent.find(message=>message.type==='ANALYZE'),card=page.cards()[0],failure=verificationFailureUI(card);
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,cached:true,result:{provider:'api',text:'Retained English explanation.',sources:[],verificationStatus:'incomplete',
    verificationFailure:{stage:'verify',code:'OUTPUT_LIMIT'}}});page.flush();
  assert.equal(failure.status.textContent,ui.t('status.cached','en')+' · '+ui.t('status.incomplete','en'));assert.doesNotMatch(failure.status.textContent,/Partial answer/);
  assert.equal(failure.status.title,ui.t('verification.outputLimit','en'));assert.equal(failure.note.textContent,ui.t('note.preserved','en'));
  const before=page.port.sent.length;
  page.document.documentElement.lang='ja';page.mutate([{type:'attributes',attributeName:'lang',target:page.document.documentElement}]);
  assert.equal(failure.status.textContent,ui.t('status.cached','ja')+' · '+ui.t('status.incomplete','ja'));
  assert.equal(failure.status.title,ui.t('verification.outputLimit','ja'));assert.ok(failure.detail.textContent.startsWith(ui.t('verification.outputLimit','ja')+'\n'));
  assert.equal(failure.note.textContent,ui.t('note.preserved','ja'));assert.equal(failure.answer.textContent,'Retained English explanation.');
  assert.equal(page.port.sent.slice(before).some(message=>['ANALYZE','GENERATE_COMMENTS','CANCEL','CANCEL_ALL','SET_LANGUAGE'].includes(message.type)),false);assert.deepEqual(page.writes,[]);
});

test('retry and completion clear an earlier fact check failure even when obsolete or completed metadata still contains it',()=>{
  const page=fixture({postCount:1});page.configure({language:'en'});
  const request=page.port.sent.find(message=>message.type==='ANALYZE'),card=page.cards()[0],failure=verificationFailureUI(card);
  const verificationFailure={stage:'verify',code:'OUTPUT_LIMIT'};
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text:'First preserved explanation',sources:[],verificationStatus:'incomplete',verificationFailure}});page.flush();
  assert.equal(failure.diagnostics.hidden,false);assert.equal(failure.status.title,ui.t('verification.outputLimit','zh-CN'));
  failure.retry.emit('click');page.flush();
  const next=page.port.sent.filter(message=>message.type==='ANALYZE').at(-1);assert.notEqual(next.requestId,request.requestId);
  assert.equal(failure.status.title,'');assert.equal(failure.diagnostics.hidden,true);assert.equal(failure.detail.textContent,'');assert.equal(failure.note.textContent,'');
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text:'Obsolete retained answer',sources:[],verificationStatus:'incomplete',verificationFailure}});page.flush();
  assert.equal(failure.status.title,'');assert.equal(failure.diagnostics.hidden,true);assert.equal(failure.detail.textContent,'');assert.doesNotMatch(failure.answer.textContent,/Obsolete/);
  page.port.onMessage.emit({type:'RESULT',requestId:next.requestId,result:{provider:'api',text:'Fresh complete answer',sources:[],searched:true,verificationStatus:'completed',verificationFailure}});page.flush();
  assert.equal(failure.status.title,'');assert.equal(failure.diagnostics.hidden,true);assert.equal(failure.detail.textContent,'');assert.equal(failure.answer.textContent,'Fresh complete answer');
  assert.equal(failure.status.textContent,ui.t('status.searched','zh-CN'));assert.equal(failure.note.textContent,ui.t('note.possibleErrors','zh-CN'));
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,2);assert.deepEqual(page.writes,[]);
});

test('changing analysis mode clears retained failure details before fresh work and rejects the old diagnostic metadata',()=>{
  const page=fixture({postCount:1});page.configure({explanationMode:'custom',language:'en'});
  const request=page.port.sent.find(message=>message.type==='ANALYZE'),original=page.cards()[0],failure=verificationFailureUI(original);
  const verificationFailure={stage:'verify',code:'OUTPUT_LIMIT',reason:'max_output_tokens',errorCode:'API_INCOMPLETE'};
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text:'Old preserved explanation.',sources:[],verificationStatus:'incomplete',verificationFailure}});page.flush();
  assert.equal(failure.diagnostics.hidden,false);
  page.configure({explanationMode:'preset',language:'en'});const current=verificationFailureUI(page.cards()[0]);
  assert.equal(current.status.title,'');assert.equal(current.diagnostics.hidden,true);assert.equal(current.detail.textContent,'');assert.equal(current.note.textContent,'');
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text:'Stale unfinished answer.',sources:[],verificationStatus:'incomplete',verificationFailure}});page.flush();
  assert.equal(current.status.title,'');assert.equal(current.diagnostics.hidden,true);assert.equal(current.detail.textContent,'');assert.doesNotMatch(current.answer.textContent,/Old preserved|Stale unfinished/);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,2);assert.deepEqual(page.writes,[]);
});








test('provider quota exhaustion remains visible on subsequent posts and stops automatic dispatch',()=>{
  const page=fixture();page.configure();page.intersect();page.tick();page.tick(400);
  const request=page.port.sent.find(m=>m.type==='ANALYZE');
  page.port.onMessage.emit({type:'ERROR',requestId:request.requestId,code:'RATE_LIMIT',error:'xAI API 额度已用尽，自动分析已暂停。'});
  const second=page.articles.find(a=>a.postData.id!==request.post.id);second.postData={...second.postData,id:'999',url:'https://x.com/test/status/999',text:'Next visible post'};
  page.mutate();page.intersect();page.tick(10000);
  assert.equal(page.port.sent.filter(m=>m.type==='ANALYZE').length,2);
  const visibleText=page.displayedCards().map(c=>c.testShadow.textContent).join('');
  assert.match(visibleText,/额度已用尽/);assert.doesNotMatch(visibleText,/停留片刻，自动解释/);assert.deepEqual(page.writes,[]);
});

const suggestions=['The context could help clarify this point.','I would like to see the original source.','Which assumption matters most here?'];
function completeFirst(page,text='Completed original explanation') {
  const request=page.port.sent.find(message=>message.type==='ANALYZE');assert.ok(request);
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:request.post.provider||'api',text,sources:[],verificationStatus:'unverified'}});page.flush();
  const card=page.cards()[page.articles.findIndex(article=>article.postData.id===request.post.id)];
  return {request,card,generate:card.testShadow.querySelector('.generate-comments')};
}

test('profile-page Settings remains reachable through a direct runtime message after the feed port disconnects',async()=>{
  const page=fixture({postCount:1});page.location.pathname='/elonmusk';page.configure();
  const {card}=completeFirst(page);page.port.onDisconnect.emit();page.flush();
  const sent=page.port.sent.length,gear=page.nodes.find(node=>node.className==='rail-settings');
  gear.emit('click');await new Promise(resolve=>setImmediate(resolve));page.flush();
  assert.deepEqual(JSON.parse(JSON.stringify(page.runtimeMessages)),[{type:'OPEN_SETTINGS',focus:'api-key'}]);
  assert.equal(page.port.sent.slice(sent).some(message=>message.type==='OPEN_SETTINGS'),false);
  assert.equal(card.testShadow.querySelector('.answer').textContent,'Completed original explanation');
  assert.equal(card.testShadow.querySelector('.generate-comments').hidden,false);
  assert.deepEqual(page.writes,[]);
});

test('Settings preserves its focus target when falling back to a connected older worker',async()=>{
  const page=fixture({postCount:1});page.flush();
  page.context.chrome.runtime.sendMessage=async message=>{page.runtimeMessages.push(message);return {ok:false};};
  page.cards()[0].testShadow.querySelector('.status-settings').emit('click');
  await new Promise(resolve=>setImmediate(resolve));page.flush();
  assert.deepEqual(JSON.parse(JSON.stringify(page.runtimeMessages)),[{type:'OPEN_SETTINGS',focus:'api-key'}]);
  assert.deepEqual(JSON.parse(JSON.stringify(page.port.sent.filter(message=>message.type==='OPEN_SETTINGS'))),[{type:'OPEN_SETTINGS',focus:'api-key'}]);
  assert.equal(page.port.sent.some(message=>['ANALYZE','GENERATE_COMMENTS'].includes(message.type)),false);
  assert.deepEqual(page.writes,[]);
});

test('a failed comment send leaves no permanent waiting state and reconnecting never automatically replays the paid draft',()=>{
  const page=fixture({postCount:1});page.location.pathname='/elonmusk';page.configure();
  const {card,generate}=completeFirst(page),originalPort=page.port;
  page.failPortSend(new Error('Attempting to use a disconnected port object'));
  generate.emit('click');page.flush();
  assert.equal(generate.hidden,true);assert.equal(generate.disabled,true);
  assert.equal(card.testShadow.querySelector('.comment-status').hidden,false);
  assert.equal(card.testShadow.querySelector('.comment-status').textContent,ui.t('status.connectionLost','zh-CN'));
  assert.equal(card.testShadow.querySelector('.answer').textContent,'Completed original explanation');
  assert.equal(originalPort.sent.some(message=>message.type==='GENERATE_COMMENTS'),false);
  assert.deepEqual(page.pendingTimeouts().filter(delay=>delay===3000),[3000]);
  page.failPortSend(null);page.replacePort();page.runTimeouts(3000);page.configure();page.tick(10000);
  assert.equal(generate.hidden,false);assert.equal(generate.disabled,false);
  assert.equal(page.port.sent.some(message=>message.type==='GENERATE_COMMENTS'),false);
  generate.emit('click');page.flush();
  assert.equal(page.port.sent.filter(message=>message.type==='GENERATE_COMMENTS').length,1);
  assert.deepEqual(page.writes,[]);
});

test('a failed comment cancellation during reanalysis cannot strand a new analysis in an unsent queue',()=>{
  const page=fixture({postCount:1});page.configure();const {card,generate}=completeFirst(page);
  const retry=card.testShadow.querySelector('.retry'),originalPort=page.port;
  generate.emit('click');assert.equal(originalPort.sent.filter(message=>message.type==='GENERATE_COMMENTS').length,1);
  page.failPortSend(new Error('Attempting to use a disconnected port object'));
  retry.emit('click');page.flush();
  assert.equal(card.testShadow.querySelector('.answer').textContent,'Completed original explanation');
  assert.equal(card.testShadow.querySelector('.status').hidden,true,'Completed analysis is not falsely marked disconnected');
  assert.equal(card.testShadow.querySelector('.comment-status').textContent,ui.t('status.connectionLost','zh-CN'));
  assert.equal(originalPort.sent.filter(message=>message.type==='ANALYZE').length,1);
  assert.equal(generate.hidden,true);assert.equal(retry.disabled,true);
  page.failPortSend(null);page.replacePort();page.runTimeouts(3000);page.configure();page.tick(10000);
  assert.equal(retry.disabled,false);
  assert.equal(page.port.sent.some(message=>['ANALYZE','GENERATE_COMMENTS'].includes(message.type)),false);
  assert.equal(card.testShadow.querySelector('.answer').textContent,'Completed original explanation');
  retry.emit('click');page.flush();
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);
  assert.equal(page.port.sent.some(message=>message.type==='GENERATE_COMMENTS'),false);
  assert.equal(card.testShadow.querySelector('.status').textContent,ui.t('status.queued','zh-CN'));
  assert.deepEqual(page.writes,[]);
});

test('an initial transient runtime connection failure schedules one retry and restores usable controls after CONFIG',()=>{
  const page=fixture({postCount:1,connectError:new Error('Could not establish connection. Receiving end does not exist.')});page.flush();
  assert.equal(page.connectionAttempts(),1);
  assert.deepEqual(page.pendingTimeouts().filter(delay=>delay===3000),[3000]);
  assert.equal(page.cards()[0].testShadow.querySelector('.status').textContent,ui.t('status.connectionLost','zh-CN'));
  page.failConnect(null);page.runTimeouts(3000);page.configure();
  assert.equal(page.connectionAttempts(),2);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);
  assert.equal(page.cards()[0].testShadow.querySelector('.generate-comments').hidden,false);
  assert.deepEqual(page.writes,[]);
});

test('old port messages and late disconnects cannot disable a successfully reconnected feed',()=>{
  const page=fixture({postCount:1});page.configure();const {card,generate}=completeFirst(page);
  const oldPort=page.port;oldPort.onDisconnect.emit();page.flush();page.replacePort();
  generate.emit('click');page.configure();
  const pending=page.port.sent.find(message=>message.type==='GENERATE_COMMENTS');assert.ok(pending);
  page.port.onMessage.emit({type:'COMMENT_RESULT',requestId:pending.requestId,comments:suggestions});page.flush();
  assert.equal(generate.hidden,false);
  oldPort.onMessage.emit({type:'CONFIG',settings:{...API_SETTINGS,enabled:false},ready:false,keyState:'missing'});
  oldPort.onDisconnect.emit();page.flush();
  assert.equal(generate.hidden,false);assert.equal(generate.disabled,false);
  assert.equal(card.testShadow.querySelector('.answer').textContent,'Completed original explanation');
  assert.equal(page.pendingTimeouts().filter(delay=>delay===3000).length,0);
  assert.equal(page.port.sent.filter(message=>message.type==='GENERATE_COMMENTS').length,1);
  assert.deepEqual(page.writes,[]);
});

test('invalidated extension context reveals a reload action, retains reading and does not repeatedly reconnect or rebill',async()=>{
  const page=fixture({postCount:1});page.configure();const {card,generate}=completeFirst(page);
  page.failPortSend(new Error('Extension context invalidated.'));
  generate.emit('click');page.flush();
  assert.equal(generate.hidden,true);assert.equal(generate.disabled,true);
  assert.equal(card.testShadow.querySelector('.comment-status').textContent,ui.t('status.refreshRequired','zh-CN'));
  assert.equal(card.testShadow.querySelector('.answer').textContent,'Completed original explanation');
  assert.equal(page.pendingTimeouts().filter(delay=>delay===3000).length,0);
  const refresh=page.nodes.find(node=>node.isConnected&&node.tagName==='BUTTON'&&node.textContent===ui.t('common.refreshPage','zh-CN'));
  assert.ok(refresh,'A disconnected old extension page offers an explicit refresh action');
  const attempts=page.connectionAttempts();page.runTimeouts(3000);page.tick(10000);
  assert.equal(page.connectionAttempts(),attempts);
  assert.equal(page.port.sent.some(message=>message.type==='GENERATE_COMMENTS'),false);
  refresh.emit('click');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(page.reloadCount(),1);assert.deepEqual(page.writes,[]);
});

test('Settings runtime failure exposes refresh recovery instead of silently dropping the gear click',async()=>{
  const page=fixture({postCount:1});page.configure();const {card,generate}=completeFirst(page);
  page.failRuntimeSend(new Error('Extension context invalidated.'));
  const gear=page.nodes.find(node=>node.className==='rail-settings');gear.emit('click');
  await new Promise(resolve=>setImmediate(resolve));page.flush();
  assert.equal(generate.hidden,true);assert.equal(generate.disabled,true);
  assert.equal(card.testShadow.querySelector('.answer').textContent,'Completed original explanation');
  assert.ok(page.nodes.some(node=>node.isConnected&&node.tagName==='BUTTON'&&node.textContent===ui.t('common.refreshPage','zh-CN')));
  assert.equal(page.port.sent.some(message=>message.type==='OPEN_SETTINGS'),false);
  assert.equal(page.pendingTimeouts().filter(delay=>delay===3000).length,0);
  assert.deepEqual(page.writes,[]);
});

test('more than 24 visible posts are submitted immediately through API, independent of legacy session settings',()=>{
  for(const provider of ['api']) {
    const page=fixture({postCount:35});page.context.innerHeight=12000;
    page.configure({provider,dwellMs:10000,maxPerSession:1,cooldownMs:60000});
    const sent=page.port.sent.filter(message=>message.type==='ANALYZE');
    assert.equal(sent.length,35,provider+' dispatches all visible posts before waiting or IntersectionObserver delivery');
    assert.deepEqual(sent.map(message=>message.post.id),page.articles.map(article=>article.postData.id));
    page.intersect();page.tick(1);assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,35);
    assert.equal(new Set(sent.map(message=>message.requestId)).size,35);assert.deepEqual(page.writes,[]);
  }
});

test('X interface locale changes update labels without cancelling work, changing answer language or regenerating text',()=>{
  const page=fixture();page.configure({language:'en'});const {request,card}=completeFirst(page,'An English explanation.');
  const generate=card.testShadow.querySelector('.generate-comments');generate.emit('click');page.flush();
  const comments=page.port.sent.find(message=>message.type==='GENERATE_COMMENTS');
  const before=page.port.sent.length;
  page.document.documentElement.lang='ja';page.port.onMessage.emit({type:'UI_LANGUAGE',language:'ja'});page.mutate([{type:'attributes',attributeName:'lang',target:page.document.documentElement}]);
  assert.equal(generate.textContent,ui.t('common.generateComments','ja'));
  const select=page.nodes.find(node=>node.className==='rail-language');assert.equal(select.value,'en');
  assert.equal(select.getAttribute('aria-label'),ui.t('aria.outputLanguage','ja'));
  assert.equal(page.nodes.find(node=>node.className==='rail-settings').getAttribute('aria-label'),ui.t('common.settings','ja'));
  assert.equal(card.testShadow.querySelector('.answer').textContent,'An English explanation.');
  assert.equal(page.port.sent.slice(before).some(message=>['CANCEL','CANCEL_ALL','SET_LANGUAGE','SAVE_SETTINGS','ANALYZE','GENERATE_COMMENTS'].includes(message.type)),false);
  page.port.onMessage.emit({type:'COMMENT_RESULT',requestId:comments.requestId,comments:suggestions});page.flush();
  assert.deepEqual(card.testShadow.querySelectorAll('.comment-copy').map(button=>button.textContent),suggestions);
  assert.ok(card.testShadow.querySelectorAll('.comment-copy').every(button=>button.title===ui.t('common.copy','ja')));
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE'&&message.post.id===request.post.id).length,1);assert.deepEqual(page.writes,[]);
});

test('manual SuperX language relabels the rail without restarting paid explanations or comment drafts',()=>{
  const page=fixture();page.document.documentElement.lang='en';page.configure({language:'en',interfaceLanguage:'auto'});
  const {request,card,generate}=completeFirst(page,'An English explanation kept while relabeling.');
  const next=page.port.sent.find(message=>message.type==='ANALYZE'&&message.requestId!==request.requestId);assert.ok(next);
  page.port.onMessage.emit({type:'START',requestId:next.requestId});
  page.port.onMessage.emit({type:'UPDATE',requestId:next.requestId,text:'A second English explanation is streaming.',phase:'explain'});page.flush();
  generate.emit('click');const comments=page.port.sent.find(message=>message.type==='GENERATE_COMMENTS');assert.ok(comments);
  page.port.onMessage.emit({type:'COMMENT_START',requestId:comments.requestId});page.flush();
  const before=page.port.sent.length;
  const rail=page.nodes.find(node=>node.className==='rail'),header=page.nodes.find(node=>node.className==='rail-head');
  page.configure({language:'en',interfaceLanguage:'ar'});
  for(const element of [rail,header]) {assert.equal(element.getAttribute('lang'),'ar');assert.equal(element.getAttribute('dir'),'rtl','Arabic interface direction applies independently of the English X page');}
  assert.equal(page.document.documentElement.lang,'en');
  assert.equal(generate.textContent,ui.t('common.generateComments','ar'));
  assert.equal(card.testShadow.querySelector('.answer').getAttribute('dir'),'auto','English answer direction is based on its content, not the Arabic controls');
  page.configure({language:'en',interfaceLanguage:'auto'});
  for(const element of [rail,header]) {assert.equal(element.getAttribute('lang'),'en');assert.equal(element.getAttribute('dir'),'ltr','Returning to Auto restores the observed X direction');}
  page.configure({language:'en',interfaceLanguage:'zh-CN'});
  assert.equal(generate.textContent,ui.t('common.generateComments','zh-CN'));assert.equal(generate.disabled,true,'The original draft request remains in flight');
  assert.equal(page.nodes.find(node=>node.className==='rail-settings').getAttribute('aria-label'),ui.t('common.settings','zh-CN'));
  assert.equal(page.nodes.find(node=>node.className==='rail-language').value,'en','Answer language is independent of interface language');
  assert.equal(card.testShadow.querySelector('.answer').textContent,'An English explanation kept while relabeling.');
  assert.equal(page.cards()[1].testShadow.querySelector('.answer').textContent,'A second English explanation is streaming.');
  page.document.documentElement.lang='ja';page.mutate([{type:'attributes',attributeName:'lang',target:page.document.documentElement}]);
  assert.equal(generate.textContent,ui.t('common.generateComments','zh-CN'),'A manual choice remains stable when X changes language');
  assert.equal(page.port.sent.findLast(message=>message.type==='UI_LANGUAGE').language,'ja','Report the actual X locale, not the SuperX override');
  page.configure({language:'en',interfaceLanguage:'auto'});
  assert.equal(generate.textContent,ui.t('common.generateComments','ja'),'Auto immediately follows the latest X locale');
  for(const element of [rail,header]) {assert.equal(element.getAttribute('lang'),'ja');assert.equal(element.getAttribute('dir'),'ltr');}
  assert.equal(page.nodes.find(node=>node.className==='rail-language').value,'en');
  assert.equal(page.port.sent.slice(before).some(message=>['CANCEL','CANCEL_ALL','SET_LANGUAGE','SAVE_SETTINGS','ANALYZE','GENERATE_COMMENTS'].includes(message.type)),false);
  page.port.onMessage.emit({type:'RESULT',requestId:next.requestId,result:{text:'Second English explanation completed.',provider:'api'}});
  page.port.onMessage.emit({type:'COMMENT_RESULT',requestId:comments.requestId,comments:suggestions});page.flush();
  assert.equal(page.cards()[1].testShadow.querySelector('.answer').textContent,'Second English explanation completed.');
  assert.deepEqual(card.testShadow.querySelectorAll('.comment-copy').map(button=>button.textContent),suggestions);
  assert.ok(card.testShadow.querySelectorAll('.comment-copy').every(button=>button.title===ui.t('common.copy','ja')));
  assert.ok(card.testShadow.querySelectorAll('.comment-copy').every(button=>button.getAttribute('dir')==='auto'));
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,2);assert.equal(page.port.sent.filter(message=>message.type==='GENERATE_COMMENTS').length,1);
  assert.deepEqual(page.writes,[]);
});

test('manual interface locale also localizes Key onboarding while preserving automatic X observation',()=>{
  const page=fixture({postCount:1});page.document.documentElement.lang='en';page.mutate([{type:'attributes',attributeName:'lang',target:page.document.documentElement}]);
  const config=interfaceLanguage=>{page.port.onMessage.emit({type:'CONFIG',settings:{...API_SETTINGS,interfaceLanguage},ready:false});page.flush();};
  config('ja');const card=page.cards()[0];
  assert.equal(card.testShadow.querySelector('.status-settings').textContent,ui.t('common.settings','ja'));
  assert.equal(card.testShadow.querySelector('.status').textContent,ui.t('status.needsKeyAction','ja',{settings:ui.t('common.settings','ja')}));
  assert.equal(page.port.sent.findLast(message=>message.type==='UI_LANGUAGE').language,'en');
  page.document.documentElement.lang='de';page.mutate([{type:'attributes',attributeName:'lang',target:page.document.documentElement}]);
  assert.equal(card.testShadow.querySelector('.status-settings').textContent,ui.t('common.settings','ja'));
  assert.equal(page.port.sent.findLast(message=>message.type==='UI_LANGUAGE').language,'de');
  config('auto');
  assert.equal(card.testShadow.querySelector('.status-settings').textContent,ui.t('common.settings','de'));
  assert.equal(page.nodes.find(node=>node.className==='rail-language').value,'auto');
  assert.equal(page.port.sent.some(message=>['ANALYZE','GENERATE_COMMENTS','SET_LANGUAGE'].includes(message.type)),false);
  assert.deepEqual(page.writes,[]);
});

test('comment generation is opt-in and duplicate clicks do not dispatch duplicate work or overwrite the explanation',async()=>{
  const page=fixture();page.configure();const {card,generate}=completeFirst(page);
  assert.equal(page.port.sent.some(message=>message.type==='GENERATE_COMMENTS'),false);
  generate.emit('click');generate.emit('click');page.flush();
  const requests=page.port.sent.filter(message=>message.type==='GENERATE_COMMENTS');assert.equal(requests.length,1);
  assert.equal(requests[0].analysis.text,'Completed original explanation');assert.equal(generate.disabled,true);
  page.port.onMessage.emit({type:'COMMENT_START',requestId:requests[0].requestId});
  page.port.onMessage.emit({type:'UPDATE',requestId:requests[0].requestId,text:'UNRELATED RAW COMMENT JSON',phase:'comments'});page.flush();
  assert.equal(card.testShadow.querySelector('.answer').textContent,'Completed original explanation');
  page.port.onMessage.emit({type:'COMMENT_RESULT',requestId:requests[0].requestId,comments:suggestions,cached:true});page.flush();
  assert.equal(generate.disabled,false);
  const copies=card.testShadow.querySelectorAll('.comment-copy');assert.equal(copies.length,3);
  copies[1].emit('click');await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(page.copied,[suggestions[1]]);
  assert.equal(card.testShadow.querySelector('.copy-status').textContent,ui.t('common.copied','zh-CN'));
  assert.equal(page.port.sent.some(message=>/reply|publish|postComment/i.test(message.type)),false);assert.deepEqual(page.writes,[]);
});

test('pausing and resuming preserves completed explanations, sources, comments and usage without automatic rebilling',async()=>{
  const page=fixture({postCount:1});page.configure();
  const request=page.port.sent.find(message=>message.type==='ANALYZE');
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text:'A completed explanation.',sources:[{url:'https://example.com/evidence',title:'Evidence'}],verificationStatus:'complete',searched:true,usage:{total_tokens:123},model:'actual-model'}});page.flush();
  const card=page.cards()[0],generate=card.testShadow.querySelector('.generate-comments');
  generate.emit('click');const comments=page.port.sent.find(message=>message.type==='GENERATE_COMMENTS');
  page.port.onMessage.emit({type:'COMMENT_RESULT',requestId:comments.requestId,comments:suggestions,usage:{total_tokens:17},model:'actual-model'});page.flush();
  const answer=card.testShadow.querySelector('.answer').textContent,usage=card.testShadow.querySelector('.token-usage').textContent;
  const sent=page.port.sent.filter(message=>['ANALYZE','GENERATE_COMMENTS'].includes(message.type)).length;
  page.configure({enabled:false});
  assert.equal(card.testShadow.querySelector('.answer').textContent,answer);
  assert.equal(card.testShadow.querySelector('.sources').querySelectorAll('a')[0].href,'https://example.com/evidence');
  assert.deepEqual(card.testShadow.querySelectorAll('.comment-copy').map(button=>button.textContent),suggestions);
  assert.equal(card.testShadow.querySelector('.token-usage').textContent,usage);
  assert.equal(card.testShadow.querySelector('.retry').disabled,true);
  // Manual draft generation remains available in the background while auto
  // analysis is paused; pausing itself sends no new generation request.
  assert.equal(generate.disabled,false);
  page.configure({enabled:true});page.tick(2000);
  assert.equal(card.testShadow.querySelector('.answer').textContent,answer);
  assert.equal(card.testShadow.querySelector('.token-usage').textContent,usage);
  assert.equal(page.port.sent.filter(message=>['ANALYZE','GENERATE_COMMENTS'].includes(message.type)).length,sent);
  card.testShadow.querySelectorAll('.comment-copy')[0].emit('click');await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(page.copied,[suggestions[0]]);assert.deepEqual(page.writes,[]);
});

test('idle disconnect preserves demand-wake generation actions and completed copying controls',async()=>{
  const page=fixture({postCount:1});page.configure();const {card,generate}=completeFirst(page);
  generate.emit('click');const comments=page.port.sent.find(message=>message.type==='GENERATE_COMMENTS');
  page.port.onMessage.emit({type:'COMMENT_RESULT',requestId:comments.requestId,comments:suggestions});page.flush();
  page.port.onDisconnect.emit();page.flush();
  assert.equal(card.testShadow.querySelector('.answer').textContent,'Completed original explanation');
  assert.equal(generate.hidden,false);assert.equal(generate.disabled,false);
  assert.equal(card.testShadow.querySelector('.retry').hidden,false);
  assert.equal(card.testShadow.querySelector('.retry').disabled,false);
  card.testShadow.querySelectorAll('.comment-copy')[2].emit('click');await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(page.copied,[suggestions[2]]);
  assert.equal(page.port.sent.filter(message=>message.type==='GENERATE_COMMENTS').length,1);assert.deepEqual(page.writes,[]);
});

test('clearing a Key preserves completed reading and copy actions, then replacement restores generation without rebilling',async()=>{
  const page=fixture({postCount:1});page.configure();const {card,generate}=completeFirst(page);
  generate.emit('click');const comments=page.port.sent.find(message=>message.type==='GENERATE_COMMENTS');
  page.port.onMessage.emit({type:'COMMENT_RESULT',requestId:comments.requestId,comments:suggestions});page.flush();
  page.port.onMessage.emit({type:'CONFIG',settings:API_SETTINGS,ready:false,keyState:'missing'});page.flush();
  assert.equal(card.testShadow.querySelector('.answer').textContent,'Completed original explanation');
  assert.equal(generate.hidden,true);assert.equal(card.testShadow.querySelector('.retry').hidden,true);
  card.testShadow.querySelectorAll('.comment-copy')[0].emit('click');await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(page.copied,[suggestions[0]]);
  page.configure();page.tick(2000);
  assert.equal(generate.hidden,false);assert.equal(generate.disabled,false);
  assert.equal(card.testShadow.querySelector('.retry').hidden,false);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);
  assert.equal(page.port.sent.filter(message=>message.type==='GENERATE_COMMENTS').length,1);assert.deepEqual(page.writes,[]);
});

test('comment strings containing markup remain literal text and copy failures are visible without a fallback publish action',async()=>{
  const page=fixture();page.configure();const {card,generate}=completeFirst(page);generate.emit('click');page.flush();
  const request=page.port.sent.find(message=>message.type==='GENERATE_COMMENTS');
  const malicious=['<img src=x onerror=alert(1)> is literal text.','<script>alert(1)</script> is also literal.','[A label](javascript:alert(1)) is not a link.'];
  page.port.onMessage.emit({type:'COMMENT_RESULT',requestId:request.requestId,comments:malicious});page.flush();
  assert.deepEqual(card.testShadow.querySelectorAll('.comment-copy').map(button=>button.textContent),malicious);
  assert.equal(page.nodes.filter(node=>['IMG','SCRIPT'].includes(node.tagName)).length,0);
  assert.equal(card.testShadow.querySelectorAll('a').length,0);
  page.failClipboard();card.testShadow.querySelectorAll('.comment-copy')[0].emit('click');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(card.testShadow.querySelector('.copy-status').textContent,ui.t('common.copyFailed','zh-CN'));
  assert.deepEqual(page.copied,[]);assert.deepEqual(page.writes,[]);
});

test('comment errors can retry independently, while reanalysis clears drafts and cancels a pending comment task',()=>{
  const page=fixture();page.configure();const {card,generate}=completeFirst(page);generate.emit('click');page.flush();
  const first=page.port.sent.find(message=>message.type==='GENERATE_COMMENTS');
  page.port.onMessage.emit({type:'COMMENT_ERROR',requestId:first.requestId,code:'COMMENTS_INVALID_RESPONSE',error:'Invalid suggestions'});page.flush();
  assert.equal(generate.disabled,false);assert.equal(generate.textContent,ui.t('common.retryComments','zh-CN'));
  assert.equal(card.testShadow.querySelector('.answer').textContent,'Completed original explanation');
  generate.emit('click');page.flush();const requests=page.port.sent.filter(message=>message.type==='GENERATE_COMMENTS');assert.equal(requests.length,2);assert.equal(requests[1].force,true);
  card.testShadow.querySelector('.retry').emit('click');page.flush();
  assert.ok(page.port.sent.some(message=>message.type==='CANCEL'&&message.requestId===requests[1].requestId));
  page.port.onMessage.emit({type:'COMMENT_RESULT',requestId:requests[1].requestId,comments:suggestions});page.flush();
  assert.equal(card.testShadow.querySelectorAll('.comment-copy').length,0,'Late cancelled drafts cannot return');
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE'&&message.post.id===first.post.id).length,2);assert.deepEqual(page.writes,[]);
});

test('invalid comment result shapes never become copyable suggestions',()=>{
  for(const values of [[suggestions[0]],['',suggestions[1],suggestions[2]],[suggestions[0],suggestions[0],suggestions[2]],[123,...suggestions.slice(1)],['a'.repeat(281),...suggestions.slice(1)]]) {
    const page=fixture();page.configure();const {card,generate}=completeFirst(page);generate.emit('click');page.flush();
    const request=page.port.sent.find(message=>message.type==='GENERATE_COMMENTS');page.port.onMessage.emit({type:'COMMENT_RESULT',requestId:request.requestId,comments:values});page.flush();
    assert.equal(card.testShadow.querySelectorAll('.comment-copy').length,0);assert.equal(generate.disabled,false);assert.equal(generate.textContent,ui.t('common.retryComments','zh-CN'));
  }
});




test('comments after reanalysis use only the new partial text without stale verification status or sources',()=>{
  const page=fixture();page.configure();
  const first=page.port.sent.find(message=>message.type==='ANALYZE');
  const old={provider:'api',text:'Old verified explanation',verified:true,searched:true,verificationStatus:'complete',warning:'Old verification notice',sources:[{url:'https://example.com/old-verification',title:'Old evidence'}]};
  page.port.onMessage.emit({type:'RESULT',requestId:first.requestId,result:old});page.flush();
  const card=page.cards()[page.articles.findIndex(article=>article.postData.id===first.post.id)];
  assert.equal(card.testShadow.querySelector('.answer').textContent,old.text);
  assert.equal(card.testShadow.querySelector('.sources').querySelectorAll('a').length,1);
  card.testShadow.querySelector('.retry').emit('click');page.flush();
  const second=page.port.sent.find(message=>message.type==='ANALYZE'&&message.post.id===first.post.id&&message.requestId!==first.requestId);assert.ok(second);
  page.port.onMessage.emit({type:'UPDATE',requestId:second.requestId,phase:'explain',text:'New partial explanation without verification',verificationStatus:'pending'});page.flush();
  card.testShadow.querySelector('.generate-comments').emit('click');page.flush();
  const comment=page.port.sent.find(message=>message.type==='GENERATE_COMMENTS');assert.ok(comment);
  assert.equal(comment.analysis.text,'New partial explanation without verification');
  assert.equal(comment.analysis.verificationStatus,'unverified');
  assert.equal(comment.analysis.verified,undefined);
  assert.equal(comment.analysis.warning,'');
  assert.deepEqual(Array.from(comment.analysis.sources),[]);
  assert.equal(JSON.stringify(comment.analysis).includes('Old'),false);
  assert.equal(card.testShadow.querySelector('.sources').querySelectorAll('a').length,0);
  assert.deepEqual(page.writes,[]);
});

function tokenFixture(settings={}) {
  const page=fixture({postCount:1});page.configure(settings);page.intersect();page.tick();
  const request=page.port.sent.find(message=>message.type==='ANALYZE'),card=page.cards()[0];
  assert.ok(request);assert.ok(card);
  return {page,request,card};
}
function tokenHeader(card) {
  const header=card.testShadow.querySelector('.token-usage');
  assert.ok(header,'Every result row owns compact token metadata');
  return header;
}
function assertTokenCount(card,count) {
  const footer=tokenHeader(card);assert.equal(footer.hidden,false);
  assert.match(footer.textContent,new RegExp(`(^|\\D)${count}(\\D|$)`));
  return footer;
}
function tokenResult(page,request,{usage,model,...extra}={}) {
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider:'api',text:'A completed explanation.',sources:[],usage,model,...extra}});page.flush();
}

test('each API row displays reported token consumption and its actual response model in a hover tooltip',()=>{
  const {page,request,card}=tokenFixture({apiModel:'configured-model'}),before=page.port.sent.length;
  tokenResult(page,request,{usage:{input_tokens:100,output_tokens:20,total_tokens:120},model:'actual-response-model'});
  const footer=assertTokenCount(card,120);
  assert.match(footer.title,/actual-response-model/);assert.doesNotMatch(footer.title,/configured-model/);
  assert.match(footer.title,/(^|\D)100(\D|$)/);assert.match(footer.title,/(^|\D)20(\D|$)/);
  assert.equal(footer.querySelectorAll('a').length,0,'Usage metadata is explanatory text, not a source link');
  assert.equal(page.port.sent.slice(before).some(message=>['ANALYZE','GENERATE_COMMENTS'].includes(message.type)),false);
  assert.deepEqual(page.writes,[]);
});

test('completed answers show token consumption above the answer and move repeated search metadata into the tooltip',()=>{
  for(const cached of [false,true])for(const searched of [false,true]) {
    const {page,request,card}=tokenFixture();
    page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,cached,result:{provider:'api',text:'Complete answer.',sources:[],searched,verificationStatus:'completed',usage:{total_tokens:140},model:'actual-response-model'}});page.flush();
    const header=assertTokenCount(card,140),status=card.testShadow.querySelector('.status'),box=card.testShadow.querySelector('.card');
    assert.equal(box.children[0],header,'Usage remains visible before long answer content without a duplicate footer');
    assert.equal(card.testShadow.querySelectorAll('.token-usage').length,1);
    assert.equal(status.hidden,true,'Completed provenance does not repeat as a visible heading for every answer');
    assert.ok(header.title.includes(ui.t(searched?'status.searched':'status.unverified','zh-CN')));
    assert.match(header.title,/actual-response-model/);
    if(cached)assert.ok(header.title.includes(ui.t('usage.cached','zh-CN')));
    assert.deepEqual(page.writes,[]);
  }
});

test('token metadata never hides explaining or fact-check loading states and their waiting indicators',()=>{
  const {page,request,card}=tokenFixture(),status=card.testShadow.querySelector('.status');
  page.port.onMessage.emit({type:'START',requestId:request.requestId});page.flush();
  assert.equal(status.hidden,false);assert.equal(status.classList.contains('shimmer'),true);assert.equal(card.testShadow.querySelector('.thinking').hidden,false);
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'explain',text:'Streaming explanation.',usage:{total_tokens:30},model:'explanation-model'});page.flush();
  assertTokenCount(card,30);assert.equal(status.hidden,false);assert.equal(card.testShadow.querySelector('.thinking').hidden,true);
  assert.equal(status.textContent,ui.t('status.explaining','zh-CN'));
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'verification_queued',text:'Streaming explanation.'});page.flush();
  assertTokenCount(card,30);assert.equal(status.hidden,false);assert.equal(status.classList.contains('shimmer'),true);
  assert.equal(card.testShadow.querySelector('.verification-thinking').hidden,false);
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'verify',text:'Streaming explanation.\n\nChecking.',usage:{total_tokens:45}});page.flush();
  assertTokenCount(card,45);assert.equal(status.hidden,false);assert.equal(status.textContent,ui.t('status.verifying','zh-CN'));
  tokenResult(page,request,{usage:{total_tokens:55},searched:true,verificationStatus:'completed'});
  assertTokenCount(card,55);assert.equal(status.hidden,true);assert.equal(card.testShadow.querySelector('.verification-thinking').hidden,true);
  assert.deepEqual(page.writes,[]);
});

test('token headers retain visible incomplete fact-check and API error states instead of hiding them as search metadata',()=>{
  for(const cached of [false,true]) {
    const {page,request,card}=tokenFixture();
    page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,cached,result:{provider:'api',text:'Preserved explanation.',sources:[],searched:true,
      verificationStatus:'incomplete',verificationFailure:{stage:'verify',code:'TIMEOUT'},usage:{total_tokens:60},usageComplete:false,model:'explanation-model'}});page.flush();
    const header=assertTokenCount(card,60),status=card.testShadow.querySelector('.status');
    assert.equal(status.hidden,false);assert.ok(status.textContent.includes(ui.t('status.incomplete','zh-CN')));assert.match(header.textContent,/\+/);
    assert.equal(status.title,ui.t('verification.timeout','zh-CN'));
    assert.deepEqual(page.writes,[]);
  }
  const {page,request,card}=tokenFixture();
  page.port.onMessage.emit({type:'ERROR',requestId:request.requestId,code:'API_LANGUAGE_MISMATCH',error:'Wrong language',usage:{total_tokens:35},model:'response-model'});page.flush();
  assertTokenCount(card,35);assert.equal(card.testShadow.querySelector('.status').hidden,false);
  assert.equal(card.testShadow.querySelector('.status').textContent,ui.t('error.outputLanguageMismatch','zh-CN'));assert.deepEqual(page.writes,[]);
});

test('onboarding has actionable Key guidance without an empty token header',()=>{
  const page=fixture({postCount:1});
  page.port.onMessage.emit({type:'CONFIG',settings:API_SETTINGS,ready:false,used:0});page.flush();page.intersect();page.tick();
  const card=page.cards()[0],status=card.testShadow.querySelector('.status');
  assert.equal(tokenHeader(card).hidden,true);assert.equal(status.hidden,false);
  assert.ok(status.querySelector('.status-settings'));assert.equal(page.port.sent.some(message=>message.type==='ANALYZE'),false);assert.deepEqual(page.writes,[]);
});

test('cumulative streaming usage snapshots replace earlier counts and the completed total overrides progress',()=>{
  const {page,request,card}=tokenFixture();
  for(const total of [20,30,30]) {
    page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'explain',text:'Streaming explanation.',usage:{input_tokens:10,output_tokens:total-10,total_tokens:total},model:'explanation-model'});page.flush();
    assertTokenCount(card,total);
  }
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'verification_queued',text:'Streaming explanation.'});page.flush();
  assertTokenCount(card,30);
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'verify',text:'Streaming explanation.\n\nChecking.',usage:{input_tokens:25,output_tokens:20,total_tokens:45},model:'explanation-model'});page.flush();
  assertTokenCount(card,45);
  tokenResult(page,request,{usage:{input_tokens:30,output_tokens:25,total_tokens:55},model:'explanation-model'});
  assertTokenCount(card,55);
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'verify',usage:{total_tokens:999},model:'obsolete-model'});page.flush();
  assertTokenCount(card,55);assert.doesNotMatch(tokenHeader(card).title,/obsolete-model/);
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);assert.deepEqual(page.writes,[]);
});

test('comment consumption is included once beside analysis consumption and preserves both response models',()=>{
  const {page,request,card}=tokenFixture();
  tokenResult(page,request,{usage:{input_tokens:100,output_tokens:20,total_tokens:120},model:'analysis-model'});
  card.testShadow.querySelector('.generate-comments').emit('click');page.flush();
  const comment=page.port.sent.find(message=>message.type==='GENERATE_COMMENTS');assert.ok(comment);
  assertTokenCount(card,120,'Pending comments have no provider-reported counters yet');
  const completed={type:'COMMENT_RESULT',requestId:comment.requestId,comments:suggestions,usage:{input_tokens:20,output_tokens:10,total_tokens:30},model:'comments-model'};
  page.port.onMessage.emit(completed);page.flush();assertTokenCount(card,150);
  page.port.onMessage.emit(completed);page.flush();assertTokenCount(card,150);
  const footer=tokenHeader(card);assert.match(footer.title,/analysis-model/);assert.match(footer.title,/comments-model/);
  assert.equal(card.testShadow.querySelectorAll('.comment-copy').length,3);
  assert.equal(card.testShadow.querySelector('.answer').textContent,'A completed explanation.');
  assert.equal(page.port.sent.filter(message=>message.type==='GENERATE_COMMENTS').length,1);assert.deepEqual(page.writes,[]);
});

test('cached answers display the original usage and identify reuse rather than reporting newly consumed tokens',()=>{
  const {page,request,card}=tokenFixture({apiModel:'different-current-model'}),before=page.port.sent.length;
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,cached:true,result:{provider:'api',text:'Cached explanation.',sources:[],usage:{input_tokens:100,output_tokens:20,total_tokens:120},model:'original-generation-model'}});page.flush();
  const footer=assertTokenCount(card,120);assert.match(footer.title,/original-generation-model/);
  assert.match(footer.textContent+footer.title,/缓存|cached/i);
  assert.doesNotMatch(footer.title,/different-current-model/);
  assert.equal(page.port.sent.slice(before).some(message=>['ANALYZE','GENERATE_COMMENTS'].includes(message.type)),false);
  assert.deepEqual(page.writes,[]);
});

test('missing API counters never present a fabricated zero or character estimate',()=>{
  for(const provider of ['api']) {
    const {page,request,card}=tokenFixture({provider});
    page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{provider,text:'A long result '.repeat(200),sources:[]}});page.flush();
    const footer=tokenHeader(card);assert.equal(footer.hidden,false);
    assert.doesNotMatch(footer.textContent,/\d/,'No reported token counter means no numeric estimate');
    assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);assert.deepEqual(page.writes,[]);
  }
});

test('partial failures retain reported consumption even when an invalid answer is removed',()=>{
  const {page,request,card}=tokenFixture();
  page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'explain',text:'Wrong-language prefix.',usage:{input_tokens:10,output_tokens:20,total_tokens:30},model:'response-model'});page.flush();
  page.port.onMessage.emit({type:'ERROR',requestId:request.requestId,code:'API_LANGUAGE_MISMATCH',error:'Wrong language',usage:{input_tokens:10,output_tokens:25,total_tokens:35},model:'response-model'});page.flush();
  assertTokenCount(card,35);assert.match(tokenHeader(card).title,/response-model/);
  assert.equal(card.testShadow.querySelector('.answer').textContent,'');
  page.tick(10000);assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);assert.deepEqual(page.writes,[]);
});

test('failure totals override earlier preserved prose usage while partial-only metadata remains available',()=>{
  const aggregate=tokenFixture();
  aggregate.page.port.onMessage.emit({type:'ERROR',requestId:aggregate.request.requestId,code:'RATE_LIMIT',error:'Verification stopped',usage:{input_tokens:25,output_tokens:15,total_tokens:40},model:'verification-model',usageComplete:false,
    partialResult:{provider:'api',text:'An earlier explanation survives.',sources:[],usage:{input_tokens:20,output_tokens:10,total_tokens:30},model:'earlier-explanation-model'}});aggregate.page.flush();
  assertTokenCount(aggregate.card,40);assert.match(tokenHeader(aggregate.card).title,/verification-model/);
  assert.doesNotMatch(tokenHeader(aggregate.card).title,/earlier-explanation-model/);assert.match(tokenHeader(aggregate.card).textContent,/\+/);
  assert.equal(aggregate.card.testShadow.querySelector('.answer').textContent,'An earlier explanation survives.');
  const partial=tokenFixture();
  partial.page.port.onMessage.emit({type:'ERROR',requestId:partial.request.requestId,code:'RATE_LIMIT',error:'Verification stopped',partialResult:{provider:'api',text:'Partial-only retained explanation.',sources:[],usage:{input_tokens:20,output_tokens:10,total_tokens:30},model:'retained-model'}});partial.page.flush();
  assertTokenCount(partial.card,30);assert.match(tokenHeader(partial.card).title,/retained-model/);
  assert.equal(partial.card.testShadow.querySelector('.answer').textContent,'Partial-only retained explanation.');
  assert.deepEqual(aggregate.page.writes,[]);assert.deepEqual(partial.page.writes,[]);
});

test('per-stage totals include mixed counter forms and missing stages remain a visibly incomplete subtotal',()=>{
  const full=tokenFixture();
  tokenResult(full.page,full.request,{usage:{total_tokens:30},usageByStage:{explain:{total_tokens:30},verify:{input_tokens:15,output_tokens:25}},modelByStage:{explain:'explanation-model',verify:'verification-model'},usageComplete:true});
  const complete=assertTokenCount(full.card,70);assert.doesNotMatch(complete.textContent,/\+/);
  assert.match(complete.title,/explanation-model/);assert.match(complete.title,/verification-model/);
  const unknown=tokenFixture();
  tokenResult(unknown.page,unknown.request,{usage:{total_tokens:30},usageByStage:{explain:{total_tokens:30},verify:{}},usageComplete:true});
  const incomplete=assertTokenCount(unknown.card,30);assert.match(incomplete.textContent,/\+/,'An unknown stage cannot count as zero');
  assert.deepEqual(full.page.writes,[]);assert.deepEqual(unknown.page.writes,[]);
});

test('an incomplete usage subtotal is visibly partial and failed comment consumption still belongs to the row',()=>{
  const {page,request,card}=tokenFixture();
  tokenResult(page,request,{usage:{input_tokens:100,output_tokens:20,total_tokens:120},usageComplete:false,model:'analysis-model'});
  assertTokenCount(card,120);assert.match(tokenHeader(card).textContent,/\+/,'Do not label a known subtotal as a complete bill');
  card.testShadow.querySelector('.generate-comments').emit('click');page.flush();
  const comment=page.port.sent.find(message=>message.type==='GENERATE_COMMENTS');assert.ok(comment);
  page.port.onMessage.emit({type:'COMMENT_ERROR',requestId:comment.requestId,code:'COMMENTS_INVALID_RESPONSE',error:'Invalid comments',usage:{input_tokens:20,output_tokens:10,total_tokens:30},model:'failed-comments-model'});page.flush();
  assertTokenCount(card,150);assert.match(tokenHeader(card).title,/failed-comments-model/);
  assert.match(tokenHeader(card).textContent,/\+/);assert.equal(card.testShadow.querySelectorAll('.comment-copy').length,0);
  assert.deepEqual(page.writes,[]);
});

test('reanalyzing clears analysis and comment usage before accepting the new request snapshot',()=>{
  const {page,request,card}=tokenFixture();
  tokenResult(page,request,{usage:{input_tokens:100,output_tokens:20,total_tokens:120},model:'old-analysis-model'});
  card.testShadow.querySelector('.generate-comments').emit('click');page.flush();
  const comment=page.port.sent.find(message=>message.type==='GENERATE_COMMENTS');
  page.port.onMessage.emit({type:'COMMENT_RESULT',requestId:comment.requestId,comments:suggestions,usage:{input_tokens:20,output_tokens:10,total_tokens:30},model:'old-comment-model'});page.flush();assertTokenCount(card,150);
  card.testShadow.querySelector('.retry').emit('click');page.flush();page.tick();
  const next=page.port.sent.filter(message=>message.type==='ANALYZE').at(-1);assert.notEqual(next.requestId,request.requestId);
  assert.doesNotMatch(tokenHeader(card).textContent+tokenHeader(card).title,/150|old-analysis-model|old-comment-model/);
  page.port.onMessage.emit({type:'COMMENT_RESULT',requestId:comment.requestId,comments:suggestions,usage:{total_tokens:999},model:'late-old-model'});page.flush();
  tokenResult(page,next,{usage:{input_tokens:50,output_tokens:20,total_tokens:70},model:'new-analysis-model'});
  assertTokenCount(card,70);assert.match(tokenHeader(card).title,/new-analysis-model/);
  assert.doesNotMatch(tokenHeader(card).title,/old-analysis-model|old-comment-model|late-old-model/);
  assert.equal(card.testShadow.querySelectorAll('.comment-copy').length,0);assert.deepEqual(page.writes,[]);
});

test('X interface locale changes translate usage labels without generating or cancelling analysis',()=>{
  const {page,request,card}=tokenFixture({language:'en'});
  tokenResult(page,request,{usage:{input_tokens:100,output_tokens:20,total_tokens:120},model:'actual-model'});
  const before=page.port.sent.length,previousTitle=tokenHeader(card).title;
  page.document.documentElement.lang='ja';page.port.onMessage.emit({type:'UI_LANGUAGE',language:'ja'});page.mutate([{type:'attributes',attributeName:'lang',target:page.document.documentElement}]);
  const footer=assertTokenCount(card,120);assert.match(footer.title,/actual-model/);assert.notEqual(footer.title,previousTitle);
  assert.equal(card.testShadow.querySelector('.answer').textContent,'A completed explanation.');
  assert.equal(page.port.sent.slice(before).some(message=>['CANCEL','CANCEL_ALL','ANALYZE','GENERATE_COMMENTS','SET_LANGUAGE'].includes(message.type)),false);
  assert.deepEqual(page.writes,[]);
});

test('language switches and recycled post nodes cannot show consumption belonging to an earlier answer',()=>{
  const {page,request,card}=tokenFixture();page.articles[0].postData.language='en';
  tokenResult(page,request,{usage:{input_tokens:100,output_tokens:20,total_tokens:120},model:'old-language-model'});
  page.articles[0].postData={...page.articles[0].postData,text:'当前显示的中文翻译。',language:'zh-CN'};page.mutate();page.tick();
  const translated=page.port.sent.filter(message=>message.type==='ANALYZE').at(-1);assert.notEqual(translated.requestId,request.requestId);
  const translatedCard=page.cards()[0];assert.equal(card.isConnected,false);
  assert.doesNotMatch(tokenHeader(translatedCard).textContent+tokenHeader(translatedCard).title,/120|old-language-model/);
  tokenResult(page,translated,{usage:{input_tokens:50,output_tokens:10,total_tokens:60},model:'translated-model'});assertTokenCount(translatedCard,60);
  page.articles[0].postData={...page.articles[0].postData,id:'999',url:'https://x.com/test/status/999',text:'A different post.',language:'en'};page.mutate();page.tick();
  const replacement=page.cards()[0];assert.notEqual(replacement,translatedCard);assert.equal(translatedCard.isConnected,false);
  assert.doesNotMatch(tokenHeader(replacement).textContent+tokenHeader(replacement).title,/60|translated-model/);
  page.port.onMessage.emit({type:'UPDATE',requestId:translated.requestId,usage:{total_tokens:999},model:'late-old-model'});page.flush();
  assert.doesNotMatch(tokenHeader(replacement).textContent+tokenHeader(replacement).title,/999|late-old-model/);assert.deepEqual(page.writes,[]);
});

test('hostile usage metadata remains inert and invalid counters do not become token numbers',()=>{
  for(const usage of [{total_tokens:-1},{total_tokens:NaN},{total_tokens:Infinity},{total_tokens:1.5},{total_tokens:Number.MAX_SAFE_INTEGER+1},{total_tokens:'123<script>alert(1)</script>'}]) {
    const {page,request,card}=tokenFixture();
    tokenResult(page,request,{usage,model:'<img src=x onerror=alert(1)>'.repeat(1000)});
    const footer=tokenHeader(card);assert.doesNotMatch(footer.textContent,/\d/);
    assert.ok(footer.title.length<2000,'Bound tooltip metadata rather than copying an unbounded model string');
    assert.equal(card.testShadow.querySelectorAll('img,script,a').length,0);assert.deepEqual(page.writes,[]);
  }
});

test('an explicitly reported zero is retained and authoritative totals never add reasoning or cached subsets twice',()=>{
  const zero=tokenFixture();tokenResult(zero.page,zero.request,{usage:{input_tokens:0,output_tokens:0,total_tokens:0},model:'zero-response-model'});
  assertTokenCount(zero.card,0);assert.match(tokenHeader(zero.card).title,/zero-response-model/);
  const actual=tokenFixture();
  tokenResult(actual.page,actual.request,{usage:{input_tokens:100,output_tokens:20,total_tokens:130,input_tokens_details:{cached_tokens:40},output_tokens_details:{reasoning_tokens:15}},model:'actual-total-model'});
  const footer=assertTokenCount(actual.card,130);
  assert.doesNotMatch(footer.textContent,/(^|\D)(120|145|185)(\D|$)/);
  assert.match(footer.title,/(^|\D)100(\D|$)/);assert.match(footer.title,/(^|\D)20(\D|$)/);
  assert.deepEqual(zero.page.writes,[]);assert.deepEqual(actual.page.writes,[]);
});

test('idle worker sleep preserves completed row metadata and controls without an automatic reconnect timer',()=>{
  const {page,request,card}=tokenFixture();
  tokenResult(page,request,{usage:{total_tokens:120},model:'completed-model',searched:true,verificationStatus:'completed'});
  const status=card.testShadow.querySelector('.status'),answer=card.testShadow.querySelector('.answer');
  const previous={status:status.textContent,hidden:status.hidden,answer:answer.textContent,tokens:tokenHeader(card).textContent,title:tokenHeader(card).title};
  const old=page.port,attempts=page.connectionAttempts();old.onDisconnect.emit();page.flush();page.tick(45000);page.runTimeouts(30000);
  assert.equal(page.connectionAttempts(),attempts,'An idle port may sleep until the feed needs the worker again');
  assert.deepEqual(page.pendingTimeouts(),[]);
  assert.equal(status.textContent,previous.status);assert.equal(status.hidden,previous.hidden);
  assert.equal(answer.textContent,previous.answer);assert.equal(tokenHeader(card).textContent,previous.tokens);assert.equal(tokenHeader(card).title,previous.title);
  assert.equal(card.testShadow.querySelector('.retry').disabled,false);
  assert.equal(card.testShadow.querySelector('.generate-comments').hidden,false);
  assert.equal(card.testShadow.querySelector('.generate-comments').disabled,false);
  assert.equal(old.sent.filter(message=>['ANALYZE','GENERATE_COMMENTS'].includes(message.type)).length,1);
});

test('manual comment and reanalysis actions wake an idle worker once and wait for fresh CONFIG before billing',()=>{
  for(const action of ['comments','analysis']){
    const {page,request,card}=tokenFixture();tokenResult(page,request,{usage:{total_tokens:50},model:'retained-model'});
    const old=page.port;old.onDisconnect.emit();page.flush();page.replacePort();
    const button=card.testShadow.querySelector(action==='comments'?'.generate-comments':'.retry');
    button.emit('click');button.emit('click');page.flush();page.tick(1000);
    assert.equal(page.connectionAttempts(),2,action+' wakes only one new connection');
    assert.equal(button.disabled,true,'A pending wake cannot be double-submitted');
    assert.equal(page.port.sent.some(message=>['ANALYZE','GENERATE_COMMENTS'].includes(message.type)),false);
    assert.equal(card.testShadow.querySelector('.answer').textContent,'A completed explanation.');
    page.configure();page.tick();
    const expected=action==='comments'?'GENERATE_COMMENTS':'ANALYZE';
    assert.equal(page.port.sent.filter(message=>message.type===expected).length,1);
    assert.equal(page.port.sent.filter(message=>message.type===(action==='comments'?'ANALYZE':'GENERATE_COMMENTS')).length,0);
    old.onMessage.emit({type:'CONFIG',settings:API_SETTINGS,ready:false});old.onDisconnect.emit();page.flush();
    assert.equal(page.port.sent.filter(message=>message.type===expected).length,1,'Obsolete port notifications cannot replay the action');
  }
});

test('a Key locked while the worker sleeps prevents deferred comment or analysis calls after waking',()=>{
  for(const action of ['comments','analysis']){
    const {page,request,card}=tokenFixture();tokenResult(page,request,{usage:{total_tokens:40},model:'completed-model'});
    page.port.onDisconnect.emit();page.flush();page.replacePort();
    card.testShadow.querySelector(action==='comments'?'.generate-comments':'.retry').emit('click');
    page.port.onMessage.emit({type:'CONFIG',settings:API_SETTINGS,ready:false,keyState:'missing'});page.flush();page.tick();
    assert.equal(page.port.sent.some(message=>['ANALYZE','GENERATE_COMMENTS'].includes(message.type)),false);
    assert.equal(card.testShadow.querySelector('.answer').textContent,'A completed explanation.');assertTokenCount(card,40);
    assert.equal(card.testShadow.querySelector('.generate-comments').hidden,true);
    assert.equal(card.testShadow.querySelector('.retry').hidden,true);
    page.configure();page.tick(1000);
    assert.equal(page.port.sent.some(message=>['ANALYZE','GENERATE_COMMENTS'].includes(message.type)),false,'Unlocking later does not replay abandoned manual intent');
  }
});

test('an idle answer-language change waits for its new CONFIG rather than analyzing in the stale language',()=>{
  const {page,request,card}=tokenFixture();tokenResult(page,request,{usage:{total_tokens:30},model:'completed-model'});
  page.port.onDisconnect.emit();page.flush();page.replacePort();
  const language=page.nodes.find(node=>node.className==='rail-language');language.value='ja';language.emit('change');page.flush();
  assert.equal(page.connectionAttempts(),2);assert.equal(language.disabled,true);
  assert.equal(page.port.sent.some(message=>message.type==='SET_LANGUAGE'),false,'Wait for the freshly awakened settings snapshot first');
  page.configure();page.tick(2000);
  assert.deepEqual(page.port.sent.filter(message=>message.type==='SET_LANGUAGE').map(message=>message.language),['ja']);
  assert.equal(page.port.sent.some(message=>['ANALYZE','GENERATE_COMMENTS'].includes(message.type)),false);
  assert.equal(language.disabled,true,'The preference change is pending acknowledgement');
  page.configure({language:'ja'});page.tick();
  assert.equal(language.disabled,false);assert.equal(language.value,'ja');
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);
});

test('a newly visible post wakes an idle worker and starts only its own first analysis',()=>{
  const page=fixture({postCount:2});
  page.articles[1].rect={...page.articles[1].rect,top:1200,bottom:1480};page.configure();page.intersect();page.tick();
  const request=page.port.sent.find(message=>message.type==='ANALYZE');assert.equal(request.post.id,'100');
  const card=page.cards()[0];tokenResult(page,request,{usage:{total_tokens:25},model:'retained-model'});
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);
  page.port.onDisconnect.emit();page.flush();page.replacePort();
  page.articles[1].rect={...page.articles[1].rect,top:400,bottom:680};page.intersect();page.tick();
  assert.equal(page.connectionAttempts(),2);assert.equal(page.port.sent.some(message=>message.type==='ANALYZE'),false);
  page.configure();page.tick();
  assert.deepEqual(page.port.sent.filter(message=>message.type==='ANALYZE').map(message=>message.post.id),['101']);
  assert.equal(card.testShadow.querySelector('.answer').textContent,'A completed explanation.');assertTokenCount(card,25);
});

test('an active port disconnect marks only interrupted work and reconnect never automatically replays it',()=>{
  const page=fixture({postCount:2});page.configure();
  const requests=page.port.sent.filter(message=>message.type==='ANALYZE');assert.equal(requests.length,2);
  const first=page.cards()[0],second=page.cards()[1];tokenResult(page,requests[0],{usage:{total_tokens:60},model:'completed-model',searched:true,verificationStatus:'completed'});
  page.port.onMessage.emit({type:'UPDATE',requestId:requests[1].requestId,phase:'explain',text:'An interrupted partial answer.',usage:{total_tokens:12},model:'streaming-model'});page.flush();
  const completeStatus=first.testShadow.querySelector('.status').textContent,old=page.port;old.onDisconnect.emit();page.flush();
  assert.equal(first.testShadow.querySelector('.status').textContent,completeStatus);assert.equal(first.testShadow.querySelector('.status').hidden,true);assertTokenCount(first,60);
  assert.equal(second.testShadow.querySelector('.status').textContent,ui.t('status.connectionLost','zh-CN'));
  assert.equal(second.testShadow.querySelector('.answer').textContent,'An interrupted partial answer.');assertTokenCount(second,12);
  assert.equal(page.pendingTimeouts().filter(delay=>delay===3000).length,1);
  page.replacePort();page.runTimeouts(3000);page.configure();page.tick(4000);
  assert.equal(page.port.sent.some(message=>['ANALYZE','GENERATE_COMMENTS'].includes(message.type)),false);
  second.testShadow.querySelector('.retry').emit('click');page.flush();
  assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1,'Only an explicit retry restarts interrupted paid work');
});

test('silent worker handshakes use a bounded timeout and backoff without starting deferred paid work',()=>{
  const {page,request,card}=tokenFixture();tokenResult(page,request,{usage:{total_tokens:10},model:'completed-model'});
  page.port.onDisconnect.emit();page.flush();page.replacePort();card.testShadow.querySelector('.retry').emit('click');page.flush();
  assert.ok(page.pendingTimeouts().includes(8000));assert.equal(page.connectionAttempts(),2);
  page.runTimeouts(8000);
  assert.equal(card.testShadow.querySelector('.status').textContent,ui.t('status.connectionLost','zh-CN'));
  assert.equal(page.pendingTimeouts().filter(delay=>delay===3000).length,1);
  page.replacePort();page.runTimeouts(3000);assert.equal(page.connectionAttempts(),3);
  page.runTimeouts(8000);assert.equal(page.pendingTimeouts().filter(delay=>delay===6000).length,1);
  page.replacePort();page.runTimeouts(6000);assert.equal(page.connectionAttempts(),4);
  page.runTimeouts(8000);assert.equal(page.pendingTimeouts().filter(delay=>delay===12000).length,1);
  page.tick(100000);assert.equal(page.connectionAttempts(),4,'Feed ticks cannot defeat reconnect backoff');
  assert.equal(page.port.sent.some(message=>['ANALYZE','GENERATE_COMMENTS'].includes(message.type)),false);
  page.replacePort();page.runTimeouts(12000);page.configure();page.tick();
  assert.deepEqual(page.pendingTimeouts(),[]);assert.equal(page.port.sent.some(message=>['ANALYZE','GENERATE_COMMENTS'].includes(message.type)),false);
});

test('returning from Settings wakes a sleeping feed even if the previous snapshot had no available Key',()=>{
  const page=fixture({postCount:1});page.port.onMessage.emit({type:'CONFIG',settings:API_SETTINGS,ready:false,keyState:'missing'});page.flush();page.intersect();
  page.port.onDisconnect.emit();page.flush();page.replacePort();
  page.document.hidden=true;page.document.emit('visibilitychange');page.flush();
  page.document.hidden=false;page.document.emit('visibilitychange');page.flush();
  assert.equal(page.connectionAttempts(),2,'Returning to X rechecks a Key saved while the old worker slept');
  assert.equal(page.port.sent.some(message=>message.type==='ANALYZE'),false);
  page.configure();page.tick();assert.equal(page.port.sent.filter(message=>message.type==='ANALYZE').length,1);
});

test('a lazy wake port closing before CONFIG is a failed handshake and cannot reconnect on every feed tick',()=>{
  const page=fixture({postCount:2});
  page.articles[1].rect={...page.articles[1].rect,top:1200,bottom:1480};page.configure();page.intersect();page.tick();
  const completed=page.port.sent.find(message=>message.type==='ANALYZE');tokenResult(page,completed,{usage:{total_tokens:20},model:'retained-model'});
  page.port.onDisconnect.emit();page.flush();page.replacePort();
  page.articles[1].rect={...page.articles[1].rect,top:400,bottom:680};page.intersect();page.tick();
  assert.equal(page.connectionAttempts(),2,'The new visible post wakes the worker once');
  page.port.onDisconnect.emit();page.flush();
  assert.equal(page.connectionAttempts(),2,'A failed wake must not be mistaken for a configured worker going idle');
  assert.equal(page.pendingTimeouts().filter(delay=>delay===3000).length,1);
  page.tick(1000);page.tick(1000);assert.equal(page.connectionAttempts(),2);
  assert.equal(page.port.sent.some(message=>message.type==='ANALYZE'),false);
  page.replacePort();page.runTimeouts(3000);assert.equal(page.connectionAttempts(),3);
  page.configure();page.tick();
  assert.deepEqual(page.port.sent.filter(message=>message.type==='ANALYZE').map(message=>message.post.id),['101']);
});

test('returning to a failed feed restarts recovery after its reconnect timer expired while hidden',()=>{
  const page=fixture({postCount:1});page.configure();
  const request=page.port.sent.find(message=>message.type==='ANALYZE');assert.ok(request);
  page.port.onDisconnect.emit();page.flush();assert.ok(page.pendingTimeouts().includes(3000));
  page.document.hidden=true;page.document.emit('visibilitychange');page.flush();page.replacePort();page.runTimeouts(3000);
  assert.equal(page.connectionAttempts(),1,'Hidden tabs do not start a new connection');
  assert.deepEqual(page.pendingTimeouts(),[],'The retry timer has already elapsed');
  page.document.hidden=false;page.document.emit('visibilitychange');page.flush();
  assert.equal(page.connectionAttempts(),2,'User return is a new recovery demand, even after a real connection failure');
  page.configure();page.tick();assert.equal(page.port.sent.some(message=>message.type==='ANALYZE'),false,'Recovery never replays interrupted analysis');
});
