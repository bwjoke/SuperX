'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { placeCards, railBounds, placeRailRows, placeManualCard, placeRailSeparators } = require('../extension/overlay-layout.js');

const viewport = { width: 1440, height: 900 };
const post = (id, top, bottom, height = 180, right = 900) => ({
  id, height, rect: { top, bottom, left: 300, right, width: right - 300, height: bottom - top }
});

test('a manual card starts at its post top and can extend past a short post',()=>{
  const rect=Object.freeze({top:100,bottom:180});
  assert.deepEqual(placeManualCard(rect,viewport),{hidden:false,reason:null,top:100,contentOffset:0,maxHeight:800});
});

test('a partially scrolled manual card retains its anchor and clips below the native header',()=>{
  assert.deepEqual(placeManualCard({top:-100,bottom:300},viewport,{headerHeight:70}),{hidden:false,reason:null,top:-100,contentOffset:170,maxHeight:830});
  assert.deepEqual(placeManualCard({top:120,bottom:300},{left:0,top:100,width:1440,height:800},{headerHeight:53}),{hidden:false,reason:null,top:120,contentOffset:33,maxHeight:747});
});

test('offscreen posts and invalid viewports never create a manual card',()=>{
  for(const rect of [{top:900,bottom:1100},{top:-300,bottom:0},{top:100,bottom:100},{top:NaN,bottom:300}])assert.equal(placeManualCard(rect,viewport).hidden,true);
  assert.equal(placeManualCard({top:20,bottom:200},viewport,{headerHeight:900}).hidden,true);
  assert.equal(placeManualCard({top:20,bottom:200},{width:0,height:900}).hidden,true);
});

test('cards overlay the right of original posts without mutating feed geometry', () => {
  const items = [post('one', 100, 400), post('two', 400, 700)];
  const before = JSON.stringify(items);
  for (const item of items) { Object.freeze(item.rect); Object.freeze(item); }
  Object.freeze(items);
  const [one, two] = placeCards(items, viewport);
  assert.equal(JSON.stringify(items), before);
  assert.equal(one.left, 908);
  assert.equal(one.top, 112);
  assert.equal(one.width, 320);
  assert.equal(one.height, 180);
  assert.equal(two.top, 412);
  assert.ok(one.left > items[0].rect.right);
});

test('right-hand space shrinks a card and never forces it into the feed', () => {
  const [card] = placeCards([post('one', 100, 400)], { width: 1180, height: 900 });
  assert.equal(card.left, 908);
  assert.equal(card.width, 264);
  assert.ok(card.left + card.width <= 1180 - 8);
  const [hidden] = placeCards([post('one', 100, 400)], { width: 1100, height: 900 });
  assert.equal(hidden.hidden, true);
  assert.equal(hidden.reason, 'no-right-room');
});

test('short posts constrain answer height instead of overlapping later cards', () => {
  const [one, two, three] = placeCards([
    post('one', 100, 150, 700), post('two', 150, 175, 300), post('three', 175, 700, 400)
  ], viewport);
  assert.equal(one.maxHeight, 42);
  assert.equal(one.height, 42);
  assert.equal(one.compact, true);
  assert.equal(two.maxHeight, 17);
  assert.equal(two.height, 17);
  assert.ok(one.top + one.height + 8 <= two.top);
  assert.ok(two.top + two.height + 8 <= three.top);
  assert.equal(three.height, 400);
});

test('visual sorting leaves the returned item order stable', () => {
  const result = placeCards([post('second', 300, 600), post('first', 100, 300, 500)], viewport);
  assert.equal(result[0].id, 'second');
  assert.equal(result[1].id, 'first');
  assert.ok(result[1].top + result[1].height + 8 <= result[0].top);
});

test('viewport clipping keeps a tall post card anchored to its own post', () => {
  const [card] = placeCards([post('tall', -100, 1500, 600)], viewport);
  assert.equal(card.top, -88);
  assert.equal(card.clipTop, 88);
  assert.equal(card.visibleHeight, 512);
  const [above] = placeCards([post('tall', -500, 1500, 180)], viewport);
  assert.equal(above.hidden, true);
  assert.equal(above.reason, 'card-offscreen');
  const [bottom] = placeCards([post('bottom', 830, 1200, 300)], viewport);
  assert.equal(bottom.top, 842);
  assert.equal(bottom.height, 50);
  assert.ok(bottom.top + bottom.height <= viewport.height - 8);
});

