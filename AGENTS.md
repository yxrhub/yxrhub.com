# AGENTS.md

> 本文件是本仓库的 **AI 协作入口规范**,对所有 AI 编码工具(Claude Code、Cursor、Copilot、Codex、WorkBuddy 等)一视同仁。  
> 任何 AI 在本仓库开始工作前,应先读完本文件;涉及架构变更时,再读 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。

---

## 1. 项目速览

**yxrhub.com** —— 基于 Astro 全栈架构的个人品牌枢纽站,提供个人主页渲染、开发日志与统一账号体系(GitHub OAuth)。

| 维度  | 说明                                           |
| --- | -------------------------------------------- |
| 框架  | Astro `^7`(SSR / Node standalone 适配器)        |
| 交互  | React `^19` 岛屿(Islands),按需水合                 |
| 认证  | better-auth `^1.6` + Drizzle 适配器             |
| 数据  | PostgreSQL + drizzle-orm `^0.45`             |
| 语言  | TypeScript(strict)                           |
| 内容  | Markdown + Astro 内容集合(`src/content.config.ts`) |
| 包管理 | **pnpm**(禁止使用 npm / yarn)                    |
| 部署  | Docker 多阶段构建,运行 `node dist/server/entry.mjs` |



---

## 2. 常用命令

```bash
pnpm install              # 安装依赖(首次,使用 frozen-lockfile 保持一致)
pnpm dev                  # 本地开发,默认 http://localhost:4321
pnpm build                # 生产构建,产出 dist/(改完代码必跑)
pnpm preview              # 预览构建产物
pnpm release              # 构建并发布容器镜像到 GHCR(见第 8 节)
pnpm drizzle-kit push     # 将 schema 变更同步到数据库(开发期,不产生迁移文件)
```

