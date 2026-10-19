/**
 * 专项验证：跨节点模板翻译是否真的生效。
 * 判据：页面上必须出现指定的中文片段；缺失即 FAIL 并给非零退出码。
 * 用法：NODE_PATH=<全局 node_modules> node tools/verify-templates.cjs [cdpEndpoint]
 */
const path = require('path');
const { chromium } = require('playwright');

const DIST = path.join(__dirname, '..', 'dist', 'github-zh-userscript.user.js');
const CDP = process.argv[2] || 'http://127.0.0.1:9222';

const CASES = [
  ['https://github.com/settings/profile', '其他用户和组织来链接他们', 'You can @mention 的跨节点翻译'],
  ['https://github.com/settings/profile', '此页面所有字段均为可选', '超长段落（>100 字符）翻译'],
  ['https://github.com/settings/profile', '你可以在你的', 'You can manage verified email addresses'],
  ['https://github.com/new', '在别处已有项目', 'Have a project elsewhere?'],
  ['https://github.com/settings/appearance', '强烈对比度', null],
  ['https://github.com/settings/accessibility', '不使用修饰键', 'Enable character keys 长句'],
  ['https://github.com/settings/accessibility', '悬浮卡片', 'hovercard 长句'],
];

(async () => {
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  await ctx.addInitScript({ path: DIST });

  const cache = new Map();
  const results = [];
  for (const [url, needle, label] of CASES) {
    if (!label) continue;
    let text = cache.get(url);
    if (text === undefined) {
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2500);
      text = await page.evaluate(() => document.body.innerText);
      await page.close();
      cache.set(url, text);
    }
    const ok = text.includes(needle);
    results.push(ok);
    console.log((ok ? 'PASS ' : 'FAIL ') + label + '  期望包含 ' + JSON.stringify(needle));
  }
  const pass = results.filter(Boolean).length;
  console.log(`\nRESULT pass=${pass} fail=${results.length - pass}`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => {
  console.error('验证失败：' + String((e && e.stack) || e));
  process.exit(2);
});