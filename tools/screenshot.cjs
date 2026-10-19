/**
 * 注入脚本后截图，用于人工核对汉化效果。
 * 用法：NODE_PATH=<全局 node_modules> node tools/screenshot.cjs
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'github-zh-userscript.user.js');
const OUT = path.join(ROOT, 'artifacts');
const PAGES = [
  ['login', 'https://github.com/login'],
  ['home', 'https://github.com/'],
  ['repo', 'https://github.com/maboloshi/github-chinese'],
  ['issues', 'https://github.com/maboloshi/github-chinese/issues'],
];

(async () => {
  if (!fs.existsSync(DIST)) { console.error('缺少产物，请先 build'); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1366, height: 900 },
  });
  await ctx.addInitScript({ path: DIST });
  const page = await ctx.newPage();
  for (const [name, url] of PAGES) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    const file = path.join(OUT, name + '.png');
    await page.screenshot({ path: file });
    console.log('SHOT ' + file);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
