import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Sparkles } from "lucide-react";

import { requireFullUser, canLeadProject } from "@/lib/access";
import { getRequirementForUser } from "@/lib/requirements";
import { listTasksByRequirement } from "@/lib/tasks";
import { findActiveJob } from "@/lib/jobs";
import { userDisplayName } from "@/lib/org";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PRIORITY_LABEL,
  REQUIREMENT_STATUS_LABEL,
  TASK_STATUS_LABEL,
  TASK_TYPE_LABEL,
  requirementStatusClass,
  taskStatusClass,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import { RequirementActions } from "./requirement-actions";
import { RequirementManage } from "./requirement-manage";

function lines(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default async function RequirementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireFullUser();
  const req = await getRequirementForUser(id, user.id);
  if (!req) notFound();

  const scope = lines(req.scope);
  const outOfScope = lines(req.outOfScope);
  const acceptance = lines(req.acceptanceCriteria);
  const tasks = await listTasksByRequirement(req.id);
  const canLead = await canLeadProject(req.project.id, user);
  // 进行中的拆解作业：进入页面时恢复进度（离开页面也在后台跑）。
  const breakdownJob =
    tasks.length === 0
      ? await findActiveJob({
          type: "REQUIREMENT_BREAKDOWN",
          requirementId: req.id,
        })
      : null;
  const taskVMs = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    taskType: t.taskType,
    status: t.status,
    assigneeName: t.assignee ? userDisplayName(t.assignee) : null,
    dueTime: t.dueTime ? t.dueTime.toISOString().slice(0, 10) : null,
  }));
  const canConfirm =
    canLead &&
    req.openQuestions === 0 &&
    (["CLARIFYING", "REVIEWING"] as string[]).includes(req.status);
  const canMarkOnline =
    canLead && (["ACCEPTING", "TESTING"] as string[]).includes(req.status);
  const editInitial = {
    title: req.title,
    priority: req.priority,
    background: req.background ?? "",
    problem: req.problem ?? "",
    targetUser: req.targetUser ?? "",
    businessGoal: req.businessGoal ?? "",
    scope: req.scope ?? "",
    outOfScope: req.outOfScope ?? "",
    userStory: req.userStory ?? "",
    acceptanceCriteria: req.acceptanceCriteria ?? "",
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/requirement"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> 返回需求中心
        </Link>
      </div>

      {/* 头部 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{req.title}</h1>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                requirementStatusClass(req.status)
              )}
            >
              {REQUIREMENT_STATUS_LABEL[req.status] ?? req.status}
            </span>
            {req.isAiGenerated && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                <Sparkles className="size-3" /> AI 生成
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {req.requirementCode} · 优先级 {PRIORITY_LABEL[req.priority]} ·
            所属项目{" "}
            <Link
              href={`/project/${req.project.id}`}
              className="text-primary hover:underline"
            >
              {req.project.name}
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/requirement/${req.id}/export`}
            download
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            title="导出需求文档（Markdown）"
          >
            <Download className="size-4" />
            导出
          </a>
          <RequirementManage
            requirementId={req.id}
            initial={editInitial}
            canDelete={canLead}
          />
        </div>
      </div>

      {req.openQuestions > 0 && (
        <div className="rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          AI 判断仍有 {req.openQuestions} 个待确认问题。你可以点右上角
          <span className="font-medium">「编辑」</span>就地补全（补齐背景 / 目标 /
          范围 / 验收即可进入评审），或回到 AI 对齐室继续澄清。
        </div>
      )}

      {/* 需求说明 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">需求说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field label="业务背景" value={req.background} />
          <Field label="当前问题" value={req.problem} />
          <Field label="目标用户" value={req.targetUser} />
          <Field label="业务目标" value={req.businessGoal} />
          <ListField label="功能范围" items={scope} />
          <ListField label="不做范围" items={outOfScope} />
          <Field label="用户故事" value={req.userStory} />
          <ListField label="验收标准" items={acceptance} />
        </CardContent>
      </Card>

      {/* 已拆解任务（只读概览；分配与推进在任务看板完成，遵循单一职责） */}
      {taskVMs.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">
              已拆解任务（{taskVMs.length}）
            </CardTitle>
            <Link
              href={`/kanban?project=${req.project.id}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              前往看板分配与推进 →
            </Link>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {taskVMs.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-6 py-3">
                <Link
                  href={`/task/${t.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary hover:underline"
                >
                  {t.title}
                </Link>
                {t.taskType && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {TASK_TYPE_LABEL[t.taskType] ?? t.taskType}
                  </span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t.assigneeName ?? "未分配"}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    taskStatusClass(t.status)
                  )}
                >
                  {TASK_STATUS_LABEL[t.status] ?? t.status}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* AI 澄清记录 */}
      {req.originalContent && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI 澄清记录</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-lg bg-muted/40 p-4 text-xs text-muted-foreground">
              {req.originalContent}
            </pre>
          </CardContent>
        </Card>
      )}

      <RequirementActions
        requirementId={req.id}
        projectId={req.project.id}
        hasTasks={tasks.length > 0}
        canConfirm={canConfirm}
        canMarkOnline={canMarkOnline}
        breakdownJobId={breakdownJob?.id ?? null}
      />
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <div className="text-sm font-medium">{label}</div>
      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
        {value || "—"}
      </p>
    </div>
  );
}

function ListField({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-sm font-medium">{label}</div>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
