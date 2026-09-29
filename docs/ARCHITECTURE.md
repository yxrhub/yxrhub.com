# yxrhub.com 系统架构与设计文档

> 版本：v1.0 ｜ 更新日期：2026-09-29 ｜ 适用范围：yxrhub.com 主站（Astro 全栈）

本文档描述 yxrhub.com 当前的技术架构、核心模块边界以及关键数据流。文档基于仓库现有代码梳理，是后续所有开发（人工或 AI）的事实依据。**代码变更后若与本文档不符，应先更新文档再合并代码。**

配套文件：

- 分层架构图（矢量图）：[`architecture.svg`](./architecture.svg)
- AI 开发流程：[`AI_DEV_WORKFLOW.md`](./AI_DEV_WORKFLOW.md)
- AI 协作规范：[`../AGENTS.md`](../AGENTS.md)

---

## 1. 项目定位

yxrhub.com 是「叶小睿 (Yxr)」个人品牌的**核心数字枢纽**，承担三个职责：

1. **品牌门面**：个人简介、数字足迹聚合（GitHub / X / YouTube / B 站 等）。
2. **认证底座**：为未来的子项目（Yxr Space、游戏官网等）提供统一的账号体系。
3. **能力试验场**：新技术（Astro SSR、Drizzle、better-auth）的落地验证。

当前处于**脚手架阶段**：已完成首页渲染 + GitHub 登录闭环，业务内容仍在 `src/content/index.md` 中以 Markdown 维护。

---

## 2. 技术栈总览

| 层次 | 技术选型 | 版本 | 职责 |
| --- | --- | --- | --- |
| 构建/框架 | Astro | ^7.0.2 | 页面渲染、路由、SSR 运行时 |
| 运行时适配 | `@astrojs/node` | ^11.0.0 | standalone 模式，输出独立 Node 服务 |
| 交互层 | React | ^19.2.7 | 客户端岛屿（Islands） |
| 认证 | better-auth | ^1.6.20 | OAuth / Session / 账号管理 |
| 认证桥接 | `@better-auth/drizzle-adapter` | ^1.6.20 | better-auth 与 Drizzle 的适配 |
| ORM | drizzle-orm | ^0.45.2 | 类型安全 SQL、Schema 定义 |
| 迁移工具 | drizzle-kit | ^0.31.10 | 生成/推送数据库迁移 |
| 数据库驱动 | `pg` (node-postgres) | ^8.22.0 | PostgreSQL 连接池 |
| 数据库 | PostgreSQL | 外部托管 | 持久化存储 |
| 主键生成 | `uuid` v7 | ^14.0.1 | 单调递增 UUID |
| 语言 | TypeScript | strict | 全量类型约束 |
| 包管理 | pnpm | 10 | 依赖管理与锁文件 |
| 容器 | Docker | node 24.18 alpine | 构建与运行镜像 |

**Node 版本要求**：`package.json` 声明 `>=22.12.0`；Docker 镜像使用 `node:24.18.0-alpine3.24`。

---

## 3. 目录结构

