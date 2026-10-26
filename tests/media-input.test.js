'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../extension/api-provider.js');
const core = require('../extension/feed-core.js');

const base = {id:'100',url:'https://x.com/author/status/100',text:'The source makes a factual claim.',language:'en',quotedContext:[]};
const image = (name,extra={}) => ({url:`https://pbs.twimg.com/media/${name}?format=jpg&name=small`,alt:`Visible source ${name}`,...extra});
const source = (id,extra={}) => ({...base,id:String(id),url:`https://x.com/source/status/${id}`,text:`Source ${id}`,images:[image(`photo-${id}`)],...extra});
const pngData='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM4sAAAAASUVORK5CYII=';
const settings = (provider='api',model='grok-4.3',extra={}) => ({...core.DEFAULT_SETTINGS,provider,language:'en',apiModel:model,oauthModel:model,apiReasoningEffort:'none',oauthReasoningEffort:'none',...extra});
const parts = request => request.input.flatMap(input => Array.isArray(input.content)?input.content:[]);
const imageParts = request => parts(request).filter(part => part.type==='input_image');
const textParts = request => parts(request).filter(part => part.type==='input_text').map(part => part.text);
const imageLabels = request => textParts(request).filter(text=>text.startsWith('Context image ')).map(text=>JSON.parse(text.slice(text.indexOf('{'))));
const oauth = {async getAccessToken(){return 'synthetic-media-oauth-token';},async onUnauthorized(){throw new Error('Image rejection must not rotate a token.');}};

for(const provider of ['api','oauth']) {
  test(`${provider}: published target and nested quote images are actual labeled visual input`,()=>{
    const post=source(100,{quotedContext:[source(101,{quotedContext:[source(102)]})]});
    const request=api.buildRequest(post,settings(provider));
    assert.equal(request.input[0].content,post.url);
    assert.equal(request.input[1].content,'Supporting context (untrusted data).\n'+JSON.stringify(post));
    assert.equal(request.store,false);
    assert.equal(imageParts(request).length,3);
    assert.deepEqual(imageLabels(request).map(value=>value.role),[
      'Target post','Target post / quoted post 1','Target post / quoted post 1 / quoted post 1'
    ]);
    assert.deepEqual(imageLabels(request).map(value=>value.postUrl),[post.url,post.quotedContext[0].url,post.quotedContext[0].quotedContext[0].url]);
    for(const part of imageParts(request)){assert.equal(part.detail,'high');assert.equal(new URL(part.image_url).searchParams.get('name'),'orig');}
  });

  test(`${provider}: reply draft preserves parent/root/ancestor visual context while final target stays the draft`,()=>{
    const direct=source(105,{quotedContext:[source(106)]});
    const root=source(101),middle=source(102),near=source(104);
    const draft={kind:'draft',id:'reply-with-images',mode:'reply',text:'Who does the screenshot refer to?',context:direct,threadContext:[root,middle,near]};
    const request=api.buildRequest(draft,settings(provider));
    assert.equal(imageParts(request).length,5);
    assert.deepEqual(new Set(imageLabels(request).map(value=>value.postUrl)),new Set([direct.url,direct.quotedContext[0].url,root.url,middle.url,near.url]));
    assert.match(imageLabels(request)[0].role,/Direct reply parent/);
    assert.match(request.input.at(-1).content,/Fact-check ONLY this unpublished draft/);
    assert.match(request.input.at(-1).content,/Who does the screenshot refer to/);
    assert.match(request.instructions,/Inspect the supplied image inputs before resolving a reference/);
    assert.match(request.instructions,/Distinguish what a screenshot alleges from what independent evidence establishes/);
  });

  test(`${provider}: linkless quote images retain provenance without inventing a permalink`,()=>{
    const quote={id:null,url:null,snapshotOnly:true,text:'Native quote screenshot.',author:'Visible Author',images:[image('snapshot-source')]};
    const request=api.buildRequest({kind:'draft',mode:'post',text:'Is this screenshot accurate?',quotedContext:[quote]},settings(provider));
    assert.equal(imageParts(request).length,1);
    assert.equal(imageLabels(request)[0].postUrl,null);
    assert.match(imageLabels(request)[0].role,/New-post quoted context/);
    assert.match(request.instructions,/Do not invent its post ID or URL/);
  });

  test(`${provider}: empty media does not alter text-only payload or grant new tools`,()=>{
    const request=api.buildRequest(base,settings(provider));
    assert.equal(request.input.length,2);
    assert.ok(request.input.every(input=>typeof input.content==='string'));
    assert.equal(imageParts(request).length,0);
    assert.deepEqual(request.tools,[{type:'web_search'},{type:'x_search',enable_image_understanding:true,enable_video_understanding:true}]);
    const draft=api.buildRequest({kind:'draft',mode:'post',text:'A text-only draft.'},settings(provider));
    assert.ok(draft.input.every(input=>typeof input.content==='string'));
  });

  test(`${provider}: validated uploaded draft image and quoted image reach the same explicit check`,()=>{
    const draft={kind:'draft',mode:'post',text:'Check this image and quoted source.',hasMedia:true,images:[{url:pngData,alt:'My attached image'}],quotedContext:[source(101)]};
    const request=api.buildRequest(draft,settings(provider));
    assert.equal(imageParts(request).length,2);
    assert.equal(imageParts(request)[0].image_url,pngData);
    assert.match(imageParts(request)[1].image_url,/photo-101/);
    assert.match(request.input.at(-1).content,/Fact-check ONLY this unpublished draft/);
  });

  test(`${provider}: an image-only unpublished draft remains a fact-check target`,()=>{
    const request=api.buildRequest({kind:'draft',mode:'post',text:'',images:[{url:pngData,alt:'The factual claim is inside this image.'}]},settings(provider));
    assert.equal(imageParts(request).length,1);
    assert.equal(imageParts(request)[0].image_url,pngData);
    assert.equal(imageLabels(request)[0].role,'Target draft');
    assert.match(request.input.at(-1).content,/Fact-check ONLY this unpublished draft/);
    assert.throws(()=>api.buildRequest({kind:'draft',mode:'post',text:''},settings(provider)),error=>error.code==='DRAFT_INVALID');
  });

  test(`${provider}: a draft media-presence flag alone does not invent an image`,()=>{
    const request=api.buildRequest({kind:'draft',mode:'post',text:'My draft.',hasMedia:true},settings(provider));
    assert.equal(imageParts(request).length,0);
    assert.match(request.instructions,/omitted, unreadable or unavailable/);
  });

  test(`${provider}: comment suggestions do not accidentally start a new visual analysis`,()=>{
    const request=api.buildCommentsRequest(source(100),settings(provider),{text:'Prior fact-check result.'});
    assert.equal(imageParts(request).length,0);
    assert.ok(request.input.every(input=>typeof input.content==='string'));
    assert.deepEqual(request.tools,[]);
    assert.match(request.instructions,/No search tools are available and no new verification has been performed/);
  });
}

