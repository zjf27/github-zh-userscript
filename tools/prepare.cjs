/**
 * 把 candidates.json 清洗、去重、按页面域分成 4 片，供翻译使用。
 * 用法：node tools/prepare.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'candidates.json'), 'utf8'));

const GROUP1 = new Set([
  'home', 'login', 'signup', 'password_reset', 'features', 'enterprise', 'pricing',
  'security', 'explore', 'trending', 'topics', 'marketplace', 'sponsors', 'search', 'gist_home',
]);
const GROUP2 = new Set([
  'repo_code', 'repo_issues', 'repo_pulls', 'repo_actions', 'repo_releases', 'repo_wiki',
  'repo_discussions', 'repo_commits', 'repo_tree', 'repo_blob', 'repo_branches', 'repo_tags',
  'big_repo', 'big_issues', 'big_pulls', 'issue_detail', 'pr_detail',
]);
const GROUP3 = new Set(['profile', 'org', 'org_people']);

const texts = new Map();
const attrs = new Map();
for (const p of data.pages) {
  for (const it of p.texts) {
    if (!texts.has(it.t)) texts.set(it.t, { t: it.t, c: 0, pages: new Set() });
    const o = texts.get(it.t);
    o.c++;
    o.pages.add(p.name);
  }
  for (const it of p.attrs) {
    const k = it.t + '\t' + it.attr;
    if (!attrs.has(k)) attrs.set(k, { t: it.t, attr: it.attr, c: 0 });
    attrs.get(k).c++;
  }
}

function groupOf(pages) {
  for (const g of pages) {
    if (GROUP1.has(g)) return 1;
    if (GROUP2.has(g)) return 2;
    if (GROUP3.has(g)) return 3;
  }
  return 1;
}

const items = [];
for (const v of texts.values()) {
  const pages = [...v.pages];
  items.push({ kind: 'text', t: v.t, c: v.c, pages, g: groupOf(pages) });
}
for (const v of attrs.values()) {
  items.push({ kind: 'attr', t: v.t, attr: v.attr, c: v.c, pages: [], g: 0 });
}

items.sort((a, b) => a.g - b.g || String(a.pages[0] || '').localeCompare(String(b.pages[0] || '')) || b.c - a.c);

const PARTS = 4;
const PER = Math.ceil(items.length / PARTS);
fs.mkdirSync(path.join(ROOT, 'data', 'parts'), { recursive: true });

for (let i = 0; i < PARTS; i++) {
  const part = items.slice(i * PER, (i + 1) * PER);
  const payload = {
    part: i + 1,
    totalItems: items.length,
    items: part.map((x) => (x.kind === 'attr'
      ? { kind: 'attr', t: x.t, attr: x.attr, c: x.c }
      : { kind: 'text', t: x.t, c: x.c, pages: x.pages })),
  };
  const file = path.join(ROOT, 'data', 'parts', `part-${i + 1}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  console.log(`part-${i + 1}: ${part.length} items (text=${part.filter((x) => x.kind === 'text').length}, attr=${part.filter((x) => x.kind === 'attr').length})`);
}

console.log(`TOTAL items=${items.length} texts=${texts.size} attrs=${attrs.size}`);