```
yxrhub.com/
├── src/
│   ├── assets/              # 参与构建的静态资源（SVG 图标、背景）
│   │   ├── astro.svg
│   │   └── background.svg
│   ├── components/          # 可复用 UI 单元
│   │   ├── Header.astro     # 站点头部（内嵌 LoginButton 岛屿）
│   │   ├── Footer.astro     # 站点页脚
│   │   ├── Welcome.astro    # 首页内容渲染（编译 content/index.md）
│   │   ├── GoogleTag.astro  # GA4 埋点（仅生产环境注入）
│   │   └── LoginButton.tsx  # React 岛屿：登录/注销
│   ├── content/
│   │   └── index.md         # 首页正文（Markdown 单一数据源）
│   ├── db/
│   │   └── schema/
│   │       └── auth.ts      # 数据库表结构（user/session/account/verification）
│   ├── layouts/
│   │   └── Layout.astro     # 全局布局壳（head/meta/背景/Header/Footer）
│   ├── lib/
│   │   ├── auth.ts          # better-auth 服务端实例（含 DB 连接）
│   │   └── auth-client.ts   # better-auth 浏览器端客户端
│   ├── pages/
│   │   ├── api/auth/[...all].ts  # 认证 API 全量兜底路由
│   │   └── index.astro      # 首页路由 /
│   ├── env.d.ts             # App.Locals 类型增强
│   └── middleware.ts        # 全局中间件：会话注入
├── public/                  # 不经构建、原样拷贝的资源
│   ├── favicon.ico
│   └── robots.txt
├── docs/                    # 设计与流程文档（本目录）
├── .env.example             # 环境变量样例
├── astro.config.mjs         # Astro 配置
├── drizzle.config.ts        # Drizzle Kit 配置
├── Dockerfile               # 多阶段容器构建
├── tsconfig.json            # TS strict + react-jsx
└── pnpm-workspace.yaml      # pnpm 工作区与构建白名单
```

**分层约定**：`pages` 只做路由与编排 → `layouts` / `components` 负责呈现 → `lib` 承载服务端能力（认证、外部集成）→ `db/schema` 描述数据。**禁止反向依赖**（`lib` 不得 import `components`）。

---

## 4. 架构总览

```mermaid
graph TB
    subgraph CLIENT["客户端层 (Browser)"]
        C1["静态 HTML / CSS"]
        C2["React 岛屿<br/>LoginButton (client:idle)"]
    end

    subgraph RUNTIME["应用层 · Astro SSR (Node standalone :4321)"]
        MW["middleware.ts<br/>会话注入 locals"]
        PAGES["pages/<br/>index.astro"]
        API["pages/api/auth/[...all].ts"]
        VIEW["layouts/ + components/<br/>+ content/index.md"]
    end

    subgraph SERVICE["服务模块层"]
        AS["lib/auth.ts<br/>better-auth server"]
        AC["lib/auth-client.ts<br/>better-auth client"]
    end

    subgraph DATA["数据访问层"]
        ORM["Drizzle ORM + drizzleAdapter"]
        PG[("PostgreSQL<br/>user / session<br/>account / verification")]
    end

    subgraph EXT["外部服务"]
        GH["GitHub OAuth"]
        GA["Google Analytics 4"]
    end

    C1 --> MW
    C2 --> AC
    AC --> API
    MW --> PAGES
    MW --> API
    PAGES --> VIEW
    VIEW --> C1
    API --> AS
    AS --> ORM
    ORM --> PG
    AS --> GH
    VIEW -.-> GA

    style CLIENT fill:#E6F1FB,stroke:#185FA5,color:#042C53
    style RUNTIME fill:#EEEDFE,stroke:#534AB7,color:#26215C
    style SERVICE fill:#E1F5EE,stroke:#0F6E56,color:#04342C
    style DATA fill:#FAEEDA,stroke:#854F0B,color:#412402
    style EXT fill:#F1EFE8,stroke:#5F5E5A,color:#2C2C2A
```

---

## 5. 核心模块

### 5.1 构建与运行时模块

| 文件 | 职责 |
| --- | --- |
| `astro.config.mjs` | 集成 React、挂载 Node standalone 适配器、配置 Vite |
| `package.json` | 脚本入口（`dev` / `build` / `preview`）、Node 版本约束 |
| `Dockerfile` | 两阶段构建：`dist` 阶段编译，运行阶段仅携带 `dist` |
| `tsconfig.json` | 继承 `astro/tsconfigs/strict`，`jsx: react-jsx` |

**关键实现与约束**：

