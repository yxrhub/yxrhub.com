import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins"
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
        username()
    ],
    advanced: {
        database: {
            generateId: () => v7(),
        }
    },
});