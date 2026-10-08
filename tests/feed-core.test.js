'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../extension/feed-core.js');
const ui = require('../extension/ui-i18n.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
  assert.equal(settings.dwellMs, 0);
  assert.equal(settings.cooldownMs, 0);
  assert.equal(settings.maxPerSession, 0);
  assert.equal(settings.language, 'auto');
  assert.equal(settings.apiModel, 'grok-4.3');
  assert.equal(settings.enabled, true);
});

test('old pacing limits cannot survive migration and retired providers resolve to API', () => {
  for (const provider of ['native', 'api']) {
    for (const oldValues of [{dwellMs:900,cooldownMs:3000,maxPerSession:40},
      {dwellMs:1200,cooldownMs:5000,maxPerSession:1},
      {dwellMs:Infinity,cooldownMs:-1,maxPerSession:99999}]) {
      const settings=core.normalizeSettings({provider,...oldValues,enabled:false,nativeVerification:true});
      assert.equal(settings.dwellMs,0);assert.equal(settings.cooldownMs,0);assert.equal(settings.maxPerSession,0);
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

test('API settings use bounded parallelism and early explanation while preserving explicit model choices',()=>{
  const settings=core.normalizeSettings({provider:'api'});
  assert.equal(settings.provider,'api');assert.equal(settings.apiModel,'grok-4.3');
  assert.equal(settings.apiConcurrency,4);assert.equal(settings.apiVerification,'background');
  assert.equal(settings.dwellMs,0);assert.equal(settings.cooldownMs,0);assert.equal(settings.maxPerSession,0);
  assert.equal(core.normalizeSettings({provider:'native'}).provider,'api');
  assert.equal(core.normalizeSettings({apiModel:'grok-4.7'}).apiModel,'grok-4.7');
  assert.equal(core.normalizeSettings({apiConcurrency:999,apiVerification:'made-up'}).apiConcurrency,8);
  assert.equal(core.normalizeSettings({apiConcurrency:0,apiVerification:'off'}).apiConcurrency,1);
  assert.equal(core.normalizeSettings({apiVerification:'off'}).apiVerification,'off');
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
  assert.equal(ui.t('status.analyzing','en'),'Analyzing Post...');
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
  matches() { return ['data-i18n','data-i18n-aria','data-i18n-placeholder','data-i18n-title'].some(key=>key in this.attrs); }
  querySelectorAll() { return this.children.filter(child=>child.matches()); }
  replaceChildren(...children) { this.children=[...children]; }
  append(...children) { this.children.push(...children); }
  addEventListener(name,handler) { this.listeners[name]=handler; }
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

function uiPageFixture(file, settings=core.DEFAULT_SETTINGS, storage={}, environment={}) {
  // Existing UI cases explicitly exercise the API provider.
  if(settings.provider!=='api')settings={...settings,provider:'api'};
  const html=fs.readFileSync(path.join(__dirname,'../extension',`${file}.html`),'utf8');
  const nodes=[];const ids=new Map();
  for(const tag of html.matchAll(/<[A-Za-z][\w-]*\b([^>]*)>/g)) {
    const attrs={};
    for(const attr of tag[1].matchAll(/([A-Za-z][\w-]*)=(["'])(.*?)\2/g)) attrs[attr[1]]=attr[3];
    const node=new UIElement(attrs);nodes.push(node);if(attrs.id) ids.set(attrs.id,node);
  }
  const document={documentElement:{},title:'GrokFirst',getElementById:id=>ids.get(id),createElement:()=>new UIElement(),querySelectorAll:()=>nodes.filter(node=>node.matches())};
  if(ids.has('settings-form')) ids.get('settings-form').elements=nodes;
  const messages=[],runtimeListeners=[],storageListeners=[],reads=[],openedOptions=[],openedHistory=[];
  const local={settings,uiLanguage:'en',...storage.local};
  const session={apiKey:'session-secret',...storage.session};
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
        if(message.type==='GET_HISTORY_STATUS')return {ok:true,enabled:local.superxHistoryEnabled!==false,count:0,epoch:0};
        if(message.type==='SET_HISTORY_ENABLED') {local.superxHistoryEnabled=message.enabled;return {ok:true,enabled:message.enabled};}
        if(message.type==='OPEN_HISTORY') {openedHistory.push(true);return {ok:true};}
        if(message.type==='GET_CONFIG') {
          const state=security();return {ok:true,settings:local.settings,ready:state.keyState==='ready',
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
  const context=vm.createContext({document,window:{addEventListener(){}},chrome,XGrokCore:core,GrokFirstUI:ui,navigator:{language:environment.navigatorLanguage || 'en-US'}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension',`${file}.js`),'utf8'),context);
  return {document,ids,messages,reads,runtimeListeners,storageListeners,local,session,openedOptions,openedHistory};
}
const settleUI=()=>new Promise(resolve=>setImmediate(resolve));
const uiMessageTypes=fixture=>fixture.messages.map(message=>message.type).filter(type=>!['GET_SECURITY_STATUS','GET_CONFIG','GET_HISTORY_STATUS','GET_CLI_STATUS'].includes(type));

test('Settings and popup open browsing history without needing a Key or saving analysis settings',async()=>{
  for(const file of ['options','popup']) {
    const fixture=uiPageFixture(file,core.DEFAULT_SETTINGS,{session:{apiKey:undefined}});
    await settleUI();await settleUI();
    const button=fixture.ids.get(file==='options'?'open-history':'history');
    assert.equal(Boolean(button.disabled),false);
    await button.listeners.click();
    assert.deepEqual(fixture.openedHistory,[true]);
    assert.equal(fixture.messages.some(message=>['SAVE_KEY','SAVE_SETTINGS','ANALYZE','GENERATE_COMMENTS'].includes(message.type)),false);
  }
});

test('history recording toggle applies independently and preserves unsaved prompt and language choices',async()=>{
  const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS);
  await settleUI();await settleUI();
  const language=fixture.ids.get('language');language.value='ja';
  const checkbox=fixture.ids.get('history-enabled');assert.equal(checkbox.checked,true);assert.equal(checkbox.disabled,false);
  checkbox.checked=false;await checkbox.listeners.change();
  assert.equal(fixture.local.superxHistoryEnabled,false);assert.equal(checkbox.checked,false);assert.equal(checkbox.disabled,false);
  assert.equal(language.value,'ja');assert.equal(fixture.local.settings.language,'auto');
  assert.equal(fixture.session.apiKey,'session-secret');
  assert.equal(fixture.messages.some(message=>['SAVE_KEY','SAVE_SETTINGS'].includes(message.type)),false);
  checkbox.checked=true;await checkbox.listeners.change();assert.equal(fixture.local.superxHistoryEnabled,true);
  for(const listener of fixture.runtimeListeners)listener({type:'UI_LANGUAGE_CHANGED',language:'zh-CN'});
  assert.equal(fixture.ids.get('history-status').textContent,ui.t('history.saved','zh-CN'));
  assert.equal(language.value,'ja');
});

test('history setting failures restore its prior value without changing the main Settings form',async()=>{
  const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,{}, {onMessage(message){if(message.type==='SET_HISTORY_ENABLED')return {ok:false};}});
  await settleUI();await settleUI();
  const checkbox=fixture.ids.get('history-enabled');checkbox.checked=false;await checkbox.listeners.change();
  assert.equal(checkbox.checked,true);assert.equal(checkbox.disabled,false);
  assert.equal(fixture.ids.get('history-status').textContent,ui.t('history.error','en'));
  assert.equal(fixture.ids.get('save').disabled,false);assert.equal(fixture.local.superxHistoryEnabled,undefined);
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
    const fixture=uiPageFixture(file,core.DEFAULT_SETTINGS,{local:{uiLanguage:undefined}},
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
      const settings=core.normalizeSettings({provider:'api',language:'pt-BR'});
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

test('all options and popup translation markers are supplied for every UI locale', () => {
  for(const file of ['options','popup']) {
    const html=fs.readFileSync(path.join(__dirname,'../extension',`${file}.html`),'utf8');
    for(const marker of html.matchAll(/data-i18n(?:-aria|-placeholder|-title)?="([^"]+)"/g)) {
      for(const locale of ui.SUPPORTED_LANGUAGES) assert.ok(ui.catalog[locale][marker[1]],`${file}: ${locale}: ${marker[1]}`);
    }
    assert.doesNotMatch(html,/id="(?:dwell-ms|cooldown-ms|max-per-session|limit-label)"/);
  }
});

test('fresh language controls both default to Auto and keep answer and interface settings separate', async () => {
  const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS);
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
  fixture.ids.get('explain-prompt').value='Keep this explanation draft.';
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
  assert.equal(fixture.ids.get('explain-prompt').value,'Keep this explanation draft.');
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
    if(file==='options')fixture.ids.get('explain-prompt').value='Keep my unsaved draft';
    const next=core.normalizeSettings({language:'ja',interfaceLanguage:'zh-CN'});
    fixture.storageListeners.forEach(listener=>listener({settings:{newValue:next}},'local'));
    assert.equal(fixture.document.documentElement.lang,'zh-CN',file);
    if(file==='options') {
      assert.equal(fixture.ids.get('interface-language').value,'zh-CN');
      assert.equal(fixture.ids.get('language').value,'ja');
      assert.equal(fixture.ids.get('explain-prompt').value,'Keep my unsaved draft');
    }
  }
});

test('ready Key text distinguishes remembered device storage from session-only storage', async () => {
  for(const saved of [false,true]) {
    const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,
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
  fixture.ids.get('api-model').value='grok-custom';
  fixture.ids.get('api-concurrency').value=7;
  fixture.ids.get('explanation-mode').value='custom';fixture.ids.get('explanation-mode').listeners.change();
  fixture.ids.get('language').value='ko';
  fixture.ids.get('explain-prompt').value='  Explain only the unfamiliar references.\nDo not change this draft.  ';
  fixture.ids.get('verify-prompt').value='核实最重要的一条事实。';
  fixture.ids.get('comments-prompt').value='Give three friendly replies.';
  fixture.runtimeListeners.forEach(listener=>listener({type:'UI_LANGUAGE_CHANGED',language:'ja-JP'}));
  assert.equal(fixture.ids.get('save').textContent,'設定を保存');
  assert.equal(fixture.ids.get('language').children[0].textContent,ui.t('lang.auto','ja'));
  fixture.storageListeners.forEach(listener=>listener({uiLanguage:{newValue:'ar'}},'local'));
  assert.equal(fixture.document.documentElement.dir,'rtl');
  assert.equal(fixture.ids.get('api-key').value,'draft-secret');
  assert.equal(fixture.ids.get('api-model').value,'grok-custom');
  assert.equal(fixture.ids.get('api-concurrency').value,7);
  assert.equal(fixture.ids.get('explanation-mode').value,'custom');
  assert.equal(fixture.ids.get('analysis-prompts').hidden,false);
  assert.equal(fixture.ids.get('explanation-mode-help').textContent,ui.t('options.customModeHelp','ar'));
  assert.equal(fixture.ids.get('language').value,'ko');
  assert.equal(fixture.ids.get('explain-prompt').value,'  Explain only the unfamiliar references.\nDo not change this draft.  ');
  assert.equal(fixture.ids.get('verify-prompt').value,'核实最重要的一条事实。');
  assert.equal(fixture.ids.get('comments-prompt').value,'Give three friendly replies.');
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
  assert.ok(fixture.messages.every(message=>!('apiKey' in message)));
});

test('a first remembered Key saves without password setup and is ready again after browser restart', async () => {
  const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,{local:{apiKey:undefined},session:{apiKey:undefined}});
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
    const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,{local:item.local,session:item.session});
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
  const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,{local:{apiKey:'remembered-to-demote',rememberApiKey:true},session:{apiKey:undefined}});
  await settleUI();await settleUI();
  assert.equal(fixture.ids.get('api-key').value,'remembered-to-demote');
  assertUIRememberedKey(fixture,'remembered-to-demote');assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
  fixture.ids.get('remember-key').checked=false;fixture.ids.get('remember-key').listeners.change();
  fixture.ids.get('api-model').value='replacement-model';fixture.ids.get('api-model').listeners.input();
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  const correction=fixture.messages.find(message=>message.type==='SAVE_KEY');
  assert.equal(correction.remember,false);assert.equal(correction.apiKey,'remembered-to-demote');
  assert.equal(correction.settings.apiModel,'replacement-model');
  assert.equal(fixture.local.apiKey,undefined);assert.equal(fixture.local.apiKeyEncrypted,undefined);assert.equal(fixture.local.rememberApiKey,false);
  assert.equal(fixture.session.apiKey,'remembered-to-demote');
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_KEY']);
  await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(fixture.messages.filter(message=>message.type==='SAVE_KEY').length,1,'An unchanged save must not resend credentials');
  assert.equal(fixture.messages.filter(message=>message.type==='SAVE_SETTINGS').length,1);
});

test('an explicit session-only choice survives reopening after the browser session ends', async () => {
  const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,{local:{apiKey:undefined},session:{apiKey:undefined}});
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
    const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,{local:{rememberApiKey:!remember}});
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
  const settings=core.normalizeSettings({...core.DEFAULT_SETTINGS,rememberApiKey:true,remember:false,apiKey:'fixture-only-secret'});
  assert.deepEqual(settings,core.normalizeSettings(core.DEFAULT_SETTINGS));
  for(const key of ['rememberApiKey','remember','apiKey'])assert.equal(Object.hasOwn(settings,key),false,key);
  assert.equal(JSON.stringify(settings).includes('fixture-only-secret'),false);
});

test('options prompt editors load the active instructions with accessible labels and bounded input', async () => {
  const fixture=uiPageFixture('options');await settleUI();await settleUI();
  for(const name of ['explain','verify','comments']) {
    const editor=fixture.ids.get(`${name}-prompt`);
    assert.equal(editor.value,core.DEFAULT_PROMPTS[name]);
    assert.equal(editor.getAttribute('maxlength'),String(core.MAX_PROMPT_LENGTH));
    assert.equal(editor.getAttribute('spellcheck'),'false');
    assert.equal(editor.getAttribute('dir'),'auto');
    assert.equal(editor.getAttribute('aria-describedby'),'prompt-rules-help');
  }
  assert.equal(fixture.ids.has('provider'),true);
  assert.ok(!fixture.ids.get('api-fields').hidden);
  fixture.ids.get('explanation-mode').value='custom';fixture.ids.get('explanation-mode').listeners.change();
  assert.equal(fixture.ids.get('analysis-prompts').hidden,false,'Custom prompt editors remain available for API tasks');
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
});

test('options save and reload custom prompts without stripping whitespace or extra model requests', async () => {
  const fixture=uiPageFixture('options');await settleUI();await settleUI();
  fixture.ids.get('explanation-mode').value='custom';fixture.ids.get('explanation-mode').listeners.change();
  const drafts={
    explain:'  Explain the background first.\nUse a short example.  ',
    verify:'只核实原帖中可验证的断言。\n保留来源。\n',
    comments:'\nOffer three distinct, natural replies. 🙂\n',
  };
  for(const [name,value] of Object.entries(drafts))fixture.ids.get(`${name}-prompt`).value=value;
  const form=fixture.ids.get('settings-form');
  await form.listeners.submit({preventDefault(){},currentTarget:form});
  const saved=fixture.messages.find(message=>message.type==='SAVE_SETTINGS');
  assert.ok(saved);
  assert.equal(saved.settings.explanationMode,'custom');
  for(const [name,value] of Object.entries(drafts))assert.equal(saved.settings[`${name}Prompt`],value);
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_SETTINGS']);
  const reopened=uiPageFixture('options',saved.settings);await settleUI();await settleUI();
  assert.equal(reopened.ids.get('explanation-mode').value,'custom');
  assert.equal(reopened.ids.get('analysis-prompts').hidden,false);
  for(const [name,value] of Object.entries(drafts))assert.equal(reopened.ids.get(`${name}-prompt`).value,value);
});

test('restoring one or all prompts edits the form only and requires Save to apply', async () => {
  const fixture=uiPageFixture('options',core.normalizeSettings({explanationMode:'custom',explainPrompt:'Explain draft',verifyPrompt:'Verify draft',commentsPrompt:'Comments draft'}));
  await settleUI();await settleUI();
  fixture.ids.get('reset-verify-prompt').listeners.click();
  assert.equal(fixture.ids.get('verify-prompt').value,core.DEFAULT_PROMPTS.verify);
  assert.equal(fixture.ids.get('explain-prompt').value,'Explain draft');
  assert.equal(fixture.ids.get('comments-prompt').value,'Comments draft');
  assert.equal(fixture.ids.get('status').textContent,ui.t('options.promptsReset','en'));
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
  fixture.ids.get('reset-prompts').listeners.click();
  assert.equal(fixture.ids.get('explanation-mode').value,'custom','Restoring defaults only edits prompt fields, keeping the selected mode');
  for(const name of ['explain','verify','comments'])assert.equal(fixture.ids.get(`${name}-prompt`).value,core.DEFAULT_PROMPTS[name]);
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  const saved=fixture.messages.find(message=>message.type==='SAVE_SETTINGS');
  for(const name of ['explain','verify','comments'])assert.equal(saved.settings[`${name}Prompt`],core.DEFAULT_PROMPTS[name]);
});

test('preset and custom switches preserve all drafts and verification choices', async () => {
  const fixture=uiPageFixture('options',core.normalizeSettings({explanationMode:'custom',apiVerification:'inline',nativeVerification:true}));
  await settleUI();await settleUI();
  const drafts={explain:'  Context only.\nKeep this draft.  ',verify:'Verify draft',comments:'Three short replies.'};
  for(const [name,value] of Object.entries(drafts))fixture.ids.get(`${name}-prompt`).value=value;
  for(const mode of ['preset','custom']) {
    fixture.ids.get('explanation-mode').value=mode;fixture.ids.get('explanation-mode').listeners.change();
    assert.equal(fixture.ids.get('analysis-prompts').hidden,mode!=='custom');
    assert.ok(!fixture.ids.get('api-verification-field').hidden);
    assert.ok(!fixture.ids.get('api-verification-help').hidden);
    assert.equal(fixture.ids.get('api-verification').value,'inline');
    assert.equal(fixture.ids.get('explanation-mode-help').textContent,ui.t(`options.${mode}ModeHelp`,'en'));
    for(const [name,value] of Object.entries(drafts))assert.equal(fixture.ids.get(`${name}-prompt`).value,value);
    assert.ok(!fixture.ids.get('comments-prompt').hidden);
  }
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
});

test('saving preset mode retains custom drafts for the next mode switch', async () => {
  for(const mode of ['preset']) {
    const fixture=uiPageFixture('options',core.normalizeSettings({explanationMode:'custom',explainPrompt:'My explain instructions',verifyPrompt:'My verify instructions',commentsPrompt:'My comments instructions'}));
    await settleUI();await settleUI();
    fixture.ids.get('explanation-mode').value=mode;fixture.ids.get('explanation-mode').listeners.change();
    const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    const saved=fixture.messages.find(message=>message.type==='SAVE_SETTINGS');
    assert.equal(saved.settings.explanationMode,mode);
    assert.equal(saved.settings.explainPrompt,'My explain instructions');
    assert.equal(saved.settings.verifyPrompt,'My verify instructions');
    assert.equal(saved.settings.commentsPrompt,'My comments instructions');
    const reopened=uiPageFixture('options',saved.settings);await settleUI();await settleUI();
    reopened.ids.get('explanation-mode').value='custom';reopened.ids.get('explanation-mode').listeners.change();
    assert.equal(reopened.ids.get('explain-prompt').value,'My explain instructions');
    assert.equal(reopened.ids.get('verify-prompt').value,'My verify instructions');
  }
});

test('every API mode requires a full-post retrieval tool before saving and accepts either search', async () => {
  for(const mode of ['preset','custom']) {
    const fixture=uiPageFixture('options',core.normalizeSettings({explanationMode:mode}));await settleUI();await settleUI();
    fixture.ids.get('web-search').checked=false;fixture.ids.get('x-search').checked=false;
    const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    assert.equal(fixture.ids.get('status').textContent,ui.t('options.urlSearchRequired','en'));
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
  assert.equal(fixture.ids.get('explain-prompt').value,core.DEFAULT_PROMPTS.explain);
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
});

test('options reject an oversized prompt without silently shortening or saving it', async () => {
  const fixture=uiPageFixture('options');await settleUI();await settleUI();
  const editor=fixture.ids.get('verify-prompt'),draft='x'.repeat(core.MAX_PROMPT_LENGTH+1);editor.value=draft;
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(editor.value,draft);
  assert.equal(editor.focused,true);
  assert.equal(fixture.ids.get('status').dataset.state,'error');
  assert.equal(fixture.ids.get('status').textContent,ui.t('options.promptTooLong','en',{limit:core.MAX_PROMPT_LENGTH}));
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
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
  const fixture=uiPageFixture('options',{...core.DEFAULT_SETTINGS,provider:'native',explanationMode:'url',language:'ja',apiModel:'my-model',explainPrompt:'Saved explanation.',verifyPrompt:'Saved evidence.',commentsPrompt:'Saved comments.'});
  await settleUI();await settleUI();assert.equal(fixture.ids.get('explanation-mode').value,'preset');
  assert.equal(fixture.ids.get('api-model').value,'my-model');assert.equal(fixture.ids.get('language').value,'ja');
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  const saved=fixture.messages.find(message=>message.type==='SAVE_SETTINGS');assert.equal(saved.settings.provider,'api');assert.equal(saved.settings.explanationMode,'preset');
  assert.equal(saved.settings.explainPrompt,'Saved explanation.');assert.equal(saved.settings.verifyPrompt,'Saved evidence.');assert.equal(saved.settings.commentsPrompt,'Saved comments.');
  assert.equal(Object.hasOwn(saved.settings,'nativeVerification'),false);
});

test('changing model and Key together sends one transaction without exposing settings under the old Key',async()=>{
  const dispatches=[];
  const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,
    {local:{apiKey:'old-account-key',rememberApiKey:true},session:{apiKey:'old-account-key'}},
    {onMessage(message,state){
      if(message.type==='SAVE_SETTINGS'&&message.settings.enabled&&state.session.apiKey)
        dispatches.push({model:message.settings.apiModel,key:state.session.apiKey});
    }});
  await settleUI();await settleUI();
  fixture.ids.get('api-model').value='replacement-model';
  fixture.ids.get('api-key').value='new-account-key';fixture.ids.get('api-key').listeners.input();
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.deepEqual(dispatches,[],'Target settings must never be broadcast with the previous account Key');
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_KEY']);
  const saved=fixture.messages.find(message=>message.type==='SAVE_KEY');
  assert.equal(saved.settings.apiModel,'replacement-model');assert.equal(saved.apiKey,'new-account-key');
  assert.equal(Object.hasOwn(saved,'passphrase'),false);
  assert.equal(fixture.local.settings.apiModel,'replacement-model');
  assertUIRememberedKey(fixture,'new-account-key');assert.equal(fixture.session.apiKey,'new-account-key');
});

test('a failed Clear Key action retains the active credential and shows its actual state',async()=>{
  const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,
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
    const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,{local:{dataConsent},session:{apiKey:undefined}});
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
  const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,
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
    const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,
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
  const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,
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
    const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,
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
  const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,
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
    const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,
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
  const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,
    {local:{apiKeyVault:{fixture:'old-encrypted'},rememberApiKey:true},session:{apiKey:undefined}});
  await settleUI();await settleUI();
  await fixture.ids.get('clear-key').listeners.click();
  assert.equal(fixture.ids.get('api-key').value,'');assert.equal(fixture.local.apiKeyVault,undefined);
  assert.equal(fixture.local.apiKey,undefined);assert.equal(fixture.session.apiKey,undefined);
  assert.equal(fixture.ids.get('remember-key').checked,true);assert.equal(fixture.ids.get('clear-key').hidden,true);
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_KEY']);
});

test('an untouched Key follows another Settings tab before changing its storage preference',async()=>{
  const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,
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
  const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,
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
    const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,
      {local:{apiKeyEncrypted:oldEnvelope,rememberApiKey:true},session:{apiKey:undefined}});
    await settleUI();await settleUI();
    fixture.ids.get('api-model').value='draft-model';fixture.ids.get('api-model').listeners.input();
    fixture.ids.get('explain-prompt').value='Keep my prompt draft.';
    if(edited) {
      fixture.ids.get('api-key').value='replacement-c-fixture';fixture.ids.get('api-key').listeners.input();
    }
    const nextEnvelope=uiFixtureEncryptedKey('account-b-fixture');fixture.local.apiKeyEncrypted=nextEnvelope;
    for(const listener of fixture.storageListeners)listener({apiKeyEncrypted:{oldValue:oldEnvelope,newValue:nextEnvelope}},'local');
    await settleUI();await settleUI();
    assert.equal(fixture.session.apiKey,'account-b-fixture');
    assert.equal(fixture.ids.get('api-key').value,edited?'replacement-c-fixture':'account-b-fixture');
    assert.equal(fixture.ids.get('api-model').value,'draft-model');
    assert.equal(fixture.ids.get('explain-prompt').value,'Keep my prompt draft.');
    assert.ok(!fixture.messages.some(message=>['SAVE_KEY','SAVE_SETTINGS'].includes(message.type)));
    const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    assertUIRememberedKey(fixture,edited?'replacement-c-fixture':'account-b-fixture');
    assert.equal(fixture.local.settings.apiModel,'draft-model');
    assert.equal(fixture.local.settings.explainPrompt,'Keep my prompt draft.');
    assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE',edited?'SAVE_KEY':'SAVE_SETTINGS']);
    if(!edited)assert.equal(fixture.local.apiKeyEncrypted,nextEnvelope,'Ordinary Settings saves do not rotate or replace ciphertext');
  }
});

test('external credentials become the draft baseline without resending an unchanged Key',async()=>{
  const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,
    {local:{apiKey:'account-a-fixture',rememberApiKey:true},session:{apiKey:'account-a-fixture'}});
  await settleUI();await settleUI();
  fixture.ids.get('api-key').value='account-b-fixture';fixture.ids.get('api-key').listeners.input();
  fixture.local.apiKeyEncrypted=uiFixtureEncryptedKey('account-b-fixture');fixture.session.apiKey='account-b-fixture';
  for(const listener of fixture.storageListeners)listener({apiKey:{oldValue:'account-a-fixture',newValue:'account-b-fixture'}},'session');
  await settleUI();await settleUI();
  fixture.ids.get('api-model').value='replacement-model';fixture.ids.get('api-model').listeners.input();
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.equal(fixture.local.settings.apiModel,'replacement-model');
  assert.ok(!fixture.messages.some(message=>['LOCK_KEY','UNLOCK_KEY','SAVE_KEY'].includes(message.type)));
  assert.equal(fixture.session.apiKey,'account-b-fixture');
});

test('failed atomic replacement saves preserve credentials and settings while retaining a retryable draft',async()=>{
  for(const remembered of [false,true]) {
    let fail=true;
    const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,
      {local:{rememberApiKey:remembered,...(remembered?{apiKey:'old-account-fixture'}:{})},session:{apiKey:'old-account-fixture'}},
      {onMessage(message){if(message.type==='SAVE_KEY'&&fail)return {ok:false,errorKey:'errors.keyStorage'};}});
    await settleUI();await settleUI();
    fixture.ids.get('api-model').value='replacement-model';fixture.ids.get('api-model').listeners.input();
    fixture.ids.get('api-key').value='replacement-fixture';fixture.ids.get('api-key').listeners.input();
    const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    assert.equal(fixture.session.apiKey,'old-account-fixture');assert.equal(fixture.local.settings.apiModel,core.DEFAULT_SETTINGS.apiModel);
    assert.equal(fixture.ids.get('api-key').value,'replacement-fixture');assert.equal(fixture.ids.get('api-model').value,'replacement-model');
    assert.equal(fixture.ids.get('key-security-state').dataset.state,'ready');
    assert.equal(fixture.ids.get('key-security-state').textContent,ui.t(remembered?'options.keyReadySaved':'options.keyReady','en'));
    assert.equal(fixture.ids.get('status').dataset.state,'error');assert.equal(fixture.ids.get('save').disabled,false);
    fail=false;await form.listeners.submit({preventDefault(){},currentTarget:form});
    assert.equal(fixture.session.apiKey,'replacement-fixture');assert.equal(fixture.local.settings.apiModel,'replacement-model');
    assert.equal(fixture.ids.get('key-security-state').dataset.state,'ready');
  }
});

test('invalid or emptied Key edits are rejected before credential or settings mutation',async()=>{
  for(const draft of ['', 'invalid\nkey', 'x'.repeat(501)]) {
    const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,
      {local:{apiKey:'existing-fixture',rememberApiKey:true},session:{apiKey:'existing-fixture'}});
    await settleUI();await settleUI();
    fixture.ids.get('api-key').value=draft;fixture.ids.get('api-key').listeners.input();
    fixture.ids.get('api-model').value='draft-model';
    const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
    assert.equal(fixture.ids.get('status').textContent,ui.t(draft?'errors.keyInvalid':'options.keyRequired','en'));
    assert.equal(fixture.ids.get('api-key').focused,true);
    assertUIRememberedKey(fixture,'existing-fixture');assert.equal(fixture.session.apiKey,'existing-fixture');
    assert.equal(fixture.local.settings.apiModel,core.DEFAULT_SETTINGS.apiModel);
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
  language.value=core.DEFAULT_SETTINGS.language;language.listeners.change();
  assert.equal(fixture.ids.get('status').textContent,'');
  fixture.ids.get('api-model').value='draft-model';fixture.ids.get('api-model').listeners.input();
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
    const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,item);await settleUI();await settleUI();
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
    const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,
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
  const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,{local:{apiKeyVault:{fixture:'encrypted'},rememberApiKey:true},session:{apiKey:undefined}});await settleUI();await settleUI();
  fixture.ids.get('api-model').value='unsaved-fixture-model';fixture.ids.get('api-model').listeners.input();
  fixture.session.superxOptionsFocus={id:'save',nonce:'invalid-fixture'};
  for(const listener of fixture.storageListeners)listener({superxOptionsFocus:{newValue:fixture.session.superxOptionsFocus}},'session');
  await settleUI();await settleUI();
  assert.ok(!fixture.ids.get('save').focused);
  fixture.session.superxOptionsFocus={id:'unlock-passphrase',nonce:'second-fixture'};
  for(const listener of fixture.storageListeners)listener({superxOptionsFocus:{newValue:fixture.session.superxOptionsFocus}},'session');
  await settleUI();await settleUI();
  assert.equal(fixture.ids.get('api-key').focused,true);
  assert.equal(fixture.ids.has('unlock-passphrase'),false);
  assert.equal(fixture.ids.get('api-model').value,'unsaved-fixture-model');
  assert.equal(Object.hasOwn(fixture.session,'superxOptionsFocus'),false);
  fixture.ids.get('api-key').focused=false;
  fixture.session.superxOptionsFocus={id:'api-key',nonce:'second-fixture'};
  for(const listener of fixture.storageListeners)listener({superxOptionsFocus:{newValue:fixture.session.superxOptionsFocus}},'session');
  await settleUI();await settleUI();
  assert.equal(fixture.ids.get('api-key').focused,false,'A consumed nonce cannot refocus or replace the existing draft');
  assert.equal(fixture.ids.get('api-model').value,'unsaved-fixture-model');
  assert.ok(!fixture.messages.some(message=>['SAVE_SETTINGS','SAVE_KEY'].includes(message.type)));
});

