(function (root) {
  'use strict';

  const DEFAULTS = Object.freeze({
    width: 320, minWidth: 220, gap: 8, insetTop: 12,
    edgeInset: 8, cardGap: 8, compactHeight: 72, defaultHeight: 180
  });
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const option = (options, name, minimum = 0) =>
    finite(options[name]) && options[name] >= minimum ? options[name] : DEFAULTS[name];

  /**
   * Positions a separate fixed overlay. Rectangles are read-only snapshots from
   * getBoundingClientRect(), in the same CSS-pixel coordinates as the viewport.
   * Never writes to a post, changes its width, or moves a card over the feed.
   *
   * A following post bounds the preceding card's height. The caller must honor
   * maxHeight with overflow clipping/scrolling, including for compact headers.
   * A negative top stays negative: clipping a card must not assign its answer
   * to a different post as the user scrolls.
   * When sidebarRight is a finite CSS-pixel coordinate, the card spans from
   * the post's right edge to that sidebar boundary, within the viewport. The
   * fixed width is only a fallback when no sidebar boundary is available.
   */
  function placeCards(items, viewport, options = {}) {
    const input = Array.isArray(items) ? items : [];
    const hidden = (item, reason) => ({
      id: item?.id, hidden: true, reason, focused: false, compact: true,
      left: 0, top: 0, width: 0, height: 0, maxHeight: 0,
      clipTop: 0, clipBottom: 0, visibleHeight: 0
    });
    if (!viewport || !finite(viewport.width) || viewport.width <= 0 ||
        !finite(viewport.height) || viewport.height <= 0) {
      return input.map(item => hidden(item, 'invalid-viewport'));
    }
    const viewLeft = finite(viewport.left) ? viewport.left : 0;
    const viewTop = finite(viewport.top) ? viewport.top : 0;
    const viewRight = viewLeft + viewport.width;
    const viewBottom = viewTop + viewport.height;
    if (!finite(viewRight) || !finite(viewBottom)) {
      return input.map(item => hidden(item, 'invalid-viewport'));
    }

    options = options && typeof options === 'object' ? options : {};
    const minWidth = option(options, 'minWidth', 1);
    const width = Math.max(minWidth, option(options, 'width', 1));
    const gap = option(options, 'gap');
    const insetTop = option(options, 'insetTop');
    const edgeInset = option(options, 'edgeInset');
    const sidebarRight = finite(options.sidebarRight) ? options.sidebarRight : null;
    const cardGap = option(options, 'cardGap');
    const compactHeight = option(options, 'compactHeight');
    const defaultHeight = option(options, 'defaultHeight', 1);
    const placements = input.map(item => hidden(item, 'invalid-rect'));
    const candidates = [];

    input.forEach((item, index) => {
      const rect = item?.rect;
      if (!rect || ![rect.top, rect.bottom, rect.left, rect.right].every(finite) ||
          rect.bottom <= rect.top || rect.right <= rect.left) return;
      if (rect.bottom <= viewTop || rect.top >= viewBottom ||
          rect.right <= viewLeft || rect.left >= viewRight) {
        placements[index] = hidden(item, 'post-offscreen');
        return;
      }
      const left = rect.right + gap;
      const top = rect.top + insetTop;
      const rightBoundary = sidebarRight === null ? viewRight - edgeInset :
        Math.min(sidebarRight, viewRight - edgeInset);
      const availableWidth = rightBoundary - left;
      if (!finite(left) || !finite(top) || !finite(availableWidth) || availableWidth < minWidth) {
        placements[index] = hidden(item, 'no-right-room');
        return;
      }
      candidates.push({
        item, index, rect, left, top,
        width: sidebarRight === null ? Math.min(width, availableWidth) : availableWidth,
        wantedHeight: finite(item.height) && item.height > 0 ? item.height : defaultHeight
      });
    });

    // Keep return order identical to the caller's item order while calculating
    // boundaries in visual order. Identical anchors cannot fit two cards.
    candidates.sort((a, b) => a.top - b.top || a.index - b.index);
    candidates.forEach((candidate, position) => {
      const { item, index, left, top, wantedHeight } = candidate;
      const next = candidates[position + 1];
      const bottomLimit = Math.min(
        viewBottom - edgeInset,
        next ? next.top - cardGap : Infinity
      );
      const maxHeight = Math.max(0, bottomLimit - top);
      const height = Math.min(wantedHeight, maxHeight);
      const clipTop = Math.min(height, Math.max(0, viewTop - top));
      const clipBottom = Math.min(height - clipTop, Math.max(0, top + height - viewBottom));
      const visibleHeight = Math.max(0, height - clipTop - clipBottom);
      if (!finite(maxHeight) || visibleHeight <= 0) {
        placements[index] = hidden(item, maxHeight <= 0 ? 'no-vertical-room' : 'card-offscreen');
        return;
      }
      placements[index] = {
        id: item.id, hidden: false, reason: null, focused: false,
        left, top, width: candidate.width, height, maxHeight,
        compact: height < wantedHeight || visibleHeight < compactHeight,
        clipTop, clipBottom, visibleHeight
      };
    });

    // The focused flag lets the renderer favor the answer being read without
    // changing any anchor or permitting overlap with another post's card.
    const readingY = finite(options.readingY) ? options.readingY :
      viewTop + Math.min(160, viewport.height * 0.22);
    const showing = candidates.filter(candidate => !placements[candidate.index].hidden);
    let focus = showing.find(candidate => candidate.item.id === options.focusedId);
    if (!focus) {
      const distance = candidate => readingY < candidate.rect.top ? candidate.rect.top - readingY :
        readingY > candidate.rect.bottom ? readingY - candidate.rect.bottom : 0;
      focus = showing.reduce((best, candidate) => !best || distance(candidate) < distance(best) ? candidate : best, null);
    }
    if (focus) placements[focus.index].focused = true;
    return placements;
  }

  function viewportBounds(viewport) {
    if (!viewport || !finite(viewport.width) || viewport.width <= 0 ||
        !finite(viewport.height) || viewport.height <= 0) return null;
    const left = finite(viewport.left) ? viewport.left : 0;
    const top = finite(viewport.top) ? viewport.top : 0;
    const right = left + viewport.width;
    const bottom = top + viewport.height;
    return finite(right) && finite(bottom) ?
      { left, top, right, bottom, width: viewport.width, height: viewport.height } : null;
  }

  /**
   * The opaque rail starts at the unmodified feed edge and covers all of the
   * original right column, including the space between its native widgets.
   */
  function railBounds(primaryRect, sidebarRect, viewport, options = {}) {
    const hide = reason => ({ hidden: true, reason, left: 0, top: 0, width: 0, height: 0 });
    const view = viewportBounds(viewport);
    if (!view) return hide('invalid-viewport');
    if (!primaryRect || !finite(primaryRect.left) || !finite(primaryRect.right) ||
        primaryRect.right <= primaryRect.left) return hide('invalid-primary');
    options = options && typeof options === 'object' ? options : {};
    const fallbackWidth = finite(options.fallbackWidth) && options.fallbackWidth > 0 ? options.fallbackWidth : 320;
    const minWidth = finite(options.minWidth) && options.minWidth > 0 ? options.minWidth : 220;
    const hasSidebar = sidebarRect && finite(sidebarRect.left) && finite(sidebarRect.right) &&
      sidebarRect.right > sidebarRect.left;
    const left = Math.max(primaryRect.right, view.left);
    const naturalRight = hasSidebar ? sidebarRect.right : primaryRect.right + fallbackWidth;
    const right = Math.min(naturalRight, view.right);
    const width = right - left;
    if (!finite(naturalRight) || !finite(width) || width < minWidth) return hide('no-right-room');
    return { hidden: false, reason: null, left, top: view.top, width, height: view.height };
  }

  /**
   * Row top/bottom follow their own post; there are no margins between rows.
   * The content offset is relative to that row, so a long partially scrolled
   * post can still display its answer below the rail header without moving the
   * row or changing the feed. The renderer clips/scrolls contentHeight.
   */
  function placeRailRows(items, viewport, options = {}) {
    const input = Array.isArray(items) ? items : [];
    const hide = (item, reason) => ({
      id: item?.id, hidden: true, reason, top: 0, bottom: 0, height: 0,
      contentOffset: 0, contentHeight: 0, visibleTop: 0, visibleBottom: 0
    });
    const view = viewportBounds(viewport);
    if (!view) return input.map(item => hide(item, 'invalid-viewport'));
    options = options && typeof options === 'object' ? options : {};
    const headerHeight = finite(options.headerHeight) && options.headerHeight >= 0 ? options.headerHeight : 53;
    const contentTop = Math.min(view.bottom, view.top + headerHeight);
    const result = input.map(item => hide(item, 'invalid-rect'));
    const candidates = [];
    input.forEach((item, index) => {
      const rect = item?.rect;
      if (!rect || !finite(rect.top) || !finite(rect.bottom) || rect.bottom <= rect.top) return;
      if (rect.bottom <= view.top || rect.top >= view.bottom) {
        result[index] = hide(item, 'post-offscreen');
        return;
      }
      candidates.push({ item, index, top: rect.top, bottom: rect.bottom });
    });
    candidates.sort((a, b) => a.top - b.top || a.index - b.index);
    candidates.forEach((candidate, position) => {
      const { item, index, top } = candidate;
      const next = candidates[position + 1];
      const bottom = Math.min(candidate.bottom, next ? next.top : Infinity);
      const height = bottom - top;
      if (!finite(height) || height <= 0) {
        result[index] = hide(item, 'no-row-height');
        return;
      }
      const visibleTop = Math.max(top, contentTop);
      const visibleBottom = Math.min(bottom, view.bottom);
      const contentHeight = visibleBottom - visibleTop;
      const contentOffset = visibleTop - top;
      if (!finite(contentOffset) || !finite(contentHeight) || contentHeight <= 0) {
        result[index] = hide(item, 'outside-content');
        return;
      }
      result[index] = {
        id: item.id, hidden: false, reason: null, top, bottom, height,
        contentOffset, contentHeight, visibleTop, visibleBottom
      };
    });
    return result;
  }

  // A manually selected answer can grow past its post's bottom. Keep the top
  // anchored to that post and scroll the answer within the remaining viewport.
  function placeManualCard(rect, viewport, options = {}) {
    const hide = reason => ({hidden:true,reason,top:0,contentOffset:0,maxHeight:0});
    const view = viewportBounds(viewport);
    if (!view) return hide('invalid-viewport');
    if (!rect || !finite(rect.top) || !finite(rect.bottom) || rect.bottom <= rect.top) return hide('invalid-rect');
    if (rect.bottom <= view.top || rect.top >= view.bottom) return hide('post-offscreen');
    const headerHeight = finite(options.headerHeight) && options.headerHeight >= 0 ? options.headerHeight : 53;
    const visibleTop = Math.max(rect.top, view.top + headerHeight);
    const maxHeight = view.bottom - visibleTop;
    if (maxHeight <= 0) return hide('outside-content');
    return {hidden:false,reason:null,top:rect.top,contentOffset:visibleTop-rect.top,maxHeight};
  }

  /**
   * Separators follow the sampled native border, independently of answer rows.
   * `width` is the border's vertical thickness, not its horizontal rail span.
   * Clip the painted interval below the header and inside the viewport; keep
   * the original fractional CSS coordinates whenever no clipping is needed.
   */
  function placeRailSeparators(lines, viewport, options = {}) {
    const view = viewportBounds(viewport);
    if (!view || !Array.isArray(lines)) return [];
    options = options && typeof options === 'object' ? options : {};
    const headerHeight = finite(options.headerHeight) && options.headerHeight >= 0 ? options.headerHeight : 53;
    const contentTop = Math.min(view.bottom, view.top + headerHeight);
    if (contentTop >= view.bottom) return [];
    const candidates = [];
    for (const line of lines) {
      const top = line?.top;
      const width = line?.width === undefined ? 1 : line.width;
      if (!finite(top) || !finite(width) || width <= 0 || !finite(top + width)) continue;
      if (top + width <= contentTop || top >= view.bottom) continue;
      candidates.push({ top, width, color: line.color });
    }
    candidates.sort((a, b) => a.top - b.top);

    const groups = [];
    for (const candidate of candidates) {
      const previous = groups[groups.length - 1];
      const tolerance = 0.1 + Number.EPSILON * Math.max(1, Math.abs(candidate.top), Math.abs(previous?.anchor || 0)) * 4;
      // Compare against the group's first position so a chain of nearby samples
      // cannot swallow a genuinely different native border farther away.
      if (previous && candidate.top - previous.anchor <= tolerance) {
        if (candidate.width > previous.line.width) previous.line = candidate;
      } else {
        groups.push({ anchor: candidate.top, line: candidate });
      }
    }
    return groups.map(({ line }) => {
      const top = Math.max(contentTop, line.top);
      const bottom = Math.min(view.bottom, line.top + line.width);
      const unclipped = top === line.top && bottom === line.top + line.width;
      return { top, width: unclipped ? line.width : bottom - top, color: line.color };
    });
  }

  const api = Object.freeze({ DEFAULTS, placeCards, railBounds, placeRailRows, placeManualCard, placeRailSeparators });
  root.GrokFirstOverlayLayout = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
