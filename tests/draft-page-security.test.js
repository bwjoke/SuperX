'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const Core=require('../extension/feed-core.js');
const Draft=require('../extension/draft-composer.js');

// A small local DOM fixture runs the production composer through its public
// interface. All content and requests are fabricated; no browser or API runs.
function fixture({allowed=true,policy=true,images=false,fetch}={}){
  const timers=new Map(),sent=[],created=[];let nextTimer=0,reads=0;
  const events=()=>{
    const listeners=new Map();
    return {addEventListener(type,fn){const items=listeners.get(type)||[];items.push(fn);listeners.set(type,items);},
      removeEventListener(type,fn){listeners.set(type,(listeners.get(type)||[]).filter(item=>item!==fn));},
      emit(type,detail={}){for(const fn of listeners.get(type)||[])fn({type,isTrusted:true,stopPropagation(){},preventDefault(){},...detail});}};
  };
  const document={...events()};
  class Node{
    constructor(tag,native=false){
      this.tagName=tag.toUpperCase();this.nodeType=1;this.native=native;this.childNodes=[];this.attrs=new Map();this.parentElement=null;this._text='';this.hidden=false;
      Object.assign(this,events());const styles=new Map();this.style={setProperty:(key,value)=>styles.set(key,value),getPropertyValue:key=>styles.get(key)||'',removeProperty:key=>styles.delete(key)};
      this.classList={toggle:()=>{},add:()=>{}};created.push(this);
    }
    get children(){return this.childNodes.filter(child=>child.nodeType===1);}
    get isConnected(){return this===document.body||Boolean(this.parentElement?.isConnected||this.host?.isConnected);}
    get textContent(){if(this.native)reads++;return this._text+this.childNodes.map(child=>child.textContent||child.nodeValue||'').join('');}
    set textContent(value){this._text=String(value);this.childNodes=[];}
    get scrollHeight(){return 50;}
    get previousElementSibling(){const children=this.parentElement?.children||[];return children[children.indexOf(this)-1]||null;}
    get nextElementSibling(){const children=this.parentElement?.children||[];return children[children.indexOf(this)+1]||null;}
    get nextSibling(){return this.nextElementSibling;}
    setAttribute(key,value){this.attrs.set(key,String(value));}
    getAttribute(key){if(this.native)reads++;return this.attrs.get(key)??null;}
    hasAttribute(key){return this.attrs.has(key);}
    removeAttribute(key){this.attrs.delete(key);}
    toggleAttribute(key,value){if(value)this.setAttribute(key,'');else this.removeAttribute(key);}
    append(...children){for(const child of children){child.remove?.();child.parentElement=this;this.childNodes.push(child);}}
    replaceChildren(...children){for(const child of this.childNodes)child.parentElement=null;this.childNodes=[];this._text='';this.append(...children);}
    insertBefore(child,before){child.remove();child.parentElement=this;this.childNodes.splice(this.childNodes.indexOf(before),0,child);}
    after(child){const parent=this.parentElement;child.remove();child.parentElement=parent;parent.childNodes.splice(parent.childNodes.indexOf(this)+1,0,child);}
    remove(){if(this.parentElement){this.parentElement.childNodes=this.parentElement.childNodes.filter(child=>child!==this);this.parentElement=null;}}
    attachShadow(){const shadow=new Node('shadow');shadow.host=this;this.shadowRoot=shadow;return shadow;}
    contains(node){return node===this||this.children.some(child=>child.contains(node));}
    getBoundingClientRect(){return {x:0,y:0,left:0,top:0,right:600,bottom:50,width:600,height:50};}
    matches(selector){
      if(this.native)reads++;
      return selector.split(',').some(part=>{
        part=part.trim();if(part.startsWith('.'))return (this.className||'').split(' ').includes(part.slice(1));
        const tag=part.match(/^[a-z][a-z0-9-]*/i)?.[0];if(tag&&tag.toUpperCase()!==this.tagName)return false;
        const attributes=[...part.matchAll(/\[([\w-]+)(?:(\^=|\*=|=)["']([^"']*)["'])?\]/g)];
        if(!tag&&!attributes.length)return false;
        return attributes.every(([,name,operator,value])=>{
          const actual=this.attrs.get(name);if(actual===undefined)return false;
          return !operator||operator==='='&&actual===value||operator==='^='&&actual.startsWith(value)||operator==='*='&&actual.includes(value);
        });
      });
    }
    closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null;}
    querySelectorAll(selector){if(this.native)reads++;return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    compareDocumentPosition(){return 4;}
  }
  document.body=new Node('body',true);
  const main=new Node('main',true),editor=new Node('div',true),footer=new Node('div',true),publish=new Node('button',true);
  editor.setAttribute('contenteditable','true');editor.setAttribute('data-testid','tweetTextarea_0');publish.setAttribute('data-testid','tweetButtonInline');
  editor.append({nodeType:3,get nodeValue(){reads++;return 'A fabricated draft for a security test.';}});
  footer.append(publish);main.append(editor,footer);document.body.append(main);
  if(images){const attachments=new Node('div',true),img=new Node('img',true);attachments.setAttribute('data-testid','attachments');img.setAttribute('src','blob:https://x.com/fabricated-image');attachments.append(img);main.append(attachments);}
  document.createElement=tag=>new Node(tag);
  document.querySelectorAll=selector=>{reads++;return document.body.querySelectorAll(selector);};
  document.querySelector=selector=>document.querySelectorAll(selector)[0]||null;
  const view={...events(),location:{pathname:'/home',href:'https://x.com/home',origin:'https://x.com'},crypto:webcrypto,AbortController,btoa,
    setTimeout(fn){const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},
    getComputedStyle(node){if(node.native)reads++;return {display:node===footer?'flex':'block',flexDirection:'row',visibility:'visible',position:'static',backgroundColor:'rgb(255, 255, 255)',opacity:'1',fontSize:'15px',fontWeight:'400',borderBottomWidth:'0px'};},
    fetch:fetch||(()=>{throw new Error('Unexpected request');})};
  document.defaultView=view;
  const options={document,core:Core,send:message=>{sent.push(message);return true;},wake(){}};
  if(policy)options.isPageAllowed=()=>allowed;
  const manager=Draft.create(options);
  return {manager,document,view,editor,sent,timers,created,
    setAllowed(value){allowed=value;},get reads(){return reads;},
    configure(changes={}){manager.configure({ready:true,connected:true,hasConfig:true,identity:'test',...changes});},
    trigger(){return created.find(node=>node.className==='action'&&node.isConnected);},
    flush(){for(const [id,fn]of [...timers]){timers.delete(id);fn();}},
    ownNodes(){return created.filter(node=>['SUPERX-DRAFT-ACTION','SUPERX-DRAFT-PANEL'].includes(node.tagName)&&node.isConnected);}};
}