test('offscreen posts and duplicate post tops cannot produce overlapping cards', () => {
  const result = placeCards([
    post('above', -300, -1), post('below', 901, 1200),
    post('duplicate-a', 100, 400), post('duplicate-b', 100, 400)
  ], viewport);
  assert.equal(result[0].reason, 'post-offscreen');
  assert.equal(result[1].reason, 'post-offscreen');
  assert.equal(result[2].reason, 'no-vertical-room');
  assert.equal(result[3].hidden, false);
});

test('resize recalculates placement using current rects and viewport dimensions', () => {
  const items = [post('one', 50, 350)];
  const wide = placeCards(items, viewport)[0];
  const narrow = placeCards(items, { width: 1140, height: 500 })[0];
  const tooNarrow = placeCards(items, { width: 1024, height: 500 })[0];
  assert.equal(wide.width, 320);
  assert.equal(narrow.width, 224);
  assert.equal(narrow.left, wide.left);
  assert.equal(tooNarrow.hidden, true);
});

test('sidebar boundary widens overlay across the entire right sidebar', () => {
  const items = [post('one', 100, 400)];
  const before = JSON.stringify(items);
  const [card] = placeCards(items, viewport, { sidebarRight: 1320 });
  assert.equal(card.left, 908);
  assert.equal(card.width, 412);
  assert.equal(card.left + card.width, 1320);
  assert.equal(JSON.stringify(items), before);
  assert.ok(card.left > items[0].rect.right);
});

test('sidebar overlay clips at the viewport edge and hides if the sidebar leaves too little room', () => {
  const [clipped] = placeCards([post('one', 100, 400)], viewport, { sidebarRight: 1600 });
  assert.equal(clipped.width, 524);
  assert.equal(clipped.left + clipped.width, viewport.width - 8);
  for (const sidebarRight of [1127, 0, -100]) {
    const [card] = placeCards([post('one', 100, 400)], viewport, { sidebarRight });
    assert.equal(card.hidden, true);
    assert.equal(card.reason, 'no-right-room');
  }
  const [minimum] = placeCards([post('one', 100, 400)], viewport, { sidebarRight: 1128 });
  assert.equal(minimum.width, 220);
});

test('sidebar boundary is measured again after resizing, while absent or invalid bounds retain fallback width', () => {
  const items = [post('one', 50, 350)];
  const wide = placeCards(items, viewport, { sidebarRight: 1370 })[0];
  const narrow = placeCards(items, { width: 1200, height: 500 }, { sidebarRight: 1190 })[0];
  assert.equal(wide.width, 462);
  assert.equal(narrow.width, 282);
  assert.equal(wide.left, narrow.left);
  for (const sidebarRight of [undefined, null, '1370', NaN, Infinity]) {
    const fallback = placeCards(items, viewport, { sidebarRight })[0];
    assert.equal(fallback.width, 320);
  }
});

test('sidebar width respects offset and fractional viewport geometry', () => {
  const [card] = placeCards([post('fraction', 120.5, 500.25, 180, 990.125)],
    { left: 100, top: 100, width: 1440, height: 600 }, { sidebarRight: 1480.5 });
  assert.equal(card.left, 998.125);
  assert.equal(card.width, 482.375);
  assert.equal(card.left + card.width, 1480.5);
});

test('focus favors the reading position and never changes per-post anchors', () => {
  const items = [post('one', 0, 120), post('two', 120, 550), post('three', 550, 1000)];
  const normal = placeCards(items, viewport);
  assert.equal(normal.filter(card => card.focused).length, 1);
  assert.equal(normal[1].focused, true);
  const selected = placeCards(items, viewport, { focusedId: 'three' });
  assert.equal(selected[2].focused, true);
  assert.deepEqual(selected.map(card => [card.left, card.top]), normal.map(card => [card.left, card.top]));
});

