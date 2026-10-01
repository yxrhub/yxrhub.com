# PLAN-20261001-admin-console

| 字段 | 内容 |
| --- | --- |
| 计划编号 | PLAN-20261001-admin-console |
| 关联需求 | REQ-20261001-admin-console |
| 制定日期 | 2026-10-01 |
| 状态 | 已确认 |

---

## 1. 方案概述

**启用 `better-auth` 的 `admin` 插件获取服务端强制的管理 API，在其之上用 React 岛屿实现单页 `/admin` 抽屉式界面；管理动作直接调用插件提供的 `/api/auth/admin/*`，不另建 API 层。**

## 2. 候选方案与取舍

### 2.1 整体技术路线

| 方案 | 做法 | 优点 | 缺点 | 是否采用 |
| --- | --- | --- | --- | --- |
| A | 启用 `admin` 插件，前端用 `adminClient` 直连官方端点 | 权限由插件在服务端强制；15 个端点开箱即用；与现有认证体系同源；代码量最小 | 需给 schema 加 5 个字段并迁移 | ✅ |
| B | 自建 `/api/admin/*` 路由，手写 SQL 与权限判断 | 完全可控 | 重复实现已成熟的逻辑；权限判断、会话校验、CSRF 都需自己保证，**引入权限漏洞的风险最高** | ❌ |
| C | 仅做只读用户列表（不动 schema） | 改动最小、零迁移风险 | 无法封禁 / 改角色 / 管会话，不满足"完整集" | ❌ |

**选择理由**：方案 A 的权限校验是插件内建且经过验证的（`adminMiddleware` 保证有会话 + `hasPermission({ role })` 保证是管理员），自建方案 B 等于把最容易出错的部分重写一遍。这是"不重复造轮子"的典型场景。

### 2.2 数据库同步策略（已确认）

**现状**：仓库无 `drizzle/` 目录，目标库中也不存在 `__drizzle_migrations` 表 —— 说明从未使用过迁移机制。

**已确认的做法**：使用 `drizzle-kit push` 直接对比 schema 与库并同步差异，**不产生迁移文件**。

**理由（用户明确说明）**：项目处于**开发期**，数据库结构变动频繁，刻意不做迁移；当前连接的是**开发库**而非生产库。因此"无迁移历史"是**有意选择，不是缺陷** —— 不要顺手去补迁移文件。

> ⚠️ **前置条件**：`push` 只适用于开发库。它改动结构时不留下版本记录，也没有回滚路径。
> **走向生产库之前必须重新评估**：届时需建立迁移基线并改用 `generate` + `migrate`。
>
> 本决策已同步写入 `AGENTS.md` 红线 8 与 `docs/ARCHITECTURE.md` 第 5.4 节 —— **这两处此前写的是 `drizzle-kit generate`，属错误约定，本次一并更正**。

## 3. 影响文件清单

| 文件 | 改动性质 | 说明 |
| --- | --- | --- |
| `src/db/schema/auth.ts` | 修改 | `user` 加 `role` / `banned` / `banReason` / `banExpires`；`session` 加 `impersonatedBy`。**既有字段一律不动** |
| `src/lib/auth.ts` | 修改 | `plugins` 注册 `admin()` |
| `src/lib/auth-client.ts` | 修改 | `plugins` 注册 `adminClient()` |
| `src/middleware.ts` | 修改 | 对 `/admin` 路径做服务端守卫 |
| `src/env.d.ts` | 修改 | 扩展 `App.Locals.user` 类型（含 `role` / `banned`） |
| `src/pages/admin/index.astro` | 新增 | 后台单页：SSR 外壳 + 岛屿挂载点 |
| `src/components/admin/AdminConsole.tsx` | 新增 | 主容器：搜索、分页、用户表格 |
| `src/components/admin/UserDrawer.tsx` | 新增 | 抽屉：资料 / 安全 / 会话 / 危险操作四段 |
| `src/components/admin/ConfirmDialog.tsx` | 新增 | 危险操作二次确认 |
| `src/components/admin/CreateUserDialog.tsx` | 新增 | 新建用户表单 |
| `src/components/admin/ImpersonationBanner.tsx` | 新增 | 模拟登录期间的常驻提示条 |
| `src/components/admin/types.ts` | 新增 | 共享类型（不引入 `any`） |
| `src/components/Header.astro` | 修改 | 管理员登录时显示「管理」入口 |
| `src/utils/authz.ts` | 新增 | `isAdmin(user)` 判定，供中间件与组件共用 |
| `docs/ARCHITECTURE.md` | 修改 | 同步认证模块、数据模型、新增数据流、ADR |
| `AGENTS.md` | 修改 | 更正红线 8：数据库变更走 `drizzle-kit push`（此前误写为 `generate`） |

