import { useCallback, useEffect, useState } from "react";
import { authClient } from "../../lib/auth-client";
import ConfirmDialog from "./ConfirmDialog";
import {
    describeError,
    describeUserAgent,
    editableRole,
    formatDateTime,
    formatRelative,
    formatRoles,
    isBanned,
    ROLE_OPTIONS,
} from "./types";
import type { AdminSession, AdminUser, RoleValue } from "./types";

type DialogKind =
    | "role"
    | "password"
    | "ban"
    | "unban"
    | "impersonate"
    | "delete"
    | "revoke-all";

const BAN_DURATIONS: ReadonlyArray<{ value: string; label: string; seconds?: number }> = [
    { value: "forever", label: "永久封禁" },
    { value: "1d", label: "1 天", seconds: 86400 },
    { value: "7d", label: "7 天", seconds: 86400 * 7 },
    { value: "30d", label: "30 天", seconds: 86400 * 30 },
];

interface Props {
    user: AdminUser;
    /** 当前登录管理员的 id —— 用于禁用针对自己的高危操作。 */
    currentUserId: string;
    onClose: () => void;
    /** 任一次写操作成功后由父级刷新列表。 */
    onMutated: (updated?: AdminUser) => void;
    onRemoved: (userId: string) => void;
    notify: (kind: "ok" | "err", text: string) => void;
}

