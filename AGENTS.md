# AGENTS.md

> 本文件是本仓库的 **AI 协作入口规范**,对所有 AI 编码工具(Claude Code、Cursor、Copilot、Codex、WorkBuddy 等)一视同仁。  
> 任何 AI 在本仓库开始工作前,应先读完本文件;涉及架构变更时,再读 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。

---

## 1. 项目速览

**yxrhub.com** —— 基于 Astro 全栈架构的个人品牌枢纽站,提供个人主页渲染与统一账号体系(GitHub OAuth)。

| 维度  | 说明                                           |
| --- | -------------------------------------------- |
| 框架  | Astro `^7`(SSR / Node standalone 适配器)        |
| 交互  | React `^19` 岛屿(Islands),按需水合                 |
| 认证  | better-auth `^1.6` + Drizzle 适配器             |
| 数据  | PostgreSQL + drizzle-orm `^0.45`             |
| 语言  | TypeScript(strict)                           |
| 包管理 | **pnpm**(禁止使用 npm / yarn)                    |
| 部署  | Docker 多阶段构建,运行 `node dist/server/entry.mjs` |



---

## 2. 常用命令

```bash
pnpm install              # 安装依赖(首次,使用 frozen-lockfile 保持一致)
pnpm dev                  # 本地开发,默认 http://localhost:4321
pnpm build                # 生产构建,产出 dist/
pnpm preview              # 预览构建产物
pnpm astro check          # 类型与 Astro 语法检查(改完代码必跑)
pnpm drizzle-kit generate # 由 schema 生成迁移 SQL
pnpm drizzle-kit migrate  # 应用迁移
```

> 本地开发前,先从 `.env.example` 复制出 `.env` 并填齐变量,否则认证相关功能会直接抛错。

---

## 3. 目录职责

| 路径                  | 职责                             | 允许的改动               |
| ------------------- | ------------------------------ | ------------------- |
| `src/pages/`        | 路由与页面编排                        | 新增页面 / 接口           |
| `src/layouts/`      | 全局布局壳                          | 改 `<head>`、全局结构     |
| `src/components/`   | UI 单元(`.astro` 静态 / `.tsx` 交互) | 新增、抽离组件             |
| `src/content/`      | Markdown 内容源                   | **改文案优先改这里**        |
| `src/lib/`          | 服务端能力(认证、外部集成)                 | 谨慎,影响面大             |
| `src/db/schema/`    | 数据表结构                          | **必须走 drizzle-kit** |
| `src/middleware.ts` | 每请求会话注入                        | 谨慎                  |
| `docs/`             | 设计与流程文档                        | 与代码同步更新             |

**依赖方向**:`pages` → `layouts` / `components` → `lib` → `db`。**禁止反向依赖**,`lib` 与 `db` 不得 import 任何 UI 文件。

---

## 4. 架构红线(违反会直接导致线上故障)

1. **不要改 `src/db/schema/auth.ts` 的字段名。** 该结构是 better-auth 的数据契约,snake_case 列名即协议。
2. **不要删除 `middleware.ts` 中的 `context.isPrerendered` 短路分支。** 它规避了预渲染页面读取 headers 的告警与无意义查询。
3. **不要改动 `astro.config.mjs` 的 `ssr.noExternal: true`。** 这是「运行镜像不含 `node_modules`」的前提。引入原生模块库时必须重新评估并告知用户。
4. **新增 API 路由必须写 `export const prerender = false`。** 否则可能被静态化,拿不到请求上下文。
5. **React 组件不加水合指令就是静态 HTML。** 需要交互必须显式写 `client:load` / `client:idle` / `client:visible`。
6. **服务端密钥走 `process.env`(空前缀已加载);浏览器可读的变量必须用 `PUBLIC_` 前缀。** 不要把 `DATABASE_URL`、`*_SECRET` 暴露到客户端。
7. **`.env*` 与真实密钥永不写入仓库、日志或文档。**
8. **数据库变更只能通过修改 schema + `drizzle-kit generate`**,不手写 DDL、不手工改表。

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
| ⑤ 验证     | `pnpm astro check` + `pnpm build` + 手工验证 | 验证记录                                       |
| ⑥ 沉淀     | 更新文档 / 记录关键决策                            | 文档更新                                       |

模板位于 `docs/templates/`。

### 硬性规则

- **跳过阶段 ③ 是禁止的。** 计划未经用户确认,不得进入开发。
- **同一轮对话内的变更不要混入计划外的文件。** 计划外需求 → 回到阶段 ①。
- **不确定就问,不要猜。** 涉及密钥、域名、线上数据的操作,必须先确认。
- **提交粒度小**,一个提交解决一件事,提交信息写清「做了什么 + 为什么」。
- **改完必须验证。** 未跑 `astro check` 与 `build` 的改动不得声称「已完成」。
- 无法完成的验证要如实说明,并指出残留风险。

---

## 7. 文档索引

| 文档                                                                 | 内容                      |
| ------------------------------------------------------------------ | ----------------------- |
| [`README.md`](./README.md)                                         | 快速开始与项目导航               |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)                   | 系统架构、核心模块、数据流、数据模型、环境变量 |
| [`docs/architecture.svg`](./docs/architecture.svg)                 | 分层架构图                   |
| [`docs/AI_DEV_WORKFLOW.md`](./docs/AI_DEV_WORKFLOW.md)             | AI 开发流程(需求 → 计划 → 开发)   |
| [`docs/templates/REQUIREMENT.md`](./docs/templates/REQUIREMENT.md) | 需求整理模板                  |
| [`docs/templates/DEV_PLAN.md`](./docs/templates/DEV_PLAN.md)       | 开发计划模板                  |

**文档同步原则**:代码改动若使架构文档失效,应在同一次变更中更新文档,不允许长期漂移。