test('invalid rectangles and viewports return finite hidden placements', () => {
  const items = [null, { id: 'bad', rect: { top: NaN, bottom: 200, left: 300, right: 900 } },
    post('zero', 100, 100), post('good', 100, 200)];
  const result = placeCards(items, viewport, { width: Infinity, minWidth: -10, gap: NaN });
  assert.equal(result[0].hidden, true);
  assert.equal(result[1].hidden, true);
  assert.equal(result[2].hidden, true);
  assert.equal(result[3].hidden, false);
  for (const card of result) for (const name of ['left', 'top', 'width', 'height', 'maxHeight', 'clipTop', 'clipBottom']) {
    assert.ok(Number.isFinite(card[name]), `${card.id}: ${name}`);
  }
  assert.equal(placeCards([post('one', 100, 400)], { width: Infinity, height: 900 })[0].reason, 'invalid-viewport');
  assert.deepEqual(placeCards(null, viewport), []);
});

test('explicit viewport offsets and fractional CSS coordinates retain the boundary', () => {
  const [card] = placeCards([post('fraction', 120.5, 500.25, 900, 990.125)],
    { left: 100, top: 100, width: 1440, height: 600 });
  assert.equal(card.left, 998.125);
  assert.equal(card.top, 132.5);
  assert.equal(card.height, 559.5);
  assert.ok(card.top + card.height <= 692);
});

test('native rail covers the complete right column with no gap or inset', () => {
  const primary = Object.freeze({ left: 300, right: 900, top: 0, bottom: 900 });
  const sidebar = Object.freeze({ left: 930, right: 1300, top: 0, bottom: 900 });
  assert.deepEqual(railBounds(primary, sidebar, viewport), {
    hidden: false, reason: null, left: 900, top: 0, width: 400, height: 900
  });
  // The rail includes the native 30px gutter as well as the widgets' column.
  assert.equal(primary.right, 900);
  assert.equal(sidebar.left, 930);
});

test('rail width uses the native sidebar edge and clips to the viewport on resize', () => {
  const primary = { left: 300, right: 900 };
  const sidebar = { left: 930, right: 1350 };
  const clipped = railBounds(primary, sidebar, { width: 1200, height: 700 });
  assert.equal(clipped.left, 900);
  assert.equal(clipped.width, 300);
  assert.equal(clipped.height, 700);
  const narrow = railBounds(primary, sidebar, { width: 1119, height: 700 });
  assert.equal(narrow.hidden, true);
  assert.equal(narrow.reason, 'no-right-room');
  const exact = railBounds(primary, sidebar, { width: 1120, height: 700 });
  assert.equal(exact.width, 220);
  assert.equal(exact.hidden, false);
});

test('missing sidebar uses a bounded fallback without changing the feed edge', () => {
  const primary = { left: 300, right: 900 };
  assert.equal(railBounds(primary, null, viewport).width, 320);
  assert.equal(railBounds(primary, null, { width: 1150, height: 900 }).width, 250);
  assert.equal(railBounds(primary, null, viewport, { fallbackWidth: 380 }).width, 380);
  const clippedLeft = railBounds({ left: -200, right: 100 }, { left: 100, right: 700 },
    { left: 150, top: 40, width: 900, height: 700 });
  assert.deepEqual(clippedLeft, { hidden: false, reason: null, left: 150, top: 40, width: 550, height: 700 });
});

test('rail rejects invalid coordinates and insufficient right room with finite geometry', () => {
  for (const bounds of [
    railBounds({ left: 300, right: NaN }, null, viewport),
    railBounds({ left: 300, right: 200 }, null, viewport),
    railBounds({ left: 300, right: 1500 }, null, viewport),
    railBounds({ left: 300, right: 900 }, null, { width: Infinity, height: 900 })
  ]) {
    assert.equal(bounds.hidden, true);
    for (const key of ['left', 'top', 'width', 'height']) assert.ok(Number.isFinite(bounds[key]));
  }
});

