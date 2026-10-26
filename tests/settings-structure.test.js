'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

// This validates our source's explicit nesting. It deliberately rejects markup
// that a browser would silently repair; native DOM and constraint validation
// are separately exercised in an isolated Chromium acceptance run.
function strictTree(html){
  const root={tag:'#document',children:[]},stack=[root],ids=new Map();
  const voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  const source=html.replace(/<!--[\s\S]*?-->/g,'');
  for(const match of source.matchAll(/<\/?([A-Za-z][\w:-]*)\b(?:"[^"]*"|'[^']*'|[^'">])*\/?>/g)){
    const tag=match[1].toLowerCase(),token=match[0];
    if(token.startsWith('</')){assert.equal(stack.at(-1).tag,tag,`Unexpected </${tag}>; current parent is <${stack.at(-1).tag}>`);stack.pop();continue;}
    const node={tag,parent:stack.at(-1),children:[],token};node.parent.children.push(node);
    const id=token.match(/\bid\s*=\s*(["'])(.*?)\1/i)?.[2];if(id){assert.equal(ids.has(id),false,`Duplicate #${id}`);ids.set(id,node);}
    if(!voidTags.has(tag)&&!token.endsWith('/>'))stack.push(node);
  }
  assert.equal(stack.length,1,`Unclosed <${stack.at(-1).tag}>`);return {root,ids};
}
const source=file=>fs.readFileSync(path.join(__dirname,'../extension',file+'.html'),'utf8');
const ancestor=(node,target)=>{for(let current=node;current;current=current.parent)if(current===target)return true;return false;};

test('Settings, history and setup HTML have explicit balanced nesting and unique IDs',()=>{
  for(const file of ['options','history','setup'])assert.doesNotThrow(()=>strictTree(source(file)),file);
});

test('provider panels are siblings and every provider-specific control belongs to its panel and settings form',()=>{
  const {ids}=strictTree(source('options')),form=ids.get('settings-form'),api=ids.get('api-fields'),build=ids.get('build-fields'),oauth=ids.get('oauth-fields');
  assert.ok(form&&api&&build&&oauth);assert.equal(api.parent,build.parent);assert.equal(api.parent,oauth.parent);assert.equal(api.parent.tag,'section');
  for(const [panel,controls]of [[api,['api-key','remember-key','api-model','api-reasoning-effort','fast-preset','clear-key']],[build,['build-platform','generate-build-command','build-port','build-secret','build-model','build-reasoning-effort','check-build','build-guide','clear-build-connection']],[oauth,['oauth-login','oauth-cancel','oauth-logout','oauth-remember','oauth-model','oauth-reasoning-effort','oauth-refresh-models']]]){
    for(const id of controls){assert.ok(ancestor(ids.get(id),panel),`Provider control #${id} escaped its panel`);assert.ok(ancestor(ids.get(id),form),`#${id} escaped #settings-form`);}
  }
  for(const id of ['provider','trigger-mode-automatic','trigger-mode-custom','trigger-mode-paused','trigger-manual','trigger-post-hover','trigger-button-hover','trigger-detail-main','trigger-detail-replies','trigger-post-hover-seconds','trigger-button-hover-seconds','api-concurrency','analysis-dwell','web-search','x-search','language','interface-language','verify-prompt','comments-prompt','clear-cache','reload-extension']){
    assert.ok(ancestor(ids.get(id),form),`#${id} escaped #settings-form`);assert.equal(ancestor(ids.get(id),api)||ancestor(ids.get(id),build)||ancestor(ids.get(id),oauth),false,`Shared #${id} is trapped in a provider panel`);
  }
});

test('popup and Settings expose one native three-way mode choice and five ordered custom conditions',()=>{
  for(const page of ['popup','options']){
    const html=source(page),{ids}=strictTree(html);
    assert.equal(ids.has('toggle'),false);assert.equal(ids.has('enabled'),false);
    for(const mode of ['automatic','custom','paused']){
      const radio=ids.get('trigger-mode-'+mode);assert.ok(radio);assert.equal(radio.tag,'input');
      assert.match(radio.token,/type="radio"/);assert.match(radio.token,/name="trigger-mode"/);assert.match(radio.token,new RegExp('value="'+mode+'"'));
    }
  }
  const html=source('options'),{ids}=strictTree(html),order=['manual','button-hover','post-hover','detail-main','detail-replies'];
  const indexes=order.map(name=>html.indexOf('id="trigger-'+name+'"'));
  assert.ok(indexes.every((value,index)=>value>=0&&(!index||value>indexes[index-1])));
  const popup=source('popup'),popupIndexes=order.map(name=>popup.indexOf('id="summary-trigger-'+name+'"'));
  assert.ok(popupIndexes.every((value,index)=>value>=0&&(!index||value>popupIndexes[index-1])));
  assert.match(html,/data-i18n="popup\.triggerCached"/);
  for(const name of order){const checkbox=ids.get('trigger-'+name);assert.match(checkbox.token,/type="checkbox"/);assert.ok(ancestor(checkbox,ids.get('custom-triggers')));}
  for(const name of ['post-hover','button-hover'])assert.match(ids.get('trigger-'+name+'-seconds').token,/type="number"[^>]*min="0"[^>]*max="30"/);
});

test('browsing history navigation uses a native page link and keeps recording controls only on the history page',()=>{
  const optionsHTML=source('options'),historyHTML=source('history'),options=strictTree(optionsHTML),history=strictTree(historyHTML);
  for(const id of ['history-heading','history-enabled','open-history','history-status'])assert.equal(options.ids.has(id),false,`Removed Settings history control #${id}`);
  const walk=node=>node.children.flatMap(child=>[child,...walk(child)]),optionsLink=walk(options.root).find(node=>node.tag==='a'&&/data-i18n="common\.history"/.test(node.token));
  assert.ok(optionsLink);assert.match(optionsLink.token,/href="history\.html"/);assert.doesNotMatch(optionsLink.token,/\b(?:onclick|target|role)=/,'The ordinary anchor supports same-tab, keyboard and browser new-tab navigation');
  const historyNav=walk(history.root).find(node=>node.tag==='nav'&&/class="section-nav"/.test(node.token));assert.equal(historyNav.children[0].tag,'a');assert.match(historyNav.children[0].token,/href="options\.html"/);assert.match(historyNav.children[0].token,/common\.settings/);assert.doesNotMatch(historyNav.children[0].token,/aria-current/);assert.equal(historyNav.children[1].tag,'span');assert.match(historyNav.children[1].token,/aria-current="page"/);assert.match(historyNav.children[1].token,/history\.title/);assert.ok(history.ids.has('history-enabled'));assert.equal(history.ids.get('history-enabled').tag,'input');
});

test('a premature provider closing tag fails the structural check instead of relying on browser repair',()=>{
  const html=source('options'),marker=html.match(/<div class="connection-actions">[^\n]*<\/div>/)?.[0];assert.ok(marker);
  assert.throws(()=>strictTree(html.replace(marker,marker+'\n</div>')),/Unexpected/);
});

test('connection choices prioritize subscription sign-in with distinct short labels',()=>{
  const {ids}=strictTree(source('options')),choices=ids.get('provider').children;
  assert.deepEqual(choices.map(node=>node.token.match(/\bvalue="([^"]+)"/)[1]),['oauth','api','build']);
  assert.match(choices[0].token,/options\.providerOAuth/);assert.match(choices[1].token,/options\.providerKey/);assert.match(choices[2].token,/options\.providerBuild/);
});

test('OAuth connection controls retain their layout without the removed authorization and automation copy',()=>{
  const html=source('options'),{ids}=strictTree(html),row=ids.get('oauth-status').parent;
  assert.doesNotMatch(html,/oauth-authorization-details|oauth\.(?:authorizationDetails|sharedClient|startHint)/);
  assert.match(row.token,/oauth-connection-row/);assert.ok(row.children.some(node=>ancestor(ids.get('oauth-login'),node)));assert.ok(row.children.some(node=>ancestor(ids.get('oauth-logout'),node)));
  const css=fs.readFileSync(path.join(__dirname,'../extension/options.css'),'utf8');assert.match(css,/#oauth-fields\s*>\s*\.oauth-remember-label\s*\{[^}]*margin-top:\s*20px/,'Remember spacing must outrank the shared checkbox reset');
});