export default function UserDrawer({
    user,
    currentUserId,
    onClose,
    onMutated,
    onRemoved,
    notify,
}: Props) {
    const isSelf = user.id === currentUserId;
    const banned = isBanned(user);

    // ---- 资料表单 ----
    const [name, setName] = useState(user.name);
    const [username, setUsername] = useState(user.username ?? "");
    const [displayUsername, setDisplayUsername] = useState(user.displayUsername ?? "");
    const [email, setEmail] = useState(user.email);
    const [emailVerified, setEmailVerified] = useState(!!user.emailVerified);

    // 切换用户时把表单重置为新的基线值
    useEffect(() => {
        setName(user.name);
        setUsername(user.username ?? "");
        setDisplayUsername(user.displayUsername ?? "");
        setEmail(user.email);
        setEmailVerified(!!user.emailVerified);
    }, [user.id, user.name, user.username, user.displayUsername, user.email, user.emailVerified]);

    // ---- 角色 ----
    const currentRole = editableRole(user.role);
    const [role, setRole] = useState<RoleValue>(currentRole);
    useEffect(() => setRole(currentRole), [user.id, currentRole]);

    // ---- 密码 ----
    const [password, setPassword] = useState("");

    // ---- 封禁 ----
    const [banReason, setBanReason] = useState("");
    const [banDuration, setBanDuration] = useState("forever");

    // ---- 会话 ----
    const [sessions, setSessions] = useState<AdminSession[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(true);
    const [sessionsError, setSessionsError] = useState<string | null>(null);

    // ---- 对话框 ----
    const [dialog, setDialog] = useState<DialogKind | null>(null);
    const [pending, setPending] = useState(false);

    const loadSessions = useCallback(async () => {
        setSessionsLoading(true);
        setSessionsError(null);
        const { data, error } = await authClient.admin.listUserSessions({ userId: user.id });
        if (error) {
            setSessions([]);
            setSessionsError(describeError(error));
        } else {
            setSessions((data?.sessions ?? []) as AdminSession[]);
        }
        setSessionsLoading(false);
    }, [user.id]);

    useEffect(() => {
        void loadSessions();
    }, [loadSessions]);

    /** 所有写操作的统一出口：错误进 toast，成功交给调用方刷新。 */
    async function run(action: () => Promise<void>, successText: string) {
        setPending(true);
        try {
            await action();
            notify("ok", successText);
            setDialog(null);
        } catch (error) {
            notify("err", describeError(error));
        } finally {
            setPending(false);
        }
    }

    // ---- 资料保存 ----
    async function saveProfile() {
        const data: Record<string, unknown> = {};
        if (name.trim() && name !== user.name) data.name = name.trim();
        if (email.trim() && email !== user.email) data.email = email.trim();
        if (emailVerified !== !!user.emailVerified) data.emailVerified = emailVerified;
        if ((username.trim() || null) !== (user.username ?? null)) data.username = username.trim() || null;
        if ((displayUsername.trim() || null) !== (user.displayUsername ?? null)) {
            data.displayUsername = displayUsername.trim() || null;
        }

        if (Object.keys(data).length === 0) {
            notify("ok", "没有需要保存的改动");
            return;
        }

        await run(async () => {
            const { data: result, error } = await authClient.admin.updateUser({
                userId: user.id,
                data,
            });
            if (error) throw error;
            onMutated((result?.user as AdminUser) ?? undefined);
        }, "资料已更新");
    }

    // ---- 会话吊销 ----
    async function revokeSession(session: AdminSession) {
        await run(async () => {
            const { error } = await authClient.admin.revokeUserSession({
                sessionToken: session.token,
            });
            if (error) throw error;
            await loadSessions();
        }, "该会话已吊销");
    }

    const profileDirty =
        name !== user.name ||
        email !== user.email ||
        emailVerified !== !!user.emailVerified ||
        (username.trim() || null) !== (user.username ?? null) ||
        (displayUsername.trim() || null) !== (user.displayUsername ?? null);

    const roleDirty = role !== currentRole;

    const banSeconds = BAN_DURATIONS.find((item) => item.value === banDuration)?.seconds;

    return (
        <>
            <div
                className="ac-overlay"
                onClick={(event) => {
                    if (event.target === event.currentTarget && !pending) onClose();
                }}
            >
                <aside className="ac-drawer" role="dialog" aria-modal="true" aria-label={`用户 ${user.name}`}>
                    <div className="ac-drawer-head">
                        <Avatar user={user} size={38} />
                        <div style={{ minWidth: 0 }}>
                            <h2>{user.name}</h2>
                            <div className="ac-sub ac-mono">{user.email}</div>
                        </div>
                        <button type="button" className="ac-close" onClick={onClose} aria-label="关闭">
                            ×
                        </button>
                    </div>

                    <div className="ac-drawer-body">
                        <div className="ac-badges" style={{ marginTop: 12 }}>
                            <span className={`ac-badge ${currentRole === "admin" ? "ac-badge--admin" : ""}`}>
                                {formatRoles(user.role)}
                            </span>
                            {banned ? (
                                <span className="ac-badge ac-badge--danger">已封禁</span>
                            ) : (
                                <span className="ac-badge ac-badge--ok">正常</span>
                            )}
                            {user.emailVerified ? (
                                <span className="ac-badge">邮箱已验证</span>
                            ) : (
                                <span className="ac-badge ac-badge--warn">邮箱未验证</span>
                            )}
                            {isSelf && <span className="ac-badge ac-badge--warn">这是你自己</span>}
                        </div>

                        {banned && (
                            <div className="ac-alert" style={{ marginTop: 12 }}>
                                封禁原因：{user.banReason || "（未填写）"}
                                <br />
                                封禁至：{user.banExpires ? formatDateTime(user.banExpires) : "永久"}
                            </div>
                        )}

                        {/* ---------- 资料 ---------- */}
                        <section className="ac-section">
                            <h3 className="ac-section-title">资料</h3>
                            <div className="ac-field">
                                <label className="ac-label" htmlFor="ac-name">昵称</label>
                                <input
                                    id="ac-name"
                                    className="ac-input"
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                />
                            </div>
                            <div className="ac-row">
                                <div className="ac-field">
                                    <label className="ac-label" htmlFor="ac-username">用户名</label>
                                    <input
                                        id="ac-username"
                                        className="ac-input"
                                        value={username}
                                        placeholder="未设置"
                                        onChange={(event) => setUsername(event.target.value)}
                                    />
                                </div>
                                <div className="ac-field">
                                    <label className="ac-label" htmlFor="ac-display">展示名</label>
                                    <input
                                        id="ac-display"
                                        className="ac-input"
                                        value={displayUsername}
                                        placeholder="未设置"
                                        onChange={(event) => setDisplayUsername(event.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="ac-field">
                                <label className="ac-label" htmlFor="ac-email">邮箱</label>
                                <input
                                    id="ac-email"
                                    className="ac-input ac-mono"
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                />
                            </div>
                            <label className="ac-actions" style={{ fontSize: 13, cursor: "pointer" }}>
                                <input
                                    type="checkbox"
                                    checked={emailVerified}
                                    onChange={(event) => setEmailVerified(event.target.checked)}
                                />
                                邮箱已验证
                            </label>
                            <div className="ac-actions">
                                <button
                                    type="button"
                                    className="ac-btn ac-btn--primary"
                                    disabled={!profileDirty || pending}
                                    onClick={() => void saveProfile()}
                                >
                                    {pending ? "保存中…" : "保存资料"}
                                </button>
                                {profileDirty && <span className="ac-hint">有未保存的改动</span>}
                            </div>
                            <div className="ac-hint ac-mono">
                                id: {user.id}
                                <br />
                                注册于 {formatDateTime(user.createdAt)}（{formatRelative(user.createdAt)}）
                            </div>
                        </section>

                        {/* ---------- 角色 ---------- */}
                        <section className="ac-section">
                            <h3 className="ac-section-title">角色</h3>
                            <div className="ac-row">
                                <div className="ac-field">
                                    <select
                                        className="ac-select"
                                        value={role}
                                        disabled={isSelf}
                                        onChange={(event) => setRole(event.target.value as RoleValue)}
                                        aria-label="角色"
                                    >
                                        {ROLE_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    type="button"
                                    className="ac-btn"
                                    disabled={isSelf || !roleDirty || pending}
                                    onClick={() => setDialog("role")}
                                >
                                    变更角色
                                </button>
                            </div>
                            {isSelf ? (
                                <div className="ac-hint">不能变更自己的角色，避免把自己降级后无人可管理。</div>
                            ) : (
                                <div className="ac-hint">
                                    提升为管理员后，该用户可以进入后台并拥有全部管理权限。
                                </div>
                            )}
                        </section>

                        {/* ---------- 账号安全 ---------- */}
                        <section className="ac-section">
                            <h3 className="ac-section-title">账号安全</h3>

                            <div className="ac-field">
                                <label className="ac-label" htmlFor="ac-password">设置登录密码</label>
                                <div className="ac-row">
                                    <input
                                        id="ac-password"
                                        className="ac-input"
                                        type="password"
                                        autoComplete="new-password"
                                        value={password}
                                        placeholder="至少 8 位"
                                        onChange={(event) => setPassword(event.target.value)}
                                    />
                                    <button
                                        type="button"
                                        className="ac-btn"
                                        disabled={password.length < 8 || pending}
                                        onClick={() => setDialog("password")}
                                    >
                                        设置密码
                                    </button>
                                </div>
                            </div>
                            <div className="ac-hint">
                                该用户原本仅通过 GitHub 登录时，这里会为其补建一套邮箱 + 密码凭据。
                            </div>

                            <div className="ac-field" style={{ marginTop: 6 }}>
                                <span className="ac-label">封禁状态</span>
                                {banned ? (
                                    <div className="ac-actions">
                                        <button
                                            type="button"
                                            className="ac-btn"
                                            disabled={pending}
                                            onClick={() => setDialog("unban")}
                                        >
                                            解除封禁
                                        </button>
                                        <span className="ac-hint">解封后该用户需要重新登录。</span>
                                    </div>
                                ) : (
                                    <>
                                        <textarea
                                            className="ac-textarea"
                                            value={banReason}
                                            placeholder="封禁原因（会展示给被封禁的用户）"
                                            onChange={(event) => setBanReason(event.target.value)}
                                        />
                                        <div className="ac-row">
                                            <select
                                                className="ac-select"
                                                value={banDuration}
                                                aria-label="封禁时长"
                                                onChange={(event) => setBanDuration(event.target.value)}
                                            >
                                                {BAN_DURATIONS.map((item) => (
                                                    <option key={item.value} value={item.value}>
                                                        {item.label}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                className="ac-btn ac-btn--danger"
                                                disabled={isSelf || pending}
                                                onClick={() => setDialog("ban")}
                                            >
                                                封禁该用户
                                            </button>
                                        </div>
                                        <div className="ac-hint">
                                            封禁会同时吊销该用户的全部登录会话，立即生效。
                                            {isSelf && " 不能封禁自己。"}
                                        </div>
                                    </>
                                )}
                            </div>
                        </section>

                        {/* ---------- 会话 ---------- */}
                        <section className="ac-section">
                            <h3 className="ac-section-title">
                                登录会话
                                <span className="ac-sub">{sessions.length > 0 && `${sessions.length} 条`}</span>
                                <button
                                    type="button"
                                    className="ac-btn ac-btn--sm"
                                    style={{ marginLeft: "auto" }}
                                    disabled={sessionsLoading}
                                    onClick={() => void loadSessions()}
                                >
                                    刷新
                                </button>
                            </h3>

                            {sessionsLoading && <div className="ac-hint">加载中…</div>}
                            {sessionsError && <div className="ac-alert">{sessionsError}</div>}
                            {!sessionsLoading && !sessionsError && sessions.length === 0 && (
                                <div className="ac-hint">该用户当前没有活跃会话。</div>
                            )}

                            {sessions.map((session) => {
                                const expired = new Date(session.expiresAt).getTime() < Date.now();
                                return (
                                    <div className="ac-session" key={session.id}>
                                        <div className="ac-session-head">
                                            <span className="ac-sub" style={{ color: "var(--text-2)" }}>
                                                {describeUserAgent(session.userAgent)}
                                            </span>
                                            {session.impersonatedBy && (
                                                <span className="ac-badge ac-badge--warn">模拟登录产生</span>
                                            )}
                                            {expired && <span className="ac-badge ac-badge--danger">已过期</span>}
                                            <button
                                                type="button"
                                                className="ac-btn ac-btn--sm ac-btn--danger"
                                                style={{ marginLeft: "auto" }}
                                                disabled={pending}
                                                onClick={() => void revokeSession(session)}
                                            >
                                                吊销
                                            </button>
                                        </div>
                                        <div className="ac-session-meta">
                                            <span>IP {session.ipAddress || "未知"}</span>
                                            <span>创建 {formatDateTime(session.createdAt)}</span>
                                            <span>到期 {formatDateTime(session.expiresAt)}</span>
                                        </div>
                                    </div>
                                );
                            })}

                            {sessions.length > 1 && (
                                <div className="ac-actions">
                                    <button
                                        type="button"
                                        className="ac-btn ac-btn--danger"
                                        disabled={pending}
                                        onClick={() => setDialog("revoke-all")}
                                    >
                                        吊销全部会话
                                    </button>
                                </div>
                            )}
                        </section>

                        {/* ---------- 模拟登录 ---------- */}
                        <section className="ac-section">
                            <h3 className="ac-section-title">模拟登录</h3>
                            <div className="ac-hint">
                                以该用户的身份浏览站点，用于复现他遇到的问题。站点底部会常驻提示条，
                                随时可以退出模拟。不能模拟另一位管理员。
                            </div>
                            <div className="ac-actions">
                                <button
                                    type="button"
                                    className="ac-btn"
                                    disabled={isSelf || banned || pending}
                                    onClick={() => setDialog("impersonate")}
                                >
                                    以该用户身份浏览
                                </button>
                                {banned && <span className="ac-hint">已封禁的用户无法模拟登录。</span>}
                            </div>
                        </section>

                        {/* ---------- 危险操作 ---------- */}
                        <section className="ac-section">
                            <h3 className="ac-section-title ac-section-title--danger">危险操作</h3>
                            <div className="ac-hint">
                                删除不可撤销：该用户的账号与其全部会话会被一并移除。
                                如果只是想临时阻止登录，请改用封禁。
                            </div>
                            <div className="ac-actions">
                                <button
                                    type="button"
                                    className="ac-btn ac-btn--danger-solid"
                                    disabled={isSelf || pending}
                                    onClick={() => setDialog("delete")}
                                >
                                    删除该用户
                                </button>
                                {isSelf && <span className="ac-hint">不能删除自己。</span>}
                            </div>
                        </section>
                    </div>
                </aside>
            </div>

            {/* ---------- 对话框 ---------- */}
            {dialog === "role" && (
                <ConfirmDialog
                    title="变更角色"
                    danger
                    pending={pending}
                    confirmLabel={`改为「${ROLE_OPTIONS.find((item) => item.value === role)?.label}」`}
                    description={
                        <>
                            将 <strong>{user.name}</strong> 的角色从「{formatRoles(user.role)}」改为「
                            {ROLE_OPTIONS.find((item) => item.value === role)?.label}」。
                            {role === "admin" && " 管理员可以进入后台管理所有用户，请确认这是预期操作。"}
                        </>
                    }
                    onCancel={() => setDialog(null)}
                    onConfirm={() =>
                        void run(async () => {
                            const { data, error } = await authClient.admin.setRole({
                                userId: user.id,
                                role,
                            });
                            if (error) throw error;
                            onMutated((data?.user as AdminUser) ?? undefined);
                        }, "角色已更新")
                    }
                />
            )}

            {dialog === "password" && (
                <ConfirmDialog
                    title="设置登录密码"
                    pending={pending}
                    confirmLabel="设置密码"
                    description={
                        <>
                            为 <strong>{user.name}</strong>（{user.email}）设置新的登录密码。
                            该用户已有的登录会话不受影响。
                        </>
                    }
                    onCancel={() => {
                        setDialog(null);
                    }}
                    onConfirm={() =>
                        void run(async () => {
                            const { error } = await authClient.admin.setUserPassword({
                                userId: user.id,
                                newPassword: password,
                            });
                            if (error) throw error;
                            setPassword("");
                        }, "密码已设置")
                    }
                />
            )}

            {dialog === "ban" && (
                <ConfirmDialog
                    title="封禁用户"
                    danger
                    pending={pending}
                    confirmLabel="封禁"
                    description={
                        <>
                            封禁 <strong>{user.name}</strong>（{user.email}），
                            时长：{BAN_DURATIONS.find((item) => item.value === banDuration)?.label}。
                            该用户的全部登录会话会被立即吊销，在其会话失效前无法再登录。
                        </>
                    }
                    onCancel={() => setDialog(null)}
                    onConfirm={() =>
                        void run(async () => {
                            const { data, error } = await authClient.admin.banUser({
                                userId: user.id,
                                banReason: banReason.trim() || undefined,
                                banExpiresIn: banSeconds,
                            });
                            if (error) throw error;
                            onMutated((data?.user as AdminUser) ?? undefined);
                            setBanReason("");
                            await loadSessions();
                        }, "已封禁并吊销其全部会话")
                    }
                />
            )}

            {dialog === "unban" && (
                <ConfirmDialog
                    title="解除封禁"
                    pending={pending}
                    confirmLabel="解除封禁"
                    description={
                        <>
                            恢复 <strong>{user.name}</strong> 的登录权限。封禁原因与到期时间会被清空。
                        </>
                    }
                    onCancel={() => setDialog(null)}
                    onConfirm={() =>
                        void run(async () => {
                            const { data, error } = await authClient.admin.unbanUser({ userId: user.id });
                            if (error) throw error;
                            onMutated((data?.user as AdminUser) ?? undefined);
                        }, "已解除封禁")
                    }
                />
            )}

            {dialog === "revoke-all" && (
                <ConfirmDialog
                    title="吊销全部会话"
                    danger
                    pending={pending}
                    confirmLabel="全部吊销"
                    description={
                        <>
                            让 <strong>{user.name}</strong> 在所有设备上登出。
                            {isSelf && " 你自己当前的会话也会被吊销，需要重新登录。"}
                        </>
                    }
                    onCancel={() => setDialog(null)}
                    onConfirm={() =>
                        void run(async () => {
                            const { error } = await authClient.admin.revokeUserSessions({
                                userId: user.id,
                            });
                            if (error) throw error;
                            await loadSessions();
                        }, "全部会话已吊销")
                    }
                />
            )}

            {dialog === "impersonate" && (
                <ConfirmDialog
                    title="模拟登录"
                    pending={pending}
                    confirmLabel="开始模拟"
                    description={
                        <>
                            以 <strong>{user.name}</strong> 的身份浏览站点。
                            模拟期间你的管理员身份会暂时失效，落到首页后通过底部提示条退出模拟。
                        </>
                    }
                    onCancel={() => setDialog(null)}
                    onConfirm={() =>
                        void run(async () => {
                            const { error } = await authClient.admin.impersonateUser({
                                userId: user.id,
                            });
                            if (error) throw error;
                            // 模拟后当前身份不再是管理员，后台会被中间件拦成 404，必须离开这里。
                            window.location.href = "/";
                        }, "已切换到该用户身份")
                    }
                />
            )}

            {dialog === "delete" && (
                <ConfirmDialog
                    title="删除用户"
                    danger
                    pending={pending}
                    confirmLabel="永久删除"
                    requireText={user.email}
                    requireHint={`删除不可撤销。请输入该用户的邮箱 ${user.email} 以确认。`}
                    description={
                        <>
                            永久删除 <strong>{user.name}</strong> 及其全部会话，此操作无法回滚。
                        </>
                    }
                    onCancel={() => setDialog(null)}
                    onConfirm={() =>
                        void run(async () => {
                            const { error } = await authClient.admin.removeUser({ userId: user.id });
                            if (error) throw error;
                            onRemoved(user.id);
                        }, "用户已删除")
                    }
                />
            )}
        </>
    );
}

/** 表格与抽屉共用的头像，没有 image 时用首字母兜底。 */
export function Avatar({ user, size = 26 }: { user: AdminUser; size?: number }) {
    const style = { width: size, height: size };
    if (user.image) {
        return <img className="ac-avatar" style={style} src={user.image} alt="" loading="lazy" />;
    }
    return (
        <span className="ac-avatar ac-avatar--fallback" style={style} aria-hidden="true">
            {(user.name || user.email || "?").trim().slice(0, 1).toUpperCase()}
        </span>
    );
}
