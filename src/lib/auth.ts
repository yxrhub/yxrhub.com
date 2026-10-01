import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, username } from "better-auth/plugins"
import { drizzle } from 'drizzle-orm/node-postgres';
import { v7 } from "uuid";
import * as schema from "../db/schema/auth";

const DATABASE_URL = process.env.DATABASE_URL!;
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL!;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;

const db = drizzle(DATABASE_URL);

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
        schema,
    }),
    baseURL: BETTER_AUTH_URL,
    socialProviders: {
        github: {
            clientId: GITHUB_CLIENT_ID,
            clientSecret: GITHUB_CLIENT_SECRET,
        },
    },
    plugins: [
        username(),
        // admin 插件提供 /api/auth/admin/* 全套管理端点。
        // 权限校验全在服务端完成：adminMiddleware 保证存在有效会话，
        // hasPermission 再按 user.role 判定是否为管理员（默认 adminRoles=["admin"]，defaultRole="user"）。
        admin(),
    ],
    advanced: {
        database: {
            generateId: () => v7(),
        }
    },
});