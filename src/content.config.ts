import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/**
 * 开发日志内容集合。
 *
 * 约定：
 * - 每篇文章是一个 Markdown 文件，**文件名即 slug**，形如 `YYYY-MM-DD-<短名>.md`
 *   → 路由 `/blog/2026-06-23-project-kickoff`
 * - 正文里**不写 `#` 一级标题**，h1 由 frontmatter 的 `title` 渲染，
 *   以保证列表页、`<title>` 与正文页标题同源。
 * - 排序键是 `date`（frontmatter），因此改文件名不影响排序；
 *   同一日期多篇时以文件名（即 `id`）字典序兜底，保证「上一篇 / 下一篇」稳定。
 *
 * ⚠️ 注意 `src/content/index.md` 是首页正文，走的是原始 Markdown 模块导入
 * （`import * as doc from "../content/index.md"`），**不属于本集合**。
 * 这里 glob 的 base 指向 `src/content/blog`，刻意不覆盖它。
 */
const blog = defineCollection({
    loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
    schema: z.object({
        /** 文章标题。正文页的 h1 由它渲染 */
        title: z.string(),
        /**
         * 发布日期，同时是排序键。YAML 里写 `2026-06-23` 即可，会被强制解析为 Date。
         * 强制解析而非直接 `z.date()`：手写 `2026-06-23` 时 YAML 可能给出字符串。
         */
        date: z.coerce.date(),
        /** 摘要。列表页与首页区块共用，建议 40–80 字 */
        summary: z.string(),
        /** 预估阅读时长（分钟），仅展示用，可选 */
        minutes: z.number().int().positive().optional(),
    }),
});

export const collections = { blog };