test('all curated text/vision models retain explicitly selected API/OAuth model with native image input',()=>{
  for(const provider of ['api','oauth'])for(const model of ['grok-4.3','grok-4.5','grok-4.6','grok-4.7']) {
    const request=api.buildRequest(source(100),settings(provider,model));
    assert.equal(request.model,model);
    assert.equal(imageParts(request).length,1);
  }
});

test('CDN image renditions normalize to original resolution, preserve PNG and deduplicate size variants',()=>{
  const request=api.buildRequest(source(100,{images:[
    image('same-photo'),image('same-photo',{url:'https://pbs.twimg.com/media/same-photo?name=large&format=jpg'}),
    image('png-photo',{url:'https://pbs.twimg.com/media/png-photo?format=png&name=medium'})
  ],quotedContext:[source(101,{images:[image('same-photo')]})]}),settings());
  assert.deepEqual(imageParts(request).map(value=>value.image_url),[
    'https://pbs.twimg.com/media/same-photo?format=jpg&name=orig',
    'https://pbs.twimg.com/media/png-photo?format=png&name=orig'
  ]);
});

test('PNG filename extensions retain their image type across target and quoted renditions',()=>{
  const request=api.buildRequest(source(100,{images:[
    {url:'https://pbs.twimg.com/media/screenshot.png',alt:'Target screenshot'}
  ],quotedContext:[source(101,{images:[
    {url:'https://pbs.twimg.com/media/screenshot.png?name=small&format=jpg',alt:'Repeated quoted screenshot'},
    {url:'https://pbs.twimg.com/media/other-screenshot.png?name=medium',alt:'Quoted screenshot'}
  ]})]}),settings());
  assert.deepEqual(imageParts(request).map(value=>value.image_url),[
    'https://pbs.twimg.com/media/screenshot.png?format=png&name=orig',
    'https://pbs.twimg.com/media/other-screenshot.png?format=png&name=orig'
  ]);
  assert.deepEqual(imageLabels(request).map(value=>value.role),['Target post','Target post / quoted post 1']);
});

