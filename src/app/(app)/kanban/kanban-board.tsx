"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarClock,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import {
  KANBAN_STATUSES,
  PRIORITY_LABEL,
  SYSTEM_ROLE_LABEL,
  TASK_STATUS_LABEL,
  TASK_TYPE_LABEL,
  mapSuggestedRole,
  taskStatusClass,
} from "@/lib/labels";
import {
  assignTask,
  assignTasksBatch,
  createTask,
  updateTaskStatus,
} from "./actions";

export interface AssignMember {
  id: string;
  name: string;
  /** 项目内角色（SystemRole 值），用于按 AI 建议角色匹配候选人。 */
  role: string;
}

export interface KanbanTask {
  id: string;
  taskCode: string;
  title: string;
  status: string;
  priority: string;
  taskType: string | null;
  isAiGenerated: boolean;
  estimatedHours: number | null;
  requirement: { id: string; title: string } | null;
  projectId: string;
  projectName: string;
  suggestedRole: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  dueTime: string | null;
}

interface ProjectOption {
  id: string;
  name: string;
}

export interface CreatableRequirement {
  id: string;
  title: string;
  projectId: string;
}

interface AutoAssignItem {
  taskId: string;
  title: string;
  role: string;
  member: AssignMember | null;
}

interface AutoAssignPlan {
  projectId: string;
  projectName: string;
  items: AutoAssignItem[];
}

const ALL_STATUSES = Object.keys(TASK_STATUS_LABEL);
const fieldClass =
  "h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
const cardFieldClass =
  "h-8 rounded-md border bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-[2px] focus-visible:ring-ring/50 disabled:opacity-60";

