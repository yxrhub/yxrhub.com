---
title: "从 Dockerfile 到 GHCR：让发布变成一条命令"
date: 2026-07-01
summary: "一个 SSR 应用要怎么打包成镜像？一次「配置决定 Dockerfile 形态」的连锁推导，以及一个把时间戳标签与 latest 指针分开处理、中途失败也不会把线上指坏的发布脚本。"
minutes: 8
---

前一篇提到，这个站选的是 Node standalone SSR，不是纯静态托管。这意味着上线不能只上传一个文件夹——需要一个能跑 Node、能连数据库、Node 版本确定的运行环境。

镜像负责这件事。这篇记录 Dockerfile 的推导过程，以及后来把它包成一条命令时踩到的坑。

## 一、镜像里到底要装什么

第一版直觉是"把整个项目 COPY 进去，`pnpm install`，然后跑起来"。但那样镜像里会有源码、全量 `node_modules`、构建缓存，一个站点镜像能到 1GB 以上，而且把源码一起发布出去了。

想要的是：**运行阶段只带构建产物。**

于是多阶段构建：

```dockerfile
FROM node:24.18.0-alpine3.24 AS base
WORKDIR /app

FROM base AS dist
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
RUN npm install -g pnpm@10 --registry=https://registry.npmmirror.com
COPY . /app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM base
COPY --from=dist /app/dist /app/dist
ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
```

关键在于最后两行：**运行阶段只有 `/app/dist`，没有 `node_modules`。** 它是怎么跑起来的？

## 二、一条容易忽略的因果链

答案在 `astro.config.mjs` 里：

```js
vite: {
  ssr: {
    // 打包外部依赖，不依赖 node_modules 即可运行
    noExternal: isProd ? true : undefined,
  },
},
```

`noExternal: true` 表示 SSR 构建时**把外部依赖一起打包进产物**，而不是留成 `require("express")` 这样的外部引用。

因果链是这样的：

```
ssr.noExternal: true（生产）
    ↓ 依赖被 bundle 进 dist/
dist/ 里不再有对外部包的 import
    ↓
运行阶段不需要 node_modules
    ↓
Dockerfile 运行阶段只需 COPY dist
    ↓
镜像体积小、不含源码、启动路径固定为 dist/server/entry.mjs
```

**这是一个"配置决定了 Dockerfile 形态"的例子。** 如果哪天有人觉得 `noExternal` 碍事把它关掉，构建不会报错、本地 `pnpm dev` 也不会有任何异常——但镜像会在启动时找不到模块。所以它被写进了项目红线：

> `astro.config.mjs` 的 `ssr.noExternal: true`（生产）不可动，这是「运行镜像只带 `dist`」的前提。

这条红线的价值不在于限制，而在于**它记录了那个不可见的依赖关系**。下次有人想动它时，至少能知道要一起改什么。

顺带一提，Dockerfile 里的 `pnpm install` 用了 BuildKit 的缓存挂载：

```dockerfile
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
```

`/pnpm/store` 是 pnpm 的全局内容寻址仓库，挂成缓存后重复构建不必重新下载。这一行让反复构建从几分钟降到十几秒。

## 三、把发布包成一条命令

镜像能构建了，但发布还有一串手工步骤：打时间戳、打 latest、推两个标签、确认平台。手动做的结果一定是忘其中一步。

于是有了 `scripts/release.sh`。它做了一件在我看来最有价值的设计——**区分「不可变标签」与「移动指针」**：

```bash
# 先推时间戳标签——latest 是"移动指针",放在最后推,
# 这样一旦中途失败,latest 仍指向上一个可用版本。
run docker push "$TARGET"     # ghcr.io/yxrhub/yxrhub.com:20260930093000
run docker push "$LATEST"     # ghcr.io/yxrhub/yxrhub.com:latest
```

如果反过来先推 `latest`，那么在一次"推到一半网络断了"的事故里，`latest` 已经指向了新版本，而新版本的层可能没推完。**推送顺序本身就是一种容错设计**：任何中途失败，线上指针都还停在旧版本上。

另外两个细节也是从实际使用中长出来的：

- **工作区脏的时候给出提示**。脚本会在构建前检查 `git status --porcelain`，有未提交改动就警告"镜像将包含这些内容，而非某个提交的状态"，同时打印当前 commit。镜像打出来了但说不清对应哪份代码，是很难查的问题。
- **远端标签已存在时警告**。时间戳精度到秒，理论上不会重复，但指定标签时可能会撞上。撞上就意味着**覆盖一个已发布的版本**，值得先问一句。

## 四、平台参数不是可选项

脚本默认 `--platform linux/amd64`。

服务器是 x86，而开发机可能是 ARM（Apple Silicon）或 Windows。不指定平台时，Docker 会按**构建机**的架构出镜像，推上去之后容器会在服务器上以 `exec format error` 启动失败——一个看起来和代码毫无关系的报错。

```bash
PLATFORM="" bash scripts/release.sh   # 显式用构建机原生平台
```

默认值选择服务器架构，而不是"跟随构建机"，是因为**发布的目标环境是确定的那一个**。本地想快速验证时才手动置空。

## 五、在 Windows 下调用容器的一个坑

有个与镜像无关但值得记一笔的问题：在 Git Bash 里执行 `docker run` 时，以 `/` 开头的路径参数会被 MSYS **自动转换成 Windows 路径**。

比如想挂载容器内的 `/app/dist`，Git Bash 可能把它改写成一个 `C:\...` 形式的路径，于是容器里根本找不到目标。表现是"命令看起来完全正确，但目录是空的"。

解法是给这一条命令关掉转换：

```bash
MSYS_NO_PATHCONV=1 docker run ... 
```

**规则可以记成：Git Bash 里凡是把 Unix 风格路径传给 Windows 可执行文件的场景，都要考虑这层转换。** 它不限于 Docker，只是 Docker 是最容易撞上的地方。

## 六、发布应该无聊

做完这些之后，发布变成：

```bash
pnpm release
```

一条命令，产出：一个时间戳标签、一个 `latest`，推到 GHCR。失败也不会把线上指坏。

我越来越觉得，**部署环节的设计目标不是"强大"，而是"无聊"**——没有可选项要临场决定，没有需要记住的顺序，没有"这次特殊所以手工来一下"。所有判断都提前写进脚本里了，执行的时候只需要按回车。

---

*附：脚本支持 `--dry-run`（只打印将要执行的命令）和 `--no-push`（只构建不推送），这两个开关在改脚本本身的时候救过我好几次。*