- **SSR 模式**：`adapter: node({ mode: 'standalone' })`，构建产物为 `dist/server/entry.mjs`，由容器直接 `node` 启动，**不依赖** `node_modules`。
- **生产依赖内联**：`vite.ssr.noExternal = true`（仅生产）把依赖打包进产物，这是「运行镜像只拷贝 `dist`」成立的前提。**若新增原生模块（如带二进制绑定的库），必须重新评估该策略。**
- **环境变量加载**：通过 `loadEnv(..., '')` 把**所有**前缀的环境变量写入 `process.env`（不同于 Vite 默认只加载 `VITE_` 前缀），保证 `lib/auth.ts` 在服务端能直接读取 `DATABASE_URL` 等敏感变量。
- **开发域名白名单**：`vite.server.allowedHosts = ['yxrhub.com']`，使用其他域名/隧道访问时需同步追加。

### 5.2 页面与渲染模块（Astro 岛屿架构）

| 文件 | 职责 |
| --- | --- |
| `src/pages/index.astro` | 首页路由，组合 Layout + Welcome |
| `src/layouts/Layout.astro` | 全局壳：`<head>` 元信息、SEO、背景图、Header/Footer 插槽 |
| `src/components/Welcome.astro` | 读取并编译 `content/index.md`，输出 HTML |
| `src/components/Header.astro` | 头部导航 + 挂载登录岛屿 |
| `src/components/Footer.astro` | 版权与外链 |
| `src/components/GoogleTag.astro` | GA4 埋点脚本 |
| `src/components/LoginButton.tsx` | React 岛屿，交互式登录/注销 |

**关键实现与约束**：

- **内容与视图分离**：首页正文全部写在 `src/content/index.md`，由 `Welcome.astro` 通过 `import * as index from "../content/index.md"` + `await index.compiledContent()` 在服务端编译为 HTML。**改文案 = 改 Markdown，不要动组件。**
- **岛屿水合边界**：只有 `LoginButton.tsx` 是客户端组件，且使用 `client:idle`（浏览器空闲后再水合），保证首屏不被 JS 阻塞。Header 中的写法为 `<LoginButton client:idle />`。
- **埋点仅生产环境**：`Layout.astro` 中通过 `import.meta.env.PROD && <GoogleTag/>` 条件渲染，避免开发环境污染统计数据。
- **静态资源两类**：需要构建优化（哈希、压缩）放 `src/assets/` 并用 `import` 引用；需要原样对外（favicon、robots.txt）放 `public/`。

### 5.3 认证模块

| 文件 | 职责 |
| --- | --- |
| `src/lib/auth.ts` | 服务端认证实例：建 DB 连接、装配 adapter 与插件 |
| `src/lib/auth-client.ts` | 浏览器端客户端，供 React 岛屿调用 |
| `src/pages/api/auth/[...all].ts` | 全量认证 API 入口，转发给 `auth.handler` |

**服务端实例要点**（`src/lib/auth.ts`）：

```ts
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  baseURL: BETTER_AUTH_URL,
  socialProviders: { github: { clientId, clientSecret } },
  plugins: [username()],
  advanced: { database: { generateId: () => v7() } },
});
```

- **适配器**：`drizzleAdapter` 直连 `drizzle(DATABASE_URL)`，表结构由 `src/db/schema/auth.ts` 提供。
- **插件**：`username()` 启用用户名注册/登录（对应表中 `username`、`displayUsername` 字段）。
- **主键策略**：全局覆写为 **UUID v7**，单调递增，索引局部性优于 v4。注意 `db/schema/auth.ts` 中列默认值是 `gen_random_uuid()`（v4），仅作为数据库兜底——**正常写入路径均由 better-auth 生成 v7**。
- **Base URL**：必须与部署域名一致（`BETTER_AUTH_URL`），否则 OAuth 回调地址会错。

**客户端实例要点**（`src/lib/auth-client.ts`）：`createAuthClient` 需注册与服务端**同名**的插件（`usernameClient()`），否则调用对应 API 会 404。客户端不接收任何密钥。