> `pnpm astro check`(类型检查)**当前不可用**——`@astrojs/check` 与 `typescript` 未列入 `devDependencies`。执行前需先 `pnpm add -D @astrojs/check typescript`。在补齐之前,以 `pnpm build` 作为唯一强制校验关卡。
>
> 本地开发前,先从 `.env.example` 复制出 `.env` 并填齐变量,否则认证相关功能会直接抛错。
>
> **在受管沙箱里请用 `CODEBUDDY_SAFE_DELETE_ENABLED=0 pnpm dev`**(理由见 [7.1](#71-组件永远停在加载中--岛屿水合失败));`pnpm build` 同理,见 [7.2](#72-pnpm-build-报大批量删除被拦截)。

---

## 3. 目录职责

| 路径                  | 职责                             | 允许的改动               |
| ------------------- | ------------------------------ | ------------------- |
| `src/pages/`        | 路由与页面编排                        | 新增页面 / 接口           |
| `src/layouts/`      | 全局布局壳                          | 改 `<head>`、全局结构     |
| `src/components/`   | UI 单元(`.astro` 静态 / `.tsx` 交互) | 新增、抽离组件             |
| `src/content/`      | Markdown 内容源                   | **改文案优先改这里**        |
| `src/content.config.ts` | 内容集合定义(blog)+ frontmatter schema | 新增集合、改字段            |
| `src/lib/`          | 服务端能力(认证、内容读取、外部集成)            | 谨慎,影响面大             |
| `src/db/schema/`    | 数据表结构                          | **必须走 drizzle-kit** |
| `src/styles/`       | 全局 CSS(`admin.css` / `prose.css`) | 新增样式表               |
| `src/middleware.ts` | 每请求会话注入                        | 谨慎                  |
| `docs/`             | 设计与流程文档                        | 与代码同步更新             |

**依赖方向**:`pages` → `layouts` / `components` → `lib` → `db`。**禁止反向依赖**,`lib` 与 `db` 不得 import 任何 UI 文件。

### 内容投放:想改什么,改哪里

| 目标 | 落点 | 不要做 |
| --- | --- | --- |
| 改首页自我介绍 / 项目 / 链接 | `src/content/index.md`(散文写正文,清单写 frontmatter) | 不要改 `Welcome.astro` 里的字面量 |
| 加一篇开发日志 | `src/content/blog/YYYY-MM-DD-<短名>.md` | 不要改任何 `.astro` 代码 |
| 调后台版式 | `src/styles/admin.css` | 不要在 `.tsx` 里写内联颜色 |
| 调长文正文排版 | `src/styles/prose.css` | 不要各页面各写一份 |

---

## 4. 架构红线(违反会直接导致线上故障)

1. **不要改 `src/db/schema/auth.ts` 的字段名。** 该结构是 better-auth 的数据契约,snake_case 列名即协议。
2. **不要删除 `middleware.ts` 中的 `context.isPrerendered` 短路分支。** 它规避了预渲染页面读取 headers 的告警与无意义查询。
3. **不要改动 `astro.config.mjs` 的 `ssr.noExternal: true`。** 这是「运行镜像不含 `node_modules`」的前提。引入原生模块库时必须重新评估并告知用户。
4. **新增 API 路由必须写 `export const prerender = false`。** 否则可能被静态化,拿不到请求上下文。
5. **React 组件不加水合指令就是静态 HTML。** 需要交互必须显式写 `client:load` / `client:idle` / `client:visible`。
6. **服务端密钥走 `process.env`(空前缀已加载);浏览器可读的变量必须用 `PUBLIC_` 前缀。** 不要把 `DATABASE_URL`、`*_SECRET` 暴露到客户端。
7. **`.env*` 与真实密钥永不写入仓库、日志或文档。**
8. **数据库变更通过修改 `src/db/schema/` + `drizzle-kit push` 同步**,不手写 DDL、不手工改表。
   本项目处于**开发期**,表结构变动频繁,**刻意不使用迁移文件**——仓库无 `drizzle/` 目录、库中也没有 `__drizzle_migrations` 表,当前连接的是**开发库**。这是有意选择,不是遗漏,**不要"顺手"去补迁移文件**。
   > ⚠️ **但从开发库走向生产库之前,必须重新评估并引入正式迁移机制。** 届时绝不可对生产库直接 `push`(它会直接改结构、无版本记录、无回滚路径)。
9. **需要登录态或权限的页面必须写 `export const prerender = false`。** 默认 `output: "static"`,页面默认预渲染;预渲染会跳过中间件所有依赖 headers 的逻辑,权限守卫会整体失效。
10. **不要在 `.astro` 里用 `Astro.locals.user` 做预渲染页面的条件渲染。** 预渲染页面的 `locals.user` 恒为 `null`,分支永远不成立。登录态渲染一律交给 React 岛屿在客户端判断(首页的登录按钮与管理入口即如此)。
11. **角色判定必须按分隔后精确匹配 `role`。** `role` 支持逗号分隔多值,`role.includes("admin")` 会把 `superadmin` 误判为管理员;统一用 `src/lib/authz.ts` 的 `isAdmin()`。
12. **不要把 `src/content/index.md` 卷进内容集合。** 首页正文走的是原始 Markdown 模块导入(`import * as doc from "../content/index.md"`),不属于任何集合;`blog` 集合的 `glob.base` 精确指向 `src/content/blog`,不要扩大它。
13. **不要把句末标点写在加粗内部末尾,又让加粗直接接汉字。** CommonMark 要求闭合定界符 right-flanking(左侧非空白,且「左侧非标点」或「右侧是空白/标点」)。唯一会踩的组合是 **`**结论。**下一句`** —— 闭合 `**` 左边是标点、右边是汉字,右侧不满足条件,**不会解析**,页面上原样显示星号。
    改法:把标点移到加粗外面(`**结论**。下一句`)。**注意以下写法都是正常的,不要动**:`**加粗**汉字`、`前缀。**加粗**后缀`、`**加粗**，汉字`、`**加粗**（附注`。
    复核手段:渲染后搜正文里是否残留 `**`(源文件层面的正则判据极易误报,不要用)。
14. **日志页面保持预渲染,不得使用 `Astro.locals.user`。** 内容公开,静态化是正确选择;一旦有人给它加权限判断,回头参照红线 9/10。

---

## 5. 代码风格

- **TypeScript strict**,不引入 `any`;确实需要时用 `unknown` + 类型收窄。
- 缩进 2 空格;组件文件用 **PascalCase**,工具模块用 **camelCase**。
- 文件职责单一,单个组件/模块建议不超过 ~150 行,超出则拆分。
- 尾部逗号、单引号(TS 文件),与现有代码保持一致。
- 注释写「为什么」而非「做什么」,中文注释可接受(仓库现状)。
- **不要为一次性用途新建抽象**;三处重复再考虑抽取。
- 改动保持最小 diff,**不要顺手重构无关代码**。

---

## 6. 工作流程(强制)

本仓库采用 **「先整理需求与计划,再开发」** 的两段式流程。完整说明见 [`docs/AI_DEV_WORKFLOW.md`](./docs/AI_DEV_WORKFLOW.md)。

| 阶段       | 动作                                       | 产出                                         |
| -------- | ---------------------------------------- | ------------------------------------------ |
| ① 需求     | 澄清目标、范围、验收标准                             | `docs/requirements/REQ-YYYYMMDD-<slug>.md` |
| ② 计划     | 拆解任务、列出影响文件、风险                           | `docs/plans/PLAN-YYYYMMDD-<slug>.md`       |
| ③ **确认** | **向用户复述计划并等待确认**                         | —                                          |
| ④ 开发     | 按计划小步实施                                  | 代码改动                                       |
| ⑤ 验证     | `pnpm build` + 手工验证                       | 验证记录                                       |
| ⑥ 沉淀     | 更新文档 / 记录关键决策                            | 文档更新                                       |

模板位于 `docs/templates/`。

### 硬性规则

- **跳过阶段 ③ 是禁止的。** 计划未经用户确认,不得进入开发。
- **同一轮对话内的变更不要混入计划外的文件。** 计划外需求 → 回到阶段 ①。
- **不确定就问,不要猜。** 涉及密钥、域名、线上数据的操作,必须先确认。
- **提交粒度小**,一个提交解决一件事,提交信息写清「做了什么 + 为什么」。
- **改完必须验证。** 未跑 `pnpm build` 的改动不得声称「已完成」。
- 无法完成的验证要如实说明,并指出残留风险。

---

## 7. 开发环境疑难

### 7.1 组件永远停在「加载中...」/ 岛屿水合失败

**症状**:浏览器控制台报 `[astro-island] Error hydrating ... TypeError: Failed to fetch dynamically imported module`,`LoginButton` 之类的交互组件永远停在初始 loading 态。

**根因(已实证,不要猜)**:

```
[vite] Re-optimizing dependencies because vite config has changed
[ERROR] [vite] Error: [safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED]
        {"count":91,"threshold":50,"targets":["...\node_modules\.vite\deps"]}
```

`.env`(或 `astro.config.mjs`)一变,`astro.config.mjs` 里的 `loadEnv()` 就使配置哈希改变 → Vite 重启并**重新预打包依赖** → 它要清空 `node_modules/.vite/deps`(91 个文件 > 阈值 50)→ **被安全删除守卫拦下** → 预打包中断,缓存留在「旧 `browserHash` + 新文件缺失」的不一致状态 → 页面引用的依赖 URL 返回 **HTTP 504 Outdated Optimize Dep** → 整条动态导入链失败 → React 从未水合,`useState(true)` 的初值就一直挂在页面上。

**这不是业务代码的 bug,不要为此改动组件。**

**诊断**:

```bash
# 页面引用的 ?v= 与 _metadata.json 的 browserHash 是否一致
grep -o '"browserHash": "[^"]*"' node_modules/.vite/deps/_metadata.json
curl -s http://localhost:4321/src/lib/auth-client.ts | grep '^import'
# 引用的依赖 URL 若返回 504,即命中此问题
```

**根治(推荐)**:让开发服务器的重新预打包能正常完成。**默认就这样启动**:

```bash
CODEBUDDY_SAFE_DELETE_ENABLED=0 pnpm dev
```

删除范围仅限 `node_modules/.vite`(可随时重建的缓存),不涉及任何源文件。正常开发机上不需要这个前缀 —— 它只为绕开受管沙箱的删除守卫。

**已坏掉时的急救**:

```bash
npx astro dev stop          # 必须用官方命令停,见 7.3
rm -rf node_modules/.vite
CODEBUDDY_SAFE_DELETE_ENABLED=0 pnpm dev
```

> - `astro dev --force` **不能**解决此问题 —— Astro 7 的 `--force` 清的是内容层(content layer)缓存,与 Vite 依赖缓存无关。
> - 浏览器侧可能已缓存失败的模块,修复后需硬刷新(Ctrl+Shift+R)。

### 7.2 `pnpm build` 报「大批量删除被拦截」

同一个守卫:`astro build` 会自建再删除 `dist/` 下的临时目录,单次删除文件数超过阈值(50)即被拒绝。**这不是代码问题。**

- `dangerouslyDisableSandbox` **无效** —— 守卫是以 Node shim 形式注入进程的,与沙箱开关无关。
- 绕开(删除范围限于 gitignore 的构建产物):

```bash
CODEBUDDY_SAFE_DELETE_ENABLED=0 pnpm build
```

### 7.3 开发服务器:不能重复启动,也不能按端口杀

Astro 7 会登记运行中的 dev server,重复启动会直接拒绝:

```
Another astro dev server is already running.
  URL: http://localhost:4321
  PID:  28924
Run `astro dev stop` to stop it, or use `astro dev --force` to replace it.
```

**注意**:按端口找 PID 再杀(如 `Get-NetTCPConnection`)只能杀掉持 socket 的子进程,**登记的进程仍在**,下次启动依然被拒。请用:

```bash
npx astro dev status   # 查看登记状态
npx astro dev stop     # 官方停服
```

---

## 8. 镜像发布

镜像推送到 GitHub Container Registry,脚本为 [`scripts/release.sh`](./scripts/release.sh)。

```bash
pnpm release                               # 自动生成时间戳标签:构建 → 打 latest → 推送两个标签
pnpm release --no-push                     # 只构建和打标签,不推送
pnpm release 20260930093000                # 使用指定标签
pnpm release --dry-run                     # 只打印将要执行的命令
```

**标签约定**:时间戳格式 `YYYYMMDDHHmmss`(**本地时间**),例如 `20260929231012`;外加一个浮动的 `latest`。

**推送顺序**:先推时间戳标签,`latest` 最后推。这样中途失败时,`latest` 仍指向上一个可用版本,不会出现「`latest` 已更新但对应版本没推上去」的空窗。

**前提**:需先 `docker login ghcr.io`(**凭据不要写进仓库或本文件**)。镜像目标平台为 `linux/amd64`,脚本默认带 `--platform linux/amd64`;用 `PLATFORM= pnpm release` 可改用构建机原生平台。

**注意**:

- 镜像构建自**当前工作区内容**,而非某个提交 —— 工作区有未提交改动时脚本会给出提示。发布前应确保所需改动已提交。
- 镜像能正常运行的前提是 [`astro.config.mjs`](./astro.config.mjs) 中的 `ssr.noExternal: true`(见第 4 节红线 3),不要为了让镜像变小而改动它。

---

## 9. 文档索引

| 文档                                                                 | 内容                      |
| ------------------------------------------------------------------ | ----------------------- |
| [`README.md`](./README.md)                                         | 快速开始与项目导航               |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)                   | 系统架构、核心模块、数据流、数据模型、环境变量 |
| [`docs/architecture.svg`](./docs/architecture.svg)                 | 分层架构图                   |
| [`docs/AI_DEV_WORKFLOW.md`](./docs/AI_DEV_WORKFLOW.md)             | AI 开发流程(需求 → 计划 → 开发)   |
| [`docs/templates/REQUIREMENT.md`](./docs/templates/REQUIREMENT.md) | 需求整理模板                  |
| [`docs/templates/DEV_PLAN.md`](./docs/templates/DEV_PLAN.md)       | 开发计划模板                  |

**文档同步原则**:代码改动若使架构文档失效,应在同一次变更中更新文档,不允许长期漂移。