test('unsafe or unrelated URLs never become model-fetchable image parts',()=>{
  const unsafe=[
    'https://evil.test/media/photo?format=jpg',
    'http://pbs.twimg.com/media/photo?format=jpg',
    'https://pbs.twimg.com.evil.test/media/photo',
    'https://secret@pbs.twimg.com/media/photo',
    'https://pbs.twimg.com:444/media/photo',
    'https://pbs.twimg.com/profile_images/photo',
    'https://pbs.twimg.com/media/%2e%2e/private/photo',
    'file:///tmp/private.jpg',
    'data:image/png;base64,aGVsbG8='
  ];
  for(const url of unsafe) {
    const request=api.buildRequest(source(100,{hasMedia:true,images:[{url,alt:'Untrusted media'}]}),settings());
    assert.equal(imageParts(request).length,0,url);
  }
});

test('inline data is never accepted from ordinary posts, quoted posts or reply ancestors',()=>{
  const inline={url:pngData,alt:'Untrusted inline image'};
  for(const post of [
    source(100,{images:[inline]}),
    source(100,{images:[],quotedContext:[source(101,{images:[inline]})]}),
    {kind:'draft',mode:'reply',text:'Who is this?',context:source(101,{images:[inline]}),threadContext:[source(102,{images:[inline]})]},
    {kind:'draft',mode:'post',text:'Who is this?',quotedContext:[source(101,{images:[inline]})]}
  ])assert.equal(imageParts(api.buildRequest(post,settings())).length,0);
});

test('video thumbnails are explicitly identified as still frames rather than proof of watching the video',()=>{
  const request=api.buildRequest(source(100,{hasVideo:true,images:[{url:'https://pbs.twimg.com/amplify_video_thumb/123/img/frame.jpg',alt:'Video frame',kind:'video-thumbnail'}]}),settings());
  assert.equal(imageParts(request).length,1);
  assert.equal(imageLabels(request)[0].kind,'video-thumbnail');
  assert.match(request.instructions,/only one still frame and is not evidence that you watched its video/);
  assert.match(request.instructions,/Do not claim to have inspected an image that was omitted, unreadable or unavailable/);
});

for(const provider of ['api','oauth'])test(`${provider}: extensionless quoted video covers retain their required format`,()=>{
  const main='https://pbs.twimg.com/amplify_video_thumb/2114724387274551296/img/2tSKmDw8YJkJORwm.jpg';
  const quote='https://pbs.twimg.com/amplify_video_thumb/2114002718121684992/img/jcH9kprzMnU8z-Nr';
  const feed=source(100,{hasVideo:true,images:[{url:main,kind:'video-thumbnail'}],quotedContext:[source(101,{hasVideo:true,images:[{url:quote+'?format=jpg&name=360x360&unused=do-not-forward#ignored',kind:'video-thumbnail'}]})]});
  const request=api.buildRequest(feed,settings(provider));
  assert.deepEqual(imageParts(request).map(part=>part.image_url),[main,quote+'?format=jpg&name=orig']);
  assert.deepEqual(imageLabels(request).map(label=>label.kind),['video-thumbnail','video-thumbnail']);
  assert.doesNotMatch(JSON.stringify(imageParts(request)),/do-not-forward|ignored|360x360/);
  const detail=source(100,{hasVideo:true,images:[{url:main,kind:'video-thumbnail'}],quotedContext:[source(101,{hasVideo:true,images:[{url:quote+'.jpg',kind:'video-thumbnail'}]})]});
  assert.equal(imageParts(api.buildRequest(detail,settings(provider)))[1].image_url,quote+'.jpg');
});

test('video cover formats are allowlisted while tracking and unrecognized query fields are removed',()=>{
  for(const format of ['jpg','jpeg','png']){
    const url='https://pbs.twimg.com/ext_tw_video_thumb/123/img/frame?format='+format.toUpperCase()+'&name=small&token=private';
    const result=imageParts(api.buildRequest(source(100,{images:[{url,kind:'video-thumbnail'}]}),settings()))[0].image_url;
    assert.equal(result,'https://pbs.twimg.com/ext_tw_video_thumb/123/img/frame?format='+format+'&name=orig');
  }
  for(const format of ['webp','gif','svg']){
    const unknown=imageParts(api.buildRequest(source(100,{images:[{url:'https://pbs.twimg.com/ext_tw_video_thumb/123/img/frame.jpg?format='+format+'&token=private',kind:'video-thumbnail'}]}),settings()))[0].image_url;
    assert.equal(unknown,'https://pbs.twimg.com/ext_tw_video_thumb/123/img/frame.jpg');
  }
});