**API 路由要点**（`src/pages/api/auth/[...all].ts`）：`export const prerender = false` 强制该路由走 SSR；`ALL` 处理器把原始 `Request` 直接交给 `auth.handler`，不在 Astro 层做任何加工，保证 better-auth 全量端点（`sign-in/social`、`callback/*`、`sign-out`、`get-session` 等）开箱可用。若未来需要限流，注释中提示应设置 `x-forwarded-for`。

### 5.4 数据访问模块

| 文件 | 职责 |
| --- | --- |
| `src/db/schema/auth.ts` | 表定义与关系（relations） |
| `drizzle.config.ts` | 迁移输出目录 `./drizzle`、schema 目录、PostgreSQL dialect |

**数据模型（ERD）**：

```mermaid
erDiagram
    user ||--o{ session : "拥有"
    user ||--o{ account : "拥有"

    user {
        uuid id PK
        text name
        text email UK
        boolean email_verified
        text image
        text username UK
        text display_username
        timestamp created_at
        timestamp updated_at
    }
    session {
        uuid id PK
        text token UK
        timestamp expires_at
        text ip_address
        text user_agent
        uuid user_id FK
    }
    account {
        uuid id PK
        text account_id
        text provider_id
        uuid user_id FK
        text access_token
        text refresh_token
        text id_token
        text password
    }
    verification {
        uuid id PK
        text identifier
        text value
        timestamp expires_at
    }
```

**要点**：

- 四张表由 better-auth 的数据契约决定，**字段名（snake_case）不可随意改动**，否则认证链路直接失效。
- 外键均带 `onDelete: "cascade"`：删除用户即级联清理 session / account。
- 已建索引：`session.userId`、`account.userId`、`verification.identifier`。
- 迁移流程：修改 `src/db/schema/` → `pnpm drizzle-kit generate` → 审核生成的 SQL → `pnpm drizzle-kit migrate/push`。**不要手写 DDL 绕过 drizzle-kit。**
- `drizzle/` 目录为迁移产物，当前未纳入仓库，首次生成后建议提交以便环境可复现。

### 5.5 中间件模块

`src/middleware.ts` 是**每个 SSR 请求的必经之路**：

```ts
if (context.isPrerendered) return next();   // 预渲染页面直接放行
const isAuthed = await auth.api.getSession({ headers: context.request.headers });
context.locals.user = isAuthed?.user ?? null;
context.locals.session = isAuthed?.session ?? null;
return next();
```

- **预渲染短路**：`context.isPrerendered` 分支是刻意保留的修补——静态页面访问 `Astro.request.headers` 会触发警告且语义无意义，因此提前 return。**新增预渲染页面时依赖此分支，不要删除。**
- **类型契约**：`src/env.d.ts` 通过 `declare namespace App { interface Locals }` 把 `user` / `session` 注入 Astro 的 `locals` 类型，页面中可直接 `Astro.locals.user` 并获得补全。
- **性能注意**：中间件对**所有** SSR 请求（含静态资源类路由）都会查一次 session。当前站点访问量小可接受；若路由数量增长，应按路径前缀做条件跳过。

---

## 6. 核心数据流

### 6.1 页面请求（SSR 渲染）

```mermaid
sequenceDiagram
    participant B as 浏览器
    participant A as Astro SSR (Node)
    participant M as middleware.ts
    participant D as PostgreSQL

    B->>A: GET /
    A->>M: onRequest(context)
    M->>D: getSession(headers)
    D-->>M: session + user (或 null)
    M->>M: context.locals.user/session = ...
    M-->>A: next()
    A->>A: Layout → Header/Footer → Welcome
    A->>A: content/index.md → compiledContent()
    A-->>B: HTML (含岛屿占位)
    B->>B: 空闲时水合 LoginButton
    B->>A: GET /api/auth/get-session (岛屿内)
    A-->>B: 登录态
```

