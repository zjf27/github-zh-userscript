/* GitHub 中文化 · 引擎（原创实现，无第三方依赖） */
(function () {
  'use strict';

  if (window.__GITHUB_ZH__) return;
  window.__GITHUB_ZH__ = true;

  const DICT = /*__DICT__*/{};
  const PATTERNS = /*__PATTERNS__*/[].map(function (p) {
    return [new RegExp('^(?:' + p[0] + ')$', p[3] || 'i'), p[1], p[2] || ''];
  });
  // 按必需字面量的前 3 个字符分桶：文本里没有该字面量的规则直接跳过，
  // 否则每个文本节点都要跑上千条正则（参考词库带 1000+ 条规则）。
  const PAT_INDEX = new Map();
  const PAT_REST = [];
  for (let i = 0; i < PATTERNS.length; i++) {
    const p = PATTERNS[i];
    if (!p[2]) { PAT_REST.push(p); continue; }
    const bucket = p[2].slice(0, 3);
    const list = PAT_INDEX.get(bucket);
    if (list) list.push(p); else PAT_INDEX.set(bucket, [p]);
  }
  // 跨节点模板：key 里的 {0} {1} 依次对应元素内的第 N 个内联元素
  const TEMPLATES = /*__TEMPLATES__*/{};

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

  const INLINE_TAGS = {
    A: 1, CODE: 1, STRONG: 1, EM: 1, B: 1, I: 1, KBD: 1, ABBR: 1,
    TIME: 1, SPAN: 1, S: 1, DEL: 1, INS: 1, MARK: 1, SUB: 1, SUP: 1
  };

  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const SPLIT_WS = /^(\s*)([\s\S]*?)(\s*)$/;

  function norm(s) {
    return s.replace(/\s+/g, ' ').trim();
  }

  function lookup(text) {
    const key = norm(text);
    if (!key || key.length > 600) return null;
    if (!/[A-Za-z]/.test(key)) return null;
    if (Object.prototype.hasOwnProperty.call(DICT, key)) return DICT[key];
    const lower = key.toLowerCase();
    const words = lower.match(/[a-z0-9']+/g) || [];
    const tried = new Set();
    for (let w = 0; w < words.length; w++) {
      const list = PAT_INDEX.get(words[w].slice(0, 3));
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (tried.has(p)) continue;
        tried.add(p);
        if (p[2] && lower.indexOf(p[2]) < 0) continue;
        if (p[0].test(key)) return key.replace(p[0], p[1]);
      }
    }
    for (let i = 0; i < PAT_REST.length; i++) {
      const p = PAT_REST[i];
      if (p[0].test(key)) return key.replace(p[0], p[1]);
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

  // 读取结构模板：key 里 {i} 表示第 i 个内联元素，gaps[i] 是第 i 个间隙中的文本节点。
  // 用「间隙」而非「文本段数」对齐，{0}{1} 相邻（如两个 <kbd> 挨着）时才不会错位。
  // key 生成规则必须与 tools/harvest-templates.cjs 保持一致。
  function readTemplate(el) {
    const kids = el.childNodes;
    const gaps = [[]];
    let key = '';
    let idx = 0;
    for (let i = 0; i < kids.length; i++) {
      const n = kids[i];
      // React 会在文本与元素之间插入 <!-- --> 注释标记，跳过它，否则整句永远成不了模板
      if (n.nodeType === 8) continue;
      if (n.nodeType === 3) {
        if (!n.nodeValue) continue;
        gaps[gaps.length - 1].push(n);
        key += n.nodeValue.replace(/\s+/g, ' ');
      } else if (n.nodeType === 1) {
        if (n.tagName.toLowerCase() === 'svg') continue;
        if (!INLINE_TAGS[n.tagName]) return null;
        // 行内 <code> 允许参与整句模板（其内部文本仍受 SKIP 保护，不会被翻译）
        if (n.tagName !== 'CODE' && n.closest(SKIP)) return null;
        key += '{' + idx + '}';
        idx++;
        gaps.push([]);
      } else {
        return null;
      }
    }
    if (idx === 0) return null;
    key = key.replace(/\s+/g, ' ').trim();
    if (!key || key.length > 600 || !/[A-Za-z]/.test(key)) return null;
    return { key: key, gaps: gaps };
  }

  const tplDone = new WeakSet();

  function pushTemplate(el) {
    if (tplDone.has(el)) return;
    tplDone.add(el);
    if (inSkip(el)) return;
    const tpl = readTemplate(el);
    if (!tpl) return;
    if (!Object.prototype.hasOwnProperty.call(TEMPLATES, tpl.key)) return;
    const zh = TEMPLATES[tpl.key];
    const segs = [];
    let last = 0;
    const re = /\{(\d+)\}/g;
    let m;
    while ((m = re.exec(zh))) {
      segs.push(zh.slice(last, m.index));
      last = re.lastIndex;
    }
    segs.push(zh.slice(last));
    // 占位符必须与原文内联元素一一对应；间隙里的多余文本节点一并清空，保持结构不变
    if (segs.length !== tpl.gaps.length) return;
    for (let g = 0; g < tpl.gaps.length; g++) {
      const nodes = tpl.gaps[g];
      if (!nodes.length) continue;
      nodes[0].nodeValue = segs[g];
      for (let k = 1; k < nodes.length; k++) nodes[k].nodeValue = '';
    }
  }

  function translateTemplates(root) {
    if (!root.querySelectorAll) return;
    const els = root.querySelectorAll('a,code,strong,em,b,i,kbd,abbr,time,span');
    for (let i = 0; i < els.length; i++) {
      const p = els[i].parentElement;
      if (p) pushTemplate(p);
    }
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

    // 先做整句模板（跨节点），再做单节点，避免半句被单独替换
    translateTemplates(root);

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