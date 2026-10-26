'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../extension/feed-core.js');
const ui = require('../extension/ui-i18n.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('shared request diagnostics preserve only traceable fixed fields and redact credentials, identities and URL parameters',()=>{
  const requestId='4C73719F-9698-4A53-8858-249F18CB83AD',responseId='6622e6fd-731d-9e8d-a8f1-9d721316e2a5';
  const value={failureOrigin:'stream',transportStatus:200,requestId,responseId,startedAt:1792151999800,failedAt:1792152000000,elapsedMs:200,
    requestedModel:'grok-4.3',model:'grok-4.3-actual',requestedEffort:'none',providerMessage:`<b>Monthly budget reached.</b> Bearer abc.def.secret xai-privatevalue sk-privatevalue owner@example.com ${requestId} acct_${'Z'.repeat(32)} https://console.x.ai/billing?private=hidden#fragment`,
    apiKey:'DO_NOT_COPY',authorization:'DO_NOT_COPY',post:{text:'DO_NOT_COPY'},prompt:'DO_NOT_COPY',body:'DO_NOT_COPY',httpStatus:402};
  const clean=core.sanitizedRequestDiagnostics(value);
  assert.deepEqual({...clean,providerMessage:undefined},{failureOrigin:'stream',transportStatus:200,requestId:requestId.toLowerCase(),responseId,startedAt:1792151999800,failedAt:1792152000000,elapsedMs:200,requestedModel:'grok-4.3',model:'grok-4.3-actual',requestedEffort:'none',providerMessage:undefined});
  assert.match(clean.providerMessage,/<b>Monthly budget reached\.<\/b>/);assert.match(clean.providerMessage,/console\.x\.ai\/billing/);
  assert.doesNotMatch(clean.providerMessage,/abc\.def|xai-private|sk-private|owner@example|4C73719F|ZZZZ|hidden|fragment/);assert.equal(JSON.stringify(clean).includes('DO_NOT_COPY'),false);
  assert.deepEqual(core.sanitizedRequestDiagnostics(clean),clean);assert.equal(clean.httpStatus,undefined);
});

test('shared request diagnostics reject malformed provenance and IDs and bound full-string redaction before truncation',()=>{
  for(const value of [undefined,null,{},[],{failureOrigin:'sse'},{failureOrigin:'PRIVATE_ORIGIN'}])assert.equal(core.sanitizedRequestDiagnostics(value),undefined);
  const invalid={failureOrigin:'network',transportStatus:'402',requestId:'owner@example.com',responseId:'resp_unknown',startedAt:-1,failedAt:NaN,elapsedMs:Infinity,requestedEffort:'PRIVATE_EFFORT',requestedModel:'xai-PRIVATE_KEY',model:'<script>PRIVATE</script>',providerMessage:'x'.repeat(8193)};
  assert.deepEqual(core.sanitizedRequestDiagnostics(invalid),{failureOrigin:'network'});
  const value=core.sanitizedRequestDiagnostics({failureOrigin:'http',providerMessage:'🔎 '.repeat(295)+'xai-'+ 'Z'.repeat(80)+' trailing'});
  assert.ok(Array.from(value.providerMessage).length<=600);assert.doesNotMatch(value.providerMessage,/ZZZZ|xai-/);
  assert.match(core.sanitizedRequestDiagnostics({failureOrigin:'stream',providerMessage:'xai-\u200bprivatecredential'}).providerMessage,/\[redacted\]/);
  assert.equal(core.sanitizedRequestDiagnostics({failureOrigin:'stream',providerMessage:'xai-\u200bprivatecredential'}).providerMessage.includes('privatecredential'),false);
});

