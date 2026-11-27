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

const localDict = readJson(path.join(ROOT, 'data', 'dict.json'), {});
const ref = readJson(path.join(ROOT, 'data', 'ref-dict.json'), { dict: {}, patterns: [] });
// 本地词典优先：同一 key 保留本仓库既有译法，避免参考词库覆盖术语表约定
const dict = Object.assign({}, ref.dict, localDict);

const localPatterns = [
  ...readJson(path.join(ROOT, 'data', 'patterns.json'), []),
  ...readJson(path.join(ROOT, 'data', 'patterns-2.json'), []),
  ...readJson(path.join(ROOT, 'data', 'patterns-3.json'), []),
  ...readJson(path.join(ROOT, 'data', 'patterns-4.json'), []),
];

// 与 tools/import-ref.cjs 的 anchorOf 保持一致：取正则开头第一段必需字面量，
// 引擎用它给规则分桶，避免每条文本都跑上千条正则。
function anchorOf(source) {
  const m = /^([A-Za-z][A-Za-z' ]{2,})/.exec(source);
  if (m) return m[1].replace(/\s+/g, ' ').trim().toLowerCase();
  const m2 = /([A-Za-z]{4,})/.exec(source);
  return m2 ? m2[1].toLowerCase() : '';
}

const patterns = [
  ...localPatterns.map((p) => [p[0], p[1], anchorOf(p[0]), 'i']),
  ...ref.patterns.map((p) => [p[0], p[1], p[2] || '', p[3] || 'i']),
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

// 更新检查专用：只含元数据块，脚本管理器拉这个判断版本，够新才去拉完整脚本
const metaOut = meta.trim() + '\n';
const metaPath = path.join(ROOT, 'dist', 'github-zh-userscript.meta.js');
fs.writeFileSync(metaPath, metaOut, 'utf8');

const size = Buffer.byteLength(out, 'utf8');
const metaSize = Buffer.byteLength(metaOut, 'utf8');
console.log(
  'BUILD_OK ' + outPath + ' bytes=' + size + ' dict=' + Object.keys(dict).length +
  ' patterns=' + patterns.length + ' templates=' + Object.keys(templates).length +
  ' metaBytes=' + metaSize
);
