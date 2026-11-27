/**
 * 覆盖率探测：打开若干页面，收集“没被翻译成中文的英文界面文本”，按出现次数排序
 * 用法：NODE_PATH=$(npm root -g) node tools/coverage.cjs [--top 60] [--json out.json] [url ...]
 * 退出码：0 = 探测完成；2 = 浏览器或脚本加载失败
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'github-zh-userscript.user.js');
const args = process.argv.slice(2);
const topIdx = args.indexOf('--top');
const TOP = topIdx >= 0 ? Number(args[topIdx + 1]) : 60;
const jsonIdx = args.indexOf('--json');
const OUT = jsonIdx >= 0 ? args[jsonIdx + 1] : path.join(ROOT, 'artifacts', 'coverage.json');
const explicit = args.filter((a) => /^https?:\/\//.test(a));

const DEFAULT_URLS = [
  'https://github.com/',
  'https://github.com/trending',
  'https://github.com/explore',
  'https://github.com/topics',
  'https://github.com/collections',
  'https://github.com/marketplace',
  'https://github.com/pricing',
  'https://github.com/features',
  'https://github.com/enterprise',
  'https://github.com/about',
  'https://github.com/login',
  'https://github.com/signup',
  'https://github.com/zjf27/github-zh-userscript',
  'https://github.com/zjf27/github-zh-userscript/releases',
  'https://github.com/zjf27/github-zh-userscript/issues',
  'https://github.com/zjf27/github-zh-userscript/pulls',
];

const SKIP = [
  'pre', 'code', 'textarea', 'script', 'style', 'svg', 'math', 'canvas', 'iframe', 'noscript', 'template',
  '.markdown-body', '.comment-body', '.js-comment-body', '.timeline-comment',
  '.react-code-text', '.blob-code', '.blob-code-inner', '.diff-table', '.highlight',
  '[contenteditable="true"]',
  '.js-issue-title', '.gh-header-title', '.js-navigation-open',
  '.repo-list-description', '.p-note', '.js-user-profile-bio',
  'a[data-hovercard-type="user"]', 'a[data-hovercard-type="organization"]',
].join(', ');

(async () => {
  if (!fs.existsSync(DIST)) { console.error('缺少 dist，先跑 node tools/build.cjs'); process.exit(2); }
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 1200 } });
  await ctx.addInitScript({ path: DIST });

  const hits = new Map();
  const pages = explicit.length ? explicit : DEFAULT_URLS;
  const failed = [];

  for (const url of pages) {
    const page = await ctx.newPage();
    try {
      let lastErr = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 }); lastErr = null; break; }
        catch (e) { lastErr = e; await page.waitForTimeout(1500); }
      }
      if (lastErr) throw lastErr;
      await page.waitForTimeout(2500);
      for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 1500); await page.waitForTimeout(400); }
      const found = await page.evaluate((skipSel) => {
        const out = [];
        const isSkipped = (el) => !!(el && el.closest && el.closest(skipSel));
        const ok = (t) => {
          if (!t) return false;
          const s = t.replace(/\s+/g, ' ').trim();
          if (s.length < 2 || s.length > 80) return false;
          if (/[\u4e00-\u9fff]/.test(s)) return false;
          if (!/[A-Za-z]{2}/.test(s)) return false;
          if (/^(https?:|www\.|@)/.test(s)) return false;
          if (/[\/\\<>{}|]/.test(s)) return false;
          const words = s.match(/[A-Za-z][A-Za-z'-]*/g) || [];
          if (!words.length) return false;
          return words.length >= 2 || /^[A-Z][a-z]{2,}$/.test(s);
        };
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) {
          const t = n.nodeValue;
          if (!ok(t)) continue;
          const el = n.parentElement;
          if (!el || isSkipped(el)) continue;
          out.push(t.replace(/\s+/g, ' ').trim());
        }
        for (const el of document.querySelectorAll('[placeholder],[title],[aria-label]')) {
          for (const a of ['placeholder', 'title', 'aria-label']) {
            const v = el.getAttribute(a);
            if (ok(v)) out.push(v.replace(/\s+/g, ' ').trim());
          }
        }
        return out;
      }, SKIP);
      for (const t of found) {
        const cur = hits.get(t) || { count: 0, pages: [] };
        cur.count++;
        if (!cur.pages.includes(url)) cur.pages.push(url);
        hits.set(t, cur);
      }
      console.log('[ok] ' + url + ' untranslated=' + new Set(found).size);
    } catch (e) {
      failed.push(url + ' ' + String((e && e.message) || '').slice(0, 60));
      console.log('[fail] ' + url);
    }
    await page.close();
  }
  await browser.close();

  const list = [...hits.entries()]
    .map(([text, v]) => ({ text, count: v.count, pages: v.pages.length }))
    .sort((a, b) => b.count - a.count || b.text.length - a.text.length);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), pages, failed, total: list.length, items: list }, null, 2), 'utf8');

  console.log('\n未翻译候选 ' + list.length + ' 条（页数×次数 降序），写入 ' + OUT);
  for (const it of list.slice(0, TOP)) console.log(String(it.count).padStart(3) + '  ' + it.text);
  if (failed.length) console.log('\n失败页面：' + failed.join(' | '));
  process.exit(0);
})().catch((e) => { console.error('COVERAGE_FAIL ' + String((e && e.stack) || e).slice(0, 400)); process.exit(2); });