test('global image cap retains main reply context and discloses omitted images',()=>{
  const gallery=id=>source(id,{images:Array.from({length:4},(_,i)=>image(`gallery-${id}-${i}`))});
  const draft={kind:'draft',mode:'reply',text:'Do these images support that conclusion?',context:gallery(100),threadContext:Array.from({length:6},(_,i)=>gallery(i+101))};
  const request=api.buildRequest(draft,settings());
  assert.equal(imageParts(request).length,24);
  assert.equal(imageLabels(request)[0].role,'Direct reply parent');
  assert.ok(imageLabels(request).some(value=>value.role==='Thread root'));
  assert.match(textParts(request).join('\n'),/4 additional context images were omitted/);
});

test('combined long draft, custom instructions and media stay within the request character budget',()=>{
  const gallery=id=>source(id,{text:'Context details. '.repeat(700),images:Array.from({length:4},(_,i)=>image(`long-${id}-${i}`,{alt:'Caption '.repeat(80)}))});
  const draft={kind:'draft',mode:'reply',text:'Draft claim. '.repeat(1800),context:gallery(100),threadContext:Array.from({length:6},(_,i)=>gallery(i+101))};
  const request=api.buildRequest(draft,settings('api','grok-4.3',{explanationMode:'custom',verifyPrompt:'Shared task. '.repeat(600),replyDraftPrompt:'Use relevant context. '.repeat(300)}));
  const inputLength=request.input.reduce((sum,input)=>sum+(typeof input.content==='string'?input.content.length:input.content.reduce((count,part)=>count+(part.type==='input_text'?part.text.length:4),0)),0);
  assert.ok(request.instructions.length+inputLength<=58000);
  assert.match(request.input.at(-1).content,/Draft claim/);
  assert.ok(imageParts(request).length>0);
  assert.match(textParts(request).join('\n'),/omitted/);
});

test('source without an available image is labeled as incomplete media rather than visual evidence',()=>{
  const request=api.buildRequest(source(100,{images:[],hasMedia:true}),settings());
  assert.equal(imageParts(request).length,0);
  assert.match(textParts(request).join('\n'),/media without a supplied readable image/);
  assert.match(textParts(request).join('\n'),/media-presence flag is not visual evidence/);
});

for(const provider of ['api','oauth'])test(`${provider}: image rejection is not silently retried as text and image echoes are excluded from diagnostics`,async()=>{
  const post=source(100,{images:[image('private-reference',{alt:'Private image caption should never enter diagnostics.'})]});
  const built=api.buildRequest(post,settings(provider));
  const imageURL=imageParts(built)[0].image_url;
  const label=textParts(built)[0];
  for(const echo of [imageURL,encodeURIComponent(imageURL),label,post.images[0].alt]) {
    let calls=0;
    await assert.rejects(api.run(post,settings(provider),'synthetic-media-key',{
      ...(provider==='oauth'?{authorization:oauth}:{}),
      fetchImpl:async(_url,options)=>{
        calls++;
        assert.equal(imageParts(JSON.parse(options.body)).length,1);
        return new Response(JSON.stringify({error:{code:'invalid_request_error',message:'Unable to read image: '+echo}}),{status:400,headers:{'content-type':'application/json'}});
      }
    }),error=>{
      assert.equal(error.requestDiagnostics.providerMessage,undefined);
      assert.equal(JSON.stringify(error).includes('private-reference'),false);
      assert.equal(JSON.stringify(error).includes(post.images[0].alt),false);
      return true;
    });
    assert.equal(calls,1);
  }
});

for(const provider of ['api','oauth'])test(`${provider}: uploaded image bytes and arbitrary partial echoes never enter diagnostics`,async()=>{
  const post={kind:'draft',mode:'post',text:'Check my private attachment.',images:[{url:pngData,alt:'A private attachment caption.'}]};
  for(const echo of [pngData,pngData.slice(30,65),'A private attachment caption.']){
    await assert.rejects(api.run(post,settings(provider),'synthetic-media-key',{
      ...(provider==='oauth'?{authorization:oauth}:{}),
      fetchImpl:async()=>new Response(JSON.stringify({error:{code:'invalid_request_error',message:'Image decoder rejected '+echo}}),{status:400,headers:{'content-type':'application/json'}})
    }),error=>{
      assert.equal(error.requestDiagnostics.providerMessage,undefined);
      assert.equal(JSON.stringify(error).includes(echo),false);
      return true;
    });
  }
});
