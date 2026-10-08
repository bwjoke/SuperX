(function (root, factory) {
  'use strict';
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  if (root) root.XGrokCore = core;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LANGUAGES = Object.freeze([
    { value: 'auto', label: '自动 · 帖子当前显示语言' },
    { value: 'en', label: 'English' },
    { value: 'zh-CN', label: '简体中文' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
    { value: 'zh-TW', label: '繁體中文' },
    { value: 'es', label: 'Español' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
    { value: 'pt', label: 'Português' },
    { value: 'ar', label: 'العربية' },
    { value: 'ru', label: 'Русский' },
    { value: 'hi', label: 'हिन्दी' }
  ].map(Object.freeze));

  const MAX_PROMPT_LENGTH = 12000;
  const DEFAULT_PROMPTS = Object.freeze({
    explain: 'Explain what is interesting, confusing or missing in this post, adding only context that helps the reader understand it. Start directly with the useful explanation and keep it concise. Let the post determine the form; avoid a generic post-summary, classification checklist or disclaimer section.',
    verify: 'Check the specific claims that matter for understanding this post and add only useful findings or corrections. Keep the update concise, cite evidence beside the relevant finding, and place any necessary caveat beside its claim. Do not repeat the earlier explanation or add a stock fact-check or disclaimer section. The earlier explanation may be wrong; correct it when the evidence warrants.',
    comments: 'Draft exactly three distinct optional comments responding to the original X post. Each comment must be one concise natural sentence with a different useful angle. Offer natural and relevant perspectives suitable for the user to review and copy.'
  });
  function normalizePrompt(value, fallback) {
    return typeof value === 'string' && value.trim() && value.length <= MAX_PROMPT_LENGTH ? value : fallback;
  }
  function explanationMode(settings) {
    return ['preset', 'custom'].includes(settings?.explanationMode) ? settings.explanationMode : 'preset';
  }
  const DEFAULT_SETTINGS = Object.freeze({
    provider: 'cli',
    cliModel: 'grok-4.7-build-fast',
    cliWebSearch: false,
    cliAutoAnalyze: true,
    cliDwellSeconds: 5,
    enabled: true,
    dwellMs: 0,
    maxPerSession: 0,
    cooldownMs: 0,
    language: 'auto',
    interfaceLanguage: 'auto',
    apiModel: 'grok-4.3',
    apiConcurrency: 4,
    apiVerification: 'background',
    webSearch: true,
    xSearch: true,
    explanationMode: 'preset',
    explainPrompt: DEFAULT_PROMPTS.explain,
    verifyPrompt: DEFAULT_PROMPTS.verify,
    commentsPrompt: DEFAULT_PROMPTS.comments
  });

  function boundedNumber(value, fallback, min, max) {
    if (value === '' || value === null || typeof value === 'boolean') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
  }

  function validLanguage(language) {
    if (language === 'auto') return true;
    // Preserve tags accepted by previous versions without changing their spelling.
    if (/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language)) return true;
    if (!language || language.length > 255) return false;
    try { return Intl.getCanonicalLocales(language).length === 1; } catch (_) { return false; }
  }

  function responseLanguageKey(value) {
    if (typeof value !== 'string' || value === 'auto' || !validLanguage(value)) return 'auto';
    return LANGUAGES.find(item => item.value !== 'auto' && item.value.toLowerCase() === value.toLowerCase())?.value || value;
  }

  function inferredTextLanguage(text) {
    // A missing DOM language must not send us to a quoted post or search result.
    // Infer only from the author's displayed prose, excluding URLs and handles.
    const prose = String(text || '').replace(/https?:\/\/\S+|@[A-Za-z0-9_]+/g, '');
    const count = pattern => (prose.match(pattern) || []).length;
    const latin = count(/[A-Za-z\u00c0-\u024f]/g);
    const kana = count(/[\u3040-\u30ff]/g);
    const han = count(/[\u3400-\u4dbf\u4e00-\u9fff]/g);
    const hangul = count(/[\uac00-\ud7af\u1100-\u11ff]/g);
    const scripts = [
      ['ja', kana >= 2 ? kana + han : 0], ['ko', hangul],
      ['zh-CN', kana ? 0 : han]
    ].sort((a, b) => b[1] - a[1]);
    if (scripts[0][1] >= 2 && scripts[0][1] >= latin * 0.3) return scripts[0][0];
    // Cyrillic, Arabic and Devanagari each serve multiple languages. Their
    // script alone cannot justify locking Russian, Arabic or Hindi.
    // Latin script alone cannot distinguish English from French, Spanish, etc.
    // Require several English function words instead of guessing from a name.
    const words = prose.toLowerCase().match(/\b[a-z]+\b/g) || [];
    const english = words.filter(word => /^(?:the|and|this|that|these|those|is|are|was|were|has|have|with|from|for|your|you|it|its|their|they|will|would|can|could|should|of|to|in|on|as|but|not)$/.test(word));
    if (words.length >= 4 && english.length >= 2 && english.length / words.length >= 0.15) return 'en';
    return 'auto';
  }

  function resolvePostLanguage(value, post) {
    const selected = responseLanguageKey(value);
    if (selected !== 'auto') return selected;
    const hint = typeof post?.language === 'string' ? post.language : '';
    if (hint && hint !== 'auto' && !/^(?:und|mul|zxx)(?:-|$)/i.test(hint) && validLanguage(hint)) {
      try {
        const canonical = Intl.getCanonicalLocales(hint)[0], base = canonical.split('-')[0];
        if (base === 'zh') return /(?:^|-)(?:Hant|TW|HK|MO)(?:-|$)/i.test(canonical) ? 'zh-TW' : 'zh-CN';
        return LANGUAGES.some(item => item.value === base) ? base : canonical;
      } catch (_) { /* Fall back to the displayed text, never the page language. */ }
    }
    return inferredTextLanguage(post?.text);
  }

  function normalizeSettings(input) {
    const value = input && typeof input === 'object' ? input : {};
    const language = typeof value.language === 'string' ? value.language.trim() : '';
    const interfaceLanguage = typeof value.interfaceLanguage === 'string' ? value.interfaceLanguage.trim().toLowerCase() : '';
    const model = typeof value.apiModel === 'string' ? value.apiModel.trim() : '';
    return {
      // Preserve API users; new installations use the local CLI.
      provider: value.provider === undefined || value.provider === 'cli' ? 'cli' : 'api',
      cliModel: typeof value.cliModel === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value.cliModel.trim()) ? value.cliModel.trim() : typeof value.cliModel === 'string' ? '' : DEFAULT_SETTINGS.cliModel,
      cliWebSearch: typeof value.cliWebSearch === 'boolean' ? value.cliWebSearch : false,
      cliAutoAnalyze: typeof value.cliAutoAnalyze === 'boolean' ? value.cliAutoAnalyze : true,
      cliDwellSeconds: boundedNumber(value.cliDwellSeconds, 5, 1, 300),
      enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_SETTINGS.enabled,
      // Legacy fields stay inert; CLI reading delay uses cliDwellSeconds.
      dwellMs: 0,
      maxPerSession: 0,
      cooldownMs: 0,
      language: validLanguage(language) ? language : DEFAULT_SETTINGS.language,
      interfaceLanguage: LANGUAGES.find(item => item.value.toLowerCase() === interfaceLanguage)?.value || DEFAULT_SETTINGS.interfaceLanguage,
      apiModel: /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(model) ? model : DEFAULT_SETTINGS.apiModel,
      apiConcurrency: boundedNumber(value.apiConcurrency, DEFAULT_SETTINGS.apiConcurrency, 1, 8),
      apiVerification: ['background', 'inline', 'off'].includes(value.apiVerification) ? value.apiVerification : DEFAULT_SETTINGS.apiVerification,
      webSearch: typeof value.webSearch === 'boolean' ? value.webSearch : DEFAULT_SETTINGS.webSearch,
      xSearch: typeof value.xSearch === 'boolean' ? value.xSearch : DEFAULT_SETTINGS.xSearch,
      explanationMode: explanationMode(value),
      explainPrompt: normalizePrompt(value.explainPrompt, DEFAULT_PROMPTS.explain),
      verifyPrompt: normalizePrompt(value.verifyPrompt, DEFAULT_PROMPTS.verify),
      commentsPrompt: normalizePrompt(value.commentsPrompt, DEFAULT_PROMPTS.comments)
    };
  }

  function canonicalPostUrl(href) {
    if (typeof href !== 'string' || !href.trim()) return null;
    try {
      const url = new URL(href, 'https://x.com');
      if (!/^https?:$/.test(url.protocol) || !/^(?:www\.)?(?:x\.com|twitter\.com)$/i.test(url.hostname)) return null;
      const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)(?:\/|$)/) ||
        url.pathname.match(/^\/i\/web\/status\/(\d+)(?:\/|$)/);
      if (!match) return null;
      if (match.length === 2) return `https://x.com/i/web/status/${match[1]}`;
      return `https://x.com/${match[1].toLowerCase()}/status/${match[2]}`;
    } catch (_) {
      return null;
    }
  }

  function all(element, selector) {
    return element && typeof element.querySelectorAll === 'function' ? Array.from(element.querySelectorAll(selector)) : [];
  }

  function attribute(element, name) {
    return element && typeof element.getAttribute === 'function' ? element.getAttribute(name) || '' : '';
  }

  function textOf(element) {
    if (!element) return '';
    const value = typeof element.innerText === 'string' ? element.innerText : element.textContent;
    return String(value || '').replace(/\r/g, '').split('\n').map(line => line.replace(/[\t ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function displayed(element, scope, visibility) {
    const view = element?.ownerDocument?.defaultView;
    for (let cursor = element; cursor; cursor = cursor.parentElement) {
      if (visibility.has(cursor)) {
        if (!visibility.get(cursor)) return false;
      } else {
        let hidden = typeof cursor.getAttribute === 'function' && cursor.getAttribute('hidden') !== null;
        hidden ||= attribute(cursor, 'aria-hidden').toLowerCase() === 'true';
        const inline = attribute(cursor, 'style');
        hidden ||= /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))\s*(?:!important\s*)?(?:;|$)/i.test(inline);
        if (!hidden && typeof view?.getComputedStyle === 'function') {
          const style = view.getComputedStyle(cursor);
          hidden = style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse';
        }
        visibility.set(cursor, !hidden);
        if (hidden) return false;
      }
      if (cursor === scope) return true;
    }
    return false;
  }

  function isArticle(element) {
    return String(element && element.tagName || '').toLowerCase() === 'article';
  }

  function quoteRootFor(element, article) {
    let cursor = element && element.parentElement;
    let result = null;
    while (cursor && cursor !== article) {
      const testId = attribute(cursor, 'data-testid');
      const tag = String(cursor.tagName || '').toLowerCase();
      if (isArticle(cursor) || /^(?:quoteTweet|quotedTweet|quoted-post|card\.wrapper)$/i.test(testId) ||
          (tag !== 'a' && attribute(cursor, 'role') === 'link')) result = cursor;
      cursor = cursor.parentElement;
    }
    return cursor === article ? result : null;
  }

  function ownedBy(element, scope, article) {
    const quoteRoot = quoteRootFor(element, article);
    return scope === article ? !quoteRoot : quoteRoot === scope;
  }

  function anchorsFor(scope, article) {
    return all(scope, 'a[href]').filter(anchor => ownedBy(anchor, scope, article) && canonicalPostUrl(attribute(anchor, 'href')));
  }

  function mainAnchorFor(scope, article) {
    const anchors = anchorsFor(scope, article);
    return anchors.find(anchor => all(anchor, 'time').length > 0) || anchors[0] || null;
  }

  function imagesFor(scope, article) {
    const images = [];
    const seen = new Set();
    for (const img of all(scope, 'img')) {
      if (!ownedBy(img, scope, article)) continue;
      const src = attribute(img, 'src') || img.currentSrc || '';
      let url;
      try { url = new URL(src, 'https://x.com'); } catch (_) { continue; }
      if (url.protocol !== 'https:' || !/^pbs\.twimg\.com$/i.test(url.hostname) ||
          !/^\/(?:media|(?:ext_tw_|amplify_|tweet_)?video_thumb)\//.test(url.pathname)) continue;
      // X changes image sizes as virtualized posts enter view; size changes do not change content.
      url.searchParams.delete('name');
      const normalized = url.toString();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      images.push({ url: normalized, alt: attribute(img, 'alt').trim() });
    }
    return images;
  }

  function scopePost(scope, article) {
    const anchor = mainAnchorFor(scope, article);
    const url = anchor ? canonicalPostUrl(attribute(anchor, 'href')) : null;
    const timestamp = (anchor ? all(anchor, 'time') : []).find(element => ownedBy(element, scope, article)) ||
      all(scope, 'time').find(element => ownedBy(element, scope, article));
    const userName = all(scope, '[data-testid="User-Name"]').find(element => ownedBy(element, scope, article));
    const visibility = new WeakMap();
    const textNodes = all(scope, '[data-testid="tweetText"]').filter(element => ownedBy(element, scope, article) && displayed(element, scope, visibility));
    const texts = textNodes.map(textOf).filter(Boolean);
    const language = textNodes.filter(element => textOf(element)).map(element => attribute(element, 'lang'))
      .find(value => value !== 'auto' && !/^(?:und|mul|zxx)(?:-|$)/i.test(value) && validLanguage(value)) || '';
    const images = imagesFor(scope, article);
    const idMatch = url && url.match(/\/status\/(\d+)$/);
    const username = url && !url.includes('/i/web/status/') ? url.split('/')[3] : '';
    let author = textOf(userName);
    // The header often contains the timestamp after a middle-dot separator.
    if (author) author = author.split(/\n?\s*·\s*\n?/)[0].replace(/\n+/g, ' ').trim();
    if (!author && username) author = `@${username}`;
    const hasVideo = all(scope, 'video, [data-testid="videoPlayer"], [data-testid="videoComponent"]').some(element => ownedBy(element, scope, article));
    return {
      id: idMatch ? idMatch[1] : null,
      url,
      text: Array.from(new Set(texts)).join('\n\n'),
      language,
      author,
      username,
      timestamp: timestamp ? attribute(timestamp, 'datetime') : '',
      images,
      hasMedia: images.length > 0 || hasVideo
    };
  }

  function extractPost(article) {
    if (!article || typeof article.querySelectorAll !== 'function') return null;
    const post = scopePost(article, article);
    if (!post.id || !post.url) return null;
    const roots = new Set();
    for (const element of all(article, 'a[href], [data-testid="tweetText"], time')) {
      const quoteRoot = quoteRootFor(element, article);
      if (quoteRoot) roots.add(quoteRoot);
    }
    const quotedContext = Array.from(roots).map(scope => scopePost(scope, article)).filter(quote => quote.id || quote.text || quote.hasMedia);
    return { ...post, quotedContext, isPromoted: isPromoted(article) };
  }

  function isPromoted(article) {
    if(all(article, '[data-testid="promotedIndicator"], [data-testid="promotedTweet"]').some(node=>ownedBy(node,article,article)))return true;
    const name=all(article,'[data-testid="User-Name"]').find(node=>ownedBy(node,article,article));
    // placementTracking also appears on ordinary media. Only use the explicit
    // Ad/Promoted label in the author's header row, never words in post text.
    for(let row=name?.parentElement;row&&row!==article;row=row.parentElement) {
      if(all(row,'[data-testid="tweetText"]').some(node=>ownedBy(node,article,article)))break;
      if(!all(row,'[data-testid="caret"]').some(node=>ownedBy(node,article,article)))continue;
      if(all(row,'span').some(node=>ownedBy(node,article,article)&&/^(?:Ad|Promoted|广告|廣告|推广|推廣)$/.test(textOf(node))))return true;
    }
    return false;
  }

  function mediaIdentity(image) {
    if (!image) return '';
    const raw = typeof image === 'string' ? image : image.url;
    try {
      const url = new URL(raw);
      url.searchParams.delete('name');
      return `${url.origin}${url.pathname}${url.search}|${typeof image === 'object' ? image.alt || '' : ''}`;
    } catch (_) { return String(raw || ''); }
  }

  function postFingerprint(post) {
    if (!post) return '';
    const context = value => [value.id || '', value.text || '', value.language || '', value.author || '', value.timestamp || '',
      Boolean(value.hasMedia), (value.images || []).map(mediaIdentity)];
    // Keep the full stable input: no hash collision can serve analysis for a different edit.
    return JSON.stringify([context(post), (post.quotedContext || []).map(context)]);
  }

  // Native Grok analyzes the original post inside X. Media thumbnails and
  // quoted previews hydrate/recycle while a video plays; those render changes
  // must not cancel an already attributed answer for the unchanged parent post.
  function nativePostIdentity(post) {
    return post ? JSON.stringify([String(post.id || ''), canonicalPostUrl(post.url),
      post.text || '', post.author || '', post.timestamp || '']) : '';
  }

  // Every API analysis style retrieves the full post from its canonical URL.
  // Visible text supplies display-language context, so expansion and preview
  // hydration cannot replace the original post or restart a paid analysis.
  function apiPostIdentity(post, settings) {
    // Comments still pass no settings because they use their visible snapshot
    // and analysis context. Native tasks keep their existing local attribution.
    if(post&&settings?.provider==='cli')return postFingerprint(post);
    if(post&&settings&&settings.task!=='comments')return JSON.stringify(['post-input-v3-full-url',canonicalPostUrl(post.url),resolvePostLanguage(settings.language,post)]);
    return post ? JSON.stringify([nativePostIdentity(post),
      (Array.isArray(post.quotedContext) ? post.quotedContext : []).map(nativePostIdentity)]) : '';
  }

  function visibilityEligibility(rect, viewport, options) {
    const view = typeof viewport === 'number' ? { height: viewport } : viewport || {};
    const settings = options || {};
    const viewportHeight = Number(view.height || view.innerHeight || 0);
    const viewportWidth = Number(view.width || view.innerWidth || Number.MAX_SAFE_INTEGER);
    const top = Number(rect && rect.top);
    const left = Number(rect && rect.left || 0);
    const height = Number(rect && (rect.height || (rect.bottom - rect.top)));
    const width = Number(rect && (rect.width || (rect.right - rect.left)) || viewportWidth);
    if (![top, left, height, width, viewportHeight, viewportWidth].every(Number.isFinite) || height <= 0 || width <= 0 || viewportHeight <= 0 || viewportWidth <= 0) {
      return { eligible: false, visibleRatio: 0, visiblePixels: 0, priority: 0 };
    }
    const visibleHeight = Math.max(0, Math.min(top + height, viewportHeight) - Math.max(top, 0));
    const visibleWidth = Math.max(0, Math.min(left + width, viewportWidth) - Math.max(left, 0));
    const minRatio = Number.isFinite(settings.minRatio) ? settings.minRatio : 0.55;
    const minPixels = Number.isFinite(settings.minVisiblePx) ? settings.minVisiblePx : 96;
    const requiredHeight = Math.max(Math.min(minPixels, height), Math.min(height * minRatio, viewportHeight * 0.5));
    const widthRatio = visibleWidth / width;
    const visibleRatio = visibleHeight * visibleWidth / (height * width);
    const visibleCenter = (Math.max(0, top) + Math.min(top + height, viewportHeight)) / 2;
    const centerCloseness = Math.max(0, 1 - Math.abs(visibleCenter - viewportHeight * 0.45) / viewportHeight);
    return {
      eligible: visibleHeight >= requiredHeight && widthRatio >= 0.5,
      visibleRatio,
      visiblePixels: visibleHeight,
      priority: visibleHeight / viewportHeight + centerCloseness
    };
  }

  // Continuous eligible reading time only; callers reset `since` on scrolling,
  // tab hiding, modal viewing, folding or navigation.
  function cliDwellReady(entry, settings, eligible, now) {
    if (!eligible || !settings.cliAutoAnalyze) { entry.since = 0; return false; }
    if (!entry.since) entry.since = now;
    return now - entry.since >= settings.cliDwellSeconds * 1000;
  }

  class BoundedPostQueue {
    constructor(options) {
      const settings = typeof options === 'number' ? { capacity: options } : options || {};
      this.capacity = settings.capacity === Infinity || settings.capacity === undefined
        ? Infinity : boundedNumber(settings.capacity, Infinity, 1, Number.MAX_SAFE_INTEGER);
      this.items = new Map();
      this.sequence = 0;
    }

    get size() { return this.items.size; }

    enqueue(post, priority) {
      if (!post || !post.id) return false;
      const key = String(post.id);
      const score = Number.isFinite(priority) ? priority : 0;
      this.items.set(key, { post, priority: score, sequence: ++this.sequence });
      if (this.items.size > this.capacity) {
        const last = this.sorted().pop();
        this.items.delete(String(last.post.id));
      }
      return this.items.has(key);
    }

    sorted() {
      return Array.from(this.items.values()).sort((a, b) => b.priority - a.priority || b.sequence - a.sequence);
    }

    take() {
      const next = this.sorted()[0];
      if (!next) return null;
      this.items.delete(String(next.post.id));
      return next.post;
    }

    remove(id) { return this.items.delete(String(id)); }
    has(id) { return this.items.has(String(id)); }
    clear() { this.items.clear(); }
  }

  return Object.freeze({ LANGUAGES, DEFAULT_SETTINGS, DEFAULT_PROMPTS, MAX_PROMPT_LENGTH, normalizePrompt, explanationMode, normalizeSettings, resolvePostLanguage, canonicalPostUrl, extractPost, postFingerprint, nativePostIdentity, apiPostIdentity, visibilityEligibility, cliDwellReady, BoundedPostQueue });
});