// A small selector-capable DOM fixture avoids third-party installs and keeps these
// tests focused on the feed structures the extension actually consumes.
class Element {
  constructor(tag, attrs = {}, children = [], text = '') {
    this.tagName = tag.toUpperCase();
    this.attrs = attrs;
    this.children = children;
    this.parentElement = null;
    this.text = text;
    for (const child of children) child.parentElement = this;
  }
  getAttribute(name) { return this.attrs[name] ?? null; }
  get innerText() { return this.text + this.children.map(child => child.innerText).join('\n'); }
  get textContent() { return this.innerText; }
  querySelectorAll(selector) {
    const match = (node, part) => {
      const parsed = part.trim().match(/^([a-z]+)?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/i);
      if (!parsed) throw new Error(`Unsupported fixture selector: ${part}`);
      return (!parsed[1] || node.tagName === parsed[1].toUpperCase()) &&
        (!parsed[2] || (node.getAttribute(parsed[2]) !== null && (parsed[3] === undefined || node.getAttribute(parsed[2]) === parsed[3])));
    };
    const selectors = selector.split(',');
    const found = [];
    const visit = node => {
      for (const child of node.children) {
        if (selectors.some(part => match(child, part))) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
}

const e = (tag, attrs, children, text) => new Element(tag, attrs, children, text);
const header = (handle, id, datetime = '2026-10-05T01:00:00.000Z') => e('div', { 'data-testid': 'User-Name' }, [
  e('span', {}, [], `Name of ${handle}`),
  e('span', {}, [], `@${handle}`),
  e('span', {}, [], '·'),
  e('a', { href: `/${handle}/status/${id}` }, [e('time', { datetime }, [], '1h')])
]);
const tweetText = text => e('div', { 'data-testid': 'tweetText' }, [], text);

test('composer context extracts a profile-only reply preview without inventing a post ID',()=>{
  const name=e('div',{'data-testid':'User-Name'},[e('a',{href:'/Author'},[],'Author'),e('a',{href:'/Author'},[],'@Author')]);
  const scope=e('article',{'data-testid':'tweet'},[name,tweetText('The incident described in the reply preview.'),e('time',{datetime:'2026-10-23T10:00:00Z'},[],'2h')]);
  assert.equal(core.extractPost(scope),null,'Ordinary feed extraction still requires a permalink');
  const snapshot=core.extractPostContext(scope);
  assert.equal(snapshot.id,null);assert.equal(snapshot.url,null);assert.equal(snapshot.snapshotOnly,true);
  assert.equal(snapshot.username,'author');assert.equal(snapshot.text,'The incident described in the reply preview.');
  assert.equal(snapshot.timestamp,'2026-10-23T10:00:00Z');assert.equal(snapshot.textTruncated,undefined);
});

test('composer context never treats a referenced body or media status link as its own permalink',()=>{
  const name=()=>e('div',{'data-testid':'User-Name'},[e('a',{href:'/Writer'},[],'@Writer')]);
  for(const reference of [e('div',{'data-testid':'tweetText'},[e('a',{href:'/other/status/999'},[],'Referenced claim')],'The draft refers to '),e('a',{href:'/other/status/999'},[e('img',{src:'https://pbs.twimg.com/media/preview.jpg'})])]){
    const scope=e('article',{},[name(),tweetText('Own visible preview.'),reference,e('time',{datetime:'2026-10-23T10:00:00.000Z'},[],'now')]);
    const context=core.extractPostContext(scope);assert.equal(context.id,null);assert.equal(context.url,null);assert.equal(context.snapshotOnly,true);assert.equal(context.username,'writer');
    assert.equal(context.timestamp,'2026-10-23T10:00:00.000Z');assert.match(context.text,/Own visible preview/);
  }
  const header=e('div',{'data-testid':'User-Name'},[e('a',{href:'/Writer/status/123'},[],'@Writer')]);
  const linked=core.extractPostContext(e('article',{},[header,tweetText('Own visible preview.'),e('a',{href:'/other/status/999'},[],'Other post')]));
  assert.equal(linked.id,'123');assert.equal(linked.url,'https://x.com/writer/status/123');assert.equal(linked.snapshotOnly,undefined);
});

test('composer context keeps nested native quote buttons separate without tweet test IDs or status links',()=>{
  const preview=(handle,text,children=[])=>e('button',{},[e('div',{'data-testid':'User-Name'},[
    e('a',{href:'/'+handle},[],handle),e('a',{href:'/'+handle},[],'@'+handle)]),tweetText(text),e('time',{datetime:'2026-10-23T10:00:00Z'},[],'2h'),...children]);
  const inner=preview('inside','Inner quotation.'),outer=preview('outside','Outer quotation.',[inner]);
  const result=core.extractPostContext(outer);
  assert.equal(result.text,'Outer quotation.');assert.equal(result.username,'outside');assert.equal(result.snapshotOnly,true);
  assert.equal(result.quotedContext.length,1);assert.equal(result.quotedContext[0].text,'Inner quotation.');
  assert.equal(result.quotedContext[0].username,'inside');assert.equal(result.quotedContext[0].snapshotOnly,true);
  const root=e('article',{},[header('parent','100'),tweetText('Parent.'),outer]);
  const linked=core.extractPostContext(root);
  assert.equal(linked.id,'100');assert.equal(linked.url,'https://x.com/parent/status/100');assert.equal(linked.snapshotOnly,undefined);
  assert.equal(linked.text,'Parent.');assert.equal(linked.quotedContext[0].text,'Outer quotation.');
  assert.equal(linked.quotedContext[0].quotedContext[0].text,'Inner quotation.');
});

test('composer context unwraps an empty quoteTweet shell around its native preview button',()=>{
  const source=e('button',{},[header('source','456','2026-10-23T10:00:00.000Z'),tweetText('Nested source retained separately.')]);
  const outer=e('article',{'data-testid':'tweet'},[header('parent','123','2026-10-23T09:00:00.000Z'),tweetText('Parent visible context.'),e('div',{'data-testid':'quoteTweet'},[source])]);
  const result=core.extractPostContext(outer);
  assert.equal(result.id,'123');assert.equal(result.text,'Parent visible context.');assert.equal(result.timestamp,'2026-10-23T09:00:00.000Z');
  assert.equal(result.quotedContext.length,1);assert.equal(result.quotedContext[0].id,'456');
  assert.equal(result.quotedContext[0].text,'Nested source retained separately.');assert.equal(result.quotedContext[0].timestamp,'2026-10-23T10:00:00.000Z');
});

test('composer context preserves ordinary linked-post extraction while capping quote depth and siblings',()=>{
  const ordinary=e('article',{},[header('parent','123'),tweetText('Parent text.'),e('div',{role:'link'},[header('quoted','456'),tweetText('Quoted text.')])]);
  assert.deepEqual(core.extractPostContext(ordinary),core.extractPost(ordinary));
  const preview=(text,children=[])=>e('button',{},[e('div',{'data-testid':'User-Name'},[],text),tweetText(text),e('time',{},[],'now'),...children]);
  const deepest=preview('Too deep'),inner=preview('Inner',[deepest]),outer=preview('Outer',[inner]);
  const result=core.extractPostContext(preview('Root',[outer,preview('Second'),preview('Third')]));
  assert.equal(result.quotedContext.length,2);assert.equal(result.quotedContext[0].quotedContext[0].text,'Inner');
  assert.deepEqual(result.quotedContext[0].quotedContext[0].quotedContext,[]);
});

test('composer context usernames use only an unambiguous owned header and matching profile links',()=>{
  const scope=(name,profile)=>e('article',{},[e('div',{'data-testid':'User-Name'},[e('a',{href:profile},[],name)]),tweetText('Replying to @bodyMention is not an author identity.')]);
  assert.equal(core.extractPostContext(scope('@OnlyHeader','/OnlyHeader')).username,'onlyheader');
  for(const [name,profile]of [['OnlyHeader','/OnlyHeader'],['@One @Two','/One'],['@One','/Two'],['@handle_is_over_15','/handle_is_over_15']]){
    const result=core.extractPostContext(scope(name,profile));assert.equal(result.username,'',name);assert.equal(result.id,null);assert.equal(result.url,null);
  }
});

test('composer context marks real Show more and line-clamp truncation independently of missing permalinks',()=>{
  const linked=e('article',{},[header('parent','123'),tweetText('Visible excerpt.'),e('button',{'data-testid':'tweet-text-show-more-link'},[],'Show more')]);
  assert.equal(core.extractPostContext(linked).textTruncated,true);assert.equal(core.extractPostContext(linked).snapshotOnly,undefined);
  assert.equal(core.extractPost(linked).textTruncated,undefined,'The existing feed result shape is unchanged');
  const text=tweetText('Clamped excerpt.');text.attrs.style='display:-webkit-box;-webkit-line-clamp:2';text.clientHeight=40;text.scrollHeight=80;
  const preview=e('button',{},[e('div',{'data-testid':'User-Name'},[],'@name'),text]);
  assert.equal(core.extractPostContext(preview).textTruncated,true);assert.equal(core.extractPostContext(preview).snapshotOnly,true);
  text.scrollHeight=40;assert.equal(core.extractPostContext(preview).textTruncated,undefined,'A clamp that does not overflow is not truncation');
});

test('reader output hides the screenshot tool chain at every streaming prefix and on completion',()=>{
  const commands=[
    {absolute_path:'x_thread_fetch',post_id:'2109569541072384120'},
    {absolute_path:'x_thread_fetch',post_id:'2109330407472984125'},
    {absolute_path:'web_search',query:'high bone density reduce injury severity accidents fractures',num_results:10},
    {absolute_path:'web_search',query:'bone density and fracture risk sports injuries',num_results:10},
    {absolute_path:'web_search',query:'"hard bone theory" OR "hard bones" bone density',num_results:5},
    {absolute_path:'view_image',image_url:'https://pbs.twimg.com/media/HUYX0WNbkAADKz?format=jpg'},
    {absolute_path:'x_keyword_search',query:'from:coolish bone OR bones OR density',limit:5,mode:'Latest'},
    {absolute_path:'x_semantic_search',query:'bone density and fracture risk',limit:5}
  ];
  for(const text of [
    commands.map(command=>JSON.stringify(command)).join('\n'),
    commands.map(command=>'```json\n'+JSON.stringify(command)+'\n```').join('\n\n'),
    '~~~json\n'+JSON.stringify(commands)+'\n~~~'
  ]) {
    for(let end=1;end<=text.length;end++) {
      const result=core.readerOutput(text.slice(0,end));
      assert.equal(result.text,'',`Tool command prefix ${end}: ${text.slice(0,end)}`);
      assert.ok(['pending','tool_only'].includes(result.kind));
    }
    assert.deepEqual(core.readerOutput(text,{final:true}),{kind:'tool_only',text:''});
  }
});

test('reader output recognizes only whole known tool invocations while preserving useful JSON, code and mixed prose',()=>{
  const invocation={absolute_path:'web_search',query:'An escaped "quote", slash \\ and {braces} [arrays]',num_results:5};
  assert.deepEqual(core.readerOutput(JSON.stringify(invocation),{final:true}),{kind:'tool_only',text:''});
  const content=[
    '{"verified":false,"value":42}',
    '["First comment.","Second comment.","Third comment."]',
    '{"absolute_path":"F:\\\\project\\\\report.json","query":"Example data"}',
    '{"absolute_path":"unrelated_tool","query":"Example data"}',
    '{"absolute_path":"web_search"}',
    '{"absolute_path":"web_search","query":"Example data","explanation":"Technical example"}',
    '[{"absolute_path":"web_search","query":"Example data"},{"value":1}]',
    '```js\nconst request = {absolute_path:"web_search", query:"example"};\n```',
    '```json\n{"value":1,"unit":"g/cm²"}\n```',
    'Use this example:\n```json\n'+JSON.stringify(invocation)+'\n```',
    JSON.stringify(invocation)+'\nThe evidence contradicts the claimed result.',
    '  A concise finding with `code` and https://primary.example/evidence.\n'
  ];
  for(const text of content)assert.deepEqual(core.readerOutput(text,{final:true}),{kind:'content',text},text);
  for(const value of [null,undefined,7,' \n\t '])assert.deepEqual(core.readerOutput(value,{final:true}),{kind:'empty',text:''});
});

test('truncated known tool invocations cannot become partial answers but ordinary unfinished JSON remains content at completion',()=>{
  for(const text of [
    '{"absolute_path":"x_thread_fetch","post_id":"210956',
    '```json\n{"absolute_path":"web_search","query":"bone density',
    '[{"absolute_path":"view_image","image_url":"https://example.com/image'
  ]) {
    assert.deepEqual(core.readerOutput(text),{kind:'pending',text:''});
    assert.deepEqual(core.readerOutput(text,{final:true}),{kind:'tool_only',text:''});
  }
  for(const text of ['{"value":42','{"absolute_path":"F:/data/claim.json","value":','```json\n{"density":']) {
    assert.deepEqual(core.readerOutput(text),{kind:'pending',text:''});
    assert.deepEqual(core.readerOutput(text,{final:true}),{kind:'content',text});
  }
});

test('promoted posts use the Ad label in the author header, not media tracking or post words', () => {
  const row = e('div', {}, [header('sponsor','701'),e('span',{},[],'Ad'),e('button',{'data-testid':'caret'})]);
  const ad = e('article',{},[row,tweetText('Sponsor message')]);
  assert.equal(core.extractPost(ad).isPromoted,true);
  const ordinary = e('article',{},[header('writer','702'),tweetText('Ad'),e('div',{'data-testid':'placementTracking'})]);
  assert.equal(core.extractPost(ordinary).isPromoted,false);
});

test('a promoted quoted post does not classify its outer author as an advertiser', () => {
  const quote = e('div',{role:'link'},[e('div',{},[header('sponsor','704'),e('span',{},[],'Ad'),e('button',{'data-testid':'caret'})]),tweetText('Sponsored quote')]);
  const outer = e('article',{},[header('writer','703'),tweetText('Comment on the ad'),quote]);
  assert.equal(core.extractPost(outer).isPromoted,false);
});

test('canonical status URLs strip tracking and photo suffixes and migrate twitter.com', () => {
  assert.equal(core.canonicalPostUrl('https://twitter.com/TestUser/status/12345/photo/1?s=20'), 'https://x.com/testuser/status/12345');
  assert.equal(core.canonicalPostUrl('/alice/status/900#replies'), 'https://x.com/alice/status/900');
  assert.equal(core.canonicalPostUrl('/i/web/status/22'), 'https://x.com/i/web/status/22');
  for (const invalid of ['', '/alice', '/alice/status/nope', 'javascript:alert(1)', 'https://x.com.evil.test/alice/status/22', 'https://example.com/alice/status/22']) {
    assert.equal(core.canonicalPostUrl(invalid), null, invalid);
  }
});

test('extracts the outer post while preserving a quoted role-link context', () => {
  const quote = e('div', { role: 'link', tabindex: '0' }, [header('quoted', '200'), tweetText('Quoted claim')]);
  const article = e('article', { 'data-testid': 'tweet' }, [header('author', '100'), tweetText('Outer claim'), quote]);
  const result = core.extractPost(article);
  assert.equal(result.id, '100');
  assert.equal(result.url, 'https://x.com/author/status/100');
  assert.equal(result.text, 'Outer claim');
  assert.equal(result.author, 'Name of author @author');
  assert.equal(result.username, 'author');
  assert.equal(result.timestamp, '2026-10-05T01:00:00.000Z');
  assert.equal(result.quotedContext.length, 1);
  assert.equal(result.quotedContext[0].id, '200');
  assert.equal(result.quotedContext[0].text, 'Quoted claim');
});

test('published media stays attached to its own source through nested quotes and distinguishes video thumbnails',()=>{
  const image=(name,alt='')=>e('img',{src:`https://pbs.twimg.com/media/${name}.jpg?name=small`,alt});
  const nested=e('div',{role:'link'},[header('deep','303'),tweetText('Deep source.'),image('deep','Deep screenshot')]);
  const quoted=e('div',{role:'link'},[header('quoted','302'),tweetText('Quoted source.'),
    e('img',{src:'https://pbs.twimg.com/ext_tw_video_thumb/302/example.jpg?name=small',alt:'Video cover'}),
    e('div',{'data-testid':'videoPlayer'}),nested]);
  const outer=e('article',{'data-testid':'tweet'},[header('author','301'),tweetText('Main source.'),image('main','Main screenshot'),quoted]);
  const result=core.extractPost(outer);
  assert.equal(result.text,'Main source.');assert.deepEqual(result.images,[{url:'https://pbs.twimg.com/media/main.jpg',alt:'Main screenshot'}]);
  assert.equal(result.hasVideo,undefined);
  const quote=result.quotedContext[0];assert.equal(quote.text,'Quoted source.');assert.equal(quote.id,'302');assert.equal(quote.hasVideo,true);
  assert.deepEqual(quote.images,[{url:'https://pbs.twimg.com/ext_tw_video_thumb/302/example.jpg',alt:'Video cover',kind:'video-thumbnail'}]);
  assert.equal(quote.quotedContext[0].id,'303');assert.equal(quote.quotedContext[0].text,'Deep source.');
  assert.deepEqual(quote.quotedContext[0].images,[{url:'https://pbs.twimg.com/media/deep.jpg',alt:'Deep screenshot'}]);
});

test('media-only native previews retain published pictures without inventing a permalink or inheriting quoted images',()=>{
  const quoted=e('button',{},[e('div',{'data-testid':'User-Name'},[],'@quoted'),tweetText('Quoted words.'),
    e('img',{src:'https://pbs.twimg.com/media/quote.png',alt:'Quoted image'})]);
  const preview=e('button',{},[e('div',{'data-testid':'User-Name'},[],'@author'),
    e('img',{src:'https://pbs.twimg.com/media/own.png',alt:'Screenshot has the primary claim'}),quoted]);
  const result=core.extractPostContext(preview);
  assert.equal(result.text,'');assert.equal(result.snapshotOnly,true);assert.equal(result.id,null);assert.equal(result.hasMedia,true);
  assert.deepEqual(result.images,[{url:'https://pbs.twimg.com/media/own.png',alt:'Screenshot has the primary claim'}]);
  assert.deepEqual(result.quotedContext[0].images,[{url:'https://pbs.twimg.com/media/quote.png',alt:'Quoted image'}]);
});

test('a nested quoted article appearing before outer content cannot become the outer post', () => {
  const quoted = e('article', {}, [header('inside', '55'), tweetText('Inside')]);
  const article = e('article', {}, [quoted, header('outside', '66'), tweetText('Outside')]);
  const result = core.extractPost(article);
  assert.equal(result.id, '66');
  assert.equal(result.text, 'Outside');
  assert.equal(result.quotedContext[0].id, '55');
});

test('post language comes from its own tweet text even when a different-language quote appears first', () => {
  const quoteText = e('div', { 'data-testid': 'tweetText', lang: 'en' }, [], 'Quoted claim in English');
  const quote = e('div', { role: 'link' }, [header('quoted', '802'), quoteText]);
  const parentText = e('div', { 'data-testid': 'tweetText', lang: 'ja' }, [], '日本語の投稿');
  const article = e('article', { lang: 'fr' }, [quote, header('parent', '801'), parentText]);
  const post = core.extractPost(article);
  assert.equal(post.language, 'ja');
  assert.equal(post.quotedContext.length, 1);
  assert.equal(post.quotedContext[0].language, 'en');
});

test('missing or invalid parent tweet language stays empty rather than inheriting article or quote language', () => {
  for (const language of [undefined, '', '<script>', 'auto', 'en_US', 'en--US', '123', 'ja\n', 'zh Hant']) {
    const attrs = { 'data-testid': 'tweetText' };
    if (language !== undefined) attrs.lang = language;
    const quote = e('div', { 'data-testid': 'quoteTweet' }, [header('quoted', '804'),
      e('div', { 'data-testid': 'tweetText', lang: 'en' }, [], 'A quoted English claim')]);
    const article = e('article', { lang: 'zh-CN' }, [header('parent', '803'),
      e('div', attrs, [], 'Parent content'), quote]);
    const post = core.extractPost(article);
    assert.equal(post.language, '', `Parent lang=${String(language)}`);
    assert.equal(post.quotedContext[0].language, 'en');
  }
  const mediaOnly = e('article', { lang: 'en' }, [header('parent', '805'),
    e('img', { src: 'https://pbs.twimg.com/media/photo.jpg', lang: 'ja' })]);
  assert.equal(core.extractPost(mediaOnly).language, '');
});

test('post extraction follows a displayed translation and excludes its hidden original and quoted language', () => {
  const original = e('div', { 'data-testid': 'tweetText', lang: 'ja' }, [], '日本語の原文です');
  const translation = e('div', { 'data-testid': 'tweetText', lang: 'en' }, [], 'This is the displayed translation of the post.');
  const originalWrapper = e('div', { hidden: '' }, [original]);
  const translationWrapper = e('div', {}, [translation]);
  const quote = e('div', { role: 'link' }, [header('quoted', '811'),
    e('div', { 'data-testid': 'tweetText', lang: 'ko' }, [], '인용한 한국어 게시물입니다')]);
  const article = e('article', { lang: 'fr' }, [header('author', '810'), originalWrapper, translationWrapper, quote]);
  const translated = core.extractPost(article);
  assert.equal(translated.text, 'This is the displayed translation of the post.');
  assert.equal(translated.language, 'en');
  assert.equal(core.resolvePostLanguage('auto', translated), 'en');
  delete originalWrapper.attrs.hidden;
  translationWrapper.attrs['aria-hidden'] = 'true';
  const restored = core.extractPost(article);
  assert.equal(restored.text, '日本語の原文です');
  assert.equal(restored.language, 'ja');
  assert.equal(core.resolvePostLanguage('auto', restored), 'ja');
});

test('hidden body nodes are excluded by their own or ancestor inline and computed styles without viewport gating', () => {
  for (const style of ['display:none', 'visibility: hidden', 'display: none !important;', 'color:red;visibility:collapse']) {
    const hidden = e('div', { style }, [e('div', { 'data-testid': 'tweetText', lang: 'ja' }, [], '非表示の原文です')]);
    const shown = e('div', { 'data-testid': 'tweetText', lang: 'en' }, [], 'This is the displayed post in English.');
    const article = e('article', {}, [header('author', '812'), shown, hidden]);
    assert.equal(core.extractPost(article).language, 'en', style);
    assert.equal(core.extractPost(article).text, shown.text, style);
  }
  const shown = e('div', { 'data-testid': 'tweetText', lang: 'en' }, [], 'This is the displayed post in English.');
  const hidden = e('div', { 'data-testid': 'tweetText', lang: 'ja' }, [], '非表示の原文です');
  const article = e('article', {}, [header('author', '813'), shown, hidden]);
  const styles = new Map([[hidden, { display: 'none', visibility: 'visible' }]]);
  const document = { defaultView: { getComputedStyle: node => styles.get(node) || { display: 'block', visibility: 'visible' } } };
  for (const node of [article, shown, hidden]) node.ownerDocument = document;
  assert.equal(core.extractPost(article).language, 'en');
  assert.equal(core.extractPost(article).text, shown.text);
  styles.set(hidden, { display: 'block', visibility: 'hidden' });
  assert.equal(core.extractPost(article).language, 'en');
});

test('multiple displayed own body fragments retain their text without borrowing hidden nodes', () => {
  const article = e('article', {}, [header('author', '814'),
    e('div', { 'data-testid': 'tweetText', lang: 'en' }, [], 'This is the first displayed fragment.'),
    e('div', { 'data-testid': 'tweetText', lang: 'en' }, [], 'This is the second displayed fragment.'),
    e('div', { 'data-testid': 'tweetText', lang: 'ja', hidden: '' }, [], '非表示の原文です')]);
  const post = core.extractPost(article);
  assert.equal(post.text, 'This is the first displayed fragment.\n\nThis is the second displayed fragment.');
  assert.equal(post.language, 'en');
});

test('Auto uses only the displayed own body hint, normalizes Chinese scripts, and preserves forced language tags', () => {
  const post = { text: 'This is the original displayed post in English.', language: 'en',
    quotedContext: [{ text: '日本語の引用文です', language: 'ja' }] };
  assert.equal(core.resolvePostLanguage('auto', post), 'en');
  for (const [hint, expected] of [['JA-jp', 'ja'], ['pt-BR', 'pt'], ['zh-Hant', 'zh-TW'], ['zh-HK', 'zh-TW'], ['zh-MO', 'zh-TW'], ['zh-Hans', 'zh-CN'], ['uk-UA', 'uk-UA']]) {
    assert.equal(core.resolvePostLanguage('auto', { ...post, language: hint }), expected, hint);
  }
  for (const [forced, expected] of [['EN', 'en'], ['ZH-cn', 'zh-CN'], ['zh-Hant-TW', 'zh-Hant-TW'], ['en-US-u-ca-gregory', 'en-US-u-ca-gregory']]) {
    assert.equal(core.resolvePostLanguage(forced, { ...post, language: 'ja' }), expected, forced);
  }
  assert.equal(core.resolvePostLanguage('ja', post), 'ja');
  // A valid DOM hint outranks a script guess; translated technical prose can
  // legitimately contain mostly English names and abbreviations.
  assert.equal(core.resolvePostLanguage('auto', { ...post, language: 'ja' }), 'ja');
});

test('a missing or indeterminate display hint uses own prose conservatively without borrowing quote or page language', () => {
  const english = { text: 'Andrew Ng released the best course for your first agent and its full automation.',
    quotedContext: [{ text: '日本語の引用文です', language: 'ja' }], pageLanguage: 'ja' };
  for (const language of [undefined, '', 'und', 'mul', 'zxx', '<script>', 'en_US']) {
    assert.equal(core.resolvePostLanguage('auto', { ...english, language }), 'en', String(language));
  }
  for (const [text, expected] of [['日本語の投稿について説明します', 'ja'], ['한국어로 작성된 게시물입니다', 'ko'], ['这是当前显示的中文帖子', 'zh-CN']]) {
    assert.equal(core.resolvePostLanguage('auto', { text }), expected, text);
  }
  for (const text of ['', 'https://x.com/person/status/123', '🔥🚀', '@english_name', 'Andrew Ng', 'Bonjour tout le monde']) {
    assert.equal(core.resolvePostLanguage('auto', { ...english, text }), 'auto', text);
  }
});

test('shared scripts do not lock unrelated languages when the displayed DOM hint is missing', () => {
  for (const text of ['Це український допис про новий навчальний курс.', 'این یک پست فارسی است.', 'यह मराठीमध्ये लिहिलेला संदेश आहे.',
    'Это сообщение на русском языке', 'هذا منشور عربي', 'यह हिंदी में एक पोस्ट है']) {
    assert.equal(core.resolvePostLanguage('auto', { text }), 'auto', text);
  }
  for (const [language, text] of [['uk', 'Це український допис.'], ['fa', 'این یک پست فارسی است.'], ['mr', 'यह मराठीमध्ये लिहिलेला संदेश आहे.'],
    ['ru', 'Это сообщение на русском языке'], ['ar', 'هذا منشور عربي'], ['hi', 'यह हिंदी में एक पोस्ट है']]) {
    assert.equal(core.resolvePostLanguage('auto', { language, text }), language, language);
  }
});

test('language hydration changes cache fingerprint while keeping native and API task identities stable', () => {
  const parentText = tweetText('Parent content');
  const quoteText = tweetText('Quoted content');
  const quote = e('div', { role: 'link' }, [header('quoted', '807'), quoteText]);
  const article = e('article', {}, [header('parent', '806'), parentText, quote]);
  const initial = core.extractPost(article);
  parentText.attrs.lang = 'ja';
  quoteText.attrs.lang = 'en';
  const hydrated = core.extractPost(article);
  assert.equal(initial.language, '');
  assert.equal(hydrated.language, 'ja');
  assert.notEqual(core.postFingerprint(initial), core.postFingerprint(hydrated));
  assert.equal(core.nativePostIdentity(initial), core.nativePostIdentity(hydrated));
  assert.equal(core.apiPostIdentity(initial), core.apiPostIdentity(hydrated));

  const differentParentLanguage = { ...hydrated, language: 'ko' };
  const differentQuoteLanguage = { ...hydrated, quotedContext: [{ ...hydrated.quotedContext[0], language: 'fr' }] };
  for (const post of [differentParentLanguage, differentQuoteLanguage]) {
    assert.notEqual(core.postFingerprint(hydrated), core.postFingerprint(post));
    assert.equal(core.nativePostIdentity(hydrated), core.nativePostIdentity(post));
    assert.equal(core.apiPostIdentity(hydrated), core.apiPostIdentity(post));
  }
});

test('media extraction excludes profile avatars and quoted photos, and removes variable image size', () => {
  const quote = e('div', { 'data-testid': 'quoteTweet' }, [header('inside', '55'),
    e('img', { src: 'https://pbs.twimg.com/media/inside.jpg?name=small', alt: 'Inside photo' })]);
  const article = e('article', {}, [header('outside', '66'),
    e('img', { src: 'https://pbs.twimg.com/profile_images/123/avatar.jpg', alt: 'Avatar' }),
    e('img', { src: 'https://pbs.twimg.com/media/outside?format=jpg&name=large', alt: 'A chart' }),
    e('img', { src: 'https://pbs.twimg.com/media/outside?format=jpg&name=small', alt: 'A chart' }), quote]);
  const result = core.extractPost(article);
  assert.deepEqual(result.images, [{ url: 'https://pbs.twimg.com/media/outside?format=jpg', alt: 'A chart' }]);
  assert.equal(result.hasMedia, true);
  assert.equal(result.quotedContext[0].images.length, 1);
  assert.equal(result.quotedContext[0].hasMedia, true);
});

test('media-only posts can be extracted with a permalink and video component', () => {
  const article = e('article', {}, [e('a', { href: '/author/status/77' }), e('div', { 'data-testid': 'videoComponent' })]);
  assert.equal(core.extractPost(article).text, '');
  assert.equal(core.extractPost(article).hasMedia, true);
  assert.equal(core.extractPost(article).author, '@author');
  assert.equal(core.extractPost(e('article', {}, [tweetText('No identity yet')])), null);
});

test('inline links in post text are not treated as quoted containers', () => {
  const text = e('div', { 'data-testid': 'tweetText' }, [e('a', { role: 'link', href: 'https://example.com' }, [], 'source')], 'Claim with ');
  const result = core.extractPost(e('article', {}, [header('author', '10'), text]));
  assert.match(result.text, /Claim with/);
  assert.match(result.text, /source/);
  assert.deepEqual(result.quotedContext, []);
});

test('fingerprints change for edited text, media, or quoted evidence', () => {
  const post = { id: '1', text: 'Initial', images: [], quotedContext: [] };
  const initial = core.postFingerprint(post);
  assert.notEqual(initial, core.postFingerprint({ ...post, text: 'Edited' }));
  assert.notEqual(initial, core.postFingerprint({ ...post, hasMedia: true, images: [{ url: 'https://pbs.twimg.com/media/a.jpg', alt: 'A' }] }));
  assert.notEqual(initial, core.postFingerprint({ ...post, quotedContext: [{ id: '2', text: 'Evidence' }] }));
  assert.equal(core.postFingerprint({ ...post, images: [{ url: 'https://pbs.twimg.com/media/a.jpg?name=small' }] }),
    core.postFingerprint({ ...post, images: [{ url: 'https://pbs.twimg.com/media/a.jpg?name=large' }] }));
});

test('normal posts require enough viewport visibility', () => {
  assert.equal(core.visibilityEligibility({ top: 100, left: 0, width: 600, height: 300 }, { width: 1200, height: 800 }).eligible, true);
  assert.equal(core.visibilityEligibility({ top: 740, left: 0, width: 600, height: 300 }, { width: 1200, height: 800 }).eligible, false);
  assert.equal(core.visibilityEligibility({ top: -500, left: 0, width: 600, height: 300 }, { width: 1200, height: 800 }).eligible, false);
});

test('posts taller than the viewport remain eligible when occupying most of the screen', () => {
  const visible = core.visibilityEligibility({ top: -400, left: 0, width: 600, height: 2000 }, { width: 1200, height: 800 });
  assert.equal(visible.eligible, true);
  assert.equal(visible.visiblePixels, 800);
  assert.equal(visible.visibleRatio, 0.4);
  assert.equal(core.visibilityEligibility({ top: 700, left: 0, width: 600, height: 2000 }, { width: 1200, height: 800 }).eligible, false);
});

test('zero-size and malformed rectangles are never eligible', () => {
  assert.equal(core.visibilityEligibility({ top: 0, width: 10, height: 0 }, 800).eligible, false);
  assert.equal(core.visibilityEligibility({ top: NaN, width: 10, height: 10 }, 800).eligible, false);
  assert.equal(core.visibilityEligibility({ top: 0, left: 1300, width: 600, height: 300 }, { width: 1200, height: 800 }).eligible, false);
});

test('queue deduplicates IDs and prefers the most visible post, with recent observations breaking ties', () => {
  const queue = new core.BoundedPostQueue({ capacity: 3 });
  queue.enqueue({ id: 'one' }, 1);
  queue.enqueue({ id: 'two' }, 2);
  queue.enqueue({ id: 'three' }, 2);
  queue.enqueue({ id: 'two', text: 'hydrated' }, 3);
  assert.equal(queue.size, 3);
  assert.deepEqual(queue.take(), { id: 'two', text: 'hydrated' });
  assert.equal(queue.take().id, 'three');
  assert.equal(queue.take().id, 'one');
  assert.equal(queue.take(), null);
});

test('bounded queue evicts less visible work and supports removing stale posts', () => {
  const queue = new core.BoundedPostQueue({ capacity: 2 });
  queue.enqueue({ id: 'one' }, 4);
  queue.enqueue({ id: 'two' }, 3);
  assert.equal(queue.enqueue({ id: 'three' }, 1), false);
  assert.equal(queue.size, 2);
  assert.equal(queue.has('three'), false);
  assert.equal(queue.remove('two'), true);
  assert.equal(queue.has('two'), false);
  queue.clear();
  assert.equal(queue.size, 0);
  assert.equal(queue.enqueue({}), false);
});

test('normal settings preserve explicit disabled values and configured model', () => {
  const settings = core.normalizeSettings({ provider: 'api', enabled: false, webSearch: false, xSearch: false, apiModel: 'grok-4.7', apiKey: '  secret  ' });
  assert.equal(settings.provider, 'api');
  assert.equal(settings.enabled, false);
  assert.equal(settings.webSearch, false);
  assert.equal(settings.xSearch, false);
  assert.equal(settings.apiModel, 'grok-4.7');
  assert.equal('apiKey' in settings, false);
});

test('settings reject malformed values, clamp numeric limits, and use safe defaults', () => {
  assert.deepEqual(core.normalizeSettings(null), core.DEFAULT_SETTINGS);
  const settings = core.normalizeSettings({ provider: 'other', dwellMs: -1, cooldownMs: Infinity, maxPerSession: 99999, language: '<script>', apiModel: 'bad model', enabled: 'false' });
  assert.equal(settings.provider, 'api');
  assert.equal(settings.dwellMs, 1000);
  assert.equal(settings.cooldownMs, 0);
  assert.equal(settings.maxPerSession, 0);
  assert.equal(settings.language, 'auto');
  assert.equal(settings.apiModel, 'grok-4.3');
  assert.equal(settings.enabled, true);
});

test('retired pacing limits stay removed while supported visibility delay survives migration', () => {
  for (const provider of ['native', 'api']) {
    for (const oldValues of [{dwellMs:900,cooldownMs:3000,maxPerSession:40},
      {dwellMs:1200,cooldownMs:5000,maxPerSession:1},
      {dwellMs:Infinity,cooldownMs:-1,maxPerSession:99999}]) {
      const settings=core.normalizeSettings({provider,...oldValues,enabled:false,nativeVerification:true});
      assert.equal(settings.dwellMs,Number.isFinite(oldValues.dwellMs)?oldValues.dwellMs:1000);assert.equal(settings.cooldownMs,0);assert.equal(settings.maxPerSession,0);
      assert.equal(settings.provider,'api');assert.equal(settings.enabled,false);assert.equal(Object.hasOwn(settings,'nativeVerification'),false);
    }
  }
});

test('native parent identity tolerates preview hydration but distinguishes edits and different posts',()=>{
  const post={id:'123',url:'https://x.com/person/status/123',text:'Parent text',author:'Person @person',timestamp:'2026-10-05T10:00:00Z',images:[],quotedContext:[]};
  const hydrated={...post,hasMedia:true,images:[{url:'https://pbs.twimg.com/media/photo.jpg'}],quotedContext:[{id:'456',text:'Quote preview loaded'}]};
  assert.equal(core.nativePostIdentity(post),core.nativePostIdentity(hydrated));
  assert.notEqual(core.postFingerprint(post),core.postFingerprint(hydrated),'Cache identity retains the full evidence');
  assert.notEqual(core.nativePostIdentity(post),core.nativePostIdentity({...post,text:'Edited text'}));
  assert.notEqual(core.nativePostIdentity(post),core.nativePostIdentity({...post,id:'999',url:'https://x.com/person/status/999'}));
});

test('subscription defaults share bounded parallelism and Fact Check while preserving explicit API choices',()=>{
  const settings=core.normalizeSettings({});
  assert.equal(settings.provider,'oauth');assert.equal(settings.apiModel,'grok-4.3');
  assert.equal(settings.apiConcurrency,3);assert.equal(settings.apiVerification,'only');
  assert.equal(settings.dwellMs,1000);assert.equal(settings.cooldownMs,0);assert.equal(settings.maxPerSession,0);
  assert.equal(core.normalizeSettings({provider:'native'}).provider,'api');
  assert.equal(core.normalizeSettings({apiModel:'grok-4.7'}).apiModel,'grok-4.7');
  assert.equal(core.normalizeSettings({apiConcurrency:999,apiVerification:'made-up'}).apiConcurrency,8);
  assert.equal(core.normalizeSettings({apiConcurrency:0,apiVerification:'off'}).apiConcurrency,1);
  assert.equal(core.normalizeSettings({apiVerification:'off'}).apiVerification,'only');
});

test('draft prompt normalization uses an independent default and never inherits a saved post prompt',()=>{
  const legacy={explanationMode:'custom',verifyPrompt:'Custom post instructions',commentsPrompt:'Custom comment instructions'};
  const settings=core.normalizeSettings(legacy);
  assert.equal(settings.verifyPrompt,legacy.verifyPrompt);assert.equal(settings.commentsPrompt,legacy.commentsPrompt);
  assert.equal(settings.draftPrompt,core.DEFAULT_PROMPTS.draft);assert.notEqual(settings.draftPrompt,settings.verifyPrompt);
  assert.equal(Object.hasOwn(legacy,'draftPrompt'),false,'Migration must not mutate saved input');
  for(const draftPrompt of [undefined,null,'',' \n\t',false,0,{},[],['instructions'],'x'.repeat(core.MAX_PROMPT_LENGTH+1)]){
    const normalized=core.normalizeSettings({...legacy,draftPrompt});
    assert.equal(normalized.draftPrompt,core.DEFAULT_PROMPTS.draft);assert.equal(normalized.verifyPrompt,legacy.verifyPrompt);
  }
  for(const draftPrompt of ['  Check only what I am writing.\n','核查这段草稿。🙂','x'.repeat(core.MAX_PROMPT_LENGTH)]){
    const normalized=core.normalizeSettings({...legacy,draftPrompt});
    assert.equal(normalized.draftPrompt,draftPrompt);assert.equal(normalized.verifyPrompt,legacy.verifyPrompt);
    assert.deepEqual(core.normalizeSettings(normalized),normalized,'Saved custom draft instructions survive normalization');
  }
});

test('model profiles expose only supported reasoning choices and are deeply immutable',()=>{
  assert.deepEqual(core.API_MODELS,[
    {value:'grok-4.3',label:'Grok 4.3',efforts:['none','low','medium','high'],defaultEffort:'none'},
    {value:'grok-4.5',label:'Grok 4.5',efforts:['low','medium','high'],defaultEffort:'low'},
    {value:'grok-4.6',label:'Grok 4.6',efforts:['low','medium','high','xhigh'],defaultEffort:'low'},
    {value:'grok-4.7',label:'Grok 4.7',efforts:['low','medium','high','xhigh'],defaultEffort:'low'}
  ]);
  for(const profile of core.API_MODELS) {
    assert.equal(core.modelProfile(profile.value),profile);
    assert.equal(Object.isFrozen(profile),true);assert.equal(Object.isFrozen(profile.efforts),true);
    assert.throws(()=>{profile.efforts.push('unsupported');},TypeError);
    assert.throws(()=>{profile.defaultEffort='high';},TypeError);
  }
  assert.equal(Object.isFrozen(core.API_MODELS),true);
  assert.throws(()=>{core.API_MODELS.push({value:'unsupported'});},TypeError);
  assert.equal(core.modelProfile('grok-4.3-latest'),core.modelProfile('grok-4.3'));
  for(const model of ['custom-model','grok-4.5-latest','grok-4.7-fast','Grok-4.3',' grok-4.3 ',undefined,null,{}])assert.equal(core.modelProfile(model),null);
});

test('reasoning settings retain supported choices and fall back per model without changing custom IDs',()=>{
  assert.equal(core.DEFAULT_SETTINGS.apiReasoningEffort,'none');
  for(const profile of core.API_MODELS) {
    for(const effort of profile.efforts) {
      const settings=core.normalizeSettings({apiModel:profile.value,apiReasoningEffort:effort});
      assert.equal(settings.apiModel,profile.value);assert.equal(settings.apiReasoningEffort,effort);
      assert.equal(core.reasoningEffort(profile.value,effort),effort);
      assert.deepEqual(core.normalizeSettings(settings),settings);
    }
    for(const value of [undefined,null,'','auto','invalid','HIGH',' high ',false,7,{},[]]) {
      assert.equal(core.reasoningEffort(profile.value,value),profile.defaultEffort);
      assert.equal(core.normalizeSettings({apiModel:profile.value,apiReasoningEffort:value}).apiReasoningEffort,profile.defaultEffort);
    }
  }
  assert.equal(core.normalizeSettings({apiModel:'grok-4.5',apiReasoningEffort:'none'}).apiReasoningEffort,'low');
  assert.equal(core.normalizeSettings({apiModel:'grok-4.3',apiReasoningEffort:'xhigh'}).apiReasoningEffort,'none');
  assert.equal(core.normalizeSettings({apiModel:' grok-4.3-latest ',apiReasoningEffort:'high'}).apiReasoningEffort,'high');
  for(const apiModel of ['my-model','grok-4.5-latest','grok-4.7-fast','Grok-4.3'])for(const apiReasoningEffort of [undefined,'none','high','xhigh','auto']) {
    const settings=core.normalizeSettings({apiModel,apiReasoningEffort});
    assert.equal(settings.apiModel,apiModel);assert.equal(settings.apiReasoningEffort,'auto');
    assert.equal(core.reasoningEffort(apiModel,apiReasoningEffort),'auto');
  }
});

test('reasoning migration keeps previous model defaults and preserves language, prompts and credential separation',()=>{
  for(const [apiModel,expected] of [['grok-4.3','none'],['grok-4.3-latest','none'],['grok-4.5','low'],['grok-4.6','low'],['grok-4.7','low'],['saved-custom-id','auto']]) {
    const original={provider:'api',apiModel,language:'pt-BR',interfaceLanguage:'ja',explanationMode:'custom',explainPrompt:'Archived explanation.',verifyPrompt:'  Preserve my check.\n',commentsPrompt:'Preserve my comments.',apiKey:'SYNTHETIC_PRIVATE_KEY',rememberApiKey:true};
    const snapshot=structuredClone(original),settings=core.normalizeSettings(original);
    assert.equal(settings.apiModel,apiModel);assert.equal(settings.apiReasoningEffort,expected);
    for(const name of ['language','interfaceLanguage','explanationMode','explainPrompt','verifyPrompt','commentsPrompt'])assert.equal(settings[name],original[name]);
    assert.equal(Object.hasOwn(settings,'apiKey'),false);assert.equal(Object.hasOwn(settings,'rememberApiKey'),false);
    assert.deepEqual(original,snapshot,'Migration must not mutate the caller or credential storage');
  }
  assert.deepEqual(core.normalizeSettings({apiModel:'invalid model',apiReasoningEffort:'high'}),{...core.DEFAULT_SETTINGS,provider:'api',apiReasoningEffort:'high'});
});

test('default and explicit infinite queues retain every visible post beyond the old capacity', () => {
  for (const options of [undefined, Infinity, {capacity:Infinity}]) {
    const queue=new core.BoundedPostQueue(options);
    assert.equal(queue.capacity,Infinity);
    for(let index=0;index<250;index++) assert.equal(queue.enqueue({id:String(index)},index),true);
    assert.equal(queue.size,250);
    assert.equal(queue.take().id,'249');
    assert.equal(queue.size,249);
    queue.clear();assert.equal(queue.size,0);
  }
  assert.equal(new core.BoundedPostQueue({capacity:0}).capacity,1);
  assert.equal(new core.BoundedPostQueue({capacity:150}).capacity,150);
});

test('any visible edge can be considered for API analysis',()=>{
  const rect={top:795,left:300,width:600,height:300};const viewport={width:1200,height:800};
  assert.equal(core.visibilityEligibility(rect,viewport).eligible,false);
  assert.equal(core.visibilityEligibility(rect,viewport,{minRatio:0,minVisiblePx:1}).eligible,true);
  assert.equal(core.visibilityEligibility({...rect,top:800},viewport,{minRatio:0,minVisiblePx:1}).eligible,false);
});

test('language suggestions have a stable order and cannot be modified by UI consumers', () => {
  assert.deepEqual(core.LANGUAGES.map(item => item.value),
    ['auto', 'en', 'zh-CN', 'ja', 'ko', 'zh-TW', 'es', 'fr', 'de', 'pt', 'ar', 'ru', 'hi']);
  assert.ok(Object.isFrozen(core.LANGUAGES));
  for (const language of core.LANGUAGES) {
    assert.ok(Object.isFrozen(language));
    assert.equal(typeof language.label, 'string');
    assert.ok(language.label.length > 0);
    assert.equal(core.normalizeSettings({ language: language.value }).language, language.value);
  }
  assert.throws(() => core.LANGUAGES.push({ value: 'new', label: 'New' }), TypeError);
  assert.throws(() => { core.LANGUAGES[0].label = 'Changed'; }, TypeError);
});

test('auto is the new language default while old explicit locales and extended BCP47 tags are preserved', () => {
  assert.equal(core.DEFAULT_SETTINGS.language, 'auto');
  assert.equal(core.normalizeSettings({}).language, 'auto');
  assert.equal(core.normalizeSettings({ language: ' auto ' }).language, 'auto');
  for (const language of ['zh-CN', 'en', 'en-US', 'pt-BR', 'zh-Hant-TW', 'EN-us', 'en-US-u-ca-gregory']) {
    assert.equal(core.normalizeSettings({ language }).language, language);
  }
  for (const language of ['', '<script>', 'en_US', 'not a language', 'en--US']) {
    assert.equal(core.normalizeSettings({ language }).language, 'auto');
  }
});

test('UI locale follows interface language variants with safe English fallback', () => {
  for (const [input, expected] of [['zh','zh-CN'],['zh-Hans-CN','zh-CN'],['zh_Hant_TW','zh-TW'],
    ['zh-HK','zh-TW'],['zh-MO','zh-TW'],['EN-us','en'],[' ja-JP ','ja'],['ko-KR','ko'],
    ['fr-CA','fr'],['pt-BR','pt'],['ar-SA','ar'],['ru-RU','ru'],['hi-IN','hi'],
    ['bn-IN','en'],['<script>','en'],[undefined,'en']]) {
    assert.equal(ui.normalizeLanguage(input),expected,String(input));
  }
  assert.equal(ui.t('common.retry','en'),'Reanalyze');
  assert.equal(ui.t('status.analyzing','en'),'Fact-checking…');
  assert.equal(ui.t('status.thinking','zh-CN'),'正在思考你的请求');
  assert.equal(ui.t('common.generateComments','en'),'Generate one-line comments');
  assert.equal(ui.t('common.comments','zh-CN'),'评论建议');
  assert.equal(ui.t('comments.copyHint','en'),'Click a suggestion to copy');
});

test('browser UI locale precedes navigator locale before any X locale is known', () => {
  assert.equal(ui.browserLanguage({chrome:{i18n:{getUILanguage:()=> 'fr-CA'}},navigator:{language:'ja-JP'}}),'fr');
  assert.equal(ui.browserLanguage({chrome:{i18n:{getUILanguage:()=> 'zh-Hant-TW'}},navigator:{language:'en-US'}}),'zh-TW');
  assert.equal(ui.browserLanguage({chrome:{i18n:{getUILanguage:()=> 'bn-IN'}},navigator:{language:'zh-CN'}}),'en','An unsupported browser UI locale falls back to English, not navigator locale');
});

test('browser locale fallback tolerates an absent, blank or throwing extension API', () => {
  for(const environment of [
    {navigator:{language:'ja-JP'}},
    {chrome:{},navigator:{language:'ja-JP'}},
    {chrome:{i18n:{getUILanguage:()=> ''}},navigator:{language:'ja-JP'}},
    {chrome:{i18n:{getUILanguage(){throw new Error('Unavailable in preview');}}},navigator:{language:'ja-JP'}},
  ]) assert.equal(ui.browserLanguage(environment),'ja');
  assert.equal(ui.browserLanguage({}),'en');
  assert.equal(ui.browserLanguage({navigator:{language:'unsupported'}}),'en');
});

test('every supported UI language contains all labels and preserves interpolation fields', () => {
  const keys=Object.keys(ui.catalog.en).sort();
  const placeholders=value=>[...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(match=>match[1]).sort();
  assert.equal(ui.SUPPORTED_LANGUAGES.length,12);
  for(const language of ui.SUPPORTED_LANGUAGES) {
    assert.ok(Object.isFrozen(ui.catalog[language]));
    assert.deepEqual(Object.keys(ui.catalog[language]).sort(),keys,language);
    for(const key of keys) {
      assert.ok(typeof ui.catalog[language][key]==='string'&&ui.catalog[language][key].trim(),`${language}: ${key}`);
      assert.deepEqual(placeholders(ui.catalog[language][key]),placeholders(ui.catalog.en[key]),`${language}: ${key}`);
    }
  }
  assert.equal(ui.t('popup.apiLabel','ja',{count:4}),'xAI API · 4 件並列');
  assert.equal(ui.t('missing.key','ja'),'missing.key');
  assert.equal(ui.t('options.version','fr'),'Version {version}');
});

class UIElement {
  constructor(attrs={}) { this.attrs={...attrs};this.children=[];this.dataset={};this.value=attrs.value||'';this.textContent='';this.listeners={}; }
  getAttribute(name) { return this.attrs[name]??null; }
  setAttribute(name,value) { this.attrs[name]=String(value); }
  removeAttribute(name) { delete this.attrs[name]; }
  matches() { return ['data-i18n','data-i18n-aria','data-i18n-placeholder','data-i18n-title'].some(key=>key in this.attrs); }
  querySelectorAll() { return this.children.filter(child=>child.matches()); }
  replaceChildren(...children) { this.children=[...children]; }
  append(...children) { this.children.push(...children); }
  addEventListener(name,handler) { const previous=this.listeners[name];this.listeners[name]=previous?(...args)=>{previous(...args);return handler(...args);}:handler; }
  focus() { this.focused=true; }
  scrollIntoView(options) { this.scrollOptions=options; }
  reportValidity() { return true; }
}

test('applying UI translation updates only marked text and accessibility fields without model HTML', () => {
  const label=new UIElement({'data-i18n':'common.settings'});
  const input=new UIElement({'data-i18n-placeholder':'options.keyPlaceholder','data-i18n-aria':'aria.outputLanguage','data-i18n-title':'tooltip.expand'});
  const literal=new UIElement({'data-i18n':'options.version','data-i18n-vars':JSON.stringify({version:'<img src=x onerror=alert(1)>'})});
  const malformed=new UIElement({'data-i18n':'common.pause','data-i18n-vars':'{bad json'});
  const answer=new UIElement();answer.textContent='モデルの回答を変更しない';
  const nodes=[label,input,literal,malformed,answer];
  const document={documentElement:{},querySelectorAll:()=>nodes.filter(node=>node.matches())};
  ui.apply(document,'ar-SA');
  assert.equal(document.documentElement.lang,'ar');assert.equal(document.documentElement.dir,'rtl');
  assert.equal(input.getAttribute('placeholder'),ui.t('options.keyPlaceholder','ar'));
  assert.equal(input.getAttribute('aria-label'),ui.t('aria.outputLanguage','ar'));
  assert.equal(input.getAttribute('title'),ui.t('tooltip.expand','ar'));
  assert.ok(literal.textContent.includes('<img src=x onerror=alert(1)>'));
  assert.equal(literal.children.length,0);
  assert.equal(answer.textContent,'モデルの回答を変更しない');
  ui.apply(label,'ja');assert.equal(label.textContent,'設定');
  ui.apply(document,'en');assert.equal(document.documentElement.dir,'ltr');
});

test('Settings author attribution localizes its label and keeps a safe public X profile link', () => {
  const html=fs.readFileSync(path.join(__dirname,'../extension/options.html'),'utf8');
  const author=html.match(/<p class="settings-author">([\s\S]*?)<\/p>/)?.[1];
  assert.ok(author);
  assert.match(author,/<a href="https:\/\/x\.com\/coolish" target="_blank" rel="noopener noreferrer" dir="ltr">PaulWei<\/a>/);
  const label=new UIElement({'data-i18n':'options.author'});
  const profile=new UIElement({href:'https://x.com/coolish',target:'_blank',rel:'noopener noreferrer',dir:'ltr'});
  profile.textContent='PaulWei';
  const document={documentElement:{},querySelectorAll:()=>[label]};
  for(const locale of ui.SUPPORTED_LANGUAGES) {
    ui.apply(document,locale);
    assert.equal(label.textContent,ui.catalog[locale]['options.author']);
    assert.ok(label.textContent&&!label.textContent.includes('options.author'));
    assert.equal(profile.textContent,'PaulWei');
    assert.equal(profile.getAttribute('href'),'https://x.com/coolish');
  }
  assert.equal(ui.t('options.author','en'),'By');
  assert.equal(ui.t('options.author','zh-CN'),'作者');
});

// Synthetic encryption has an opaque local envelope and a separate worker-side
// lookup. Reopening shares that lookup without putting a raw Key in local data.
const uiFixtureCipherKeys=new Map();
let uiFixtureCipherSequence=0;
function uiFixtureEncryptedKey(apiKey) {
  const envelope={fixtureId:`encrypted-${++uiFixtureCipherSequence}`};
  uiFixtureCipherKeys.set(envelope.fixtureId,apiKey);return envelope;
}
function assertUIRememberedKey(fixture,apiKey) {
  assert.equal(fixture.local.apiKey,undefined,'Remembered credentials are not persisted as plaintext');
  assert.ok(fixture.local.apiKeyEncrypted,'Remembered credentials have an opaque encrypted envelope');
  assert.equal(uiFixtureCipherKeys.get(fixture.local.apiKeyEncrypted.fixtureId),apiKey);
  assert.equal(JSON.stringify(fixture.local).includes(apiKey),false,'Local data contains no raw API Key');
}

// These legacy credential/setup cases explicitly exercise API mode.
const API_UI_SETTINGS=Object.freeze({...core.DEFAULT_SETTINGS,provider:'api'});

function uiPageFixture(file, settings=API_UI_SETTINGS, storage={}, environment={}) {
  const html=fs.readFileSync(path.join(__dirname,'../extension',`${file}.html`),'utf8');
  const nodes=[];const ids=new Map();
  for(const tag of html.matchAll(/<[A-Za-z][\w-]*\b([^>]*)>/g)) {
    const attrs={};
    for(const attr of tag[1].matchAll(/([A-Za-z][\w-]*)=(["'])(.*?)\2/g)) attrs[attr[1]]=attr[3];
    const node=new UIElement(attrs);nodes.push(node);if(attrs.id) ids.set(attrs.id,node);
  }
  const document={documentElement:{},title:'GrokFirst',getElementById:id=>ids.get(id),createElement:()=>new UIElement(),querySelectorAll:()=>nodes.filter(node=>node.matches())};
  if(ids.has('settings-form')) ids.get('settings-form').elements=nodes;
  const messages=[],runtimeListeners=[],storageListeners=[],reads=[],openedOptions=[],openedHistory=[],permissionRequests=[];
  const local={settings,uiLanguage:'en',...storage.local};
  const session={apiKey:'session-secret',...storage.session};
  let buildConfigured=environment.buildConfigured!==false;
  const security=()=>{
    // The worker exposes remembered Keys through its session mirror before
    // replying; Settings never needs to read credentials from local storage.
    const remember=typeof local.rememberApiKey==='boolean'?local.rememberApiKey:Boolean(local.apiKeyEncrypted||local.apiKey||local.apiKeyVault)||!session.apiKey;
    if(local.apiKeyEncrypted) {
      const restored=uiFixtureCipherKeys.get(local.apiKeyEncrypted.fixtureId);
      if(restored) {
        session.apiKey=restored;delete local.apiKey;delete local.apiKeyVault;
        if(!remember)delete local.apiKeyEncrypted;
      } else delete session.apiKey;
    } else {
      if(local.apiKey&&!session.apiKey)session.apiKey=local.apiKey;
      if(session.apiKey&&(local.apiKey||local.apiKeyVault)) {
        if(remember)local.apiKeyEncrypted=uiFixtureEncryptedKey(session.apiKey);
        delete local.apiKey;delete local.apiKeyVault;
      }
    }
    return {ok:true,
    keyState:session.apiKey?'ready':local.apiKeyEncrypted||local.apiKeyVault?'migration':'missing',
    remember,
    hasSavedKey:Boolean(local.apiKeyEncrypted||local.apiKey||local.apiKeyVault)};
  };
  const pick=(area,keys)=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,area[key]]));
  const chrome={
    permissions:{request(request){permissionRequests.push(request);return environment.onPermissionRequest?.(request) ?? Promise.resolve(environment.permissionGranted!==false);}},
    runtime:{getManifest:()=>({version:'fixture'}),reload(){},openOptionsPage:async()=>{openedOptions.push(true);},
      sendMessage:async message=>{
        messages.push(message);
        const intercepted=environment.onMessage?.(message,{local,session});
        if(intercepted)return intercepted;
        if(message.type==='GET_UI_LANGUAGE') {
          if(environment.localeFailure)throw new Error('Locale worker unavailable');
          return {ok:true,language:environment.reportedLanguage || local.uiLanguage || ui.browserLanguage({chrome,navigator:{language:environment.navigatorLanguage || 'en-US'}})};
        }
        if(message.type==='GET_SECURITY_STATUS')return environment.securityFailure?{ok:false,errorKey:'errors.noResponse'}:security();
        if(message.type==='GET_OAUTH_STATUS')return {ok:true,oauthStatus:environment.oauthStatus||{state:'disconnected',connected:false,remember:local.settings.oauthRemember!==false,catalogModels:[]}};
        if(message.type==='GET_HISTORY_STATUS')return {ok:true,enabled:local.superxHistoryEnabled!==false,count:0,epoch:0};
        if(message.type==='GET_API_DIAGNOSTICS')return {ok:true,entries:[],retentionHours:24,maxEntries:30};
        if(message.type==='CLEAR_API_DIAGNOSTICS')return {ok:true};
        if(message.type==='SET_HISTORY_ENABLED') {local.superxHistoryEnabled=message.enabled;return {ok:true,enabled:message.enabled};}
        if(message.type==='OPEN_HISTORY') {openedHistory.push(true);return {ok:true};}
        if(message.type==='GET_BUILD_STATUS')return {ok:true,modelCatalog:[{id:'grok-4.3',efforts:['none','minimal','low','medium','high','xhigh']},{id:'grok-4.7',efforts:['minimal','low','medium','high','xhigh']}],...environment.buildStatus || {installed:false,available:false,ready:false}};
        if(message.type==='GET_BUILD_CONNECTION')return {ok:true,configured:buildConfigured,port:local.settings.buildPort};
        if(message.type==='GET_BUILD_LAUNCH')return {ok:true,command:`grok local fixture ${message.platform} ${message.port}`,secret:'local-connection-fixture-code',port:message.port};
        if(message.type==='SAVE_BUILD_CONNECTION'){buildConfigured=true;if(message.settings)local.settings=core.normalizeSettings(message.settings);return {ok:true};}
        if(message.type==='CLEAR_BUILD_CONNECTION'){buildConfigured=false;return {ok:true};}
        if(message.type==='OPEN_CONNECTOR_GUIDE')return {ok:true};
        if(message.type==='GET_CONFIG') {
          const state=security();return {ok:true,settings:local.settings,ready:local.settings.provider==='build'?environment.buildStatus?.ready===true:state.keyState==='ready',buildStatus:environment.buildStatus,
            keyMigration:state.keyState==='migration',keyState:state.keyState};
        }
        if(message.type==='OPEN_SETTINGS') {openedOptions.push({focus:message.focus});return {ok:true};}
        if(message.type==='SAVE_KEY') {
          if(typeof message.remember==='boolean')local.rememberApiKey=message.remember;
          if(message.apiKey)session.apiKey=message.apiKey;else delete session.apiKey;
          if(message.remember===true&&message.apiKey) {
            local.apiKeyEncrypted=uiFixtureEncryptedKey(message.apiKey);
          } else delete local.apiKeyEncrypted;
          delete local.apiKey;delete local.apiKeyVault;
          if(message.settings)local.settings=core.normalizeSettings(message.settings);
        }
        if(message.type==='SAVE_SETTINGS')local.settings=core.normalizeSettings(message.settings);
        return {ok:true};
      },
      onMessage:{addListener:listener=>runtimeListeners.push(listener)}},
    storage:{local:{get:async keys=>{reads.push(keys);return pick(local,keys);}},
      session:{get:async keys=>pick(session,keys),remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete session[key];}},onChanged:{addListener:listener=>storageListeners.push(listener)}}
  };
  if(Object.hasOwn(environment,'browserLanguage'))chrome.i18n={getUILanguage:()=>environment.browserLanguage};
  const location={hash:environment.hash||''},pageListeners={};
  const context=vm.createContext({document,chrome,URL,location,addEventListener(type,listener){pageListeners[type]=listener;},XGrokCore:core,GrokFirstUI:ui,navigator:{language:environment.navigatorLanguage || 'en-US',clipboard:{async writeText(value){if(environment.copyFailure)throw new Error('Clipboard unavailable');environment.onCopy?.(value);}}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension',`${file}.js`),'utf8'),context);
  return {document,ids,messages,reads,runtimeListeners,storageListeners,local,session,openedOptions,openedHistory,permissionRequests,location,pageListeners};
}
const settleUI=()=>new Promise(resolve=>setImmediate(resolve));
const uiMessageTypes=fixture=>fixture.messages.map(message=>message.type).filter(type=>!['GET_SECURITY_STATUS','GET_CONFIG','GET_HISTORY_STATUS','GET_BUILD_CONNECTION','GET_OAUTH_STATUS'].includes(type));
const promptEditorId=name=>({postDraft:'post-draft-prompt',replyDraft:'reply-draft-prompt'}[name]||`${name}-prompt`);

test('Settings model and reasoning controls are required dropdowns with model-specific choices',async()=>{
  const html=fs.readFileSync(path.join(__dirname,'../extension/options.html'),'utf8');
  for(const id of ['api-model','api-reasoning-effort']) {
    assert.match(html,new RegExp('<select\\b[^>]*id="'+id+'"[^>]*\\brequired\\b'));
    assert.doesNotMatch(html,new RegExp('<input\\b[^>]*id="'+id+'"'));
    assert.match(html,new RegExp('<label\\b[^>]*for="'+id+'"'));
  }
  const fixture=uiPageFixture('options');await settleUI();await settleUI();
  const model=fixture.ids.get('api-model'),effort=fixture.ids.get('api-reasoning-effort');
  assert.deepEqual(model.children.map(option=>option.value),['grok-4.3','grok-4.5','grok-4.6','grok-4.7']);
  assert.equal(model.value,'grok-4.3');assert.equal(effort.value,'none');
  for(const [value,expected] of [
    ['grok-4.3',['none','low','medium','high']],['grok-4.5',['low','medium','high']],
    ['grok-4.6',['low','medium','high','xhigh']],['grok-4.7',['low','medium','high','xhigh']]
  ]) {
    model.value=value;model.listeners.change();
    assert.deepEqual(effort.children.map(option=>option.value),expected);
    assert.ok(expected.includes(effort.value));
  }
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE'],'Choosing a model must not save or start a paid request');
});

test('changing the Settings model keeps a supported effort and falls back only when the level is unsupported',async()=>{
  const fixture=uiPageFixture('options');await settleUI();await settleUI();
  const model=fixture.ids.get('api-model'),effort=fixture.ids.get('api-reasoning-effort');
  effort.value='high';effort.listeners.change();
  for(const value of ['grok-4.5','grok-4.6','grok-4.7']) {
    model.value=value;model.listeners.change();assert.equal(effort.value,'high');
  }
  effort.value='xhigh';effort.listeners.change();model.value='grok-4.5';model.listeners.change();
  assert.equal(effort.value,'low');
  model.value='grok-4.7';model.listeners.change();effort.value='xhigh';effort.listeners.change();
  model.value='grok-4.3';model.listeners.change();assert.equal(effort.value,'none');
  model.value='grok-4.5';model.listeners.change();assert.equal(effort.value,'low');
  model.value='grok-4.3';model.listeners.change();assert.equal(effort.value,'low','A supported explicit choice survives a model switch');
  assert.equal(fixture.local.settings,API_UI_SETTINGS);
});

test('every model and effort choice persists through Save and reopening without resending an untouched Key',async()=>{
  for(const [apiModel,efforts] of [
    ['grok-4.3',['none','low','medium','high']],['grok-4.5',['low','medium','high']],
    ['grok-4.6',['low','medium','high','xhigh']],['grok-4.7',['low','medium','high','xhigh']]
  ])for(const apiReasoningEffort of efforts) {
    const fixture=uiPageFixture('options');await settleUI();await settleUI();
    fixture.ids.get('api-model').value=apiModel;fixture.ids.get('api-model').listeners.change();
    fixture.ids.get('api-reasoning-effort').value=apiReasoningEffort;fixture.ids.get('api-reasoning-effort').listeners.change();
    const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    const saved=fixture.messages.filter(message=>message.type==='SAVE_SETTINGS');
    assert.equal(saved.length,1);assert.equal(saved[0].settings.apiModel,apiModel);assert.equal(saved[0].settings.apiReasoningEffort,apiReasoningEffort);
    assert.equal(fixture.local.settings.apiModel,apiModel);assert.equal(fixture.local.settings.apiReasoningEffort,apiReasoningEffort);
    assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_SETTINGS']);
    assert.equal(fixture.session.apiKey,'session-secret');assert.ok(fixture.messages.every(message=>!Object.hasOwn(message,'apiKey')));
    const reopened=uiPageFixture('options',fixture.local.settings,{local:fixture.local,session:fixture.session});await settleUI();await settleUI();
    assert.equal(reopened.ids.get('api-model').value,apiModel);assert.equal(reopened.ids.get('api-reasoning-effort').value,apiReasoningEffort);
    assert.equal(reopened.session.apiKey,'session-secret');assert.deepEqual(uiMessageTypes(reopened),['GET_UI_LANGUAGE']);
  }
});

test('saved legacy model IDs stay selectable without a free-form field or silent model migration',async()=>{
  for(const [apiModel,expectedEfforts,expectedEffort] of [
    ['saved-custom-id',['auto'],'auto'],['grok-4.3-latest',['none','low','medium','high'],'none']
  ]) {
    const fixture=uiPageFixture('options',{...API_UI_SETTINGS,apiModel});await settleUI();await settleUI();
    const model=fixture.ids.get('api-model'),effort=fixture.ids.get('api-reasoning-effort');
    assert.equal(model.value,apiModel);assert.equal(model.children.length,5);
    assert.equal(model.children.at(-1).value,apiModel);
    assert.equal(model.children.at(-1).textContent,ui.t('options.savedModel','en',{model:apiModel}));
    assert.deepEqual(effort.children.map(option=>option.value),expectedEfforts);assert.equal(effort.value,expectedEffort);
    model.value='grok-4.7';model.listeners.change();model.value=apiModel;model.listeners.change();
    assert.equal(effort.value,apiModel==='grok-4.3-latest'?'low':'auto');
    effort.value=expectedEffort;effort.listeners.change();
    assert.equal(effort.value,expectedEffort);
    const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    assert.equal(fixture.local.settings.apiModel,apiModel);assert.equal(fixture.local.settings.apiReasoningEffort,expectedEffort);
    const reopened=uiPageFixture('options',fixture.local.settings);await settleUI();await settleUI();
    assert.equal(reopened.ids.get('api-model').value,apiModel);assert.equal(reopened.ids.get('api-reasoning-effort').value,expectedEffort);
  }
});

test('injected unknown models and unsupported reasoning values are rejected before saving settings or credentials',async()=>{
  for(const invalid of [
    {model:'new-custom-id',effort:'auto',focus:'api-model',error:'options.modelInvalid'},
    {model:'',effort:'none',focus:'api-model',error:'options.modelInvalid'},
    {model:'grok-4.5',effort:'none',focus:'api-reasoning-effort',error:'options.reasoningInvalid'},
    {model:'grok-4.5',effort:'xhigh',focus:'api-reasoning-effort',error:'options.reasoningInvalid'},
    {model:'grok-4.7',effort:'',focus:'api-reasoning-effort',error:'options.reasoningInvalid'}
  ]) {
    const fixture=uiPageFixture('options');await settleUI();await settleUI();
    fixture.ids.get('api-model').value=invalid.model;fixture.ids.get('api-model').listeners.change();
    fixture.ids.get('api-reasoning-effort').value=invalid.effort;
    fixture.ids.get('api-key').value='replacement-fixture';fixture.ids.get('api-key').listeners.input();
    const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    assert.equal(fixture.ids.get('status').textContent,ui.t('options.checkFields','en'));
    assert.equal(fixture.ids.get('api-model-status').textContent,ui.t(invalid.error,'en'));
    assert.equal(fixture.ids.get(invalid.focus).focused,true);assert.equal(fixture.session.apiKey,'session-secret');
    assert.equal(fixture.local.settings,API_UI_SETTINGS);assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
  }
});

test('recommended defaults select Grok 4.3, three requests and one second while preserving other drafts until Save',async()=>{
  const original=core.normalizeSettings({apiModel:'grok-4.7',apiReasoningEffort:'xhigh',apiConcurrency:8,dwellMs:7000,language:'ja',explanationMode:'custom',verifyPrompt:'My check draft.',commentsPrompt:'My comment draft.'});
  const fixture=uiPageFixture('options',original);await settleUI();await settleUI();
  fixture.ids.get('fast-preset').listeners.click();
  assert.equal(fixture.ids.get('api-model').value,'grok-4.3');assert.equal(fixture.ids.get('api-reasoning-effort').value,'none');
  assert.equal(fixture.ids.get('api-concurrency').value,3);assert.equal(fixture.ids.get('analysis-dwell').value,1);assert.equal(fixture.ids.get('language').value,'ja');
  assert.equal(fixture.ids.get('verify-prompt').value,original.verifyPrompt);assert.equal(fixture.ids.get('comments-prompt').value,original.commentsPrompt);
  assert.equal(fixture.ids.get('api-key').value,'session-secret');assert.equal(fixture.local.settings,original);
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(fixture.local.settings.apiModel,'grok-4.3');assert.equal(fixture.local.settings.apiReasoningEffort,'none');assert.equal(fixture.local.settings.apiConcurrency,3);assert.equal(fixture.local.settings.dwellMs,1000);
  assert.equal(fixture.local.settings.language,'ja');assert.equal(fixture.local.settings.verifyPrompt,original.verifyPrompt);
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_SETTINGS']);
});

test('locale changes relabel reasoning options while preserving model, reasoning, Key and prompt drafts',async()=>{
  const fixture=uiPageFixture('options');await settleUI();await settleUI();
  fixture.ids.get('api-model').value='grok-4.7';fixture.ids.get('api-model').listeners.change();
  fixture.ids.get('api-reasoning-effort').value='xhigh';fixture.ids.get('api-reasoning-effort').listeners.change();
  fixture.ids.get('api-key').value='unsaved-key-fixture';fixture.ids.get('api-key').listeners.input();
  fixture.ids.get('verify-prompt').value='Unsaved verification draft.';
  for(const locale of ui.SUPPORTED_LANGUAGES) {
    fixture.runtimeListeners.forEach(listener=>listener({type:'UI_LANGUAGE_CHANGED',language:locale}));
    assert.equal(fixture.ids.get('api-model').value,'grok-4.7');assert.equal(fixture.ids.get('api-reasoning-effort').value,'xhigh');
    assert.equal(fixture.ids.get('api-reasoning-effort').children.at(-1).textContent,ui.t('options.reasoning.xhigh',locale));
    assert.equal(fixture.ids.get('api-key').value,'unsaved-key-fixture');assert.equal(fixture.ids.get('verify-prompt').value,'Unsaved verification draft.');
    assert.equal(fixture.ids.get('status').textContent,ui.t('options.unsavedChanges',locale));
  }
  assert.equal(fixture.session.apiKey,'session-secret');assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
});

test('reasoning-only edits participate in unsaved status and reverting the selection clears the hint',async()=>{
  const fixture=uiPageFixture('options');await settleUI();await settleUI();
  const effort=fixture.ids.get('api-reasoning-effort');
  effort.value='high';effort.listeners.change();assert.equal(fixture.ids.get('status').textContent,ui.t('options.unsavedChanges','en'));
  effort.value='none';effort.listeners.change();assert.equal(fixture.ids.get('status').textContent,'');
  assert.equal(fixture.local.settings.apiReasoningEffort,'none');assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
});

test('Settings history is a direct page link and popup still opens history without a Key',async()=>{
  const settings=uiPageFixture('options',API_UI_SETTINGS,{session:{apiKey:undefined}});
  await settleUI();await settleUI();
  assert.equal(settings.ids.has('history-enabled'),false);assert.equal(settings.ids.has('open-history'),false);
  assert.match(fs.readFileSync(path.join(__dirname,'../extension/options.html'),'utf8'),/<a href="history.html"[^>]*data-i18n="common.history"/);
  assert.equal(settings.messages.some(message=>['GET_HISTORY_STATUS','SET_HISTORY_ENABLED'].includes(message.type)),false);
  const fixture=uiPageFixture('popup',API_UI_SETTINGS,{session:{apiKey:undefined}});
  await settleUI();await settleUI();
  assert.equal(Boolean(fixture.ids.get('history').disabled),false);
  await fixture.ids.get('history').listeners.click();assert.deepEqual(fixture.openedHistory,[true]);
  assert.equal(fixture.messages.some(message=>['SAVE_KEY','SAVE_SETTINGS','ANALYZE','GENERATE_COMMENTS'].includes(message.type)),false);
});

test('fresh options and popup use browser UI locale without writing credentials or analysis settings', async () => {
  for(const file of ['options','popup']) {
    for(const [browserLanguage,expected] of [['fr-CA','fr'],['zh-Hant-TW','zh-TW'],['bn-IN','en']]) {
      const fixture=uiPageFixture(file,core.normalizeSettings({language:'ja'}),
        {local:{uiLanguage:undefined,apiKey:undefined},session:{apiKey:undefined}},
        {browserLanguage,navigatorLanguage:'ko-KR'});
      assert.equal(fixture.document.documentElement.lang,expected,`${file}: initial browser locale before the worker reply`);
      await settleUI();await settleUI();
      assert.equal(fixture.document.documentElement.lang,expected,`${file}: ${browserLanguage}`);
      const button=fixture.ids.get(file==='options'?'save':'options');
      assert.equal(button.textContent,ui.t(file==='options'?'common.save':'common.openSettings',expected));
      assert.equal(fixture.local.uiLanguage,undefined,'The browser fallback must not be remembered as an X locale');
      assert.equal(fixture.local.settings.language,'ja','Output language is independent of UI language');
      assert.equal(fixture.local.apiKey,undefined);assert.equal(fixture.session.apiKey,undefined);
      assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
      if(file==='options')assert.equal(fixture.ids.get('remember-key').checked,true,'The first-Key default must remain intact');
      else assert.ok(fixture.reads.flat().every(key=>key!=='apiKey'));
    }
  }
});

test('options and popup retain browser fallback when the language worker is temporarily unavailable', async () => {
  for(const file of ['options','popup']) {
    const fixture=uiPageFixture(file,API_UI_SETTINGS,{local:{uiLanguage:undefined}},
      {browserLanguage:'de-DE',navigatorLanguage:'ja-JP',localeFailure:true});
    await settleUI();await settleUI();
    assert.equal(fixture.document.documentElement.lang,'de',file);
    assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
    assert.equal(fixture.ids.get('status').textContent,'');
  }
});

test('current and remembered X locales override browser defaults without changing model language', async () => {
  for(const file of ['options','popup']) {
    for(const [stored,reported,expected,localeFailure] of [['zh-CN',undefined,'zh-CN'],['zh-CN','ar-SA','ar'],['zh-CN',undefined,'zh-CN',true]]) {
      const settings=core.normalizeSettings({language:'pt-BR'});
      const fixture=uiPageFixture(file,settings,{local:{uiLanguage:stored}},
        {browserLanguage:'fr-CA',navigatorLanguage:'ja-JP',reportedLanguage:reported,localeFailure});
      await settleUI();await settleUI();
      assert.equal(fixture.document.documentElement.lang,expected,file);
      assert.equal(fixture.document.documentElement.dir,expected==='ar'?'rtl':'ltr');
      assert.equal(fixture.local.settings,settings);
      assert.equal(fixture.local.settings.language,'pt-BR');
      fixture.runtimeListeners.forEach(listener=>listener({type:'UI_LANGUAGE_CHANGED',language:'ja-JP'}));
      assert.equal(fixture.document.documentElement.lang,'ja');
      assert.equal(fixture.document.documentElement.dir,'ltr');
      assert.equal(fixture.local.settings,settings);
      assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
      assert.ok(fixture.messages.every(message=>!('apiKey' in message)));
    }
  }
});

test('all options, popup and setup translation markers are supplied for every UI locale', () => {
  for(const file of ['options','popup','setup']) {
    const html=fs.readFileSync(path.join(__dirname,'../extension',`${file}.html`),'utf8');
    for(const marker of html.matchAll(/data-i18n(?:-aria|-placeholder|-title)?="([^"]+)"/g)) {
      for(const locale of ui.SUPPORTED_LANGUAGES) assert.ok(ui.catalog[locale][marker[1]],`${file}: ${locale}: ${marker[1]}`);
    }
    assert.doesNotMatch(html,/id="(?:dwell-ms|cooldown-ms|max-per-session|limit-label)"/);
  }
});

test('fresh language controls both default to Auto and keep answer and interface settings separate', async () => {
  const fixture=uiPageFixture('options',API_UI_SETTINGS);
  await settleUI();await settleUI();
  assert.equal(fixture.ids.get('language').value,'auto');
  assert.equal(fixture.ids.get('interface-language').value,'auto');
  assert.equal(fixture.ids.get('language-heading').textContent,ui.t('options.languageTitle','en'));
  assert.equal(fixture.ids.get('interface-language').children[0].textContent,ui.t('lang.interfaceAuto','en'));
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
});

test('saved manual interface language controls Settings and popup independently of X and answers', async () => {
  for(const file of ['options','popup']) {
    const fixture=uiPageFixture(file,core.normalizeSettings({language:'ja',interfaceLanguage:'zh-CN'}),
      {local:{uiLanguage:'en'}},{reportedLanguage:'en'});
    await settleUI();await settleUI();
    assert.equal(fixture.document.documentElement.lang,'zh-CN',file);
    assert.equal(fixture.local.settings.language,'ja');
    fixture.runtimeListeners.forEach(listener=>listener({type:'UI_LANGUAGE_CHANGED',language:'ar'}));
    assert.equal(fixture.document.documentElement.lang,'zh-CN',file);
    assert.equal(fixture.document.documentElement.dir,'ltr');
    assert.equal(fixture.local.settings.interfaceLanguage,'zh-CN');
    if(file==='options')assert.equal(fixture.ids.get('language').value,'ja');
    else assert.equal(fixture.ids.get('options').textContent,ui.t('common.openSettings','zh-CN'));
    assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
  }
});

test('interface language preview retains all drafts and Auto uses the latest observed X locale', async () => {
  const fixture=uiPageFixture('options',core.normalizeSettings({language:'ja',explanationMode:'custom'}));
  await settleUI();await settleUI();
  fixture.ids.get('api-key').value='unsaved-fixture-key';fixture.ids.get('api-key').listeners.input();
  fixture.ids.get('verify-prompt').value='Keep this explanation draft.';
  const choice=fixture.ids.get('interface-language');choice.value='zh-CN';choice.listeners.change();
  assert.equal(fixture.document.documentElement.lang,'zh-CN');
  assert.equal(fixture.ids.get('status').textContent,ui.t('options.unsavedChanges','zh-CN'));
  fixture.runtimeListeners.forEach(listener=>listener({type:'UI_LANGUAGE_CHANGED',language:'ar'}));
  assert.equal(fixture.document.documentElement.lang,'zh-CN');
  choice.value='auto';choice.listeners.change();
  assert.equal(fixture.document.documentElement.lang,'ar');
  assert.equal(fixture.document.documentElement.dir,'rtl');
  assert.equal(fixture.ids.get('api-key').value,'unsaved-fixture-key');
  assert.equal(fixture.ids.get('language').value,'ja');
  assert.equal(fixture.ids.get('verify-prompt').value,'Keep this explanation draft.');
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
});

test('saving only interface language preserves the existing Key and answer language', async () => {
  const fixture=uiPageFixture('options',core.normalizeSettings({language:'ja'}),
    {local:{apiKey:'fixture-existing-key',rememberApiKey:true},session:{apiKey:'fixture-existing-key'}});
  await settleUI();await settleUI();
  fixture.ids.get('interface-language').value='zh-CN';fixture.ids.get('interface-language').listeners.change();
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_SETTINGS']);
  assert.equal(fixture.local.settings.language,'ja');
  assert.equal(fixture.local.settings.interfaceLanguage,'zh-CN');
  assert.equal(fixture.session.apiKey,'fixture-existing-key');
  assert.equal(fixture.document.documentElement.lang,'zh-CN');
  assert.equal(fixture.ids.get('key-security-state').textContent,ui.t('options.keyReadySaved','zh-CN'));
});

test('open Settings and popup apply saved interface choices without replacing Settings drafts', async () => {
  for(const file of ['options','popup']) {
    const fixture=uiPageFixture(file,core.normalizeSettings({language:'ja'}));
    await settleUI();await settleUI();
    if(file==='options')fixture.ids.get('verify-prompt').value='Keep my unsaved draft';
    const next=core.normalizeSettings({language:'ja',interfaceLanguage:'zh-CN'});
    fixture.storageListeners.forEach(listener=>listener({settings:{newValue:next}},'local'));
    assert.equal(fixture.document.documentElement.lang,'zh-CN',file);
    if(file==='options') {
      assert.equal(fixture.ids.get('interface-language').value,'zh-CN');
      assert.equal(fixture.ids.get('language').value,'ja');
      assert.equal(fixture.ids.get('verify-prompt').value,'Keep my unsaved draft');
    }
  }
});

test('ready Key text distinguishes remembered device storage from session-only storage', async () => {
  for(const saved of [false,true]) {
    const fixture=uiPageFixture('options',API_UI_SETTINGS,
      {local:{apiKey:saved?'fixture-key':undefined,rememberApiKey:saved},session:{apiKey:'fixture-key'}});
    await settleUI();await settleUI();
    assert.equal(fixture.ids.get('key-security-state').textContent,ui.t(saved?'options.keyReadySaved':'options.keyReady','en'));
    assert.equal(fixture.ids.has('lock-key'),false,'Ready credentials do not expose a manual lock action');
  }
});

test('live options locale changes preserve drafts and never save settings or send credentials', async () => {
  const fixture=uiPageFixture('options',core.normalizeSettings({language:'pt-BR'}));
  await settleUI();await settleUI();
  assert.equal(fixture.ids.get('language').value,'pt-BR');
  assert.ok(fixture.ids.get('language').children.some(option=>option.value==='pt-BR'));
  fixture.ids.get('api-key').value='draft-secret';
  fixture.ids.get('api-model').value='grok-4.7';fixture.ids.get('api-model').listeners.change();
  fixture.ids.get('api-concurrency').value=7;
  fixture.ids.get('explanation-mode').value='custom';fixture.ids.get('explanation-mode').listeners.change();
  fixture.ids.get('language').value='ko';
  fixture.ids.get('verify-prompt').value='核实最重要的一条事实。';
  fixture.ids.get('post-draft-prompt').value='核查我的新帖。';
  fixture.ids.get('reply-draft-prompt').value='只核查我写的回复。';
  fixture.ids.get('comments-prompt').value='Give three friendly replies.';
  fixture.runtimeListeners.forEach(listener=>listener({type:'UI_LANGUAGE_CHANGED',language:'ja-JP'}));
  assert.equal(fixture.ids.get('save').textContent,'設定を保存');
  assert.equal(fixture.ids.get('language').children[0].textContent,ui.t('lang.auto','ja'));
  fixture.storageListeners.forEach(listener=>listener({uiLanguage:{newValue:'ar'}},'local'));
  assert.equal(fixture.document.documentElement.dir,'rtl');
  assert.equal(fixture.ids.get('api-key').value,'draft-secret');
  assert.equal(fixture.ids.get('api-model').value,'grok-4.7');
  assert.equal(fixture.ids.get('api-concurrency').value,7);
  assert.equal(fixture.ids.get('explanation-mode').value,'custom');
  assert.equal(fixture.ids.get('analysis-prompts').hidden,false);
  assert.equal(fixture.ids.get('explanation-mode-help').textContent,ui.t('options.customModeHelp','ar'));
  assert.equal(fixture.ids.get('language').value,'ko');
  assert.equal(fixture.ids.get('verify-prompt').value,'核实最重要的一条事实。');
  assert.equal(fixture.ids.get('post-draft-prompt').value,'核查我的新帖。');
  assert.equal(fixture.ids.get('reply-draft-prompt').value,'只核查我写的回复。');
  assert.equal(fixture.ids.get('comments-prompt').value,'Give three friendly replies.');
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
  assert.ok(fixture.messages.every(message=>!('apiKey' in message)));
});

test('a first remembered Key saves without password setup and is ready again after browser restart', async () => {
  const fixture=uiPageFixture('options',API_UI_SETTINGS,{local:{apiKey:undefined},session:{apiKey:undefined}});
  await settleUI();await settleUI();
  assert.equal(fixture.ids.get('api-key').value,'');
  assert.equal(fixture.ids.get('remember-key').checked,true);
  for(const id of ['save-password-fields','save-passphrase','confirm-passphrase','unlock-fields','unlock-passphrase','unlock-key','lock-key'])assert.equal(fixture.ids.has(id),false,id);
  const input=fixture.ids.get('api-key');input.value='first-fixture-key';input.listeners.input();
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  const savedKey=fixture.messages.find(message=>message.type==='SAVE_KEY');
  assert.equal(savedKey.apiKey,'first-fixture-key');assert.equal(savedKey.remember,true);
  assert.equal(Object.hasOwn(savedKey,'passphrase'),false);
  assert.equal(fixture.local.rememberApiKey,true);assertUIRememberedKey(fixture,'first-fixture-key');
  assert.equal(fixture.local.apiKeyVault,undefined);assert.equal(fixture.session.apiKey,'first-fixture-key');
  assert.equal(Object.hasOwn(savedKey.settings,'rememberApiKey'),false);assert.equal(Object.hasOwn(savedKey.settings,'apiKey'),false);
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_KEY']);
  const reopened=uiPageFixture('options',fixture.local.settings,{local:fixture.local,session:{apiKey:undefined}});
  await settleUI();await settleUI();
  assert.equal(reopened.ids.get('remember-key').checked,true);
  assert.equal(reopened.ids.get('api-key').value,'first-fixture-key');
  assert.equal(reopened.session.apiKey,'first-fixture-key');
  assert.equal(reopened.ids.get('key-security-state').dataset.state,'ready');
  assert.equal(reopened.ids.get('key-security-state').textContent,ui.t('options.keyReadySaved','en'));
  assert.deepEqual(uiMessageTypes(reopened),['GET_UI_LANGUAGE']);
  assert.ok(reopened.reads.flat().every(key=>key!=='apiKey'),'Settings reads the ready session mirror, never local credentials');
});

test('remember-Key loading honors explicit booleans without promoting a session-only credential', async () => {
  const cases=[
    {name:'remembered encrypted',local:{apiKeyEncrypted:uiFixtureEncryptedKey('remembered-local')},session:{apiKey:undefined},expected:true,key:'remembered-local'},
    {name:'legacy plaintext migrates automatically',local:{apiKey:'legacy-plaintext'},session:{apiKey:undefined},expected:true,key:'legacy-plaintext'},
    {name:'session-only',local:{apiKey:undefined},session:{apiKey:'session-only'},expected:false,key:'session-only'},
    {name:'explicit false without Key',local:{apiKey:undefined,rememberApiKey:false},session:{apiKey:undefined},expected:false,key:''},
    {name:'explicit true does not promote a session Key on load',local:{apiKey:undefined,rememberApiKey:true},session:{apiKey:'session-only'},expected:true,key:'session-only'},
    {name:'nonboolean preference cannot persist a session Key',local:{apiKey:undefined,rememberApiKey:'true'},session:{apiKey:'session-only'},expected:false,key:'session-only'},
  ];
  for(const item of cases) {
    const fixture=uiPageFixture('options',API_UI_SETTINGS,{local:item.local,session:item.session});
    await settleUI();await settleUI();
    assert.equal(fixture.ids.get('remember-key').checked,item.expected,item.name);
    assert.equal(fixture.ids.get('api-key').value,item.key,item.name);
    assert.equal(fixture.local.apiKey,undefined,item.name);
    if(item.local.apiKey||item.local.apiKeyEncrypted)assertUIRememberedKey(fixture,item.key);
    else assert.equal(fixture.local.apiKeyEncrypted,undefined,item.name);
    assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE'],item.name);
  }
});

test('demoting a remembered Key to session-only is explicit and saves credentials and settings together once', async () => {
  const fixture=uiPageFixture('options',API_UI_SETTINGS,{local:{apiKey:'remembered-to-demote',rememberApiKey:true},session:{apiKey:undefined}});
  await settleUI();await settleUI();
  assert.equal(fixture.ids.get('api-key').value,'remembered-to-demote');
  assertUIRememberedKey(fixture,'remembered-to-demote');assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
  fixture.ids.get('remember-key').checked=false;fixture.ids.get('remember-key').listeners.change();
  fixture.ids.get('api-model').value='grok-4.7';fixture.ids.get('api-model').listeners.change();
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  const correction=fixture.messages.find(message=>message.type==='SAVE_KEY');
  assert.equal(correction.remember,false);assert.equal(correction.apiKey,'remembered-to-demote');
  assert.equal(correction.settings.apiModel,'grok-4.7');
  assert.equal(fixture.local.apiKey,undefined);assert.equal(fixture.local.apiKeyEncrypted,undefined);assert.equal(fixture.local.rememberApiKey,false);
  assert.equal(fixture.session.apiKey,'remembered-to-demote');
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_KEY']);
  await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(fixture.messages.filter(message=>message.type==='SAVE_KEY').length,1,'An unchanged save must not resend credentials');
  assert.equal(fixture.messages.filter(message=>message.type==='SAVE_SETTINGS').length,1);
});

test('an explicit session-only choice survives reopening after the browser session ends', async () => {
  const fixture=uiPageFixture('options',API_UI_SETTINGS,{local:{apiKey:undefined},session:{apiKey:undefined}});
  await settleUI();await settleUI();
  const remember=fixture.ids.get('remember-key');remember.checked=false;remember.listeners.change();
  const input=fixture.ids.get('api-key');input.value='session-fixture-key';input.listeners.input();
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(fixture.messages.find(message=>message.type==='SAVE_KEY').remember,false);
  assert.equal(fixture.local.rememberApiKey,false);assert.equal(fixture.local.apiKey,undefined);assert.equal(fixture.local.apiKeyEncrypted,undefined);
  assert.equal(fixture.session.apiKey,'session-fixture-key');
  const reopened=uiPageFixture('options',fixture.local.settings,{local:fixture.local,session:{apiKey:undefined}});
  await settleUI();await settleUI();
  assert.equal(reopened.ids.get('remember-key').checked,false);assert.equal(reopened.ids.get('api-key').value,'');
  assert.equal(reopened.ids.get('key-security-state').dataset.state,'missing');
  assert.deepEqual(uiMessageTypes(reopened),['GET_UI_LANGUAGE']);
});

test('clearing a Key preserves the remember choice and the next replacement saves without password fields', async () => {
  for(const remember of [true,false]) {
    const fixture=uiPageFixture('options',API_UI_SETTINGS,{local:{rememberApiKey:!remember}});
    await settleUI();await settleUI();
    const choice=fixture.ids.get('remember-key');choice.checked=remember;choice.listeners.change();
    await fixture.ids.get('clear-key').listeners.click();
    const clear=fixture.messages.find(message=>message.type==='SAVE_KEY');
    assert.equal(clear.apiKey,'');assert.equal(clear.remember,remember);assert.equal(Object.hasOwn(clear,'settings'),false);
    assert.equal(choice.checked,remember);assert.equal(fixture.ids.get('api-key').value,'');
    assert.equal(fixture.local.rememberApiKey,remember);assert.equal(fixture.local.apiKey,undefined);assert.equal(fixture.local.apiKeyEncrypted,undefined);assert.equal(fixture.session.apiKey,undefined);
    assert.equal(fixture.ids.get('status').textContent,ui.t('options.keyCleared','en'));
    assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_KEY']);
    const reopened=uiPageFixture('options',fixture.local.settings,{local:fixture.local,session:{apiKey:undefined}});
    await settleUI();await settleUI();
    assert.equal(reopened.ids.get('remember-key').checked,remember);assert.equal(reopened.ids.get('api-key').value,'');
    const nextKey=fixture.ids.get('api-key');nextKey.value='replacement-fixture-key';nextKey.listeners.input();
    const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    const replacement=fixture.messages.filter(message=>message.type==='SAVE_KEY').at(-1);
    assert.equal(replacement.remember,remember);assert.equal(fixture.session.apiKey,'replacement-fixture-key');
    if(remember)assertUIRememberedKey(fixture,'replacement-fixture-key');
    else assert.equal(fixture.local.apiKeyEncrypted,undefined);
    assert.equal(fixture.local.apiKey,undefined);assert.equal(fixture.local.apiKeyVault,undefined);
    assert.equal(Object.hasOwn(replacement.settings,'rememberApiKey'),false);assert.equal(Object.hasOwn(replacement.settings,'apiKey'),false);
  }
});

test('Key storage preferences and credentials cannot become normalized feed settings', () => {
  const settings=core.normalizeSettings({...API_UI_SETTINGS,rememberApiKey:true,remember:false,apiKey:'fixture-only-secret'});
  assert.deepEqual(settings,core.normalizeSettings(API_UI_SETTINGS));
  for(const key of ['rememberApiKey','remember','apiKey'])assert.equal(Object.hasOwn(settings,key),false,key);
  assert.equal(JSON.stringify(settings).includes('fixture-only-secret'),false);
});

test('options expose separate post, new-draft, reply-draft and comments editors with accessible labels and bounded input',async()=>{
  const fixture=uiPageFixture('options');await settleUI();await settleUI();
  for(const name of ['verify','postDraft','replyDraft','comments']){
    const editor=fixture.ids.get(promptEditorId(name));
    assert.equal(editor.value,core.DEFAULT_PROMPTS[name]);assert.equal(editor.getAttribute('maxlength'),String(core.MAX_PROMPT_LENGTH));
    assert.equal(editor.getAttribute('spellcheck'),'false');assert.equal(editor.getAttribute('dir'),'auto');
    assert.equal(editor.getAttribute('aria-describedby'),{verify:'verify-prompt-help prompt-rules-help',postDraft:'post-draft-prompt-help prompt-rules-help',replyDraft:'reply-draft-prompt-help prompt-rules-help',comments:'comments-prompt-help'}[name]);
  }
  for(const id of ['explain-prompt','reset-explain-prompt','draft-prompt','reset-draft-prompt','api-verification'])assert.equal(fixture.ids.has(id),false,id);
  assert.equal(fixture.ids.get('provider').value,'api');
  assert.ok(!fixture.ids.get('api-fields').hidden);
  fixture.ids.get('explanation-mode').value='custom';fixture.ids.get('explanation-mode').listeners.change();
  assert.equal(fixture.ids.get('analysis-prompts').hidden,false);
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
});

test('prompt labels distinguish shared fact-checking rules and new-post or reply context in every supported language',()=>{
  for(const locale of ui.SUPPORTED_LANGUAGES)for(const key of ['options.verifyPrompt','options.verifyPromptHelp','options.postDraftPrompt','options.postDraftPromptHelp','options.replyDraftPrompt','options.replyDraftPromptHelp']){
    assert.ok(ui.catalog[locale][key]?.trim(),`${locale}: ${key}`);
    if(locale!=='en')assert.notEqual(ui.catalog[locale][key],ui.catalog.en[key],`${locale}: ${key}`);
  }
  for(const locale of ui.SUPPORTED_LANGUAGES){
    const labels=['options.verifyPrompt','options.postDraftPrompt','options.replyDraftPrompt'].map(key=>ui.t(key,locale));
    assert.equal(new Set(labels).size,3,`${locale}: distinct post, new-draft and reply labels`);
  }
  assert.equal(ui.t('options.verifyPrompt','en'),'Shared fact-check prompt');
  assert.equal(ui.t('options.verifyPrompt','zh-CN'),'通用核查提示词');
  assert.equal(ui.t('options.postDraftPrompt','zh-CN'),'新帖上下文提示词');
  assert.equal(ui.t('options.replyDraftPrompt','zh-CN'),'回复上下文提示词');
  assert.match(ui.t('options.verifyPromptHelp','en'),/Posts, new drafts and replies.*same fact-checking standard/);
  assert.match(ui.t('options.postDraftPromptHelp','en'),/quoted posts.*supporting material.*shared fact-checking standard/);
  assert.match(ui.t('options.replyDraftPromptHelp','en'),/original post and reply chain.*shared fact-checking standard/);
  assert.match(ui.t('options.replyDraftPromptHelp','zh-CN'),/楼顶原帖和回复链.*共用上方核查标准/);
  assert.doesNotMatch(ui.t('options.promptsHelp','en'),/original.*primary|URL/i);
});

test('options save and reload independent custom post, new-draft, reply-draft and comments prompts without stripping whitespace or extra requests',async()=>{
  const fixture=uiPageFixture('options');await settleUI();await settleUI();
  fixture.ids.get('explanation-mode').value='custom';fixture.ids.get('explanation-mode').listeners.change();
  const drafts={verify:'只核实原帖中可验证的断言。\n保留来源。\n',postDraft:'\n核查新帖，引用内容是辅助。\n',replyDraft:'\n结合楼顶原帖与回复链核查我写的回复。\n',comments:'\nOffer three distinct, natural replies. 🙂\n'};
  for(const [name,value]of Object.entries(drafts))fixture.ids.get(promptEditorId(name)).value=value;
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  const saved=fixture.messages.find(message=>message.type==='SAVE_SETTINGS');assert.ok(saved);assert.equal(saved.settings.explanationMode,'custom');assert.equal(saved.settings.apiVerification,'only');
  for(const [name,value]of Object.entries(drafts))assert.equal(saved.settings[`${name}Prompt`],value);
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_SETTINGS']);
  const reopened=uiPageFixture('options',saved.settings);await settleUI();await settleUI();
  assert.equal(reopened.ids.get('explanation-mode').value,'custom');assert.equal(reopened.ids.get('analysis-prompts').hidden,false);
  for(const [name,value]of Object.entries(drafts))assert.equal(reopened.ids.get(promptEditorId(name)).value,value);
});

test('restoring individual and all active prompts edits the form only and leaves the dormant legacy draft unchanged',async()=>{
  const settings=core.normalizeSettings({explanationMode:'custom',explainPrompt:'Dormant explanation draft',verifyPrompt:'Verify draft',postDraftPrompt:'Check my new post',replyDraftPrompt:'Check my reply',draftPrompt:'Legacy draft instructions',commentsPrompt:'Comments draft'});
  const fixture=uiPageFixture('options',settings);await settleUI();await settleUI();
  for(const [name,other]of [['postDraft','replyDraft'],['replyDraft','postDraft']]){
    const before=fixture.ids.get(promptEditorId(other)).value;
    fixture.ids.get(`reset-${promptEditorId(name)}`).listeners.click();
    assert.equal(fixture.ids.get(promptEditorId(name)).value,core.DEFAULT_PROMPTS[name]);
    assert.equal(fixture.ids.get(promptEditorId(other)).value,before);
    assert.equal(fixture.ids.get('verify-prompt').value,'Verify draft');assert.equal(fixture.ids.get('comments-prompt').value,'Comments draft');
  }
  fixture.ids.get('post-draft-prompt').value='Another new post prompt';
  fixture.ids.get('reply-draft-prompt').value='Another reply prompt';
  fixture.ids.get('reset-verify-prompt').listeners.click();
  assert.equal(fixture.ids.get('verify-prompt').value,core.DEFAULT_PROMPTS.verify);assert.equal(fixture.ids.get('post-draft-prompt').value,'Another new post prompt');assert.equal(fixture.ids.get('reply-draft-prompt').value,'Another reply prompt');assert.equal(fixture.ids.get('comments-prompt').value,'Comments draft');
  assert.equal(fixture.ids.get('status').textContent,ui.t('options.promptsReset','en'));assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
  fixture.ids.get('reset-prompts').listeners.click();assert.equal(fixture.ids.get('explanation-mode').value,'custom');
  for(const name of ['verify','postDraft','replyDraft','comments'])assert.equal(fixture.ids.get(promptEditorId(name)).value,core.DEFAULT_PROMPTS[name]);
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  const saved=fixture.messages.find(message=>message.type==='SAVE_SETTINGS');
  for(const name of ['verify','postDraft','replyDraft','comments'])assert.equal(saved.settings[`${name}Prompt`],core.DEFAULT_PROMPTS[name]);
  assert.equal(saved.settings.explainPrompt,'Dormant explanation draft');assert.equal(saved.settings.apiVerification,'only');
  assert.equal(saved.settings.draftPrompt,'Legacy draft instructions');
});

test('preset and custom Fact Check switches preserve active drafts without exposing retired explanation choices',async()=>{
  const fixture=uiPageFixture('options',core.normalizeSettings({explanationMode:'custom',apiVerification:'inline',nativeVerification:true}));await settleUI();await settleUI();
  const drafts={verify:'Verify draft',postDraft:'Check my new post',replyDraft:'Check my reply',comments:'Three short replies.'};
  for(const [name,value]of Object.entries(drafts))fixture.ids.get(promptEditorId(name)).value=value;
  for(const mode of ['preset','custom']){
    fixture.ids.get('explanation-mode').value=mode;fixture.ids.get('explanation-mode').listeners.change();
    assert.equal(fixture.ids.get('analysis-prompts').hidden,mode!=='custom');assert.equal(fixture.ids.has('api-verification'),false);
    assert.equal(fixture.ids.get('explanation-mode-help').textContent,ui.t(`options.${mode}ModeHelp`,'en'));
    for(const [name,value]of Object.entries(drafts))assert.equal(fixture.ids.get(promptEditorId(name)).value,value);
    assert.ok(!fixture.ids.get('comments-prompt').hidden);
  }
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
});

test('saving preset Fact Check retains custom active drafts and optional archived explanation for future use',async()=>{
  const fixture=uiPageFixture('options',core.normalizeSettings({explanationMode:'custom',explainPrompt:'My archived explanation',verifyPrompt:'My verify instructions',postDraftPrompt:'My new post instructions',replyDraftPrompt:'My reply instructions',commentsPrompt:'My comments instructions'}));await settleUI();await settleUI();
  fixture.ids.get('explanation-mode').value='preset';fixture.ids.get('explanation-mode').listeners.change();
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  const saved=fixture.messages.find(message=>message.type==='SAVE_SETTINGS');assert.equal(saved.settings.explanationMode,'preset');
  assert.equal(saved.settings.explainPrompt,'My archived explanation');assert.equal(saved.settings.verifyPrompt,'My verify instructions');assert.equal(saved.settings.postDraftPrompt,'My new post instructions');assert.equal(saved.settings.replyDraftPrompt,'My reply instructions');assert.equal(saved.settings.commentsPrompt,'My comments instructions');
  const reopened=uiPageFixture('options',saved.settings);await settleUI();await settleUI();
  reopened.ids.get('explanation-mode').value='custom';reopened.ids.get('explanation-mode').listeners.change();
  assert.equal(reopened.ids.get('verify-prompt').value,'My verify instructions');assert.equal(reopened.ids.get('post-draft-prompt').value,'My new post instructions');assert.equal(reopened.ids.get('reply-draft-prompt').value,'My reply instructions');assert.equal(reopened.ids.has('explain-prompt'),false);
});

test('editing either draft prompt marks Settings dirty and saves independently from other prompts',async()=>{
  for(const name of ['postDraft','replyDraft']){
    const original=core.normalizeSettings({...API_UI_SETTINGS,explanationMode:'custom',verifyPrompt:'Post instructions',postDraftPrompt:'New post instructions',replyDraftPrompt:'Reply instructions'});
    const fixture=uiPageFixture('options',original);await settleUI();await settleUI();
    const editor=fixture.ids.get(promptEditorId(name));editor.value='Updated draft instructions';editor.listeners.input();
    assert.equal(fixture.ids.get('status').textContent,ui.t('options.unsavedChanges','en'));
    assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
    const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    const saved=fixture.messages.find(message=>message.type==='SAVE_SETTINGS');
    assert.equal(saved.settings[`${name}Prompt`],'Updated draft instructions');assert.equal(saved.settings.verifyPrompt,'Post instructions');
    const other=name==='postDraft'?'replyDraft':'postDraft';assert.equal(saved.settings[`${other}Prompt`],original[`${other}Prompt`]);
    assert.equal(fixture.ids.get('status').textContent,ui.t('options.saved','en'));
  }
});

test('either blank draft prompt restores its own default without replacing other custom instructions',async()=>{
  for(const name of ['postDraft','replyDraft']){
    const original=core.normalizeSettings({...API_UI_SETTINGS,explanationMode:'custom',verifyPrompt:'Keep my post prompt',postDraftPrompt:'Custom new post prompt',replyDraftPrompt:'Custom reply prompt'});
    const fixture=uiPageFixture('options',original);await settleUI();await settleUI();
    fixture.ids.get(promptEditorId(name)).value='';
    const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    const saved=fixture.messages.find(message=>message.type==='SAVE_SETTINGS');
    assert.equal(saved.settings[`${name}Prompt`],core.DEFAULT_PROMPTS[name]);assert.equal(saved.settings.verifyPrompt,'Keep my post prompt');
    const other=name==='postDraft'?'replyDraft':'postDraft';assert.equal(saved.settings[`${other}Prompt`],original[`${other}Prompt`]);
    assert.equal(fixture.ids.get(promptEditorId(name)).value,core.DEFAULT_PROMPTS[name]);
  }
});

test('every API mode requires a full-post retrieval tool before saving and accepts either search', async () => {
  for(const mode of ['preset','custom']) {
    const fixture=uiPageFixture('options',core.normalizeSettings({explanationMode:mode}));await settleUI();await settleUI();
    fixture.ids.get('web-search').checked=false;fixture.ids.get('x-search').checked=false;
    const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    assert.equal(fixture.ids.get('status').textContent,ui.t('options.checkFields','en'));
    assert.equal(fixture.ids.get('search-status').textContent,ui.t('options.urlSearchRequired','en'));
    assert.equal(fixture.ids.get('status').dataset.state,'error');
    assert.equal(fixture.ids.get('x-search').focused,true);
    assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
    for(const tool of ['web-search','x-search']) {
      fixture.ids.get('web-search').checked=tool==='web-search';fixture.ids.get('x-search').checked=tool==='x-search';
      await form.listeners.submit({preventDefault(){},currentTarget:form});
      assert.equal(fixture.messages.filter(message=>message.type==='SAVE_SETTINGS').length,tool==='web-search'?1:2);
    }
  }
});

test('retired URL selection loads preset and restoring defaults keeps preset selected', async () => {
  const fixture=uiPageFixture('options',core.normalizeSettings({explanationMode:'url',explainPrompt:'Saved custom',verifyPrompt:'Saved verification'}));
  await settleUI();await settleUI();fixture.ids.get('reset-prompts').listeners.click();
  assert.equal(fixture.ids.get('explanation-mode').value,'preset');
  assert.equal(fixture.ids.get('analysis-prompts').hidden,true);
  assert.equal(fixture.ids.get('verify-prompt').value,core.DEFAULT_PROMPTS.verify);
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
});

test('options reject an oversized prompt without silently shortening or saving it', async () => {
  for(const name of ['verify','postDraft','replyDraft','comments']){
    const fixture=uiPageFixture('options');await settleUI();await settleUI();
    const editor=fixture.ids.get(promptEditorId(name)),draft='x'.repeat(core.MAX_PROMPT_LENGTH+1);editor.value=draft;
    const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    assert.equal(editor.value,draft);assert.equal(editor.focused,true);
    assert.equal(fixture.ids.get('status').dataset.state,'error');
    assert.equal(fixture.ids.get('status').textContent,ui.t('options.promptTooLong','en',{limit:core.MAX_PROMPT_LENGTH}));
    assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
  }
});

test('live popup locale changes do not read keys or start paid generation', async () => {
  const fixture=uiPageFixture('popup');await settleUI();await settleUI();
  fixture.runtimeListeners.forEach(listener=>listener({type:'UI_LANGUAGE_CHANGED',language:'ja'}));
  assert.equal(fixture.ids.get('toggle').textContent,'一時停止');
  assert.equal(fixture.ids.get('options').textContent,'設定を開く');
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
  assert.ok(fixture.reads.flat().every(key=>key!=='apiKey'));
});

test('settings upgrade migrates retired selections without discarding saved custom prompt drafts',async()=>{
  const fixture=uiPageFixture('options',{...API_UI_SETTINGS,provider:'native',explanationMode:'url',language:'ja',apiModel:'my-model',explainPrompt:'Saved explanation.',verifyPrompt:'Saved evidence.',commentsPrompt:'Saved comments.'});
  await settleUI();await settleUI();assert.equal(fixture.ids.get('explanation-mode').value,'preset');
  assert.equal(fixture.ids.get('api-model').value,'my-model');assert.equal(fixture.ids.get('language').value,'ja');
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  const saved=fixture.messages.find(message=>message.type==='SAVE_SETTINGS');assert.equal(saved.settings.provider,'api');assert.equal(saved.settings.explanationMode,'preset');
  assert.equal(saved.settings.explainPrompt,'Saved explanation.');assert.equal(saved.settings.verifyPrompt,'Saved evidence.');assert.equal(saved.settings.commentsPrompt,'Saved comments.');
  assert.equal(Object.hasOwn(saved.settings,'nativeVerification'),false);
});

test('changing model and Key together sends one transaction without exposing settings under the old Key',async()=>{
  const dispatches=[];
  const fixture=uiPageFixture('options',API_UI_SETTINGS,
    {local:{apiKey:'old-account-key',rememberApiKey:true},session:{apiKey:'old-account-key'}},
    {onMessage(message,state){
      if(message.type==='SAVE_SETTINGS'&&message.settings.enabled&&state.session.apiKey)
        dispatches.push({model:message.settings.apiModel,key:state.session.apiKey});
    }});
  await settleUI();await settleUI();
  fixture.ids.get('api-model').value='grok-4.7';fixture.ids.get('api-model').listeners.change();
  fixture.ids.get('api-reasoning-effort').value='xhigh';fixture.ids.get('api-reasoning-effort').listeners.change();
  fixture.ids.get('api-key').value='new-account-key';fixture.ids.get('api-key').listeners.input();
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.deepEqual(dispatches,[],'Target settings must never be broadcast with the previous account Key');
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_KEY']);
  const saved=fixture.messages.find(message=>message.type==='SAVE_KEY');
  assert.equal(saved.settings.apiModel,'grok-4.7');assert.equal(saved.settings.apiReasoningEffort,'xhigh');assert.equal(saved.apiKey,'new-account-key');
  assert.equal(Object.hasOwn(saved,'passphrase'),false);
  assert.equal(fixture.local.settings.apiModel,'grok-4.7');assert.equal(fixture.local.settings.apiReasoningEffort,'xhigh');
  assertUIRememberedKey(fixture,'new-account-key');assert.equal(fixture.session.apiKey,'new-account-key');
});

test('a failed Clear Key action retains the active credential and shows its actual state',async()=>{
  const fixture=uiPageFixture('options',API_UI_SETTINGS,
    {local:{apiKey:'old-account-key',rememberApiKey:true},session:{apiKey:'old-account-key'}},
    {onMessage(message){if(message.type==='SAVE_KEY')return {ok:false,errorKey:'errors.keyStorage'};}});
  await settleUI();await settleUI();
  fixture.ids.get('api-key').value='unsaved-replacement';fixture.ids.get('api-key').listeners.input();
  await fixture.ids.get('clear-key').listeners.click();
  assertUIRememberedKey(fixture,'old-account-key');assert.equal(fixture.session.apiKey,'old-account-key');
  assert.equal(fixture.ids.get('api-key').value,'old-account-key');
  assert.equal(fixture.ids.get('key-security-state').dataset.state,'ready');
  assert.equal(fixture.ids.get('status').dataset.state,'error');
  assert.ok(fixture.ids.get('status').textContent.includes(ui.t('errors.keyStorage','en')));
  assert.equal(fixture.ids.get('save').disabled,false);
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(fixture.messages.filter(message=>message.type==='SAVE_KEY').length,1,'An unchanged surviving Key is not resent');
});

test('ordinary personal xAI Keys save directly regardless of stale legacy consent records', async()=>{
  for(const dataConsent of [undefined,{version:1,accepted:false}]) {
    const fixture=uiPageFixture('options',API_UI_SETTINGS,{local:{dataConsent},session:{apiKey:undefined}});
    await settleUI();await settleUI();
    assert.equal(fixture.ids.has('data-consent'),false);assert.equal(fixture.ids.has('revoke-consent'),false);
    fixture.ids.get('remember-key').checked=false;fixture.ids.get('remember-key').listeners.change();
    fixture.ids.get('api-key').value='personal-fixture-key';fixture.ids.get('api-key').listeners.input();
    const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_KEY']);
    assert.equal(fixture.session.apiKey,'personal-fixture-key');assert.equal(fixture.local.apiKey,undefined);
    assert.equal(fixture.local.dataConsent,dataConsent,'Obsolete records neither gate nor cause new consent mutations');
    assert.equal(fixture.ids.get('key-security-state').textContent,ui.t('options.keyReady','en'));
  }
});

test('an old encrypted Key without plaintext asks only for API Key reentry once', async()=>{
  const fixture=uiPageFixture('options',API_UI_SETTINGS,
    {local:{apiKeyVault:{fixture:'old-encrypted'},rememberApiKey:true},session:{apiKey:undefined}});
  await settleUI();await settleUI();
  assert.equal(fixture.ids.get('api-key').value,'');assert.equal(fixture.ids.get('remember-key').checked,true);
  assert.equal(fixture.ids.get('key-security-state').textContent,ui.t('options.keyMigration','en'));
  assert.equal(fixture.ids.get('clear-key').hidden,false);
  fixture.ids.get('api-key').value='replacement-encrypted-key';fixture.ids.get('api-key').listeners.input();
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_KEY']);
  assert.equal(fixture.local.apiKeyVault,undefined);assertUIRememberedKey(fixture,'replacement-encrypted-key');
  const reopened=uiPageFixture('options',fixture.local.settings,{local:fixture.local,session:{apiKey:undefined}});
  await settleUI();await settleUI();
  assert.equal(reopened.ids.get('api-key').value,'replacement-encrypted-key');
  assert.equal(reopened.ids.get('key-security-state').textContent,ui.t('options.keyReadySaved','en'));
});

test('unreadable automatic ciphertext requires API Key reentry without falling back to stale credentials',async()=>{
  for(const failure of ['missing-device-key','damaged-envelope']) {
    const envelope={fixtureId:failure,unreadable:true};
    const fixture=uiPageFixture('options',API_UI_SETTINGS,
      {local:{apiKeyEncrypted:envelope,apiKey:'stale-plaintext',rememberApiKey:true},session:{apiKey:'stale-session'}});
    await settleUI();await settleUI();
    assert.equal(fixture.ids.get('key-security-state').dataset.state,'migration');
    assert.equal(fixture.ids.get('key-security-state').textContent,ui.t('options.keyMigration','en'));
    assert.equal(fixture.ids.get('api-key').value,'');assert.equal(fixture.session.apiKey,undefined);
    assert.equal(fixture.ids.get('clear-key').hidden,false);
    for(const id of ['unlock-key','unlock-passphrase','save-passphrase','confirm-passphrase'])assert.equal(fixture.ids.has(id),false);
    const form=fixture.ids.get('settings-form');fixture.ids.get('language').value='ja';
    await form.listeners.submit({preventDefault(){},currentTarget:form});
    assert.equal(fixture.local.apiKeyEncrypted,envelope,'A settings-only save does not erase unreadable remembered data');
    assert.equal(fixture.session.apiKey,undefined);
    assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_SETTINGS']);
    fixture.ids.get('api-key').value='reentered-fixture-key';fixture.ids.get('api-key').listeners.input();
    await form.listeners.submit({preventDefault(){},currentTarget:form});
    assertUIRememberedKey(fixture,'reentered-fixture-key');assert.notEqual(fixture.local.apiKeyEncrypted,envelope);
    assert.equal(fixture.session.apiKey,'reentered-fixture-key');
    assert.equal(fixture.ids.get('key-security-state').dataset.state,'ready');
    assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_SETTINGS','SAVE_KEY']);
  }
});

test('an unreadable automatic ciphertext can be cleared without a device password or API Key',async()=>{
  const fixture=uiPageFixture('options',API_UI_SETTINGS,
    {local:{apiKeyEncrypted:{fixtureId:'missing-device-key'},rememberApiKey:true},session:{apiKey:undefined}});
  await settleUI();await settleUI();
  assert.equal(fixture.ids.get('clear-key').hidden,false);
  await fixture.ids.get('clear-key').listeners.click();
  assert.equal(fixture.local.apiKeyEncrypted,undefined);assert.equal(fixture.session.apiKey,undefined);
  assert.equal(fixture.ids.get('api-key').value,'');assert.equal(fixture.ids.get('clear-key').hidden,true);
  assert.equal(fixture.ids.get('key-security-state').dataset.state,'missing');
  assert.equal(fixture.ids.get('remember-key').checked,true);
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_KEY']);
});

test('missing or migration states allow ordinary settings saves without clearing or requiring Key input', async()=>{
  for(const migration of [false,true]) {
    const envelope=migration?{fixture:'old-encrypted'}:undefined;
    const fixture=uiPageFixture('options',API_UI_SETTINGS,
      {local:{apiKeyVault:envelope,rememberApiKey:true},session:{apiKey:undefined}});
    await settleUI();await settleUI();
    assert.equal(fixture.ids.get('api-key').value,'');
    fixture.ids.get('language').value='ja';fixture.ids.get('api-concurrency').value=2;
    const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    assert.equal(fixture.local.apiKeyVault,envelope);assert.equal(fixture.session.apiKey,undefined);
    assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_SETTINGS']);
    assert.equal(fixture.local.settings.language,'ja');assert.equal(fixture.local.settings.apiConcurrency,2);
    assert.equal(fixture.ids.get('status').textContent,ui.t('options.saved','en'));
  }
});

test('initial Options reads the session Key after worker hydration and never reads the local credential',async()=>{
  let ready=false;
  const fixture=uiPageFixture('options',API_UI_SETTINGS,
    {local:{apiKeyEncrypted:uiFixtureEncryptedKey('persisted-startup-key'),rememberApiKey:true},session:{apiKey:undefined}},
    {onMessage(message,state){
      if(message.type==='GET_SECURITY_STATUS') {
        ready=true;state.session.apiKey=uiFixtureCipherKeys.get(state.local.apiKeyEncrypted.fixtureId);
        return {ok:true,keyState:'ready',remember:true,hasSavedKey:true};
      }
    }});
  await settleUI();await settleUI();
  assert.equal(ready,true);assert.equal(fixture.ids.get('api-key').value,'persisted-startup-key');
  assert.ok(fixture.reads.flat().every(key=>!['apiKey','apiKeyVault','apiKeyEncrypted'].includes(key)));
  assert.ok(!fixture.messages.some(message=>['LOCK_KEY','UNLOCK_KEY','SAVE_KEY','SAVE_SETTINGS'].includes(message.type)));
});

test('usable old vault plaintext migrates without prompting or resaving through Options',async()=>{
  for(const remembered of [false,true]) {
    const fixture=uiPageFixture('options',API_UI_SETTINGS,
      {local:{apiKeyVault:{fixture:'old-encrypted'},rememberApiKey:remembered},session:{apiKey:'usable-migration-key'}});
    await settleUI();await settleUI();
    assert.equal(fixture.ids.get('api-key').value,'usable-migration-key');
    assert.equal(fixture.local.apiKeyVault,undefined);
    if(remembered)assertUIRememberedKey(fixture,'usable-migration-key');
    else assert.equal(fixture.local.apiKeyEncrypted,undefined);
    assert.equal(fixture.local.apiKey,undefined);
    assert.equal(fixture.ids.get('remember-key').checked,remembered);
    assert.equal(fixture.ids.get('key-security-state').textContent,ui.t(remembered?'options.keyReadySaved':'options.keyReady','en'));
    assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
  }
});

test('Clear saved Key removes a retained old encrypted vault without password controls',async()=>{
  const fixture=uiPageFixture('options',API_UI_SETTINGS,
    {local:{apiKeyVault:{fixture:'old-encrypted'},rememberApiKey:true},session:{apiKey:undefined}});
  await settleUI();await settleUI();
  await fixture.ids.get('clear-key').listeners.click();
  assert.equal(fixture.ids.get('api-key').value,'');assert.equal(fixture.local.apiKeyVault,undefined);
  assert.equal(fixture.local.apiKey,undefined);assert.equal(fixture.session.apiKey,undefined);
  assert.equal(fixture.ids.get('remember-key').checked,true);assert.equal(fixture.ids.get('clear-key').hidden,true);
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_KEY']);
});

test('an untouched Key follows another Settings tab before changing its storage preference',async()=>{
  const fixture=uiPageFixture('options',API_UI_SETTINGS,
    {local:{apiKey:'account-a-fixture',rememberApiKey:true},session:{apiKey:'account-a-fixture'}});
  await settleUI();await settleUI();
  fixture.local.apiKeyEncrypted=uiFixtureEncryptedKey('account-b-fixture');fixture.session.apiKey='account-b-fixture';
  for(const listener of fixture.storageListeners)listener({apiKey:{oldValue:'account-a-fixture',newValue:'account-b-fixture'}},'session');
  await settleUI();await settleUI();
  assert.equal(fixture.ids.get('api-key').value,'account-b-fixture');
  fixture.ids.get('remember-key').checked=false;fixture.ids.get('remember-key').listeners.change();
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(fixture.messages.find(message=>message.type==='SAVE_KEY').apiKey,'account-b-fixture');
  assert.equal(fixture.session.apiKey,'account-b-fixture');assert.equal(fixture.local.apiKey,undefined);
});

test('a replacement Key draft survives external credential changes without being silently saved',async()=>{
  const fixture=uiPageFixture('options',API_UI_SETTINGS,
    {local:{rememberApiKey:false},session:{apiKey:'account-a-fixture'}});
  await settleUI();await settleUI();
  fixture.ids.get('api-key').value='replacement-c-fixture';fixture.ids.get('api-key').listeners.input();
  fixture.session.apiKey='account-b-fixture';
  for(const listener of fixture.storageListeners)listener({apiKey:{oldValue:'account-a-fixture',newValue:'account-b-fixture'}},'session');
  await settleUI();await settleUI();
  assert.equal(fixture.ids.get('api-key').value,'replacement-c-fixture');assert.equal(fixture.session.apiKey,'account-b-fixture');
  assert.ok(!fixture.messages.some(message=>message.type==='SAVE_KEY'));
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(fixture.session.apiKey,'replacement-c-fixture','Only the explicit Save applies this tab’s replacement draft');
});

test('local encrypted Key changes update untouched input while preserving edited Key and settings drafts',async()=>{
  for(const edited of [false,true]) {
    const oldEnvelope=uiFixtureEncryptedKey('account-a-fixture');
    const fixture=uiPageFixture('options',API_UI_SETTINGS,
      {local:{apiKeyEncrypted:oldEnvelope,rememberApiKey:true},session:{apiKey:undefined}});
    await settleUI();await settleUI();
    fixture.ids.get('api-model').value='grok-4.7';fixture.ids.get('api-model').listeners.change();
    fixture.ids.get('verify-prompt').value='Keep my prompt draft.';
    if(edited) {
      fixture.ids.get('api-key').value='replacement-c-fixture';fixture.ids.get('api-key').listeners.input();
    }
    const nextEnvelope=uiFixtureEncryptedKey('account-b-fixture');fixture.local.apiKeyEncrypted=nextEnvelope;
    for(const listener of fixture.storageListeners)listener({apiKeyEncrypted:{oldValue:oldEnvelope,newValue:nextEnvelope}},'local');
    await settleUI();await settleUI();
    assert.equal(fixture.session.apiKey,'account-b-fixture');
    assert.equal(fixture.ids.get('api-key').value,edited?'replacement-c-fixture':'account-b-fixture');
    assert.equal(fixture.ids.get('api-model').value,'grok-4.7');
    assert.equal(fixture.ids.get('verify-prompt').value,'Keep my prompt draft.');
    assert.ok(!fixture.messages.some(message=>['SAVE_KEY','SAVE_SETTINGS'].includes(message.type)));
    const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    assertUIRememberedKey(fixture,edited?'replacement-c-fixture':'account-b-fixture');
    assert.equal(fixture.local.settings.apiModel,'grok-4.7');
    assert.equal(fixture.local.settings.verifyPrompt,'Keep my prompt draft.');
    assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE',edited?'SAVE_KEY':'SAVE_SETTINGS']);
    if(!edited)assert.equal(fixture.local.apiKeyEncrypted,nextEnvelope,'Ordinary Settings saves do not rotate or replace ciphertext');
  }
});

test('external credentials become the draft baseline without resending an unchanged Key',async()=>{
  const fixture=uiPageFixture('options',API_UI_SETTINGS,
    {local:{apiKey:'account-a-fixture',rememberApiKey:true},session:{apiKey:'account-a-fixture'}});
  await settleUI();await settleUI();
  fixture.ids.get('api-key').value='account-b-fixture';fixture.ids.get('api-key').listeners.input();
  fixture.local.apiKeyEncrypted=uiFixtureEncryptedKey('account-b-fixture');fixture.session.apiKey='account-b-fixture';
  for(const listener of fixture.storageListeners)listener({apiKey:{oldValue:'account-a-fixture',newValue:'account-b-fixture'}},'session');
  await settleUI();await settleUI();
  fixture.ids.get('api-model').value='grok-4.7';fixture.ids.get('api-model').listeners.change();
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(fixture.local.settings.apiModel,'grok-4.7');
  assert.ok(!fixture.messages.some(message=>['LOCK_KEY','UNLOCK_KEY','SAVE_KEY'].includes(message.type)));
  assert.equal(fixture.session.apiKey,'account-b-fixture');
});

test('failed atomic replacement saves preserve credentials and settings while retaining a retryable draft',async()=>{
  for(const remembered of [false,true]) {
    let fail=true;
    const fixture=uiPageFixture('options',API_UI_SETTINGS,
      {local:{rememberApiKey:remembered,...(remembered?{apiKey:'old-account-fixture'}:{})},session:{apiKey:'old-account-fixture'}},
      {onMessage(message){if(message.type==='SAVE_KEY'&&fail)return {ok:false,errorKey:'errors.keyStorage'};}});
    await settleUI();await settleUI();
    fixture.ids.get('api-model').value='grok-4.7';fixture.ids.get('api-model').listeners.change();
    fixture.ids.get('api-key').value='replacement-fixture';fixture.ids.get('api-key').listeners.input();
    const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    assert.equal(fixture.session.apiKey,'old-account-fixture');assert.equal(fixture.local.settings.apiModel,API_UI_SETTINGS.apiModel);
    assert.equal(fixture.ids.get('api-key').value,'replacement-fixture');assert.equal(fixture.ids.get('api-model').value,'grok-4.7');
    assert.equal(fixture.ids.get('key-security-state').dataset.state,'ready');
    assert.equal(fixture.ids.get('key-security-state').textContent,ui.t(remembered?'options.keyReadySaved':'options.keyReady','en'));
    assert.equal(fixture.ids.get('status').dataset.state,'error');assert.equal(fixture.ids.get('save').disabled,false);
    fail=false;await form.listeners.submit({preventDefault(){},currentTarget:form});
    assert.equal(fixture.session.apiKey,'replacement-fixture');assert.equal(fixture.local.settings.apiModel,'grok-4.7');
    assert.equal(fixture.ids.get('key-security-state').dataset.state,'ready');
  }
});

test('invalid or emptied Key edits are rejected before credential or settings mutation',async()=>{
  for(const draft of ['', 'invalid\nkey', 'x'.repeat(501)]) {
    const fixture=uiPageFixture('options',API_UI_SETTINGS,
      {local:{apiKey:'existing-fixture',rememberApiKey:true},session:{apiKey:'existing-fixture'}});
    await settleUI();await settleUI();
    fixture.ids.get('api-key').value=draft;fixture.ids.get('api-key').listeners.input();
    fixture.ids.get('api-model').value='grok-4.7';fixture.ids.get('api-model').listeners.change();
    const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    assert.equal(fixture.ids.get('status').textContent,ui.t('options.checkFields','en'));
    assert.equal(fixture.ids.get('key-security-state').textContent,ui.t(draft?'errors.keyInvalid':'options.keyRequired','en'));
    assert.equal(fixture.ids.get('api-key').focused,true);
    assertUIRememberedKey(fixture,'existing-fixture');assert.equal(fixture.session.apiKey,'existing-fixture');
    assert.equal(fixture.local.settings.apiModel,API_UI_SETTINGS.apiModel);
    assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
  }
});

test('editing after Save replaces stale success with an unsaved hint and reverting clears it',async()=>{
  const fixture=uiPageFixture('options');await settleUI();await settleUI();
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(fixture.ids.get('status').textContent,ui.t('options.saved','en'));
  const savedCount=fixture.messages.filter(message=>message.type==='SAVE_SETTINGS').length;
  const language=fixture.ids.get('language');language.value='ja';language.listeners.change();
  assert.equal(fixture.ids.get('status').textContent,ui.t('options.unsavedChanges','en'));
  assert.equal(fixture.messages.filter(message=>message.type==='SAVE_SETTINGS').length,savedCount);
  language.value=API_UI_SETTINGS.language;language.listeners.change();
  assert.equal(fixture.ids.get('status').textContent,'');
  fixture.ids.get('api-model').value='grok-4.7';fixture.ids.get('api-model').listeners.change();
  assert.equal(fixture.ids.get('status').textContent,ui.t('options.unsavedChanges','en'));
  for(const listener of fixture.runtimeListeners)listener({type:'UI_LANGUAGE_CHANGED',language:'ja'});
  assert.equal(fixture.ids.get('status').textContent,ui.t('options.unsavedChanges','ja'));
  await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(fixture.ids.get('status').textContent,ui.t('options.saved','ja'));
});

test('Clear saved Key is hidden on a fresh install and available only for an existing credential',async()=>{
  const cases=[
    {local:{},session:{apiKey:undefined},hidden:true},
    {local:{rememberApiKey:false},session:{apiKey:'session-fixture'},hidden:false},
    {local:{apiKeyVault:{fixture:'encrypted'},rememberApiKey:true},session:{apiKey:undefined},hidden:false},
    {local:{apiKey:'legacy-fixture'},session:{apiKey:undefined},hidden:false},
  ];
  for(const item of cases) {
    const fixture=uiPageFixture('options',API_UI_SETTINGS,item);await settleUI();await settleUI();
    assert.equal(fixture.ids.get('clear-key').hidden,item.hidden);
  }
});

test('opening Settings focuses API Key for both current and legacy trusted entries in migration state',async()=>{
  const cases=[
    {request:'api-key',expected:'api-key',local:{},session:{apiKey:undefined}},
    {request:'api-key',expected:'api-key',local:{apiKeyVault:{fixture:'encrypted'},rememberApiKey:true},session:{apiKey:undefined}},
    {request:'unlock-passphrase',expected:'api-key',local:{apiKeyVault:{fixture:'encrypted'},rememberApiKey:true},session:{apiKey:undefined}},
    {request:'unlock-passphrase',expected:'api-key',local:{},session:{apiKey:undefined}},
  ];
  for(const item of cases) {
    const fixture=uiPageFixture('options',API_UI_SETTINGS,
      {local:item.local,session:{...item.session,superxOptionsFocus:{id:item.request,nonce:'initial-fixture'}}});
    await settleUI();await settleUI();await settleUI();
    assert.equal(fixture.ids.get(item.expected).focused,true);
    assert.equal(fixture.ids.get('api-key').value,'');
    assert.equal(fixture.ids.has('unlock-passphrase'),false,'External Settings navigation has no password target');
    assert.equal(fixture.ids.get(item.expected).scrollOptions.block,'center');
    assert.equal(Object.hasOwn(fixture.session,'superxOptionsFocus'),false);
    assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
  }
});

test('an existing migration Settings page handles fresh or legacy focus requests once without saving drafts or accepting arbitrary targets',async()=>{
  const fixture=uiPageFixture('options',API_UI_SETTINGS,{local:{apiKeyVault:{fixture:'encrypted'},rememberApiKey:true},session:{apiKey:undefined}});await settleUI();await settleUI();
  fixture.ids.get('api-model').value='grok-4.7';fixture.ids.get('api-model').listeners.change();
  fixture.session.superxOptionsFocus={id:'save',nonce:'invalid-fixture'};
  for(const listener of fixture.storageListeners)listener({superxOptionsFocus:{newValue:fixture.session.superxOptionsFocus}},'session');
  await settleUI();await settleUI();
  assert.ok(!fixture.ids.get('save').focused);
  fixture.session.superxOptionsFocus={id:'unlock-passphrase',nonce:'second-fixture'};
  for(const listener of fixture.storageListeners)listener({superxOptionsFocus:{newValue:fixture.session.superxOptionsFocus}},'session');
  await settleUI();await settleUI();
  assert.equal(fixture.ids.get('api-key').focused,true);
  assert.equal(fixture.ids.has('unlock-passphrase'),false);
  assert.equal(fixture.ids.get('api-model').value,'grok-4.7');
  assert.equal(Object.hasOwn(fixture.session,'superxOptionsFocus'),false);
  fixture.ids.get('api-key').focused=false;
  fixture.session.superxOptionsFocus={id:'api-key',nonce:'second-fixture'};
  for(const listener of fixture.storageListeners)listener({superxOptionsFocus:{newValue:fixture.session.superxOptionsFocus}},'session');
  await settleUI();await settleUI();
  assert.equal(fixture.ids.get('api-key').focused,false,'A consumed nonce cannot refocus or replace the existing draft');
  assert.equal(fixture.ids.get('api-model').value,'grok-4.7');
  assert.ok(!fixture.messages.some(message=>['SAVE_SETTINGS','SAVE_KEY'].includes(message.type)));
});

test('a Settings focus request received during Save waits until completion and focuses API Key without an extra save',async()=>{
  const fixture=uiPageFixture('options',API_UI_SETTINGS,{local:{apiKeyVault:{fixture:'encrypted'},rememberApiKey:true},session:{apiKey:undefined}},
    {onMessage(message,state){
      if(message.type==='SAVE_SETTINGS') {
        state.session.superxOptionsFocus={id:'unlock-passphrase',nonce:'busy-focus-fixture'};
        for(const listener of fixture.storageListeners)listener({superxOptionsFocus:{newValue:state.session.superxOptionsFocus}},'session');
        assert.ok(!fixture.ids.get('api-key').focused,'The focus request must not interrupt an active Save');
      }
    }});
  await settleUI();await settleUI();
  fixture.ids.get('language').value='ja';fixture.ids.get('language').listeners.change();
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});await settleUI();await settleUI();
  assert.equal(fixture.ids.get('api-key').focused,true);assert.equal(fixture.ids.has('unlock-passphrase'),false);
  assert.equal(fixture.ids.get('api-key').value,'');assert.equal(fixture.ids.get('language').value,'ja');
  assert.equal(fixture.session.apiKey,undefined);assert.ok(fixture.local.apiKeyVault);
  assert.equal(Object.hasOwn(fixture.session,'superxOptionsFocus'),false);
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_SETTINGS']);
});

test('migration Settings navigation leaves the API Key editable without adding password controls or hidden mutations',async()=>{
  const fixture=uiPageFixture('options',API_UI_SETTINGS,
    {local:{apiKeyVault:{fixture:'encrypted'},rememberApiKey:true},session:{apiKey:undefined,superxOptionsFocus:{id:'api-key',nonce:'migration-navigation-fixture'}}});
  await settleUI();await settleUI();await settleUI();
  assert.equal(fixture.ids.get('api-key').focused,true);assert.equal(fixture.ids.get('api-key').disabled,false);
  for(const id of ['unlock-passphrase','unlock-key','save-passphrase','confirm-passphrase','lock-key'])assert.equal(fixture.ids.has(id),false);
  assert.equal(fixture.ids.get('key-security-state').dataset.state,'migration');
  assert.equal(fixture.session.apiKey,undefined);assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
});

test('popup shows Add API Key guidance for missing or migration states without mutating settings or reading Keys', async()=>{
  const cases=[
    {local:{},session:{apiKey:undefined},reason:'status.needsKey',hint:'popup.apiHint'},
    {local:{apiKeyVault:{fixture:'encrypted'},rememberApiKey:true},session:{apiKey:undefined},reason:'status.needsKey',hint:'popup.apiHint'},
    {local:{rememberApiKey:false},session:{apiKey:undefined},reason:'status.needsKey',hint:'popup.apiHint'},
  ];
  for(const item of cases) {
    const fixture=uiPageFixture('popup',API_UI_SETTINGS,item);await settleUI();await settleUI();
    assert.equal(fixture.ids.get('enabled-label').textContent,ui.t(item.reason,'en'));
    assert.equal(fixture.ids.get('provider-hint').textContent,ui.t(item.hint,'en'));
    assert.equal(fixture.ids.get('indicator').dataset.enabled,'false');
    assert.equal(fixture.ids.get('toggle').textContent,ui.t('popup.addKey','en'));
    assert.equal(fixture.ids.get('options').hidden,true,'The popup shows one clear onboarding action');
    await fixture.ids.get('toggle').listeners.click();
    assert.equal(fixture.openedOptions.length,1);
    assert.equal(fixture.openedOptions[0].focus,'api-key');
    assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','OPEN_SETTINGS']);
    assert.ok(fixture.reads.flat().every(key=>!['apiKey','apiKeyVault','apiKeyEncrypted'].includes(key)));
  }
});

test('popup onboarding navigation failures restore the action and allow retry without saving settings',async()=>{
  let fail=true;
  const fixture=uiPageFixture('popup',API_UI_SETTINGS,{session:{apiKey:undefined}},
    {onMessage(message){if(message.type==='OPEN_SETTINGS'&&fail)return {ok:false};}});
  await settleUI();await settleUI();
  await fixture.ids.get('toggle').listeners.click();
  assert.equal(fixture.ids.get('toggle').disabled,false);
  assert.equal(fixture.ids.get('toggle').textContent,ui.t('popup.addKey','en'));
  assert.ok(fixture.ids.get('status').textContent.includes(ui.t('errors.noResponse','en')));
  assert.equal(fixture.openedOptions.length,0);
  fail=false;
  await fixture.ids.get('toggle').listeners.click();
  assert.equal(fixture.ids.get('status').textContent,'');
  assert.equal(fixture.ids.get('toggle').disabled,false);
  assert.deepEqual(fixture.openedOptions,[{focus:'api-key'}]);
  assert.ok(!fixture.messages.some(message=>['SAVE_SETTINGS','SAVE_KEY'].includes(message.type)));
});

test('popup rechecks credentials before toggling and opens API Key settings if the Key becomes unavailable',async()=>{
  let configReads=0;
  const fixture=uiPageFixture('popup',API_UI_SETTINGS,{},
    {onMessage(message){
      if(message.type==='GET_CONFIG'&&++configReads>1)return {ok:true,settings:API_UI_SETTINGS,ready:false,keyMigration:true,keyState:'migration'};
    }});
  await settleUI();await settleUI();
  assert.equal(fixture.ids.get('options').hidden,false);
  await fixture.ids.get('toggle').listeners.click();
  assert.deepEqual(fixture.openedOptions,[{focus:'api-key'}]);
  assert.equal(fixture.ids.get('toggle').textContent,ui.t('popup.addKey','en'));
  assert.equal(fixture.ids.get('options').hidden,true);
  assert.ok(!fixture.messages.some(message=>['SAVE_SETTINGS','SAVE_KEY'].includes(message.type)));
});

test('the ready popup Open settings entry requests API Key focus without toggling or changing credentials',async()=>{
  const fixture=uiPageFixture('popup',API_UI_SETTINGS,{local:{apiKey:'ready-fixture-key',rememberApiKey:true},session:{apiKey:'ready-fixture-key'}});
  await settleUI();await settleUI();
  assert.equal(fixture.ids.get('options').hidden,false);
  await fixture.ids.get('options').listeners.click();await settleUI();
  assert.deepEqual(fixture.openedOptions,[{focus:'api-key'}]);
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','OPEN_SETTINGS']);
  assert.equal(fixture.session.apiKey,'ready-fixture-key');assertUIRememberedKey(fixture,'ready-fixture-key');
  assert.ok(fixture.reads.flat().every(key=>!['apiKey','apiKeyVault','apiKeyEncrypted'].includes(key)));
});

test('security-status failure still permits pause but rejects enabling an unreadable connection', async()=>{
  const fixture=uiPageFixture('options',API_UI_SETTINGS,{}, {securityFailure:true});
  await settleUI();await settleUI();
  assert.equal(fixture.ids.get('save').disabled,false);
  fixture.ids.get('enabled').checked=false;
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_SETTINGS']);
  assert.equal(fixture.local.settings.enabled,false);
  fixture.ids.get('enabled').checked=true;
  await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_SETTINGS']);
  assert.equal(fixture.ids.get('status').dataset.state,'error');
  assert.equal(fixture.ids.get('api-key').getAttribute('aria-invalid'),'true');
  assert.equal(fixture.session.apiKey,'session-secret');
});

test('saving unrelated API preferences does not reread credentials or fail after a successful settings write',async()=>{
  let reads=0,unavailable=false;
  const fixture=uiPageFixture('options',API_UI_SETTINGS,{}, {onMessage(message){if(message.type==='GET_SECURITY_STATUS'){reads++;if(unavailable)return {ok:false,errorKey:'errors.noResponse'};}}});
  await settleUI();await settleUI();const initialReads=reads;unavailable=true;
  fixture.ids.get('language').value='ja';const form=fixture.ids.get('settings-form');
  await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(fixture.local.settings.language,'ja');assert.equal(reads,initialReads);
  assert.equal(fixture.ids.get('status').textContent,ui.t('options.saved','en'));
  assert.equal(fixture.messages.some(message=>['SAVE_KEY','SAVE_BUILD_CONNECTION'].includes(message.type)),false);
  assert.equal(fixture.session.apiKey,'session-secret');
});

test('a failed Build connection permits unrelated preferences and pause without committing connection drafts',async()=>{
  const initial=core.normalizeSettings({provider:'build',buildModel:'grok-4.3',buildReasoningEffort:'none'});
  const fixture=uiPageFixture('options',initial,{}, {buildStatus:{ready:false,errorCode:'BUILD_DISCONNECTED'}});await settleUI();await settleUI();
  const {ids}=fixture,form=ids.get('settings-form');await ids.get('check-build').listeners.click();const permissions=fixture.permissionRequests.length;
  ids.get('language').value='ja';ids.get('analysis-dwell').value='5';await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(fixture.local.settings.language,'ja');assert.equal(fixture.local.settings.dwellMs,5000);
  assert.equal(fixture.permissionRequests.length,permissions);assert.equal(fixture.messages.some(message=>message.type==='SAVE_BUILD_CONNECTION'),false);
  ids.get('enabled').checked=false;ids.get('build-port').value='1';ids.get('build-secret').value='private-uncommitted-draft';ids.get('build-secret').listeners.input();ids.get('build-model').value='';ids.get('build-reasoning-effort').value='';
  let validations=0;form.reportValidity=()=>{validations++;for(const id of ['build-model','build-reasoning-effort','build-port'])assert.equal(ids.get(id).disabled,true,id);assert.equal(ids.get('analysis-dwell').disabled,false);assert.equal(ids.get('api-concurrency').disabled,true);return true;};
  await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(validations,1);assert.equal(fixture.local.settings.enabled,false);assert.equal(fixture.local.settings.buildModel,initial.buildModel);assert.equal(fixture.local.settings.buildReasoningEffort,initial.buildReasoningEffort);assert.equal(fixture.local.settings.buildPort,initial.buildPort);
  assert.equal(ids.get('build-model').value,'');assert.equal(ids.get('build-reasoning-effort').value,'');assert.equal(ids.get('build-port').value,'1');assert.equal(ids.get('build-secret').value,'private-uncommitted-draft');
  assert.equal(ids.get('status').textContent,ui.t('options.pausedWithDrafts','en'));assert.equal(fixture.permissionRequests.length,permissions);
  assert.equal(fixture.messages.filter(message=>message.type==='SAVE_SETTINGS').length,2);assert.equal(fixture.messages.some(message=>['SAVE_KEY','SAVE_BUILD_CONNECTION'].includes(message.type)),false);
});

test('pause retains invalid API credential and model drafts and still validates ordinary numeric preferences',async()=>{
  const fixture=uiPageFixture('options',API_UI_SETTINGS);await settleUI();await settleUI();const {ids}=fixture,form=ids.get('settings-form');
  ids.get('enabled').checked=false;ids.get('api-key').value='bad\nkey';ids.get('api-key').listeners.input();ids.get('api-model').value='';ids.get('api-reasoning-effort').value='';ids.get('analysis-dwell').value='-1';
  form.reportValidity=()=>{assert.equal(ids.get('api-model').disabled,true);assert.equal(ids.get('api-reasoning-effort').disabled,true);assert.equal(ids.get('analysis-dwell').disabled,false);return false;};
  await form.listeners.submit({preventDefault(){},currentTarget:form});assert.equal(fixture.messages.some(message=>message.type==='SAVE_SETTINGS'),false);
  ids.get('analysis-dwell').value='2';form.reportValidity=()=>true;await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(fixture.local.settings.enabled,false);assert.equal(fixture.local.settings.apiModel,API_UI_SETTINGS.apiModel);assert.equal(fixture.local.settings.apiReasoningEffort,API_UI_SETTINGS.apiReasoningEffort);assert.equal(fixture.local.settings.dwellMs,2000);
  assert.equal(ids.get('api-key').value,'bad\nkey');assert.equal(ids.get('api-model').value,'');assert.equal(ids.get('api-reasoning-effort').value,'');assert.equal(fixture.session.apiKey,'session-secret');assert.equal(fixture.messages.some(message=>message.type==='SAVE_KEY'),false);
  assert.equal(ids.get('status').textContent,ui.t('options.pausedWithDrafts','en'));
});

test('missing Build connection errors reveal nested details and a later successful check clears the resolved field error',async()=>{
  let ready=false;const fixture=uiPageFixture('options',API_UI_SETTINGS,{}, {buildConfigured:false,onMessage(message){if(message.type==='GET_BUILD_STATUS')return {ok:true,ready,modelCatalog:[{id:'grok-4.3',efforts:['none']}]};}});await settleUI();await settleUI();
  const {ids}=fixture,inner={open:false,parentElement:{closest:()=>outer}},outer={open:false,parentElement:null};ids.get('build-secret').closest=()=>inner;
  ids.get('provider').value='build';ids.get('provider').listeners.change();const form=ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(inner.open,true);assert.equal(outer.open,true);assert.equal(ids.get('build-secret').focused,true);assert.equal(ids.get('build-secret').getAttribute('aria-invalid'),'true');assert.equal(ids.get('build-secret').getAttribute('aria-errormessage'),'build-status');assert.equal(fixture.permissionRequests.length,0);
  await ids.get('generate-build-command').listeners.click();ready=true;await ids.get('check-build').listeners.click();
  assert.equal(ids.get('build-secret').getAttribute('aria-invalid'),null);assert.equal(ids.get('build-status').textContent,ui.t('build.ready','en'));
  ids.get('interface-language').value='zh-CN';ids.get('interface-language').listeners.change();assert.equal(ids.get('build-status').textContent,ui.t('build.ready','zh-CN'));
});

test('both disabled search tools show immediate local accessible feedback and recover when either is selected',async()=>{
  const fixture=uiPageFixture('options');await settleUI();await settleUI();const {ids}=fixture;
  ids.get('web-search').checked=false;ids.get('web-search').listeners.change();assert.equal(ids.get('search-status').hidden,true);
  ids.get('x-search').checked=false;ids.get('x-search').listeners.change();assert.equal(ids.get('search-status').hidden,false);assert.equal(ids.get('search-status').textContent,ui.t('options.urlSearchRequired','en'));
  for(const id of ['web-search','x-search']){assert.equal(ids.get(id).getAttribute('aria-invalid'),'true');assert.match(ids.get(id).getAttribute('aria-describedby'),/search-status/);}
  const form=ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});assert.equal(ids.get('x-search').focused,true);assert.equal(fixture.messages.some(message=>message.type==='SAVE_SETTINGS'),false);
  ids.get('web-search').checked=true;ids.get('web-search').listeners.change();for(const id of ['web-search','x-search'])assert.equal(ids.get(id).getAttribute('aria-invalid'),null);assert.equal(ids.get('search-status').hidden,true);
  ids.get('interface-language').value='zh-CN';ids.get('interface-language').listeners.change();assert.equal(ids.get('search-status').textContent,'');await form.listeners.submit({preventDefault(){},currentTarget:form});assert.equal(fixture.local.settings.webSearch,true);assert.equal(fixture.local.settings.xSearch,false);
});

test('Custom mode reveals prompt controls once and preserves a manually collapsed comments editor during redraws',async()=>{
  const fixture=uiPageFixture('options');await settleUI();await settleUI();const {ids}=fixture;
  assert.equal(ids.get('prompt-editing-help').hidden,true);assert.equal(ids.get('reset-prompts').hidden,true);assert.notEqual(ids.get('comments-customization').open,true);
  ids.get('explanation-mode').value='custom';ids.get('explanation-mode').listeners.change();assert.equal(ids.get('prompt-editing-help').hidden,false);assert.equal(ids.get('reset-prompts').hidden,false);assert.equal(ids.get('comments-customization').open,true);
  ids.get('comments-customization').open=false;ids.get('interface-language').value='ja';ids.get('interface-language').listeners.change();fixture.runtimeListeners.forEach(listener=>listener({type:'OAUTH_STATUS_CHANGED',oauthStatus:{state:'connected',connected:true,catalogModels:[{id:'grok-4.3'}]}}));assert.equal(ids.get('comments-customization').open,false);
  ids.get('explanation-mode').value='preset';ids.get('explanation-mode').listeners.change();ids.get('explanation-mode').value='custom';ids.get('explanation-mode').listeners.change();assert.equal(ids.get('comments-customization').open,true);assert.equal(fixture.messages.some(message=>['SAVE_SETTINGS','ANALYZE','GENERATE_COMMENTS'].includes(message.type)),false);
});

test('Maintenance opens for native navigation and retained deep links without fetching diagnostics automatically',async()=>{
  for(const hash of ['#maintenance-heading','#cache-heading','#reload-heading','#api-diagnostics']){
    const fixture=uiPageFixture('options',API_UI_SETTINGS,{}, {hash});await settleUI();await settleUI();assert.equal(fixture.ids.get('maintenance').open,true,hash);assert.equal(fixture.messages.some(message=>message.type==='GET_API_DIAGNOSTICS'),false);
  }
  const fixture=uiPageFixture('options');await settleUI();await settleUI();let prevented=false;fixture.ids.get('maintenance-link').listeners.click({preventDefault(){prevented=true;}});assert.equal(prevented,false);assert.equal(fixture.ids.get('maintenance').open,true);
  fixture.ids.get('maintenance').open=false;fixture.location.hash='#reload-heading';fixture.pageListeners.hashchange();assert.equal(fixture.ids.get('maintenance').open,true);assert.equal(fixture.messages.some(message=>message.type==='GET_API_DIAGNOSTICS'),false);
});

test('direct-client and security labels are supplied distinctly in twelve languages without a consent screen', ()=>{
  const keys=['options.directClientHint','options.privacyLink','options.rememberHelp','options.keyMigration','options.keyMissing',
    'options.keyReadySaved','options.keyReady','errors.keyStorage','options.cacheHelp'];
  for(const locale of ui.SUPPORTED_LANGUAGES)for(const key of keys) {
    assert.ok(ui.catalog[locale][key]);
    if(locale!=='en')assert.notEqual(ui.catalog[locale][key],ui.catalog.en[key],`${locale}: ${key}`);
  }
  const html=fs.readFileSync(path.join(__dirname,'../extension/options.html'),'utf8');
  assert.match(html,/href="privacy\.html"/);
  assert.doesNotMatch(html,/data-consent|revoke-consent|consentTitle|\bZDR\b/);
  assert.match(ui.t('options.directClientHint','en'),/directly from this browser to xAI/);
  assert.match(ui.t('options.directClientHint','en'),/billed to your xAI account/);
  for(const locale of ui.SUPPORTED_LANGUAGES) {
    assert.ok(Object.keys(ui.catalog[locale]).every(key=>!key.toLowerCase().includes('consent')),locale);
    assert.ok(Object.values(ui.catalog[locale]).every(value=>!value.includes('ZDR')),locale);
  }
  assert.match(ui.t('options.cacheHelp','en'),/keeping browsing history/);
});

test('provider switching preserves credential drafts and Build saves without sending a Key',async()=>{
  const fixture=uiPageFixture('options');await settleUI();await settleUI();
  const {ids}=fixture,form=ids.get('settings-form');
  ids.get('api-key').value='replacement-api-fixture';ids.get('api-key').listeners.input();
  ids.get('remember-key').checked=true;ids.get('remember-key').listeners.change();
  ids.get('api-model').value='grok-4.6';ids.get('api-model').listeners.change();ids.get('api-reasoning-effort').value='xhigh';
  ids.get('provider').value='build';ids.get('provider').listeners.change();
  assert.equal(ids.get('api-fields').hidden,true);assert.equal(ids.get('build-fields').hidden,false);
  assert.equal(ids.get('source-description').hidden,false);assert.equal(ids.get('source-description').textContent,ui.t('options.buildDescription','en'));
  for(const id of ['api-key','remember-key','clear-key'])assert.equal(ids.get(id).disabled,true,id);
  assert.equal(ids.get('build-model').value,'grok-4.3');assert.equal(ids.get('build-reasoning-effort').value,'none');
  ids.get('build-port').value='2420';ids.get('build-port').listeners.input();
  ids.get('build-model').value='grok-4.5';ids.get('build-model').listeners.change();ids.get('build-reasoning-effort').value='high';
  await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(fixture.messages.filter(message=>message.type==='SAVE_KEY').length,0);assert.equal(fixture.session.apiKey,'session-secret');
  assert.equal(ids.get('api-key').value,'replacement-api-fixture');assert.equal(fixture.local.settings.provider,'build');
  assert.equal(fixture.local.settings.buildModel,'grok-4.5');assert.equal(fixture.local.settings.buildReasoningEffort,'high');
  assert.equal(fixture.local.settings.buildTransport,'acp');assert.equal(fixture.local.settings.buildPort,2420);assert.equal(fixture.local.settings.apiModel,'grok-4.6');
  assert.equal(fixture.local.settings.apiReasoningEffort,'xhigh');
  ids.get('provider').value='api';ids.get('provider').listeners.change();
  assert.equal(ids.get('source-description').hidden,true);assert.equal(ids.get('source-description').textContent,'');
  assert.equal(ids.get('api-key').value,'replacement-api-fixture');assert.equal(ids.get('remember-key').checked,true);
  await form.listeners.submit({preventDefault(){},currentTarget:form});
  const saves=fixture.messages.filter(message=>message.type==='SAVE_KEY');assert.equal(saves.length,1);
  assert.equal(saves[0].apiKey,'replacement-api-fixture');assert.equal(saves[0].settings.provider,'api');
});

test('Build saves independently when credential security is unavailable and performs no automatic probe',async()=>{
  const fixture=uiPageFixture('options',core.normalizeSettings({provider:'build'}),{session:{apiKey:undefined}},{securityFailure:true});
  await settleUI();await settleUI();assert.equal(fixture.ids.get('save').disabled,false);
  fixture.ids.get('language').value='ja';const form=fixture.ids.get('settings-form');
  await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(fixture.local.settings.provider,'build');assert.equal(fixture.local.settings.language,'ja');
  assert.equal(fixture.messages.some(message=>['SAVE_KEY','GET_BUILD_STATUS'].includes(message.type)),false);
});

test('Build checks and official guides are explicit local actions without generation or native permissions',async()=>{
  const statuses=[
    [{errorCode:'BUILD_UNAVAILABLE',ready:false},'build.missing'],
    [{errorCode:'BUILD_CONNECTION_REQUIRED',ready:false},'build.codeRequired'],
    [{errorCode:'BUILD_AUTH_FAILED',ready:false},'build.codeInvalid'],
    [{installed:true,available:true,authenticated:false,ready:false},'build.login'],
    [{installed:true,errorCode:'BUILD_VERSION_UNSUPPORTED',ready:false},'build.unsupported'],
    [{installed:true,available:true,ready:false},'build.unavailable'],
    [{installed:true,available:true,authenticated:true,ready:true},'build.ready']
  ];
  for(const [buildStatus,key]of statuses){
    const fixture=uiPageFixture('options',core.normalizeSettings({provider:'build'}),{session:{apiKey:undefined}},{buildStatus});
    await settleUI();await settleUI();assert.equal(fixture.ids.get('build-status').textContent,ui.t('build.unknown','en'));
    assert.equal(fixture.messages.some(message=>message.type==='GET_BUILD_STATUS'),false);
    await fixture.ids.get('check-build').listeners.click();assert.equal(fixture.ids.get('build-status').textContent,ui.t(key,'en'));
    await fixture.ids.get('build-guide').listeners.click();
    assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','GET_BUILD_STATUS','OPEN_CONNECTOR_GUIDE']);
    assert.deepEqual(Array.from(fixture.permissionRequests[0].origins),['http://127.0.0.1/*']);
  }
});

test('Build catalogs constrain choices without changing API model or reasoning drafts',async()=>{
  const buildStatus={ready:true,installed:true,available:true,authenticated:true,modelCatalog:[{id:'grok-4.7',available:true,efforts:['low','high']},{id:'grok-4.5',available:false}]};
  const fixture=uiPageFixture('options',core.normalizeSettings({provider:'build',buildDefaultsVersion:1,buildModel:'grok-4.7',buildReasoningEffort:'low',apiModel:'grok-4.6',apiReasoningEffort:'xhigh'}),{}, {buildStatus});
  await settleUI();await settleUI();await fixture.ids.get('check-build').listeners.click();
  assert.equal(fixture.ids.get('api-model').value,'grok-4.6');assert.equal(fixture.ids.get('api-reasoning-effort').value,'xhigh');
  assert.deepEqual(fixture.ids.get('build-reasoning-effort').children.map(option=>option.value),['low','high']);
  assert.equal(fixture.ids.get('build-model').children.find(option=>option.value==='grok-4.5').disabled,true);
  fixture.ids.get('build-model').value='grok-4.5';fixture.ids.get('build-model').listeners.change();
  assert.match(fixture.ids.get('build-model-status').textContent,/grok-4.5/);
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(fixture.messages.some(message=>message.type==='SAVE_SETTINGS'),false);
});

test('Build locale changes and focus requests preserve provider and Key drafts',async()=>{
  const fixture=uiPageFixture('options',core.normalizeSettings({provider:'build'}),{session:{superxOptionsFocus:{id:'build',nonce:'build-focus'}}});
  await settleUI();await settleUI();assert.equal(fixture.ids.get('check-build').focused,true);
  fixture.ids.get('api-key').value='locale-key-draft';fixture.ids.get('api-key').listeners.input();
  fixture.ids.get('build-model').value='grok-4.6';fixture.ids.get('build-model').listeners.change();fixture.ids.get('build-reasoning-effort').value='xhigh';
  fixture.runtimeListeners.forEach(listener=>listener({type:'UI_LANGUAGE_CHANGED',language:'zh-CN'}));
  assert.equal(fixture.ids.get('api-key').value,'locale-key-draft');assert.equal(fixture.ids.get('provider').value,'build');
  assert.equal(fixture.ids.get('build-model').value,'grok-4.6');assert.equal(fixture.ids.get('build-reasoning-effort').value,'xhigh');
  assert.equal(fixture.ids.get('build-status').textContent,ui.t('build.unknown','zh-CN'));assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
});

test('Build popup setup and toggling use official login and never require API credentials',async()=>{
  const settings=core.normalizeSettings({provider:'build',buildTransport:'cli'});
  for(const buildStatus of [{installed:false,ready:false},{installed:true,authenticated:false,ready:false},{installed:true,available:true,ready:false}]){
    const fixture=uiPageFixture('popup',settings,{session:{apiKey:undefined}},{buildStatus});await settleUI();await settleUI();
    assert.equal(fixture.ids.get('toggle').textContent,ui.t('popup.setupBuild','en'));
    assert.notEqual(fixture.ids.get('enabled-label').textContent,ui.t('status.needsKey','en'));
    await fixture.ids.get('toggle').listeners.click();assert.equal(fixture.openedOptions[0].focus,'build');
    assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','OPEN_SETTINGS']);
  }
  const fixture=uiPageFixture('popup',settings,{session:{apiKey:undefined}},{buildStatus:{installed:true,available:true,authenticated:true,ready:true}});
  await settleUI();await settleUI();assert.equal(fixture.ids.get('provider-label').textContent,ui.t('popup.buildLabel','en',{transport:'CLI'}));
  await fixture.ids.get('toggle').listeners.click();assert.equal(fixture.local.settings.enabled,false);
  assert.equal(fixture.local.settings.provider,'build');assert.equal(fixture.messages.some(message=>message.type==='SAVE_KEY'),false);
});

test('provider onboarding links and all twelve locales explain Grok Inference and account usage',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../extension/options.html'),'utf8');
  for(const href of ['https://grok.com/dashboard/api-keys','https://grok.com/dashboard/usage','https://console.x.ai/','https://github.com/xai-org/grok-build'])assert.ok(html.includes(`href="${href}"`),href);
  assert.match(ui.t('options.apiSubscriptionSetup','en'),/Grok Inference.*Cursor.*Chat.*model/);
  assert.match(ui.t('options.apiKeyHint','en'),/grok.com.*xAI Console/);assert.match(ui.t('options.apiAccountHelp','en'),/site where you created/);
  assert.match(ui.t('options.connectorGuide','en'),/Windows \/ macOS/);
  for(const locale of ui.SUPPORTED_LANGUAGES)for(const key of ['options.apiKeyHint','options.apiSubscriptionSetup','options.apiAccountHelp','options.buildStep2','build.unknown','popup.setupBuild']){
    assert.ok(ui.catalog[locale][key]);if(locale!=='en')assert.notEqual(ui.catalog[locale][key],ui.catalog.en[key],`${locale}: ${key}`);
  }
});

test('saved Build model variants and concrete reasoning survive unrelated API or Build saves',async()=>{
  for(const provider of ['api','build']){
    const settings=core.normalizeSettings({provider,buildModel:'grok-4.7-build-fast',buildReasoningEffort:'high'});
    const fixture=uiPageFixture('options',settings);await settleUI();await settleUI();
    assert.equal(fixture.ids.get('build-model').value,settings.buildModel);
    assert.equal(fixture.ids.get('build-reasoning-effort').value,'high');fixture.ids.get('language').value='ja';
    const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    assert.equal(fixture.local.settings.buildModel,settings.buildModel);assert.equal(fixture.local.settings.buildReasoningEffort,'high');
    assert.equal(fixture.local.settings.language,'ja');
  }
});

test('changing local connection code resets catalog restrictions and ignores an older in-flight check',async()=>{
  const status={installed:true,available:true,authenticated:true,ready:true,modelCatalog:[{id:'grok-4.7',available:true,efforts:['low']}]};
  let resolveCheck;
  const fixture=uiPageFixture('options',core.normalizeSettings({provider:'build'}),{}, {onMessage(message){if(message.type==='GET_BUILD_STATUS')return new Promise(resolve=>{resolveCheck=resolve;});}});
  await settleUI();await settleUI();
  const first=fixture.ids.get('check-build').listeners.click();await settleUI();resolveCheck({ok:true,...status});await first;
  assert.equal(fixture.ids.get('build-model').children.find(option=>option.value==='grok-4.3').disabled,true);
  const oldCheck=fixture.ids.get('check-build').listeners.click();await settleUI();const oldResolve=resolveCheck;
  fixture.ids.get('build-secret').value='different-local-code';fixture.ids.get('build-secret').listeners.input();
  assert.equal(fixture.ids.get('build-model').children.find(option=>option.value==='grok-4.3').disabled,false);
  assert.deepEqual(fixture.ids.get('build-reasoning-effort').children.map(option=>option.value),['none','minimal','low','medium','high','xhigh']);
  oldResolve({ok:true,...status});await oldCheck;
  assert.equal(fixture.ids.get('build-status').textContent,ui.t('build.unknown','en'));
  assert.equal(fixture.ids.get('build-model').children.find(option=>option.value==='grok-4.3').disabled,false);
});

test('popup applies a fresh Build readiness broadcast without reading API credentials',async()=>{
  const settings=core.normalizeSettings({provider:'build'}),fixture=uiPageFixture('popup',settings,{session:{apiKey:undefined}});
  await settleUI();await settleUI();assert.equal(fixture.ids.get('toggle').textContent,ui.t('popup.setupBuild','en'));
  fixture.runtimeListeners.forEach(listener=>listener({type:'CONFIG',settings,ready:true,buildStatus:{installed:true,available:true,authenticated:true,ready:true}}));
  assert.equal(fixture.ids.get('toggle').textContent,ui.t('common.pause','en'));
  assert.equal(fixture.ids.get('indicator').dataset.enabled,'true');assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
});

test('Build uses the common model list and catalog availability without advertising extra IDs',async()=>{
  const buildStatus={installed:true,available:true,authenticated:true,ready:true,modelCatalog:[{id:'grok-4.3',available:true,efforts:['none','low','high']},{id:'grok-4.7',available:true,efforts:['low','high']},{id:'grok-preview-fast',available:true,efforts:['low','high']},{id:'grok-preview-custom',available:true,efforts:['medium','high']},{id:'invalid model id',available:true}]};
  const fixture=uiPageFixture('options',core.normalizeSettings({provider:'build'}),{}, {buildStatus});await settleUI();await settleUI();
  const select=fixture.ids.get('build-model');
  assert.deepEqual(select.children.map(option=>option.value),core.API_MODELS.map(model=>model.value));
  assert.equal(select.value,'grok-4.3');assert.equal(fixture.ids.get('build-fast-help').hidden,true);
  assert.equal(fixture.permissionRequests.length,0);await fixture.ids.get('check-build').listeners.click();
  assert.equal(select.value,'grok-4.3');assert.equal(fixture.ids.get('build-reasoning-effort').value,'none');
  assert.deepEqual(select.children.map(option=>option.value),core.API_MODELS.map(model=>model.value));
  assert.equal(select.children.find(option=>option.value==='grok-4.5').disabled,true);
  select.value='grok-4.7';select.listeners.change();fixture.ids.get('build-reasoning-effort').value='high';
  fixture.runtimeListeners.forEach(listener=>listener({type:'UI_LANGUAGE_CHANGED',language:'zh-CN'}));
  assert.equal(select.value,'grok-4.7');assert.equal(fixture.ids.get('build-reasoning-effort').value,'high');
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(fixture.local.settings.buildModel,'grok-4.7');assert.equal(fixture.local.settings.buildReasoningEffort,'high');
  assert.equal(fixture.local.settings.apiModel,'grok-4.3');assert.equal(fixture.messages.some(message=>message.type==='SAVE_KEY'),false);
  const reopened=uiPageFixture('options',fixture.local.settings);await settleUI();await settleUI();
  assert.equal(reopened.ids.get('build-model').value,'grok-4.7');assert.equal(reopened.ids.get('build-reasoning-effort').value,'high');
});

test('official launch commands are generated explicitly for both systems and the local code is not stored in settings',async()=>{
  for(const platform of ['windows','macos']){
    const fixture=uiPageFixture('options',core.normalizeSettings({provider:'build'}),{}, {buildConfigured:false,buildStatus:{ready:true}});await settleUI();await settleUI();
    const {ids}=fixture;assert.equal(fixture.messages.some(message=>message.type==='GET_BUILD_LAUNCH'),false);
    ids.get('build-platform').value=platform;await ids.get('generate-build-command').listeners.click();
    assert.equal(ids.get('build-secret').attrs.type,'password');assert.equal(ids.get('build-secret').value,'local-connection-fixture-code');
    assert.match(ids.get('build-command').textContent,new RegExp(platform));assert.equal(ids.get('build-launch').hidden,false);
    assert.equal(fixture.messages.some(message=>['SAVE_BUILD_CONNECTION','GET_BUILD_STATUS','SAVE_KEY'].includes(message.type)),false);
    await ids.get('check-build').listeners.click();const probe=fixture.messages.find(message=>message.type==='GET_BUILD_STATUS');assert.equal(probe.secret,'local-connection-fixture-code');
    const form=ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    const save=fixture.messages.find(message=>message.type==='SAVE_BUILD_CONNECTION');assert.equal(save.secret,'local-connection-fixture-code');assert.equal(save.port,2419);
    assert.equal(JSON.stringify(fixture.local.settings).includes(save.secret),false);assert.equal(ids.get('build-secret').value,'');assert.equal(ids.get('build-launch').hidden,true);
    assert.equal(fixture.permissionRequests.length,2);for(const request of fixture.permissionRequests)assert.deepEqual(Array.from(request.origins),['http://127.0.0.1/*']);assert.equal(fixture.session.apiKey,'session-secret');
  }
});

test('a saved local code is reused without exposing it to the form and forgetting it leaves the API Key usable',async()=>{
  const fixture=uiPageFixture('options',core.normalizeSettings({provider:'build'}));await settleUI();await settleUI();const {ids}=fixture;
  assert.equal(ids.get('build-secret').value,'');assert.match(ids.get('build-secret').placeholder,/Saved/);
  const form=ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  const save=fixture.messages.find(message=>message.type==='SAVE_SETTINGS');assert.ok(save);assert.equal(Object.hasOwn(save,'secret'),false);assert.equal(fixture.permissionRequests.length,0);
  await ids.get('clear-build-connection').listeners.click();assert.equal(fixture.session.apiKey,'session-secret');
  assert.equal(fixture.messages.filter(message=>message.type==='CLEAR_BUILD_CONNECTION').length,1);
  assert.equal(fixture.messages.some(message=>message.type==='SAVE_KEY'),false);assert.equal(ids.get('clear-build-connection').hidden,true);
  ids.get('build-port').value='2420';ids.get('build-port').listeners.input();
  await form.listeners.submit({preventDefault(){},currentTarget:form});assert.equal(ids.get('status').textContent,ui.t('options.checkFields','en'));assert.equal(ids.get('build-status').textContent,ui.t('build.codeRequired','en'));assert.equal(ids.get('build-secret').focused,true);
});

test('both modes and all twelve locales offer official setup without an extra SuperX installer or native permission prompt',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../extension/options.html'),'utf8'),guide=fs.readFileSync(path.join(__dirname,'../extension/setup.html'),'utf8');
  assert.doesNotMatch(html,/id="build-transport"|nativeMessaging|SuperX.connector/i);assert.doesNotMatch(guide,/SuperX-Connector|install-windows|install-macos|nativeMessaging/);
  assert.match(guide,/github.com\/xai-org\/grok-build/);assert.match(ui.t('options.providerBuild','en'),/Grok Build/);assert.match(ui.t('options.providerBuild','en'),/CLI \/ ACP/);
  for(const locale of ui.SUPPORTED_LANGUAGES)for(const key of ['build.platform','build.generate','build.commandHelp','build.localPrivacy','build.code','build.codeHelp','build.codeRequired','build.codeInvalid','build.savedCode','build.setupIntro']){
    assert.ok(ui.catalog[locale][key]);if(locale!=='en')assert.notEqual(ui.catalog[locale][key],ui.catalog.en[key],locale+': '+key);
  }
  assert.match(ui.t('options.providerIntro','en'),/scrolling stops/);assert.match(ui.t('options.providerIntro','en'),/visible.*configured time/);assert.match(ui.t('popup.buildHint','en'),/configured.*one task at a time/);
  assert.match(ui.t('build.codeHelp','en'),/not your Grok account password/);assert.match(ui.t('build.commandHelp','en'),/PowerShell.*Windows.*Terminal.*macOS/);
  assert.match(ui.t('build.commandHelp','en'),/Ctrl\+C/);assert.match(ui.t('build.cancelUnconfirmed','en'),/Ctrl\+C/);
});

