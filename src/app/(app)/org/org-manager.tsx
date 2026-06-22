"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Building2,
  Users,
  UserPlus,
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  Inbox,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  SYSTEM_ROLE_LABEL,
  SYSTEM_ROLE_VALUES,
  systemRoleClass,
} from "@/lib/labels";
import {
  createUserAction,
  createDepartmentAction,
  type ActionState,
} from "../settings/actions";

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
type DeptVM = {
  id: string;
  name: string;
  parentId: string | null;
  _count: { users: number };
};

const fieldClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

/** 头像底色调色板：按用户 id 稳定取色，让成员目录更有辨识度。 */
const AVATAR_COLORS = [
  "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
];

function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function OrgManager({
  users,
  departments,
}: {
  users: UserVM[];
  departments: DeptVM[];
}) {
  const [selectedNode, setSelectedNode] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [userOpen, setUserOpen] = useState(false);
  const [deptOpen, setDeptOpen] = useState(false);

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
    return { total: users.length, active, leads };
  }, [users]);

  const childrenOf = useMemo(() => {
    const ids = new Set(departments.map((d) => d.id));
    const m = new Map<string, DeptVM[]>();
    for (const d of departments) {
      const key = d.parentId && ids.has(d.parentId) ? d.parentId : "ROOT";
      const arr = m.get(key);
      if (arr) arr.push(d);
      else m.set(key, [d]);
    }
    return m;
  }, [departments]);

  const countByDept = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of users)
      if (u.department)
        m.set(u.department.id, (m.get(u.department.id) ?? 0) + 1);
    return m;
  }, [users]);

  const noneCount = useMemo(
    () => users.filter((u) => !u.department).length,
    [users]
  );

  const members = useMemo(() => {
    let list = users;
    if (selectedNode === "none") list = users.filter((u) => !u.department);
    else if (selectedNode !== "all")
      list = users.filter((u) => u.department?.id === selectedNode);
    const q = query.trim().toLowerCase();
    if (q)
      list = list.filter((u) =>
        `${u.displayName ?? ""} ${u.name ?? ""} ${u.username} ${u.email ?? ""}`
          .toLowerCase()
          .includes(q)
      );
    return list;
  }, [users, selectedNode, query]);

  const selectedLabel =
    selectedNode === "all"
      ? "全部成员"
      : selectedNode === "none"
        ? "未分配部门"
        : (departments.find((d) => d.id === selectedNode)?.name ?? "部门");

  const defaultDeptId =
    selectedNode !== "all" && selectedNode !== "none" ? selectedNode : "";

  const closeUser = useCallback(() => setUserOpen(false), []);
  const closeDept = useCallback(() => setDeptOpen(false), []);

  const roots = childrenOf.get("ROOT") ?? [];

  function renderNode(dept: DeptVM): ReactNode {
    const kids = childrenOf.get(dept.id) ?? [];
    const count = countByDept.get(dept.id) ?? 0;
    const active = selectedNode === dept.id;
    return (
      <div key={dept.id}>
        <button
          type="button"
          onClick={() => setSelectedNode(dept.id)}
          className={cn(
            "relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
            active
              ? "bg-primary/10 font-medium text-primary"
              : "text-foreground/80 hover:bg-muted"
          )}
        >
          {active && (
            <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
          )}
          <Building2
            className={cn(
              "size-4 shrink-0",
              active ? "text-primary" : "text-muted-foreground"
            )}
          />
          <span className="flex-1 truncate">{dept.name}</span>
          <span
            className={cn(
              "rounded-full px-1.5 text-xs tabular-nums",
              active
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            {count}
          </span>
        </button>
        {kids.length > 0 && (
          <div className="ml-3 mt-0.5 space-y-0.5 border-l border-dashed border-border pl-2">
            {kids.map((k) => renderNode(k))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">组织管理</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            左侧选择部门，右侧查看与管理对应成员。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setDeptOpen(true)}>
            <Plus className="size-4" /> 新增部门
          </Button>
          <Button onClick={() => setUserOpen(true)}>
            <UserPlus className="size-4" /> 新增员工
          </Button>
        </div>
      </div>

      {/* 统计卡 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="成员总数"
          value={stats.total}
          tone="bg-sky-100 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300"
        />
        <StatCard
          icon={UserCheck}
          label="在职成员"
          value={stats.active}
          tone="bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
        />
        <StatCard
          icon={ShieldCheck}
          label="管理/主管"
          value={stats.leads}
          tone="bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300"
        />
        <StatCard
          icon={Building2}
          label="部门数"
          value={departments.length}
          tone="bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300"
        />
      </div>

      {/* 主区：左部门树 + 右成员 */}
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* 左：组织架构树 */}
        <aside className="bg-card h-fit rounded-xl border p-2">
          <p className="text-muted-foreground px-2 py-1.5 text-xs font-medium">
            组织架构
          </p>
          <div className="space-y-0.5">
            <NodeButton
              active={selectedNode === "all"}
              onClick={() => setSelectedNode("all")}
              icon={Users}
              label="全部成员"
              count={users.length}
            />
            {roots.map((d) => renderNode(d))}
            <NodeButton
              active={selectedNode === "none"}
              onClick={() => setSelectedNode("none")}
              icon={Inbox}
              label="未分配部门"
              count={noneCount}
            />
          </div>
        </aside>

        {/* 右：成员详情 */}
        <section className="bg-card overflow-hidden rounded-xl border">
          <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <h2 className="font-medium">{selectedLabel}</h2>
            <span className="text-muted-foreground text-xs">
              {members.length} 人
            </span>
            <div className="relative ml-auto">
              <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索姓名/账号/邮箱"
                className="bg-background h-8 w-48 rounded-md border pl-8 pr-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </header>
          {members.length === 0 ? (
            <div className="text-muted-foreground px-4 py-16 text-center text-sm">
              该范围暂无成员。
              <button
                type="button"
                onClick={() => setUserOpen(true)}
                className="text-primary ml-1 hover:underline"
              >
                新增员工
              </button>
            </div>
          ) : (
            <div className="divide-y">
              {members.map((u) => {
                const name = u.displayName || u.name || u.username;
                return (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                        avatarColor(u.id)
                      )}
                    >
                      {name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{name}</span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[11px]",
                            systemRoleClass(u.systemRole)
                          )}
                        >
                          {SYSTEM_ROLE_LABEL[u.systemRole] ?? u.systemRole}
                        </span>
                        {!u.isActive && (
                          <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[11px]">
                            已停用
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground truncate text-xs">
                        @{u.username}
                        {u.email ? ` · ${u.email}` : ""}
                      </div>
                    </div>
                    <span className="text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-[11px]">
                      {u.department ? u.department.name : "未分配"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* 新增员工弹框 */}
      <Dialog
        open={userOpen}
        onClose={closeUser}
        title="新增员工"
        description="创建后即可被加入项目并承接任务。"
      >
        <AddUserForm
          departments={departments}
          defaultDeptId={defaultDeptId}
          onSuccess={closeUser}
        />
      </Dialog>

      {/* 新增部门弹框 */}
      <Dialog
        open={deptOpen}
        onClose={closeDept}
        title="新增部门"
        description="可选择上级部门以形成层级。"
      >
        <AddDeptForm departments={departments} onSuccess={closeDept} />
      </Dialog>
    </div>
  );
}

function NodeButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-foreground/80 hover:bg-muted"
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
      )}
      <Icon
        className={cn(
          "size-4 shrink-0",
          active ? "text-primary" : "text-muted-foreground"
        )}
      />
      <span className="flex-1 truncate">{label}</span>
      <span
        className={cn(
          "rounded-full px-1.5 text-xs tabular-nums",
          active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
        )}
      >
        {count}
      </span>
    </button>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="bg-card flex items-center gap-3 rounded-xl border p-4">
      <div
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-lg",
          tone
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="text-muted-foreground text-xs">{label}</div>
        <div className="text-2xl font-bold leading-tight tracking-tight">
          {value}
        </div>
      </div>
    </div>
  );
}

function AddUserForm({
  departments,
  defaultDeptId,
  onSuccess,
}: {
  departments: DeptVM[];
  defaultDeptId: string;
  onSuccess: () => void;
}) {
  const [state, action, pending] = useActionState<
    ActionState | undefined,
    FormData
  >(createUserAction, undefined);

  useEffect(() => {
    if (state?.ok) onSuccess();
  }, [state, onSuccess]);

  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input name="displayName" placeholder="姓名" className={fieldClass} required />
        <input name="username" placeholder="登录账号" className={fieldClass} required />
      </div>
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
      <div className="grid grid-cols-2 gap-3">
        <select name="systemRole" defaultValue="DEVELOPER" className={fieldClass}>
          {SYSTEM_ROLE_VALUES.map((r) => (
            <option key={r} value={r}>
              {SYSTEM_ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <select
          name="departmentId"
          defaultValue={defaultDeptId}
          className={fieldClass}
        >
          <option value="">无部门</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? "创建中…" : "创建员工"}
        </Button>
      </div>
    </form>
  );
}

function AddDeptForm({
  departments,
  onSuccess,
}: {
  departments: DeptVM[];
  onSuccess: () => void;
}) {
  const [state, action, pending] = useActionState<
    ActionState | undefined,
    FormData
  >(createDepartmentAction, undefined);

  useEffect(() => {
    if (state?.ok) onSuccess();
  }, [state, onSuccess]);

  return (
    <form action={action} className="space-y-3">
      <input name="name" placeholder="部门名称" className={fieldClass} required />
      <select name="parentId" defaultValue="" className={fieldClass}>
        <option value="">无上级部门（顶级）</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? "创建中…" : "创建部门"}
        </Button>
      </div>
    </form>
  );
}
