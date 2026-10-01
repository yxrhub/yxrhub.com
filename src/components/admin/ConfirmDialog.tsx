import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

interface Props {
    title: string;
    description?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    /** 危险动作（封禁 / 删除 / 改角色）用红色主按钮。 */
    danger?: boolean;
    /**
     * 要求逐字输入的短语，通常是目标用户的邮箱。
     * 删除这类不可逆操作只点一次「确定」太容易误触，必须让人手打一遍标识。
     */
    requireText?: string;
    requireHint?: string;
    pending?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmDialog({
    title,
    description,
    confirmLabel = "确认",
    cancelLabel = "取消",
    danger = false,
    requireText,
    requireHint,
    pending = false,
    onConfirm,
    onCancel,
}: Props) {
    const [typed, setTyped] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !pending) onCancel();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onCancel, pending]);

    const textOk = !requireText || typed.trim() === requireText;

    return (
        <div
            className="ac-dialog-wrap"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(event) => {
                // 只在点击遮罩本身时关闭，点对话框内部不关
                if (event.target === event.currentTarget && !pending) onCancel();
            }}
        >
            <div className="ac-dialog">
                <h3>{title}</h3>
                {description && <p>{description}</p>}

                {requireText && (
                    <div className="ac-field">
                        <label className="ac-label" htmlFor="ac-confirm-text">
                            {requireHint ?? `请输入 ${requireText} 以确认`}
                        </label>
                        <input
                            id="ac-confirm-text"
                            ref={inputRef}
                            className="ac-input ac-mono"
                            value={typed}
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(event) => setTyped(event.target.value)}
                            placeholder={requireText}
                        />
                    </div>
                )}

                <div className="ac-dialog-foot">
                    <button type="button" className="ac-btn" onClick={onCancel} disabled={pending}>
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        className={`ac-btn ${danger ? "ac-btn--danger-solid" : "ac-btn--primary"}`}
                        onClick={onConfirm}
                        disabled={pending || !textOk}
                    >
                        {pending ? "处理中…" : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