test('erasing a replacement local code keeps the saved code and setup cannot save before checking',async()=>{
  const fixture=uiPageFixture('options',core.normalizeSettings({provider:'build'}));await settleUI();await settleUI();const {ids}=fixture;
  ids.get('build-secret').value='replacement-local-code';ids.get('build-secret').listeners.input();ids.get('build-secret').value='';ids.get('build-secret').listeners.input();
  await ids.get('check-build').listeners.click();assert.equal(Object.hasOwn(fixture.messages.find(message=>message.type==='GET_BUILD_STATUS'),'secret'),false);
  const form=ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});assert.equal(Object.hasOwn(fixture.messages.find(message=>message.type==='SAVE_SETTINGS'),'secret'),false);assert.equal(fixture.messages.some(message=>message.type==='SAVE_BUILD_CONNECTION'),false);
  const guide=uiPageFixture('setup',API_UI_SETTINGS,{}, {buildConfigured:false,buildStatus:{ready:true}});await settleUI();await settleUI();
  assert.equal(guide.ids.get('save').disabled,true);await guide.ids.get('save').listeners.click();assert.equal(guide.messages.some(message=>message.type==='SAVE_BUILD_CONNECTION'),false);
  await guide.ids.get('generate').listeners.click();await guide.ids.get('check').listeners.click();assert.equal(guide.ids.get('save').disabled,false);
  await guide.ids.get('save').listeners.click();const saved=guide.messages.find(message=>message.type==='SAVE_BUILD_CONNECTION');assert.equal(saved.settings.provider,'build');assert.equal(saved.settings.buildTransport,'acp');assert.equal(saved.secret,'local-connection-fixture-code');
  assert.equal(guide.session.apiKey,'session-secret');assert.equal(guide.ids.get('secret').value,'');assert.equal(guide.permissionRequests.length,2);
});

