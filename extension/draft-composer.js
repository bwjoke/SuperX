(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.SuperXDraftComposer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const EDITOR='[contenteditable="true"][data-testid^="tweetTextarea_"], [role="textbox"][data-testid^="tweetTextarea_"]';
  const PUBLISH='[data-testid="tweetButton"], [data-testid="tweetButtonInline"]';
  const OWN='superx-draft-action, superx-draft-panel';
  const CONTEXT_NODES='[data-testid="tweet"], article[role="article"], [data-testid="quoteTweet"], [data-testid="quotedTweet"], [data-testid="quoted-post"], [data-testid="card.wrapper"], [role="link"], button';
  const MAX_TEXT=30000,MAX_RETAINED=24,MAX_DRAFT_IMAGES=4,MAX_DRAFT_IMAGE_BYTES=8*1024*1024,IMAGE_CAPTURE_TIMEOUT_MS=20000;
  const ACTIVE=new Set(['waking','queued','running','retry-wait']);
  const RECEIPTS=new Set(['QUEUED','START','UPDATE','RESULT','ERROR','RETRY_WAIT']);

  function create(options={}){
    const document=options.document||root.document,view=document?.defaultView||root;
    if(!document?.body)return null;
    const Core=options.core||root.XGrokCore;
    const text=(key,vars)=>options.t?.(key,vars)||key;
    const bindings=new Map(),states=new Set(),requests=new Map(),gutterLeases=new Map();
    const externallyChangedGutters=new WeakSet();
    let byEditor=new WeakMap(),capturedThread=null;
    let config={settings:Core?.DEFAULT_SETTINGS||{},ready:false,connected:false,hasConfig:false,identity:''};
    let acceptedConfig,disposed=false,scanTimer,scanning=false;
    function pageAllowed(){
      try{
        if(typeof options.isPageAllowed==='function')return options.isPageAllowed()===true;
        // Production uses the shared route policy. A document-free test host
        // without a location can still supply a small isolated DOM fixture.
        const pathname=view.location?.pathname;
        return typeof pathname!=='string'||Core?.isSupportedXPath?.(pathname)===true;
      }catch{return false;}
    }
    function allowPage(){
      if(disposed)return false;
      if(pageAllowed())return true;
      // A SPA route change does not unload this script. Stop retained work and
      // remove draft buffers before reading any composer or thread on the page.
      clearState({cancelRequests:true});return false;
    }
    const element=(tag,className,value)=>{
      const node=document.createElement(tag);if(className)node.className=className;
      if(value!==undefined)node.textContent=value;return node;
    };
    const setText=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
    const button=(className,callback)=>{
      const node=element('button',className);node.type='button';
      node.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation();
        if(event.isTrusted&&allowPage())callback();
      });return node;
    };
    const uuid=()=>view.crypto?.randomUUID?.()||root.crypto?.randomUUID?.()||'draft_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
    const own=node=>Boolean(node?.closest?.(OWN));
    const isActive=state=>ACTIVE.has(state.status);
    const hasContent=value=>Boolean(value?.text||value?.imageSources?.length);
    function shown(node){
      if(!node?.isConnected||own(node))return false;
      for(let current=node;current&&current!==document;current=current.parentElement){
        if(current.hidden||current.getAttribute?.('aria-hidden')==='true'||current.hasAttribute?.('inert'))return false;
        const css=view.getComputedStyle?.(current);
        if(css&&(css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse'||css.contentVisibility==='hidden'))return false;
      }
      const rect=node.getBoundingClientRect();return rect.width>0&&rect.height>0;
    }
    function editorsIn(node){
      return Array.from(node.querySelectorAll(EDITOR)).filter(editor=>shown(editor)&&!editor.querySelector(EDITOR));
    }
    function boundedHeight(node,css=view.getComputedStyle(node),depth=4){
      if(css.maxHeight&&css.maxHeight!=='none')return true;
      if(['absolute','fixed'].includes(css.position)&&css.top!=='auto'&&css.bottom!=='auto')return true;
      // Typed OM preserves `auto`, unlike getComputedStyle().height, which
      // returns the used pixel height even for an unconstrained wrapper.
      try{
        const height=node.computedStyleMap?.().get('height')?.toString();
        if(height&&!['auto','max-content','min-content','fit-content'].includes(height))return true;
      }catch{}
      const parent=node.parentElement;
      if(depth>0&&parent&&parent!==document.body){
        const parentCSS=view.getComputedStyle(parent);
        const constrainedItem=parentCSS.display.includes('grid')||
          parentCSS.display.includes('flex')&&parentCSS.flexDirection==='column'&&Number.parseFloat(css.flexShrink)>0;
        if(constrainedItem)return boundedHeight(parent,parentCSS,depth-1);
      }
      return false;
    }
    function modalScrollers(binding){
      const dialog=binding.location.dialog,panel=binding.state?.panel,candidates=new Set();
      if(!dialog||!panel?.isConnected)return candidates;
      for(let node=panel.parentElement;node&&node!==document.body&&node!==document.documentElement&&node!==document.scrollingElement;node=node.parentElement){
        if(own(node)||!node.contains(binding.editor)||!shown(node))continue;
        const css=view.getComputedStyle(node);
        if(!['auto','scroll'].includes(css.overflowY))continue;
        // Once confirmed, keep the reservation when Hide removes overflow.
        // Only a detached editor or a different scroll/layout mode releases it.
        if(binding.scrollers?.has(node)||node===dialog||node.scrollHeight>node.clientHeight+1||boundedHeight(node,css))candidates.add(node);
      }
      return candidates;
    }
    function releaseGutter(binding,node){
      binding.scrollers?.delete(node);
      const lease=gutterLeases.get(node);if(!lease)return;
      lease.owners.delete(binding);if(lease.owners.size)return;
      // Restore only our own write. A subsequent change by X takes priority.
      if(node.style.getPropertyValue('scrollbar-gutter')===lease.ownedValue&&node.style.getPropertyPriority('scrollbar-gutter')===lease.ownedPriority){
        if(lease.value)node.style.setProperty('scrollbar-gutter',lease.value,lease.priority);
        else node.style.removeProperty('scrollbar-gutter');
      }else externallyChangedGutters.add(node);
      gutterLeases.delete(node);
    }
    function updateGutters(binding){
      const wanted=modalScrollers(binding);let changed=false;
      binding.scrollers||=new Set();
      for(const node of binding.scrollers){
        const lease=gutterLeases.get(node);
        if(lease&&(node.style.getPropertyValue('scrollbar-gutter')!==lease.ownedValue||node.style.getPropertyPriority('scrollbar-gutter')!==lease.ownedPriority))externallyChangedGutters.add(node);
        if(!wanted.has(node)||externallyChangedGutters.has(node)){releaseGutter(binding,node);changed=true;}
      }
      for(const node of wanted){
        if(binding.scrollers.has(node)||externallyChangedGutters.has(node))continue;
        let lease=gutterLeases.get(node);
        if(!lease){
          if(view.getComputedStyle(node).scrollbarGutter?.includes('stable'))continue;
          lease={owners:new Set(),value:node.style.getPropertyValue('scrollbar-gutter'),priority:node.style.getPropertyPriority('scrollbar-gutter'),ownedValue:'stable',ownedPriority:''};
          node.style.setProperty('scrollbar-gutter','stable');
          if(node.style.getPropertyValue('scrollbar-gutter')!=='stable')continue;
          // Respect a stronger native rule instead of claiming a reservation
          // that did not take effect, or repeatedly fighting X's stylesheet.
          if(!view.getComputedStyle(node).scrollbarGutter?.includes('stable')){
            if(lease.value)node.style.setProperty('scrollbar-gutter',lease.value,lease.priority);
            else node.style.removeProperty('scrollbar-gutter');
            externallyChangedGutters.add(node);continue;
          }
          gutterLeases.set(node,lease);
          changed=true;
        }
        lease.owners.add(binding);binding.scrollers.add(node);
      }
      return changed;
    }
    function nativeBoundary(group,editor,dialog){
      // Keep X's existing composer edge in place. Inserting the answer inside
      // the composer pushes that edge down and replaces it with a second,
      // narrower line whenever the answer is opened.
      for(let node=group,depth=0;node&&depth<48;node=node.parentElement,depth++){
        if(node===document.body||node===dialog||node.matches('main, [data-testid="primaryColumn"]'))break;
        if(node.querySelector('article[data-testid="tweet"]')||editorsIn(node).length!==1)break;
        const parent=node.parentElement;if(!parent)break;
        const parentCSS=view.getComputedStyle(parent),nodeCSS=view.getComputedStyle(node),rect=node.getBoundingClientRect();
        const stacking=['block','flow-root'].includes(parentCSS.display)||
          /^(inline-)?flex$/.test(parentCSS.display)&&parentCSS.flexDirection==='column';
        if(!stacking||['absolute','fixed'].includes(nodeCSS.position)||rect.width<=0||!node.contains(editor))continue;
        let next=node.nextElementSibling;while(next&&own(next))next=next.nextElementSibling;
        if(next&&shown(next)&&!next.textContent.trim()&&!next.querySelector('button, input, textarea, [contenteditable], [role="button"], a, img, svg, video, canvas')){
          const edge=next.getBoundingClientRect(),css=view.getComputedStyle(next);
          const filled=css.backgroundColor&&css.backgroundColor!=='transparent'&&!/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(css.backgroundColor);
          const bordered=Number.parseFloat(css.borderTopWidth)>0||Number.parseFloat(css.borderBottomWidth)>0;
          if(!['absolute','fixed'].includes(css.position)&&(filled||bordered)&&edge.height>0&&edge.height<=2.5&&Math.abs(edge.left-rect.left)<1&&Math.abs(edge.width-rect.width)<1)
            return {panelAnchor:next,nativeBoundary:next,boundaryKind:'separator'};
        }
        if(Number.parseFloat(nodeCSS.borderBottomWidth)>0)
          return {panelAnchor:node,nativeBoundary:node,boundaryKind:'border'};
      }
      return null;
    }
    function outsideStickyFooter(group,editor,publish,dialog){
      let sticky=false;
      for(let node=publish;node&&node!==group;node=node.parentElement){
        if(['sticky','fixed'].includes(view.getComputedStyle(node).position)){sticky=true;break;}
      }
      if(!sticky)return null;
      const embeddedPosts=new Set(group.querySelectorAll('article[data-testid="tweet"]'));
      // Keep the answer outside the native sticky footer's containing block.
      // A row may include the avatar alongside the editor: climb past that
      // row before inserting, rather than becoming another horizontal item.
      for(let frame=group,depth=0;frame&&depth<48;frame=frame.parentElement,depth++){
        if(frame===document.body||frame===dialog||frame.matches('main, [data-testid="primaryColumn"]'))break;
        if(Array.from(frame.querySelectorAll('article[data-testid="tweet"]')).some(post=>!embeddedPosts.has(post))||editorsIn(frame).length!==1)break;
        const parent=frame.parentElement;if(!parent)break;
        const css=view.getComputedStyle(parent),box=view.getComputedStyle(frame);
        const stacking=['block','flow-root'].includes(css.display)||
          /^(inline-)?flex$/.test(css.display)&&css.flexDirection==='column';
        if(stacking&&!['absolute','fixed','sticky'].includes(box.position)&&frame.contains(editor)&&frame.getBoundingClientRect().width>0)
          return {panelAnchor:frame,panelFrame:frame};
      }
      return null;
    }
    function locate(editor){
      const dialog=editor.closest('[role="dialog"], [aria-modal="true"], [data-testid="sheetDialog"]');
      for(let group=editor.parentElement,depth=0;group&&group!==document.body&&depth<48;group=group.parentElement,depth++){
        const buttons=Array.from(group.querySelectorAll(PUBLISH)).filter(shown);
        if(buttons.length===1){
          const publish=buttons[0];
          if(dialog&&!dialog.contains(publish))return null;
          let actionAnchor=publish;
          while(actionAnchor.parentElement&&actionAnchor.parentElement!==group){
            const parent=actionAnchor.parentElement,css=view.getComputedStyle(parent);
            if((css.display==='flex'||css.display==='inline-flex')&&css.flexDirection.startsWith('row'))break;
            if(parent.contains(editor))return null;
            actionAnchor=parent;
          }
          let footer=publish;
          while(footer.parentElement&&footer.parentElement!==group)footer=footer.parentElement;
          // Insertion is after the native action branch, never in the editable
          // subtree, native media toolbar or the Post/Reply button itself.
          if(footer===group||footer.contains(editor))return null;
          // A collapsed inline reply puts text and submit side by side. Place
          // the answer after that entire row in its next stacking container,
          // without changing X's flex direction or shrinking its editor.
          for(let parent=footer.parentElement;parent&&parent!==document.body;parent=footer.parentElement){
            const css=view.getComputedStyle(parent);
            if(css.display!=='flex'&&css.display!=='inline-flex'||css.flexDirection==='column')break;
            footer=parent;
            if(parent===dialog||!parent.parentElement||!parent.parentElement.contains(editor))return null;
          }
          if(!footer.parentElement||footer.parentElement===document.body)return null;
          const boundary=nativeBoundary(group,editor,dialog)||outsideStickyFooter(group,editor,publish,dialog);
          return {group,publish,actionAnchor,footer,dialog,...boundary};
        }
        if(group===dialog)break;
      }
      return null;
    }
    function readDraft(editor){
      // X can render a typed emoji as an image. Keep its literal alt text,
      // along with native line breaks, without modifying the live editor.
      const blocks=new Set(['DIV','P','LI']);
      function read(node){
        if(node.nodeType===3)return node.nodeValue||'';
        if(node.nodeType!==1)return '';
        if(node.tagName==='BR')return '\n';
        if(node.tagName==='IMG')return node.getAttribute('alt')||'';
        if(node.hidden||node.getAttribute('aria-hidden')==='true'||node.matches('[data-testid*="placeholder"]'))return '';
        let result='';
        for(const child of node.childNodes){
          const block=blocks.has(child.tagName),value=read(child);
          if(block&&result&&!result.endsWith('\n'))result+='\n';
          result+=value;
          if(block&&!result.endsWith('\n'))result+='\n';
        }
        return result;
      }
      return read(editor).replace(/\r\n?/g,'\n').replace(/\u200b/g,'').replace(/\n{3,}/g,'\n\n').trim();
    }
    function topLevelPosts(scope,{covered=false,before}={}){
      if(!scope)return [];
      const result=[],seen=new Set();
      for(const article of scope.querySelectorAll('article[data-testid="tweet"]')){
        if(article.parentElement?.closest('article[data-testid="tweet"]')||own(article)||article.closest('[data-testid="quoteTweet"], [data-testid="quotedTweet"], [data-testid="quoted-post"]'))continue;
        if(covered&&article.closest('[role="dialog"], [aria-modal="true"], [data-testid="sheetDialog"]'))continue;
        if(before&&(article.contains(before)||!(article.compareDocumentPosition(before)&4)))continue;
        if(covered){
          // A modal can mark the underlying thread inert/aria-hidden. Its
          // rendered posts remain valid context, unlike display:none clones.
          if(article.getBoundingClientRect().width<=0||article.getBoundingClientRect().height<=0)continue;
          let hidden=false;for(let node=article;node;node=node.parentElement){const css=view.getComputedStyle(node);if(node.hidden||css.display==='none'||['hidden','collapse'].includes(css.visibility)){hidden=true;break;}}
          if(hidden)continue;
        }else if(!shown(article))continue;
        const post=Core?.extractPostContext?.(article)||Core?.extractPost?.(article);
        if(!post?.id||!Core.canonicalPostUrl(post.url)||post.isPromoted||seen.has(post.id))continue;
        seen.add(post.id);result.push(post);
      }
      return result;
    }
    function captureThread(){
      if(!allowPage())return;
      const pathname=view.location?.pathname||'',status=pathname.match(/\/status\/(\d+)(?:\/|$)/)?.[1];
      if(!status){
        // The route changes before the dialog finishes mounting. Retain this
        // bounded snapshot across that gap; it is only used after the actual
        // modal parent is identified, never as a guessed reply recipient.
        const composing=/^\/compose\/(?:post|tweet)(?:\/|$)/.test(pathname);
        if(!composing)capturedThread=null;
        return;
      }
      if(capturedThread?.status!==status)capturedThread=null;
      const scope=document.querySelector('[data-testid="primaryColumn"]')||document.querySelector('main');
      const posts=topLevelPosts(scope,{covered:true}).filter(post=>post.id);
      const index=posts.findIndex(post=>post.id===status);
      if(index>=0){
        let prefix=posts.slice(0,index+1);
        // Both snapshots end at the same current post, even if an earlier
        // ancestor has just hydrated while X virtualizes the old root.
        // Preserve observed ordering; IDs only order otherwise disconnected
        // observed segments, never establish membership in a conversation.
        if(capturedThread)prefix=mergeThread(capturedThread.posts,prefix);
        if(prefix.length>48)prefix=[prefix[0],...prefix.slice(-47)];
        capturedThread={status,posts:prefix};
      }
    }
    function mergeThread(previous,current){
      const posts=new Map([...previous,...current].map(post=>[post.id,post])),edges=new Map(),indegree=new Map([...posts.keys()].map(id=>[id,0]));
      for(const sequence of [previous,current])for(let i=1;i<sequence.length;i++){
        const from=sequence[i-1].id,to=sequence[i].id,next=edges.get(from)||new Set();
        if(from===to||next.has(to))continue;
        next.add(to);edges.set(from,next);indegree.set(to,indegree.get(to)+1);
      }
      const pending=[...posts.keys()].filter(id=>indegree.get(id)===0),result=[];
      while(pending.length){
        pending.sort((a,b)=>a.length-b.length||(a<b?-1:a>b?1:0));
        const id=pending.shift();result.push(posts.get(id));
        for(const next of edges.get(id)||[]){
          const remaining=indegree.get(next)-1;indegree.set(next,remaining);
          if(remaining===0)pending.push(next);
        }
      }
      // A contradictory native reorder invalidates the old ordering snapshot.
      return result.length===posts.size?result:current;
    }
    function boundedThread(posts,direct){
      const seen=new Set(direct?[contextIdentity(direct)]:[]),unique=posts.filter(post=>{
        const key=contextIdentity(post);if(seen.has(key))return false;seen.add(key);return true;
      });
      return unique.length>6?[unique[0],...unique.slice(-5)]:unique;
    }
    function draftContextFingerprint(post,depth=0){
      return JSON.stringify([Core.postFingerprint(post),Boolean(post.snapshotOnly),Boolean(post.textTruncated),
        depth<2?(post.quotedContext||[]).slice(0,2).map(quote=>draftContextFingerprint(quote,depth+1)):[]]);
    }
    function contextIdentity(post){return post.id?'post:'+post.id:'snapshot:'+draftContextFingerprint(post);}
    function previewNodes(scope){
      if(!scope)return [];
      const candidates=Array.from(scope.querySelectorAll(CONTEXT_NODES)).filter(node=>
        shown(node)&&!node.querySelector(EDITOR)&&node.querySelector('[data-testid="User-Name"]')&&
        node.querySelector('[data-testid="tweetText"], [data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="quoteVideoSlot"]'));
      // The enclosing card owns its nested quote. Do not flatten the quoted
      // author's statements into the reply parent or mistake toolbar buttons
      // and arbitrary attachment captions for post previews.
      return candidates.filter(node=>!candidates.some(parent=>parent!==node&&parent.contains(node)));
    }
    function enrichPreview(post,pool,depth=0){
      if(!post)return null;
      let result=post;
      if(!post.id&&post.username&&post.text&&post.timestamp){
        const matches=new Map(pool.filter(candidate=>candidate.username?.toLowerCase()===post.username.toLowerCase()&&
          candidate.text===post.text&&candidate.timestamp===post.timestamp).map(candidate=>[candidate.id,candidate]));
        if(matches.size===1){
          const candidate=matches.values().next().value;
          result={...post,id:candidate.id,url:candidate.url};delete result.snapshotOnly;
        }
      }
      if(depth<2&&post.quotedContext?.length)result={...result,quotedContext:post.quotedContext.slice(0,2).map(quote=>enrichPreview(quote,pool,depth+1))};
      return result;
    }
    function readPreviews(nodes){
      const scope=document.querySelector('[data-testid="primaryColumn"]')||document.querySelector('main');
      const pool=[...(capturedThread?.posts||[]),...topLevelPosts(scope,{covered:true})];
      const seen=new Set(),result=[];
      for(const node of nodes){
        const post=enrichPreview(Core?.extractPostContext?.(node)||Core?.extractPost?.(node),pool);
        if(!post||post.isPromoted||(!post.text&&!post.hasMedia))continue;
        const key=contextIdentity(post);if(seen.has(key))continue;
        seen.add(key);result.push(post);
      }
      return result;
    }
    function contextFor(editor,location){
      const status=(view.location?.pathname||'').match(/\/status\/(\d+)(?:\/|$)/)?.[1];
      if(!location.dialog&&status&&editor.closest('[data-testid="primaryColumn"], main')){
        const posts=capturedThread?.status===status?capturedThread.posts:[];
        const context=posts.find(post=>post.id===status);
        return {mode:'reply',...(context?{context}:{}),threadContext:boundedThread(posts,context)};
      }
      const dialogPosts=location.dialog?readPreviews(previewNodes(location.dialog).filter(node=>
        !node.contains(editor)&&Boolean(node.compareDocumentPosition(editor)&4))):[];
      const context=dialogPosts.at(-1);
      if(context){
        const cached=capturedThread?.posts||[],index=context.id?cached.findIndex(post=>post.id===context.id):-1;
        const ancestors=[...(index>=0?cached.slice(0,index):[]),...dialogPosts.slice(0,-1)];
        return {mode:'reply',context,threadContext:boundedThread(ancestors,context)};
      }
      // Quote composers show their embedded post below the editable text.
      // Keep it a cited source, never mistake it for a reply recipient.
      const quotedContext=readPreviews(previewNodes(location.group).filter(node=>
        !node.contains(editor)&&Boolean(editor.compareDocumentPosition(node)&4))).slice(0,2);
      return {mode:'post',quotedContext};
    }
    function draftAttachments(binding){
      const group=binding.location.group,quotes=previewNodes(group),images=[],seen=new Set(),unchecked=[];
      const owned=node=>!binding.editor.contains(node)&&shown(node)&&!quotes.some(quote=>quote===node||quote.contains(node));
      const wrappers=Array.from(group.querySelectorAll('[data-testid="attachments"], [data-testid="tweetPhoto"], [data-testid="mediaPreview"]')).filter(owned);
      const video=node=>Boolean(node.closest('video, [data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="postVideoRemove"], [data-testid="quoteVideoToggle"]'))||/\/(?:ext_tw_|amplify_|tweet_)?video_thumb\//.test(node.currentSrc||node.getAttribute('src')||'');
      for(const wrapper of wrappers){
        const candidates=wrapper.matches('img')?[wrapper]:Array.from(wrapper.querySelectorAll('img'));
        for(const image of candidates){
          if(!owned(image)||video(image))continue;
          const url=image.currentSrc||image.getAttribute('src')||'';
          // Profile pictures are never draft attachments, even if a future X
          // layout places an avatar inside the same outer container.
          if(/\/profile_images\//.test(url))continue;
          const key=url||'pending:'+images.length;if(seen.has(key))continue;seen.add(key);
          images.push({url,alt:(image.getAttribute('alt')||'').slice(0,500)});
        }
        if(!candidates.some(image=>owned(image)&&!video(image)&&!/\/profile_images\//.test(image.currentSrc||image.getAttribute('src')||''))&&
          !quotes.some(quote=>wrapper.contains(quote)))unchecked.push(wrapper.getAttribute('data-testid')||'attachment');
      }
      for(const node of group.querySelectorAll('video, [data-testid="videoPlayer"], [data-testid="videoComponent"]'))if(owned(node))unchecked.push('video');
      return {imageSources:images,hasUncheckedMedia:unchecked.length>0,attachments:images.length>0||unchecked.length>0};
    }
    function snapshot(binding){
      if(!allowPage())return null;
      const draft=readDraft(binding.editor),contexts=contextFor(binding.editor,binding.location),attachments=draftAttachments(binding);
      return {text:draft,...contexts,...attachments,signature:JSON.stringify([draft,contexts.mode,contexts.context?draftContextFingerprint(contexts.context):'',(contexts.threadContext||[]).map(post=>draftContextFingerprint(post)),(contexts.quotedContext||[]).map(post=>draftContextFingerprint(post)),attachments.imageSources.map(image=>[image.url,image.alt]),attachments.hasUncheckedMedia])};
    }
    function captureFailure(key){return Object.assign(new Error(key),{captureKey:key});}
    async function captureDraftImages(sources,signal){
      if(!allowPage()||signal.aborted)throw captureFailure('draft.imageUnavailable');
      if(sources.length>MAX_DRAFT_IMAGES)throw captureFailure('draft.imageTooLarge');
      let total=0;
      return Promise.all(sources.map(async image=>{
        let url;try{url=new URL(image.url,view.location.href);}catch{throw captureFailure('draft.imageUnavailable');}
        const blob=url.protocol==='blob:'&&url.origin===view.location.origin;
        const cdn=url.protocol==='https:'&&url.hostname==='pbs.twimg.com'&&!url.port&&!url.username&&!url.password&&/^\/media\//.test(url.pathname);
        if(!blob&&!cdn)throw captureFailure('draft.imageUnsupported');
        let response;try{response=await view.fetch(url.href,{credentials:'omit',signal});}catch(error){if(signal.aborted)throw error;throw captureFailure('draft.imageUnavailable');}
        if(!allowPage()||signal.aborted)throw captureFailure('draft.imageUnavailable');
        if(!response.ok)throw captureFailure('draft.imageUnavailable');
        const declared=Number(response.headers.get('content-length'));if(declared>MAX_DRAFT_IMAGE_BYTES)throw captureFailure('draft.imageTooLarge');
        const chunks=[];let size=0,reader=response.body?.getReader();
        if(reader){
          try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;total+=value.byteLength;if(total>MAX_DRAFT_IMAGE_BYTES){await reader.cancel();throw captureFailure('draft.imageTooLarge');}chunks.push(value);}}
          finally{reader.releaseLock();}
        }else{const bytes=new Uint8Array(await response.arrayBuffer());size=bytes.length;total+=size;if(total>MAX_DRAFT_IMAGE_BYTES)throw captureFailure('draft.imageTooLarge');chunks.push(bytes);}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value);
        const jpeg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
        if(!png&&!jpeg)throw captureFailure('draft.imageUnsupported');
        let encoded='';for(let start=0;start<bytes.length;start+=32768)encoded+=String.fromCharCode(...bytes.subarray(start,start+32768));
        return {url:`data:image/${png?'png':'jpeg'};base64,${view.btoa(encoded)}`,alt:image.alt};
      }));
    }
    function safeURL(value){
      try{const url=new URL(value);return /^https?:$/.test(url.protocol)&&!url.username&&!url.password?url:null;}catch{return null;}
    }
    function theme(binding){
      const editorCSS=view.getComputedStyle(binding.editor),properties={};
      let bg='';
      for(let node=binding.editor;node;node=node.parentElement){
        const value=view.getComputedStyle(node).backgroundColor;
        if(value&&value!=='transparent'&&!/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(value)){bg=value;break;}
      }
      if(!bg)bg=view.getComputedStyle(document.body).backgroundColor;
      const fg=editorCSS.color||'CanvasText';
      properties['--sd-bg']=bg&&bg!=='transparent'?bg:'Canvas';properties['--sd-fg']=fg;
      properties['--sd-font']=editorCSS.fontFamily||'system-ui';
      properties['--sd-size']=Math.min(17,Math.max(14,Number.parseFloat(editorCSS.fontSize)||15))+'px';
      const publish=binding.location.publish,publishCSS=view.getComputedStyle(publish);
      const publishLabel=publish.querySelector('span')||publish;
      const publishLabelCSS=view.getComputedStyle(publishLabel);
      properties['--sd-accent']=publishCSS.backgroundColor;
      if(!properties['--sd-accent']||properties['--sd-accent']==='transparent'||/^rgba\([^)]*,\s*0\s*\)$/.test(properties['--sd-accent']))properties['--sd-accent']='LinkText';
      // X's Post button can be neutral black/white; source links use X's blue
      // without adopting visited-link purple or a disabled button's gray.
      const rgb=String(bg).match(/[\d.]+/g)?.slice(0,3).map(Number);
      properties['--sd-scheme']=rgb?.length===3&&rgb.reduce((a,b)=>a+b,0)<390?'dark':'light';
      properties['--sd-link']=properties['--sd-scheme']==='dark'?'#1d9bf0':'#0079bd';
      properties['--sd-button-bg']=publishCSS.backgroundColor;
      properties['--sd-button-fg']=publishLabelCSS.color;
      properties['--sd-button-size']=publishLabelCSS.fontSize||'14px';
      properties['--sd-button-weight']=publishLabelCSS.fontWeight||'700';
      const buttonHeight=Math.max(30,Math.min(42,binding.location.publish.getBoundingClientRect().height||36));
      properties['--sd-button-height']=buttonHeight+'px';
      properties['--sd-mark-size']=Math.round(buttonHeight*.64)+'px';
      const actionParent=binding.location.actionAnchor.parentElement;
      const actionParentCSS=view.getComputedStyle(actionParent),anchorCSS=view.getComputedStyle(binding.location.actionAnchor);
      const nativeGap=Number.parseFloat(actionParentCSS.columnGap)||0;
      const previous=binding.action.previousElementSibling;
      const previousMargin=previous?Number.parseFloat(view.getComputedStyle(previous).marginInlineEnd)||0:0;
      const nativeStartGap=nativeGap+previousMargin,nativeEndGap=nativeGap+(Number.parseFloat(anchorCSS.marginInlineStart)||0);
      const actionGap=Math.max(8,nativeStartGap,nativeEndGap);
      properties['--sd-action-start-gap']=Math.max(0,actionGap-nativeStartGap)+'px';
      properties['--sd-action-end-gap']=Math.max(0,actionGap-nativeEndGap)+'px';
      const opacityUntil=(node,stop)=>{
        let opacity=1;
        for(;node&&node!==stop;node=node.parentElement){
          const value=Number.parseFloat(view.getComputedStyle(node).opacity);
          if(Number.isFinite(value))opacity*=value;
        }
        return opacity;
      };
      // X can dim both the native button and its private wrapper. Our sibling
      // must reproduce that branch once, without reapplying shared ancestors.
      const nativeDisabled=publish.disabled||publish.getAttribute('aria-disabled')==='true';
      let opacity=opacityUntil(publish,actionParent);
      if(Boolean(binding.trigger.disabled)!==Boolean(nativeDisabled))opacity=binding.trigger.disabled?opacity*.5:1;
      properties['--sd-button-opacity']=String(opacity);
      properties['--sd-mark-opacity']=String(!binding.trigger.disabled&&nativeDisabled?1:opacityUntil(publishLabel,publish));
      const edge=binding.location.nativeBoundary,frame=edge||binding.location.panelFrame;
      const content=binding.location.footer.getBoundingClientRect();
      const boundary=frame?.getBoundingClientRect();
      const edgeParent=frame?.parentElement,parentRect=edgeParent?.getBoundingClientRect();
      const parentCSS=edgeParent&&view.getComputedStyle(edgeParent);
      const parentInset=parentCSS?(Number.parseFloat(parentCSS.borderLeftWidth)||0)+(Number.parseFloat(parentCSS.paddingLeft)||0):0;
      // A full-width native edge may extend under the avatar. Preserve the
      // toolbar/answer text alignment without adding another separator.
      properties['--sd-inset-left']=boundary?Math.max(0,content.left-boundary.left)+'px':'0px';
      properties['--sd-inset-right']=boundary?Math.max(0,boundary.right-content.right)+'px':'0px';
      properties['--sd-panel-width']=boundary?boundary.width+'px':'100%';
      properties['--sd-panel-offset']=boundary?Math.max(0,boundary.left-parentRect.left-parentInset)+'px':'0px';
      if(edge){
        const css=view.getComputedStyle(edge),border=binding.location.boundaryKind==='border';
        const edgeSize=border?Number.parseFloat(css.borderBottomWidth):boundary.height;
        const panelRect=binding.state.panel.getBoundingClientRect();
        const edgeY=border?boundary.bottom-edgeSize:boundary.top;
        properties['--sd-edge-size']=edgeSize+'px';
        properties['--sd-edge-top']=(panelRect.height>0?edgeY-panelRect.top:-edgeSize)+'px';
        properties['--sd-edge-color']=border?css.borderBottomColor:
          css.backgroundColor==='transparent'||/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(css.backgroundColor)?
            Number.parseFloat(css.borderTopWidth)>0?css.borderTopColor:css.borderBottomColor:css.backgroundColor;
      }
      for(const host of [binding.action,binding.state?.panel])if(host){
        for(const [name,value]of Object.entries(properties))if(host.style.getPropertyValue(name)!==value)host.style.setProperty(name,value);
        const compact=binding.location.group.getBoundingClientRect().width<320;
        host.toggleAttribute('data-compact',compact);
      }
    }
    function isolate(host){
      for(const type of ['click','pointerdown','keydown'])host.addEventListener(type,event=>event.stopPropagation());
    }
    const COMMON_CSS=`
      :host{all:initial;color:var(--sd-fg,CanvasText);font:400 var(--sd-size,15px)/1.5 var(--sd-font,system-ui);color-scheme:var(--sd-scheme,normal);box-sizing:border-box;}
      :host([hidden]){display:none!important}*{box-sizing:border-box;min-width:0}button{font:inherit;cursor:pointer;background:transparent;color:var(--sd-link,#1d9bf0);border:0;padding:4px 0;}button:hover{text-decoration:underline}button:disabled{opacity:.5;cursor:default;text-decoration:none}button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid var(--sd-link,#1d9bf0);outline-offset:3px}button[hidden],[hidden]{display:none!important}a,a:visited{color:var(--sd-link,#1d9bf0);text-decoration:none;overflow-wrap:anywhere}a:hover{text-decoration:underline}
    `;
    function createAction(binding){
      const action=element('superx-draft-action');isolate(action);
      const shadow=action.attachShadow({mode:'open'}),style=element('style');
      style.textContent=COMMON_CSS+`
        :host{display:inline-flex;align-items:center;flex-shrink:0;align-self:center;margin-inline-start:var(--sd-action-start-gap,8px);margin-inline-end:var(--sd-action-end-gap,8px);max-width:100%;vertical-align:middle;}
        .action{display:inline-grid;place-items:center;width:var(--sd-button-height,36px);height:var(--sd-button-height,36px);padding:0;border:0;border-radius:50%;background:var(--sd-button-bg,#eff3f4);color:var(--sd-button-fg,#0f1419);font-size:var(--sd-button-size,14px);font-weight:var(--sd-button-weight,700);line-height:20px;}
        .action,.action:disabled{opacity:var(--sd-button-opacity,1)}.action:not(:disabled):hover{background:color-mix(in srgb,var(--sd-button-bg) 92%,var(--sd-button-fg));text-decoration:none}.mark{display:block;width:var(--sd-mark-size,23px);height:var(--sd-mark-size,23px);opacity:var(--sd-mark-opacity,1);background:currentColor;mask:var(--sd-mark) center/contain no-repeat;-webkit-mask:var(--sd-mark) center/contain no-repeat;}
      `;
      const trigger=button('action',()=>{
        const state=binding.state;
        if(state&&state.status!=='idle'){state.open=!state.open;render(state);}
        else start(binding,false);
      }),mark=element('span','mark');
      mark.setAttribute('aria-hidden','true');
      if(options.symbolURL)action.style.setProperty('--sd-mark',`url(${JSON.stringify(options.symbolURL)})`);
      else {mark.style.mask='none';mark.style.background='transparent';mark.textContent='✓';}
      trigger.append(mark);shadow.append(style,trigger);binding.action=action;binding.trigger=trigger;
    }
    function createState(editor){
      const state={id:uuid(),editor,status:'idle',text:'',sources:[],expanded:false,open:false,lastUsed:Date.now(),renderedText:null};
      const panel=element('superx-draft-panel');isolate(panel);panel.hidden=true;
      const shadow=panel.attachShadow({mode:'open'}),style=element('style');style.textContent=COMMON_CSS+`
        :host{display:block;width:100%;max-width:100%;flex-basis:100%;align-self:stretch;overflow-anchor:none;}
        :host([data-sticky-frame]){width:var(--sd-panel-width,100%);margin-left:var(--sd-panel-offset,0px);margin-right:auto}
        :host([data-sticky-frame]) .panel{margin-left:var(--sd-inset-left,0px);margin-right:var(--sd-inset-right,0px)}
        :host([data-native-boundary]){position:relative;width:var(--sd-panel-width,100%);margin-left:var(--sd-panel-offset,0px);margin-right:auto;border-bottom:var(--sd-edge-size,1px) solid var(--sd-edge-color)}
        :host([data-native-boundary])::before{content:"";position:absolute;left:0;right:0;top:var(--sd-edge-top,-1px);height:var(--sd-edge-size,1px);background:var(--sd-bg,Canvas);pointer-events:none}
        .panel{margin:0;padding:14px 0 12px;border-top:1px solid color-mix(in srgb,var(--sd-fg) 22%,transparent);background:var(--sd-bg,Canvas);}
        :host([data-native-boundary]) .panel{border-top:0;padding-left:var(--sd-inset-left,0px);padding-right:var(--sd-inset-right,0px)}
        :host([data-native-boundary]) .panel::before{content:"";position:absolute;left:var(--sd-inset-left,0px);right:var(--sd-inset-right,0px);top:var(--sd-edge-top,-1px);height:var(--sd-edge-size,1px);background:var(--sd-edge-color);pointer-events:none}
        .header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px 12px;margin-bottom:10px}.heading{display:flex;align-items:center;flex-wrap:wrap;gap:6px;min-width:0;flex:1}.title{font-size:14px;font-weight:700;white-space:nowrap}.separator{font-size:12px;color:color-mix(in srgb,var(--sd-fg) 55%,var(--sd-bg))}.state{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:400;color:color-mix(in srgb,var(--sd-fg) 72%,var(--sd-bg));overflow-wrap:anywhere}.state[tabindex]{cursor:help}.retry{font-size:13px;flex-shrink:0;white-space:nowrap}.spinner{width:11px;height:11px;border:1.5px solid currentColor;border-inline-end-color:transparent;border-radius:50%;animation:sd-spin .8s linear infinite;flex:none}.spinner[hidden]{display:none}@keyframes sd-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.spinner{animation:none;border-style:dotted}}
        .stale,.context{font-size:12px;color:color-mix(in srgb,var(--sd-fg) 72%,var(--sd-bg));overflow-wrap:anywhere}.stale{margin:8px 0;padding-inline-start:9px;border-inline-start:2px solid currentColor;color:var(--sd-fg)}.context{margin:4px 0 8px}
        .answer{overflow-wrap:anywhere;word-break:normal;margin-top:10px;max-width:100%;}.answer.folded{max-height:360px;overflow:hidden;mask-image:linear-gradient(to bottom,#000 calc(100% - 28px),transparent)}
        .answer p{margin:0 0 12px}.answer>:first-child{margin-top:0}.answer>:last-child{margin-bottom:0}.answer h1,.answer h2,.answer h3,.answer h4,.answer h5,.answer h6{font-size:1em;font-weight:700;line-height:1.5;margin:16px 0 8px}.answer ul,.answer ol{padding-inline-start:24px;margin:8px 0 12px}.answer li{margin:4px 0}.answer blockquote{margin:12px 0;padding-inline-start:12px;border-inline-start:2px solid color-mix(in srgb,var(--sd-fg) 25%,transparent)}
        .answer code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.9em;white-space:pre-wrap;overflow-wrap:anywhere;background:color-mix(in srgb,var(--sd-fg) 9%,transparent);padding:1px 4px}.answer pre{max-width:100%;padding:10px;white-space:pre-wrap;overflow-wrap:anywhere;background:color-mix(in srgb,var(--sd-fg) 6%,transparent)}.answer pre code{background:transparent;padding:0}.answer table{width:100%;table-layout:fixed;border-collapse:collapse;margin:12px 0;font-size:.9em}.answer th,.answer td{padding:6px;border:1px solid color-mix(in srgb,var(--sd-fg) 22%,transparent);text-align:start;overflow-wrap:anywhere}.answer .md-align-left{text-align:left}.answer .md-align-center{text-align:center}.answer .md-align-right{text-align:right}.answer .markdown-literal{white-space:pre-wrap}.answer hr{border:0;border-top:1px solid color-mix(in srgb,var(--sd-fg) 22%,transparent);margin:14px 0}
        .sources{display:grid;gap:5px;font-size:12px;margin-top:12px;overflow-wrap:anywhere}.sources:empty{display:none}.more{font-size:13px;margin-top:8px}.actions{display:none;margin-top:10px;font-size:13px}.actions:has(button:not([hidden])){display:block}
        @media(max-width:420px){.answer.folded{max-height:300px}}
      `;
      const box=element('section','panel'),header=element('header','header'),heading=element('div','heading'),title=element('strong','title','SuperX'),separator=element('span','separator','·');
      separator.setAttribute('aria-hidden','true');
      const status=element('span','state'),spinner=element('span','spinner'),statusLabel=element('span','state-label');spinner.setAttribute('aria-hidden','true');status.append(spinner,statusLabel);
      heading.append(title,separator,status);
      const stale=element('div','stale'),textOnly=element('div','context text-only'),answer=element('div','answer'),sources=element('div','sources');
      for(const message of [statusLabel,stale]){message.setAttribute('role','status');message.setAttribute('aria-live','polite');}
      answer.setAttribute('dir','auto');
      const more=button('more',()=>{state.expanded=!state.expanded;render(state);});
      const actions=element('div','actions'),retry=button('retry',()=>{if(state.binding)start(state.binding,true);}),settings=button('settings',()=>options.openSettings?.());
      header.append(heading,retry);actions.append(settings);
      box.append(header,stale,textOnly,answer,more,sources,actions);shadow.append(style,box);
      state.panel=panel;state.ui={box,title,status,statusLabel,spinner,stale,textOnly,answer,sources,more,retry,settings};
      byEditor.set(editor,state);states.add(state);return state;
    }
    function renderSources(state){
      const target=state.ui.sources;target.replaceChildren();
      const seen=new Set(Array.from(state.ui.answer.querySelectorAll('a')).map(link=>safeURL(link.href)?.href).filter(Boolean));
      for(const source of state.sources.slice(0,16)){
        const url=safeURL(source?.url);if(!url||seen.has(url.href))continue;
        seen.add(url.href);const link=element('a','',String(source.title||url.hostname+url.pathname).slice(0,200));
        link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.title=url.href;target.append(link);
      }
    }
    function render(state){
      if(!allowPage())return;
      const binding=state.binding,ui=state.ui;
      const live=binding?snapshot(binding):null;
      if(binding&&!live)return;
      if(binding&&!hasContent(live))state.open=false;
      state.panel.hidden=!state.open||!binding;
      state.stale=Boolean(state.input&&(!live||state.input.signature!==live.signature));
      const active=isActive(state),existing=state.status!=='idle';
      if(binding){
        binding.action.hidden=false;
        const actionKey=hasContent(live)&&existing?(state.open?'draft.actionHide':'draft.actionShow'):'draft.actionCheck';
        binding.trigger.setAttribute('aria-label',text(actionKey));binding.trigger.setAttribute('aria-expanded',String(state.open));
        binding.trigger.setAttribute('aria-controls',state.panel.id);
        binding.trigger.title=text(!hasContent(live)?'draft.empty':live.text.length>MAX_TEXT?'draft.tooLong':existing?actionKey:'draft.check');
        binding.trigger.disabled=!hasContent(live)||live.text.length>MAX_TEXT||Boolean(config.refreshRequired);
        theme(binding);
      }
      ui.box.setAttribute('aria-label',text('draft.title'));ui.box.setAttribute('aria-busy',String(active));
      ui.spinner.hidden=!active;
      ui.stale.hidden=!state.stale;setText(ui.stale,text('draft.stale'));
      ui.textOnly.hidden=!state.input?.hasUncheckedMedia&&!live?.hasUncheckedMedia;ui.textOnly.textContent=text('draft.textOnly');
      if(state.renderedText!==state.text){
        if(options.render)options.render(ui.answer,state.text);else ui.answer.textContent=state.text;
        state.renderedText=state.text;renderSources(state);
      }
      ui.answer.hidden=!state.text;
      // Let the outer page/dialog scroll. A folded preview has no independent
      // scrollbar; expanding reveals the full answer in normal document flow.
      const long=ui.answer.scrollHeight>370||state.text.length>1000;
      ui.answer.classList.toggle('folded',long&&!state.expanded);
      ui.more.hidden=!long;ui.more.textContent=text(state.expanded?'draft.less':'draft.more');ui.more.setAttribute('aria-expanded',String(state.expanded));
      ui.retry.textContent=text('draft.recheck');ui.retry.disabled=active||!binding||!hasContent(live)||live.text.length>MAX_TEXT;ui.retry.hidden=!existing||Boolean(state.needsSettings);
      ui.settings.hidden=!state.needsSettings;ui.settings.textContent=text('draft.settings');
      const metadata=[];if(state.model)metadata.push(text('usage.model',{model:state.model}));
      for(const [field,key]of [['total_tokens','usage.total'],['input_tokens','usage.input'],['output_tokens','usage.output']])if(Number.isSafeInteger(state.usage?.[field])&&state.usage[field]>=0)metadata.push(text(key,{count:state.usage[field].toLocaleString()}));
      const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
      const input=count(state.usage?.input_tokens),output=count(state.usage?.output_tokens);
      const total=count(state.usage?.total_tokens)??(input!==null&&output!==null?count(input+output):null);
      const partial=state.usageComplete===false||state.status==='error';
      const summary=total!==null?text(partial?'usage.known':'usage.total',{count:total.toLocaleString()}):text('usage.unavailable');
      if(partial&&total!==null)metadata.push(text('usage.partial'));
      if(existing){
        metadata.push(text(state.searchRecorded?'draft.searchRecorded':active?'draft.searchPending':'draft.searchUnconfirmed'));
        if(state.searchRecorded)metadata.push(text('draft.searchEvidenceNote'));
      }
      setText(ui.statusLabel,state.errorKey?text(state.errorKey):active?text(state.status==='running'?'status.verifying':'status.queued'):state.status==='done'?summary:text('draft.privacy'));
      if(state.errorKey&&total!==null)metadata.unshift(summary);
      ui.status.title=metadata.join('\n');
      ui.status.setAttribute('aria-label',ui.statusLabel.textContent+(metadata.length?'\n'+metadata.join('\n'):''));
      if(metadata.length)ui.status.setAttribute('tabindex','0');else ui.status.removeAttribute('tabindex');
      // New streamed text may overflow an auto-height flex/grid scroll box.
      // Recheck synchronously before painting, not only on native mutations.
      if(binding&&updateGutters(binding))theme(binding);
      options.onLayout?.();
    }
    function detach(binding){
      for(const node of binding.scrollers||[])releaseGutter(binding,node);
      binding.action.remove();if(binding.state){binding.state.panel.remove();binding.state.binding=null;}bindings.delete(binding.publish);
    }
    function findState(editor,binding){
      let state=byEditor.get(editor);if(state&&states.has(state)&&state.editor===editor)return state;
      byEditor.delete(editor);
      const live=snapshot(binding);
      if(!live)return null;
      // React may replace an editor while preserving its draft. Reattach only
      // a unique exact snapshot in the same parent-post context, never a guess.
      const matches=Array.from(states).filter(item=>!item.binding&&item.input&&item.input.signature===live.signature);
      if(matches.length===1){state=matches[0];byEditor.delete(state.editor);state.editor=editor;byEditor.set(editor,state);return state;}
      return createState(editor);
    }
    function scan(){
      if(!allowPage()||scanning)return;scanning=true;
      try{
        captureThread();
        const groups=new Map();
        for(const editor of document.querySelectorAll(EDITOR)){
          if(!shown(editor)||editor.querySelector(EDITOR))continue;
          const location=locate(editor);if(!location)continue;
          const previous=groups.get(location.publish),focused=editor===document.activeElement||editor.contains(document.activeElement);
          if(!previous||focused)groups.set(location.publish,{editor,location,focused});
        }
        for(const [publish,binding]of bindings)if(!groups.has(publish)||!publish.isConnected)detach(binding);
        for(const [publish,group]of groups){
          let binding=bindings.get(publish);
          if(!binding){binding={publish,editor:group.editor,location:group.location};createAction(binding);bindings.set(publish,binding);}
          const available=editorsIn(group.location.group);
          const editor=group.focused||!binding.editor?.isConnected||!available.includes(binding.editor)?group.editor:binding.editor;
          binding.editor=editor;binding.location=group.location;
          // X may remount only the editor while retaining its submit button.
          // Release the previous attachment before matching the exact draft.
          if(binding.state&&binding.state.editor!==editor){binding.state.panel.remove();binding.state.binding=null;binding.state=null;}
          const state=findState(editor,binding);
          if(!state)return;
          if(binding.state!==state){if(binding.state){binding.state.panel.remove();binding.state.binding=null;}binding.state=state;state.binding=binding;}
          state.panel.id='superx-draft-'+state.id;state.lastUsed=Date.now();
          const actionAnchor=group.location.actionAnchor;
          if(binding.action.parentElement!==actionAnchor.parentElement||binding.action.nextSibling!==actionAnchor)actionAnchor.parentElement.insertBefore(binding.action,actionAnchor);
          const panelAnchor=group.location.panelAnchor||group.location.footer;
          state.panel.toggleAttribute('data-native-boundary',Boolean(group.location.nativeBoundary));
          state.panel.toggleAttribute('data-sticky-frame',Boolean(group.location.panelFrame));
          if(state.panel.parentElement!==panelAnchor.parentElement||panelAnchor.nextSibling!==state.panel)panelAnchor.after(state.panel);
          render(state);
        }
        const detached=Array.from(states).filter(state=>!state.binding&&!isActive(state)).sort((a,b)=>a.lastUsed-b.lastUsed);
        while(states.size>MAX_RETAINED&&detached.length){const state=detached.shift();state.panel.remove();if(byEditor.get(state.editor)===state)byEditor.delete(state.editor);states.delete(state);}
      }finally{scanning=false;}
    }
    function scheduleScan(){if(!allowPage()||scanTimer!==undefined)return;scanTimer=view.setTimeout(()=>{scanTimer=undefined;scan();},40);}
    function dispatch(state){
      if(!allowPage()||!state.intent)return;
      if(!config.connected||!config.hasConfig||config.awaitingConfig||config.restoring)return;
      state.intent=false;
      if(!config.ready){
        state.recoveryStatus=state.status==='done'?'done':'error';
        state.status='error';state.errorKey=config.needsProvider||'status.needsKey';state.needsSettings=true;state.availabilityInterrupted=true;render(state);return;
      }
      state.status='queued';const requestId='draft:'+uuid();state.requestId=requestId;
      requests.set(requestId,state);
      const draft={id:state.id,text:state.input.text,mode:state.input.mode,...(state.input.context?{context:state.input.context}:{}),
        ...(state.input.threadContext?.length?{threadContext:state.input.threadContext}:{}),...(state.input.quotedContext?.length?{quotedContext:state.input.quotedContext}:{}),
        ...(state.preparedImages?.length?{images:state.preparedImages}:{}),...(state.input.attachments?{hasMedia:true}:{}),...(state.input.hasUncheckedMedia?{hasUncheckedMedia:true}:{})};
      if(options.send?.({type:'ANALYZE_DRAFT',requestId,draft,force:false})!==true){requests.delete(requestId);state.requestId=null;state.status='error';state.errorKey='status.connectionLost';}
      state.preparedImages=null;
      render(state);
    }
    async function start(binding,force){
      if(!allowPage()||!binding?.state)return;
      const state=binding.state,live=snapshot(binding);if(!live)return;state.open=true;state.lastUsed=Date.now();
      if(isActive(state)||!force&&state.status==='done'&&state.input?.signature===live.signature){render(state);return;}
      if(!hasContent(live)||live.text.length>MAX_TEXT){state.status='error';state.errorKey=hasContent(live)?'draft.tooLong':'draft.empty';render(state);return;}
      if(config.refreshRequired){state.status='error';state.errorKey='status.refreshRequired';render(state);return;}
      if(config.hasConfig&&!config.awaitingConfig&&!config.restoring&&!config.ready){
        // A setup failure has not started a new check. Keep any existing answer
        // and its input snapshot until the user explicitly retries when ready.
        state.recoveryStatus=state.status==='done'?'done':state.recoveryStatus||'error';
        state.input||=live;state.intent=false;state.status='error';state.errorKey=config.needsProvider||'status.needsKey';state.needsSettings=true;state.availabilityInterrupted=true;render(state);return;
      }
      state.input=live;state.text='';state.renderedText=null;state.sources=[];state.usage=null;state.usageComplete=undefined;state.model='';state.searchRecorded=false;state.expanded=false;state.errorKey='';state.needsSettings=false;state.availabilityInterrupted=false;state.recoveryStatus=undefined;state.status='waking';
      state.intent=false;state.preparedImages=null;
      if(live.imageSources.length){
        const capture=new view.AbortController();state.capture=capture;render(state);
        let timedOut=false,captureTimer,onAbort;
        const interrupted=new Promise((_,reject)=>{
          onAbort=()=>reject(captureFailure('draft.imageUnavailable'));
          capture.signal.addEventListener('abort',onAbort,{once:true});
          captureTimer=view.setTimeout(()=>{timedOut=true;capture.abort();},IMAGE_CAPTURE_TIMEOUT_MS);
        });
        try{state.preparedImages=await Promise.race([captureDraftImages(live.imageSources,capture.signal),interrupted]);}
        catch(error){
          if(state.capture!==capture||capture.signal.aborted&&!timedOut||disposed)return;
          capture.abort();state.capture=null;state.status='error';state.errorKey=error.captureKey||'draft.imageUnavailable';render(state);return;
        }
        finally{view.clearTimeout(captureTimer);capture.signal.removeEventListener('abort',onAbort);}
        if(!allowPage()||state.capture!==capture||capture.signal.aborted){state.preparedImages=null;return;}
        state.capture=null;
      }
      state.intent=true;render(state);
      if(!config.connected||config.awaitingConfig||!config.hasConfig)options.wake?.();
      else dispatch(state);
    }
    function metadata(state,value){
      if(value?.usage&&typeof value.usage==='object')state.usage=value.usage;
      if(typeof value?.usageComplete==='boolean')state.usageComplete=value.usageComplete;
      if(typeof value?.model==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(value.model))state.model=value.model;
      // A positive provider record proves a call was observed, not that it
      // succeeded. False/missing metadata cannot prove no search took place.
      if(value?.searched===true)state.searchRecorded=true;
    }
    function handleMessage(message){
      if(!allowPage())return false;
      const state=requests.get(message?.requestId);if(!state)return false;
      if(!RECEIPTS.has(message.type))return true;
      if(message.type==='START')state.searchRecorded=false;
      metadata(state,message);
      if(message.type==='QUEUED')state.status='queued';
      if(message.type==='START'){state.status='running';state.errorKey='';}
      if(message.type==='UPDATE'){
        state.status='running';if(typeof message.text==='string')state.text=Core.readerOutput(message.text).text.slice(0,30000);
        if(Array.isArray(message.sources)){state.sources=message.sources;renderSources(state);}
      }
      if(message.type==='RETRY_WAIT'){state.status='retry-wait';state.errorKey='';}
      if(message.type==='RESULT'){
        const result=message.result||{},reader=Core.readerOutput(result.text,{final:true});metadata(state,result);
        state.text=reader.text.slice(0,30000);state.sources=Array.isArray(result.sources)?result.sources:state.sources;
        state.status=reader.kind==='content'&&!['failed','incomplete'].includes(result.verificationStatus)?'done':'error';
        state.errorKey=state.status==='error'?'draft.incomplete':'';requests.delete(message.requestId);state.requestId=null;
      }
      if(message.type==='ERROR'){
        const partial=message.partialResult;if(typeof partial?.text==='string')state.text=Core.readerOutput(partial.text).text.slice(0,30000);
        if(Array.isArray(partial?.sources))state.sources=partial.sources;
        metadata(state,partial);state.status='error';state.errorKey=message.code==='DRAFT_INVALID'?'draft.failed':options.errorKey?.(message.code,message.verificationFailure)||'draft.failed';
        state.needsSettings=Boolean(/^(?:NEEDS_KEY|OAUTH_|BUILD_NOT_|MODEL_UNSUPPORTED)/.test(message.code||''));
        if(state.needsSettings&&!config.ready){state.availabilityInterrupted=true;state.recoveryStatus='error';}
        requests.delete(message.requestId);state.requestId=null;
      }
      render(state);renderSources(state);return true;
    }
    function invalidate(key){
      for(const [requestId]of requests)options.send?.({type:'CANCEL',requestId});requests.clear();
      for(const state of states){
        state.capture?.abort();state.capture=null;state.preparedImages=null;
        state.intent=false;state.requestId=null;state.availabilityInterrupted=false;state.recoveryStatus=undefined;
        if(state.status!=='idle'){state.status='error';state.errorKey=key;state.text='';state.sources=[];state.usage=null;state.model='';state.searchRecorded=false;state.renderedText=null;state.needsSettings=false;render(state);}
      }
    }
    function configure(next){
      config={...config,...next};
      if(!allowPage())return;
      // Initial/waking CONFIG can precede credential restoration. Only compare
      // authoritative snapshots, so a first explicit click survives that wait.
      const authoritative=config.connected&&config.hasConfig&&!config.awaitingConfig&&!config.restoring;
      if(authoritative){
        const changed=acceptedConfig&&(acceptedConfig.identity!==config.identity||
          Number.isSafeInteger(acceptedConfig.taskRevision)&&Number.isSafeInteger(config.taskRevision)&&acceptedConfig.taskRevision!==config.taskRevision);
        if(changed)invalidate('draft.connectionChanged');
        else if(acceptedConfig?.ready&&!config.ready){
          // Temporary local/provider unavailability interrupts active work,
          // but a completed answer still belongs to the same source/account.
          for(const [requestId]of requests)options.send?.({type:'CANCEL',requestId});requests.clear();
          for(const state of states)if(isActive(state)){
            state.capture?.abort();state.capture=null;state.preparedImages=null;
            state.status='error';state.intent=false;state.requestId=null;
            state.errorKey=config.needsProvider||'status.connectionLost';state.needsSettings=true;state.availabilityInterrupted=true;state.recoveryStatus='error';
          }
        }
        acceptedConfig={identity:config.identity,ready:config.ready,taskRevision:config.taskRevision};
      }
      for(const state of states){
        if(authoritative&&config.ready&&state.availabilityInterrupted){
          state.availabilityInterrupted=false;state.needsSettings=false;state.status=state.recoveryStatus||'error';state.recoveryStatus=undefined;
          state.errorKey=state.status==='done'||!state.text?'':'draft.incomplete';
        }
        if(state.intent)dispatch(state);render(state);
      }scheduleScan();
    }
    function connectionLost(key='status.connectionLost'){
      config.connected=false;
      if(!allowPage())return;
      requests.clear();
      // A sleeping worker may restart its in-memory revision. Keep completed
      // output across that wake, while still comparing its credential identity.
      if(acceptedConfig)acceptedConfig={...acceptedConfig,taskRevision:undefined};
      for(const state of states){if(isActive(state)){state.capture?.abort();state.capture=null;state.preparedImages=null;state.status='error';state.intent=false;state.requestId=null;state.errorKey=key;}render(state);}
    }
    function refresh(){if(!allowPage())return;for(const state of states)render(state);scheduleScan();}
    function clearState({cancelRequests=false}={}){
      if(scanTimer!==undefined){view.clearTimeout(scanTimer);scanTimer=undefined;}
      capturedThread=null;
      if(cancelRequests)for(const [requestId]of requests)options.send?.({type:'CANCEL',requestId});
      for(const state of states){
        state.capture?.abort();state.capture=null;state.preparedImages=null;
        state.intent=false;state.input=null;state.requestId=null;state.text='';state.sources=[];state.usage=null;state.renderedText=null;
        state.ui.answer.replaceChildren();state.ui.sources.replaceChildren();
      }
      requests.clear();for(const binding of Array.from(bindings.values()))detach(binding);
      for(const state of states){state.panel.remove();state.editor=null;state.binding=null;}
      states.clear();byEditor=new WeakMap();
    }
    function reset(){
      clearState({cancelRequests:true});
      if(!disposed&&pageAllowed())scheduleScan();
    }
    const observer=typeof view.MutationObserver==='function'?new view.MutationObserver(changes=>{
      if(!allowPage())return;
      if(changes.some(change=>!own(change.target)&&!(change.type==='childList'&&
        [...change.addedNodes,...change.removedNodes].some(node=>node.nodeType===1)&&
        Array.from(change.addedNodes||[]).every(node=>node.nodeType!==1||node.matches?.(OWN))&&
        Array.from(change.removedNodes||[]).every(node=>node.nodeType!==1||node.matches?.(OWN)&&node.isConnected))))scheduleScan();
    }):null;
    observer?.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['data-testid','contenteditable','aria-hidden','hidden','style','class','lang','src','srcset']});
    const onInput=event=>{if(!allowPage()||own(event.target))return;const editor=event.target?.closest?.(EDITOR);if(editor){const state=byEditor.get(editor);if(state)render(state);scheduleScan();}};
    const onFocus=event=>{if(allowPage()&&!own(event.target))scheduleScan();};
    const onMediaLoad=event=>{if(allowPage()&&!own(event.target)&&['IMG','VIDEO'].includes(event.target?.tagName))scheduleScan();};
    document.addEventListener('input',onInput,true);document.addEventListener('focusin',onFocus,true);document.addEventListener('load',onMediaLoad,true);
    view.addEventListener('resize',scheduleScan,{passive:true});
    scan();
    return {configure,handleMessage,connectionLost,scan,refresh,reset,
      get activeCount(){return Array.from(states).filter(isActive).length;},
      destroy(){disposed=true;observer?.disconnect();view.clearTimeout(scanTimer);document.removeEventListener('input',onInput,true);document.removeEventListener('focusin',onFocus,true);document.removeEventListener('load',onMediaLoad,true);view.removeEventListener('resize',scheduleScan);reset();}
    };
  }
  return Object.freeze({create,MAX_TEXT});
});
