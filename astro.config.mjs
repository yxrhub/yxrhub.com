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

  markdown: {
    shikiConfig: {
      // 双主题：本站的明暗切换走 `prefers-color-scheme`，没有 class 开关，
      // 因此让 Shiki 只输出两套配色的 CSS 变量，切换逻辑写在 src/styles/prose.css。
      themes: { light: 'github-light', dark: 'github-dark' },
      // 不写死行内颜色，否则暗色模式下的代码块会是浅色底
      defaultColor: false,
    },
  },

  vite: {
    server: {
      allowedHosts: ['localhost:4321', 'yxrhub.com'],
    },
    ssr: {
      // 打包外部依赖，不依赖 node_modules 即可运行
      noExternal: isProd ? true : undefined
    },
  },
});