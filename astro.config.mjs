// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from "vite";
import react from '@astrojs/react';

import node from '@astrojs/node';

const isProd = import.meta.env.PROD;
const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');
Object.assign(process.env, env);

// https://astro.build/config
export default defineConfig({
  integrations: [react()],

  adapter: node({
    mode: 'standalone'
  }),

  vite: {
    server: {
      allowedHosts: ['yxrhub.com'],
    },
    ssr: {
      // 打包外部依赖，不依赖 node_modules 即可运行
      noExternal: isProd ? true : undefined
    },
  },
});