import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { authClient } from "../../lib/auth-client";
import { describeError } from "./types";

/*
 * 样式内联而不是写进 admin.css：这个组件挂在全局 Layout 上，
 * 而 admin.css 只在后台页面加载 —— 用 class 的话首页会拿到一个没样式的裸元素。
 * 颜色仍然只引用设计令牌，不硬编码。
 */
const bar: CSSProperties = {
    position: "fixed",
    left: "50%",
    bottom: 20,
    transform: "translateX(-50%)",
    zIndex: 60,
    display: "flex",
    alignItems: "center",
    gap: 12,
    maxWidth: "min(92vw, 560px)",
    padding: "9px 14px",
    borderRadius: 999,
    background: "var(--surface)",
    border: "1px solid var(--warn)",
    boxShadow: "var(--shadow)",
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text)",
};

const button: CSSProperties = {
    fontFamily: "inherit",
    fontSize: 12,
    lineHeight: 1.4,
    padding: "4px 11px",
    borderRadius: 999,
    border: "1px solid var(--border-strong)",
    background: "var(--surface-2)",
    color: "var(--text)",
    cursor: "pointer",
    whiteSpace: "nowrap",
};

/**
 * 模拟登录期间的常驻提示条。
 *
 * ⚠️ 这个组件**必须**挂在全局 Layout 上，不能只放在 /admin 里。
 * 模拟登录后当前身份是被模拟的普通用户，中间件对 `/admin` 会返回 404 ——
 * 如果提示条只存在于后台页面，管理员一进入模拟就再也点不到「退出模拟」，
 * 只能手工清 Cookie。挂在 Layout 上则任何页面都能退出。
 *
 * 用 fixed 定位而不是插入文档流，避免预渲染页面水合后产生布局跳动。
 */
export default function ImpersonationBanner() {
    const [targetName, setTargetName] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        authClient
            .getSession()
            .then(({ data }) => {
                if (!alive || !data) return;
                if (data.session.impersonatedBy) setTargetName(data.user.name);
            })
            .catch(() => {
                // 静默失败：拿不到会话就当作没有在模拟，不该影响页面本身
            });
        return () => {
            alive = false;
        };
    }, []);

    if (!targetName) return null;

    async function stop() {
        setPending(true);
        setError(null);
        const { error: stopError } = await authClient.admin.stopImpersonating();
        setPending(false);

        if (stopError) {
            setError(describeError(stopError));
            return;
        }
        // 回到后台继续工作。此处用整页跳转而非客户端路由，确保服务端重新按管理员身份渲染。
        window.location.href = "/admin";
    }

    return (
        <div style={bar} role="status">
            <span>
                正在以 <strong style={{ color: "var(--warn)" }}>{targetName}</strong> 的身份浏览
                {error && <span style={{ color: "var(--danger)" }}> · {error}</span>}
            </span>
            <button
                type="button"
                style={{ ...button, opacity: pending ? 0.5 : 1 }}
                disabled={pending}
                onClick={() => void stop()}
            >
                {pending ? "退出中…" : "退出模拟"}
            </button>
        </div>
    );
}
