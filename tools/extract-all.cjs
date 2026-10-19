/**
 * 全量英文界面文本提取器（不预判「该不该译」）。
 *
 * 与 tools/harvest-loggedin.cjs 的区别：
 *   1. 长度上限 600（旧扫描器硬编码 100，把所有长段落直接丢弃了）；
 *   2. 真正提取跨节点模板（文本节点与内联元素混排的整句），key 生成规则与 src/engine.js 完全一致；
 *   3. 页面清单覆盖设置页全部子页（含 enterprises / packages / apps 等之前漏掉的）。
 *
 * 用法：NODE_PATH=<全局 node_modules> node tools/extract-all.cjs [cdpEndpoint]
 * 前提：目标浏览器开着 --remote-debugging-port，且已登录 GitHub。
 * 产物：artifacts/extract-all.json
 * 退出码：0=完成，2=连不上或缺少输入
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'github-zh-userscript.user.js');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(ROOT, 'artifacts', 'extract-all.json');
const CDP = process.argv[2] || 'http://127.0.0.1:9222';
const MAX = 600;

if (!fs.existsSync(DIST)) {
  console.error('缺少文件：' + DIST);
  process.exit(2);
}

/* 合并所有词条，用来标记「已译 / 未译」。仅用于分类，不参与构建。 */
function loadEntries() {
  const dict = {};
  const templates = {};
  const patterns = [];
  for (const f of fs.readdirSync(DATA)) {
    if (!f.endsWith('.json')) continue;
    const full = path.join(DATA, f);
    const o = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (f === 'patterns.json') patterns.push(...o);
    else if (f === 'templates.json') Object.assign(templates, o);
    else Object.assign(dict, o);
  }
  return {
    dict,
    templates,
    compiled: patterns.map((p) => new RegExp('^(?:' + p[0] + ')$', 'i')),
  };
}

const { dict, templates, compiled } = loadEntries();

const look = (s) => {
  const key = s.replace(/\s+/g, ' ').trim();
  if (!key || key.length > MAX || !/[A-Za-z]/.test(key)) return false;
  if (Object.prototype.hasOwnProperty.call(dict, key)) return true;
  for (const re of compiled) if (re.test(key)) return true;
  return false;
};

/* 与 src/engine.js 的 INLINE_TAGS 严格一致 */
const INLINE = {
  A: 1, CODE: 1, STRONG: 1, EM: 1, B: 1, I: 1, KBD: 1, ABBR: 1,
  TIME: 1, SPAN: 1, S: 1, DEL: 1, INS: 1, MARK: 1, SUB: 1, SUP: 1,
};

const SKIP = [
  'pre', 'code', 'textarea', 'script', 'style', 'svg', 'math', 'canvas', 'iframe', 'noscript', 'template',
  '.markdown-body', '.comment-body', '.js-comment-body', '.timeline-comment',
  '.react-code-text', '.blob-code', '.blob-code-inner', '.diff-table', '.highlight',
  '[contenteditable="true"]',
  '.user-mention', '.commit-author', '.commit-title', '.commit-desc',
  '.js-issue-title', '.gh-header-title', '.js-navigation-open',
  '.repo-list-description', '.p-note', '.js-user-profile-bio',
  'a[data-hovercard-type="user"]', 'a[data-hovercard-type="organization"]',
  '[data-testid="issue-body"]', '[data-testid="comment-body"]',
].join(', ');

