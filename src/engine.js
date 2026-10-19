/* GitHub 中文化 · 引擎（原创实现，无第三方依赖） */
(function () {
  'use strict';

  if (window.__GITHUB_ZH__) return;
  window.__GITHUB_ZH__ = true;

  const DICT = /*__DICT__*/{};
  const PATTERNS = /*__PATTERNS__*/[].map(function (p) {
    return [new RegExp('^(?:' + p[0] + ')$', 'i'), p[1]];
  });

  // 用户内容区域：不翻译（代码、评论、issue/PR 标题、用户名、仓库名等）
  const SKIP = [
    'pre', 'code', 'textarea', 'script', 'style', 'svg', 'math', 'canvas', 'iframe', 'noscript', 'template',
    '.markdown-body', '.comment-body', '.js-comment-body', '.timeline-comment',
    '.react-code-text', '.blob-code', '.blob-code-inner', '.diff-table', '.highlight',
    '[contenteditable="true"]',
    '.user-mention', '.commit-author', '.commit-title', '.commit-desc',
    '.js-issue-title', '.gh-header-title', '.js-navigation-open',
    '.repo-list-description', '.p-note', '.js-user-profile-bio',
    'a[data-hovercard-type="user"]', 'a[data-hovercard-type="organization"]',
    '[data-testid="issue-body"]', '[data-testid="comment-body"]'
  ].join(', ');

  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const SPLIT_WS = /^(\s*)([\s\S]*?)(\s*)$/;

  function norm(s) {
    return s.replace(/\s+/g, ' ').trim();
  }

  function lookup(text) {
    const key = norm(text);
    if (!key || key.length > 100) return null;
    if (!/[A-Za-z]/.test(key)) return null;
    if (Object.prototype.hasOwnProperty.call(DICT, key)) return DICT[key];
    for (let i = 0; i < PATTERNS.length; i++) {
      const m = PATTERNS[i][0].exec(key);
      if (m) return key.replace(PATTERNS[i][0], PATTERNS[i][1]);
    }
    return null;
  }

  function translateTextNode(node) {
    const raw = node.nodeValue;
    if (!raw || !raw.trim()) return;
    const hit = lookup(raw);
    if (hit == null) return;
    const m = SPLIT_WS.exec(raw);
    if (!m) return;
    node.nodeValue = m[1] + hit + m[3];
  }

  function inSkip(el) {
    return !!(el.closest && el.closest(SKIP));
  }

  function translateRoot(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      const p = root.parentElement;
      if (p && !inSkip(p)) translateTextNode(root);
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    if (root.nodeType === 1 && inSkip(root)) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) {
      const p = n.parentElement;
      if (!p) continue;
      if (inSkip(p)) continue;
      if (!n.nodeValue || !n.nodeValue.trim()) continue;
      nodes.push(n);
    }
    for (let i = 0; i < nodes.length; i++) translateTextNode(nodes[i]);

    const attrs = root.querySelectorAll('[placeholder],[title],[aria-label],[alt]');
    for (let i = 0; i < attrs.length; i++) {
      const el = attrs[i];
      if (inSkip(el)) continue;
      for (let j = 0; j < ATTRS.length; j++) {
        const v = el.getAttribute(ATTRS[j]);
        if (!v) continue;
        const hit = lookup(v);
        if (hit != null) el.setAttribute(ATTRS[j], hit);
      }
    }

    const inputs = root.querySelectorAll('input[type="submit"],input[type="button"]');
    for (let i = 0; i < inputs.length; i++) {
      const v = inputs[i].value;
      if (!v) continue;
      const hit = lookup(v);
      if (hit != null) inputs[i].value = hit;
    }

    // shadow DOM（如 <relative-time> 的相对时间在 shadow root 内）
    const all = root.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) {
      const sr = all[i].shadowRoot;
      if (sr) {
        translateRoot(sr);
        observeShadow(sr);
      }
    }

    localizeRelativeTimes(root);
  }

  // <relative-time> 是自定义元素，文本在 shadow DOM 内。
  // 设置 lang="zh-CN" 让组件自己输出中文（"2天前"），再把绝对日期的英文前缀 "on " 换成 "于 "。
  function localizeRelativeTimes(root) {
    const list = [];
    if (root.nodeType === 1 && root.tagName === 'RELATIVE-TIME') list.push(root);
    if (root.querySelectorAll) {
      const els = root.querySelectorAll('relative-time');
      for (let i = 0; i < els.length; i++) list.push(els[i]);
    }
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      if (el.getAttribute('lang') !== 'zh-CN') el.setAttribute('lang', 'zh-CN');
      const sr = el.shadowRoot;
      if (!sr) continue;
      const t = sr.textContent;
      if (t && t.indexOf('on ') === 0) sr.textContent = '于 ' + t.slice(3);
    }
  }

  function translateTitle() {
    const t = document.title;
    if (!t) return;
    const m = /^(.*?)\s*·\s*GitHub$/.exec(t);
    if (!m) return;
    const hit = lookup(m[1]);
    if (hit != null) document.title = hit + ' · GitHub';
  }

  const observedShadows = new WeakSet();
  function observeShadow(sr) {
    if (observedShadows.has(sr)) return;
    observedShadows.add(sr);
    mo.observe(sr, { childList: true, subtree: true, characterData: true });
  }

  let timer = null;
  const queue = new Set();

  function flush() {
    timer = null;
    const roots = Array.from(queue);
    queue.clear();
    for (let i = 0; i < roots.length; i++) translateRoot(roots[i]);
    translateTitle();
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(flush, 60);
  }

  const mo = new MutationObserver(function (muts) {
    for (let i = 0; i < muts.length; i++) {
      const m = muts[i];
      if (m.type === 'childList') {
        for (let j = 0; j < m.addedNodes.length; j++) queue.add(m.addedNodes[j]);
      } else if (m.type === 'characterData') {
        queue.add(m.target);
        const rn = m.target.getRootNode && m.target.getRootNode();
        if (rn && rn.host && rn.host.tagName === 'RELATIVE-TIME') queue.add(rn.host);
      }
    }
    schedule();
  });

  function boot() {
    translateRoot(document.body);
    translateTitle();
    mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    // 自定义元素可能晚于首次扫描才升级并创建 shadow root，补两次全量刷新
    setTimeout(function () { translateRoot(document.body); }, 1000);
    setTimeout(function () { translateRoot(document.body); }, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('turbo:load', function () { translateRoot(document.body); translateTitle(); });
  document.addEventListener('pjax:end', function () { translateRoot(document.body); translateTitle(); });
})();
