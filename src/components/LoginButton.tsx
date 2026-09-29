import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { authClient } from "../lib/auth-client";

const pill: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: 999,
    padding: '6px 14px',
    fontSize: 13,
    fontFamily: 'inherit',
    lineHeight: 1.6,
    color: 'var(--text)',
    cursor: 'pointer',
    transition: 'border-color .15s ease, background .15s ease',
};

const identity: CSSProperties = {
    ...pill,
    cursor: 'default',
    paddingLeft: 6,
};

const ghost: CSSProperties = {
    background: 'transparent',
    border: 'none',
    padding: '6px 2px',
    fontFamily: 'inherit',
    fontSize: 13,
    lineHeight: 1.6,
    color: 'var(--text-3)',
    cursor: 'pointer',
    textDecoration: 'underline',
    textUnderlineOffset: 3,
};

export default function () {
    const [loading, setLoading] = useState(true)
    const [isLogin, setIsLogin] = useState(false)
    const [name, setName] = useState("")
    const [image, setImage] = useState<string | null | undefined>();

    useEffect(() => {
        const checkLogin = async () => {
            try {
                const session = await authClient.getSession()
                if (!session.data) {
                    return;
                }
                setIsLogin(true);
                setName(session.data.user.name);
                setImage(session.data.user.image);
            } catch (err) {
                setIsLogin(false)
            } finally {
                setLoading(false)
            }
        }
        checkLogin()
    }, [])

    function github() {
        authClient.signIn.social({ provider: "github" });
    }

    function logout() {
        authClient.signOut();
    }

    // 加载中显示文字防止闪烁
    if (loading) return <span style={{ fontSize: 13, color: 'var(--text-3)' }}>加载中...</span>

    return isLogin ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={identity}>
                {image && (
                    <img
                        width={22}
                        height={22}
                        src={image}
                        alt="user avatar"
                        style={{ borderRadius: '50%', display: 'block' }}
                    />
                )}
                <span>{name}</span>
            </span>
            <button onClick={logout} style={ghost}>注销登录</button>
        </div>
    ) : (
        <button onClick={github} style={pill}>使用 GitHub 登录</button>
    )
}