test('loopback access is requested from an explicit check and denial cannot mutate credentials or provider settings',async()=>{
  let resolvePermission;
  const fixture=uiPageFixture('options',API_UI_SETTINGS,{}, {onPermissionRequest(){return new Promise(resolve=>{resolvePermission=resolve;});}});await settleUI();await settleUI();
  const {ids}=fixture;ids.get('api-key').value='private-api-draft';ids.get('api-key').listeners.input();ids.get('provider').value='build';ids.get('provider').listeners.change();
  assert.equal(fixture.permissionRequests.length,0);const pending=ids.get('check-build').listeners.click();
  assert.equal(fixture.permissionRequests.length,1);assert.deepEqual(Array.from(fixture.permissionRequests[0].origins),['http://127.0.0.1/*']);assert.equal(fixture.messages.some(message=>message.type==='GET_BUILD_STATUS'),false);
  resolvePermission(false);await pending;assert.equal(ids.get('build-status').textContent,ui.t('build.permission','en'));assert.equal(fixture.local.settings.provider,'api');assert.equal(ids.get('api-key').value,'private-api-draft');assert.equal(fixture.session.apiKey,'session-secret');assert.equal(fixture.messages.some(message=>['SAVE_KEY','SAVE_SETTINGS','SAVE_BUILD_CONNECTION','GET_BUILD_STATUS'].includes(message.type)),false);
});

