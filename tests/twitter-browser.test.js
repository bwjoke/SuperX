'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const Browser=require('../extension/twitter-browser.js');
const cookieValues={auth_token:'PRIVATE_AUTH_COOKIE',ct0:'PRIVATE_CSRF_COOKIE'};
const chromeFor=(granted=true,loggedIn=true)=>({permissions:{contains:async()=>granted},cookies:{get:async({name})=>loggedIn?{value:cookieValues[name]}:null}});
const tweet=(id,extra={})=>({id,text:'Post '+id,username:'test',...extra});
function fakeLibrary({read,search}={}){
  return {SearchMode:{Latest:1},ErrorRateLimitStrategy:class{},Scraper:class{
    constructor(options){this.options=options;}
    async setCookies(cookies){assert.equal(cookies.length,2);}
    async getTweet(id){return read?read(id,this.options):tweet(id);}
    async *searchTweets(query,count){if(search)yield* search(query,count,this.options);else yield tweet('123');}
  }};
}
test('browser status exposes only permission and login state, never cookie values',async()=>{
  for(const [granted,loggedIn,code]of [[false,true,'X_BROWSER_PERMISSION'],[true,false,'X_BROWSER_LOGIN'],[true,true,'connected']]){
    const reader=Browser.create({chrome:chromeFor(granted,loggedIn)}),status=await reader.status();
    assert.equal(status.code,code);assert.doesNotMatch(JSON.stringify(status),/PRIVATE_/);
  }
});
test('reading a post includes its immediate parent and quote while missing context stays explicit',async()=>{
  const calls=[];
  const reader=Browser.create({chrome:chromeFor(),library:fakeLibrary({read:id=>{
    calls.push(id);if(id==='789')throw Error('PRIVATE_AUTH_COOKIE');
    return id==='123'?tweet(id,{inReplyToStatusId:'456',quotedStatusId:'789'}):tweet(id);
  }})});
  const result=await reader.read('https://x.com/test/status/123');
  assert.deepEqual(calls,['123','456','789']);assert.deepEqual(result.posts.map(p=>p.id),['123','456']);
  assert.deepEqual(result.unresolved_post_ids,['789']);assert.equal(result.complete_thread,false);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_/);
});
test('search preserves X query syntax and caps results without inspecting media',async()=>{
  const query='conversation_id:123 filter:replies';
  const reader=Browser.create({chrome:chromeFor(),library:fakeLibrary({search:function*(q,count){assert.equal(q,query);assert.equal(count,2);yield tweet('1');yield tweet('2');yield tweet('3');}})});
  const result=await reader.search(query,2);assert.equal(result.posts.length,2);assert.equal(result.media_inspected,false);
});
test('the browser fetch adapter restricts read endpoints and strips forbidden headers',async()=>{
  const calls=[];
  const fetch=Browser.browserFetch(async(url,init)=>{calls.push({url,...init});return new Response('{}');});
  await fetch('https://api.x.com/graphql/id/SearchTimeline',{headers:{Cookie:'PRIVATE_AUTH_COOKIE',Authorization:'Bearer public-client-token','x-csrf-token':'csrf','User-Agent':'fake','sec-fetch-site':'fake'}});
  assert.equal(calls[0].credentials,'include');assert.equal(calls[0].headers.get('cookie'),null);
  assert.equal(calls[0].headers.get('user-agent'),null);assert.equal(calls[0].headers.get('authorization'),'Bearer public-client-token');
  await fetch('https://abs.twimg.com/responsive-web/client-web/ondemand.s.123.js',{headers:{Authorization:'PRIVATE_AUTH_COOKIE','x-csrf-token':'PRIVATE_CSRF_COOKIE'}});
  assert.equal(calls[1].credentials,'omit');assert.equal([...calls[1].headers].length,0);
  for(const [url,init]of [['https://evil.example/secret',{}],['https://x.com/i/api/graphql/id/CreateTweet',{}],['https://x.com/i/api/graphql/id/TweetDetail',{method:'POST'}],['http://x.com/',{}]])await assert.rejects(fetch(url,init),{code:'X_BROWSER_POLICY'});
  assert.equal(calls.length,2);
});
test('browser errors never expose raw provider messages, cookies, or response bodies',async()=>{
  const reader=Browser.create({chrome:chromeFor(),library:fakeLibrary({read:()=>{throw Object.assign(Error('PRIVATE_AUTH_COOKIE'),{response:{status:429}});}})});
  await assert.rejects(reader.read('https://x.com/test/status/123'),e=>{assert.equal(e.code,'X_BROWSER_RATE_LIMIT');assert.doesNotMatch(e.message,/PRIVATE_/);return true;});
  const controller=new AbortController();controller.abort();
  await assert.rejects(reader.read('https://x.com/test/status/123',{signal:controller.signal}),{name:'AbortError'});
});
function bundledLibrary(){
  const context=vm.createContext({crypto:webcrypto,fetch,Headers,Request,Response,URL,URLSearchParams,AbortController,AbortSignal,TextEncoder,TextDecoder,setTimeout,clearTimeout,queueMicrotask,atob,btoa,console:{log(){},warn(){},error(){}}},{codeGeneration:{strings:false,wasm:false}});
  const source=fs.readFileSync(require.resolve('../extension/twitter-scraper.bundle.js'),'utf8');
  assert.doesNotMatch(source,/\beval\s*\(|new Function\s*\(|\bimport\s*\(/);
  vm.runInContext(source,context);
  return context.SuperXScraperLibrary;
}
const rawTweet=id=>({__typename:'Tweet',rest_id:id,legacy:{id_str:id,full_text:'Full original '+id,conversation_id_str:id,entities:{hashtags:[],user_mentions:[],urls:[]}},core:{user_results:{result:{rest_id:'9',legacy:{name:'Example',screen_name:'test'}}}}});
test('the real browser bundle works in a worker without eval/Node and parses read/search GraphQL responses',async()=>{
  const library=bundledLibrary(),upstream=library.Scraper;
  // Signature generation is tested separately; this fixture exercises the real parser and auth jar.
  library.Scraper=class extends upstream{constructor(options){super({...options,experimental:{xClientTransactionId:false}});}};
  const calls=[];
  const reader=Browser.create({chrome:chromeFor(),library,fetchImpl:async(url,init)=>{
    calls.push({url,init});const search=url.includes('/SearchTimeline');
    const entries=[{entryId:'tweet-123',content:{itemContent:{tweetDisplayType:'Tweet',tweet_results:{result:rawTweet('123')}}}}];
    const instructions=[{type:'TimelineAddEntries',entries}];
    return new Response(JSON.stringify({data:search?{search_by_raw_query:{search_timeline:{timeline:{instructions}}}}:{threaded_conversation_with_injections_v2:{instructions}}}),{headers:{'content-type':'application/json'}});
  }});
  const read=await reader.read('https://x.com/test/status/123');
  assert.equal(read.posts[0].text,'Full original 123');
  const search=await reader.search('test',1);assert.equal(search.posts[0].id,'123');
  assert.equal(calls.length,2);assert.ok(calls.every(c=>c.init.headers.get('cookie')===null));
  assert.equal(calls[0].init.headers.get('x-csrf-token'),cookieValues.ct0);
});
test('the real browser bundle generates transaction IDs with scoped fetch and native WebCrypto',async()=>{
  const library=bundledLibrary(),calls=[];
  const row='1 2 3 4 5 6 128 128 128 128 128';
  const frames=Array.from({length:4},(_,i)=>`<svg id="loading-x-anim-${i}"><g><path/><path d="M00000000${Array(16).fill(row).join('C')}"/></g></svg>`).join('');
  const key=Buffer.from(new Uint8Array(48).fill(1)).toString('base64');
  const html=`<html><head><meta name="twitter-site-verification" content="${key}"><script>({1:"ondemand.s"})[e]||e)+"."+({1:"fixture"})</script></head><body>${frames}</body></html>`;
  const reader=Browser.create({chrome:chromeFor(),library,fetchImpl:async(url,init)=>{
    calls.push({url,init});
    if(url==='https://x.com/')return new Response(html);
    if(url.startsWith('https://abs.twimg.com/'))return new Response('(a[0],16)(a[1],16)(a[2],16)(a[3],16)');
    assert.match(url,/\/TweetDetail\?/);assert.ok(init.headers.get('x-client-transaction-id')?.length>20);
    const entries=[{entryId:'tweet-123',content:{itemContent:{tweet_results:{result:rawTweet('123')}}}}];
    return new Response(JSON.stringify({data:{threaded_conversation_with_injections_v2:{instructions:[{type:'TimelineAddEntries',entries}]}}}),{headers:{'content-type':'application/json'}});
  }});
  const result=await reader.read('https://x.com/test/status/123');assert.equal(result.posts[0].id,'123');
  assert.equal(calls.length,3);const asset=calls.find(c=>c.url.includes('abs.twimg.com'));
  assert.equal(asset.init.credentials,'omit');assert.equal([...asset.init.headers].length,0);
});
