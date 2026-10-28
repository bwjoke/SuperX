(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SuperXXDOM = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // X currently serves both the test-id based timeline and the semantic/URT
  // timeline. Keep identity, ownership and presentation discovery together so
  // an independently rolled-out composer cannot change which post is checked.
  const editorSelector = '[data-testid^="tweetTextarea_"], textarea[data-textarea-autogrow], textarea[aria-multiline="true"]';
  const quoteSelector = '[data-slot="embedded-tweet-frame"], [data-testid="quoteTweet"], [data-testid="quotedTweet"], [data-testid="quoted-post"], [data-testid="card.wrapper"]';
  const attr = (node, name) => node?.getAttribute?.(name) || '';
  const tag = node => String(node?.tagName || '').toLowerCase();
  const all = (scope, selector) => Array.from(scope?.querySelectorAll?.(selector) || []);
  const classes = node => attr(node, 'class').split(/\s+/);
  const hasClass = (node, name) => classes(node).includes(name);
  const documentFor = node => node?.nodeType === 9 ? node : node?.ownerDocument;
  const contains = (scope, node) => {
    for (let current = node; current; current = current.parentElement) if (current === scope) return true;
    return false;
  };
  const styleFor = node => {
    try { return documentFor(node)?.defaultView?.getComputedStyle?.(node) || {}; }
    catch (_) { return {}; }
  };

  function canonicalPostURL(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, 'https://x.com');
      if (!/^https?:$/.test(url.protocol) || url.username || url.password ||
          !/^(?:www\.)?(?:x\.com|twitter\.com)$/i.test(url.hostname)) return null;
      const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)(?:\/|$)/) ||
        url.pathname.match(/^\/i\/web\/status\/(\d+)(?:\/|$)/);
      if (!match) return null;
      return match.length === 2 ? `https://x.com/i/web/status/${match[1]}` :
        `https://x.com/${match[1].toLowerCase()}/status/${match[2]}`;
    } catch (_) { return null; }
  }

  function visible(node, scope) {
    for (let current = node; current; current = current.parentElement) {
      if (current.hidden || current.hasAttribute?.('hidden') || current.hasAttribute?.('inert') ||
          attr(current, 'aria-hidden') === 'true') return false;
      const style = styleFor(current), inline = attr(current, 'style');
      if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) ||
          style.contentVisibility === 'hidden' || Number.parseFloat(style.opacity) === 0 ||
          /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))\s*(?:!important\s*)?(?:;|$)/i.test(inline)) return false;
      if (current === scope) return true;
    }
    return !scope || scope?.nodeType === 9;
  }

  function quoteBoundary(node) {
    return attr(node, 'data-slot') === 'embedded-tweet-frame' ||
      /^(?:quoteTweet|quotedTweet|quoted-post|card\.wrapper)$/i.test(attr(node, 'data-testid'));
  }

  function owns(node, scope) {
    if (!node || !scope || !visible(node, scope)) return false;
    let articles = 0;
    for (let current = node; current; current = current.parentElement) {
      if (current === scope) return true;
      if (quoteBoundary(current)) return false;
      if (tag(current) === 'form' || tag(current) === 'textarea' || attr(current, 'contenteditable') === 'true' ||
          current.hasAttribute?.('data-media-upload-dropzone') || /^(?:superx-|grok-first-)/.test(tag(current))) return false;
      if (tag(current) === 'article' && ++articles > (tag(scope) === 'article' ? 0 : 1)) return false;
    }
    return false;
  }

  function inDialog(node) {
    for (let current = node; current; current = current.parentElement) {
      if (['dialog', 'alertdialog'].includes(attr(current, 'role')) || tag(current) === 'dialog' ||
          attr(current, 'aria-modal') === 'true' || /^(?:sheetDialog|swipe-to-dismiss)$/.test(attr(current, 'data-testid'))) return true;
    }
    return false;
  }

  function modernBody(node) {
    if (attr(node, 'dir') !== 'auto') return false;
    if (tag(node) === 'textarea' || attr(node, 'contenteditable') === 'true') return false;
    return hasClass(node, 'whitespace-pre-wrap') || ['pre-wrap', 'pre-line'].includes(styleFor(node).whiteSpace);
  }

  function bodyNodes(scope) {
    const legacy = all(scope, '[data-testid="tweetText"]').filter(node => owns(node, scope));
    if (legacy.length) return legacy;
    const candidates = all(scope, '[dir="auto"]').filter(node => owns(node, scope) && modernBody(node));
    return candidates.filter(node => !candidates.some(other => other !== node && contains(other, node)));
  }

  function bodyExpanders(body) {
    if (!body || !modernBody(body)) return [];
    // The native inline expander is a final sibling of the text tokens, not
    // an arbitrary article button. Its structure is independent of UI locale.
    const last = body.children?.[body.children.length - 1];
    return tag(last) === 'button' && attr(last, 'type') === 'button' && visible(last, body) &&
      hasClass(last, 'max-w-full') && hasClass(last, 'text-brand') && hasClass(last, 'hover:underline') ? [last] : [];
  }

  function authorNode(scope) {
    const legacy = all(scope, '[data-testid="User-Name"]').find(node => owns(node, scope));
    if (legacy) return legacy;
    const groups = all(scope, 'div, header, span').filter(node => owns(node, scope) && hasClass(node, 'x-middot-group'));
    const grouped = groups.find(group => all(group, 'a[href]').some(anchor => profileHandle(attr(anchor, 'href'))));
    if (grouped) return grouped;
    const bodies = bodyNodes(scope), candidates = new Map();
    for (const anchor of all(scope, 'a[href]')) {
      const handle = profileHandle(attr(anchor, 'href'));
      if (!handle || !owns(anchor, scope) || bodies.some(body => contains(body, anchor))) continue;
      if (!candidates.has(handle)) candidates.set(handle, []);
      candidates.get(handle).push(anchor);
    }
    const url = postURL(scope), expected = url && !url.includes('/i/web/status/') ? url.split('/')[3] : '';
    const anchors = expected && candidates.has(expected) ? candidates.get(expected) :
      [...candidates.values()].sort((a, b) => b.length - a.length).find(items => items.length > 1);
    if (anchors?.length) {
      let common = anchors[0];
      while (common && !anchors.every(anchor => contains(common, anchor))) common = common.parentElement;
      if (common && common !== scope && !bodies.some(body => contains(common, body))) return common;
    }
    return groups[0] || null;
  }

  function profileHandle(value) {
    try {
      const url = new URL(value, 'https://x.com');
      if (!/^https?:$/.test(url.protocol) || url.username || url.password || !/^(?:www\.)?(?:x\.com|twitter\.com)$/i.test(url.hostname)) return '';
      return url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1]?.toLowerCase() || '';
    } catch (_) { return ''; }
  }

  function isModern(node) {
    if (!node) return false;
    if (attr(node, 'data-testid') === 'tweet' || attr(node, 'data-testid') === 'primaryColumn') return false;
    for (let current = node; current; current = current.parentElement) {
      if (attr(current, 'data-slot') === 'embedded-tweet-frame' || attr(current, 'data-href') || attr(current, 'id').startsWith('urt:')) return true;
      if (tag(current) === 'main') break;
    }
    return bodyNodes(node).some(modernBody) || all(node, '[id]').some(item => attr(item, 'id').startsWith('urt:'));
  }

  function shell(article) {
    if (!article || tag(article) !== 'article' || attr(article, 'data-testid') === 'tweet') return article || null;
    let navigation = null;
    for (let current = article.parentElement, depth = 0; current && depth++ < 12; current = current.parentElement) {
      if (quoteBoundary(current) || ['main', 'li'].includes(tag(current)) || attr(current, 'id').startsWith('urt:')) break;
      if (canonicalPostURL(attr(current, 'data-href'))) return current;
      if (!navigation && current.hasAttribute?.('data-navigation-stop')) navigation = current;
    }
    return navigation || article;
  }

  function postURL(article) {
    if (!article) return null;
    const frame = shell(article);
    const bodies = bodyNodes(article);
    let explicit = canonicalPostURL(attr(frame, 'data-href'));
    if (!explicit && tag(article) !== 'article') {
      const nested = all(article, '[data-href]').filter(node => owns(node, article) && attr(node, 'role') === 'link' &&
        !bodies.some(body => contains(body, node))).map(node => canonicalPostURL(attr(node, 'data-href'))).filter(Boolean);
      if (new Set(nested).size === 1) explicit = nested[0];
    }
    const inAction = node => {
      for (let current = node; current && current !== article; current = current.parentElement) if (current.hasAttribute?.('data-engagement-action')) return true;
      return false;
    };
    const timed = all(article, 'a[href]').filter(anchor => owns(anchor, article) &&
      (all(anchor, 'time').some(time => owns(time, article)) ||
        anchor.hasAttribute?.('data-base-ui-tooltip-trigger') && !bodies.some(body => contains(body, anchor)) &&
        !inAction(anchor)));
    const urls = [...new Set(timed.map(anchor => canonicalPostURL(attr(anchor, 'href'))).filter(Boolean))];
    const identities = [...new Set(urls.map(url => url.match(/\/status\/(\d+)$/)?.[1]))];
    if (identities.length > 1 || explicit && identities.length === 1 && !explicit.endsWith('/status/' + identities[0])) return null;
    if (explicit) return explicit;
    if (urls.length === 1) {
      // The expanded conversation main post has no linked shell. A lingering
      // old main node must not inherit the newly navigated route's identity.
      const route = canonicalPostURL(documentFor(article)?.location?.href || '');
      if (frame !== article && frame.hasAttribute?.('data-navigation-stop') && attr(frame, 'tabindex') === '-1' && route &&
          route.match(/\/status\/(\d+)$/)?.[1] !== identities[0]) return null;
      return urls[0];
    }
    if (attr(article, 'data-testid') === 'tweet') {
      return all(article, 'a[href]').filter(anchor => owns(anchor, article)).map(anchor => canonicalPostURL(attr(anchor, 'href'))).find(Boolean) || null;
    }
    return null;
  }

  function articles(scope) {
    scope ||= typeof document !== 'undefined' ? document : null;
    return all(scope, 'article').filter(article => {
      if (!visible(article) || inDialog(article)) return false;
      for (let current = article.parentElement; current; current = current.parentElement) {
        if (quoteBoundary(current) || ['article', 'form'].includes(tag(current)) || current.hasAttribute?.('data-media-upload-dropzone') || /^superx-|^grok-first-/.test(tag(current))) return false;
      }
      return attr(article, 'data-testid') === 'tweet' || modernPageAllowed(article) && isModern(article) && Boolean(postURL(article));
    });
  }

  function row(article) {
    for (let current = article?.parentElement; current; current = current.parentElement) {
      if (tag(current) === 'li' && current.hasAttribute?.('data-index') || attr(current, 'data-testid') === 'cellInnerDiv') return current;
      if (tag(current) === 'main') break;
    }
    return shell(article);
  }

  function primary(scope) {
    scope ||= typeof document !== 'undefined' ? document : null;
    const legacy = all(scope, '[data-testid="primaryColumn"]').find(node => visible(node) && !inDialog(node));
    if (legacy) return legacy;
    return all(scope, 'main, [role="main"]').filter(node => modernPageAllowed(node) && visible(node) && !inDialog(node) &&
      (articles(node).length || all(node, '[id]').some(item => /^urt:(?:home:|conversation:)/.test(attr(item, 'id'))) ||
        all(node, editorSelector).some(isEditor)))
      .sort((a, b) => articles(b).length - articles(a).length)[0] || null;
  }

  function sidebar(main) {
    if (!main) return null;
    const doc = documentFor(main), legacy = all(doc, '[data-testid="sidebarColumn"]').find(node => visible(node) && !inDialog(node));
    if (legacy) return legacy;
    const mainRect = main.getBoundingClientRect?.();
    const candidates = all(main.parentElement, 'aside').filter(node => visible(node) && !inDialog(node) && !contains(main, node));
    return candidates.find(node => {
      const rect = node.getBoundingClientRect?.();
      return !mainRect || !rect || rect.width > 0 && rect.left >= mainRect.right - 2;
    }) || null;
  }

  function quoteRoots(scope) {
    return all(scope, quoteSelector).filter(node => visible(node, scope) && owns(node.parentElement, scope));
  }

  function pageHeader(main) {
    if (!main) return null;
    const candidates = all(main, '[data-page-header]').filter(node => visible(node, main) &&
      !all(main, 'article').some(article => contains(article, node)) && !formAncestor(node));
    return candidates[0] || null;
  }

  function formAncestor(node) {
    for (let current = node; current; current = current.parentElement) if (tag(current) === 'form') return current;
    return null;
  }

  function modernPageAllowed(node) {
    try {
      const url = new URL(documentFor(node)?.location?.href || 'https://x.com/home');
      if (canonicalPostURL(url.href)) return true;
      return !/^\/(?:messages(?:\/|$)|settings(?:\/|$)|i\/(?:chat|grok|flow|premium|settings|money)(?:\/|$))/.test(url.pathname);
    } catch (_) { return false; }
  }

  function isEditor(editor) {
    if (!editor || !visible(editor)) return false;
    if (/^tweetTextarea_/.test(attr(editor, 'data-testid'))) return true;
    if (tag(editor) !== 'textarea' || !formAncestor(editor)) return false;
    if (!modernPageAllowed(editor)) return false;
    if (editor.hasAttribute?.('data-textarea-autogrow')) return true;
    if (attr(editor, 'aria-multiline') !== 'true' || attr(editor, 'aria-autocomplete') !== 'list') return false;
    for (let current = editor.parentElement; current; current = current.parentElement) {
      if (current.hasAttribute?.('data-media-upload-dropzone')) return true;
      if (tag(current) === 'main' || ['dialog', 'alertdialog'].includes(attr(current, 'role'))) break;
    }
    return false;
  }

  function form(editor) { return isEditor(editor) ? formAncestor(editor) : null; }

  function controls(article) {
    if (!article) return null;
    const own = node => owns(node, article);
    const iconOwned = node => {
      let svg = node;
      while (svg && svg !== article && tag(svg) !== 'svg') svg = svg.parentElement;
      if (!svg || svg === article) return own(node);
      // X hides decorative SVGs from accessibility, while the containing
      // native button remains visible and interactive. Do not treat that as
      // a hidden button, but still reject actual hidden/inert icon branches.
      const css = styleFor(svg);
      if (svg.hasAttribute?.('hidden') || svg.hasAttribute?.('inert') || css.display === 'none' ||
          ['hidden', 'collapse'].includes(css.visibility) || css.contentVisibility === 'hidden') return false;
      return own(svg.parentElement);
    };
    const legacyMore = all(article, '[data-testid="caret"]').find(own);
    const uses = all(article, 'use').filter(iconOwned);
    const moreIcon = all(article, '[data-icon="icon-more-dots-hor"]').find(iconOwned) || uses.find(node => /(?:^|[#/])icon-more-dots-hor$/.test(attr(node, 'href') || attr(node, 'xlink:href')));
    const grokIcon = all(article, '[data-icon="icon-logo-grok"]').find(iconOwned) ||
      uses.find(node => /(?:^|[#/])icon-logo-grok$/.test(attr(node, 'href') || attr(node, 'xlink:href')));
    const fromIcon = icon => {
      let fallback = null;
      for (let current = icon?.parentElement; current && current !== article; current = current.parentElement) {
        if (tag(current) === 'button' || attr(current, 'role') === 'button' || current.hasAttribute?.('tabindex')) return current;
        if (!fallback && tag(current) !== 'svg' && tag(current) !== 'g') fallback = current;
      }
      return fallback;
    };
    const more = legacyMore || fromIcon(moreIcon);
    const grok = all(article, 'button, [role="button"], [data-testid="grok"]').find(node => own(node) &&
      /grok/i.test([attr(node, 'data-testid'), attr(node, 'aria-label'), attr(node, 'title')].join(' '))) || fromIcon(grokIcon);
    const reference = grok || more;
    if (!reference) return null;
    const author = authorNode(article);
    let header = reference.parentElement;
    while (header && header !== article) {
      if (author && contains(header, author)) return null;
      const css = styleFor(header);
      if ((css.display === 'flex' && css.flexDirection !== 'column' || hasClass(header, 'flex') && !hasClass(header, 'flex-col')) && header.children?.length > 1) break;
      if (!header.parentElement || header.parentElement === article || author && contains(header.parentElement, author)) break;
      header = header.parentElement;
    }
    if (!header || header === article) return null;
    let anchor = reference;
    while (anchor.parentElement && anchor.parentElement !== header) anchor = anchor.parentElement;
    return {anchor, reference, header};
  }

  return Object.freeze({editorSelector, isEditor, form, primary, sidebar, articles, isModern, shell, row,
    postURL, bodyNodes, bodyExpanders, authorNode, quoteRoots, owns, pageHeader, controls});
});
