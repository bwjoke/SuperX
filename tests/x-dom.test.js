'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DOM = require('../extension/x-dom.js');
const Core = require('../extension/feed-core.js');

// A small DOM fixture deliberately models semantic X markup without test IDs.
// It supplies just browser-owned structure and computed style, not X internals.
class Element {
  constructor(tag, attrs = {}, children = [], text = '') {
    this.tagName = tag.toUpperCase(); this.attrs = {...attrs}; this.children = []; this.parentElement = null; this.text = text;
    this.computed = {}; this.rect = {left:0, right:0, top:0, bottom:0, width:0, height:0};
    for (const child of children) this.append(child);
  }
  append(child) { child.parentElement = this; this.children.push(child); this.adopt(child, this.ownerDocument); return child; }
  adopt(node, doc) { node.ownerDocument = doc; for (const child of node.children) this.adopt(child, doc); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  get textContent() { return this.text + this.children.map(node => node.textContent).join(''); }
  get innerText() { return this.text + this.children.map(node => node.innerText).join('\n'); }
  getBoundingClientRect() { return this.rect; }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(value => value.trim()), result = [];
    const match = (node, value) => {
      const tagName = value.match(/^[a-z]+/i)?.[0];
      if (tagName && node.tagName !== tagName.toUpperCase()) return false;
      for (const item of value.matchAll(/\[([\w-]+)(?:(\^?=)"([^"]*)")?\]/g)) {
        const actual = node.getAttribute(item[1]);
        if (actual === null || item[2] === '=' && actual !== item[3] || item[2] === '^=' && !actual.startsWith(item[3])) return false;
      }
      return true;
    };
    const visit = node => { for (const child of node.children) { if (selectors.some(value => match(child, value))) result.push(child); visit(child); } };
    visit(this); return result;
  }
}
const e = (tag, attrs, children, text) => new Element(tag, attrs, children, text);
function documentWith(...children) {
  const doc = e('document', {}, children); doc.nodeType = 9; doc.ownerDocument = doc;
  doc.defaultView = {getComputedStyle:node => ({display:'block', visibility:'visible', ...node.computed})};
  doc.adopt(doc, doc); return doc;
}
function post(id = '100', handle = 'author', text = 'Own claim.', {feed = true} = {}) {
  const timestamp = e('a', {href:`/${handle}/status/${id}`, 'data-base-ui-tooltip-trigger':''}, [], '1h');
  const author = e('div', {class:'x-middot-group'}, [
    e('a', {href:'/' + handle}, [e('img', {src:'https://pbs.twimg.com/profile_images/avatar.jpg'})]),
    e('a', {href:'/' + handle}, [], 'Display Name'), e('a', {href:'/' + handle}, [], '@' + handle), timestamp
  ]);
  const grok = e('button', {type:'button'}, [e('svg', {'data-icon':'icon-logo-grok', 'aria-hidden':'true'})]);
  const more = e('button', {type:'button'}, [e('svg', {'aria-hidden':'true'}, [e('use', {href:'#icon-more-dots-hor'})])]);
  const actions = e('div', {class:'flex items-center'}, [grok, more]);
  actions.computed = {display:'flex', flexDirection:'row'};
  const header = e('div', {class:'flex'}, [author, actions]);
  const body = e('div', {dir:'auto', class:'whitespace-pre-wrap wrap-break-word text-body', lang:'en'}, [e('span', {}, [], text)]);
  const article = e('article', {}, [header, body, e('div', {'data-engagement-action':'reply'}, [], 'Reply')]);
  const shell = e('div', {'data-navigation-stop':'', ...(feed ? {role:'link', 'data-href':`/${handle}/status/${id}`} : {tabindex:'-1'})}, [
    ...(feed ? [e('a', {'aria-hidden':'true', href:`/${handle}/status/${id}`})] : []), article
  ]);
  const row = e('li', {'data-index':'0', style:'position:absolute;transform:translateY(120px)'}, [shell]);
  return {row, shell, article, header, author, body, timestamp, grok, more, actions};
}
function quote(item) { return e('div', {'data-slot':'embedded-tweet-frame'}, [item.shell]); }

test('shared DOM helper is exposed by Core and identifies modern feed columns without test IDs', () => {
  const item = post(), main = e('main', {}, [e('div', {id:'urt:home:for-you'}, [e('ul', {}, [item.row])])]);
  main.rect = {left:100, right:702, top:0, bottom:900, width:602, height:900};
  const aside = e('aside'); aside.rect = {left:720, right:1040, top:0, bottom:900, width:320, height:900};
  const doc = documentWith(e('div', {}, [main, aside]));
  assert.equal(Core.DOM, DOM); assert.equal(DOM.primary(doc), main); assert.equal(DOM.sidebar(main), aside);
  assert.equal(DOM.isModern(item.article), true); assert.deepEqual(DOM.articles(doc), [item.article]);
  assert.equal(DOM.shell(item.article), item.shell); assert.equal(DOM.row(item.article), item.row);
});

test('legacy column and article discovery retains its existing structural behavior', () => {
  const article = e('article', {'data-testid':'tweet'}), main = e('div', {'data-testid':'primaryColumn'}, [article]);
  const aside = e('div', {'data-testid':'sidebarColumn'}), doc = documentWith(main, aside);
  assert.equal(DOM.primary(doc), main); assert.equal(DOM.sidebar(main), aside); assert.deepEqual(DOM.articles(doc), [article]);
  assert.equal(DOM.isModern(article), false);
});

test('modern top-level enumeration excludes embedded quotes, dialogs and retained hidden or inert pages', () => {
  const visible = post('1'), quoted = post('2'), hidden = post('3'), inert = post('4'), modal = post('5');
  visible.article.append(quote(quoted)); hidden.shell.setAttribute('aria-hidden', 'true'); inert.shell.setAttribute('inert', '');
  const doc = documentWith(visible.row, hidden.row, inert.row, e('div', {role:'dialog'}, [modal.row]));
  assert.deepEqual(DOM.articles(doc), [visible.article]); assert.deepEqual(DOM.quoteRoots(visible.article), [quoted.shell.parentElement]);
});

test('modern feed identity comes from its own shell and timestamp rather than the hidden permalink or quoted post', () => {
  const item = post('123'), nested = post('456', 'quoted', 'Quoted claim.'); item.article.children.unshift(quote(nested)); nested.shell.parentElement.parentElement = item.article;
  documentWith(item.row);
  assert.equal(DOM.postURL(item.article), 'https://x.com/author/status/123');
  const result = Core.extractPost(item.article);
  assert.equal(result.id, '123'); assert.equal(result.text, 'Own claim.'); assert.equal(result.quotedContext[0].id, '456');
});

test('modern detail identity does not require a data-href shell and accepts equivalent i/web aliases', () => {
  const item = post('200', 'writer', 'Detail.', {feed:false}); documentWith(item.row);
  assert.equal(DOM.postURL(item.article), 'https://x.com/writer/status/200'); assert.equal(Core.extractPost(item.article).text, 'Detail.');
  item.shell.setAttribute('data-href', '/i/web/status/200');
  assert.equal(DOM.postURL(item.article), 'https://x.com/i/web/status/200');
});

test('conflicting shell and timestamp IDs are rejected before a post can be queued', () => {
  const item = post('100'); item.timestamp.setAttribute('href', '/author/status/999'); documentWith(item.row);
  assert.equal(DOM.postURL(item.article), null); assert.equal(Core.extractPost(item.article), null); assert.deepEqual(DOM.articles(item.row), []);
});

test('a body citation alone is never treated as a modern post permalink', () => {
  const item = post('100', 'author', 'Discuss another post.', {feed:false}); delete item.timestamp.attrs['data-base-ui-tooltip-trigger'];
  item.body.append(e('a', {href:'/elsewhere/status/999', 'data-base-ui-tooltip-trigger':''}, [], 'citation')); documentWith(item.row);
  assert.equal(DOM.postURL(item.article), null); assert.equal(Core.extractPost(item.article), null);
});

test('modern extraction keeps owned authors, language and text separate from quote content', () => {
  const item = post('100', 'writer', 'Own factual claim.'), nested = post('101', 'quote', '引用文字。');
  nested.body.setAttribute('lang', 'zh-CN'); item.article.append(quote(nested)); documentWith(item.row);
  const result = Core.extractPost(item.article);
  assert.equal(result.author, 'Display Name @writer'); assert.equal(result.language, 'en');
  assert.equal(result.text, 'Own factual claim.'); assert.equal(result.quotedContext[0].language, 'zh-CN');
  assert.equal(DOM.owns(nested.body, item.article), false); assert.equal(DOM.owns(nested.body, nested.shell.parentElement), true);
});

test('detail author identity does not require a middot class and ignores body mentions', () => {
  const item = post('200', 'writer', 'Detail.', {feed:false}); item.author.setAttribute('class', 'flex items-center');
  item.body.append(e('a', {href:'/somebodyelse'}, [], '@somebodyelse'));
  documentWith(item.row);
  assert.equal(DOM.authorNode(item.article), item.author);
  assert.equal(Core.extractPost(item.article).author, 'Display Name @writer');
  item.shell.setAttribute('data-href', '/i/web/status/200');
  assert.equal(Core.extractPost(item.article).author, 'Display Name @writer');
});

test('body extraction skips hidden retained versions and nested duplicate text surfaces', () => {
  const item = post();
  item.body.children = []; item.body.append(e('span', {dir:'auto', class:'whitespace-pre-wrap'}, [], 'One current body.'));
  const hidden = e('div', {dir:'auto', class:'whitespace-pre-wrap', 'aria-hidden':'true'}, [], 'Hidden old version.');
  item.article.append(hidden); documentWith(item.row);
  assert.deepEqual(DOM.bodyNodes(item.article), [item.body]); assert.equal(Core.extractPost(item.article).text, 'One current body.');
});

test('modern media uses currentSrc and owned video poster, rejecting avatars and credentials', () => {
  const item = post(), nested = post('2');
  const image = e('img', {src:'https://pbs.twimg.com/media/stale.jpg', alt:'Current'}); image.currentSrc = 'https://pbs.twimg.com/media/fresh?format=jpg&name=small';
  item.article.append(image); item.article.append(e('video', {poster:'https://pbs.twimg.com/ext_tw_video_thumb/123/pu/img/thumb?format=jpg&name=large'}));
  item.article.append(e('img', {src:'https://user:secret@pbs.twimg.com/media/private.jpg'}));
  nested.article.append(e('img', {src:'https://pbs.twimg.com/media/quote.jpg'})); item.article.append(quote(nested)); documentWith(item.row);
  const result = Core.extractPost(item.article);
  assert.deepEqual(result.images.map(value => value.url), ['https://pbs.twimg.com/media/fresh?format=jpg', 'https://pbs.twimg.com/ext_tw_video_thumb/123/pu/img/thumb?format=jpg']);
  assert.equal(result.images[1].kind, 'video-thumbnail'); assert.equal(result.hasVideo, true);
  assert.deepEqual(result.quotedContext[0].images.map(value => value.url), ['https://pbs.twimg.com/media/quote.jpg']);
});

test('old and new post media extraction share currentSrc, posters and composer/quote boundaries', () => {
  const outputs=[];
  for(const legacy of [true,false]){
    const item=post('100'),nested=post('200','quoted','Quoted.');
    if(legacy)for(const current of [item,nested]){
      current.article.setAttribute('data-testid','tweet');current.body.setAttribute('data-testid','tweetText');current.author.setAttribute('data-testid','User-Name');
    }
    const picture=e('img',{src:'https://pbs.twimg.com/media/fallback?format=jpg',alt:'Selected photo'});
    picture.currentSrc='https://pbs.twimg.com/media/current?format=webp&name=small';
    item.article.append(picture);
    item.article.append(e('video',{poster:'https://pbs.twimg.com/amplify_video_thumb/100/img/cover?format=webp&name=medium'}));
    item.article.append(e('form',{},[e('img',{src:'https://pbs.twimg.com/media/private-draft.jpg'}),e('video',{poster:'https://pbs.twimg.com/media/private-poster.jpg'})]));
    nested.article.append(e('img',{src:'https://pbs.twimg.com/media/quote.jpg'}));item.article.append(quote(nested));documentWith(item.row);
    const result=Core.extractPost(item.article);
    assert.deepEqual(result.images.map(image=>image.url),['https://pbs.twimg.com/media/current?format=webp','https://pbs.twimg.com/amplify_video_thumb/100/img/cover?format=webp']);
    assert.equal(result.images[1].kind,'video-thumbnail');assert.equal(result.hasVideo,true);
    assert.deepEqual(result.quotedContext[0].images.map(image=>image.url),['https://pbs.twimg.com/media/quote.jpg']);
    outputs.push(result.images);
  }
  assert.deepEqual(outputs[0],outputs[1]);
});

test('legacy inline composer text and quoted drafts cannot enter a published post', () => {
  const item=post('100'),draft=post('900','draft','PRIVATE QUOTED DRAFT');
  item.article.setAttribute('data-testid','tweet');item.body.setAttribute('data-testid','tweetText');item.author.setAttribute('data-testid','User-Name');
  draft.body.setAttribute('data-testid','tweetText');
  item.article.append(e('form',{},[e('div',{'data-testid':'tweetText'},[],'PRIVATE DRAFT'),draft.article]));documentWith(item.row);
  const result=Core.extractPost(item.article);
  assert.equal(result.text,'Own claim.');assert.deepEqual(result.quotedContext,[]);
});

test('a draft form inside a published post cannot leak text, images or previews into the post', () => {
  const item = post('100'), draftPost = post('999'), form = e('form', {}, [
    e('div', {dir:'auto', class:'whitespace-pre-wrap'}, [], 'PRIVATE UNSENT DRAFT'),
    e('img', {src:'https://pbs.twimg.com/media/private-draft.jpg'}), draftPost.shell
  ]);
  item.article.append(e('div', {'data-media-upload-dropzone':''}, [form])); documentWith(item.row);
  const result = Core.extractPost(item.article);
  assert.equal(result.text, 'Own claim.'); assert.deepEqual(result.images, []);
  assert.deepEqual(DOM.articles(item.row), [item.article]);
});

test('plain modern reply preview retains snapshot text without inventing a permalink', () => {
  const preview = e('div', {}, [e('div', {class:'x-middot-group'}, [], 'Parent @parent'), e('div', {dir:'auto', class:'whitespace-pre-wrap'}, [], 'The visible parent context.')]);
  documentWith(preview); const result = Core.extractPostContext(preview);
  assert.equal(result.id, null); assert.equal(result.url, null); assert.equal(result.snapshotOnly, true);
  assert.equal(result.text, 'The visible parent context.'); assert.equal(result.author, 'Parent @parent'); assert.equal(result.username, 'parent');
});

test('plain ARTICLE quote preview inside a native form keeps its identity and WebP context media', () => {
  const item = post('300', 'source', 'Clipped quoted context.', {feed:false});
  item.author.setAttribute('class', 'flex flex-col items-start min-w-0');
  item.body.setAttribute('class', 'whitespace-pre-wrap line-clamp-5');
  item.body.computed = {webkitLineClamp:'5'}; item.body.clientHeight = 100; item.body.scrollHeight = 180;
  item.article.append(e('img', {src:'https://pbs.twimg.com/media/quoted-image?format=webp&name=small', alt:'Quoted chart'}));
  const preview = e('div', {class:'border'}, [e('div', {class:'pointer-events-none'}, [item.article])]);
  const mirror = e('div', {dir:'auto', class:'whitespace-pre-wrap'}, [], 'UNSENT USER DRAFT');
  const doc = documentWith(e('div', {role:'dialog'}, [e('form', {}, [mirror, preview])]));
  doc.location = {href:'https://x.com/compose/post'};
  const result = Core.extractPostContext(item.article);
  assert.equal(result.id, '300'); assert.equal(result.url, 'https://x.com/source/status/300');
  assert.equal(result.text, 'Clipped quoted context.'); assert.equal(result.author, 'Display Name @source');
  assert.equal(result.textTruncated, true); assert.equal(result.snapshotOnly, undefined);
  assert.deepEqual(result.images, [{url:'https://pbs.twimg.com/media/quoted-image?format=webp', alt:'Quoted chart'}]);
  assert.deepEqual(Core.extractPostContext(preview).images, result.images);
  assert.deepEqual(DOM.articles(doc), [], 'Quote preview is context, never a billable feed row');
});

test('modern context reports measured truncation and unwraps the embedded frame without borrowing outer identity', () => {
  const item = post('1'), nested = post('2', 'quote', 'Visible excerpt.'); nested.body.clientHeight = 40; nested.body.scrollHeight = 80;
  nested.body.computed = {webkitLineClamp:'2'}; const frame = quote(nested); item.article.append(frame); documentWith(item.row);
  const result = Core.extractPostContext(frame); assert.equal(result.id, '2'); assert.equal(result.textTruncated, true);
  assert.equal(result.text, 'Visible excerpt.');
});

test('native inline show-more structure marks truncation and removes only its label in every language', () => {
  for (const label of ['显示更多', 'Show more', 'Mehr anzeigen']) {
    const item = post('100', 'author', 'Visible excerpt.');
    const expander = e('button', {type:'button', class:'max-w-full text-[length:inherit] font-normal text-brand hover:underline'}, [], label);
    item.body.append(expander); documentWith(item.row);
    assert.equal(Core.extractPost(item.article).text, 'Visible excerpt.');
    assert.equal(Core.extractPostContext(item.article).textTruncated, true);
    expander.attrs.class = 'max-w-full text-brand';
    assert.equal(Core.extractPostContext(item.article).textTruncated, undefined, 'A different action is not an expander');
  }
});

test('a show-more-like article action outside its body does not mark the text truncated', () => {
  const item = post(); item.article.append(e('button', {type:'button', class:'max-w-full text-brand hover:underline'}, [], 'Other action'));
  documentWith(item.row); assert.equal(Core.extractPostContext(item.article).textTruncated, undefined);
});

test('modern controls prefer own Grok button and cannot attach to an embedded quote action', () => {
  const item = post('1'), nested = post('2'); item.article.children.unshift(quote(nested)); nested.shell.parentElement.parentElement = item.article;
  documentWith(item.row); const controls = DOM.controls(item.article);
  assert.equal(controls.reference, item.grok); assert.equal(controls.anchor, item.grok); assert.equal(controls.header, item.actions);
});

test('native timestamp tooltip anchors work without TIME and reject a stale detail main route', () => {
  const item = post('200', 'writer', 'Detail.', {feed:false}), doc = documentWith(item.row);
  doc.location = {href:'https://x.com/writer/status/200'};
  assert.equal(item.timestamp.querySelectorAll('time').length, 0);
  assert.equal(DOM.postURL(item.article), 'https://x.com/writer/status/200');
  doc.location.href = 'https://x.com/writer/status/201';
  assert.equal(DOM.postURL(item.article), null);
});

test('expanded detail timestamp after the body still identifies the main post', () => {
  const item = post('200', 'writer', 'Detail.', {feed:false});
  item.author.children = item.author.children.filter(node => node !== item.timestamp);
  item.article.append(item.timestamp); const doc = documentWith(item.row); doc.location = {href:'https://x.com/writer/status/200'};
  assert.equal(DOM.postURL(item.article), 'https://x.com/writer/status/200');
  assert.equal(Core.extractPost(item.article).id, '200');
});

test('Grok controls return the native button rather than its inner visual slot', () => {
  const item = post(), svg = item.grok.children[0];
  item.grok.children = []; item.grok.append(e('span', {class:'x-button-slot'}, [svg])); documentWith(item.row);
  assert.equal(DOM.controls(item.article).reference, item.grok);
});

test('decorative aria-hidden SVGs identify controls without accepting a hidden button or quote', () => {
  const item = post(), nested = post('200'); item.article.append(quote(nested)); documentWith(item.row);
  assert.equal(DOM.controls(item.article).reference, item.grok);
  item.grok.setAttribute('aria-hidden', 'true');
  assert.equal(DOM.controls(item.article).reference, item.more);
  item.more.setAttribute('inert', '');
  assert.equal(DOM.controls(item.article), null);
});

test('an unrelated MAIN with no timeline or verified composer is not a feed root', () => {
  const main = e('main', {}, [e('div', {role:'tablist'}, [], 'Account settings'), e('p', {}, [], 'No posts here')]);
  assert.equal(DOM.primary(documentWith(main)), null);
});

test('modern controls can anchor before more when a native Grok button is absent', () => {
  const item = post(); item.actions.children = [item.more]; documentWith(item.row);
  const controls = DOM.controls(item.article); assert.equal(controls.reference, item.more);
});

test('modern editor discovery requires a native composer form and media-dropzone ownership', () => {
  const editor = e('textarea', {'aria-multiline':'true', 'aria-autocomplete':'list', class:'text-transparent! field-sizing-content'});
  const form = e('form', {}, [editor]), zone = e('div', {'data-media-upload-dropzone':''}, [form]); documentWith(zone);
  assert.equal(DOM.isEditor(editor), true); assert.equal(DOM.form(editor), form);
  const other = e('textarea', {'aria-multiline':'true', 'aria-autocomplete':'list'}); documentWith(e('form', {}, [other]));
  assert.equal(DOM.isEditor(other), false); zone.setAttribute('inert', ''); assert.equal(DOM.isEditor(editor), false);
});

test('modern composer discovery excludes private and account routes without blocking public usernames', () => {
  const editor = e('textarea', {'aria-multiline':'true', 'aria-autocomplete':'list'});
  const doc = documentWith(e('div', {'data-media-upload-dropzone':''}, [e('form', {}, [editor])]));
  for (const path of ['/messages', '/messages/123', '/settings/profile', '/i/chat', '/i/money']) {
    doc.location = {href:'https://x.com' + path}; assert.equal(DOM.isEditor(editor), false, path);
  }
  for (const path of ['/home', '/compose/post', '/money/status/123', '/grok/status/456']) {
    doc.location = {href:'https://x.com' + path}; assert.equal(DOM.isEditor(editor), true, path);
  }
});

test('modern post discovery also rejects private routes instead of probing their post-like cards', () => {
  const item = post('100'), main = e('main', {}, [item.row]), doc = documentWith(main);
  doc.location = {href:'https://x.com/i/chat'};
  assert.deepEqual(DOM.articles(doc), []); assert.equal(DOM.primary(doc), null);
  doc.location.href = 'https://x.com/grok/status/100';
  assert.deepEqual(DOM.articles(doc), [item.article]);
});

test('page header excludes post headers and form toolbars', () => {
  const item = post(), toolbar = e('div', {role:'tablist', 'data-page-header':''}), navigation = e('div', {role:'tablist', 'data-page-header':''});
  const main = e('main', {}, [navigation, e('form', {}, [toolbar]), item.row]); documentWith(main);
  assert.equal(DOM.pageHeader(main), navigation);
});

test('quoted frames can use their own nested shell identity without a timestamp', () => {
  const item = post('1'), nested = post('2'); delete nested.timestamp.attrs['data-base-ui-tooltip-trigger'];
  const frame = quote(nested); item.article.append(frame); documentWith(item.row);
  assert.equal(Core.extractPostContext(frame).id, '2');
  assert.equal(Core.extractPost(item.article).id, '1');
});

test('a transparent retained page is excluded without treating an offscreen post as hidden', () => {
  const visible = post('1'), faded = post('2'); faded.shell.computed = {opacity:'0'};
  visible.row.rect.top = -900; visible.row.rect.bottom = -600; documentWith(visible.row, faded.row);
  assert.deepEqual(DOM.articles(visible.row.parentElement), [visible.article]);
});
