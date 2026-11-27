/**
 * 词库与产物体检（静态，不联网、不开浏览器）
 * 用法：node tools/audit.cjs [--json]
 * 退出码：0 = 没有 ERROR；1 = 存在 ERROR；2 = 输入缺失或解析失败
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const asJson = process.argv.includes('--json');

function readJson(p) {
  const abs = path.join(ROOT, p);
  if (!fs.existsSync(abs)) { console.error('缺少文件: ' + p); process.exit(2); }
  try { return JSON.parse(fs.readFileSync(abs, 'utf8')); }
  catch (e) { console.error('解析失败: ' + p + ' — ' + e.message); process.exit(2); }
}

const errors = [];
const warns = [];
const err = (code, msg) => errors.push({ code, msg });
const warn = (code, msg) => warns.push({ code, msg });

// ---------- 词典 ----------
const dict = readJson('data/dict.json');
const ref = readJson('data/ref-dict.json');
const allDict = Object.assign({}, ref.dict || {}, dict);
const keys = Object.keys(allDict);
let dirtyKey = 0, emptyVal = 0, sameVal = 0, shortKey = 0;
const samples = { dirtyKey: [], emptyVal: [], sameVal: [], shortKey: [] };

for (const k of keys) {
  const v = allDict[k];
  if (k.trim() !== k || /\s{2,}/.test(k) || /[\r\n]/.test(k)) {
    dirtyKey++; if (samples.dirtyKey.length < 5) samples.dirtyKey.push(JSON.stringify(k));
  }
  if (typeof v !== 'string' || !v.trim()) {
    emptyVal++; if (samples.emptyVal.length < 5) samples.emptyVal.push(JSON.stringify(k));
    continue;
  }
  if (v === k) { sameVal++; if (samples.sameVal.length < 5) samples.sameVal.push(JSON.stringify(k)); }
  if (/^[A-Za-z]{1,2}$/.test(k)) { shortKey++; if (samples.shortKey.length < 8) samples.shortKey.push(k + '→' + v); }
}
if (dirtyKey) err('dict.dirty_key', dirtyKey + ' 个键含首尾空白、连续空格或换行，lookup 归一化后永远匹配不上：' + samples.dirtyKey.join(', '));
if (emptyVal) err('dict.empty_value', emptyVal + ' 条译法为空：' + samples.emptyVal.join(', '));
if (sameVal) warn('dict.unchanged', sameVal + ' 条译法与英文原文相同（多为专有名词保留）：' + samples.sameVal.join(', '));
if (shortKey) warn('dict.short_key', shortKey + ' 个 1-2 字母键可能误伤同名单词：' + samples.shortKey.join(' | '));

// ---------- 正则规则 ----------
const patternFiles = ['data/patterns.json', 'data/patterns-2.json', 'data/patterns-3.json', 'data/patterns-4.json'];
const localPatterns = [];
for (const f of patternFiles) {
  if (!fs.existsSync(path.join(ROOT, f))) { err('patterns.missing', '缺少 ' + f); continue; }
  const arr = readJson(f);
  if (!Array.isArray(arr)) { err('patterns.shape', f + ' 不是数组'); continue; }
  arr.forEach((p, i) => localPatterns.push({ p, where: f + '#' + i }));
}
const refPatterns = (ref.patterns || []).map((p, i) => ({ p, where: 'ref-dict#' + i }));

let badRe = 0, badRef = 0, upperAnchor = 0, noAnchor = 0;
const badReSamples = [], badRefSamples = [];
const countGroups = (src) => {
  let n = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\\') { i++; continue; }
    if (src[i] === '(' && src[i + 1] !== '?') n++;
  }
  return n;
};
for (const { p, where } of localPatterns.concat(refPatterns)) {
  if (!Array.isArray(p) || typeof p[0] !== 'string' || typeof p[1] !== 'string') {
    err('patterns.shape', where + ' 不是 [正则, 替换, 锚点] 三元组'); continue;
  }
  let re;
  try { re = new RegExp('^(?:' + p[0] + ')$', 'i'); }
  catch (e) { badRe++; if (badReSamples.length < 5) badReSamples.push(where + ' ' + String(e.message).slice(0, 50)); continue; }
  const groups = countGroups(p[0]);
  const m = p[1].match(/\$(\d+)/g) || [];
  for (const g of m) {
    const n = Number(g.slice(1));
    if (n > groups) { badRef++; if (badRefSamples.length < 5) badRefSamples.push(where + ' 引用 ' + g + ' 但只有 ' + groups + ' 组'); }
  }
  const anchor = p[2] || '';
  if (!anchor) noAnchor++;
  else if (/[A-Z]/.test(anchor)) { upperAnchor++; if (badRefSamples.length < 8) badRefSamples.push(where + ' 锚点含大写 ' + anchor); }
}
if (badRe) err('patterns.regex', badRe + ' 条正则编译失败：' + badReSamples.join(' | '));
if (badRef) err('patterns.backref', badRef + ' 条替换串引用了不存在的捕获组：' + badRefSamples.join(' | '));
if (upperAnchor) err('patterns.anchor_case', upperAnchor + ' 条锚点含大写字母，分桶后永不命中：' + badRefSamples.join(' | '));
if (noAnchor) warn('patterns.no_anchor', noAnchor + ' 条规则没有锚点，每条文本都要全量试跑（性能项，非错误）');

// ---------- 跨节点模板 ----------
const tplFiles = ['data/templates.json', 'data/templates-2.json', 'data/templates-3.json', 'data/templates-4.json', 'data/templates-5.json', 'data/templates-6.json'];
let tplCount = 0, tplBadIdx = 0, tplBadVal = 0;
const tplSamples = [];
for (const f of tplFiles) {
  if (!fs.existsSync(path.join(ROOT, f))) { err('templates.missing', '缺少 ' + f); continue; }
  const obj = readJson(f);
  for (const [k, v] of Object.entries(obj)) {
    tplCount++;
    if (typeof v !== 'string' || !v.trim()) { tplBadVal++; tplSamples.push(f + ' ' + JSON.stringify(k)); continue; }
    const idx = [...k.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
    if (idx.length && idx[0] !== 0) { tplBadIdx++; tplSamples.push(f + ' ' + JSON.stringify(k) + ' 占位符不从 0 起'); }
    for (let i = 1; i < idx.length; i++) {
      if (idx[i] !== idx[i - 1] + 1) { tplBadIdx++; tplSamples.push(f + ' ' + JSON.stringify(k) + ' 占位符不连续'); break; }
    }
  }
}
if (tplBadVal) err('templates.empty_value', tplBadVal + ' 条模板译法为空：' + tplSamples.join(' | '));
if (tplBadIdx) err('templates.placeholder', tplBadIdx + ' 条模板占位符编号不合法：' + tplSamples.join(' | '));

// ---------- 产物一致性 ----------
const distPath = path.join(ROOT, 'dist', 'github-zh-userscript.user.js');
const pkg = readJson('package.json');
if (!fs.existsSync(distPath)) {
  err('dist.missing', '缺少 dist/github-zh-userscript.user.js，先跑 node tools/build.cjs');
} else {
  const dist = fs.readFileSync(distPath, 'utf8');
  const vm = /@version\s+(\S+)/.exec(dist);
  if (!vm) err('dist.meta', 'dist 缺少 @version');
  else if (vm[1] !== pkg.version) err('dist.version', 'dist @version=' + vm[1] + ' 与 package.json=' + pkg.version + ' 不一致，重新构建');
  for (const [label, needle] of [['__DICT__', false], ['__PATTERNS__', false], ['__TEMPLATES__', false]]) {
    if (dist.includes('/*' + label + '*/')) err('dist.placeholder', 'dist 中残留占位符 ' + label);
  }
  const metaPath = path.join(ROOT, 'dist', 'github-zh-userscript.meta.js');
  if (!fs.existsSync(metaPath)) err('dist.meta_missing', '缺少 dist/github-zh-userscript.meta.js');
  else {
    const m2 = /@version\s+(\S+)/.exec(fs.readFileSync(metaPath, 'utf8'));
    if (!m2 || m2[1] !== pkg.version) err('dist.meta_version', '.meta.js 版本与 package.json 不一致');
  }
}

// ---------- 报告 ----------
const report = {
  dict_total: keys.length,
  patterns: localPatterns.length + refPatterns.length,
  templates: tplCount,
  errors,
  warns,
};
if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('词典 ' + keys.length + ' 条 / 正则 ' + report.patterns + ' 条 / 模板 ' + tplCount + ' 条');
  for (const w of warns) console.log('[WARN] ' + w.code + ': ' + w.msg);
  for (const e of errors) console.log('[ERROR] ' + e.code + ': ' + e.msg);
  console.log(errors.length ? 'AUDIT_FAIL errors=' + errors.length + ' warns=' + warns.length : 'AUDIT_OK errors=0 warns=' + warns.length);
}
process.exit(errors.length ? 1 : 0);