test('rail rows exactly follow post bounds and leave the original rects unchanged', () => {
  const items = [post('one', 100, 250), post('two', 250, 600)];
  const snapshot = JSON.stringify(items);
  for (const item of items) { Object.freeze(item.rect); Object.freeze(item); }
  const [one, two] = placeRailRows(Object.freeze(items), viewport);
  assert.equal(JSON.stringify(items), snapshot);
  assert.equal(one.top, 100);
  assert.equal(one.bottom, 250);
  assert.equal(one.height, 150);
  assert.equal(one.contentOffset, 0);
  assert.equal(one.contentHeight, 150);
  assert.equal(two.top, one.bottom);
  assert.equal(two.height, 350);
});

test('overlapping post rectangles cap rows at the next post without a gap', () => {
  const [later, first] = placeRailRows([post('later', 300, 550), post('first', 100, 500)], viewport);
  assert.equal(first.top, 100);
  assert.equal(first.bottom, 300);
  assert.equal(first.height, 200);
  assert.equal(later.top, first.bottom);
  assert.equal(later.id, 'later');
});

test('a partially scrolled long post keeps its row and exposes content below the header', () => {
  const [row] = placeRailRows([post('long', -500, 1200)], viewport);
  assert.equal(row.top, -500);
  assert.equal(row.bottom, 1200);
  assert.equal(row.height, 1700);
  assert.equal(row.contentOffset, 553);
  assert.equal(row.visibleTop, 53);
  assert.equal(row.visibleBottom, 900);
  assert.equal(row.contentHeight, 847);
  assert.equal(row.top + row.contentOffset, 53);
});

test('header and bottom clipping keep visible content inside each row', () => {
  const [underHeader, clippedTop, clippedBottom] = placeRailRows([
    post('hidden', 0, 40), post('top', 40, 120), post('bottom', 850, 1300)
  ], viewport);
  assert.equal(underHeader.hidden, true);
  assert.equal(underHeader.reason, 'outside-content');
  assert.equal(clippedTop.top, 40);
  assert.equal(clippedTop.contentOffset, 13);
  assert.equal(clippedTop.contentHeight, 67);
  assert.equal(clippedBottom.top, 850);
  assert.equal(clippedBottom.contentOffset, 0);
  assert.equal(clippedBottom.contentHeight, 50);
  assert.equal(clippedBottom.visibleBottom, 900);
});

test('rail rows handle tiny posts, duplicate anchors, and nonzero viewport offsets', () => {
  const [duplicate, tiny, next] = placeRailRows([
    post('duplicate', 100, 105), post('tiny', 100, 105), post('next', 105, 300)
  ], viewport);
  assert.equal(duplicate.hidden, true);
  assert.equal(duplicate.reason, 'no-row-height');
  assert.equal(tiny.height, 5);
  assert.equal(next.top, tiny.bottom);
  const [offset] = placeRailRows([post('offset', 100, 600)],
    { left: 50, top: 150, width: 1440, height: 400 }, { headerHeight: 40 });
  assert.equal(offset.top, 100);
  assert.equal(offset.contentOffset, 90);
  assert.equal(offset.visibleTop, 190);
  assert.equal(offset.contentHeight, 360);
});

test('rail rows handle invalid and offscreen posts without unsafe dimensions', () => {
  const result = placeRailRows([null, post('above', -300, -1), post('below', 901, 1200),
    { id: 'infinite', rect: { top: -Infinity, bottom: 300 } }, post('good', 100, 200)], viewport);
  assert.equal(result[0].reason, 'invalid-rect');
  assert.equal(result[1].reason, 'post-offscreen');
  assert.equal(result[2].reason, 'post-offscreen');
  assert.equal(result[3].reason, 'invalid-rect');
  assert.equal(result[4].hidden, false);
  for (const row of result) for (const key of ['top', 'bottom', 'height', 'contentOffset', 'contentHeight', 'visibleTop', 'visibleBottom']) {
    assert.ok(Number.isFinite(row[key]));
  }
  assert.equal(placeRailRows([post('one', 100, 200)], { width: 0, height: 900 })[0].reason, 'invalid-viewport');
  assert.deepEqual(placeRailRows(undefined, viewport), []);
});

