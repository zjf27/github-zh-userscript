/**
 * 模板采集：提取「一个元素内由多段文本 + 内联元素拼成的整句」，
 * 生成带 {0} {1} 占位符的模板，用于跨节点翻译（如 You can {@mention} other users...）。
 * 用法：NODE_PATH=<全局 node_modules> node tools/harvest-templates.cjs [cdpEndpoint]
 * 前提：目标浏览器开着 --remote-debugging-port 且已登录 GitHub。
 * 产物：artifacts/templates-raw.json
 * 退出码：0=完成，2=连不上或缺少输入
 *
 * key 生成规则必须与 src/engine.js 的 buildTemplate 完全一致：
 *   文本节点 → 原值仅把空白压缩为单空格（保留首尾空格）后拼接；内联元素 → {i}
 *   最后整体再做一次空白压缩并 trim。
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'artifacts', 'templates-raw.json');
const CDP = process.argv[2] || 'http://127.0.0.1:9222';

/* 采集目标账号与仓库可用环境变量覆盖，默认指向公开示例仓库。 */
const OWNER = process.env.GH_OWNER || 'maboloshi';
const REPO = process.env.GH_REPO || 'github-chinese';
const GH = 'https://github.com/' + OWNER;
const GR = GH + '/' + REPO;
const PAGES = [
  'https://github.com/dashboard',
  'https://github.com/notifications',
  'https://github.com/settings/profile',
  'https://github.com/settings/account',
  'https://github.com/settings/appearance',
  'https://github.com/settings/accessibility',
  'https://github.com/settings/notifications',
  'https://github.com/settings/security',
  'https://github.com/settings/emails',
  'https://github.com/settings/keys',
  'https://github.com/settings/tokens',
  'https://github.com/settings/organizations',
  'https://github.com/settings/billing',
  'https://github.com/settings/sessions',
  `${GH}`,
  `${GH}?tab=repositories`,
  `${GR}`,
  `${GR}/settings`,
  `${GR}/settings/actions`,
  `${GR}/issues`,
  `${GR}/pulls`,
  'https://github.com/new',
  'https://github.com/codespaces',
];

const SKIP = [
  'pre', 'code', 'textarea', 'script', 'style', 'svg', 'math', 'canvas', 'iframe',
  'noscript', 'template', '.markdown-body', '.comment-body', '.js-comment-body',
  '[contenteditable="true"]', '.blob-code', '.diff-table', '.highlight',
  '[data-testid="issue-body"]', '[data-testid="comment-body"]',
].join(', ');

(async () => {
  const browser = await chromium.connectOverCDP(CDP).catch((e) => {
    console.error('CDP 连接失败：' + e.message);
    process.exit(2);
  });
  const ctx = browser.contexts()[0];
  const probe = await ctx.newPage();
  await probe.goto('https://github.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  const login = await probe.evaluate(() => (document.querySelector('meta[name="user-login"]') || {}).content || '');
  await probe.close();
  if (!login) { console.error('未登录，无法采集模板'); process.exit(2); }
  console.log('登录用户=' + login);

  const seen = new Map();

  for (const url of PAGES) {
    const page = await ctx.newPage();
    let status = 0;
    try {
      const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      status = r ? r.status() : 0;
      await page.waitForTimeout(3000);
    } catch (e) {
      console.log('[SKIP] ' + url);
      await page.close();
      continue;
    }
    const found = await page.evaluate((skip) => {
      const INLINE = { A: 1, CODE: 1, STRONG: 1, EM: 1, B: 1, I: 1, KBD: 1, ABBR: 1, TIME: 1, SPAN: 1, S: 1, DEL: 1, INS: 1, MARK: 1, SUB: 1, SUP: 1 };
      const out = [];
      const done = new Set();
      const inlineEls = document.querySelectorAll('a, code, strong, em, b, i, kbd, abbr, time, span');
      for (const ie of inlineEls) {
        const el = ie.parentElement;
        if (!el || done.has(el)) continue;
        if (el.closest(skip)) continue;
        done.add(el);
        const kids = el.childNodes;
        let key = '';
        let idx = 0;
        let textCount = 0;
        let ok = true;
        for (let i = 0; i < kids.length; i++) {
          const n = kids[i];
          if (n.nodeType === 3) {
            if (!n.nodeValue) continue;
            textCount++;
            key += n.nodeValue.replace(/\s+/g, ' ');
          } else if (n.nodeType === 1) {
            if (!INLINE[n.tagName]) { ok = false; break; }
            if (n.closest(skip)) { ok = false; break; }
            key += '{' + idx + '}';
            idx++;
          } else {
            ok = false;
            break;
          }
        }
        if (!ok || idx === 0 || textCount < 2) continue;
        key = key.replace(/\s+/g, ' ').trim();
        if (!key || key.length < 12 || key.length > 260) continue;
        if (!/[A-Za-z]{2,}/.test(key)) continue;
        out.push(key);
      }
      return out;
    }, SKIP);

    let n = 0;
    for (const k of found) {
      const cur = seen.get(k) || { key: k, n: 0, pages: [] };
      if (!cur.pages.includes(url)) cur.pages.push(url);
      cur.n++;
      seen.set(k, cur);
      n++;
    }
    console.log(`[${status}] +${n} ${url}`);
    await page.close();
  }

  const list = [...seen.values()].sort((a, b) => a.key.localeCompare(b.key));
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), total: list.length, items: list }, null, 1), 'utf8');
  console.log('\n模板候选=' + list.length + ' -> ' + OUT);
  list.slice(0, 60).forEach((x, i) => console.log((i + 1) + '. x' + x.n + ' ' + JSON.stringify(x.key)));
  process.exit(0);
})().catch((e) => {
  console.error('采集失败：' + String((e && e.stack) || e));
  process.exit(2);
});