(function () {
  'use strict';
  const elements = [document.querySelector('nav'), document.querySelector('[data-testid="primaryColumn"]'), document.querySelector('[data-testid="sidebarColumn"]'), ...document.querySelectorAll('article[data-testid="tweet"]')];
  const geometry = () => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return {left:rect.left+scrollX, top:rect.top+scrollY, width:rect.width, height:rect.height, children:element.children.length};
  });
  const baseline = document.createElement('script');
  baseline.type='application/json';baseline.id='layout-baseline';
  baseline.textContent=JSON.stringify(geometry());document.body.append(baseline);
  const check = document.createElement('button');check.textContent='检查布局';check.id='layout-check';
  const report = document.createElement('p');report.id='layout-report';report.setAttribute('aria-live','polite');
  const toolbar=document.querySelector('.toolbar');toolbar.append(check,report);
  // Read real browser geometry: short native rows let full-size buttons
  // overflow, which a fake DOM or a 34px preview row cannot exercise.
  const manualAlignment=()=>[...document.querySelectorAll('superx-post-action')].map(host=>{
    const button=host.shadowRoot?.querySelector('button'),slot=host.nextElementSibling;
    const reference=slot?.matches('button, [role="button"]')?slot:slot?.querySelector('button, [role="button"]');
    if(!button||!reference)return {aligned:false,offset:null};
    const a=button.getBoundingClientRect(),b=reference.getBoundingClientRect(),offset=a.top+a.height/2-b.top-b.height/2;
    return {aligned:Math.abs(offset)<=0.5,offset};
  });
  globalThis.superxManualAlignmentProbe=manualAlignment;
  check.addEventListener('click',()=>{
    const initial=JSON.parse(baseline.textContent),current=geometry();
    const changed=current.some((rect,index)=> ['left','top','width',...(index===0?[]:['height','children'])].some(key=>Math.abs(rect[key]-initial[index][key])>0.1));
    report.textContent=changed?'检测到原页面几何变化（调整窗口后请刷新建立新基线）':'✓ 左栏 / 信息流 / 帖子尺寸与位置均未改变';
    const alignment=manualAlignment();
    if(alignment.length)report.textContent+=alignment.every(item=>item.aligned)?' · ✓ SuperX 与原生按钮垂直居中对齐':' · ✗ SuperX 与原生按钮未对齐';
  });
})();