test('separators retain the native fractional coordinate, thickness, and color without mutating samples', () => {
  const lines = Object.freeze([
    Object.freeze({ top: 383.45, width: 0.8, color: 'rgb(47, 51, 54)' }),
    Object.freeze({ top: 91.125, color: '#2f3336' })
  ]);
  const snapshot = JSON.stringify(lines);
  assert.deepEqual(placeRailSeparators(lines, viewport), [
    { top: 91.125, width: 1, color: '#2f3336' },
    { top: 383.45, width: 0.8, color: 'rgb(47, 51, 54)' }
  ]);
  assert.equal(JSON.stringify(lines), snapshot);
});

test('separators clip painted intervals at the header and viewport edges', () => {
  const lines = [
    { top: 52, width: 1, color: 'hidden' },
    { top: 52.5, width: 1, color: 'header' },
    { top: 899.5, width: 1, color: 'bottom' },
    { top: 900, width: 1, color: 'below' }
  ];
  assert.deepEqual(placeRailSeparators(lines, viewport), [
    { top: 53, width: 0.5, color: 'header' },
    { top: 899.5, width: 0.5, color: 'bottom' }
  ]);
  const [offset] = placeRailSeparators([{ top: 189.5, width: 0.8, color: 'offset' }],
    { left: 50, top: 150, width: 1440, height: 400 }, { headerHeight: 40 });
  assert.equal(offset.top, 190);
  assert.equal(offset.color, 'offset');
  assert.ok(Math.abs(offset.width - 0.3) < 1e-12);
  assert.deepEqual(placeRailSeparators(lines, viewport, { headerHeight: 1000 }), []);
});

test('duplicate native top and bottom samples produce one border without merging nearby distinct borders', () => {
  const lines = [
    { top: 316.1, width: 1, color: 'wider' },
    { top: 316, width: 0.8, color: 'thinner' },
    { top: 316.2, width: 0.8, color: 'distinct' },
    { top: 316.21, width: 0.7, color: 'duplicate' }
  ];
  const result = placeRailSeparators(lines, viewport);
  assert.equal(result.length, 2);
  assert.equal(result[0].top, 316.1);
  assert.equal(result[0].width, 1);
  assert.equal(result[0].color, 'wider');
  assert.equal(result[1].top, 316.2);
  assert.equal(result[1].color, 'distinct');
});

test('row overlap clipping cannot suppress the independently sampled native separator', () => {
  const items = [post('first', 100, 384.25), post('next', 384, 600)];
  const [first] = placeRailRows(items, viewport);
  assert.equal(first.bottom, 384);
  const [separator] = placeRailSeparators([{ top: 383.45, width: 0.8, color: '#2f3336' }], viewport);
  assert.equal(separator.top, 383.45);
  assert.ok(Math.abs(separator.width - 0.8) < 1e-12);
  assert.ok(separator.top + separator.width > first.bottom);
});

test('invalid separators are omitted while a partially visible zero or negative top is clipped', () => {
  const lines = [null, {}, { top: NaN }, { top: Infinity }, { top: 100, width: NaN },
    { top: 100, width: null }, { top: 100, width: 0 }, { top: 100, width: -1 },
    { top: 100, width: Infinity }, { top: Number.MAX_VALUE, width: Number.MAX_VALUE },
    { top: -100, width: 1 }, { top: 100, width: 1, color: '#333' }];
  assert.deepEqual(placeRailSeparators(lines, viewport), [{ top: 100, width: 1, color: '#333' }]);
  assert.deepEqual(placeRailSeparators([{ top: -0.5, width: 1 }], viewport, { headerHeight: 0 }),
    [{ top: 0, width: 0.5, color: undefined }]);
  assert.deepEqual(placeRailSeparators([{ top: 0, width: 0.8 }], viewport, { headerHeight: 0 }),
    [{ top: 0, width: 0.8, color: undefined }]);
  assert.deepEqual(placeRailSeparators(lines, { width: 0, height: 900 }), []);
  assert.deepEqual(placeRailSeparators(null, viewport), []);
});
