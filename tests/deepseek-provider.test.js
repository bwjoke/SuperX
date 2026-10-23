'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../extension/feed-core.js');
const DeepSeek=require('../extension/deepseek-provider.js');
const settings=(extra={})=>Core.normalizeSettings({...Core.DEFAULT_SETTINGS,provider:'api',apiBackend:'deepseek',deepseekXSource:'twikit',...extra});
const post={id:'123',url:'https://x.com/example/status/123',text:'A claim.'};
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const tool=(name,args,id='call1')=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const plan=calls=>json({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:calls}}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}});
const stop=()=>json({choices:[{finish_reason:'stop',message:{role:'assistant',content:'Ready.'}}]});
function stream(text='Evidence supports this. [Source](https://example.org/evidence)',finish='stop') {
  const events=[{choices:[{delta:{content:text.slice(0,8)}}]},{choices:[{delta:{content:text.slice(8)},finish_reason:finish}]},{choices:[],usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}}];
  return new Response(events.map(v=>'data: '+JSON.stringify(v)+'\n\n').join('')+'data: [DONE]\n\n');
}
test('DeepSeek uses Twikit and its own search API, streams the final answer, and never sends its key locally',async()=>{
  const calls=[],updates=[];let chats=0;
  const fetchImpl=async(url,init)=>{
    const body=JSON.parse(init.body);calls.push({url,body,headers:init.headers});
    if(url.endsWith('/read'))return json({posts:[{url:post.url,text:'Full original',author:'example'}]});
    if(url.endsWith('/v1/tools/search'))return json({results:[{url:'https://example.org/evidence',title:'Primary evidence',content:'Confirmed.'}]});
    if(body.stream)return stream();
    return ++chats===1?plan([tool('read_x_post',{url:post.url}),tool('web_search',{query:'claim evidence'},'call2')]):stop();
  };
  const result=await DeepSeek.run(post,settings(),'secret',{fetchImpl,onUpdate:u=>updates.push(u)});
  assert.equal(result.verificationStatus,'completed');assert.equal(result.searched,true);
  assert.equal(result.sources.length,2);assert.equal(result.usage.total_tokens,45);
  assert.equal(result.model,'deepseek-flash');assert.ok(updates.filter(u=>u.text).length>=2);
  assert.equal(calls.find(c=>c.url.endsWith('/read')).headers.Authorization,undefined);
  for(const c of calls.filter(c=>c.url.startsWith('https:')))assert.equal(c.headers.Authorization,'Bearer secret');
  assert.ok(calls.every(c=>!c.url.includes('x.ai')));
  const search=calls.find(c=>c.url.endsWith('/v1/tools/search'));
  assert.deepEqual(search.body,{query:'claim evidence',count:5,need_content:true});
  assert.equal(calls[0].body.tool_choice,'required');
});
test('disabled search tools cannot be invoked by the model',async()=>{
  let count=0;
  const context={sources:[],fetchImpl:async()=>{count++;throw Error('unexpected');}};
  await assert.rejects(DeepSeek.executeTool(tool('x_search',{query:'test'}),settings({xSearch:false}),context),{code:'DEEPSEEK_TOOL'});
  await assert.rejects(DeepSeek.executeTool(tool('web_search',{query:'test'}),settings({webSearch:false}),context),{code:'DEEPSEEK_TOOL'});
  await assert.rejects(DeepSeek.executeTool(tool('read_x_post',{url:'https://evil.example/secret'}),settings(),context),{code:'DEEPSEEK_TOOL'});
  assert.equal(count,0);
});
test('failed retrieval is disclosed, never labeled a completed verification',async()=>{
  let chats=0;
  const result=await DeepSeek.run(post,settings(),'secret',{fetchImpl:async(url,init)=>{
    const body=JSON.parse(init.body);
    if(url.endsWith('/read'))return new Response('private provider body',{status:401});
    if(body.stream)return stream('Original could not be retrieved.');
    return ++chats===1?plan([tool('read_x_post',{url:post.url})]):stop();
  }});
  assert.equal(result.verificationStatus,'incomplete');assert.equal(result.searched,false);assert.match(result.warning,/检索失败/);
  assert.doesNotMatch(JSON.stringify(result),/private provider body|secret/);
});
test('a truncated stream retains partial answer and cannot pass as completed',async()=>{
  await assert.rejects(DeepSeek.run(post,settings({xSearch:false}),'secret',{fetchImpl:async(_url,init)=>JSON.parse(init.body).stream?stream('Partial evidence.','length'):stop()}),e=>{
    assert.equal(e.code,'OUTPUT_LIMIT');assert.equal(e.partialResult.text,'Partial evidence.');return true;
  });
});
test('tool call budgets and cancellation are enforced',async()=>{
  await assert.rejects(DeepSeek.run(post,settings(),'secret',{fetchImpl:async()=>plan(Array.from({length:9},(_,i)=>tool('x_search',{query:'test'},String(i))))}),{code:'DEEPSEEK_TOOL_LIMIT'});
  const controller=new AbortController();controller.abort();let requests=0;
  await assert.rejects(DeepSeek.run(post,settings(),'secret',{signal:controller.signal,fetchImpl:async()=>{requests++;}}),{name:'AbortError'});
  assert.equal(requests,0);
});
test('comments use DeepSeek without any search tools',async()=>{
  const result=await DeepSeek.generateComments(post,settings(),'secret',{fetchImpl:async(url,init)=>{
    assert.equal(url,'https://api.deepseek.com/chat/completions');const body=JSON.parse(init.body);assert.equal(body.tools,undefined);
    return json({choices:[{finish_reason:'stop',message:{content:'["One perspective.","A second angle.","A third thought."]'}}]});
  }});
  assert.equal(result.comments.length,3);assert.equal(result.searched,false);
});
test('browser X mode injects its reader and never contacts Twikit or forwards the DeepSeek key',async()=>{
  const invocations=[];let chats=0;
  const result=await DeepSeek.run(post,settings({deepseekXSource:'browser',webSearch:false}),'secret',{
    xReader:{read:async(...args)=>{invocations.push(args);return {posts:[{url:post.url,text:'Browser original'}],unresolved_post_ids:['456'],complete_thread:false};}},
    fetchImpl:async(url,init)=>{
      assert.ok(url.startsWith('https://api.deepseek.com/'));const body=JSON.parse(init.body);
      if(body.stream)return stream();
      if(++chats===1)return plan([tool('read_x_post',{url:post.url})]);
      const evidence=body.messages.find(m=>m.role==='tool').content;
      assert.match(evidence,/unresolved_post_ids/);assert.doesNotMatch(evidence,/secret/);return stop();
    }
  });
  assert.equal(result.searched,true);assert.equal(invocations.length,1);
  assert.equal(invocations[0][0],post.url);assert.deepEqual(Object.keys(invocations[0][1]),['signal']);
});

