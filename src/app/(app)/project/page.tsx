import Link from "next/link";
import { ArrowRight, FolderKanban, Plus } from "lucide-react";

import { requireUser } from "@/lib/auth-helpers";
import { listProjectsForUser } from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PRIORITY_LABEL, PROJECT_STATUS_LABEL } from "@/lib/labels";

export const metadata = { title: "项目空间 · TeamMindAI" };

export default async function ProjectListPage() {
  const user = await requireUser();
  const projects = await listProjectsForUser(user.id);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">项目空间</h1>
          <p className="mt-1 text-muted-foreground">
            管理公司所有项目，每个项目是需求、任务、决策与记忆的核心容器。
          </p>
        </div>
        <Button asChild>
          <Link href="/project/new">
            <Plus className="size-4" />
            新建项目
          </Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            还没有项目。
            <Link href="/project/new" className="mx-1 text-primary underline">
              创建第一个项目
            </Link>
            ，开启 AI 协作。
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/project/${p.id}`} className="group">
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2 font-semibold">
                      <FolderKanban className="size-4 shrink-0 text-primary" />
                      <span className="truncate">{p.name}</span>
                    </div>
                    <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                      {PROJECT_STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </div>
                  <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                    {p.description || "暂无描述"}
                  </p>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>需求 {p._count.requirements}</span>
                    <span>任务 {p._count.tasks}</span>
                    <span>成员 {p._count.members}</span>
                  </div>
                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="text-xs text-muted-foreground">
                      {p.projectCode} · {PRIORITY_LABEL[p.priority] ?? p.priority}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      进入 <ArrowRight className="size-3" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
