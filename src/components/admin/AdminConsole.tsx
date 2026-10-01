import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "../../lib/auth-client";
import CreateUserDialog from "./CreateUserDialog";
import UserDrawer, { Avatar } from "./UserDrawer";
import {
    describeError,
    editableRole,
    formatDateTime,
    formatRoles,
    isBanned,
} from "./types";
import type { AdminUser } from "./types";

type SearchField = "email" | "name" | "username";

const PAGE_SIZE = 10;

const SEARCH_FIELDS: ReadonlyArray<{ value: SearchField; label: string; placeholder: string }> = [
    { value: "email", label: "邮箱", placeholder: "搜索邮箱…" },
    { value: "name", label: "昵称", placeholder: "搜索昵称…" },
    { value: "username", label: "用户名", placeholder: "搜索用户名…" },
];

interface Props {
    /** 当前登录管理员的 id，由服务端渲染时注入。 */
    currentUserId: string;
}

export default function AdminConsole({ currentUserId }: Props) {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);

    const [searchInput, setSearchInput] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [field, setField] = useState<SearchField>("email");

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    const [selected, setSelected] = useState<AdminUser | null>(null);
    const [creating, setCreating] = useState(false);
    const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

    const toastTimer = useRef<number | null>(null);

    const notify = useCallback((kind: "ok" | "err", text: string) => {
        setToast({ kind, text });
        if (toastTimer.current) window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setToast(null), 3200);
    }, []);

    useEffect(() => {
        return () => {
            if (toastTimer.current) window.clearTimeout(toastTimer.current);
        };
    }, []);

    // 输入防抖：每敲一个字都打一次接口既浪费又会让表格闪烁
    useEffect(() => {
        const timer = window.setTimeout(() => {
            setSearchTerm(searchInput.trim());
            setOffset(0);
        }, 300);
        return () => window.clearTimeout(timer);
    }, [searchInput]);

    const reload = useCallback(() => setReloadKey((value) => value + 1), []);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setError(null);

        const query = {
            limit: PAGE_SIZE,
            offset,
            sortBy: "createdAt",
            sortDirection: "desc" as const,
            ...(searchTerm
                ? field === "username"
                    ? {
                          // list-users 的 searchField 只认 email / name，
                          // 用户名要退回通用 filter 参数做 contains 匹配。
                          filterField: "username",
                          filterValue: searchTerm,
                          filterOperator: "contains" as const,
                      }
                    : {
                          searchValue: searchTerm,
                          searchField: field,
                          searchOperator: "contains" as const,
                      }
                : {}),
        };

        authClient.admin
            .listUsers({ query })
            .then(({ data, error: listError }) => {
                if (!alive) return;
                if (listError) {
                    setError(describeError(listError));
                    setUsers([]);
                    setTotal(0);
                    return;
                }
                setUsers((data?.users ?? []) as AdminUser[]);
                setTotal(data?.total ?? 0);
            })
            .catch((thrown: unknown) => {
                if (!alive) return;
                setError(describeError(thrown));
            })
            .finally(() => {
                if (alive) setLoading(false);
            });

        return () => {
            alive = false;
        };
    }, [offset, searchTerm, field, reloadKey]);

    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.floor(offset / PAGE_SIZE) + 1;

    // 删除或筛选后当前页可能已经越界，退回最后一页
    useEffect(() => {
        if (!loading && users.length === 0 && offset > 0) {
            setOffset(Math.max(0, (pageCount - 1) * PAGE_SIZE));
        }
    }, [loading, users.length, offset, pageCount]);

    const afterMutation = useCallback(
        (updated?: AdminUser) => {
            if (updated) setSelected(updated);
            reload();
        },
        [reload],
    );

    const afterRemoved = useCallback(
        (userId: string) => {
            setSelected((current) => (current?.id === userId ? null : current));
            reload();
        },
        [reload],
    );

    return (
        <div className="ac-root">
            <div className="ac-toolbar">
                <div className="ac-search">
                    <select
                        className="ac-select"
                        value={field}
                        aria-label="搜索字段"
                        onChange={(event) => setField(event.target.value as SearchField)}
                    >
                        {SEARCH_FIELDS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <input
                        className="ac-input"
                        value={searchInput}
                        placeholder={SEARCH_FIELDS.find((item) => item.value === field)?.placeholder}
                        aria-label="搜索用户"
                        onChange={(event) => setSearchInput(event.target.value)}
                    />
                </div>
                <span className="ac-toolbar-spacer" />
                <span className="ac-meta">
                    共 {total} 位用户
                    {loading && " · 加载中…"}
                </span>
                <button
                    type="button"
                    className="ac-btn"
                    disabled={loading}
                    onClick={reload}
                >
                    刷新
                </button>
                <button
                    type="button"
                    className="ac-btn ac-btn--primary"
                    onClick={() => setCreating(true)}
                >
                    新建用户
                </button>
            </div>

            {error && <div className="ac-alert">{error}</div>}

            <div className="ac-table-wrap" style={{ opacity: loading && users.length > 0 ? 0.6 : 1 }}>
                {users.length === 0 ? (
                    <div className="ac-empty">
                        {loading ? "加载中…" : searchTerm ? "没有匹配的用户" : "还没有用户"}
                    </div>
                ) : (
                    <table className="ac-table">
                        <thead>
                            <tr>
                                <th>用户</th>
                                <th>邮箱</th>
                                <th>用户名</th>
                                <th>角色</th>
                                <th>状态</th>
                                <th>注册时间</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => {
                                const banned = isBanned(user);
                                const isSelf = user.id === currentUserId;
                                return (
                                    <tr
                                        key={user.id}
                                        onClick={() => setSelected(user)}
                                        tabIndex={0}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                setSelected(user);
                                            }
                                        }}
                                    >
                                        <td>
                                            <div className="ac-user">
                                                <Avatar user={user} />
                                                <span className="ac-user-name">{user.name}</span>
                                                {isSelf && <span className="ac-badge">你</span>}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="ac-mono">{user.email}</div>
                                            {!user.emailVerified && (
                                                <div className="ac-sub">未验证</div>
                                            )}
                                        </td>
                                        <td>{user.username || <span className="ac-sub">—</span>}</td>
                                        <td>
                                            <span
                                                className={`ac-badge ${
                                                    editableRole(user.role) === "admin"
                                                        ? "ac-badge--admin"
                                                        : ""
                                                }`}
                                            >
                                                {formatRoles(user.role)}
                                            </span>
                                        </td>
                                        <td>
                                            {banned ? (
                                                <span className="ac-badge ac-badge--danger">已封禁</span>
                                            ) : (
                                                <span className="ac-badge ac-badge--ok">正常</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className="ac-sub">{formatDateTime(user.createdAt)}</span>
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                className="ac-btn ac-btn--sm"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setSelected(user);
                                                }}
                                            >
                                                管理
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="ac-pager">
                <span>
                    第 {page} / {pageCount} 页
                </span>
                <button
                    type="button"
                    className="ac-btn ac-btn--sm"
                    disabled={offset === 0 || loading}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                    上一页
                </button>
                <button
                    type="button"
                    className="ac-btn ac-btn--sm"
                    disabled={offset + PAGE_SIZE >= total || loading}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                    下一页
                </button>
            </div>

            {selected && (
                <UserDrawer
                    user={selected}
                    currentUserId={currentUserId}
                    onClose={() => setSelected(null)}
                    onMutated={afterMutation}
                    onRemoved={afterRemoved}
                    notify={notify}
                />
            )}

            {creating && (
                <CreateUserDialog
                    onClose={() => setCreating(false)}
                    onCreated={() => {
                        setCreating(false);
                        reload();
                    }}
                    notify={notify}
                />
            )}

            {toast && (
                <div className={`ac-toast ${toast.kind === "err" ? "ac-toast--err" : ""}`}>
                    {toast.text}
                </div>
            )}
        </div>
    );
}
