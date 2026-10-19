/**
 * 采集 GitHub 匿名可达页面上的候选界面文案。
 * 用法：NODE_PATH=<全局 node_modules> node tools/collect.cjs
 * 输出：data/candidates.json（按页面分组）、data/summary.json（去重统计）
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');

const PAGES = [
  ['home', 'https://github.com/'],
  ['login', 'https://github.com/login'],
  ['signup', 'https://github.com/signup'],
  ['password_reset', 'https://github.com/password_reset'],
  ['features', 'https://github.com/features'],
  ['enterprise', 'https://github.com/enterprise'],
  ['pricing', 'https://github.com/pricing'],
  ['security', 'https://github.com/security'],
  ['explore', 'https://github.com/explore'],
  ['trending', 'https://github.com/trending'],
  ['topics', 'https://github.com/topics'],
  ['marketplace', 'https://github.com/marketplace'],
  ['sponsors', 'https://github.com/sponsors'],
  ['search', 'https://github.com/search?q=github&type=repositories'],
  ['repo_code', 'https://github.com/maboloshi/github-chinese'],
  ['repo_issues', 'https://github.com/maboloshi/github-chinese/issues'],
  ['repo_pulls', 'https://github.com/maboloshi/github-chinese/pulls'],
  ['repo_actions', 'https://github.com/maboloshi/github-chinese/actions'],
  ['repo_releases', 'https://github.com/maboloshi/github-chinese/releases'],
  ['repo_wiki', 'https://github.com/maboloshi/github-chinese/wiki'],
  ['repo_discussions', 'https://github.com/maboloshi/github-chinese/discussions'],
  ['repo_commits', 'https://github.com/maboloshi/github-chinese/commits/main'],
  ['repo_tree', 'https://github.com/maboloshi/github-chinese/tree/main'],
  ['repo_blob', 'https://github.com/maboloshi/github-chinese/blob/main/README.md'],
  ['repo_branches', 'https://github.com/maboloshi/github-chinese/branches'],
  ['repo_tags', 'https://github.com/maboloshi/github-chinese/tags'],
  ['big_repo', 'https://github.com/microsoft/vscode'],
  ['big_issues', 'https://github.com/microsoft/vscode/issues'],
  ['big_pulls', 'https://github.com/microsoft/vscode/pulls'],
  ['issue_detail', 'https://github.com/maboloshi/github-chinese/issues/1'],
  ['pr_detail', 'https://github.com/maboloshi/github-chinese/pull/1'],
  ['profile', 'https://github.com/maboloshi'],
  ['org', 'https://github.com/microsoft'],
  ['org_people', 'https://github.com/orgs/microsoft/people'],
  ['gist_home', 'https://gist.github.com/'],
];

// 页面内执行：收集文本节点与 UI 属性
function extract() {
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'PRE', 'CODE', 'TEXTAREA',
    'SVG', 'MATH', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED', 'VIDEO', 'AUDIO',
  ]);
  const SKIP_SEL = [
    '.markdown-body', '.comment-body', '.js-comment-body', '.timeline-comment',
    '.react-code-text', '.blob-code', '.blob-code-inner', '.diff-table', '.highlight',
    '[contenteditable="true"]', '.user-mention', '.commit-author', '.commit-title',
    '.commit-desc', '.js-issue-title', '.gh-header-title', '.js-navigation-open',
    '.repo-list-description', '.p-note', '.js-user-profile-bio',
    'a[data-hovercard-type="user"]', 'a[data-hovercard-type="organization"]',
    '[data-testid="issue-body"]', '[data-testid="comment-body"]',
    '[data-testid="commit-row-item"] .text-bold',
  ].join(', ');

  const out = { url: location.href, title: document.title, texts: [], attrs: [] };
  const seen = new Set();

  function visible(el) {
    if (!el || !el.getClientRects) return false;
    if (el.getClientRects().length === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  }

  function goodText(s) {
    const t = s.replace(/\s+/g, ' ').trim();
    if (t.length < 2 || t.length > 90) return null;
    if (!/[A-Za-z]/.test(t)) return null;
    if (/https?:\/\/|www\.|@[A-Za-z0-9_.-]+\.[a-z]{2,}|\.(js|ts|py|json|md|css|html|yml|yaml|go|rs|java|c|cpp|h)$/i.test(t)) return null;
    const letters = t.replace(/[^A-Za-z]/g, '').length;
    if (letters / t.length < 0.4) return null;
    return t;
  }

  function skipByAncestor(el) {
    let p = el;
    while (p && p !== document.body) {
      if (p.matches && p.matches(SKIP_SEL)) return true;
      p = p.parentElement;
    }
    return false;
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  let n;
  while ((n = walker.nextNode())) {
    const el = n.parentElement;
    if (!el) continue;
    if (SKIP_TAGS.has(el.tagName)) continue;
    if (skipByAncestor(el)) continue;
    if (!visible(el)) continue;
    const t = goodText(n.nodeValue);
    if (!t || seen.has('t:' + t)) continue;
    seen.add('t:' + t);
    out.texts.push({ t: t, tag: el.tagName, cls: String(el.className || '').slice(0, 100) });
  }

  const attrEls = document.querySelectorAll('[placeholder],[title],[aria-label],[alt]');
  for (const el of attrEls) {
    if (!visible(el)) continue;
    if (skipByAncestor(el)) continue;
    for (const a of ['placeholder', 'title', 'aria-label', 'alt']) {
      const v = el.getAttribute(a);
      if (!v) continue;
      const t = goodText(v);
      if (!t || seen.has('a:' + t)) continue;
      seen.add('a:' + t);
      out.attrs.push({ t: t, attr: a, tag: el.tagName });
    }
  }
  return out;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1366, height: 900 },
  });
  const page = await ctx.newPage();
  const pages = [];
  for (const [name, url] of PAGES) {
    const rec = { name, url, ok: false, err: null, texts: [], attrs: [] };
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      rec.status = resp ? resp.status() : 0;
      const data = await page.evaluate(extract);
      Object.assign(rec, { ok: true, finalUrl: data.url, pageTitle: data.title, texts: data.texts, attrs: data.attrs });
      console.log(`[ok] ${name} ${rec.status} texts=${data.texts.length} attrs=${data.attrs.length} ${data.url}`);
    } catch (e) {
      rec.err = String(e && e.message || e).slice(0, 200);
      console.log(`[fail] ${name} ${rec.err}`);
    }
    pages.push(rec);
    await page.waitForTimeout(400);
  }
  await browser.close();

  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'data', 'candidates.json'), JSON.stringify({ generatedAt: new Date().toISOString(), pages }, null, 2));

  const textCount = new Map();
  const attrCount = new Map();
  const pagesByText = new Map();
  for (const p of pages) {
    for (const it of p.texts) {
      textCount.set(it.t, (textCount.get(it.t) || 0) + 1);
      if (!pagesByText.has(it.t)) pagesByText.set(it.t, []);
      pagesByText.get(it.t).push(p.name);
    }
    for (const it of p.attrs) attrCount.set(it.t + '\t' + it.attr, (attrCount.get(it.t + '\t' + it.attr) || 0) + 1);
  }
  const summary = {
    pageCount: pages.length,
    okPages: pages.filter((p) => p.ok).length,
    uniqueTexts: [...textCount.entries()].map(([t, c]) => ({ t, c, pages: [...new Set(pagesByText.get(t))] })).sort((a, b) => b.c - a.c),
    uniqueAttrs: [...attrCount.entries()].map(([k, c]) => ({ k, c })),
  };
  fs.writeFileSync(path.join(ROOT, 'data', 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`DONE pages=${summary.pageCount} ok=${summary.okPages} uniqueTexts=${summary.uniqueTexts.length} uniqueAttrs=${summary.uniqueAttrs.length}`);
})().catch((e) => { console.error(e); process.exit(1); });