export function KanbanBoard({
  tasks,
  projects,
  selectedProjectId,
  members,
  leadProjectIds,
  requirements,
}: {
  tasks: KanbanTask[];
  projects: ProjectOption[];
  selectedProjectId?: string;
  members: AssignMember[];
  leadProjectIds: string[];
  requirements: CreatableRequirement[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<AutoAssignPlan | null>(null);
  const [view, setView] = useState<"board" | "list">("board");
  const [reqFilter, setReqFilter] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    projectId: "",
    title: "",
    requirementId: "",
    taskType: "",
    priority: "P2",
    assigneeId: "",
    estimatedHours: "",
    dueTime: "",
  });

  const leadSet = useMemo(() => new Set(leadProjectIds), [leadProjectIds]);
  const leadProjects = useMemo(
    () => projects.filter((p) => leadSet.has(p.id)),
    [projects, leadSet]
  );

  // 需求筛选下拉项：来自当前任务集中出现过的需求（+「未关联」）。
  const reqFilterOptions = useMemo(() => {
    const m = new Map<string, string>();
    let hasNone = false;
    for (const t of tasks) {
      if (t.requirement) m.set(t.requirement.id, t.requirement.title);
      else hasNone = true;
    }
    return { opts: Array.from(m, ([id, title]) => ({ id, title })), hasNone };
  }, [tasks]);

  // 按需求筛选后的任务集（看板列 / 列表分组 / 计数都基于它）。
  const visibleTasks = useMemo(() => {
    if (!reqFilter) return tasks;
    if (reqFilter === "__none__") return tasks.filter((t) => !t.requirement);
    return tasks.filter((t) => t.requirement?.id === reqFilter);
  }, [tasks, reqFilter]);

  // 列表视图：按需求分组；未关联需求归入「未关联需求」。
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { key: string; title: string; href: string | null; tasks: KanbanTask[] }
    >();
    for (const t of visibleTasks) {
      const key = t.requirement?.id ?? "__none__";
      if (!map.has(key)) {
        map.set(key, {
          key,
          title: t.requirement ? t.requirement.title : "未关联需求",
          href: t.requirement ? `/requirement/${t.requirement.id}` : null,
          tasks: [],
        });
      }
      map.get(key)!.tasks.push(t);
    }
    return Array.from(map.values());
  }, [visibleTasks]);

  const present = Array.from(new Set(tasks.map((t) => t.status)));
  const extra = present.filter(
    (s) => !(KANBAN_STATUSES as readonly string[]).includes(s)
  );
  const columns = [...KANBAN_STATUSES, ...extra];

  // 仅当选中单个项目、当前用户是该项目主管、且存在未分配任务时，才能一键分配。
  const canAutoAssign =
    !!selectedProjectId &&
    leadSet.has(selectedProjectId) &&
    tasks.some((t) => t.projectId === selectedProjectId && !t.assigneeId);

  function onFilterChange(value: string) {
    setPlan(null);
    setReqFilter("");
    router.push(value ? `/kanban?project=${value}` : "/kanban");
  }

  function setField<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openCreate() {
    const def =
      (selectedProjectId && leadSet.has(selectedProjectId)
        ? selectedProjectId
        : leadProjects[0]?.id) ?? "";
    setForm({
      projectId: def,
      title: "",
      requirementId: "",
      taskType: "",
      priority: "P2",
      assigneeId: "",
      estimatedHours: "",
      dueTime: "",
    });
    setCreateErr(null);
    setCreateOpen(true);
  }

  async function submitCreate() {
    if (!form.projectId) {
      setCreateErr("请选择所属项目。");
      return;
    }
    if (!form.title.trim()) {
      setCreateErr("请填写任务标题。");
      return;
    }
    setCreating(true);
    setCreateErr(null);
    const res = await createTask({
      projectId: form.projectId,
      title: form.title.trim(),
      requirementId: form.requirementId || null,
      taskType: form.taskType || null,
      priority: form.priority,
      assigneeId: form.assigneeId || null,
      estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : null,
      dueTime: form.dueTime || null,
    });
    if (res.error) {
      setCreateErr(res.error);
      setCreating(false);
      return;
    }
    setCreating(false);
    setCreateOpen(false);
    router.refresh();
  }

  function onStatusChange(taskId: string, status: string) {
    setError(null);
    startTransition(async () => {
      const res = await updateTaskStatus(taskId, status);
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  function onAssigneeChange(task: KanbanTask, assigneeId: string) {
    setError(null);
    startTransition(async () => {
      const res = await assignTask({
        taskId: task.id,
        assigneeId: assigneeId || null,
        dueTime: task.dueTime,
      });
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  function onDueChange(task: KanbanTask, due: string) {
    setError(null);
    startTransition(async () => {
      const res = await assignTask({
        taskId: task.id,
        assigneeId: task.assigneeId,
        dueTime: due || null,
      });
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  // 一键分配：按 AI 拆解给出的「建议承接角色」匹配项目成员，同角色多人时轮转以均衡负载。
  function buildPlan() {
    if (!selectedProjectId) return;
    const projectName =
      projects.find((p) => p.id === selectedProjectId)?.name ?? "本项目";
    const cursor: Record<string, number> = {};
    const items: AutoAssignItem[] = tasks
      .filter((t) => t.projectId === selectedProjectId && !t.assigneeId)
      .map((t) => {
        const role = mapSuggestedRole(t.suggestedRole);
        const candidates = members.filter((m) => m.role === role);
        let member: AssignMember | null = null;
        if (candidates.length) {
          const i = cursor[role] ?? 0;
          member = candidates[i % candidates.length];
          cursor[role] = i + 1;
        }
        return { taskId: t.id, title: t.title, role, member };
      });
    setPlan({ projectId: selectedProjectId, projectName, items });
  }

  function confirmPlan() {
    if (!plan) return;
    const assignments = plan.items
      .filter((i) => i.member)
      .map((i) => ({ taskId: i.taskId, assigneeId: i.member!.id }));
    if (!assignments.length) {
      setPlan(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await assignTasksBatch({
        projectId: plan.projectId,
        assignments,
      });
      if (res.error) setError(res.error);
      setPlan(null);
      router.refresh();
    });
  }

  function renderAssignee(t: KanbanTask, selectClassName = "min-w-0 flex-1") {
    if (leadSet.has(t.projectId)) {
      return (
        <select
          value={t.assigneeId ?? ""}
          onChange={(e) => onAssigneeChange(t, e.target.value)}
          disabled={pending}
          className={cn(cardFieldClass, selectClassName)}
          title="负责人"
        >
          <option value="">未分配</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      );
    }
    return t.assigneeName ? (
      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
        <UserRound className="size-3" /> {t.assigneeName}
      </span>
    ) : (
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-950 dark:text-amber-300">
        未分配
      </span>
    );
  }

  function renderDue(t: KanbanTask) {
    if (leadSet.has(t.projectId)) {
      return (
        <input
          type="date"
          value={t.dueTime ? t.dueTime.slice(0, 10) : ""}
          onChange={(e) => onDueChange(t, e.target.value)}
          disabled={pending}
          className={cn(cardFieldClass, "w-[7.5rem] shrink-0")}
          title="截止日期"
        />
      );
    }
    return t.dueTime ? (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <CalendarClock className="size-3" />
        {t.dueTime.slice(0, 10)}
      </span>
    ) : (
      <span className="text-[11px] text-muted-foreground">—</span>
    );
  }

  function renderStatus(t: KanbanTask, full: boolean) {
    return (
      <select
        value={t.status}
        onChange={(e) => onStatusChange(t.id, e.target.value)}
        disabled={pending}
        className={cn(
          "rounded-md border px-2 py-1 text-xs outline-none",
          full ? "mt-2 w-full" : "w-[6.5rem] shrink-0",
          taskStatusClass(t.status)
        )}
      >
        {ALL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {TASK_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">任务看板</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            共 {visibleTasks.length} 个任务{pending ? " · 更新中…" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {leadProjects.length > 0 && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              <Plus className="size-4" /> 新建任务
            </button>
          )}
          {canAutoAssign && (
            <button
              onClick={buildPlan}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              <Sparkles className="size-4" /> AI 一键分配
            </button>
          )}
          <div className="flex items-center rounded-md border p-0.5">
            <button
              onClick={() => setView("board")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2.5 py-1 text-sm",
                view === "board"
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="size-4" /> 看板
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2.5 py-1 text-sm",
                view === "list"
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="size-4" /> 列表
            </button>
          </div>
          <select
            value={selectedProjectId ?? ""}
            onChange={(e) => onFilterChange(e.target.value)}
            className={fieldClass}
          >
            <option value="">全部项目</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {(reqFilterOptions.opts.length > 0 || reqFilterOptions.hasNone) && (
            <select
              value={reqFilter}
              onChange={(e) => setReqFilter(e.target.value)}
              className={fieldClass}
              title="按需求筛选"
            >
              <option value="">全部需求</option>
              {reqFilterOptions.opts.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
              {reqFilterOptions.hasNone && (
                <option value="__none__">未关联需求</option>
              )}
            </select>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/40">
          {error}
        </p>
      )}

      {plan && (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h3 className="font-medium">AI 一键分配预览 · {plan.projectName}</h3>
            <button
              onClick={() => setPlan(null)}
              className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted"
              title="取消"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            依据 AI 拆解时给出的「建议承接角色」匹配项目成员。任务分配为关键动作，请人工核对后再落库。
          </p>
          <ul className="divide-y rounded-lg border">
            {plan.items.map((i) => (
              <li
                key={i.taskId}
                className="flex items-center gap-2 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{i.title}</span>
                <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
                  {SYSTEM_ROLE_LABEL[i.role] ?? i.role}
                </span>
                {i.member ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground">
                    <UserRound className="size-3.5" /> {i.member.name}
                  </span>
                ) : (
                  <span className="shrink-0 text-amber-600">
                    无匹配成员（跳过）
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setPlan(null)}
              disabled={pending}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-60"
            >
              取消
            </button>
            <button
              onClick={confirmPlan}
              disabled={pending || plan.items.every((i) => !i.member)}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              确认分配（{plan.items.filter((i) => i.member).length}）
            </button>
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="rounded-xl border bg-card py-16 text-center text-muted-foreground">
          还没有任务。到「需求中心」打开一条需求，点击
          <span className="mx-1 font-medium text-foreground">AI 任务拆解</span>
          即可生成任务，或点右上角
          <span className="mx-1 font-medium text-foreground">新建任务</span>
          手动添加。
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className="rounded-xl border bg-card py-16 text-center text-muted-foreground">
          当前筛选条件下没有任务。
        </div>
      ) : view === "board" ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((status) => {
            const colTasks = visibleTasks.filter((t) => t.status === status);
            return (
              <div
                key={status}
                className="flex w-72 shrink-0 flex-col rounded-xl border bg-muted/20"
              >
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="text-sm font-medium">
                    {TASK_STATUS_LABEL[status] ?? status}
                  </span>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                    {colTasks.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2 p-2">
                  {colTasks.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-lg border bg-card p-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/task/${t.id}`}
                          className="text-sm font-medium leading-snug hover:text-primary hover:underline"
                        >
                          {t.title}
                        </Link>
                        {t.isAiGenerated && (
                          <Sparkles className="size-3.5 shrink-0 text-primary" />
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                        {t.taskType && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                            {TASK_TYPE_LABEL[t.taskType] ?? t.taskType}
                          </span>
                        )}
                        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                          {PRIORITY_LABEL[t.priority] ?? t.priority}
                        </span>
                        {t.estimatedHours != null && (
                          <span className="text-muted-foreground">
                            {t.estimatedHours}h
                          </span>
                        )}
                      </div>
                      {t.requirement && (
                        <Link
                          href={`/requirement/${t.requirement.id}`}
                          className="mt-2 block truncate text-xs text-muted-foreground hover:text-primary hover:underline"
                          title={t.requirement.title}
                        >
                          需求：{t.requirement.title}
                        </Link>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {renderAssignee(t)}
                        {renderDue(t)}
                      </div>
                      {renderStatus(t, true)}
                    </div>
                  ))}
                  {colTasks.length === 0 && (
                    <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                      暂无
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div
              key={g.key}
              className="overflow-hidden rounded-xl border bg-card"
            >
              <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2">
                {g.href ? (
                  <Link
                    href={g.href}
                    className="truncate text-sm font-medium hover:text-primary hover:underline"
                  >
                    需求：{g.title}
                  </Link>
                ) : (
                  <span className="truncate text-sm font-medium text-muted-foreground">
                    {g.title}
                  </span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {g.tasks.length} 个任务
                </span>
              </div>
              <div className="divide-y">
                {g.tasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5"
                  >
                    <Link
                      href={`/task/${t.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary hover:underline"
                    >
                      {t.title}
                    </Link>
                    <div className="hidden shrink-0 items-center gap-1.5 text-[11px] sm:flex">
                      {t.taskType && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                          {TASK_TYPE_LABEL[t.taskType] ?? t.taskType}
                        </span>
                      )}
                      <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                        {PRIORITY_LABEL[t.priority] ?? t.priority}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {renderAssignee(t, "w-28")}
                      {renderDue(t)}
                    </div>
                    {renderStatus(t, false)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={createOpen}
        onClose={() => !creating && setCreateOpen(false)}
        title="新建任务"
        description="手动添加任务到看板。可选关联需求、负责人、工时与截止日。"
        className="max-w-lg"
      >
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          <label className="block space-y-1">
            <span className="text-sm font-medium">所属项目 *</span>
            <select
              value={form.projectId}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  projectId: e.target.value,
                  requirementId: "",
                }))
              }
              className={cn(fieldClass, "w-full")}
            >
              <option value="" disabled>
                选择项目
              </option>
              {leadProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">任务标题 *</span>
            <input
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="一句话描述要做的事"
              className={cn(fieldClass, "w-full")}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">关联需求</span>
            <select
              value={form.requirementId}
              onChange={(e) => setField("requirementId", e.target.value)}
              className={cn(fieldClass, "w-full")}
            >
              <option value="">不关联</option>
              {requirements
                .filter((r) => r.projectId === form.projectId)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium">任务类型</span>
              <select
                value={form.taskType}
                onChange={(e) => setField("taskType", e.target.value)}
                className={cn(fieldClass, "w-full")}
              >
                <option value="">未指定</option>
                {Object.entries(TASK_TYPE_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">优先级</span>
              <select
                value={form.priority}
                onChange={(e) => setField("priority", e.target.value)}
                className={cn(fieldClass, "w-full")}
              >
                {Object.entries(PRIORITY_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium">负责人</span>
              <select
                value={form.assigneeId}
                onChange={(e) => setField("assigneeId", e.target.value)}
                className={cn(fieldClass, "w-full")}
              >
                <option value="">未分配</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">截止日期</span>
              <input
                type="date"
                value={form.dueTime}
                onChange={(e) => setField("dueTime", e.target.value)}
                className={cn(fieldClass, "w-full")}
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-sm font-medium">预估工时（小时）</span>
            <input
              type="number"
              min={0}
              step="0.5"
              value={form.estimatedHours}
              onChange={(e) => setField("estimatedHours", e.target.value)}
              placeholder="可选"
              className={cn(fieldClass, "w-full")}
            />
          </label>
        </div>
        {createErr && (
          <p className="mt-3 text-sm text-red-600">{createErr}</p>
        )}
        <div className="mt-4 flex items-center justify-end gap-2 border-t pt-4">
          <button
            onClick={() => setCreateOpen(false)}
            disabled={creating}
            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-60"
          >
            取消
          </button>
          <button
            onClick={submitCreate}
            disabled={creating}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {creating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {creating ? "创建中…" : "创建任务"}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
