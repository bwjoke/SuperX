/* SuperX: recent browsing stays in restricted local extension storage. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SuperXHistoryStore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const STORAGE_KEY='superxHistory', ENABLED_KEY='superxHistoryEnabled';
  const LIMITS=Object.freeze({ttlMs:24*60*60*1000,maxEntries:1000,maxBytes:6_000_000});
  const copy=value=>JSON.parse(JSON.stringify(value));
  const text=(value,limit)=>typeof value==='string'?value.slice(0,limit):'';
  function safeUrl(value){
    if(typeof value!=='string'||value.length>4000)return '';
    try{const url=new URL(value);return /^https?:$/.test(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}
  }
  function postIdentity(value){
    const url=safeUrl(value?.url);if(!url)return null;
    const parsed=new URL(url),match=parsed.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})$/)||parsed.pathname.match(/^\/i\/web\/status\/(\d{1,25})$/);
    if(!/^(?:www\.)?(?:x\.com|twitter\.com)$/i.test(parsed.hostname)||!match)return null;
    const id=match[match.length-1];if(id!==String(value.id))return null;
    return {id,url:match.length===2?`https://x.com/i/web/status/${id}`:`https://x.com/${match[1].toLowerCase()}/status/${id}`};
  }
  function cleanPost(value){
    const identity=postIdentity(value);if(!identity)return null;
    return {...identity,text:text(value.text,12000),author:text(value.author,200),language:text(value.language,30),hasMedia:value.hasMedia===true};
  }
  function usage(value){
    const result={};if(!value||typeof value!=='object')return result;
    for(const field of ['input_tokens','output_tokens','total_tokens','num_sources_used','num_server_side_tools_used','cost_in_usd_ticks'])if(Number.isFinite(value[field])&&value[field]>=0)result[field]=value[field];
    for(const [field,keys] of [
      ['input_tokens_details',['cached_tokens','text_tokens','image_tokens','audio_tokens']],
      ['output_tokens_details',['reasoning_tokens','audio_tokens']],
      ['server_side_tool_usage_details',['web_search_calls','x_search_calls','x_posts_fetched','x_users_fetched','code_interpreter_calls','file_search_calls','mcp_calls','document_search_calls','image_generation_calls']]
    ]){
      const details={};for(const key of keys)if(Number.isFinite(value[field]?.[key])&&value[field][key]>=0)details[key]=value[field][key];
      if(Object.keys(details).length)result[field]=details;
    }
    return result;
  }
  function model(value){return typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value)?value:'';}
  function scope(value){return typeof value==='string'&&/^(?:api|api:deepseek-(?:browser|twikit)|build|oauth:[A-Za-z0-9-]{1,100})$/.test(value)?value:'';}
  function metadata(value){
    const result={};if(value?.usage&&typeof value.usage==='object')result.usage=usage(value.usage);
    if(typeof value?.usageComplete==='boolean')result.usageComplete=value.usageComplete;
    if(model(value?.model))result.model=model(value.model);
    for(const field of ['usageByStage','modelByStage']){
      const stages={};for(const stage of ['url','explain','verify','inline','comments'])if(Object.hasOwn(value?.[field]||{},stage)){
        const clean=field==='usageByStage'?usage(value[field][stage]):model(value[field][stage]);
        if(field==='usageByStage'||clean)stages[stage]=clean;
      }
      if(Object.keys(stages).length)result[field]=stages;
    }
    return result;
  }
  function cleanAnalysis(value,now){
    const body=text(value?.text,30000);if(!body.trim())return null;
    const sources=(Array.isArray(value.sources)?value.sources:[]).slice(0,20).map(item=>({url:safeUrl(item?.url),title:text(item?.title,200)})).filter(item=>item.url);
    const result={text:body,sources,verificationStatus:text(value.verificationStatus,40),language:text(value.language,30),completedAt:Number.isFinite(value.completedAt)&&value.completedAt>=0&&value.completedAt<=now?value.completedAt:now,...metadata(value)};
    if(scope(value.scope))result.scope=scope(value.scope);
    if(Number.isSafeInteger(value.verificationStart)&&value.verificationStart>=2&&value.verificationStart<=body.length&&body.slice(value.verificationStart-2,value.verificationStart)==='\n\n')result.verificationStart=value.verificationStart;
    if(value.verificationFailure?.stage==='verify'&&['TIMEOUT','CONNECTION','LANGUAGE_MISMATCH','RATE_LIMIT','INCOMPLETE','UNKNOWN'].includes(value.verificationFailure.code))result.verificationFailure={stage:'verify',code:value.verificationFailure.code};
    return result;
  }
  function cleanComments(value){
    const list=Array.isArray(value)?value:[];
    return list.slice(0,3).map(item=>text(item,2000).trim()).filter(Boolean);
  }
  function normalizedEntries(input,now,limits=LIMITS){
    const records=new Map();
    for(const value of Array.isArray(input)?input:[]){
      const post=cleanPost(value),last=value?.lastViewedAt,first=value?.firstViewedAt;
      if(!post||!Number.isFinite(last)||last<0||last>now||now-last>=limits.ttlMs)continue;
      const entry={...post,recordId:text(value.recordId,100),firstViewedAt:Number.isFinite(first)&&first>=0&&first<=last?first:last,lastViewedAt:last,visits:Number.isSafeInteger(value.visits)&&value.visits>0?Math.min(value.visits,1_000_000):1};
      const analysis=cleanAnalysis(value.analysis,now);if(analysis)entry.analysis=analysis;
      const comments=cleanComments(value.comments);if(comments.length){entry.comments=comments;entry.commentsCompletedAt=Number.isFinite(value.commentsCompletedAt)&&value.commentsCompletedAt<=now?value.commentsCompletedAt:now;
        if(scope(value.commentsScope))entry.commentsScope=scope(value.commentsScope);
        entry.commentsLanguage=text(value.commentsLanguage,30);if(model(value.commentsModel))entry.commentsModel=model(value.commentsModel);if(value.commentsUsage&&typeof value.commentsUsage==='object')entry.commentsUsage=usage(value.commentsUsage);}
      const previous=records.get(entry.id);if(!previous||previous.lastViewedAt<entry.lastViewedAt)records.set(entry.id,entry);
    }
    const recent=[...records.values()].sort((a,b)=>b.lastViewedAt-a.lastViewedAt).slice(0,limits.maxEntries),kept=[];
    let bytes=2;
    for(const entry of recent){const size=new TextEncoder().encode(JSON.stringify(entry)).byteLength+1;if(bytes+size>limits.maxBytes)continue;bytes+=size;kept.push(entry);}
    return kept;
  }
  function dto(entry){const {recordId,...result}=entry;return copy(result);}
  function create(storage,options={}){
    const now=options.now||(()=>Date.now()),limits={...LIMITS,...options.limits};
    let loaded=false,entries=[],enabled=true,epoch=0,resultEpoch=0,chain=Promise.resolve(),counter=0;
    const boot=`${now()}-${Math.random().toString(36).slice(2)}`,entrySizes=new WeakMap();
    const recordId=()=>`${boot}-${++counter}`;
    const status=()=>({enabled,epoch,count:entries.length,limits:{...limits}});
    const response=()=>({...status(),entries:entries.map(dto)});
    async function load(){
      if(loaded)return;
      const saved=await storage.get([STORAGE_KEY,ENABLED_KEY]),moment=now();
      const normalized=normalizedEntries(saved[STORAGE_KEY],moment,limits);
      for(const entry of normalized)if(!entry.recordId)entry.recordId=recordId();
      const nextEnabled=saved[ENABLED_KEY]!==false;
      if(JSON.stringify(normalized)!==JSON.stringify(saved[STORAGE_KEY]||[]))await storage.set({[STORAGE_KEY]:normalized,[ENABLED_KEY]:nextEnabled});
      entries=normalized;enabled=nextEnabled;loaded=true;
    }
    function bounded(input,moment){
      const recent=input.filter(entry=>entry.lastViewedAt<=moment&&moment-entry.lastViewedAt<limits.ttlMs).sort((a,b)=>b.lastViewedAt-a.lastViewedAt).slice(0,limits.maxEntries),kept=[];
      let bytes=2;
      for(const entry of recent){
        let size=entrySizes.get(entry);if(size===undefined){size=new TextEncoder().encode(JSON.stringify(entry)).byteLength+1;entrySizes.set(entry,size);}
        if(bytes+size<=limits.maxBytes){bytes+=size;kept.push(entry);}
      }
      return kept;
    }
    function run(operation,full=false){
      const task=chain.catch(()=>{}).then(async()=>{
        await load();
        // Entries are sanitized on load and immutable afterwards. Reuse their
        // measured sizes so capturing a result ticket never repeatedly parses
        // or encodes every saved answer in a full history.
        const state={entries:bounded(entries,now()),enabled,epoch,resultEpoch};
        const value=await operation(state);
        state.entries=bounded(state.entries,now());
        if(state.entries.length!==entries.length||state.entries.some((entry,index)=>entry!==entries[index])||state.enabled!==enabled)await storage.set({[STORAGE_KEY]:state.entries,[ENABLED_KEY]:state.enabled});
        entries=state.entries;enabled=state.enabled;epoch=state.epoch;resultEpoch=state.resultEpoch;
        return value===undefined?(full?response():status()):value;
      });
      chain=task;return task;
    }
    const store={
      config(){return {enabled,epoch};},
      get(){return run(()=>{},true);},
      status(){return run(()=>{});},
      prune(){return run(()=>{});},
      invalidateResults(){return run(state=>{state.resultEpoch++;});},
      visit(posts,expectedEpoch){return run(state=>{
        if(!state.enabled||expectedEpoch!==undefined&&expectedEpoch!==state.epoch)return;
        const moment=now(),seen=new Set();
        for(const value of (Array.isArray(posts)?posts:[]).slice(0,30)){
          const post=cleanPost(value);if(!post||seen.has(post.id))continue;seen.add(post.id);
          const index=state.entries.findIndex(entry=>entry.id===post.id),current=state.entries[index];
          if(current)state.entries[index]={...current,...post,lastViewedAt:moment,visits:Math.min(current.visits+1,1_000_000)};
          else state.entries.push({...post,recordId:recordId(),firstViewedAt:moment,lastViewedAt:moment,visits:1});
        }
      });},
      capture(id){return run(state=>{
        const entry=state.enabled&&state.entries.find(value=>value.id===String(id));
        return entry?{id:entry.id,recordId:entry.recordId,epoch:state.resultEpoch}:null;
      });},
      analysis(ticket,value){return run(state=>{
        if(!ticket||!state.enabled||ticket.epoch!==state.resultEpoch)return;
        const index=state.entries.findIndex(item=>item.id===ticket.id&&item.recordId===ticket.recordId),entry=state.entries[index],analysis=cleanAnalysis(value,now());
        if(entry&&analysis)state.entries[index]={...entry,analysis};
      });},
      comments(ticket,value){return run(state=>{
        if(!ticket||!state.enabled||ticket.epoch!==state.resultEpoch)return;
        const index=state.entries.findIndex(item=>item.id===ticket.id&&item.recordId===ticket.recordId),entry=state.entries[index],comments=cleanComments(value?.comments);
        if(entry&&comments.length){
          const {commentsModel,commentsUsage,commentsScope,...previous}=entry;
          const moment=now(),completedAt=Number.isFinite(value.completedAt)&&value.completedAt>=0&&value.completedAt<=moment?value.completedAt:moment;
          state.entries[index]={...previous,comments,commentsCompletedAt:completedAt,commentsLanguage:text(value.language,30),...(scope(value.scope)?{commentsScope:scope(value.scope)}:{}),...(model(value.model)?{commentsModel:model(value.model)}:{}),...(value.usage?{commentsUsage:usage(value.usage)}:{})};
        }
      });},
      clear(){return run(state=>{state.entries=[];state.epoch++;state.resultEpoch++;},true);},
      delete(id){return run(state=>{state.entries=state.entries.filter(entry=>entry.id!==String(id));state.epoch++;},true);},
      setEnabled(value){return run(state=>{if(state.enabled!==value){state.enabled=value;state.epoch++;state.resultEpoch++;}},true);}
    };
    return store;
  }
  return {create,LIMITS,STORAGE_KEY,ENABLED_KEY,normalizedEntries};
});
