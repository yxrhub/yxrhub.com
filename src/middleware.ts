import { auth } from "./lib/auth";
import { defineMiddleware } from "astro:middleware";

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

    return next();
});