test('a Settings focus request received during Save waits until completion and focuses API Key without an extra save',async()=>{
  const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,{local:{apiKeyVault:{fixture:'encrypted'},rememberApiKey:true},session:{apiKey:undefined}},
    {onMessage(message,state){
      if(message.type==='SAVE_SETTINGS') {
        state.session.superxOptionsFocus={id:'unlock-passphrase',nonce:'busy-focus-fixture'};
        for(const listener of fixture.storageListeners)listener({superxOptionsFocus:{newValue:state.session.superxOptionsFocus}},'session');
        assert.ok(!fixture.ids.get('api-key').focused,'The focus request must not interrupt an active Save');
      }
    }});
  await settleUI();await settleUI();
  fixture.ids.get('api-model').value='replacement-model';fixture.ids.get('api-model').listeners.input();
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});await settleUI();await settleUI();
  assert.equal(fixture.ids.get('api-key').focused,true);assert.equal(fixture.ids.has('unlock-passphrase'),false);
  assert.equal(fixture.ids.get('api-key').value,'');assert.equal(fixture.ids.get('api-model').value,'replacement-model');
  assert.equal(fixture.session.apiKey,undefined);assert.ok(fixture.local.apiKeyVault);
  assert.equal(Object.hasOwn(fixture.session,'superxOptionsFocus'),false);
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','SAVE_SETTINGS']);
});

