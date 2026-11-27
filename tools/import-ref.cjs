#!/usr/bin/env node
/**
 * 从 maboloshi/github-chinese 的 locals.js 导入参考词条，生成 data/ref-dict.json
 * 用法：node tools/import-ref.cjs <locals.js 路径> [--inspect] [--out data/ref-dict.json]
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const src = args[0];
if (!src) {
  console.error('用法: node tools/import-ref.cjs <locals.js 路径> [--inspect] [--out <输出文件>]');
  process.exit(2);
}
const outIdx = args.indexOf('--out');
const outPath = outIdx > 0 ? args[outIdx + 1] : path.join(ROOT, 'data', 'ref-dict.json');

const sandbox = { I18N: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(src, 'utf8'), sandbox, { timeout: 60000 });
const pages = (sandbox.I18N && sandbox.I18N['zh-CN']) || {};

if (args.includes('--inspect')) {
  console.log('pages=' + Object.keys(pages).length);
  process.exit(0);
}

function norm(s) {
  return s.replace(/\s+/g, ' ').trim();
}

// 1) static：按 key 聚合所有译法，取出现次数最多的；平票时 public 优先、其次页面名字典序
// 参考词库里的脏数据：with 被译成「标签的内容，使用：」，全局启用会误伤
const BLACKLIST = new Set(['with']);
const stat = new Map();
let staticTotal = 0;
for (const name of Object.keys(pages).sort()) {
  const st = pages[name].static || {};
  for (const en of Object.keys(st)) {
    const zh = st[en];
    if (typeof zh !== 'string' || !zh.trim()) continue;
    const key = norm(en);
    if (!key || key.length < 3 || !/[A-Za-z]{2}/.test(key)) continue;
    if (BLACKLIST.has(key)) continue;
    staticTotal++;
    if (!stat.has(key)) stat.set(key, new Map());
    const m = stat.get(key);
    m.set(zh, (m.get(zh) || 0) + 1);
  }
}

const dict = {};
let conflicts = 0;
const conflictSamples = [];
for (const [key, m] of stat) {
  let best = null;
  let bestN = -1;
  for (const [zh, n] of m) {
    if (n > bestN) { best = zh; bestN = n; }
  }
  dict[key] = best;
  if (m.size > 1) {
    conflicts++;
    if (conflictSamples.length < 8) conflictSamples.push([key, Array.from(m.entries())]);
  }
}

// 2) regexp：只收 string 替换串；RegExp 以 "/source/flags" 形式序列化
const reMap = new Map();
let reTotal = 0;
let fnSkipped = 0;
let reBad = 0;
for (const name of Object.keys(pages).sort()) {
  const list = pages[name].regexp || [];
  for (const pair of list) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const [re, repl] = pair;
    if (typeof repl !== 'string') { fnSkipped++; continue; }
    const s = String(re);
    const lastSlash = s.lastIndexOf('/');
    if (s[0] !== '/' || lastSlash <= 0) { reBad++; continue; }
    let source = s.slice(1, lastSlash);
    const flags = s.slice(lastSlash + 1).replace(/g/g, '');
    // 去掉最外层锚点，引擎统一用 ^(?:...)$ 包装
    if (source.startsWith('^')) source = source.slice(1);
    if (source.endsWith('$') && !source.endsWith('\\$')) source = source.slice(0, -1);
    const key = source + '|' + flags;
    if (!reMap.has(key)) reMap.set(key, { source: source, flags: flags, repl: repl, count: 0 });
    reMap.get(key).count++;
    reTotal++;
  }
}

function anchorOf(source) {
  const m = /^([A-Za-z][A-Za-z' ]{2,})/.exec(source);
  if (m) return norm(m[1]).toLowerCase();
  const m2 = /([A-Za-z]{4,})/.exec(source);
  return m2 ? m2[1].toLowerCase() : '';
}

const patterns = [];
let anchored = 0;
for (const v of reMap.values()) {
  const anchor = anchorOf(v.source);
  if (anchor) anchored++;
  patterns.push([v.source, v.repl, anchor, v.flags]);
}

const out = {
  meta: {
    source: 'https://github.com/maboloshi/github-chinese',
    license: 'GPL-3.0',
    note: '由 tools/import-ref.cjs 从参考项目 locals.js 生成，勿手改',
    pages: Object.keys(pages).length,
    staticEntries: staticTotal,
    uniqueStatic: Object.keys(dict).length,
    conflicts: conflicts,
    regexpEntries: reTotal,
    uniqueRegexp: patterns.length,
    functionReplSkipped: fnSkipped,
    unparsableRegexp: reBad
  },
  dict: dict,
  patterns: patterns
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out), 'utf8');

console.log(JSON.stringify({
  out: outPath,
  bytes: fs.statSync(outPath).size,
  pages: out.meta.pages,
  staticEntries: staticTotal,
  uniqueStatic: Object.keys(dict).length,
  conflicts: conflicts,
  conflictSamples: conflictSamples,
  regexpEntries: reTotal,
  uniqueRegexp: patterns.length,
  anchored: anchored,
  functionReplSkipped: fnSkipped,
  unparsableRegexp: reBad
}, null, 1));
