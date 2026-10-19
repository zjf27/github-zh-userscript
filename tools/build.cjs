/**
 * 构建：把词典与模式注入引擎，产出 dist/github-zh-userscript.user.js
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
const patterns = readJson(path.join(ROOT, 'data', 'patterns.json'), []);
const meta = fs.readFileSync(path.join(ROOT, 'src', 'meta.txt'), 'utf8');
let engine = fs.readFileSync(path.join(ROOT, 'src', 'engine.js'), 'utf8');

const dictJson = JSON.stringify(dict);
const patternsJson = JSON.stringify(patterns);

if (!engine.includes('/*__DICT__*/{}')) throw new Error('engine.js 缺少 __DICT__ 占位符');
if (!engine.includes('/*__PATTERNS__*/[]')) throw new Error('engine.js 缺少 __PATTERNS__ 占位符');

engine = engine.replace('/*__DICT__*/{}', () => dictJson);
engine = engine.replace('/*__PATTERNS__*/[]', () => patternsJson);

const out = meta.trim() + '\n\n' + engine;
const outPath = path.join(ROOT, 'dist', 'github-zh-userscript.user.js');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out, 'utf8');

const size = Buffer.byteLength(out, 'utf8');
console.log(`BUILD_OK ${outPath} bytes=${size} dict=${Object.keys(dict).length} patterns=${patterns.length}`);
