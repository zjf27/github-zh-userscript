# GitHub 中文化（用户脚本）

把 GitHub 界面上的固定英文文案替换成简体中文，**不翻译用户内容**（评论、代码、issue/PR 标题、用户名、仓库名、bio 等）。

这是一个原创实现，不依赖也不复制任何现成的汉化脚本。

## 特性

- **精确词典匹配**：只替换 GitHub 自身的 UI 文案（导航、按钮、标签、占位符、无障碍标签等），词典外的文本一律不动。
- **用户内容保护**：`pre/code`、`.markdown-body`、评论、issue/PR 标题、用户名链接等区域直接跳过。
- **动态文案**：支持「3 commits」「2 days ago」「Showing 42 results」这类带变量的文案。
- **SPA 支持**：MutationObserver + `turbo:load` / `pjax:end`，动态加载的内容也会翻译。
- **无第三方依赖**：整个脚本单文件，`@grant GM_addStyle` 仅为确保在 CSP 严格的页面里以沙箱方式注入。

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [脚本猫 ScriptCat](https://scriptcat.org/)。
2. 打开脚本管理器 → 新建脚本 → 粘贴 [`dist/github-zh-userscript.user.js`](dist/github-zh-userscript.user.js) 全部内容 → 保存。
3. 打开 GitHub 刷新即可。

## 目录结构

```
src/engine.js        引擎（文本节点、属性、MutationObserver、用户内容保护）
src/meta.txt         userscript 元数据
data/dict.json       合并后的词典（由各分片生成）
data/patterns.json   动态文案模式
data/glossary.md     术语表与翻译规范
tools/collect.cjs    采集 GitHub 页面候选文案（Playwright）
tools/prepare.cjs    清洗、去重、分片
tools/merge.cjs      合并词典、检测冲突
tools/build.cjs      注入词典生成 dist 产物
tools/verify.cjs     真机验证（Playwright）
dist/                发布的用户脚本
```

## 构建与验证

```bash
node tools/merge.cjs    # 合并 data/dict-part-*.json → data/dict.json
node tools/build.cjs    # 生成 dist/github-zh-userscript.user.js
node tools/verify.cjs   # 真机验证（需要本机可访问 GitHub）
```

`verify.cjs` 退出码：`0` 全部通过、`1` 有失败、`2` 缺少输入（没查成）。

## 词典维护

- 新增词条：在 `data/dict-part-*.json` 或 `data/dict-manual.json` 里加 `"英文原文": "中文译文"`，再跑 merge + build。
- 术语必须遵循 [`data/glossary.md`](data/glossary.md)。
- 不要给用户名、仓库名、代码、URL 加词条。

## 许可

MIT
