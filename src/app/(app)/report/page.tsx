import Link from "next/link";
import { ArrowRight, FileBarChart } from "lucide-react";

import { requireUser } from "@/lib/auth-helpers";
import { listProjectsForUser } from "@/lib/projects";

export const metadata = { title: "项目报告 · TeamMindAI" };

/**
 * 项目报告归属于具体项目，因此本页是「项目启动器」：
 * 列出用户项目，点击进入该项目的报告工作台（事实面板 + AI 生成周报）。
 */
export default async function ReportLauncherPage() {
  const user = await requireUser();
  const projects = await listProjectsForUser(user.id);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <FileBarChart className="size-6 text-primary" />
          项目报告
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          基于项目真实数据生成日报/周报/月报：本期进展、完成项、延期与阻塞、风险、下阶段计划与 AI 管理建议。选择一个项目开始。
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border bg-card py-16 text-center text-muted-foreground">
          还没有项目。先到「项目空间」创建一个项目。
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/report/${p.id}`}
              className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{p.name}</span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {p.projectCode} · {p._count.requirements} 需求 · {p._count.tasks} 任务
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
