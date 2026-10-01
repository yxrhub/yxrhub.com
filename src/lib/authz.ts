/**
 * 管理员判定。
 *
 * `user.role` 是唯一权威来源 —— better-auth 的 admin 插件默认 `adminRoles` 为 `["admin"]`。
 *
 * 两个容易写错的点：
 * 1. `role` 支持**多值**（逗号分隔，如 `"admin,editor"`），所以要按分隔后精确匹配；
 *    用 `role.includes("admin")` 会把 `"superadmin"` 之类的值误判为管理员。
 * 2. 存量用户的 `role` 为 `NULL`，按插件约定视同普通用户（其 `defaultRole` 为 `"user"`）。
 */
export function isAdmin(user: { role?: string | null } | null | undefined): boolean {
  if (!user?.role) return false;

  return user.role
    .split(",")
    .map((role) => role.trim())
    .includes("admin");
}
