"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, UserPlus } from "lucide-react";

import {
  PROJECT_ROLE_VALUES,
  SYSTEM_ROLE_LABEL,
  systemRoleClass,
} from "@/lib/labels";
import {
  addProjectMemberAction,
  removeProjectMemberAction,
  updateProjectMemberRoleAction,
} from "../members-actions";
import { SearchableSelect } from "@/components/ui/searchable-select";

export type MemberVM = {
  userId: string;
  role: string;
  name: string;
  username: string;
  email: string | null;
  systemRole: string;
};

export type AddableVM = { id: string; name: string; username: string };

const fieldClass =
  "rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary";

export function ProjectMembersPanel({
  projectId,
  members,
  addable,
  canManage,
}: {
  projectId: string;
  members: MemberVM[];
  addable: AddableVM[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState("DEVELOPER");

  function run(fn: () => Promise<{ error?: string; ok?: boolean }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">项目成员</h2>
          <p className="text-sm text-muted-foreground">
            管理成员与项目角色。AI 拆解任务时会按角色（含 UI 设计）推荐承接人。
          </p>
        </div>
        <span className="text-sm text-muted-foreground">{members.length} 人</span>
      </div>

      {canManage && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
          <UserPlus className="size-4 text-primary" />
          <SearchableSelect
            className="min-w-56"
            value={newUserId}
            onChange={setNewUserId}
            placeholder="选择用户…"
            searchPlaceholder="搜索姓名 / 账号…"
            emptyText="没有可添加的用户"
            options={addable.map((u) => ({
              value: u.id,
              label: u.name,
              hint: `@${u.username}`,
            }))}
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            className={fieldClass}
          >
            {PROJECT_ROLE_VALUES.map((r) => (
              <option key={r} value={r}>
                {SYSTEM_ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button
            disabled={!newUserId || pending}
            onClick={() =>
              run(async () => {
                const res = await addProjectMemberAction({
                  projectId,
                  userId: newUserId,
                  role: newRole,
                });
                if (!res.error) setNewUserId("");
                return res;
              })
            }
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            添加成员
          </button>
          {addable.length === 0 && (
            <span className="text-xs text-muted-foreground">
              没有更多可添加的用户，去「系统设置 → 用户管理」新增（如 UI 设计）。
            </span>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="divide-y rounded-xl border bg-card">
        {members.map((m) => (
          <div key={m.userId} className="flex items-center gap-3 px-4 py-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
              {m.name.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{m.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                @{m.username}
                {m.email ? ` · ${m.email}` : ""}
              </div>
            </div>
            {canManage ? (
              <select
                value={m.role}
                disabled={pending}
                onChange={(e) =>
                  run(() =>
                    updateProjectMemberRoleAction({
                      projectId,
                      userId: m.userId,
                      role: e.target.value,
                    })
                  )
                }
                className={fieldClass}
              >
                {PROJECT_ROLE_VALUES.map((r) => (
                  <option key={r} value={r}>
                    {SYSTEM_ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            ) : (
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] ${systemRoleClass(
                  m.role
                )}`}
              >
                {SYSTEM_ROLE_LABEL[m.role] ?? m.role}
              </span>
            )}
            {canManage && (
              <button
                disabled={pending}
                onClick={() =>
                  run(() =>
                    removeProjectMemberAction({ projectId, userId: m.userId })
                  )
                }
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600 disabled:opacity-60"
                title="移除成员"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