test('DeepSeek defaults to no thinking and normalizes supported reasoning selections',async()=>{
  assert.equal(settings().deepseekReasoningEffort,'none');
  assert.equal(settings({deepseekReasoningEffort:'invalid'}).deepseekReasoningEffort,'none');
  for(const effort of ['none','low','medium','high','max']){
    const value=settings({deepseekReasoningEffort:effort,xSearch:false});
    assert.equal(Core.providerEffort(value),effort);let count=0;
    await DeepSeek.run(post,value,'secret',{fetchImpl:async(_url,init)=>{
      const body=JSON.parse(init.body);count++;
      assert.equal(body.thinking.type,effort==='none'?'disabled':'enabled');
      assert.equal(body.reasoning_effort,effort==='medium'?'high':effort);
      assert.equal(body.max_tokens,effort==='none'?2400:effort==='low'?8192:effort==='max'?32768:16384);
      return body.stream?stream():stop();
    }});
    assert.equal(count,2);
  }
});

test('thinking-mode planning preserves reasoning context through tool turns and final synthesis',async()=>{
  let chats=0;const updates=[];
  await DeepSeek.run(post,settings({deepseekReasoningEffort:'high'}),'secret',{
    onUpdate:u=>updates.push(u),fetchImpl:async(url,init)=>{
      const body=JSON.parse(init.body);
      if(url.endsWith('/read'))return json({posts:[{url:post.url,text:'Original'}]});
      if(++chats===1)return json({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,reasoning_content:'PRIVATE_REASONING_1',tool_calls:[tool('read_x_post',{url:post.url})]}}]});
      assert.equal(body.messages.find(m=>m.role==='assistant').reasoning_content,'PRIVATE_REASONING_1');
      if(body.stream){assert.equal(body.messages.filter(m=>m.role==='assistant')[1].reasoning_content,'PRIVATE_REASONING_2');return stream();}
      return json({choices:[{finish_reason:'stop',message:{role:'assistant',content:'Ready to answer',reasoning_content:'PRIVATE_REASONING_2'}}]});
    }
  });
  assert.doesNotMatch(JSON.stringify(updates),/PRIVATE_REASONING/);
});

test('native fetch keeps its worker receiver for both planning and streamed generation',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async function(_url,init){
    assert.equal(this,globalThis,'browser fetch requires its global receiver');calls++;
    return JSON.parse(init.body).stream?stream():stop();
  };
  try{await DeepSeek.run(post,settings({xSearch:false}),'secret');assert.equal(calls,2);}
  finally{globalThis.fetch=original;}
});

test('DeepSeek and Twikit network failures have separate safe errors',async()=>{
  const fetchImpl=async()=>{throw new TypeError('PRIVATE_NETWORK_DETAILS');};
  await assert.rejects(DeepSeek.run(post,settings(),'secret',{fetchImpl}),e=>{
    assert.equal(e.code,'DEEPSEEK_CONNECTION');assert.doesNotMatch(DeepSeek.publicError(e).error,/Twikit|PRIVATE/);return true;
  });
  await assert.rejects(DeepSeek.executeTool(tool('read_x_post',{url:post.url}),settings(),{fetchImpl,sources:[]}),e=>{
    assert.equal(e.code,'TWIKIT_CONNECTION');assert.match(DeepSeek.publicError(e).error,/Twikit/);return true;
  });
});
