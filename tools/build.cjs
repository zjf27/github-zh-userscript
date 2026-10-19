/**
 * 构建：把词典、模式与跨节点模板注入引擎，产出 dist/github-zh-userscript.user.js
 * 用法：node tools/build.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function readJson(p, fallback) {
  if (!fs.existsSync(p)) {
    if (fallback !== undefined) return fallback;
    throw new Error('缺少文件: ' + p);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const dict = readJson(path.join(ROOT, 'data', 'dict.json'), {});
const patterns = [
  ...readJson(path.join(ROOT, 'data', 'patterns.json'), []),
  ...readJson(path.join(ROOT, 'data', 'patterns-2.json'), []),
  ...readJson(path.join(ROOT, 'data', 'patterns-3.json'), []),
  ...readJson(path.join(ROOT, 'data', 'patterns-4.json'), []),
];
const templates = {
  ...readJson(path.join(ROOT, 'data', 'templates.json'), {}),
  ...readJson(path.join(ROOT, 'data', 'templates-2.json'), {}),
  ...readJson(path.join(ROOT, 'data', 'templates-3.json'), {}),
  ...readJson(path.join(ROOT, 'data', 'templates-4.json'), {}),
  ...readJson(path.join(ROOT, 'data', 'templates-5.json'), {}),
  ...readJson(path.join(ROOT, 'data', 'templates-6.json'), {}),
};
const meta = fs.readFileSync(path.join(ROOT, 'src', 'meta.txt'), 'utf8');
let engine = fs.readFileSync(path.join(ROOT, 'src', 'engine.js'), 'utf8');

if (!engine.includes('/*__DICT__*/{}')) throw new Error('engine.js 缺少 __DICT__ 占位符');
if (!engine.includes('/*__PATTERNS__*/[]')) throw new Error('engine.js 缺少 __PATTERNS__ 占位符');
if (!engine.includes('/*__TEMPLATES__*/{}')) throw new Error('engine.js 缺少 __TEMPLATES__ 占位符');

engine = engine.replace('/*__DICT__*/{}', () => JSON.stringify(dict));
engine = engine.replace('/*__PATTERNS__*/[]', () => JSON.stringify(patterns));
engine = engine.replace('/*__TEMPLATES__*/{}', () => JSON.stringify(templates));

const out = meta.trim() + '\n\n' + engine;
const outPath = path.join(ROOT, 'dist', 'github-zh-userscript.user.js');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out, 'utf8');

const size = Buffer.byteLength(out, 'utf8');
console.log(
  `BUILD_OK ${outPath} bytes=${size} dict=${Object.keys(dict).length} patterns=${patterns.length} templates=${Object.keys(templates).length}`
);