### 6.2 GitHub OAuth 登录（核心闭环）

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant L as LoginButton (岛屿)
    participant API as /api/auth/[...all]
    participant BA as better-auth
    participant GH as GitHub
    participant DB as PostgreSQL

    U->>L: 点击「使用 GitHub 登录」
    L->>API: authClient.signIn.social({ provider: "github" })
    API->>BA: auth.handler(request)
    BA-->>U: 302 重定向至 GitHub 授权页
    U->>GH: 授权应用
    GH-->>API: 回调 /api/auth/callback/github?code=...
    API->>BA: 转发
    BA->>GH: 用 code 换取 access_token
    GH-->>BA: 用户信息 (id / name / email / avatar)
    BA->>DB: upsert user + account
    BA->>DB: 创建 session (UUID v7, 带 expiresAt)
    BA-->>U: Set-Cookie (session token) + 回跳首页
    U->>L: 页面水合后 getSession()
    L->>API: GET /api/auth/get-session
    API-->>L: { user, session }
    L->>L: 渲染头像 + 昵称 + 「注销登录」
```

**注销**：`authClient.signOut()` → 服务端删除 session 记录并清 Cookie。

### 6.3 会话校验路径

| 场景 | 入口 | 说明 |
| --- | --- | --- |
| 服务端渲染 | `middleware.ts` | 一次 DB 查询，结果写入 `Astro.locals` |
| 客户端岛屿 | `authClient.getSession()` | 浏览器发起请求，经 `/api/auth/get-session` |
| API 路由 | `auth.handler` 内部 | better-auth 自行校验，不依赖中间件 |

**双通道设计的原因**：SSR 需要首屏即知登录态（SEO / 避免闪烁），而岛屿需要交互后刷新状态。两者最终读同一张 `session` 表，因此不会不一致。

### 6.4 构建与部署

```mermaid
graph LR
    A["git push"] --> B["Docker build"]
    B --> C["dist 阶段<br/>pnpm install --frozen-lockfile"]
    C --> D["pnpm build<br/>产出 dist/"]
    D --> E["运行阶段<br/>仅 COPY dist"]
    E --> F["node dist/server/entry.mjs<br/>HOST=0.0.0.0 PORT=4321"]
```

- 基础镜像 `node:24.18.0-alpine3.24`；pnpm 通过 `npm i -g pnpm@10`（走 npmmirror 源）安装，未启用 corepack。
- 构建阶段挂载 pnpm store 缓存（`--mount=type=cache`）以加速重复构建。
- 运行阶段**不携带** `node_modules`——依赖已在构建期被内联进 `dist`（见 5.1）。

---

## 7. 配置与环境变量

来源：`.env.example`；`.env` / `.env.production` 已被 `.gitignore` 排除。

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL 连接串，如 `postgresql://user:pass@host:5432/db` |
| `BETTER_AUTH_SECRET` | ✅ | 签名密钥，生成方式：`openssl rand -base64 32` |
| `BETTER_AUTH_URL` | ✅ | 站点根地址，本地 `http://localhost:4321`，生产为正式域名 |
| `GITHUB_CLIENT_ID` | ✅ | GitHub OAuth App 的 Client ID |
| `GITHUB_CLIENT_SECRET` | ✅ | GitHub OAuth App 的 Client Secret |

**安全红线**：`.env*` 永不入库；密钥只通过容器/平台环境变量注入；任何文档、日志、截图不得出现真实密钥值。

**新增环境变量的流程**：`.env.example` 补一行注释与占位 → 代码中通过 `process.env.XXX` 读取 → 同步更新本表。由于配置使用空前缀加载，变量无需 `VITE_` 前缀；但若要暴露给浏览器，必须走 `import.meta.env.PUBLIC_*` 前缀，避免误泄服务端密钥。

---

## 8. 架构约束（设计决策记录）

