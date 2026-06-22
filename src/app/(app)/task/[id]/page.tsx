import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireFullUser } from "@/lib/access";
import { getTaskActivity, getTaskDetailForUser } from "@/lib/tasks";
import { userDisplayName } from "@/lib/org";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  OPERATION_LABEL,
  PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  TASK_TYPE_LABEL,
} from "@/lib/labels";
import {
  DevHandoffCard,
  TaskCommentForm,
  TaskStatusControl,
} from "./task-detail-actions";

export const metadata = { title: "任务详情 · TeamMindAI" };

function lines(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function fmt(d: Date): string {
  return new Date(d).toLocaleString("zh-CN", { hour12: false });
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireFullUser();
  const task = await getTaskDetailForUser(id, user.id);
  if (!task) notFound();

  const activity = await getTaskActivity(task.id);
  const acceptance = lines(task.acceptanceCriteria);
  const assigneeName = task.assignee ? userDisplayName(task.assignee) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/kanban"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> 返回看板
        </Link>
      </div>

      {/* 头部 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5">
              {task.taskCode}
            </span>
            {task.isAiGenerated && (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                AI 生成
              </span>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {task.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            所属项目{" "}
            <Link
              href={`/project/${task.project.id}`}
              className="text-primary hover:underline"
            >
              {task.project.name}
            </Link>
          </p>
        </div>
        <TaskStatusControl taskId={task.id} status={task.status} />
      </div>

      {/* 元信息 */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 pt-6 text-sm sm:grid-cols-4">
          <Meta
            label="负责人"
            value={assigneeName ?? "未分配"}
            highlight={!assigneeName}
          />
          <Meta
            label="优先级"
            value={PRIORITY_LABEL[task.priority] ?? task.priority}
          />
          <Meta
            label="类型"
            value={
              task.taskType
                ? TASK_TYPE_LABEL[task.taskType] ?? task.taskType
                : "—"
            }
          />
          <Meta
            label="截止"
            value={task.dueTime ? fmt(task.dueTime).slice(0, 10) : "—"}
          />
        </CardContent>
      </Card>

      {/* 任务说明 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">任务说明</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-line text-sm text-muted-foreground">
            {task.description || "—"}
          </p>
        </CardContent>
      </Card>

      {/* 验收标准 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">验收标准</CardTitle>
        </CardHeader>
        <CardContent>
          {acceptance.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {acceptance.map((it, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  {it}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 关联需求 */}
      {task.requirement && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">关联需求</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              href={`/requirement/${task.requirement.id}`}
              className="block font-medium text-primary hover:underline"
            >
              {task.requirement.title}
            </Link>
            {task.requirement.background && (
              <div>
                <div className="text-sm font-medium">业务背景</div>
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                  {task.requirement.background}
                </p>
              </div>
            )}
            {task.requirement.businessGoal && (
              <div>
                <div className="text-sm font-medium">业务目标</div>
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                  {task.requirement.businessGoal}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 交付到本地 AI 开发 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">交付到本地 AI 开发</CardTitle>
        </CardHeader>
        <CardContent>
          <DevHandoffCard taskId={task.id} />
        </CardContent>
      </Card>

      {/* 评论 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            评论（{task.comments.length}）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {task.comments.length > 0 && (
            <ul className="space-y-3">
              {task.comments.map((c) => (
                <li key={c.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {c.author ? userDisplayName(c.author) : "未知成员"}
                    </span>
                    <span>{fmt(c.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-sm">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
          <TaskCommentForm taskId={task.id} />
        </CardContent>
      </Card>

      {/* 操作日志 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">操作日志</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无记录。</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                  <div className="min-w-0">
                    <span className="text-muted-foreground">
                      {fmt(a.createdAt)} ·{" "}
                    </span>
                    <span className="font-medium">{a.actorName}</span>{" "}
                    <span>{OPERATION_LABEL[a.action] ?? a.action}</span>
                    {a.action === "TASK_STATUS_CHANGED" && a.detail && (
                      <span className="text-muted-foreground">
                        {" "}
                        {TASK_STATUS_LABEL[String(a.detail.from)] ??
                          String(a.detail.from)}{" "}
                        →{" "}
                        {TASK_STATUS_LABEL[String(a.detail.to)] ??
                          String(a.detail.to)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Meta({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          highlight
            ? "mt-0.5 font-medium text-amber-600"
            : "mt-0.5 font-medium"
        }
      >
        {value}
      </div>
    </div>
  );
}
