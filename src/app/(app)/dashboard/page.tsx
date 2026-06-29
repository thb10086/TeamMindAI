import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CircleDot,
  Clock,
  FolderKanban,
  ListChecks,
  Sparkles,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth-helpers";
import {
  getDashboardSummary,
  getMyWorkItems,
  listProjectsForUser,
} from "@/lib/projects";
import {
  PRIORITY_LABEL,
  PROJECT_STATUS_LABEL,
  REQUIREMENT_STATUS_LABEL,
  TASK_STATUS_LABEL,
} from "@/lib/labels";

export const metadata = { title: "工作台 · TeamMindAI" };

const dateFmt = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
});

export default async function DashboardPage() {
  const user = await requireUser();
  const [summary, projects, myWork] = await Promise.all([
    getDashboardSummary(user.id),
    listProjectsForUser(user.id),
    getMyWorkItems(user.id),
  ]);

  const stats = [
    { label: "进行中项目", value: summary.activeProjects, icon: FolderKanban },
    { label: "待确认需求", value: summary.pendingReq, icon: CircleDot },
    { label: "延期任务", value: summary.delayedTasks, icon: Clock },
    { label: "阻塞任务", value: summary.blockedTasks, icon: AlertTriangle },
  ];

  const aiReminders: string[] = [];
  if (summary.pendingReq > 0)
    aiReminders.push(`有 ${summary.pendingReq} 个需求待澄清/评审，建议尽快对齐确认。`);
  if (summary.delayedTasks > 0)
    aiReminders.push(`有 ${summary.delayedTasks} 个任务已延期，建议查看风险并重新排期。`);
  if (summary.blockedTasks > 0)
    aiReminders.push(`有 ${summary.blockedTasks} 个任务处于阻塞，需要协调资源解除阻塞。`);
  if (aiReminders.length === 0)
    aiReminders.push(
      "当前没有紧急待办。把模糊想法丢进 AI 对齐室，AI 产品经理会帮你澄清成标准需求。"
    );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">工作台</h1>
          <p className="mt-1 text-muted-foreground">
            公司项目整体情况与 AI 今日提醒一览
          </p>
        </div>
        <Button asChild>
          <Link href="/align">
            <Sparkles className="size-4" />
            进入 AI 对齐室
          </Link>
        </Button>
      </div>

      {/* 数据卡片 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">{label}</div>
                <div className="mt-1 text-3xl font-bold">{value}</div>
              </div>
              <Icon className="size-8 text-primary/70" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AI 今日提醒 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="size-5" />
            <CardTitle>AI 今日提醒</CardTitle>
          </div>
          <CardDescription>由 AI 项目经理基于项目上下文生成</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {aiReminders.map((r) => (
            <div
              key={r}
              className="flex items-start gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm"
            >
              <CircleDot className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{r}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 我的待办（跨项目聚合） */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary">
              <ListChecks className="size-5" />
              <CardTitle>我的待办</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {myWork.counts.overdueTasks > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  逾期 {myWork.counts.overdueTasks}
                </span>
              )}
              {myWork.counts.blockedTasks > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  阻塞 {myWork.counts.blockedTasks}
                </span>
              )}
              {myWork.counts.delayedTasks > 0 && (
                <span className="rounded-full bg-orange-100 px-2 py-0.5 font-medium text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                  延期 {myWork.counts.delayedTasks}
                </span>
              )}
              {myWork.counts.needsConfirm > 0 && (
                <Link
                  href="/notification?filter=needsConfirm"
                  className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary hover:bg-primary/20"
                >
                  <BellRing className="size-3" />
                  待确认 {myWork.counts.needsConfirm}
                </Link>
              )}
            </div>
          </div>
          <CardDescription>
            跨项目聚合：该你推进的任务与需求，逾期/临期优先
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          {/* 我负责的任务 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm font-medium">
              <span>我负责的任务（{myWork.counts.tasks}）</span>
              <Link
                href="/kanban"
                className="text-xs text-muted-foreground hover:text-primary"
              >
                看板 →
              </Link>
            </div>
            {myWork.tasks.length === 0 ? (
              <div className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                暂无待推进的任务。
              </div>
            ) : (
              <ul className="space-y-2">
                {myWork.tasks.slice(0, 6).map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/task/${t.id}`}
                      className="block rounded-lg border px-3 py-2 transition hover:border-primary/50 hover:bg-muted/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {t.title}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            t.status === "BLOCKED"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                              : t.status === "DELAYED"
                                ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {TASK_STATUS_LABEL[t.status] ?? t.status}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{t.projectName}</span>
                        <span>·</span>
                        <span>{PRIORITY_LABEL[t.priority] ?? t.priority}</span>
                        {t.dueTime && (
                          <>
                            <span>·</span>
                            <span
                              className={
                                t.isOverdue
                                  ? "font-medium text-red-600 dark:text-red-400"
                                  : ""
                              }
                            >
                              {t.isOverdue ? "已逾期 " : "截止 "}
                              {dateFmt.format(t.dueTime)}
                            </span>
                          </>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
                {myWork.tasks.length > 6 && (
                  <li className="pt-1 text-center text-xs text-muted-foreground">
                    还有 {myWork.tasks.length - 6} 个，前往
                    <Link href="/kanban" className="mx-1 text-primary underline">
                      看板
                    </Link>
                    查看全部
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* 待我处理的需求 */}
          <div className="space-y-2">
            <div className="text-sm font-medium">
              待我处理的需求（{myWork.counts.requirements}）
            </div>
            {myWork.requirements.length === 0 ? (
              <div className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                暂无待你处理的需求。
              </div>
            ) : (
              <ul className="space-y-2">
                {myWork.requirements.slice(0, 6).map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/requirement/${r.id}`}
                      className="block rounded-lg border px-3 py-2 transition hover:border-primary/50 hover:bg-muted/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {r.title}
                        </span>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {REQUIREMENT_STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{r.projectName}</span>
                        <span>·</span>
                        <span>{PRIORITY_LABEL[r.priority] ?? r.priority}</span>
                        {r.openQuestions > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-amber-600 dark:text-amber-400">
                              {r.openQuestions} 个待澄清
                            </span>
                          </>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
                {myWork.requirements.length > 6 && (
                  <li className="pt-1 text-center text-xs text-muted-foreground">
                    还有 {myWork.requirements.length - 6} 个
                  </li>
                )}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 我的项目 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>我的项目</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/project">
                全部项目 <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <CardDescription>你参与的项目与基础指标</CardDescription>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              还没有项目。
              <Link href="/project/new" className="mx-1 text-primary underline">
                新建项目
              </Link>
              开启 AI 协作。
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-4 py-2 font-medium">项目名称</th>
                    <th className="px-4 py-2 font-medium">编号</th>
                    <th className="px-4 py-2 font-medium">状态</th>
                    <th className="px-4 py-2 font-medium">需求</th>
                    <th className="px-4 py-2 font-medium">任务</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.projectCode}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {PROJECT_STATUS_LABEL[p.status] ?? p.status}
                      </td>
                      <td className="px-4 py-3">{p._count.requirements}</td>
                      <td className="px-4 py-3">{p._count.tasks}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/project/${p.id}`}>
                            进入 <ArrowRight className="size-4" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