test('another setup tab refreshes only untouched local connection details and preserves a replacement draft',async()=>{
  let configured=false,port=2419;const fixture=uiPageFixture('options',core.normalizeSettings({provider:'build'}),{}, {onMessage(message){if(message.type==='GET_BUILD_CONNECTION')return Promise.resolve({ok:true,configured,port});}});await settleUI();await settleUI();
  configured=true;port=2420;for(const listener of fixture.storageListeners)listener({buildConnectionEncrypted:{newValue:{opaque:true}}},'local');await settleUI();await settleUI();
  assert.equal(Number(fixture.ids.get('build-port').value),2420);assert.match(fixture.ids.get('build-secret').placeholder,/Saved/);
  fixture.ids.get('build-secret').value='keep-private-draft';fixture.ids.get('build-secret').listeners.input();const prior=fixture.messages.filter(message=>message.type==='GET_BUILD_CONNECTION').length;
  configured=false;port=2421;for(const listener of fixture.storageListeners)listener({buildConnectionEncrypted:{newValue:undefined}},'local');await settleUI();
  assert.equal(fixture.ids.get('build-secret').value,'keep-private-draft');assert.equal(Number(fixture.ids.get('build-port').value),2420);assert.equal(fixture.messages.filter(message=>message.type==='GET_BUILD_CONNECTION').length,prior);
});

