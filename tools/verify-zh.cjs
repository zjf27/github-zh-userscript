/**
 * 专项验证：用户 5 张截图涉及的页面是否真的译成了中文。
 * 状态对话框无法稳定自动打开，改用合成节点注入（与真实对话框同一套渲染路径）。
 * 用法：NODE_PATH=<全局 node_modules> node tools/verify-zh.cjs
 * 退出码：0=全部通过，1=有失败
 */
const path = require('path');
const { chromium } = require('playwright');

const DIST = path.join(__dirname, '..', 'dist', 'github-zh-userscript.user.js');

const PAGE_CASES = [
  {
    url: 'https://github.com/settings/organizations',
    must: ['你的个人账户无法转换为组织'],
    mustNot: ['cannot be converted to an organization'],
  },
  {
    url: 'https://github.com/settings/enterprises',
    must: ['你没有任何企业', '专为在 GitHub.com 上协作的企业或团队设计'],
    mustNot: ["You don't have any enterprises", 'Designed for businesses or teams'],
  },
  {
    url: 'https://github.com/settings/packages',
    must: ['软件包权限', '默认软件包设置', '已删除的软件包', '从源仓库继承访问权限', '未找到 zjf27 的可恢复软件包'],
    mustNot: ['Packages permissions', 'No recoverable packages were found'],
  },
  {
    url: 'https://github.com/settings/admin',
    must: ['更改你的用户名可能会产生', '导出 @zjf27 的所有仓库和个人资料元数据', '关联 @zjf27 的 Patreon 账户', '点击下方“添加继任者”', '想管理账户安全设置'],
    mustNot: ['Changing your username can have', 'Connect a Patreon account for', 'By clicking', 'Export all repositories and profile metadata for'],
  },
  {
    url: 'https://github.com/settings/security_analysis',
    must: ['推送保护', '依赖关系图', 'Dependabot 警报'],
    mustNot: ['Push protection for yourself', 'Enable dependency graph'],
  },
  {
    url: 'https://github.com/settings/blocked_users',
    must: ['你还没有阻止任何人。', '阻止用户后，将在你的所有仓库中阻止以下操作'],
    mustNot: ['You have not blocked anyone.', 'Blocking a user prevents the following'],
  },
  {
    url: 'https://github.com/settings/applications',
    must: ['你已授予'],
    mustNot: ['You have granted'],
  },
  {
    url: 'https://github.com/settings/copilot',
    must: ['Copilot 云代理', '快速上手', '更多编辑器'],
    mustNot: ['Copilot cloud agent'],
  },
  {
    url: 'https://github.com/settings/codespaces',
    must: ['默认空闲超时', '默认保留期', '受信任的仓库'],
    mustNot: ['Default idle timeout', 'Default retention period'],
  },
  {
    url: 'https://github.com/settings/replies',
    must: ['还没有保存的回复。', '添加保存的回复'],
    mustNot: ['No saved replies yet.'],
  },
  {
    url: 'https://github.com/settings/sponsors-log',
    must: ['全部时间', '筛选活动'],
    mustNot: ['All-time'],
  },
  {
    url: 'https://github.com/settings/security-log',
    must: ['筛选审计日志'],
    mustNot: ['Filter audit logs'],
  },
  {
    url: 'https://github.com/zjf27/github-zh-userscript/releases/new',
    must: [
      '新建发行版',
      '发行版标题',
      '发行版说明',
      '标签建议',
      '语义化版本',
      '发布发行版',
      '保存草稿',
      '预发行版',
      '选择标签',
      '选择已有标签，或在发布此发行版时创建新标签。',
      '如果未勾选「设为最新发行版」',
      '新发布的发行版会自动标记为本仓库的最新发行版',
      '如果你是第一次发布软件',
      '通常做法是在版本名前面加上字母',
      '如果这个标签不是用于生产环境',
      '将二进制文件拖放到此处，或点击选择',
    ],
    mustNot: [
      'New release',
      'Release title',
      'Release notes',
      'Tagging suggestions',
      'Publish release',
      'Save draft',
      'Semantic versioning',
      'Choose an existing tag',
    ],
  },
  {
    url: 'https://github.com/zjf27/github-zh-userscript/releases',
    must: ['你可以创建发行版来打包软件', '可在我们的文档中了解关于发行版的更多信息'],
    mustNot: ['You can create a release to package software', 'Learn more about releases in'],
  },
  {
    url: 'https://github.com/zjf27/github-zh-userscript/settings/copilot/code_review',
    must: [
      'Copilot 代码审查',
      '配置 Copilot 代码审查',
      '审查投入级别',
      '允许 Copilot 审批拉取请求',
      '管理 Copilot 代码审查自动化',
      '查看所有规则集',
      '自动化 Copilot 代码审查',
      '为默认分支创建规则集',
    ],
    mustNot: [
      'Configure Copilot code review',
      'Review effort level',
      'Manage Copilot code review automations',
      'Create ruleset for default branch',
      'View all rulesets',
    ],
  },
  {
    url: 'https://github.com/zjf27/github-zh-userscript/network/dependencies',
    must: ['依赖图已禁用', '启用依赖图', '代码频率', '活跃度'],
    mustNot: [
      'Dependency graph is disabled',
      'Enable the dependency graph',
      'Code frequency',
    ],
  },
  {
    url: 'https://github.com/zjf27/github-zh-userscript/milestones',
    must: ['新建里程碑', '创建里程碑', '使用里程碑为特定的发行版或项目创建议题和拉取请求的集合。', '你还没有创建任何里程碑。'],
    mustNot: ['New milestone', 'Create a milestone', 'You haven'],
  },
  {
    url: 'https://github.com/zjf27/github-zh-userscript/milestones/new',
    must: ['创建里程碑', '创建新里程碑，帮助整理你的议题和拉取请求。', '截止日期', '选择日期…'],
    mustNot: ['Create milestone', 'Due date', 'Choose date'],
  },
  {
    url: 'https://github.com/zjf27/github-zh-userscript/settings/copilot/mcp',
    must: ['模型上下文协议（MCP）', '支持的智能体', '保存 MCP 配置'],
    mustNot: ['Save MCP configuration', 'Supported agents'],
  },
  {
    url: 'https://github.com/copilot',
    must: ['新建对话', '还没有对话'],
    mustNot: ['New chat', 'No chats yet'],
  },
];

