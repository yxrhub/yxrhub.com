# PLAN-20261001-blog-module

| 字段 | 内容 |
| --- | --- |
| 计划编号 | PLAN-20261001-blog-module |
| 关联需求 | REQ-20261001-blog-module |
| 制定日期 | 2026-10-01 |
| 状态 | 已确认 |

---

## 1. 方案概述

**用 Astro 7 的 Content Layer API 建立 `blog` 集合（Markdown 落盘），页面层只做两件事：按年分组的列表页与正文页；正文排版抽成一份全局共享样式，首页与博客共用。所有博客页面保持预渲染。**

## 2. 候选方案与取舍

### 2.1 内容存储与加载

| 方案 | 做法 | 优点 | 缺点 | 是否采用 |
| --- | --- | --- | --- | --- |
| A | Content Layer 集合：`src/content.config.ts` + `glob()` loader，md 落盘 | 有 schema 校验，frontmatter 写错在**构建期**报错；`getCollection()` 自动排序分页；零运行时依赖；与 Astro 官方路线一致 | 需要新建一个配置文件 | ✅ |
| B | 沿用首页的原始 md 导入（`import * as doc from "..."`） | 不引入新机制，与 `content/index.md` 一致 | 每篇文章都要手写 `import`，加一篇文章必须改代码；无 schema 校验 | ❌ |
| C | 外接 Headless CMS | 图形化写作 | 引入外部服务与依赖，与"数字空间自主可控"的定位相悖；本次规模完全不需要 | ❌ |

**选择理由**：方案 A 是本项目的正确位置——需求里"新增一篇 md 无需改任何 `.astro` 代码"这条验收标准，方案 B 结构性做不到。

### 2.2 正文排版的归属

| 方案 | 做法 | 优点 | 缺点 | 是否采用 |
| --- | --- | --- | --- | --- |
| A | 抽到 `src/styles/prose.css`，由 `Layout.astro` 全局引入，首页与博客共用一份 | 排版规则单一来源，后续加元素（表格/代码块）一处生效 | 需要改动首页，存在回归面 | ✅ |
| B | 博客页自己再写一份 `.prose` 样式，不动首页 | 首页零风险 | **同一套排版存在两份实现**，改一处忘一处，必然腐化 | ❌ |

**选择理由**：方案 B 的代价会随文章数量增长而放大。方案 A 的回归面是可控的——首页 `.prose` 目前只用到 `h1/h2/p/strong/em/a/ul/li/code`，本次只是把它们**原样迁移**并**补齐**首页没用到的元素；迁移后用无头浏览器截图逐像素比对首页，确认无回归。

## 3. 路由与数据设计

### 3.1 URL 结构

| 路径 | 文件 | 说明 |
| --- | --- | --- |
| `/blog` | `src/pages/blog/index.astro` | 列表页，按年分组，倒序 |
| `/blog/<YYYY-MM-DD>-<短名>` | `src/pages/blog/[slug].astro` | 正文页。`slug` 即内容集合条目的 `id`（相对文件名去扩展名），**单层路径**，因此用 `[slug]` 而非 `[...slug]` |

### 3.2 frontmatter schema

```ts
{
  title: string,          // 文章标题（正文页 h1 由它渲染，md 正文内不再写 h1）
  date: Date,             // 排序键。形如 2026-06-23，YAML 会解析为日期
  summary: string,        // 摘要，用于列表页与首页区块
  minutes?: number,       // 阅读时长（分钟），可选，展示用
}
```

> 正文页的 `<h1>` 来自 frontmatter 而非 Markdown，这样列表页、`<title>`、`og:title` 与正文页标题**同源**。

### 3.3 排序与相邻导航

- **排序**：`date` 倒序；同日期时以 `id` **倒序**兜底（保证稳定，不出现随机顺序，且同日几篇读起来同样是「新的在前」）。
- **相邻**：在"时间正序"数组上取相邻项——「上一篇」= 更早的一篇，「下一篇」= 更晚的一篇。

### 3.4 实施中的两处追加决策