test('guided setup retains an unavailable saved model until the user explicitly selects a supported choice',async()=>{
  const modelCatalog=[{id:'grok-4.6',efforts:['minimal','low','high']},{id:'grok-4.5',available:false},{id:'invalid model id'}];
  const fixture=uiPageFixture('setup',core.normalizeSettings({buildModel:'grok-4.7',buildReasoningEffort:'high'}),{}, {buildStatus:{ready:true,modelCatalog}});await settleUI();await settleUI();
  assert.equal(fixture.ids.get('model-choices').hidden,true);assert.equal(fixture.ids.get('save').disabled,true);
  await fixture.ids.get('check').listeners.click();assert.equal(fixture.ids.get('model-choices').hidden,false);assert.equal(fixture.ids.get('model').value,'grok-4.7');assert.deepEqual(fixture.ids.get('model').children.map(option=>option.value),core.API_MODELS.map(item=>item.value));
  assert.equal(fixture.ids.get('model').children.find(option=>option.value==='grok-4.7').disabled,true);assert.equal(fixture.ids.get('reasoning').value,'high');assert.equal(fixture.ids.get('reasoning').children.find(option=>option.value==='high').disabled,true);assert.equal(fixture.ids.get('save').disabled,true);
  await fixture.ids.get('save').listeners.click();assert.equal(fixture.messages.some(message=>message.type==='SAVE_BUILD_CONNECTION'),false);
  fixture.ids.get('model').value='grok-4.6';fixture.ids.get('model').listeners.change();assert.deepEqual(fixture.ids.get('reasoning').children.map(option=>option.value),['minimal','low','high']);assert.equal(fixture.ids.get('reasoning').value,'high');
  fixture.ids.get('reasoning').value='minimal';fixture.ids.get('reasoning').listeners.change();
  await fixture.ids.get('save').listeners.click();const saved=fixture.messages.find(message=>message.type==='SAVE_BUILD_CONNECTION');assert.equal(saved.settings.buildModel,'grok-4.6');assert.equal(saved.settings.buildReasoningEffort,'minimal');assert.equal(saved.settings.apiModel,'grok-4.3');assert.equal(saved.settings.apiReasoningEffort,'none');
});

