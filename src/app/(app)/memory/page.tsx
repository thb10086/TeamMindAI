import Link from "next/link";
import { ArrowRight, Brain } from "lucide-react";

import { requireUser } from "@/lib/auth-helpers";
import { listProjectsForUser } from "@/lib/projects";

export const metadata = { title: "项目记忆 · TeamMindAI" };

/**
 * 记忆图谱归属于具体项目，因此本页是「项目启动器」：
 * 列出用户项目，点击直达该项目详情的「记忆图谱」标签。
 */
export default async function MemoryLauncherPage() {
  const user = await requireUser();
  const projects = await listProjectsForUser(user.id);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Brain className="size-6 text-primary" />
          项目记忆
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          记忆图谱归属于具体项目。选择一个项目，进入其「记忆图谱」标签查看实体、关系、社区与检索。
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
              href={`/project/${p.id}?tab=memory`}
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
