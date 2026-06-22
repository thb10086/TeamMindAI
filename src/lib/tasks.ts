import { prisma } from "@/lib/db";

/** 当前用户可见（其所属项目）的任务，可按项目过滤。 */
export async function listTasksForUser(userId: string, projectId?: string) {
  return prisma.task.findMany({
    where: {
      project: { members: { some: { userId } } },
      ...(projectId ? { projectId } : {}),
    },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    include: {
      project: { select: { id: true, name: true } },
      requirement: { select: { id: true, title: true } },
      assignee: {
        select: { id: true, displayName: true, name: true, username: true },
      },
    },
  });
}

/** 某需求拆解出的任务清单。 */
export async function listTasksByRequirement(requirementId: string) {
  return prisma.task.findMany({
    where: { requirementId },
    orderBy: { orderIndex: "asc" },
    include: {
      assignee: {
        select: { id: true, displayName: true, name: true, username: true },
      },
    },
  });
}

/** 任务详情（校验项目成员权限），含项目 / 关联需求 / 负责人 / 评论。 */
export async function getTaskDetailForUser(id: string, userId: string) {
  return prisma.task.findFirst({
    where: { id, project: { members: { some: { userId } } } },
    include: {
      project: { select: { id: true, name: true } },
      requirement: {
        select: {
          id: true,
          title: true,
          background: true,
          businessGoal: true,
          acceptanceCriteria: true,
        },
      },
      assignee: {
        select: { id: true, displayName: true, name: true, username: true },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          author: {
            select: { id: true, displayName: true, name: true, username: true },
          },
        },
      },
    },
  });
}

/** 任务操作日志（按时间倒序，解析操作人显示名）。 */
export async function getTaskActivity(taskId: string) {
  const logs = await prisma.operationLog.findMany({
    where: { targetType: "Task", targetId: taskId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const userIds = Array.from(
    new Set(logs.map((l) => l.userId).filter((v): v is string => Boolean(v)))
  );
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true, name: true, username: true },
      })
    : [];
  const nameMap = new Map(
    users.map((u) => [u.id, u.displayName || u.name || u.username])
  );
  return logs.map((l) => ({
    id: l.id,
    action: l.action,
    detail: (l.detail ?? null) as Record<string, unknown> | null,
    createdAt: l.createdAt,
    actorName: l.userId ? nameMap.get(l.userId) ?? "未知成员" : "系统",
  }));
}
