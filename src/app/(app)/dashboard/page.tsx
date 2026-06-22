import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CircleDot,
  Clock,
  FolderKanban,
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
import { getDashboardSummary, listProjectsForUser } from "@/lib/projects";
import { PROJECT_STATUS_LABEL } from "@/lib/labels";

export const metadata = { title: "工作台 · TeamMindAI" };

export default async function DashboardPage() {
  const user = await requireUser();
  const [summary, projects] = await Promise.all([
    getDashboardSummary(user.id),
    listProjectsForUser(user.id),
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
