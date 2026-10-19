/**
 * 诊断：定位未翻译文案所在的 DOM 结构（是否在 shadow DOM 内）。
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://github.com/maboloshi/github-chinese', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  const out = await page.evaluate(() => {
    const want = /^(22 tags|1,850 commits|last week|2 months ago|22 tags)$/i;
    const hits = [];
    function walk(root, shadowPath) {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        const t = n.nodeValue.trim();
        if (!want.test(t)) continue;
        const el = n.parentElement;
        hits.push({
          text: t,
          tag: el ? el.tagName : null,
          cls: el ? String(el.className || '').slice(0, 90) : null,
          shadowPath,
          hostTag: shadowPath.length ? shadowPath[shadowPath.length - 1] : null,
        });
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) walk(el.shadowRoot, shadowPath.concat(el.tagName + '.' + String(el.className || '').slice(0, 40)));
      }
    }
    walk(document.body, []);
    return hits.slice(0, 40);
  });
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