test('migration Settings navigation leaves the API Key editable without adding password controls or hidden mutations',async()=>{
  const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,
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
    const fixture=uiPageFixture('popup',core.DEFAULT_SETTINGS,item);await settleUI();await settleUI();
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
  const fixture=uiPageFixture('popup',core.DEFAULT_SETTINGS,{session:{apiKey:undefined}},
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
  const fixture=uiPageFixture('popup',core.DEFAULT_SETTINGS,{},
    {onMessage(message){
      if(message.type==='GET_CONFIG'&&++configReads>1)return {ok:true,settings:core.DEFAULT_SETTINGS,ready:false,keyMigration:true,keyState:'migration'};
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
  const fixture=uiPageFixture('popup',core.DEFAULT_SETTINGS,{local:{apiKey:'ready-fixture-key',rememberApiKey:true},session:{apiKey:'ready-fixture-key'}});
  await settleUI();await settleUI();
  assert.equal(fixture.ids.get('options').hidden,false);
  await fixture.ids.get('options').listeners.click();await settleUI();
  assert.deepEqual(fixture.openedOptions,[{focus:'api-key'}]);
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE','OPEN_SETTINGS']);
  assert.equal(fixture.session.apiKey,'ready-fixture-key');assertUIRememberedKey(fixture,'ready-fixture-key');
  assert.ok(fixture.reads.flat().every(key=>!['apiKey','apiKeyVault','apiKeyEncrypted'].includes(key)));
});

test('security-status failure disables Settings save rather than assuming Key access', async()=>{
  const fixture=uiPageFixture('options',core.DEFAULT_SETTINGS,{}, {securityFailure:true});
  await settleUI();await settleUI();
  assert.equal(fixture.ids.get('save').disabled,true);
  const form=fixture.ids.get('settings-form');await form.listeners.submit({preventDefault(){},currentTarget:form});
  assert.deepEqual(uiMessageTypes(fixture),['GET_UI_LANGUAGE']);
  assert.equal(fixture.ids.get('status').dataset.state,'error');
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
  assert.match(ui.t('options.cacheHelp','en'),/only for this browser session/);
});
