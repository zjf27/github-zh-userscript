/**
 * 登录态漏译扫描：连接一个已登录 GitHub 的 Chromium（CDP），注入 dist 后遍历登录后页面，
 * 列出「仍含英文的固定 UI 文本」，区分：
 *   M = 词典里没有（需要补词条）
 *   X = 词典里有、命中过，但页面上仍显示英文
 * 用法：NODE_PATH=<全局 node_modules> node tools/harvest-loggedin.cjs [cdpEndpoint]
 * 前提：目标浏览器开着 --remote-debugging-port，且已登录 GitHub。
 * 产物：artifacts/remain-loggedin.json
 * 退出码：0=完成，2=连不上或缺少输入
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'github-zh-userscript.user.js');
const DICT_PATH = path.join(ROOT, 'data', 'dict.json');
const PAT_PATH = path.join(ROOT, 'data', 'patterns.json');
const OUT = path.join(ROOT, 'artifacts', 'remain-loggedin.json');
const CDP = process.argv[2] || 'http://127.0.0.1:9222';

for (const f of [DIST, DICT_PATH, PAT_PATH]) {
  if (!fs.existsSync(f)) { console.error('缺少文件：' + f); process.exit(2); }
}

const dict = JSON.parse(fs.readFileSync(DICT_PATH, 'utf8'));
const patterns = JSON.parse(fs.readFileSync(PAT_PATH, 'utf8'));
const compiled = patterns.map((p) => [new RegExp('^(?:' + p[0] + ')$', 'i'), p[1]]);
const norm = (s) => s.replace(/\s+/g, ' ').trim();

function lookup(text) {
  const key = norm(text);
  if (!key || key.length > 100) return null;
  if (!/[A-Za-z]/.test(key)) return null;
  if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
  for (const [re, rep] of compiled) if (re.test(key)) return key.replace(re, rep);
  return null;
}

const PAGES = [
  'https://github.com/dashboard',
  'https://github.com/notifications',
  'https://github.com/issues',
  'https://github.com/pulls',
  'https://github.com/codespaces',
  'https://github.com/new',
  'https://github.com/settings/profile',
  'https://github.com/settings/account',
  'https://github.com/settings/appearance',
  'https://github.com/settings/accessibility',
  'https://github.com/settings/notifications',
  'https://github.com/settings/security',
  'https://github.com/settings/emails',
  'https://github.com/settings/keys',
  'https://github.com/settings/organizations',
  'https://github.com/settings/tokens',
  'https://github.com/settings/billing',
  'https://github.com/settings/sessions',
  'https://github.com/settings/applications',
  'https://github.com/zjf27',
  'https://github.com/zjf27?tab=repositories',
  'https://github.com/zjf27?tab=stars',
  'https://github.com/zjf27/github-zh-userscript',
  'https://github.com/zjf27/github-zh-userscript/issues',
  'https://github.com/zjf27/github-zh-userscript/pulls',
  'https://github.com/zjf27/github-zh-userscript/actions',
  'https://github.com/zjf27/github-zh-userscript/settings',
  'https://github.com/zjf27/github-zh-userscript/settings/branches',
  'https://github.com/example/sample-repo',
  'https://github.com/POF-L/Fanqie-novel-Downloader',
];

const SKIP = [
  'pre', 'code', 'textarea', 'script', 'style', 'svg', 'math', 'canvas', 'iframe',
  'noscript', 'template',
  '.markdown-body', '.comment-body', '.js-comment-body', '.timeline-comment',
  '[contenteditable="true"]', '.blob-code', '.diff-table', '.highlight',
  '[data-testid="issue-body"]', '[data-testid="comment-body"]',
  '.js-navigation-open', '.repo-list-description', '.p-note',
].join(', ');

(async () => {
  const browser = await chromium.connectOverCDP(CDP).catch((e) => {
    console.error('CDP 连接失败：' + e.message);
    process.exit(2);
  });
  const ctx = browser.contexts()[0];
  const probe = await ctx.newPage();
  await probe.goto('https://github.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  const who = await probe.evaluate(() => ({
    login: (document.querySelector('meta[name="user-login"]') || {}).content || '',
    url: location.href,
  }));
  await probe.close();
  if (!who.login) {
    console.error('未登录：当前页面 ' + who.url + '，请先在目标浏览器登录 GitHub 再运行');
    process.exit(2);
  }
  console.log('登录用户=' + who.login);

  await ctx.addInitScript({ path: DIST });

  const records = [];
  const pageStats = [];
  const errors = [];

  for (const url of PAGES) {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(url + ' :: ' + String((e && e.message) || e).slice(0, 120)));
    let status = 0;
    try {
      const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      status = r ? r.status() : 0;
      await page.waitForTimeout(3200);
    } catch (e) {
      console.log('[SKIP] ' + url + ' ' + String((e && e.message) || e).slice(0, 90));
      await page.close();
      continue;
    }
    const got = await page.evaluate((skip) => {
      const out = [];
      const attrs = [];
      const seen = new Set();
      const clsOf = (el) => (typeof el.className === 'string' ? el.className : '');
      function walk(root) {
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        let n;
        while ((n = w.nextNode())) {
          const p = n.parentElement;
          if (!p) continue;
          const t = (n.nodeValue || '').replace(/\s+/g, ' ').trim();
          if (!t || t.length > 100) continue;
          if (!/[A-Za-z]{2,}/.test(t)) continue;
          const key = 't|' + p.tagName + '|' + clsOf(p).slice(0, 40) + '|' + t;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ t, tag: p.tagName.toLowerCase(), cls: clsOf(p).slice(0, 80), skip: !!p.closest(skip) });
        }
        for (const el of root.querySelectorAll ? root.querySelectorAll('*') : []) if (el.shadowRoot) walk(el.shadowRoot);
      }
      walk(document.body);
      for (const el of document.querySelectorAll('[placeholder],[title],[aria-label],[alt]')) {
        for (const a of ['placeholder', 'title', 'aria-label', 'alt']) {
          const v = el.getAttribute(a);
          if (!v || !/[A-Za-z]{2,}/.test(v)) continue;
          const key = 'a|' + a + '|' + v;
          if (seen.has(key)) continue;
          seen.add(key);
          attrs.push({ t: v, tag: el.tagName.toLowerCase(), cls: clsOf(el).slice(0, 80), attr: a, skip: !!el.closest(skip) });
        }
      }
      return { out, attrs };
    }, SKIP);

    let miss = 0;
    let stale = 0;
    for (const it of got.out.concat(got.attrs)) {
      if (it.skip) continue;
      const hit = lookup(it.t);
      const kind = hit == null ? 'M' : 'X';
      if (kind === 'M') miss++; else stale++;
      records.push({ page: url, kind, hit: hit || null, ...it });
    }
    pageStats.push({ url, status, M: miss, X: stale });
    console.log(`[${status}] M=${miss} X=${stale} ${url}`);
    await page.close();
  }

  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), user: who.login, pageStats, records }, null, 1), 'utf8');

  const agg = new Map();
  for (const r of records) {
    const k = r.t + '\u0000' + r.kind;
    const cur = agg.get(k) || { t: r.t, kind: r.kind, hit: r.hit, n: 0, pages: new Set(), sample: r.tag + '.' + (r.cls || ''), attr: r.attr || '' };
    cur.n++;
    cur.pages.add(r.page.replace('https://github.com/', ''));
    agg.set(k, cur);
  }
  const list = [...agg.values()].sort((a, b) => b.n - a.n || a.t.localeCompare(b.t));
  const mList = list.filter((x) => x.kind === 'M');
  const xList = list.filter((x) => x.kind === 'X');

  console.log('\n===== 汇总 =====');
  console.log(`页面 ${pageStats.length}，漏译文本 ${records.length} 条，去重 ${list.length} 条`);
  console.log(`M（词典缺失，去重）${mList.length} 条；X（词典有但未生效，去重）${xList.length} 条`);
  console.log(`脚本错误 ${errors.length} 个${errors.length ? '：' + errors.slice(0, 5).join(' / ') : ''}`);

  const show = (arr, title, limit) => {
    console.log('\n--- ' + title + ' ---');
    arr.slice(0, limit).forEach((x) => {
      console.log(`  x${x.n} [${x.sample}${x.attr ? '#' + x.attr : ''}] ${JSON.stringify(x.t)} <${[...x.pages].slice(0, 3).join(',')}>${x.hit ? '  -> ' + JSON.stringify(x.hit) : ''}`);
    });
  };
  show(mList, 'M 词典缺失 top80', 80);
  show(xList, 'X 词典有但未生效 top40', 40);

  process.exit(0);
})().catch((e) => {
  console.error('扫描失败：' + String((e && e.stack) || e));
  process.exit(2);
});