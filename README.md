# GitHub 中文化（用户脚本）

把 GitHub 界面上的固定英文文案替换成简体中文，**不翻译用户内容**（评论、代码、issue/PR 标题、用户名、仓库名、bio 等）。

引擎为原创实现；词库分两层：人工维护的本地词条，加上从 [maboloshi/github-chinese](https://github.com/maboloshi/github-chinese) 词典（GPL-3.0）导入的参考词库，来源与许可见「词库与许可」。

## 特性

- **页面级词库**：覆盖 285 个 GitHub 页面（公开页与登录后页面），静态词条 15,216 条、正则模式 1,219 条、跨节点模板 164 条。
- **精确词典匹配**：只替换 GitHub 自身的 UI 文案（导航、按钮、标签、占位符、无障碍标签等），词典外的文本一律不动。
- **用户内容保护**：`pre/code`、`.markdown-body`、评论、issue/PR 标题、用户名链接等区域直接跳过。
- **动态文案**：支持「3 commits」「2 days ago」「Showing 42 results」这类带变量的文案。
- **带锚点的正则预筛**：1,200+ 条正则按锚点前 3 字符分桶，只有文本含锚点时才试匹配，避免逐节点全量扫描。
- **SPA 支持**：MutationObserver + `turbo:load` / `pjax:end`，动态加载的内容也会翻译。
- **无第三方依赖**：整个脚本单文件，`@grant GM_addStyle` 仅为确保在 CSP 严格的页面里以沙箱方式注入。

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [脚本猫 ScriptCat](https://scriptcat.org/)。
2. 打开脚本管理器 → 新建脚本 → 粘贴 [`dist/github-zh-userscript.user.js`](dist/github-zh-userscript.user.js) 全部内容 → 保存。
3. 打开 GitHub 刷新即可。

## 目录结构

```
src/engine.js           引擎（文本节点、属性、MutationObserver、用户内容保护、正则预筛）
src/meta.txt            userscript 元数据
data/dict.json          合并后的词典（由各分片生成，勿手改）
data/dict-part-*.json   采集产出并人工校订的词条分片
data/dict-manual.json   手工补充词条（优先于参考词库）
data/dict-overrides.json 最终覆盖层（最高优先级）
data/ref-dict.json      参考词库（由 tools/import-ref.cjs 生成，勿手改）
data/patterns.json      动态文案模式
data/templates.json     跨节点模板
data/glossary.md        术语表与翻译规范
tools/collect.cjs       采集 GitHub 页面候选文案（Playwright）
tools/prepare.cjs       清洗、去重、分片
tools/import-ref.cjs    从参考 locals.js 导入页面词库
tools/merge.cjs         合并词典、检测冲突
tools/build.cjs         注入词典生成 dist 产物
tools/verify.cjs        真机验证（Playwright）
dist/                   发布的用户脚本
```

## 构建与验证

```bash
node tools/import-ref.cjs <path-to-locals.js>   # 可选：从参考仓库重新生成 data/ref-dict.json
node tools/merge.cjs    # 合并 data/dict-*.json → data/dict.json
node tools/build.cjs    # 生成 dist/github-zh-userscript.user.js
node tools/verify.cjs   # 真机验证（需要本机可访问 GitHub）
```

`import-ref.cjs` 的输入是参考仓库 `gh-pages` 分支的 `locals.js`；仓库里已提交生成好的 `data/ref-dict.json`，日常构建不需要重跑这一步。

`verify.cjs` 退出码：`0` 全部通过、`1` 有失败、`2` 缺少输入（没查成）。当前基线 10 项全部通过（login / home / repo_code / repo_issues / search / repo_pulls / trending / 用户内容保护 / 元数据 / 页面零报错）。

## 词典维护

- 新增词条：在 `data/dict-part-*.json` 或 `data/dict-manual.json` 里加 `"英文原文": "中文译文"`，再跑 merge + build。
- 优先级：`dict-overrides.json` > 本地分片与手工词条 > `data/ref-dict.json`。
- 发现参考词库译错：把正确译法写进 `dict-overrides.json`，不要改 `ref-dict.json`——它是生成物，重跑 import 会被覆盖。
- 术语必须遵循 [`data/glossary.md`](data/glossary.md)。
- 不要给用户名、仓库名、代码、URL 加词条。

## 词库与许可

本项目整体以 [GNU General Public License v3.0](LICENSE) 发布，引擎代码、人工词条与派生词库同属一个许可。

`data/ref-dict.json` 派生自 [maboloshi/github-chinese](https://github.com/maboloshi/github-chinese) 的 `locals.js`（上游同为 GPL-3.0），与本项目其余部分许可一致。