| 项 | 决策 | 触发原因 |
| --- | --- | --- |
| 同日排序方向 | 兜底从 `id` 升序改为**倒序** | 端到端验证时发现升序会让一份「倒序列表」在同日内突然翻向，阅读方向不一致 |
| 中文加粗 | 只修正**闭合 `**` 左是标点、右是汉字**这一种（4 处，如 `**结论。**下一句`）；其余 12 处按启发式误判的改写**已全部回退** | 截图复核发现加粗未解析。**先用探针文章跑真机确定边界，再动手** —— 启发式判据报了 16 处，真问题只有 4 处。规则与校验脚本见 `AGENTS.md` 红线 13 / `ARCHITECTURE.md` 5.7 |

## 4. 影响文件清单

| 文件 | 改动性质 | 说明 |
| --- | --- | --- |
| `src/content.config.ts` | 新增 | 定义 `blog` 集合（`glob` loader + zod schema）。**这是内容集合的配置文件** |
| `src/content/blog/*.md` | 新增 | 7 篇开发日志 |
| `src/pages/blog/index.astro` | 新增 | 列表页，按年分组 |
| `src/pages/blog/[slug].astro` | 新增 | 正文页 + 上下篇导航 |
| `src/styles/prose.css` | 新增 | 共享正文排版（由 `Layout.astro` 引入） |
| `src/lib/blog.ts` | 新增 | 日志读取、排序、分组、日期与阅读时长格式化。页面不散落排序逻辑 |
| `astro.config.mjs` | 修改 | `markdown.shikiConfig` 配 Shiki 双主题 + `defaultColor: false` |
| `src/layouts/Layout.astro` | 修改 | 引入 `prose.css`；`Props` 增加 `description`（供正文页写摘要到 meta） |
| `src/components/Welcome.astro` | 修改 | 移除已迁出到 `prose.css` 的排版规则；新增「开发日志」区块 |
| `src/content/index.md` | 修改 | frontmatter 增加 `blog: { title, intro }`，首页区块文案仍走单一数据源 |
| `src/components/Header.astro` | 修改 | 导航新增「日志」 |
| `docs/ARCHITECTURE.md` | 修改 | 同步内容层、路由表、目录结构 |
| `AGENTS.md` | 修改 | 补充内容集合的约定（新增文章的正确姿势） |

> **明确不动**：`src/content/index.md` 的正文与既有 frontmatter 字段、`src/middleware.ts`、`src/db/`、`src/lib/`、`src/pages/admin/`。

## 5. 任务拆解

- [ ] **T1 内容集合** —— `src/content.config.ts`，`glob({ pattern: "**/*.md", base: "./src/content/blog" })` + schema；先放 1 篇占位文章验证集合可被读取，再删
- [ ] **T2 共享正文样式** —— 抽取 `src/styles/prose.css`（原样迁移首页规则 + 补齐 `h3/ol/pre/blockquote/table/hr`），`Layout.astro` 引入，`Welcome.astro` 删除重复规则；**截图比对首页无回归**
- [ ] **T3 列表页** —— `/blog`：按年分组、倒序、每项含标题/日期/摘要/阅读时长
- [ ] **T4 正文页** —— `/blog/[slug]`：`getStaticPaths` 由集合生成；标题/日期/摘要 + 正文 + 上下篇
- [ ] **T5 站点入口** —— Header 加「日志」；`index.md` frontmatter 加 `blog` 段；`Welcome.astro` 插入区块
- [ ] **T6 内容** —— 7 篇开发日志（见第 6 节）
- [ ] **T7 验证与收尾** —— `pnpm build`、无头浏览器验证（列表/正文/上下篇/首页/窄屏/暗色）、文档同步、提交

## 6. 内容清单（7 篇）

按真实提交时间线，标题与取材范围：

