---
title: "让站点认识我：GitHub 登录与身份层设计"
date: 2026-06-27
summary: "这个站的登录需求只有一句话：认出我自己。围绕它做的三个决定——不自己发明 session、把 schema 当作不可改的数据契约、主键从自增改成 UUID v7。"
minutes: 8
---

站点起步后的第一个功能是登录。

需求本身很窄：**认出我自己**。不开放注册，不做找回密码，不做邮件验证。后续所有需要"我是谁"的地方——显示管理入口、进后台、区分权限——都靠它。

小需求，但它是全站最不能出错的一层。身份判断错了，后面的权限就全是假的。

## 一、决定：不自己写认证

自研认证的诱惑在于"简单"：生成个随机 token，塞进 cookie，查表比对。几十行就写完了。

问题在于那几十行之外的部分：

- cookie 该怎么签名？用 `HttpOnly` + `Secure` + `SameSite`，但 `SameSite=Lax` 和 `None` 的差别在什么场景下会出事？
- 会话该多久过期？固定过期还是滑动续期？续期时怎么防止无限续期？
- OAuth 回调里的 `state` 参数是干什么的？不校验会怎样？
- 拿到 GitHub 返回的用户信息后，怎么保证是同一个人？

**每一环都有细节，写错一个就是越权或会话劫持。** 而这些细节不是"想清楚就能写对"的——它们需要靠大量真实攻击场景的积累。

所以这一层交给 better-auth。代价是要接受它的**数据契约**，这一点下面单独说。

## 二、把 schema 当作数据契约

接入 better-auth 时最需要理解的一件事：**数据库表的列名不是我的选择，是库的接口。**

`src/db/schema/auth.ts` 里定义的四张表——`user` / `session` / `account` / `verification`——字段名（`snake_case`）直接对应库内部的读写。把 `display_username` 改成 `displayName`，认证链路会**立刻失效**，而且失败方式往往不是报错，是"登录成功但拿不到用户名"这种更难查的症状。

于是这条被写成项目红线：

> `schema/auth.ts` 的列名是 better-auth 的数据契约，snake_case 不可改。

同时定下另一条：**数据库变更通过修改 schema 再用 `drizzle-kit push` 同步，不手写 DDL、不手工改表。** 让 schema 文件成为结构的唯一真相，`push` 只是把它落到库里。手工改表会让文件与库悄悄漂移，等到某天重新同步时才发现，那时已经很难判断哪个是对的。

> 关于为什么是 `push` 而不是迁移文件：本项目处于开发期、表结构变动频繁，**刻意不使用迁移机制**（仓库里没有 `drizzle/` 目录，库里也没有 `__drizzle_migrations` 表）。这是有意选择，不是遗漏。但走向生产库之前必须重新评估——对生产库直接 `push` 会改动结构而不留版本记录、没有回滚路径。

## 三、主键从自增改成 UUID v7

第一版用的是数据库自增整数。用了几天后换掉了，原因是三个很实际的考虑：

**1. 站点的身份 ID 会跑到 URL 里。** 一旦出现 `/user/3`，就等于对外公布了"这个站一共只有 3 个用户"，也让遍历变成了改一个数字的事。

**2. ID 不该由数据库独占生成。** 自增主键要求"先落库拿到 ID"才能用，这让"先在内存里构造一个对象、稍后再写库"变得别扭。UUID 可以在应用侧生成，对象在创建的那一刻就有身份。

**3. 索引性能。** 随机 UUID（v4）作为主键会导致 B-tree 索引的插入位置随机分布，页分裂严重。**UUID v7 是时间有序的**——前 48 位是毫秒时间戳——插入基本落在索引尾部，避开了这个问题，同时保留了 UUID 的不可猜测性。

落地方式是在 better-auth 的配置里接管 ID 生成：

```ts
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  plugins: [username()],
  advanced: {
    database: { generateId: () => v7() },
  },
});
```

这样 ID 由应用侧生成，不受具体数据库的 ID 机制约束。schema 里 `gen_random_uuid()` 的默认值保留着，只作为**兜底**——万一有代码路径绕过 better-auth 直接插入，也不会因为主键为空而失败。

## 四、登录态有两条通道

中间件负责把会话注入到服务端渲染的上下文：

```ts
if (context.isPrerendered) return next();   // 预渲染页面直接放行
const session = await auth.api.getSession({ headers: context.request.headers });
context.locals.user = session?.user ?? null;
context.locals.session = session?.session ?? null;
return next();
```

配合 `src/env.d.ts` 里的类型增强，页面里就能直接写 `Astro.locals.user` 并拿到补全：

```ts
declare namespace App {
  interface Locals {
    user: User | null;
    session: Session | null;
  }
}
```

客户端岛屿则走另一条通道：`authClient.getSession()`，浏览器发起请求，经 `/api/auth/get-session`。

**为什么要有两条？** 服务端渲染需要首屏就知道登录态（否则会出现"先显示未登录、闪一下再变成已登录"的跳变）；客户端交互后需要能刷新状态。两条通道最终读的是同一张 `session` 表，因此不会不一致。

上面那个 `isPrerendered` 短路分支当时只是顺手加的——静态页面读 `Astro.request.headers` 会触发警告，而且语义上也没有意义，所以提前返回。

但它在三个月后变成了一次真实事故的根因：**当页面需要权限守卫时，这个短路会让守卫被整个跳过。** 这条线要到后面的后台管理日志才会收尾。

## 五、踩过的坑：客户端插件要和服务端同名

better-auth 的插件需要在两边分别注册：

```ts
// 服务端 src/lib/auth.ts
plugins: [username()]

// 客户端 src/lib/auth-client.ts
plugins: [usernameClient()]
```

**只注册一边，症状是调用对应接口返回 404。** 因为客户端 SDK 是按已注册的插件来生成方法名与路径的，服务端不认这个路径就当成不存在的路由。这个失败方式不算直观——404 容易被理解成"路由没配对"，而不是"插件漏了"。

记住这条的实用价值是：**以后凡是出现"某个认证接口 404"，先检查两边插件是否一致，再去查路由。**

## 六、这一层的边界

回头看，"不自己造轮子"这个决定省下的不只是代码量，更是**验证成本**。自研方案即便当场写对了，也没法说明它面对会话固定、CSRF、回调重放这些攻击时是否成立；而用成熟库，这些是它已经被反复验证过的部分。

代价是接受它的约定：列名不能改、插件要两边一致、会话表的结构不能自由发挥。**这些约束换来的是"身份层可以不用再想"。** 对一个小站来说，这笔交易很划算。
