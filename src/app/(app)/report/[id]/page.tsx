import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileBarChart } from "lucide-react";

import { requireUser } from "@/lib/auth-helpers";
import { getProjectForUser } from "@/lib/projects";
import { gatherProjectReportFacts } from "@/lib/reports";
import { ReportWorkspace } from "./report-workspace";

export const metadata = { title: "项目报告 · TeamMindAI" };

export default async function ProjectReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();

  // 事实快照：当前状态指标（进度/状态分布/阻塞延期临期）与 AI 报告共用同一份事实来源。
  const facts = await gatherProjectReportFacts(id, "weekly");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/report"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          项目报告
        </Link>
        <span>/</span>
        <span className="text-foreground">{project.name}</span>
      </div>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <FileBarChart className="size-6 text-primary" />
          {project.name} · 报告
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {project.projectCode} · 先查看真实数据快照，再由 AI 项目经理生成结构化报告（人工触发）。
        </p>
      </div>

      <ReportWorkspace projectId={id} facts={facts} />
    </div>
  );
}
