/**
 * 真机验证：用 Playwright 打开 GitHub 页面，注入 dist 产物，检查
 * 1) 固定 UI 文案已翻译；2) 用户内容（markdown/代码）未被翻译；3) 动态文案能翻译；4) 无脚本错误。
 * 用法：NODE_PATH=<全局 node_modules> node tools/verify.cjs
 * 退出码：0=全部通过，1=有失败，2=没查成（缺少输入）
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'github-zh-userscript.user.js');
const DICT_PATH = path.join(ROOT, 'data', 'dict.json');

if (!fs.existsSync(DIST)) { console.error('缺少产物 dist/github-zh-userscript.user.js，请先 build'); process.exit(2); }
if (!fs.existsSync(DICT_PATH)) { console.error('缺少 data/dict.json，请先 merge'); process.exit(2); }
const dict = JSON.parse(fs.readFileSync(DICT_PATH, 'utf8'));
const REF_PATH = path.join(ROOT, 'data', 'ref-dict.json');
const refDict = fs.existsSync(REF_PATH) ? (JSON.parse(fs.readFileSync(REF_PATH, 'utf8')).dict || {}) : {};
const distSource = fs.readFileSync(DIST, 'utf8');

const CHECKS = [
  { name: 'login', url: 'https://github.com/login', mustContain: ['登录'], minCjk: 20 },
  { name: 'home', url: 'https://github.com/', mustContain: ['登录', '注册'], minCjk: 100 },
  { name: 'repo_code', url: 'https://github.com/maboloshi/github-chinese', mustContain: ['拉取请求'], minCjk: 300 },
  { name: 'repo_issues', url: 'https://github.com/maboloshi/github-chinese/issues', mustContain: ['议题'], minCjk: 200 },
  { name: 'search', url: 'https://github.com/search?q=test&type=repositories', mustContain: ['仓库'], minCjk: 100 },
  { name: 'repo_pulls', url: 'https://github.com/maboloshi/github-chinese/pulls', mustContain: ['拉取请求'], minCjk: 150 },
  { name: 'trending', url: 'https://github.com/trending', mustContain: ['趋势'], minCjk: 100 },
];

// 页面内审计逻辑内联在下面的 page.evaluate 中（不能跨上下文传函数）

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1366, height: 900 },
  });
  await ctx.addInitScript({ path: DIST });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => {
  const msg = String(e && e.message || e);
  // 首页 hero 视频是 GitHub 自己的媒体加载失败，与脚本无关
  if (/Hero video failed|media error/i.test(msg)) return;
  pageErrors.push(msg.slice(0, 160));
});

  // 只审计「译文与原文不同」的词条：品牌名（GitHub 等）原样保留不算漏译
const dictKeys = new Set();
for (const [k, v] of Object.entries({ ...dict, ...refDict })) {
  if (k !== v) dictKeys.add(k);
}
  let pass = 0;
  let fail = 0;
  const failures = [];

  for (const c of CHECKS) {
    try {
      const resp = await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);
      const status = resp ? resp.status() : 0;
      const textInfo = await page.evaluate((words) => {
        const t = document.body.innerText || '';
        return {
          miss: words.filter((w) => !t.includes(w)),
          cjk: (t.match(/[\u4e00-\u9fff]/g) || []).length,
        };
      }, c.mustContain);
      const auditResult = await page.evaluate((keys) => {
        const SKIP = "pre, code, textarea, script, style, svg, .markdown-body, .comment-body, .js-comment-body, .timeline-comment, .js-issue-title, .gh-header-title, .commit-title, .commit-desc, .blob-code, .react-code-text, .diff-table, .highlight, [contenteditable=\"true\"], .user-mention, .commit-author, a[data-hovercard-type=\"user\"], a[data-hovercard-type=\"organization\"], .js-navigation-open, .repo-list-description, .p-note, .js-user-profile-bio";
        const set = new Set(keys);
        const norm = (s) => s.replace(/\s+/g, ' ').trim();
        const remain = [];
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = w.nextNode())) {
          const t = norm(n.nodeValue);
          if (!t) continue;
          const el = n.parentElement;
          if (!el || el.closest(SKIP)) continue;
          if (set.has(t)) remain.push(t);
        }
        const shadowTexts = [...document.querySelectorAll('relative-time')]
          .map((x) => (x.shadowRoot ? x.shadowRoot.textContent.trim() : ''))
          .filter(Boolean);
        const shadowText = shadowTexts.length ? shadowTexts.join(' | ') : null;
        return {
          remain: [...new Set(remain)].slice(0, 30),
          cjk: (document.body.innerText.match(/[\u4e00-\u9fff]/g) || []).length,
          shadowText,
          title: document.title,
        };
      }, [...dictKeys]);
      const shadowOk = !auditResult.shadowText || /[\u4e00-\u9fff]/.test(auditResult.shadowText);
      const bad = auditResult.remain.length > 2 || textInfo.cjk < c.minCjk || textInfo.miss.length > 0 || !shadowOk;
      if (bad) {
        fail++;
        failures.push({ name: c.name, status, remain: auditResult.remain, cjk: textInfo.cjk, miss: textInfo.miss, shadow: auditResult.shadowText });
        console.log(`[FAIL] ${c.name} status=${status} cjk=${textInfo.cjk} miss=${JSON.stringify(textInfo.miss)} remain=${JSON.stringify(auditResult.remain)}`);
      } else {
        pass++;
        console.log(`[PASS] ${c.name} status=${status} cjk=${textInfo.cjk} title=${auditResult.title}`);
      }
    } catch (e) {
      fail++;
      failures.push({ name: c.name, error: String(e && e.message || e).slice(0, 200) });
      console.log(`[ERROR] ${c.name} ${String(e && e.message || e).slice(0, 200)}`);
    }
  }

  // 用户内容保护 + 动态文案测试（在首页执行）
  try {
    await page.goto('https://github.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const md = document.createElement('div');
      md.className = 'markdown-body';
      md.id = 'zh-test-md';
      md.textContent = 'Sign in Pull requests Issues';
      document.body.appendChild(md);

      const pre = document.createElement('pre');
      pre.id = 'zh-test-pre';
      pre.textContent = 'Sign in';
      document.body.appendChild(pre);

      const plain = document.createElement('div');
      plain.id = 'zh-test-plain';
      plain.textContent = 'Sign in';
      document.body.appendChild(plain);

      const dyn = document.createElement('div');
      dyn.id = 'zh-test-dyn';
      dyn.textContent = '2 days ago';
      document.body.appendChild(dyn);
    });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({
      md: document.getElementById('zh-test-md').innerText,
      pre: document.getElementById('zh-test-pre').innerText,
      plain: document.getElementById('zh-test-plain').innerText,
      dyn: document.getElementById('zh-test-dyn').innerText,
    }));
    const mdOk = r.md.includes('Sign in') && r.md.includes('Pull requests');
    const preOk = r.pre === 'Sign in';
    const plainOk = r.plain === '登录' || r.plain.includes('登录');
    const dynOk = r.dyn.includes('天前');
    if (mdOk && preOk && plainOk && dynOk) {
      pass++;
      console.log(`[PASS] user-content-protection md=${JSON.stringify(r.md)} pre=${JSON.stringify(r.pre)} plain=${JSON.stringify(r.plain)} dyn=${JSON.stringify(r.dyn)}`);
    } else {
      fail++;
      failures.push({ name: 'user-content-protection', mdOk, preOk, plainOk, dynOk, r });
      console.log(`[FAIL] user-content-protection mdOk=${mdOk} preOk=${preOk} plainOk=${plainOk} dynOk=${dynOk} r=${JSON.stringify(r)}`);
    }
  } catch (e) {
    fail++;
    failures.push({ name: 'user-content-protection', error: String(e && e.message || e).slice(0, 200) });
    console.log(`[ERROR] user-content-protection ${String(e && e.message || e).slice(0, 200)}`);
  }

  // 元数据检查
  const metaOk = /@match\s+https:\/\/github\.com\/\*/.test(distSource) && /@run-at\s+document-idle/.test(distSource) && /@name\s+/.test(distSource);
  if (metaOk) { pass++; console.log('[PASS] userscript-meta'); }
  else { fail++; failures.push({ name: 'userscript-meta' }); console.log('[FAIL] userscript-meta'); }

  const errOk = pageErrors.length === 0;
  if (errOk) { pass++; console.log('[PASS] no-page-errors'); }
  else { fail++; failures.push({ name: 'page-errors', pageErrors: pageErrors.slice(0, 5) }); console.log(`[FAIL] page-errors ${JSON.stringify(pageErrors.slice(0, 5))}`); }

  await browser.close();
  console.log(`\nRESULT pass=${pass} fail=${fail}`);
  if (failures.length) console.log('FAILURES ' + JSON.stringify(failures, null, 2));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