test('blocked draft pages do not inspect editors, retain work or schedule scans',()=>{
  const page=fixture({allowed:false}),before=page.reads;
  page.configure();page.manager.scan();page.manager.refresh();page.manager.reset();
  for(const type of ['input','focusin','load'])page.document.emit(type,{target:page.editor});
  page.view.emit('resize');page.manager.handleMessage({type:'UPDATE',requestId:'unknown',text:'discard'});
  assert.equal(page.reads,before);assert.equal(page.manager.activeCount,0);
  assert.equal(page.timers.size,0);assert.equal(page.ownNodes().length,0);assert.deepEqual(page.sent,[]);
});

test('a blocked SPA transition cancels draft work once and drops late output without reading the page',()=>{
  const page=fixture();page.configure();page.trigger().emit('click');
  const request=page.sent.find(message=>message.type==='ANALYZE_DRAFT');assert.ok(request);assert.equal(page.manager.activeCount,1);
  page.setAllowed(false);const before=page.reads;
  assert.equal(page.manager.handleMessage({type:'UPDATE',requestId:request.requestId,text:'Late answer'}),false);
  page.manager.refresh();page.configure();page.manager.reset();page.flush();
  assert.equal(page.reads,before);assert.equal(page.manager.activeCount,0);assert.equal(page.ownNodes().length,0);
  assert.deepEqual(page.sent.filter(message=>message.type==='CANCEL'),[{type:'CANCEL',requestId:request.requestId}]);
  assert.equal(page.sent.filter(message=>message.type==='ANALYZE_DRAFT').length,1);assert.equal(page.timers.size,0);
  page.setAllowed(true);page.manager.scan();page.configure();page.flush();
  assert.ok(page.trigger());assert.equal(page.sent.filter(message=>message.type==='ANALYZE_DRAFT').length,1,'Returning never restores an old paid intent');
});

test('a draft waiting for connection cannot dispatch after entering a blocked page',()=>{
  const page=fixture();page.trigger().emit('click');assert.equal(page.manager.activeCount,1);assert.deepEqual(page.sent,[]);
  page.setAllowed(false);const before=page.reads;page.configure();page.flush();
  assert.equal(page.reads,before);assert.equal(page.manager.activeCount,0);assert.deepEqual(page.sent,[]);
});

test('an asynchronous image capture cannot send a draft after a blocked route transition',async()=>{
  let resolveFetch;const fetching=new Promise(resolve=>{resolveFetch=resolve;});
  const page=fixture({images:true,fetch:()=>fetching});page.configure();page.trigger().emit('click');
  assert.equal(page.manager.activeCount,1);assert.equal(page.sent.some(message=>message.type==='ANALYZE_DRAFT'),false);
  page.setAllowed(false);const before=page.reads;
  resolveFetch({ok:true,headers:{get:()=>null},arrayBuffer:async()=>Uint8Array.from([137,80,78,71,13,10,26,10]).buffer});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(page.reads,before);assert.equal(page.manager.activeCount,0);assert.equal(page.ownNodes().length,0);
  assert.equal(page.sent.some(message=>message.type==='ANALYZE_DRAFT'),false);assert.equal(page.timers.size,0);
});

test('the default draft guard uses the shared route policy and fails closed on policy errors',()=>{
  const page=fixture({policy:false});page.configure();assert.ok(page.trigger());const before=page.reads;
  page.view.location.pathname='/i/money';page.manager.scan();page.manager.refresh();
  assert.equal(page.reads,before);assert.equal(page.ownNodes().length,0);
  const hostileDocument={body:{},defaultView:{addEventListener(){},removeEventListener(){},clearTimeout(){}},addEventListener(){},removeEventListener(){},
    querySelectorAll(){throw new Error('Must not read the page');}};
  const manager=Draft.create({document:hostileDocument,core:Core,isPageAllowed(){throw new Error('Policy unavailable');}});
  assert.equal(manager.activeCount,0);manager.scan();manager.destroy();
});