const PAGES = [
  // 首页与信息流
  'https://github.com/dashboard',
  'https://github.com/notifications',
  'https://github.com/issues',
  'https://github.com/pulls',
  'https://github.com/codespaces',
  'https://github.com/new',
  // 个人设置：以侧边栏真实 href 为准（/settings/account 已不存在，账户页是 /settings/admin）
  'https://github.com/settings',
  'https://github.com/settings/profile',
  'https://github.com/settings/admin',
  'https://github.com/settings/appearance',
  'https://github.com/settings/accessibility',
  'https://github.com/settings/notifications',
  'https://github.com/settings/security',
  'https://github.com/settings/security-log',
  'https://github.com/settings/emails',
  'https://github.com/settings/keys',
  'https://github.com/settings/credentials',
  'https://github.com/settings/tokens',
  'https://github.com/settings/personal-access-tokens',
  'https://github.com/settings/sessions',
  'https://github.com/settings/applications',
  'https://github.com/settings/apps',
  'https://github.com/settings/organizations',
  'https://github.com/settings/enterprises',
  'https://github.com/settings/blocked_users',
  'https://github.com/settings/interaction_limits',
  'https://github.com/settings/code_review_limits',
  'https://github.com/settings/packages',
  'https://github.com/settings/billing',
  'https://github.com/settings/billing/ai_usage',
  'https://github.com/settings/billing/licensing',
  'https://github.com/settings/billing/payment_information',
  'https://github.com/settings/billing/subscriptions',
  'https://github.com/settings/education/benefits',
  'https://github.com/settings/codespaces',
  'https://github.com/settings/copilot',
  'https://github.com/settings/copilot/features',
  'https://github.com/settings/copilot/coding_agent',
  'https://github.com/settings/pages',
  'https://github.com/settings/replies',
  'https://github.com/settings/repositories',
  'https://github.com/settings/security_analysis',
  'https://github.com/settings/installations',
  'https://github.com/settings/reminders',
  'https://github.com/settings/sponsors-log',
  // 个人主页与仓库页
  'https://github.com/zjf27',
  'https://github.com/zjf27?tab=repositories',
  'https://github.com/zjf27?tab=stars',
  'https://github.com/zjf27?tab=packages',
  'https://github.com/zjf27?tab=projects',
  'https://github.com/zjf27/github-zh-userscript',
  'https://github.com/zjf27/github-zh-userscript/issues',
  'https://github.com/zjf27/github-zh-userscript/pulls',
  'https://github.com/zjf27/github-zh-userscript/actions',
  'https://github.com/zjf27/github-zh-userscript/settings',
  'https://github.com/zjf27/github-zh-userscript/settings/branches',
  'https://github.com/zjf27/github-zh-userscript/settings/access',
  'https://github.com/example/sample-repo',
  'https://github.com/POF-L/Fanqie-novel-Downloader',
];

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

  const pendingTpl = new Map();
  const pendingTxt = new Map();
  const pendingAttr = new Map();
  const doneCount = { tpl: 0, txt: 0, attr: 0 };
  const pageStats = [];
  const errors = [];

  const collect = async (page) => {
    const got = await page.evaluate(
      ({ MAX, INLINE, SKIP, inlineSel }) => {
        const norm = (s) => s.replace(/\s+/g, ' ').trim();
        const clsOf = (el) => (typeof el.className === 'string' ? el.className : '').slice(0, 60);

        // 与引擎 readTemplate 完全相同的 key 生成规则
        function readTpl(el) {
          const kids = el.childNodes;
          const gaps = [[]];
          let key = '';
          let idx = 0;
          for (let i = 0; i < kids.length; i++) {
            const n = kids[i];
            if (n.nodeType === 3) {
              if (!n.nodeValue) continue;
              gaps[gaps.length - 1].push(n);
              key += n.nodeValue.replace(/\s+/g, ' ');
            } else if (n.nodeType === 1) {
              if (n.tagName.toLowerCase() === 'svg') continue;
              if (!INLINE[n.tagName]) return null;
              if (n.closest(SKIP)) return null;
              key += '{' + idx + '}';
              idx++;
              gaps.push([]);
            } else {
              return null;
            }
          }
          if (idx === 0) return null;
          key = key.replace(/\s+/g, ' ').trim();
          if (!key || key.length > MAX || !/[A-Za-z]/.test(key) || /[\u4e00-\u9fa5]{2,}/.test(key)) return null;
          return { key, gaps };
        }

        const tpl = [];
        const txt = [];
        const attr = [];

        // 1) 跨节点模板：只检查「含内联元素」的容器，避免遍历全 DOM
        const marked = new Set();
        const cands = new Set();
        for (const el of document.querySelectorAll(inlineSel)) {
          if (el.parentElement) cands.add(el.parentElement);
        }
        const seenTpl = new Set();
        for (const el of cands) {
          if (el.closest(SKIP)) continue;
          const r = readTpl(el);
          if (!r || seenTpl.has(r.key)) continue;
          seenTpl.add(r.key);
          for (const g of r.gaps) for (const n of g) marked.add(n);
          tpl.push({ key: r.key, tag: el.tagName.toLowerCase(), cls: clsOf(el), gaps: r.gaps.length });
        }

        // 2) 单节点文本（跳过已并入模板的间隙节点）
        const seenTxt = new Set();
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        let n;
        while ((n = w.nextNode())) {
          if (marked.has(n)) continue;
          const p = n.parentElement;
          if (!p || p.closest(SKIP)) continue;
          const t = norm(n.nodeValue || '');
          if (!t || t.length > MAX || !/[A-Za-z]{2,}/.test(t) || /[\u4e00-\u9fa5]{2,}/.test(t)) continue;
          if (seenTxt.has(t)) continue;
          seenTxt.add(t);
          txt.push({ t, tag: p.tagName.toLowerCase(), cls: clsOf(p) });
        }

        // 3) 属性
        const seenAttr = new Set();
        for (const el of document.querySelectorAll('[placeholder],[title],[aria-label],[alt]')) {
          if (el.closest(SKIP)) continue;
          for (const a of ['placeholder', 'title', 'aria-label', 'alt']) {
            const v = el.getAttribute(a);
            if (!v) continue;
            const t = norm(v);
            if (!t || t.length > MAX || !/[A-Za-z]{2,}/.test(t) || /[\u4e00-\u9fa5]{2,}/.test(t)) continue;
            const key = a + '|' + t;
            if (seenAttr.has(key)) continue;
            seenAttr.add(key);
            attr.push({ t, attr: a, tag: el.tagName.toLowerCase(), cls: clsOf(el) });
          }
        }

        return { tpl, txt, attr, title: document.title };
      },
      { MAX, INLINE, SKIP, inlineSel: Object.keys(INLINE).map((t) => t.toLowerCase()).join(',') }
    );
    return got;
  };

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
    const got = await collect(page);
    const st = { url, status, tpl: got.tpl.length, txt: got.txt.length, attr: got.attr.length };
    pageStats.push(st);

    for (const it of got.tpl) {
      if (Object.prototype.hasOwnProperty.call(templates, it.key)) doneCount.tpl++;
      else if (!pendingTpl.has(it.key)) pendingTpl.set(it.key, { ...it, pages: [] });
      if (!Object.prototype.hasOwnProperty.call(templates, it.key)) pendingTpl.get(it.key).pages.push(url.replace('https://github.com/', ''));
    }
    for (const it of got.txt) {
      if (look(it.t)) doneCount.txt++;
      else if (!pendingTxt.has(it.t)) pendingTxt.set(it.t, { ...it, pages: [] });
      if (!look(it.t)) pendingTxt.get(it.t).pages.push(url.replace('https://github.com/', ''));
    }
    for (const it of got.attr) {
      const k = it.attr + '|' + it.t;
      if (look(it.t)) doneCount.attr++;
      else if (!pendingAttr.has(k)) pendingAttr.set(k, { ...it, pages: [] });
      if (!look(it.t)) pendingAttr.get(k).pages.push(url.replace('https://github.com/', ''));
    }
    console.log(`[${status}] tpl=${got.tpl.length} txt=${got.txt.length} attr=${got.attr.length} ${url}`);
    await page.close();
  }

  const pack = (m) =>
    [...m.values()].map((x) => ({ ...x, pages: [...new Set(x.pages)].slice(0, 4) }));

  const result = {
    generatedAt: new Date().toISOString(),
    user: who.login,
    maxLen: MAX,
    pageStats,
    doneCount,
    pending: {
      tpl: pack(pendingTpl),
      txt: pack(pendingTxt),
      attr: pack(pendingAttr),
    },
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1), 'utf8');

  const p = result.pending;
  console.log('\n===== 汇总 =====');
  console.log(`页面 ${pageStats.length} 个，脚本错误 ${errors.length} 个`);
  console.log(`已译：tpl=${doneCount.tpl} txt=${doneCount.txt} attr=${doneCount.attr}`);
  console.log(`未译（去重）：tpl=${p.tpl.length} txt=${p.txt.length} attr=${p.attr.length}`);
  console.log('产物：' + OUT);
  process.exit(0);
})().catch((e) => {
  console.error('提取失败：' + String((e && e.stack) || e));
  process.exit(2);
});