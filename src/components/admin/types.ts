/**
 * 后台管理界面的共享类型与纯函数工具。
 *
 * 这些类型刻意手写而不是从 better-auth 推导：
 * 插件端点的推断类型（`StrictEndpoint` 那一串）可读性极差，且会把 UI 绑死在
 * 库的内部实现上。这里只描述「界面真正会读写的字段」，与数据库列一一对应。
 */

/** better-auth `user` 表在界面侧用到的字段。日期经 HTTP 传输后是 ISO 字符串。 */
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: string;
  updatedAt: string;
  /** 支持多值，逗号分隔（如 `"admin,editor"`）。存量用户可能为 null。 */
  role?: string | null;
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: string | null;
  username?: string | null;
  displayUsername?: string | null;
}

/** better-auth `session` 表在界面侧用到的字段。 */
export interface AdminSession {
  id: string;
  token: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** 非空表示这条会话是管理员模拟出来的。 */
  impersonatedBy?: string | null;
}

/** 目前只使用 better-auth 的默认角色集（`defaultRole: "user"` / `adminRoles: ["admin"]`）。 */
export type RoleValue = "user" | "admin";

export const ROLE_OPTIONS: ReadonlyArray<{ value: RoleValue; label: string }> = [
  { value: "user", label: "普通用户" },
  { value: "admin", label: "管理员" },
];

const ROLE_LABELS: Record<string, string> = {
  user: "普通用户",
  admin: "管理员",
};

/** `"admin,editor"` → `["admin", "editor"]`。 */
export function parseRoles(role?: string | null): string[] {
  if (!role) return [];
  return role
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** 把多值角色渲染成中文标签串，未知角色原样保留。 */
export function formatRoles(role?: string | null): string {
  const roles = parseRoles(role);
  if (roles.length === 0) return "普通用户";
  return roles.map((item) => ROLE_LABELS[item] ?? item).join("、");
}

/**
 * 角色下拉当前的选中值。
 *
 * 只认识 `admin` / `user` 两种：多值或未知角色一律落到 `user` 展示，
 * 因此**下拉框在保存前不应被视为权威** —— 界面只在用户主动改选时才提交角色。
 */
export function editableRole(role?: string | null): RoleValue {
  return parseRoles(role).includes("admin") ? "admin" : "user";
}

/** 封禁是否仍然生效（`banExpires` 为空表示永久封禁）。 */
export function isBanned(user: AdminUser): boolean {
  if (!user.banned) return false;
  if (!user.banExpires) return true;
  return new Date(user.banExpires).getTime() > Date.now();
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 相对时间，用于「N 分钟前」这类轻量提示。 */
export function formatRelative(value?: string | null): string {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Math.round((Date.now() - then) / 1000);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
  return formatDate(value);
}

/** 从 UA 里抽出可读的浏览器/系统标签，抽不出来就返回原始串（截断）。 */
export function describeUserAgent(ua?: string | null): string {
  if (!ua) return "未知设备";

  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : /curl\//i.test(ua) ? "curl"
    : null;

  const os =
    /Windows NT/.test(ua) ? "Windows"
    : /Macintosh|Mac OS X/.test(ua) ? "macOS"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad/.test(ua) ? "iOS"
    : /Linux/.test(ua) ? "Linux"
    : null;

  if (!browser && !os) return ua.length > 60 ? `${ua.slice(0, 60)}…` : ua;
  return [browser, os].filter(Boolean).join(" · ");
}

/**
 * better-auth 的错误码 → 中文。
 *
 * 客户端的 `error.message` 通常就是错误码本身（大写蛇形），但部分路径会返回
 * 人类可读的英文句子。命中字典就翻译，否则原样透出 —— 宁可显示英文，
 * 也不要吞掉信息编一个假的。
 */
const ERROR_MESSAGES: Record<string, string> = {
  BANNED_USER: "该账号已被封禁",
  USER_ALREADY_EXISTS: "该邮箱已被占用",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "该邮箱已被占用",
  FAILED_TO_CREATE_USER: "创建用户失败",
  YOU_CANNOT_BAN_YOURSELF: "不能封禁自己",
  YOU_CANNOT_REMOVE_YOURSELF: "不能删除自己",
  YOU_CANNOT_IMPERSONATE_ADMINS: "不能模拟登录另一位管理员",
  YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "当前账号无权新建用户",
  YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "当前账号无权查看用户列表",
  YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS: "当前账号无权查看会话",
  YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "当前账号无权封禁用户",
  YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS: "当前账号无权模拟登录",
  YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS: "当前账号无权吊销会话",
  YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "当前账号无权删除用户",
  YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD: "当前账号无权设置密码",
  YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE: "当前账号无权变更角色",
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "当前账号无权修改用户资料",
  YOU_ARE_NOT_ALLOWED_TO_GET_USER: "当前账号无权查看该用户",
  YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL: "当前账号无权修改邮箱",
  YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE: "包含当前角色集中不存在的字段或取值",
  INVALID_ROLE_TYPE: "角色取值非法",
  NO_DATA_TO_UPDATE: "没有需要更新的内容",
  PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER: "密码不能通过资料接口修改",
  INVALID_EMAIL: "邮箱格式不正确",
  INVALID_PASSWORD: "密码不符合要求",
  PASSWORD_TOO_SHORT: "密码太短",
  PASSWORD_TOO_LONG: "密码太长",
  SESSION_EXPIRED: "会话已过期，请重新登录",
  UNAUTHORIZED: "未获得授权，请重新登录",
  FORBIDDEN: "没有执行该操作的权限",
  EMAIL_NOT_VERIFIED: "邮箱尚未验证",
  USERNAME_IS_ALREADY_TAKEN: "用户名已被占用",
  USERNAME_TOO_SHORT: "用户名太短",
  USERNAME_TOO_LONG: "用户名太长",
  INVALID_USERNAME: "用户名不合法",
};

export function describeError(error: unknown): string {
  if (!error) return "未知错误";

  const raw =
    typeof error === "string"
      ? error
      : (error as { message?: string }).message ?? JSON.stringify(error);

  if (ERROR_MESSAGES[raw]) return ERROR_MESSAGES[raw];

  // 错误码可能带前缀或后缀描述，做一次包含匹配兜底。
  for (const [code, message] of Object.entries(ERROR_MESSAGES)) {
    if (raw.includes(code)) return message;
  }

  return raw;
}
