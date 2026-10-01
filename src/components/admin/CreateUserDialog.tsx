import { useEffect, useRef, useState } from "react";
import { authClient } from "../../lib/auth-client";
import ConfirmDialog from "./ConfirmDialog";
import { describeError, ROLE_OPTIONS } from "./types";
import type { AdminUser, RoleValue } from "./types";

interface Props {
    onClose: () => void;
    onCreated: (user: AdminUser) => void;
    notify: (kind: "ok" | "err", text: string) => void;
}

/** 与 better-auth 默认的 minPasswordLength 对齐；改这里前先确认服务端配置。 */
const MIN_PASSWORD_LENGTH = 8;

export default function CreateUserDialog({ onClose, onCreated, notify }: Props) {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [role, setRole] = useState<RoleValue>("user");
    const [confirming, setConfirming] = useState(false);
    const [pending, setPending] = useState(false);

    const nameRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        nameRef.current?.focus();
    }, []);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !pending) onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose, pending]);

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    const canSubmit = name.trim().length > 0 && emailOk && password.length >= MIN_PASSWORD_LENGTH;

    async function submit() {
        setPending(true);
        const { data, error } = await authClient.admin.createUser({
            name: name.trim(),
            email: email.trim(),
            password,
            role,
            // username / displayUsername 不在 create-user 的顶层字段里，
            // 插件会把 data 里的键直接展开进用户记录。
            ...(username.trim()
                ? { data: { username: username.trim(), displayUsername: username.trim() } }
                : {}),
        });
        setPending(false);

        if (error) {
            notify("err", describeError(error));
            return;
        }
        notify("ok", `已创建用户 ${name.trim()}`);
        onCreated(data!.user as AdminUser);
    }

    if (confirming) {
        return (
            <ConfirmDialog
                title="确认新建用户"
                pending={pending}
                confirmLabel="创建"
                description={
                    <>
                        将创建用户 <strong>{name.trim()}</strong>（{email.trim()}），
                        角色为「{ROLE_OPTIONS.find((item) => item.value === role)?.label}」，
                        并为其设置登录密码。
                    </>
                }
                onCancel={() => setConfirming(false)}
                onConfirm={() => void submit()}
            />
        );
    }

    return (
        <div
            className="ac-dialog-wrap"
            role="dialog"
            aria-modal="true"
            aria-label="新建用户"
            onClick={(event) => {
                if (event.target === event.currentTarget && !pending) onClose();
            }}
        >
            <div className="ac-dialog" style={{ width: "min(480px, 100%)" }}>
                <h3>新建用户</h3>

                <div className="ac-field">
                    <label className="ac-label" htmlFor="ac-new-name">昵称</label>
                    <input
                        id="ac-new-name"
                        ref={nameRef}
                        className="ac-input"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                    />
                </div>

                <div className="ac-field">
                    <label className="ac-label" htmlFor="ac-new-email">邮箱</label>
                    <input
                        id="ac-new-email"
                        className="ac-input ac-mono"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                    />
                </div>

                <div className="ac-row">
                    <div className="ac-field">
                        <label className="ac-label" htmlFor="ac-new-username">用户名（可选）</label>
                        <input
                            id="ac-new-username"
                            className="ac-input"
                            value={username}
                            autoComplete="off"
                            onChange={(event) => setUsername(event.target.value)}
                        />
                    </div>
                    <div className="ac-field">
                        <label className="ac-label" htmlFor="ac-new-role">角色</label>
                        <select
                            id="ac-new-role"
                            className="ac-select"
                            value={role}
                            onChange={(event) => setRole(event.target.value as RoleValue)}
                        >
                            {ROLE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="ac-field">
                    <label className="ac-label" htmlFor="ac-new-password">初始密码</label>
                    <input
                        id="ac-new-password"
                        className="ac-input"
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                    />
                    <span className="ac-hint">
                        至少 {MIN_PASSWORD_LENGTH} 位。创建后请通过可信渠道告知对方，建议对方尽快自行修改。
                    </span>
                </div>

                <div className="ac-dialog-foot">
                    <button type="button" className="ac-btn" onClick={onClose} disabled={pending}>
                        取消
                    </button>
                    <button
                        type="button"
                        className="ac-btn ac-btn--primary"
                        disabled={!canSubmit}
                        onClick={() => setConfirming(true)}
                    >
                        下一步
                    </button>
                </div>
            </div>
        </div>
    );
}