| # | 文件名 | 取材 |
| --- | --- | --- |
| 1 | `2026-06-24-project-kickoff.md` | 项目介绍、起步动机、目标与边界、第一版技术选型、架构总览 |
| 2 | `2026-06-27-identity-layer.md` | GitHub 登录、better-auth 接入、UUID v7 主键、schema 即数据契约 |
| 3 | `2026-07-01-container-release.md` | Dockerfile 多阶段构建、standalone 产物、"运行镜像只带 dist"、GHCR 发布脚本 |
| 4 | `2026-09-29-architecture-and-ai-workflow.md` | 补架构文档、确立 REQ→PLAN→确认→开发→验证 流程、把约定写成红线 |
| 5 | `2026-09-29-homepage-redesign.md` | 设计令牌、明暗双主题无 JS 切换、首页内容契约、`set:html` 作用域坑 |
| 6 | `2026-09-29-vite-cache-incident.md` | 排障记：岛屿卡在 loading、删除守卫、504 Outdated Optimize Dep、根因链 |
| 7 | `2026-10-01-admin-console.md` | admin 插件、角色精确匹配、预渲染页取不到 `locals.user`、封禁吊销会话、模拟登录 |

**写作纪律**：所有事实以仓库中的代码、文档与提交历史为准，**不编造未发生的过程**；不写密钥、真实连接串、内网地址与个人邮箱。

## 7. 风险与降级

| 风险 | 可能性 | 影响 | 应对 / 降级方案 |
| --- | --- | --- | --- |
| 抽取 `prose.css` 导致首页排版回归 | 中 | 中 | 迁移时**原样照抄**既有规则；改完用无头 Chrome 截图比对首页，发现差异立即回退规则而非"顺手调优" |
| 内容集合与既有 `src/content/index.md` 冲突 | 低 | 中 | `glob` 的 `base` 指向 `src/content/blog`，**不覆盖 `index.md` 所在层级**；T1 先验证集合读取正常再继续 |
| frontmatter 写错导致构建失败 | 中 | 低 | 这正是用 schema 的目的——构建期报错优于线上空白页；报错信息会指明文件与字段 |
| URL 中日期与 frontmatter `date` 不一致 | 低 | 低 | 文件名与 `date` 同源维护；本期 7 篇逐篇核对 |
| 文章披露实现细节带来安全风险 | 中 | 中 | 写作纪律中已明确禁止项；提交前逐篇复核是否出现凭据、内网地址、真实邮箱 |

## 8. 回滚方案

- **代码与内容**：`git revert` 对应提交即可。由于是**纯新增目录**（`src/pages/blog/`、`src/content/blog/`、`src/content.config.ts`、`src/styles/prose.css`），删除这四个路径即可完全还原。
- **必须一并还原的两处**：`src/components/Header.astro` 的「日志」导航项、`src/components/Welcome.astro` 的日志区块；否则会留下指向 404 的死链。
- **`prose.css` 的回退**：若首页出现回归且无法快速定位，把 `prose.css` 的内容贴回 `Welcome.astro` 的 `<style>`、移除 `Layout.astro` 的引入，博客页改为单独引入该样式文件即可——**不需要回退内容层**。
- **数据库**：本次不涉及任何数据库变更。

## 9. 验证方式

```bash
CODEBUDDY_SAFE_DELETE_ENABLED=0 pnpm build   # 构建通过(当前唯一强制校验关卡)
CODEBUDDY_SAFE_DELETE_ENABLED=0 pnpm dev     # 本环境必须带该变量
```

自动化验证（无头 Chrome + CDP）：

1. `/blog` 列表页：年份分组正确、文章倒序、无横向溢出
2. 正文页：标题/日期/摘要渲染、代码块与引用有样式、上下篇链接指向正确
3. 首篇无「上一篇」、末篇无「下一篇」（边界）
4. 不存在的 slug 返回 404
5. 首页：日志区块出现且为最新 3 篇；**与改动前截图比对，其余区块无回归**
6. 暗色模式（`Emulation.setEmulatedMedia`）下正文可读
7. 窄屏 375px 无横向溢出

手工验证：浏览器直接访问 `/blog` 与任意文章，点击导航「日志」与首页「查看全部」。

**实施结果**：自动化验证 32 项全部通过（含首页岛屿水合、首页其余区块无回归、列表分组与倒序、首末篇边界、暗色配色、窄屏 375px 溢出、7 篇文章无残留标记）；`pnpm build` 通过，7 篇文章与列表页均被预渲染。

## 10. 明确不做

见 REQ 3.2：标签、标签页、RSS、草稿、搜索、评论、分页、后台写作、多语言。
