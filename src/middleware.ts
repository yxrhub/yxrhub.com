import { auth } from "./lib/auth";
import { isAdmin } from "./lib/authz";
import { defineMiddleware } from "astro:middleware";

// 非管理员访问后台时返回的最小 404 页面。
// 刻意不含任何指向后台存在的线索 —— 从响应上看，/admin 与任意不存在的路径无从区分。
const NOT_FOUND_BODY = `<!doctype html>
<html lang="zh-cn"><head><meta charset="utf-8"><title>404</title></head>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;font-family:system-ui,sans-serif;color:#8b92a6">
<p>404 Not Found</p></body></html>`;

export const onRequest = defineMiddleware(async (context, next) => {

    // 🔥 核心修补：如果是预渲染的静态页面，直接放行，不执行任何需要 headers 的逻辑
    // 修补警告：[WARN] `Astro.request.headers`
    if (context.isPrerendered) {
        return next();
    }

    const isAuthed = await auth.api
        .getSession({
            headers: context.request.headers,
        })

    if (isAuthed) {
        context.locals.user = isAuthed.user;
        context.locals.session = isAuthed.session;
    } else {
        context.locals.user = null;
        context.locals.session = null;
    }

    // 后台访问控制。必须在服务端拦截 —— 仅隐藏前端入口不构成任何防护。
    // 返回 404（而非 403 或重定向）是为了不向非管理员暴露 /admin 的存在。
    if (context.url.pathname === "/admin" || context.url.pathname.startsWith("/admin/")) {
        if (!isAdmin(context.locals.user)) {
            return new Response(NOT_FOUND_BODY, {
                status: 404,
                headers: { "content-type": "text/html; charset=utf-8" },
            });
        }
    }

    return next();
});
