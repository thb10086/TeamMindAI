import type { Priority, RequirementStatus, TaskStatus } from "@prisma/client";

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

/** 仍需推进的任务状态（已完成/已取消不算待办）。 */
const MY_TASK_ACTIVE_STATUSES: TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "INTEGRATING",
  "TESTING",
  "ACCEPTING",
  "BLOCKED",
  "DELAYED",
];

/** 需要负责人介入推进的需求状态。 */
const MY_REQUIREMENT_ACTION_STATUSES: RequirementStatus[] = [
  "CLARIFYING",
  "REVIEWING",
  "SCHEDULING",
  "ACCEPTING",
];

export interface MyTaskItem {
  id: string;
  taskCode: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  dueTime: Date | null;
  blockedReason: string | null;
  projectId: string;
  projectName: string;
  requirementTitle: string | null;
  isOverdue: boolean;
}

export interface MyRequirementItem {
  id: string;
  requirementCode: string;
  title: string;
  status: RequirementStatus;
  priority: Priority;
  openQuestions: number;
  projectId: string;
  projectName: string;
}

export interface MyWorkItems {
  tasks: MyTaskItem[];
  requirements: MyRequirementItem[];
  counts: {
    tasks: number;
    overdueTasks: number;
    blockedTasks: number;
    delayedTasks: number;
    requirements: number;
    needsConfirm: number;
  };
}

const PRIORITY_WEIGHT: Record<Priority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

/**
 * 跨项目聚合「我的待办」：我负责的活动任务、待我处理的需求、待我确认的通知数。
 * 服务于工作台收口——一个入口看清「该我推进什么」。
 */
export async function getMyWorkItems(userId: string): Promise<MyWorkItems> {
  const now = new Date();

  const [rawTasks, rawRequirements, needsConfirm] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeId: userId, status: { in: MY_TASK_ACTIVE_STATUSES } },
      select: {
        id: true,
        taskCode: true,
        title: true,
        status: true,
        priority: true,
        dueTime: true,
        blockedReason: true,
        projectId: true,
        project: { select: { name: true } },
        requirement: { select: { title: true } },
      },
    }),
    prisma.requirement.findMany({
      where: {
        ownerId: userId,
        status: { in: MY_REQUIREMENT_ACTION_STATUSES },
      },
      select: {
        id: true,
        requirementCode: true,
        title: true,
        status: true,
        priority: true,
        openQuestions: true,
        projectId: true,
        project: { select: { name: true } },
      },
    }),
    prisma.notification.count({
      where: {
        receiverId: userId,
        needsConfirm: true,
        status: { in: ["PENDING", "SENT"] },
      },
    }),
  ]);

  const tasks: MyTaskItem[] = rawTasks
    .map((t) => ({
      id: t.id,
      taskCode: t.taskCode,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueTime: t.dueTime,
      blockedReason: t.blockedReason,
      projectId: t.projectId,
      projectName: t.project.name,
      requirementTitle: t.requirement?.title ?? null,
      isOverdue:
        t.status !== "DELAYED" && t.dueTime !== null && t.dueTime < now,
    }))
    .sort((a, b) => {
      // 逾期最前，其次按截止时间（无截止排后），再按优先级。
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      const aDue = a.dueTime ? a.dueTime.getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.dueTime ? b.dueTime.getTime() : Number.MAX_SAFE_INTEGER;
      if (aDue !== bDue) return aDue - bDue;
      return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    });

  const requirements: MyRequirementItem[] = rawRequirements
    .map((r) => ({
      id: r.id,
      requirementCode: r.requirementCode,
      title: r.title,
      status: r.status,
      priority: r.priority,
      openQuestions: r.openQuestions,
      projectId: r.projectId,
      projectName: r.project.name,
    }))
    .sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]);

  return {
    tasks,
    requirements,
    counts: {
      tasks: tasks.length,
      overdueTasks: tasks.filter((t) => t.isOverdue).length,
      blockedTasks: tasks.filter((t) => t.status === "BLOCKED").length,
      delayedTasks: tasks.filter((t) => t.status === "DELAYED").length,
      requirements: requirements.length,
      needsConfirm,
    },
  };
}