const SYNTH = [
  ["What's happening", '发生了什么'],
  ['Busy', '忙碌'],
  ['On vacation', '休假中'],
  ['Working from home', '在家工作'],
  ['Visible to', '可见范围'],
  ['Clear status', '清除状态'],
  ['Your status will be cleared after the selected time.', '你的状态将在所选时间后清除。'],
  ['Limit status visibility to a single organization.', '将状态可见范围限制为单个组织。'],
  ['80 characters remaining', '剩余 80 个字符'],
  ['Never', '从不'],
];

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  await ctx.addInitScript({ path: DIST });

  let pass = 0;
  const fails = [];
  const ok = (cond, label) => {
    if (cond) pass++;
    else fails.push(label);
  };

  for (const c of PAGE_CASES) {
    const page = await ctx.newPage();
    try {
      await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3200);
    } catch (e) {
      fails.push(c.url + ' 打开失败 ' + String((e && e.message) || '').slice(0, 60));
      await page.close();
      continue;
    }
    const text = await page.evaluate(() => document.body.textContent);
    for (const m of c.must || []) ok(text.includes(m), c.url + ' 应含 ' + JSON.stringify(m));
    for (const m of c.mustNot || []) ok(!text.includes(m), c.url + ' 不该含 ' + JSON.stringify(m));
    await page.close();
  }

  const probe = await ctx.newPage();
  await probe.goto('https://github.com/dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await probe.waitForTimeout(3200);
  await probe.evaluate((texts) => {
    const d = document.createElement('div');
    d.id = '__zh_probe__';
    for (const t of texts) {
      const s = document.createElement('span');
      s.textContent = t;
      d.appendChild(s);
    }
    document.body.appendChild(d);
  }, SYNTH.map((x) => x[0]));
  await probe.waitForTimeout(1500);
  const after = await probe.evaluate(() =>
    [...document.querySelectorAll('#__zh_probe__ span')].map((s) => s.textContent)
  );
  SYNTH.forEach(([src, exp], i) =>
    ok(after[i] === exp, '合成 ' + JSON.stringify(src) + ' 期望 ' + JSON.stringify(exp) + ' 实得 ' + JSON.stringify(after[i]))
  );
  await probe.close();

  console.log('\n===== 验证结果 =====');
  console.log('RESULT pass=' + pass + ' fail=' + fails.length);
  for (const f of fails) console.log('  FAIL ' + f);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => {
  console.error('验证脚本失败：' + String((e && e.stack) || e));
  process.exit(2);
});