test('guided setup preserves an available saved model and reasoning and never saves without a valid catalog',async()=>{
  const modelCatalog=[{id:'grok-4.6',efforts:['minimal','low']},{id:'grok-4.5',efforts:['low','high']}];
  const fixture=uiPageFixture('setup',core.normalizeSettings({buildModel:'grok-4.5',buildReasoningEffort:'high'}),{}, {buildStatus:{ready:true,modelCatalog}});await settleUI();await settleUI();await fixture.ids.get('check').listeners.click();
  assert.equal(fixture.ids.get('model').value,'grok-4.5');assert.equal(fixture.ids.get('reasoning').value,'high');fixture.ids.get('model').value='grok-4.6';fixture.ids.get('model').listeners.change();assert.equal(fixture.ids.get('reasoning').value,'low');
  fixture.ids.get('port').value=2420;fixture.ids.get('port').listeners.input();assert.equal(fixture.ids.get('model-choices').hidden,true);assert.equal(fixture.ids.get('save').disabled,true);
  const noModels=uiPageFixture('setup',API_UI_SETTINGS,{}, {buildStatus:{ready:true,modelCatalog:[]}});await settleUI();await settleUI();await noModels.ids.get('check').listeners.click();assert.equal(noModels.ids.get('save').disabled,true);await noModels.ids.get('save').listeners.click();assert.equal(noModels.messages.some(message=>message.type==='SAVE_BUILD_CONNECTION'),false);
});

test('fresh Settings and guided setup retain Grok 4.3 without reasoning through check, save and reopen without an API Key',async()=>{
  for(const file of ['options','setup']){
    const environment={buildStatus:{ready:true,installed:true,available:true,authenticated:true}},fixture=uiPageFixture(file,API_UI_SETTINGS,{session:{apiKey:undefined}},environment);await settleUI();await settleUI();
    const modelId=file==='options'?'build-model':'model',effortId=file==='options'?'build-reasoning-effort':'reasoning',checkId=file==='options'?'check-build':'check';
    if(file==='options'){
      fixture.ids.get('provider').value='build';fixture.ids.get('provider').listeners.change();
      assert.equal(fixture.ids.get('api-model').value,'grok-4.3');assert.equal(fixture.ids.get('api-reasoning-effort').value,'none');
    }
    await fixture.ids.get(checkId).listeners.click();
    assert.equal(fixture.ids.get(modelId).value,'grok-4.3');assert.equal(fixture.ids.get(effortId).value,'none');assert.notEqual(fixture.ids.get(effortId).children.find(option=>option.value==='none').disabled,true);
    if(file==='options'){const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});}else await fixture.ids.get('save').listeners.click();
    const saved=fixture.messages.find(message=>message.type===(file==='options'?'SAVE_SETTINGS':'SAVE_BUILD_CONNECTION'));assert.ok(saved,file);assert.equal(saved.settings.buildModel,'grok-4.3');assert.equal(saved.settings.buildReasoningEffort,'none');assert.equal(saved.settings.buildDefaultsVersion,1);assert.equal(saved.settings.apiModel,'grok-4.3');assert.equal(saved.settings.apiReasoningEffort,'none');assert.equal(fixture.session.apiKey,undefined);assert.equal(fixture.messages.some(message=>message.type==='SAVE_KEY'),false);
    const reopened=uiPageFixture(file,fixture.local.settings,{session:{apiKey:undefined}},environment);await settleUI();await settleUI();await reopened.ids.get(checkId).listeners.click();
    assert.equal(reopened.ids.get(modelId).value,'grok-4.3');assert.equal(reopened.ids.get(effortId).value,'none');assert.equal(reopened.local.settings.buildDefaultsVersion,1);assert.equal(reopened.messages.some(message=>['SAVE_KEY','SAVE_SETTINGS','SAVE_BUILD_CONNECTION'].includes(message.type)),false);
  }
});

