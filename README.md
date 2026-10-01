# yxrhub.com

> 叶小睿 (Yxr) 的个人品牌枢纽站 —— 数字足迹的聚合入口,也是 Yxr Space 与《云下人:无限世界》的统一账号底座。

基于 **Astro 全栈架构**构建:服务端渲染保证首屏与 SEO,React 岛屿承载交互,`better-auth` 提供统一认证。

---

## 技术栈

| 层次 | 选型 |
| --- | --- |
| 框架 | Astro `^7`(SSR / Node standalone 适配器) |
| 交互 | React `^19` 岛屿(Islands) |
| 认证 | better-auth `^1.6`(GitHub OAuth + 用户名插件) |
| 数据 | PostgreSQL + drizzle-orm `^0.45` / drizzle-kit |
| 语言 | TypeScript(strict) |
| 包管理 | pnpm 10 |
| 部署 | Docker 多阶段构建 |

---

## 当前功能

- ✅ 首页渲染 —— 正文由 `src/content/index.md` 驱动
- ✅ GitHub OAuth 登录 / 注销 —— 完整会话闭环
- ✅ 全局中间件注入登录态(`Astro.locals.user`)
- 🚧 多语言技术博客、数字花园 —— 规划中

---

## 快速开始

**环境要求**:Node.js `>= 22.12.0`、pnpm 10、可访问的 PostgreSQL 实例。

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env
#   按需填写 DATABASE_URL / BETTER_AUTH_SECRET / BETTER_AUTH_URL
#   / GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET

# 3. 初始化数据库(首次)
pnpm drizzle-kit push

# 4. 启动开发服务器
pnpm dev          # http://localhost:4321
```

### 常用脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 生产构建,产出 `dist/` |
| `pnpm preview` | 预览构建产物 |
| `pnpm release` | 构建并发布容器镜像到 GHCR |
| `pnpm drizzle-kit push` | 将 schema 变更同步到数据库 |

> 类型检查需先安装 `pnpm add -D @astrojs/check typescript`,之后可使用 `pnpm astro check`。

---

## 目录结构

```
src/
├── components/    # UI 单元:Astro 静态组件 + React 岛屿
├── content/       # Markdown 内容源(改文案优先改这里)
├── db/schema/     # 数据库表结构
├── layouts/       # 全局布局壳
├── lib/           # 服务端能力:认证、外部集成
├── pages/         # 路由:页面与 API
├── middleware.ts  # 每请求会话注入
└── env.d.ts       # locals 类型增强
```

完整的模块职责、数据流与数据模型见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。

---

## 部署

生产环境通过 Docker 多阶段构建,运行阶段仅携带 `dist/`(依赖已在构建期内联):

```bash
docker build -t yxrhub .
docker run -p 4321:4321 --env-file .env.production yxrhub
# 入口:node ./dist/server/entry.mjs,监听 HOST=0.0.0.0 PORT=4321
```

生产环境务必设置 `BETTER_AUTH_URL` 为正式域名,否则 OAuth 回调地址会不匹配。

### 发布到 GHCR

仓库自带发布脚本,自动生成时间戳标签并推送 `latest`:

```bash
docker login ghcr.io     # 首次需要
pnpm release             # 构建 → 打 latest → 推送 ghcr.io/yxrhub/yxrhub.com:{时间戳,latest}
```

支持 `--no-push`(只构建)、`--dry-run`(只打印命令)、以及传入自定义标签。细节见 [`AGENTS.md`](./AGENTS.md) 第 8 节。

---

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [`AGENTS.md`](./AGENTS.md) | **AI 协作规范**(所有 AI 工具入口)与架构红线 |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | 系统架构、核心模块、数据流、设计决策 |
| [`docs/architecture.svg`](./docs/architecture.svg) | 分层架构图 |
| [`docs/AI_DEV_WORKFLOW.md`](./docs/AI_DEV_WORKFLOW.md) | AI 开发流程:需求 → 计划 → 确认 → 开发 → 验证 |
| [`docs/templates/`](./docs/templates/) | 需求整理与开发计划模板 |

---

## 参与开发

本项目采用 **「先整理需求,再制定计划,确认后开发」** 的流程。动手前请先阅读:

1. [`AGENTS.md`](./AGENTS.md) —— 项目约定与不可违反的架构红线
2. [`docs/AI_DEV_WORKFLOW.md`](./docs/AI_DEV_WORKFLOW.md) —— 完整流程与模板

---

© 2025-2026 YxrHub. Powered by [Astro](https://astro.build). Designed for the YxrSpace Universe.
