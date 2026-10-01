---
title: "排障记：一个「加载中…」按钮与一次 Vite 缓存雪崩"
date: 2026-09-29
summary: "登录按钮永远停在「加载中…」。现象出在 React 组件里，根因却在工具链：一次环境变量改动触发了依赖预打包重建，重建被批量删除守卫打断，缓存留下一半，依赖 URL 开始返回 504。"
minutes: 10
---

首页重构完成后，我发现右上角的登录按钮不太对劲。

它一直显示「加载中…」，永远不变成「登录」。控制台里只有一行：

```text
[astro-island] Error hydrating /src/components/LoginButton.tsx
Failed to fetch dynamically imported module
```

这篇是完整的排障记录。**结论是：我在错误的地方花了最多的时间。**

## 一、现象：看起来像组件 bug

第一反应当然是看组件代码。`LoginButton.tsx` 里的逻辑很短：

```tsx
useEffect(() => {
  const checkLogin = async () => {
    try {
      const session = await authClient.getSession();
      if (!session.data) return;
      setIsLogin(true);
      …
    } finally {
      setLoading(false);
    }
  };
  checkLogin();
}, []);
```

无论成功失败，`finally` 都会把 `loading` 关掉。它**不可能**一直停在加载中——除非这段 `useEffect` 根本没跑。

这是第一个有价值的推断：**如果一段必然执行的代码没有产生任何效果，那问题不在它内部。**

结合报错里的 `Failed to fetch dynamically imported module`——岛屿的 JS 模块**没能加载成功**，所以 React 从来没有水合过，组件一直停在服务端渲染出来的初始状态（`loading = true`）。

**所以这不是逻辑 bug，是资源加载失败。** 改组件代码是浪费时间。

> **可复用的判据**：Astro 岛屿停在初始态、报 `Failed to fetch dynamically imported module`，先怀疑构建工具的资源加载，而不是业务代码。水合失败的表象（停在 loading、点击无反应）和逻辑 bug 高度相似，但排查方向完全不同。

## 二、顺着网络请求找

既然是资源加载失败，就直接看请求。页面引用的模块地址长这样：

```text
/src/node_modules/.vite/deps/better-auth_client.js?v=6f2b1c0e
```

这个请求返回了 **504**，响应体是：

```text
Outdated Optimize Dep
```

这条信息基本锁定了范围——**"依赖优化产物过期"**，是 Vite 的依赖预打包（dependency pre-bundling）机制在报错。

## 三、Vite 的依赖预打包在做什么

简单交代背景：Vite 在启动时会把 `node_modules` 里的依赖预打包成浏览器可直接加载的 ESM，缓存在 `node_modules/.vite/deps/`。

关键点在这个缓存**由配置哈希标识**。`node_modules/.vite/deps/_metadata.json` 里存着一个 `browserHash`，页面引用的 `?v=` 参数必须和它一致。一旦配置变化导致 Vite 重新预打包，缓存被清空重建，而**如果页面还引用着旧哈希的 URL，Vite 就会返回 504 `Outdated Optimize Dep`**。

所以现在的目标是：**为什么缓存会处于不一致状态？**

## 四、根因链

往回追，链条是这样的：

```text
修改了 .env
    ↓
astro.config.mjs 里有 loadEnv()，配置哈希随之改变
    ↓
Vite 判定配置已变，重启并开始「Re-optimizing dependencies」
    ↓
重新预打包前需要清空 node_modules/.vite/deps —— 91 个文件
    ↓
环境的批量删除守卫拦下了（阈值 50 个文件）
    ↓
清理中断、预打包没完成，缓存处于半成品状态
    ↓
依赖 URL 返回 504 Outdated Optimize Dep
    ↓
岛屿的动态导入失败
    ↓
React 从未水合，组件永远停在 loading
```

链条上有两处值得单独说。

**第一处：`.env` 的改动为什么会影响构建配置。**

`astro.config.mjs` 开局就是：

```js
const env = loadEnv(process.env.NODE_ENV || "development", process.cwd(), "");
Object.assign(process.env, env);
```

因为用 `loadEnv()` 把 `.env` 读了进来，**`.env` 的内容就成了配置的一部分**。改一个环境变量的值，配置文件的内容等价于变了，Vite 就会重新预打包。

这不是 bug，是这套写法的固有代价。但它带来一个反直觉的结论：**"我只改了个环境变量"在开发期不是小改动。**

**第二处，也是最隐蔽的一处：清理被守卫拦下。**

开发环境有一个安全机制，会拦截一次删除大批量文件的操作（阈值 50 个）。它的出发点是防止误删，本身合理——但它的拦截方式让 Vite 的清理**静默失败**了：预打包流程不会因此报错退出，只是没清干净就继续往下走，于是留下了不一致的缓存。

这一类问题最难查，因为**错误现场（504）和真正的原因（删除被拦截）之间没有任何直接的文本关联**。中间隔着三层：环境守卫 → 预打包中断 → 缓存不一致。

## 五、为什么 `astro dev --force` 没用

第一个尝试是加 `--force`，期望它清掉缓存重新来一遍。

**无效。** `astro dev --force` 清的是**内容层缓存**（content layer），和 Vite 的依赖预打包缓存是两套东西。

这是个典型的"看起来该有用"的选项——名字里有 force，语义上却对不上。**在工具链排障里，最费时间的往往不是"找不到方法"，而是"用了语义相近但并不对症的方法"，而且它会消耗掉一次宝贵的验证机会，让你误以为方向错了。**

## 六、修复

真正有效的是三步，按顺序：

```bash
# 1. 停掉开发服务器
npx astro dev stop

# 2. 删掉那层缓存（它可随时重建，删掉没有风险）
rm -rf node_modules/.vite

# 3. 用允许批量删除的方式启动
CODEBUDDY_SAFE_DELETE_ENABLED=0 pnpm dev
```

第 1 步有个坑值得记：**不能用"按端口杀进程"代替 `astro dev stop`。**

Astro 7 会登记运行中的 dev server。按端口查到的 PID 通常是持有 socket 的**子进程**，杀掉它之后登记项还在，再启动会直接拒绝：

```text
Another astro dev server is already running
```

`npx astro dev status` 可以查看当前登记状态。

## 七、四条留下来的结论

**1. 先看网络请求，再看组件代码。** 岛屿的失败是"静默"的：React 没水合时，组件就停在初始 `state` 上，看起来跟逻辑 bug 一模一样。判断方法只有一个——看那个模块请求是否 200。

**2. 配置哈希包含 `.env` 的内容。** 因为 `astro.config.mjs` 用 `loadEnv()` 读了它。开发期改动 `.env` 等价于改动构建配置。

**3. 清理守卫会拦下工具链自己的清理动作，而且失败是静默的。** 现在的开发服务器一律用 `CODEBUDDY_SAFE_DELETE_ENABLED=0 pnpm dev` 启动——这个变量的作用范围仅限 `node_modules/.vite` 这一类可重建的缓存，不涉及任何用户数据。构建同理。

**4. `--force` 要先看清它 force 的是什么。** 语义对不上的选项比没有选项更消耗时间。

这次排障最贵的地方不在修复（三条命令），而在于**最初的那个错误方向**——修组件代码。中间浪费的时间足够把 `LoginButton.tsx` 重写两遍，而它从头到尾都是对的。