## 4. 任务拆解

每步均为可独立验证、可独立提交的改动。**T1 是硬前置**——schema 未就绪就启用插件会直接运行时报错。

- [ ] **T1 数据层（硬前置）**
  - 先只读比对 `account` / `verification` 与 schema 是否一致，确保 `push` 只会产生"加列"这一种 diff
  - `user` 加 `role` / `banned` / `banReason` / `banExpires`；`session` 加 `impersonatedBy`
  - `pnpm drizzle-kit push` 同步到开发库
  - 验证：库中 5 个新列存在且可空；既有 1 行用户数据未受影响
- [ ] **T2 启用插件 + 引导首个管理员**
  - `auth.ts` 注册 `admin()`；`auth-client.ts` 注册 `adminClient()`
  - 按用户选定的方式手工提升首个管理员（`UPDATE "user" SET role='admin' WHERE email='<你的邮箱>'`）
  - 验证：`/api/auth/admin/list-users` 对管理员返回 200；换普通会话返回 403；未登录返回 401
- [ ] **T3 访问控制与页面骨架**
  - 中间件对 `/admin` 做服务端守卫；`isAdmin()` 工具函数
  - `/admin` 空壳页 + Header 入口
  - 验证：非管理员与未登录访问 `/admin` 均得 404；管理员可进入
- [ ] **T4 用户列表** —— 搜索（email/name/username）、分页、表格（头像 / 邮箱 / 用户名 / 角色 / 状态 / 注册时间）
- [ ] **T5 抽屉：资料编辑 + 角色变更** —— `name` / `username` / `displayUsername` / `email` / `emailVerified`；角色下拉
- [ ] **T6 封禁 / 解封** —— 原因 + 可选到期时间；**封禁成功后立即吊销该用户全部会话**
- [ ] **T7 会话管理** —— 列出某用户会话（IP / UA / 创建 / 到期 / 当前），吊销单个或全部
- [ ] **T8 模拟登录** —— `impersonate` / `stop-impersonating`，配常驻提示条
- [ ] **T9 设置密码 / 新建用户 / 删除用户** —— 均带二次确认
- [ ] **T10 安全自检 + 收尾** —— 自我操作防护、`pnpm build`、文档同步（`ARCHITECTURE.md` / `AGENTS.md`）

> T1–T5 完成后后台即可用（可查看与编辑资料）；T6–T9 逐项增强。

## 5. 数据与接口变更

| 类型 | 内容 | 是否需迁移 |
| --- | --- | --- |
| 数据库表 | `user` 加 `role`(text)、`banned`(boolean, default false)、`ban_reason`(text)、`ban_expires`(timestamp)；`session` 加 `impersonated_by`(text) | 是（用 `push` 同步） |
| 环境变量 | 无新增（首个管理员按用户选择手工提升，不引入 `ADMIN_EMAILS`） | — |
| 对外接口 | 新增 `/api/auth/admin/*`（由插件提供，服务端强制管理员权限） | — |

## 6. 风险与降级

