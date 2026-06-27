import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins"
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "../db/schema/auth";

const dbUrl = import.meta.env.DATABASE_URL! as string;
const githubClientId = import.meta.env.GITHUB_CLIENT_ID! as string;
const githubClientSecret = import.meta.env.GITHUB_CLIENT_SECRET! as string;

const db = drizzle(dbUrl);

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
        schema,
    }),
    baseURL: import.meta.env.BETTER_AUTH_URL,
    socialProviders: {
        github: {
            clientId: githubClientId,
            clientSecret: githubClientSecret,
        },
    },
    plugins: [
        username()
    ],
});