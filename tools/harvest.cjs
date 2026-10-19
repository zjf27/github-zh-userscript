/**
 * 漏译扫描：注入 dist 后遍历 GitHub 页面，列出「仍含英文的固定 UI 文本」，
 * 并区分两类：
 *   M = 词典里没有（需要补词条）
 *   X = 词典里有、命中过，但页面上仍显示英文（引擎/时序/骨架问题）
 * 用法：NODE_PATH=<全局 node_modules> node tools/harvest.cjs
 * 产物：artifacts/remain.json（完整），stdout 打 top 清单
 * 退出码：0=扫描完成（不论有无漏译），2=缺少输入或启动失败
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'github-zh-userscript.user.js');
const DICT_PATH = path.join(ROOT, 'data', 'dict.json');
const PAT_PATH = path.join(ROOT, 'data', 'patterns.json');
const OUT = path.join(ROOT, 'artifacts', 'remain.json');

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
  'https://github.com/',
  'https://github.com/login',
  'https://github.com/signup',
  'https://github.com/features',
  'https://github.com/pricing',
  'https://github.com/trending',
  'https://github.com/explore',
  'https://github.com/maboloshi/github-chinese',
  'https://github.com/maboloshi/github-chinese/issues',
  'https://github.com/maboloshi/github-chinese/pulls',
  'https://github.com/maboloshi/github-chinese/commits/main',
  'https://github.com/maboloshi/github-chinese/blob/main/README.md',
  'https://github.com/search?q=test&type=repositories',
];

const SKIP = 'pre, code, textarea, script, style, svg, math, canvas, iframe';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1400, height: 1000 },
  });
  await ctx.addInitScript({ path: DIST });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.message) || e).slice(0, 160)));

  const records = [];
  const pageStats = [];

  for (const url of PAGES) {
    let status = 0;
    try {
      const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      status = r ? r.status() : 0;
      await page.waitForTimeout(3200);
    } catch (e) {
      console.log('[SKIP] ' + url + ' ' + String((e && e.message) || e).slice(0, 90));
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
        const els = root.querySelectorAll ? root.querySelectorAll('*') : [];
        for (const el of els) if (el.shadowRoot) walk(el.shadowRoot);
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

    let mine = 0;
    let miss = 0;
    let stale = 0;
    for (const it of got.out.concat(got.attrs)) {
      const hit = lookup(it.t);
      const kind = hit == null ? 'M' : 'X';
      if (kind === 'M') miss++; else stale++;
      records.push({ page: url, kind, hit: hit || null, ...it });
      mine++;
    }
    pageStats.push({ url, status, found: mine, M: miss, X: stale });
    console.log(`[${status}] M=${miss} X=${stale} ${url}`);
  }

  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), pageStats, records }, null, 1), 'utf8');

  // 汇总：按文本聚合出现次数
  const agg = new Map();
  for (const r of records) {
    const k = r.t + '\u0000' + r.kind;
    const cur = agg.get(k) || { t: r.t, kind: r.kind, hit: r.hit, n: 0, pages: new Set(), sample: r.tag + '.' + (r.cls || ''), attr: r.attr || '', skip: r.skip };
    cur.n++;
    cur.pages.add(r.page);
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
      console.log(`  x${x.n} [${x.sample}${x.attr ? '#' + x.attr : ''}] ${JSON.stringify(x.t)}${x.hit ? '  -> ' + JSON.stringify(x.hit) : ''}`);
    });
  };
  show(mList, 'M 词典缺失 top60', 60);
  show(xList, 'X 词典有但未生效 top40', 40);

  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error('扫描失败：' + String((e && e.stack) || e));
  process.exit(2);
});