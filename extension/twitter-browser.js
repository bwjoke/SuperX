(function(root){
  'use strict';
  const Core=root.XGrokCore||(typeof require==='function'?require('./feed-core.js'):null);
  const failure=(code,message)=>Object.assign(new Error(message),{code});
  const abort=signal=>signal?.throwIfAborted();
  const PERMISSION={permissions:['cookies'],origins:['https://api.x.com/*','https://abs.twimg.com/*']};
  function postId(value){const url=Core.canonicalPostUrl(value);if(!url)throw failure('X_BROWSER_INPUT','Invalid X post URL.');return url.match(/\/status\/(\d+)/)[1];}
  function serialize(tweet){
    if(!tweet||!/^\d+$/.test(tweet.id||''))return null;
    const handle=/^[A-Za-z0-9_]{1,15}$/.test(tweet.username||'')?tweet.username:'i/web';
    return {id:tweet.id,url:`https://x.com/${handle}/status/${tweet.id}`,text:String(tweet.text||'').slice(0,30000),author:tweet.username||'',
      in_reply_to:tweet.inReplyToStatusId||null,quoted_post_id:tweet.quotedStatusId||null,conversation_id:tweet.conversationId||null,
      created_at:tweet.timeParsed instanceof Date?tweet.timeParsed.toISOString():null};
  }
  function safeError(e){
    if(typeof e?.code==='string'&&e.code.startsWith('X_BROWSER_'))return e;
    const status=e?.response?.status;
    if(status===429)return failure('X_BROWSER_RATE_LIMIT','X 请求频率受限，请稍后重试。');
    if([401,403].includes(status))return failure('X_BROWSER_LOGIN','X 会话或请求认证失败，请确认当前浏览器已登录 X。');
    if(status===404)return failure('X_BROWSER_NOT_FOUND','帖子不可访问，或 X 接口已变更。');
    return failure('X_BROWSER_REQUEST','无法读取 X 内容，可能是网络或 X 接口发生变化。');
  }
  function browserFetch(fetchImpl,signal){
    return async(input,init={})=>{
      abort(signal);
      const url=new URL(typeof input==='string'?input:input.url||String(input));
      const method=(init.method||'GET').toUpperCase();
      const searchPost=method==='POST'&&/^\/(?:i\/api\/)?graphql\/[^/]+\/SearchTimeline$/.test(url.pathname);
      if(url.protocol!=='https:'||url.username||url.password||method!=='GET'&&!searchPost)throw failure('X_BROWSER_POLICY','Only read-only X operations are allowed.');
      const asset=url.hostname==='abs.twimg.com'&&/^\/responsive-web\/client-web\/[^/]+\.js$/.test(url.pathname);
      const x=url.hostname==='x.com'&&(url.pathname==='/'||/^\/(?:x\/)?migrate$/.test(url.pathname)||/^\/i\/api\/graphql\/[^/]+\/(?:TweetDetail|TweetResultByRestId|SearchTimeline)$/.test(url.pathname));
      const api=url.hostname==='api.x.com'&&/^\/graphql\/[^/]+\/(?:TweetDetail|TweetResultByRestId|SearchTimeline)$/.test(url.pathname);
      if(!asset&&!x&&!api)throw failure('X_BROWSER_POLICY','Unsupported X read endpoint.');
      // Browser sends its own session cookies. Never set Cookie or fingerprint headers.
      const headers=new Headers();
      if(!asset){
        const source=init.headers;
        if(source?.forEach)source.forEach((value,name)=>headers.set(name,value));
        else for(const [name,value]of Object.entries(source||{}))headers.set(name,value);
        for(const name of [...headers.keys()])if(/^(?:cookie|host|origin|referer|user-agent|sec-.*)$/i.test(name))headers.delete(name);
      }
      const response=await fetchImpl(url.href,{method,headers,...(searchPost?{body:init.body}:{}),credentials:asset?'omit':'include',redirect:'error',signal,cache:'no-store'});
      abort(signal);return response;
    };
  }
  function create({chrome=root.chrome,fetchImpl=root.fetch,library=root.SuperXScraperLibrary}={}){
    let tail=Promise.resolve();
    async function status(){
      if(!chrome?.cookies||!await chrome.permissions.contains(PERMISSION))return {ready:false,code:'X_BROWSER_PERMISSION'};
      const cookies=await Promise.all(['auth_token','ct0'].map(name=>chrome.cookies.get({url:'https://x.com/',name})));
      return {ready:cookies.every(c=>Boolean(c?.value)),code:cookies.every(c=>Boolean(c?.value))?'connected':'X_BROWSER_LOGIN'};
    }
    function execute(action,args,{signal}={}){
      const work=tail.catch(()=>{}).then(async()=>{
        abort(signal);
        if(!library)throw failure('X_BROWSER_LIBRARY','Browser scraper library is missing.');
        if(!chrome?.cookies||!await chrome.permissions.contains(PERMISSION))throw failure('X_BROWSER_PERMISSION','请在设置中授权 X 浏览器搜索，然后保存。');
        const values=await Promise.all(['auth_token','ct0'].map(name=>chrome.cookies.get({url:'https://x.com/',name})));
        if(values.some(c=>!c?.value))throw failure('X_BROWSER_LOGIN','请先在当前浏览器登录 x.com。');
        // Only this operation holds the cookie values. Nothing is persisted or returned.
        const deadline=AbortSignal.timeout(45000);
        const operationSignal=signal?AbortSignal.any([signal,deadline]):deadline;
        const scraper=new library.Scraper({fetch:browserFetch(fetchImpl,operationSignal),rateLimitStrategy:new library.ErrorRateLimitStrategy(),experimental:{xClientTransactionId:true,xpff:false}});
        try {
          await scraper.setCookies(values.map((cookie,i)=>`${i?'ct0':'auth_token'}=${cookie.value}; Domain=x.com; Path=/; Secure`));
          const posts=[];
          const add=t=>{const value=serialize(t);if(value&&!posts.some(p=>p.id===value.id))posts.push(value);};
          if(action==='read'){
            const tweet=await scraper.getTweet(postId(args.url));
            if(!tweet)throw failure('X_BROWSER_NOT_FOUND','无法读取该帖子。');
            add(tweet);add(tweet.inReplyToStatus);add(tweet.quotedStatus);
            // Fetch one immediate parent / quote if only its ID was supplied.
            for(const id of [tweet.inReplyToStatusId,tweet.quotedStatusId])if(/^\d+$/.test(id||'')&&!posts.some(p=>p.id===id)){
              try{add(await scraper.getTweet(id));}catch(e){abort(operationSignal);/* Original remains usable; mark missing links below. */}
            }
            const unresolved=[tweet.inReplyToStatusId,tweet.quotedStatusId].filter(id=>id&&!posts.some(p=>p.id===id));
            abort(operationSignal);return {posts,unresolved_post_ids:unresolved,complete_thread:false,media_inspected:false};
          }
          if(action!=='search'||typeof args.query!=='string'||!args.query.trim()||args.query.length>512)throw failure('X_BROWSER_INPUT','Invalid X search query.');
          const count=Math.min(20,Math.max(1,Number.isInteger(args.count)?args.count:5));
          for await(const tweet of scraper.searchTweets(args.query,count,library.SearchMode.Latest)){abort(operationSignal);add(tweet);if(posts.length>=count)break;}
          return {posts,complete_results:false,media_inspected:false};
        }catch(e){abort(signal);throw safeError(e);}
      });
      tail=work.catch(()=>{});return work;
    }
    return {status,read:(url,options)=>execute('read',{url},options),search:(query,count=5,options)=>execute('search',{query,count},options)};
  }
  const api={create,browserFetch,serialize,postId,PERMISSION};
  root.SuperXTwitterBrowser=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
