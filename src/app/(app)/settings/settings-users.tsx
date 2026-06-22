"use client";

import { useActionState, useMemo, useState } from "react";
import {
  Building2,
  UserPlus,
  Users,
  Search,
  ShieldCheck,
  UserCheck,
  Network,
} from "lucide-react";

import {
  SYSTEM_ROLE_LABEL,
  SYSTEM_ROLE_VALUES,
  systemRoleClass,
} from "@/lib/labels";
import {
  createDepartmentAction,
  createUserAction,
  type ActionState,
} from "./actions";

type UserVM = {
  id: string;
  username: string;
  displayName: string | null;
  name: string | null;
  email: string | null;
  systemRole: string;
  isActive: boolean;
  department: { id: string; name: string } | null;
};

type DeptVM = { id: string; name: string; _count: { users: number } };

const fieldClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export function SettingsUsers({
  users,
  departments,
}: {
  users: UserVM[];
  departments: DeptVM[];
}) {
  const [userState, userAction, userPending] = useActionState<
    ActionState | undefined,
    FormData
  >(createUserAction, undefined);
  const [deptState, deptAction, deptPending] = useActionState<
    ActionState | undefined,
    FormData
  >(createDepartmentAction, undefined);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");

  const stats = useMemo(() => {
    const active = users.filter((u) => u.isActive).length;
    const leadRoles = new Set([
      "SUPER_ADMIN",
      "COMPANY_ADMIN",
      "PROJECT_OWNER",
      "TECH_OWNER",
      "PRODUCT_OWNER",
    ]);
    const leads = users.filter((u) => leadRoles.has(u.systemRole)).length;
    const byRole = new Map<string, number>();
    for (const u of users)
      byRole.set(u.systemRole, (byRole.get(u.systemRole) ?? 0) + 1);
    return { total: users.length, active, leads, byRole };
  }, [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.systemRole !== roleFilter) return false;
      if (deptFilter === "__none__" && u.department) return false;
      if (
        deptFilter &&
        deptFilter !== "__none__" &&
        u.department?.id !== deptFilter
      )
        return false;
      if (!q) return true;
      const hay = `${u.displayName ?? ""} ${u.name ?? ""} ${u.username} ${
        u.email ?? ""
      }`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, query, roleFilter, deptFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">组织管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          管理公司成员、角色与部门。成员创建后即可被加入项目并承接任务。
        </p>
      </div>

      {/* 统计卡 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users} label="成员总数" value={stats.total} />
        <StatCard icon={UserCheck} label="在职成员" value={stats.active} />
        <StatCard icon={ShieldCheck} label="管理/主管" value={stats.leads} />
        <StatCard icon={Building2} label="部门数" value={departments.length} />
      </div>

      {/* 角色分布 */}
      <section className="rounded-xl border bg-card p-4">
        <header className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Network className="size-4" />
          角色分布
        </header>
        <div className="flex flex-wrap gap-2">
          {[...stats.byRole.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([r, n]) => (
              <span
                key={r}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${systemRoleClass(
                  r
                )}`}
              >
                {SYSTEM_ROLE_LABEL[r] ?? r}
                <span className="font-semibold">{n}</span>
              </span>
            ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border bg-card lg:col-span-2">
          <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <Users className="size-4 text-primary" />
            <h2 className="font-medium">成员目录</h2>
            <span className="text-xs text-muted-foreground">
              {filtered.length}/{users.length}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索姓名/账号/邮箱"
                  className="h-8 w-44 rounded-md border bg-background pl-8 pr-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-sm outline-none focus:border-primary"
              >
                <option value="">全部角色</option>
                {[...stats.byRole.keys()].map((r) => (
                  <option key={r} value={r}>
                    {SYSTEM_ROLE_LABEL[r] ?? r}
                  </option>
                ))}
              </select>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-sm outline-none focus:border-primary"
              >
                <option value="">全部部门</option>
                <option value="__none__">无部门</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </header>
          {filtered.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              没有符合条件的成员。
            </p>
          ) : (
            <div className="divide-y">
              {filtered.map((u) => {
                const name = u.displayName || u.name || u.username;
                return (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                      {name.slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{name}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] ${systemRoleClass(
                            u.systemRole
                          )}`}
                        >
                          {SYSTEM_ROLE_LABEL[u.systemRole] ?? u.systemRole}
                        </span>
                        {!u.isActive && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            已停用
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        @{u.username}
                        {u.email ? ` · ${u.email}` : ""}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                      {u.department ? u.department.name : "未分配部门"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-4">
            <header className="mb-3 flex items-center gap-2">
              <UserPlus className="size-4 text-primary" />
              <h2 className="font-medium">新增用户</h2>
            </header>
            <form action={userAction} className="space-y-3">
              <input
                name="displayName"
                placeholder="姓名"
                className={fieldClass}
                required
              />
              <input
                name="username"
                placeholder="登录账号"
                className={fieldClass}
                required
              />
              <input
                name="email"
                type="email"
                placeholder="邮箱（可选）"
                className={fieldClass}
              />
              <input
                name="password"
                type="password"
                placeholder="初始密码（≥6 位）"
                className={fieldClass}
                required
              />
              <select
                name="systemRole"
                defaultValue="DEVELOPER"
                className={fieldClass}
              >
                {SYSTEM_ROLE_VALUES.map((r) => (
                  <option key={r} value={r}>
                    {SYSTEM_ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <select name="departmentId" defaultValue="" className={fieldClass}>
                <option value="">无部门</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              {userState?.error && (
                <p className="text-xs text-red-600">{userState.error}</p>
              )}
              {userState?.ok && (
                <p className="text-xs text-emerald-600">用户已创建</p>
              )}
              <button
                type="submit"
                disabled={userPending}
                className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {userPending ? "创建中…" : "创建用户"}
              </button>
            </form>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <header className="mb-3 flex items-center gap-2">
              <Building2 className="size-4 text-primary" />
              <h2 className="font-medium">部门</h2>
            </header>
            <div className="mb-3 space-y-1.5">
              {departments.length === 0 ? (
                <p className="text-xs text-muted-foreground">还没有部门</p>
              ) : (
                departments.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{d.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {d._count.users} 人
                    </span>
                  </div>
                ))
              )}
            </div>
            <form action={deptAction} className="flex gap-2">
              <input
                name="name"
                placeholder="新部门名称"
                className={fieldClass}
                required
              />
              <button
                type="submit"
                disabled={deptPending}
                className="shrink-0 rounded-md border px-3 py-2 text-sm disabled:opacity-60"
              >
                {deptPending ? "…" : "添加"}
              </button>
            </form>
            {deptState?.error && (
              <p className="mt-2 text-xs text-red-600">{deptState.error}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-bold tracking-tight">{value}</div>
    </div>
  );
}