test('Settings never substitutes a missing Grok 4.3 or unsupported no-reasoning choice without a user model change',async()=>{
  for(const missing of ['model','effort']){
    const modelCatalog=[...(missing==='effort'?[{id:'grok-4.3',efforts:['minimal','low','high']}]:[]),{id:'grok-4.7',efforts:['low','high']}];
    const fixture=uiPageFixture('options',core.normalizeSettings({provider:'build',enabled:false,apiModel:'grok-4.6',apiReasoningEffort:'xhigh'}),{}, {buildStatus:{ready:true,modelCatalog}});await settleUI();await settleUI();
    const {ids}=fixture,form=ids.get('settings-form');ids.get('api-key').value='unsupported-model-key-draft';ids.get('api-key').listeners.input();await ids.get('check-build').listeners.click();
    assert.equal(ids.get('build-model').value,'grok-4.3');assert.equal(ids.get('build-reasoning-effort').value,'none');
    const blocked=missing==='model'?ids.get('build-model').children.find(option=>option.value==='grok-4.3'):ids.get('build-reasoning-effort').children.find(option=>option.value==='none');assert.equal(blocked.disabled,true,missing);
    assert.equal(ids.get('build-model-status').textContent,ui.t(missing==='model'?'options.buildModelUnavailable':'options.reasoningInvalid','en',{model:'grok-4.3'}));
    ids.get('enabled').checked=true;
    await form.listeners.submit({preventDefault(){},currentTarget:form});assert.equal(fixture.messages.some(message=>['SAVE_SETTINGS','SAVE_BUILD_CONNECTION'].includes(message.type)),false);assert.equal(ids.get(missing==='model'?'build-model':'build-reasoning-effort').focused,true);
    fixture.runtimeListeners.forEach(listener=>listener({type:'UI_LANGUAGE_CHANGED',language:'zh-CN'}));ids.get('provider').value='api';ids.get('provider').listeners.change();ids.get('provider').value='build';ids.get('provider').listeners.change();
    assert.equal(ids.get('build-model').value,'grok-4.3');assert.equal(ids.get('build-reasoning-effort').value,'none');assert.equal(ids.get('api-key').value,'unsupported-model-key-draft');
    ids.get('build-model').value='grok-4.7';ids.get('build-model').listeners.change();assert.equal(ids.get('build-reasoning-effort').value,'low');
    await form.listeners.submit({preventDefault(){},currentTarget:form});const saved=fixture.messages.find(message=>message.type==='SAVE_SETTINGS');assert.ok(saved);assert.equal(saved.settings.buildModel,'grok-4.7');assert.equal(saved.settings.buildReasoningEffort,'low');assert.equal(saved.settings.buildDefaultsVersion,1);assert.equal(saved.settings.apiModel,'grok-4.6');assert.equal(saved.settings.apiReasoningEffort,'xhigh');assert.equal(ids.get('api-key').value,'unsupported-model-key-draft');assert.equal(fixture.messages.some(message=>message.type==='SAVE_KEY'),false);
  }
});

test('guided setup preserves unavailable defaults and blocks Save until an explicit supported model or reasoning choice',async()=>{
  for(const missing of ['model','effort']){
    const modelCatalog=[...(missing==='effort'?[{id:'grok-4.3',efforts:['minimal','low','high']}]:[]),{id:'grok-4.7',efforts:['low','high']}];
    const fixture=uiPageFixture('setup',API_UI_SETTINGS,{session:{apiKey:undefined}}, {buildStatus:{ready:true,modelCatalog}});await settleUI();await settleUI();await fixture.ids.get('check').listeners.click();
    const {ids}=fixture;assert.equal(ids.get('model').value,'grok-4.3');assert.equal(ids.get('reasoning').value,'none');assert.equal(ids.get('save').disabled,true);
    assert.equal(ids.get('status').textContent,ui.t(missing==='model'?'options.buildModelUnavailable':'options.reasoningInvalid','en',{model:'grok-4.3'}));
    const blocked=missing==='model'?ids.get('model').children.find(option=>option.value==='grok-4.3'):ids.get('reasoning').children.find(option=>option.value==='none');assert.equal(blocked.disabled,true);
    await ids.get('save').listeners.click();assert.equal(fixture.messages.some(message=>message.type==='SAVE_BUILD_CONNECTION'),false);
    ids.get('model').value='grok-4.7';ids.get('model').listeners.change();assert.equal(ids.get('reasoning').value,'low');assert.equal(ids.get('save').disabled,false);
    await ids.get('save').listeners.click();const saved=fixture.messages.find(message=>message.type==='SAVE_BUILD_CONNECTION');assert.ok(saved);assert.equal(saved.settings.buildModel,'grok-4.7');assert.equal(saved.settings.buildReasoningEffort,'low');assert.equal(saved.settings.buildDefaultsVersion,1);assert.equal(saved.settings.apiModel,'grok-4.3');assert.equal(saved.settings.apiReasoningEffort,'none');assert.equal(fixture.session.apiKey,undefined);assert.equal(fixture.messages.some(message=>message.type==='SAVE_KEY'),false);
  }
});

test('Build reasoning choices use concrete ACP levels independently of API model profiles',async()=>{
  const fixture=uiPageFixture('options',core.normalizeSettings({provider:'build',buildModel:'grok-4.3'}));await settleUI();await settleUI();
  assert.deepEqual(fixture.ids.get('build-reasoning-effort').children.map(option=>option.value),['none','minimal','low','medium','high','xhigh']);assert.equal(fixture.ids.get('build-reasoning-effort').value,'none');assert.equal(fixture.ids.get('api-reasoning-effort').value,'none');
  for(const language of ui.SUPPORTED_LANGUAGES){assert.ok(ui.catalog[language]['options.reasoning.minimal']);assert.ok(ui.catalog[language]['build.chooseModel']);}
  const html=fs.readFileSync(path.join(__dirname,'../extension/setup.html'),'utf8');for(const id of ['model','reasoning'])assert.match(html,new RegExp('<select id="'+id+'" required'));
});

const optionsDiagnosticRecord=()=>({recordedAt:1792152000000,code:'API_ERROR',apiKey:'ENTRY_PRIVATE_KEY',post:'ENTRY_PRIVATE_POST',verificationFailure:{stage:'verify',code:'ACCESS',errorCode:'API_ERROR',httpStatus:402,providerCode:'spending_limit',prompt:'DIAGNOSTIC_PRIVATE_PROMPT'},requestDiagnostics:{failureOrigin:'http',transportStatus:402,requestId:'123e4567-e89b-12d3-a456-426614174000',responseId:'123e4567-e89b-12d3-a456-426614174001',providerMessage:'<img src=x onerror=alert(1)> Spending limit reached; '+['xai','privatefixturetoken'].join('-')+'0'.repeat(19),startedAt:1792151999800,failedAt:1792152000000,elapsedMs:200,requestedModel:'grok-4.3',requestedEffort:'none',apiKey:'DIAGNOSTIC_PRIVATE_KEY',post:'DIAGNOSTIC_PRIVATE_POST',prompt:'DIAGNOSTIC_PRIVATE_PROMPT'}});

test('local API diagnostics load only on explicit expansion and render a safe JSON snapshot as text',async()=>{
  const record=optionsDiagnosticRecord(),fixture=uiPageFixture('options',API_UI_SETTINGS,{}, {onMessage(message){if(message.type==='GET_API_DIAGNOSTICS')return Promise.resolve({ok:true,entries:[record],retentionHours:24,maxEntries:30});}});await settleUI();await settleUI();
  assert.equal(fixture.messages.some(message=>message.type==='GET_API_DIAGNOSTICS'),false);assert.equal(fixture.ids.get('diagnostics-copy').disabled,true);
  fixture.ids.get('diagnostics-summary').listeners.click();await settleUI();await settleUI();
  const text=fixture.ids.get('diagnostics-output').textContent,shown=JSON.parse(text);assert.equal(shown.length,1);assert.equal(shown[0].requestDiagnostics.transportStatus,402);assert.equal(shown[0].requestDiagnostics.requestedModel,'grok-4.3');assert.match(text,/<img src=x onerror=alert\(1\)>/);assert.doesNotMatch(text,/ENTRY_PRIVATE_|DIAGNOSTIC_PRIVATE_|xai-privatefixture/);
  assert.deepEqual(shown[0].verificationFailure,{stage:'verify',code:'ACCESS',errorCode:'API_ERROR',httpStatus:402,providerCode:'spending_limit'});
  assert.equal(fixture.ids.get('diagnostics-output').children.length,0);assert.equal(fixture.ids.get('diagnostics-output').hidden,false);assert.equal(fixture.ids.get('diagnostics-copy').disabled,false);
  assert.equal(fixture.messages.filter(message=>message.type==='GET_API_DIAGNOSTICS').length,1);assert.equal(fixture.messages.some(message=>['SAVE_KEY','SAVE_SETTINGS','SAVE_BUILD_CONNECTION','ANALYZE','GENERATE_COMMENTS'].includes(message.type)),false);
  const html=fs.readFileSync(path.join(__dirname,'../extension/options.html'),'utf8');assert.match(html,/<details id="api-diagnostics"[^>]*>/);assert.doesNotMatch(html,/<details id="api-diagnostics"[^>]*\bopen\b/);
});

test('copying and clearing diagnostics are explicit actions that preserve Key, settings, cache and history',async()=>{
  let entries=[optionsDiagnosticRecord()],copied;
  const fixture=uiPageFixture('options',API_UI_SETTINGS,{}, {onCopy(value){copied=value;},onMessage(message){if(message.type==='GET_API_DIAGNOSTICS')return {ok:true,entries};if(message.type==='CLEAR_API_DIAGNOSTICS'){entries=[];return {ok:true};}}});await settleUI();await settleUI();await fixture.ids.get('diagnostics-refresh').listeners.click();
  const before=fixture.ids.get('diagnostics-output').textContent;assert.equal(copied,undefined);await fixture.ids.get('diagnostics-copy').listeners.click();assert.equal(copied,before);assert.equal(fixture.ids.get('diagnostics-status').textContent,ui.t('options.diagnosticsCopied','en'));
  await fixture.ids.get('diagnostics-clear').listeners.click();assert.equal(fixture.ids.get('diagnostics-output').textContent,'');assert.equal(fixture.ids.get('diagnostics-output').hidden,true);assert.equal(fixture.ids.get('diagnostics-copy').disabled,true);assert.equal(fixture.ids.get('diagnostics-status').textContent,ui.t('options.diagnosticsEmpty','en'));
  assert.equal(fixture.session.apiKey,'session-secret');assert.equal(fixture.local.settings,API_UI_SETTINGS);assert.equal(fixture.messages.some(message=>['CLEAR_CACHE','CLEAR_HISTORY','SAVE_KEY','SAVE_SETTINGS','SET_HISTORY_ENABLED'].includes(message.type)),false);assert.equal(fixture.messages.filter(message=>message.type==='CLEAR_API_DIAGNOSTICS').length,1);
});

test('diagnostic loading, failures and locale changes remain local and do not replace form drafts',async()=>{
  let resolveLogs,fail=false;
  const fixture=uiPageFixture('options',API_UI_SETTINGS,{}, {copyFailure:true,onMessage(message){if(message.type==='GET_API_DIAGNOSTICS')return fail?{ok:false}:new Promise(resolve=>{resolveLogs=resolve;});}});await settleUI();await settleUI();
  fixture.ids.get('api-key').value='keep-unsaved-api-draft';fixture.ids.get('api-key').listeners.input();const pending=fixture.ids.get('diagnostics-refresh').listeners.click();assert.equal(fixture.ids.get('diagnostics-status').textContent,ui.t('common.loading','en'));assert.equal(fixture.ids.get('diagnostics-refresh').disabled,true);await fixture.ids.get('diagnostics-refresh').listeners.click();assert.equal(fixture.messages.filter(message=>message.type==='GET_API_DIAGNOSTICS').length,1);
  resolveLogs({ok:true,entries:[optionsDiagnosticRecord()]});await pending;const before=fixture.ids.get('diagnostics-output').textContent;
  fixture.runtimeListeners.forEach(listener=>listener({type:'UI_LANGUAGE_CHANGED',language:'zh-CN'}));assert.equal(fixture.ids.get('diagnostics-output').textContent,before);assert.equal(fixture.ids.get('api-key').value,'keep-unsaved-api-draft');assert.equal(fixture.messages.filter(message=>message.type==='GET_API_DIAGNOSTICS').length,1);
  await fixture.ids.get('diagnostics-copy').listeners.click();assert.equal(fixture.ids.get('diagnostics-status').textContent,ui.t('common.copyFailed','zh-CN'));
  fail=true;await fixture.ids.get('diagnostics-refresh').listeners.click();assert.equal(fixture.ids.get('diagnostics-status').textContent,ui.t('options.diagnosticsUnavailable','zh-CN'));assert.equal(fixture.ids.get('api-key').value,'keep-unsaved-api-draft');assert.equal(fixture.ids.get('diagnostics-refresh').disabled,false);
});

test('diagnostics are bounded and malformed snapshots or failed clears cannot expose stale private fields',async()=>{
  let mode='many';const records=Array.from({length:40},()=>optionsDiagnosticRecord());
  const fixture=uiPageFixture('options',API_UI_SETTINGS,{}, {onMessage(message){if(message.type==='GET_API_DIAGNOSTICS')return {ok:true,entries:mode==='many'?records:{apiKey:'PRIVATE_FAILURE'}};if(message.type==='CLEAR_API_DIAGNOSTICS')return {ok:false};}});await settleUI();await settleUI();await fixture.ids.get('diagnostics-refresh').listeners.click();assert.equal(JSON.parse(fixture.ids.get('diagnostics-output').textContent).length,30);
  await fixture.ids.get('diagnostics-clear').listeners.click();assert.equal(fixture.ids.get('diagnostics-output').textContent,'');assert.equal(fixture.ids.get('diagnostics-copy').disabled,true);assert.equal(fixture.ids.get('diagnostics-status').textContent,ui.t('options.diagnosticsUnavailable','en'));
  mode='malformed';await fixture.ids.get('diagnostics-refresh').listeners.click();assert.equal(fixture.ids.get('diagnostics-status').textContent,ui.t('options.diagnosticsUnavailable','en'));assert.doesNotMatch(fixture.ids.get('diagnostics-output').textContent,/PRIVATE_FAILURE/);
});

test('diagnostic logs preserve stream error classification without inventing an HTTP status',async()=>{
  const record=optionsDiagnosticRecord();record.requestDiagnostics.failureOrigin='stream';record.requestDiagnostics.transportStatus=200;record.verificationFailure={stage:'verify',code:'ACCESS',errorCode:'API_ERROR',providerCode:'spending_limit',reason:'max_output_tokens',apiKey:'PRIVATE_VF_KEY'};
  const fixture=uiPageFixture('options',API_UI_SETTINGS,{}, {onMessage(message){if(message.type==='GET_API_DIAGNOSTICS')return {ok:true,entries:[record]};}});await settleUI();await settleUI();await fixture.ids.get('diagnostics-refresh').listeners.click();const shown=JSON.parse(fixture.ids.get('diagnostics-output').textContent)[0];
  assert.equal(shown.requestDiagnostics.transportStatus,200);assert.equal(shown.requestDiagnostics.failureOrigin,'stream');assert.equal(shown.verificationFailure.providerCode,'spending_limit');assert.equal(shown.verificationFailure.reason,'max_output_tokens');assert.equal(Object.hasOwn(shown.verificationFailure,'httpStatus'),false);assert.equal(Object.hasOwn(shown.verificationFailure,'apiKey'),false);
});

test('Settings diagnostics retain a local capacity classification without inventing upstream codes or statuses',async()=>{
  const record=optionsDiagnosticRecord();record.code='API_CAPACITY';record.requestDiagnostics.failureOrigin='stream';record.requestDiagnostics.transportStatus=200;
  record.requestDiagnostics.providerMessage='The model is currently at capacity due to high demand.';
  record.verificationFailure={stage:'verify',code:'SERVER',errorCode:'API_CAPACITY',privateField:'PRIVATE_CAPACITY_FIELD'};
  const fixture=uiPageFixture('options',API_UI_SETTINGS,{}, {onMessage(message){if(message.type==='GET_API_DIAGNOSTICS')return {ok:true,entries:[record]};}});
  await settleUI();await settleUI();await fixture.ids.get('diagnostics-refresh').listeners.click();
  const shown=JSON.parse(fixture.ids.get('diagnostics-output').textContent)[0];
  assert.equal(shown.code,'API_CAPACITY');assert.equal(shown.requestDiagnostics.transportStatus,200);
  assert.deepEqual(shown.verificationFailure,{stage:'verify',code:'SERVER',errorCode:'API_CAPACITY'});
  assert.doesNotMatch(JSON.stringify(shown),/PRIVATE_CAPACITY_FIELD|ENTRY_PRIVATE_|DIAGNOSTIC_PRIVATE_/);
});

test('reading defaults migrate once while later explicit immediate analysis and concurrency four survive normalization',()=>{
  for(const legacy of [{},{dwellMs:0,apiConcurrency:4},{dwellMs:0,apiConcurrency:4,analysisDefaultsVersion:0}]){
    const migrated=core.normalizeSettings(legacy);assert.equal(migrated.analysisDefaultsVersion,1);assert.equal(migrated.dwellMs,1000);assert.equal(migrated.apiConcurrency,3);assert.deepEqual(core.normalizeSettings(migrated),migrated);
  }
  for(const legacy of [{dwellMs:750,apiConcurrency:2},{dwellMs:2300,apiConcurrency:7}]){
    const migrated=core.normalizeSettings(legacy);assert.equal(migrated.dwellMs,legacy.dwellMs);assert.equal(migrated.apiConcurrency,legacy.apiConcurrency);
  }
  const manual=core.normalizeSettings({...core.DEFAULT_SETTINGS,dwellMs:0,apiConcurrency:4});assert.equal(manual.dwellMs,0);assert.equal(manual.apiConcurrency,4);assert.deepEqual(core.normalizeSettings(manual),manual);
  for(const [value,expected]of [[-1,0],[30001,30000],[Infinity,1000],[NaN,1000]])assert.equal(core.normalizeSettings({...core.DEFAULT_SETTINGS,dwellMs:value}).dwellMs,expected);
});

test('Settings viewing-time control saves seconds as milliseconds and keeps explicit immediate analysis across reopening',async()=>{
  for(const [seconds,milliseconds]of [['0',0],['0.25',250],['2.5',2500],['30',30000]]){
    const fixture=uiPageFixture('options');await settleUI();await settleUI();
    assert.equal(fixture.ids.get('analysis-dwell').value,1);assert.equal(fixture.ids.get('api-concurrency').value,3);
    fixture.ids.get('analysis-dwell').value=seconds;fixture.ids.get('api-concurrency').value='4';fixture.ids.get('analysis-dwell').listeners.input();
    assert.equal(fixture.ids.get('status').textContent,ui.t('options.unsavedChanges','en'));
    const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    assert.equal(fixture.local.settings.dwellMs,milliseconds);assert.equal(fixture.local.settings.apiConcurrency,4);assert.equal(fixture.local.settings.analysisDefaultsVersion,1);
    const reopened=uiPageFixture('options',fixture.local.settings);await settleUI();await settleUI();assert.equal(Number(reopened.ids.get('analysis-dwell').value),Number(seconds));assert.equal(reopened.ids.get('api-concurrency').value,4);
  }
});

test('Settings uses one Key flow with expanded account-specific help and the existing reading controls',async()=>{
  const fixture=uiPageFixture('options');await settleUI();await settleUI();
  for(const [id,min,max,step]of [['api-concurrency','1','8','1'],['analysis-dwell','0','30','any']]){
    const input=fixture.ids.get(id);assert.equal(input.getAttribute('min'),min);assert.equal(input.getAttribute('max'),max);assert.equal(input.getAttribute('step'),step);
  }
  const html=fs.readFileSync(path.join(__dirname,'../extension/options.html'),'utf8');
  const apiSection=html.slice(html.indexOf('id="api-fields"'),html.indexOf('id="oauth-fields"'));
  for(const [key,url]of [['options.apiSubscriptionLink','https://grok.com/dashboard/api-keys'],['options.dashboardUsage','https://grok.com/dashboard/usage'],['options.apiMeteredLink','https://console.x.ai/']]){
    assert.equal(apiSection.split('href="'+url+'"').length-1,1);assert.ok(apiSection.includes('data-i18n="'+key+'"'));
  }
  assert.match(html,/<details[^>]*id="api-access-guide"[^>]*\bopen\b/);
  assert.doesNotMatch(html,/options\.(?:providerIntro|uiHint|apiPriorityHelp|apiPriorityLink|apiDirectHint|keyStorageHelp|console|apiStep[123])/);
  assert.ok(html.indexOf('id="api-key"')<html.indexOf('id="api-access-guide"'));assert.ok(html.indexOf('id="clear-key"')<html.indexOf('id="api-model"'));
  assert.equal(fixture.ids.get('source-description').hidden,true);assert.equal(fixture.ids.get('source-description').textContent,'');
  assert.equal(fixture.messages.some(message=>/PRIORITY|TIER|UPGRADE|BILLING/.test(message.type)),false);
});

test('OAuth settings select an explicit third provider with independent model reasoning and remember defaults',()=>{
  const initial=core.normalizeSettings({provider:'oauth'});
  assert.equal(initial.provider,'oauth');assert.equal(initial.oauthModel,'grok-4.3');assert.equal(initial.oauthReasoningEffort,'none');assert.equal(initial.oauthRemember,true);
  const selected=core.normalizeSettings({provider:'oauth',oauthModel:'grok-4.6',oauthReasoningEffort:'xhigh',oauthRemember:false,apiModel:'grok-4.5',apiReasoningEffort:'medium',buildDefaultsVersion:1,buildModel:'grok-4.7',buildReasoningEffort:'high',accessToken:'DO_NOT_SAVE_AT',refreshToken:'DO_NOT_SAVE_RT'});
  assert.equal(selected.oauthModel,'grok-4.6');assert.equal(selected.oauthReasoningEffort,'xhigh');assert.equal(selected.oauthRemember,false);
  assert.equal(selected.apiModel,'grok-4.5');assert.equal(selected.apiReasoningEffort,'medium');assert.equal(selected.buildModel,'grok-4.7');assert.equal(selected.buildReasoningEffort,'high');
  assert.deepEqual(core.normalizeSettings(selected),selected);assert.equal(Object.hasOwn(selected,'accessToken'),false);assert.equal(Object.hasOwn(selected,'refreshToken'),false);
  for(const provider of ['api','build','oauth'])assert.equal(core.normalizeSettings({...selected,provider}).oauthModel,'grok-4.6');
  for(const provider of ['native','other','OAuth',null])assert.equal(core.normalizeSettings({provider}).provider,'api');
});

test('OAuth choices remain explicit for live catalog validation rather than inheriting API model defaults',()=>{
  for(const oauthModel of ['grok-4.7','grok-future-model']){
    const selected=core.normalizeSettings({provider:'oauth',oauthModel,oauthReasoningEffort:'none',apiModel:'grok-4.5',apiReasoningEffort:'high'});
    assert.equal(selected.oauthModel,oauthModel);assert.equal(selected.oauthReasoningEffort,'none');assert.equal(core.providerModel(selected),oauthModel);assert.equal(core.providerEffort(selected),'none');
  }
  for(const level of ['auto','none','minimal','low','medium','high','xhigh'])assert.equal(core.oauthReasoningEffort(level),level);
  assert.equal(core.oauthReasoningEffort('PRIVATE_INVALID_LEVEL'),'none');assert.equal(core.normalizeSettings({oauthModel:'invalid model'}).oauthModel,'grok-4.3');
  assert.equal(core.providerModel({provider:'api',apiModel:'grok-4.5'}),'grok-4.5');assert.equal(core.providerEffort({provider:'api',apiModel:'grok-4.5',apiReasoningEffort:'none'}),'low');
  assert.equal(core.providerModel({provider:'build',buildModel:'grok-4.7'}),'grok-4.7');assert.equal(core.providerEffort({provider:'build',buildModel:'grok-4.7',buildReasoningEffort:'minimal'}),'minimal');
});

test('full-post request identity separates API OAuth and local sources without storing credentials',()=>{
  const post={id:'100',url:'https://x.com/example/status/100',text:'The current English post',language:'en'};
  const identities=['api','oauth','build'].map(provider=>core.apiPostIdentity(post,{provider,language:'auto'}));
  assert.equal(new Set(identities).size,3);
  assert.equal(core.apiPostIdentity({...post,text:'Expanded English content'}, {provider:'oauth',language:'auto'}),identities[1]);
  assert.notEqual(core.apiPostIdentity({...post,language:'zh'}, {provider:'oauth',language:'auto'}),identities[1]);
  assert.equal(identities.some(value=>/accessToken|refreshToken/.test(value)),false);
});

test('post and reply context prompts migrate legacy custom drafts independently without replacing explicit fields',()=>{
  assert.equal(core.DEFAULT_PROMPTS.draft,core.DEFAULT_PROMPTS.replyDraft);
  const legacy={explanationMode:'custom',draftPrompt:'  Keep my legacy draft instructions.\n',verifyPrompt:'Shared core.'};
  const migrated=core.normalizeSettings(legacy);
  assert.equal(migrated.postDraftPrompt,legacy.draftPrompt);assert.equal(migrated.replyDraftPrompt,legacy.draftPrompt);assert.equal(migrated.draftPrompt,legacy.draftPrompt);
  assert.equal(Object.hasOwn(legacy,'postDraftPrompt'),false);assert.equal(Object.hasOwn(legacy,'replyDraftPrompt'),false);
  for(const field of ['postDraftPrompt','replyDraftPrompt']){
    const explicit=core.normalizeSettings({...legacy,[field]:'Explicit '+field});assert.equal(explicit[field],'Explicit '+field);
    const empty=core.normalizeSettings({...legacy,[field]:''});assert.equal(empty[field],core.DEFAULT_PROMPTS[field==='postDraftPrompt'?'postDraft':'replyDraft']);
  }
  const defaults=core.normalizeSettings({draftPrompt:core.DEFAULT_PROMPTS.draft});
  assert.equal(defaults.postDraftPrompt,core.DEFAULT_PROMPTS.postDraft);assert.equal(defaults.replyDraftPrompt,core.DEFAULT_PROMPTS.replyDraft);
  assert.notEqual(defaults.postDraftPrompt,defaults.replyDraftPrompt);
});

test('automatic analysis stays on by default and keeps an explicit manual choice',()=>{
  assert.equal(core.DEFAULT_SETTINGS.autoAnalyze,true);
  assert.equal(core.normalizeSettings({provider:'api'}).autoAnalyze,true);
  assert.equal(core.normalizeSettings({provider:'api',autoAnalyze:false}).autoAnalyze,false);
  assert.equal(core.normalizeSettings({provider:'api',autoAnalyze:'false'}).autoAnalyze,true);
});
