import { prisma } from "@/lib/db";

/** 当前用户作为成员的全部项目（含基础计数）。 */
export async function listProjectsForUser(userId: string) {
  return prisma.project.findMany({
    where: { members: { some: { userId } } },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { requirements: true, tasks: true, members: true } },
    },
  });
}

/** 校验用户是该项目成员后返回项目；否则返回 null。 */
export async function getProjectForUser(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, members: { some: { userId } } },
    include: {
      _count: {
        select: {
          requirements: true,
          tasks: true,
          members: true,
          decisions: true,
          meetings: true,
        },
      },
    },
  });
}

/** 单项目的需求/任务状态分布与进度。 */
export async function getProjectStats(projectId: string) {
  const [reqByStatus, taskByStatus, doneTasks, totalTasks] = await Promise.all([
    prisma.requirement.groupBy({
      by: ["status"],
      where: { projectId },
      _count: true,
    }),
    prisma.task.groupBy({
      by: ["status"],
      where: { projectId },
      _count: true,
    }),
    prisma.task.count({ where: { projectId, status: "DONE" } }),
    prisma.task.count({ where: { projectId } }),
  ]);
  const progress =
    totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  return { reqByStatus, taskByStatus, progress, totalTasks, doneTasks };
}

/** 工作台汇总指标（基于用户可见项目）。 */
export async function getDashboardSummary(userId: string) {
  const projects = await prisma.project.findMany({
    where: { members: { some: { userId } } },
    select: { id: true },
  });
  const ids = projects.map((p: { id: string }) => p.id);
  const scope = { projectId: { in: ids } };

  const [activeProjects, pendingReq, delayedTasks, blockedTasks] =
    await Promise.all([
      prisma.project.count({ where: { id: { in: ids }, status: "ACTIVE" } }),
      prisma.requirement.count({
        where: { ...scope, status: { in: ["CLARIFYING", "REVIEWING"] } },
      }),
      prisma.task.count({ where: { ...scope, status: "DELAYED" } }),
      prisma.task.count({ where: { ...scope, status: "BLOCKED" } }),
    ]);

  return {
    projectCount: ids.length,
    activeProjects,
    pendingReq,
    delayedTasks,
    blockedTasks,
  };
}
