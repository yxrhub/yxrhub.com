import { useEffect, useState } from 'react';
import { authClient } from "../lib/auth-client";

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
    if (loading) return <span>加载中...</span>

    const btn = {
        background: 'transparent',
        border: 'none',
        color: '#0066cc',
        textDecoration: 'underline',
        cursor: 'pointer',
        padding: 0,
        fontSize: 'inherit'
    }

    return isLogin ? (
        <>
            <div style={{ display: 'flex', alignItems: 'center' }}>
                {image && <img width={32} src={image} alt='user avatar' />}
                <span style={{ marginLeft: 8 }}>{name}</span>
            </div>
            <button onClick={logout} style={btn}>注销登录</button>
        </>
    ) : (
        <button onClick={github} style={btn}>使用 GitHub 登录</button>
    )
}