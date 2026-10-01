import { getCollection, type CollectionEntry } from "astro:content";

export type BlogPost = CollectionEntry<"blog">;

/**
 * 排序比较器：时间倒序（新的在前），同日按 `id`（即文件名）**倒序**兜底。
 *
 * 兜底那一层不是可有可无——同一天发布多篇时，没有它排序结果依赖
 * `getCollection` 的返回顺序，「上一篇 / 下一篇」会变得不确定。
 *
 * 方向选倒序而不是正序，是为了让同日的几篇读起来也符合「新的在前」：
 * 若按 `2026-09-29-01-xxx`、`2026-09-29-02-yyy` 编号，倒序会先显示 02，
 * 与整体排序方向一致；正序则会在一份「倒序列表」里突然翻向。
 */
function byDateDesc(a: BlogPost, b: BlogPost): number {
    const diff = b.data.date.getTime() - a.data.date.getTime();
    return diff !== 0 ? diff : b.id.localeCompare(a.id);
}

/** 全部文章，新的在前。列表页与首页区块用。 */
export async function getPostsNewestFirst(): Promise<BlogPost[]> {
    const posts = await getCollection("blog");
    return posts.sort(byDateDesc);
}

/**
 * 全部文章，旧的在前，并附带相邻项。
 * 正文页的「上一篇（更早）/ 下一篇（更新）」按这个顺序取。
 */
export async function getPostsWithNeighbours() {
    const newestFirst = await getPostsNewestFirst();
    return newestFirst.map((post, index) => ({
        post,
        // 数组是倒序的，所以 index - 1 是**更新**的一篇，index + 1 是**更早**的一篇
        newer: newestFirst[index - 1] ?? null,
        older: newestFirst[index + 1] ?? null,
    }));
}

/** `2026年6月23日` */
export function formatDate(date: Date): string {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 机器可读的 `2026-06-23`，用于 `<time datetime>` */
export function isoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/** 年份，列表页分组用 */
export function yearOf(date: Date): number {
    return date.getFullYear();
}

/**
 * 阅读时长（分钟）。frontmatter 里写了 `minutes` 就用它，否则按正文长度估算。
 * 中文按 400 字/分钟粗估，只求数量级正确。
 */
export function readingMinutes(post: BlogPost): number {
    if (post.data.minutes) return post.data.minutes;
    const chars = (post.body ?? "").replace(/\s+/g, "").length;
    return Math.max(1, Math.round(chars / 400));
}

/** 按年份分组（年份倒序，组内保持传入顺序）。传入的应当是倒序数组。 */
export function groupByYear(posts: BlogPost[]): { year: number; posts: BlogPost[] }[] {
    const groups: { year: number; posts: BlogPost[] }[] = [];
    for (const post of posts) {
        const year = yearOf(post.data.date);
        const last = groups[groups.length - 1];
        if (last && last.year === year) {
            last.posts.push(post);
        } else {
            groups.push({ year, posts: [post] });
        }
    }
    return groups;
}
