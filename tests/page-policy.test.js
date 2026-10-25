'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../extension/feed-core.js');
const manifest=require('../extension/manifest.json');

test('Money, payments, settings, credentials and private messages are outside the feed scope',()=>{
  for(const host of ['x.com','twitter.com'])for(const path of [
    '/i/money','/i/money/settings/beneficiaries','/i/payments/send','/wallet',
    '/settings/account','/i/settings/security','/login','/i/flow/login',
    '/messages/123','/i/chat/123','/i/grok','/billing','/i/monetization',
    '/I/MONEY/send','/i/%6doney','/i%2fmoney','//i///money',
    '/i/%256doney','/i/money%00','/%invalid','/i/../settings'
  ]){
    assert.equal(Core.isSupportedXPath(path),false,path);
    assert.equal(Core.isSupportedXPage('https://'+host+path),false,host+path);
  }
});

test('ordinary timelines, profiles, posts and manual composers retain access',()=>{
  for(const path of ['/', '/home','/search','/explore','/notifications','/elonmusk',
    '/someone/status/123','/someone/status/123/photo/1','/i/bookmarks','/i/lists/123',
    '/i/communities/123','/i/web/status/123','/compose/post','/i/compose/post']){
    assert.equal(Core.isSupportedXPath(path),true,path);
    assert.equal(Core.isSupportedXPage('https://x.com'+path+'?test=1'),true,path);
  }
  for(const url of ['http://x.com/home','https://x.com.evil.test/home','https://money.x.com/',
    'https://user:secret@x.com/home','https://x.com:8443/home','javascript:void(0)',null]){
    assert.equal(Core.isSupportedXPage(url),false,String(url));
  }
});

test('direct sensitive-page loads are excluded without any new extension permissions',()=>{
  const script=manifest.content_scripts[0];
  const matches=pattern=>new RegExp('^'+pattern.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$');
  for(const host of ['x.com','twitter.com'])for(const prefix of ['','i/'])for(const section of Core.SENSITIVE_X_SECTIONS){
    for(const suffix of ['', '/', '/child', '?from=nav']){
      const url=`https://${host}/${prefix}${section}${suffix}`;
      assert.ok(script.exclude_matches.some(pattern=>matches(pattern).test(url)),url);
    }
  }
  for(const path of ['/moneyprinter','/moneyprinter/status/123','/accountant','/wallet_news/media']){
    const url='https://x.com'+path;
    assert.equal(script.exclude_matches.some(pattern=>matches(pattern).test(url)),false,url);
    assert.equal(Core.isSupportedXPage(url),true,url);
  }
  assert.deepEqual(manifest.permissions,['storage','alarms']);
  assert.deepEqual(script.matches,['https://x.com/*','https://twitter.com/*']);
  assert.deepEqual(manifest.host_permissions,['https://x.com/*','https://twitter.com/*','https://api.x.ai/*','https://auth.x.ai/*']);
  assert.deepEqual(manifest.optional_host_permissions,['http://127.0.0.1/*']);
  assert.equal(manifest.externally_connectable,undefined);
});
