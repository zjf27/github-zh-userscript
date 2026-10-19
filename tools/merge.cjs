/**
 * 合并各分片词典，检测冲突与质量问题，输出 data/dict.json
 * 用法：node tools/merge.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'dict-part-1.json', 'dict-part-2.json', 'dict-part-3.json', 'dict-part-4.json',
  'dict-manual.json',
  'dict-additions.json',
  'dict-loggedin.json',
  'dict-loggedin-2.json',
  'dict-loggedin-3.json',
  'dict-loggedin-4.json',
  'dict-loggedin-5.json',
  'dict-loggedin-6.json',
  'dict-loggedin-7.json',
  'dict-loggedin-8.json',
  'dict-loggedin-9.json',
  'dict-zh-1.json',
  'dict-zh-2.json',
  'dict-zh-3.json',
  'dict-zh-4.json',
  'dict-zh-5.json',
  'dict-zh-6.json',
  'dict-zh-7.json',
  'dict-zh-8.json',
];

const merged = new Map();
const conflicts = [];
const sources = {};

for (const f of FILES) {
  const p = path.join(ROOT, 'data', f);
  if (!fs.existsSync(p)) { console.log(`[skip] 缺少 ${f}`); continue; }
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  let n = 0;
  for (const [k, v] of Object.entries(d)) {
    if (typeof k !== 'string' || typeof v !== 'string') { conflicts.push({ k, v, file: f, why: '非字符串' }); continue; }
    if (!merged.has(k)) {
      merged.set(k, v);
      sources[k] = f;
      n++;
    } else if (merged.get(k) !== v) {
      conflicts.push({ k, a: merged.get(k), b: v, file: f, why: '译法冲突' });
    }
  }
  console.log(`[ok] ${f} entries=${n}`);
}

// 人工裁决层：最后应用，覆盖分片中的译法
const overridesPath = path.join(ROOT, 'data', 'dict-overrides.json');
if (fs.existsSync(overridesPath)) {
  const o = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
  let n = 0;
  for (const [k, v] of Object.entries(o)) {
    if (merged.get(k) !== v) n++;
    merged.set(k, v);
  }
  console.log(`[ok] dict-overrides.json 覆盖 ${n} 条`);
}

const warnings = [];
for (const [k, v] of merged) {
  if (!v.trim()) warnings.push({ k, v, why: '空译文' });
  else if (v === k) warnings.push({ k, v, why: '译文与原文相同' });
  else if (!/[\u4e00-\u9fff]/.test(v)) warnings.push({ k, v, why: '译文不含中文' });
  else if (k.length > 90) warnings.push({ k, v, why: '原文过长' });
}

const dict = {};
for (const k of [...merged.keys()].sort((a, b) => a.localeCompare(b))) dict[k] = merged.get(k);
fs.writeFileSync(path.join(ROOT, 'data', 'dict.json'), JSON.stringify(dict, null, 2));

console.log(`\nMERGED entries=${merged.size}`);
if (conflicts.length) {
  console.log(`冲突 ${conflicts.length} 条（保留首次出现的译法）：`);
  for (const c of conflicts.slice(0, 30)) console.log(`  ${JSON.stringify(c.k)} -> ${c.a} | ${c.b} (${c.file})`);
  if (conflicts.length > 30) console.log(`  ... 另有 ${conflicts.length - 30} 条`);
}
if (warnings.length) {
  console.log(`警告 ${warnings.length} 条：`);
  for (const w of warnings.slice(0, 30)) console.log(`  ${JSON.stringify(w.k)} -> ${JSON.stringify(w.v)} (${w.why})`);
  if (warnings.length > 30) console.log(`  ... 另有 ${warnings.length - 30} 条`);
}