| 风险 | 可能性 | 影响 | 应对 / 降级方案 |
| --- | --- | --- | --- |
| `push` 检出 schema 与库的意外差异（如已有漂移），产生破坏性语句 | 低 | 高 | T1 先只读比对四张表结构，确认无漂移再 `push`；`push` 会在执行前列出将要执行的语句，逐条核对 |
| **管理员自锁**：把自己降级/封禁/删除，导致无人可管理 | 中 | 高 | UI 禁用对自身的高危操作 + 服务端二次校验；同时保留一条手工 SQL 恢复路径并写入文档 |
| **封禁不立即生效**：插件只在 `session.create` 时检查 `banned` | 高 | 中 | 封禁流程中**强制**同时吊销该用户全部会话（T6 内含） |
| 模拟登录被滥用（以他人身份操作） | 低 | 高 | 仅管理员可用；界面常驻提示；不提供"模拟期间修改目标账号密码"的路径 |
| 误删用户不可恢复 | 低 | 高 | 删除需输入确认；文档建议"先封禁观察，再删除" |
| 无迁移记录，生产化时无处追溯结构演进 | 中 | 中 | 属既有的**有意选择**；上生产前建立迁移基线（已在 `AGENTS.md` 红线 8 与 `ARCHITECTURE.md` 5.4 标注） |

## 7. 回滚方案

- **代码**：`git revert` 对应提交即可（本次为纯新增页面 + 少量修改）。
- **数据库**：回退 `schema.ts` 中新增的字段后执行 `pnpm drizzle-kit push`，由 drizzle-kit 生成并执行 `DROP COLUMN`。也可直接手工执行（5 个新列全部可空，不触碰既有数据）：

```sql
ALTER TABLE "user"
  DROP COLUMN IF EXISTS role,
  DROP COLUMN IF EXISTS banned,
  DROP COLUMN IF EXISTS ban_reason,
  DROP COLUMN IF EXISTS ban_expires;
ALTER TABLE "session" DROP COLUMN IF EXISTS impersonated_by;
```

  > 代价：所有角色与封禁状态丢失（含首个管理员的 `role`），需重新提升。
- **未涉及迁移表**：本次不创建 `drizzle/` 目录，也不写入 `__drizzle_migrations`，因此没有迁移记录需要回滚。

## 8. 验证方式

```bash
pnpm build   # 构建通过(当前唯一强制校验关卡)
pnpm dev     # 手工验证(本环境需 CODEBUDDY_SAFE_DELETE_ENABLED=0)
```

手工验证步骤：

1. 用管理员账号登录 → 访问 `/admin`，确认可进入且列表渲染出当前用户
2. 退出登录 → 访问 `/admin`，确认返回 404
3. 用普通账号登录 → 访问 `/admin`，确认 404；并 `curl /api/auth/admin/list-users` 确认返回 403
4. 新建一个测试用户 → 编辑其资料 → 封禁（确认其会话被吊销且无法登录）→ 解封 → 模拟登录 → 退出模拟 → 设置密码 → 删除
5. 确认对自身的高危操作被禁用（改自己的角色 / 封禁自己 / 删除自己）
6. 复核 `AGENTS.md` 红线未被触碰：`schema/auth.ts` 既有字段名、`isPrerendered` 短路、`ssr.noExternal`

## 9. 明确不做

- 权限分级、操作审计、邮件、用户自助页面、头像上传、批量操作、数据导出（详见 REQ 3.2）
- 不引入 `ADMIN_EMAILS` 之类的环境变量白名单（用户已选择"手工提升首个管理员"）

## 10. 已确认的决策

- [x] **同步策略** → `drizzle-kit push`，不产生迁移文件（开发期刻意不用迁移；连的是开发库）
- [x] **数据备份** → 不需要
- [x] **非管理员访问 `/admin`** → 返回 **404**，不暴露后台存在
- [x] **首个管理员** → 当前唯一用户 `h***@yxrhub.com`（云下人叶小睿，GitHub 登录）