| 编号 | 决策 | 理由 | 违反后果 |
| --- | --- | --- | --- |
| ADR-01 | 采用 Astro SSR 而非纯静态站 | 需要服务端会话与动态内容 | 丢失登录态能力 |
| ADR-02 | 认证委托 better-auth，不自研 | 避免 OAuth/Session 安全细节踩坑 | 安全风险与重复造轮子 |
| ADR-03 | 主键统一 UUID v7 | 单调递增、无中心依赖、索引友好 | 索引碎片、排序错乱 |
| ADR-04 | 交互一律走 React 岛屿，`client:idle` | 首屏性能优先 | 首屏阻塞 |
| ADR-05 | 生产 `ssr.noExternal: true` | 运行镜像不带 `node_modules` | 容器启动报模块缺失 |
| ADR-06 | 中间件预渲染短路 | 规避 headers 警告与无意义查询 | 构建告警、性能损耗 |
| ADR-07 | 文案存 Markdown，不进组件 | 内容/视图分离，便于非技术编辑 | 文案散落、维护困难 |
| ADR-08 | 表结构由 better-auth 契约决定 | 保证认证链路稳定 | 登录直接失效 |

---

## 9. 扩展指南

### 新增页面

1. 在 `src/pages/` 新建 `.astro` 文件（文件名即路由，如 `blog.astro` → `/blog`）。
2. 用 `<Layout>` 包裹，复用 Header / Footer。
3. 若需登录态：`Astro.locals.user`（中间件已注入）。
4. 若该页无需登录态且内容静态，可加 `export const prerender = true` 走静态生成。

### 新增 API 接口

1. 在 `src/pages/api/` 新建文件，路由同文件路径。
2. 显式写 `export const prerender = false`，否则可能被静态化。
3. 导出 `GET` / `POST` / `ALL` 等 `APIRoute`；需要身份时读 `auth.api.getSession`，不要信任客户端传参。

### 新增数据表

1. 在 `src/db/schema/` 新建或扩展 schema 文件，使用 `pgTable` 并**补充 `relations`**。
2. 运行 `pnpm drizzle-kit generate` 生成迁移，人工审核 SQL。
3. 需要被业务层直接使用时，从 `lib/` 下暴露查询函数，不要在页面里直连 ORM。

### 新增第三方登录

1. 在 GitHub OAuth App 中登记回调地址。
2. `src/lib/auth.ts` 的 `socialProviders` 增加 provider 配置与对应环境变量。
3. `.env.example` 同步补充，更新本文第 7 节。
4. 前端 `authClient.signIn.social({ provider: "xxx" })` 即可复用现有按钮逻辑。

### 新增 React 岛屿

1. 文件放 `src/components/`，`.tsx` 后缀。
2. 引用时必须显式声明指令：`client:load` / `client:idle` / `client:visible`，**默认不加指令就等于静态 HTML**。
3. 浏览器可用的密钥/地址必须来自 `import.meta.env.PUBLIC_*`。

---

## 10. 已知技术债与演进方向

| 项 | 现状 | 建议 |
| --- | --- | --- |
| 无自动化测试 | 无 test 脚本、无 CI | 至少补 `astro check` + 构建校验的 CI 流水线 |
| 无代码风格工具 | 缺少 ESLint / Prettier 配置 | 引入统一的 lint + format，防止风格漂移 |
| 迁移目录未入库 | `drizzle/` 未提交 | 首次生成后纳入版本控制 |
| 探活缺失 | 容器无 healthcheck | Dockerfile 增加 `HEALTHCHECK`，便于编排 |
| 中文注释混排 | 部分源码中文注释 | 保持现状即可，但对外文档建议统一中文 |
| README 过薄 | 曾仅一行标题 | 已补充快速开始与文档索引 |
| 业务内容单页 | 仅首页 | 后续按「多语言博客 + 数字花园」演进，届时需引入内容集合（Content Collections） |
