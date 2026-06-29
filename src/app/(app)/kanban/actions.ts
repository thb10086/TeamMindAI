"use server";

import { revalidatePath } from "next/cache";

import type { SystemRole } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { canLeadProject, requireFullUser } from "@/lib/access";
import { recomputeRequirementStatusFromTasks } from "@/lib/lifecycle";
import { feedbackTaskProgress } from "@/lib/memory/feedback";
import { userDisplayName } from "@/lib/org";
import { createNotification } from "@/lib/notifications";

const TASK_STATUSES = [
  "TODO",
  "IN_PROGRESS",
  "INTEGRATING",
  "TESTING",
  "ACCEPTING",
  "DONE",
  "BLOCKED",
  "CANCELLED",
  "DELAYED",
] as const;

type TaskStatusValue = (typeof TASK_STATUSES)[number];

/** 指派时自动加入项目所用的「非主管」项目角色（避免经指派意外授予主管权限）。 */
const AUTO_MEMBER_ROLES = new Set<string>([
  "DESIGNER",
  "DEVELOPER",
  "TESTER",
  "OPERATOR",
]);

/**
 * 确保用户是该项目成员；非成员则自动加入（同公司校验）。
 * 返回 false 表示用户不存在或与操作者不同公司。
 * 自动加入按其系统角色映射为非主管项目角色，且不写 ownerId 等去规范化字段。
 */
async function ensureProjectMembership(
  projectId: string,
  userId: string,
  actorCompanyId: string | null
): Promise<boolean> {
  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { userId: true },
  });
  if (existing) return true;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true, systemRole: true },
  });
  if (!target) return false;
  if (actorCompanyId && target.companyId && target.companyId !== actorCompanyId) {
    return false;
  }

  const role: SystemRole = AUTO_MEMBER_ROLES.has(target.systemRole)
    ? target.systemRole
    : "DEVELOPER";
  await prisma.projectMember.create({ data: { projectId, userId, role } });
  return true;
}

export interface UpdateTaskStatusResult {
  ok?: boolean;
  error?: string;
}

/** 更新任务状态（校验项目成员权限）。 */
export async function updateTaskStatus(
  taskId: string,
  status: string
): Promise<UpdateTaskStatusResult> {
  const user = await requireUser();

  if (!TASK_STATUSES.includes(status as TaskStatusValue)) {
    return { error: "非法的任务状态。" };
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { members: { some: { userId: user.id } } } },
    select: {
      id: true,
      projectId: true,
      requirementId: true,
      status: true,
      title: true,
      assigneeId: true,
      assignee: { select: { displayName: true, name: true, username: true } },
      requirement: { select: { title: true } },
      project: { select: { name: true } },
    },
  });
  if (!task) return { error: "无权操作该任务或任务不存在。" };

  if (task.status === status) return { ok: true };

  await prisma.task.update({
    where: { id: task.id },
    data: { status: status as TaskStatusValue },
  });
  await prisma.operationLog.create({
    data: {
      userId: user.id,
      action: "TASK_STATUS_CHANGED",
      targetType: "Task",
      targetId: task.id,
      detail: { from: task.status, to: status, title: task.title },
    },
  });

  // 任务 → 需求状态联动（开发中/测试中/待验收…）。
  if (task.requirementId) {
    await recomputeRequirementStatusFromTasks(task.requirementId);
    revalidatePath(`/requirement/${task.requirementId}`);
  }

  // 任务状态回流项目记忆（loop-feedback）：里程碑/风险类状态异步沉淀。
  await feedbackTaskProgress({
    projectId: task.projectId,
    taskId: task.id,
    title: task.title,
    fromStatus: task.status,
    toStatus: status,
    assigneeName: task.assignee ? userDisplayName(task.assignee) : null,
    requirementTitle: task.requirement?.title ?? null,
  });

  // 任务转入阻塞 → 提醒负责人（非操作者本人）协调解除。
  if (
    status === "BLOCKED" &&
    task.assigneeId &&
    task.assigneeId !== user.id
  ) {
    await createNotification({
      notificationType: "TASK_BLOCKED",
      title: "任务被标记为阻塞",
      content: `任务「${task.title}」在项目「${task.project.name}」被标记为阻塞，请尽快协调解除。`,
      receiverId: task.assigneeId,
      projectId: task.projectId,
      taskId: task.id,
    });
  }

  revalidatePath("/kanban");
  revalidatePath("/notification");
  revalidatePath(`/task/${task.id}`);
  revalidatePath(`/project/${task.projectId}`);
  return { ok: true };
}

export interface AssignResult {
  ok?: boolean;
  error?: string;
}

/**
 * 指派单个任务的负责人与截止时间（看板每卡指派）。
 * 仅项目主管/管理员；变更写 OperationLog，体现关键动作可审计。
 */
export async function assignTask(input: {
  taskId: string;
  assigneeId: string | null;
  dueTime?: string | null;
}): Promise<AssignResult> {
  const user = await requireFullUser();

  const task = await prisma.task.findFirst({
    where: {
      id: input.taskId,
      project: { members: { some: { userId: user.id } } },
    },
    select: {
      id: true,
      projectId: true,
      assigneeId: true,
      title: true,
      project: { select: { name: true } },
    },
  });
  if (!task) return { error: "无权操作该任务或任务不存在。" };

  if (!(await canLeadProject(task.projectId, user))) {
    return { error: "仅项目负责人/技术负责人/产品负责人可分配任务。" };
  }

  if (input.assigneeId) {
    const ok = await ensureProjectMembership(
      task.projectId,
      input.assigneeId,
      user.companyId
    );
    if (!ok) {
      return { error: "无法指派：该用户不存在或与你不属于同一公司。" };
    }
  }

  const data: { assigneeId: string | null; dueTime?: Date | null } = {
    assigneeId: input.assigneeId,
  };
  if (input.dueTime !== undefined) {
    data.dueTime = input.dueTime ? new Date(input.dueTime) : null;
  }

  await prisma.task.update({ where: { id: task.id }, data });

  if ((task.assigneeId ?? null) !== (input.assigneeId ?? null)) {
    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: "TASK_ASSIGNED",
        targetType: "Task",
        targetId: task.id,
        detail: { from: task.assigneeId, to: input.assigneeId, title: task.title },
      },
    });

    // 通知新负责人（非操作者本人）：你被指派了任务。
    if (input.assigneeId && input.assigneeId !== user.id) {
      await createNotification({
        notificationType: "TASK_ASSIGNED",
        title: "你被指派了新任务",
        content: `项目「${task.project.name}」的任务「${task.title}」已指派给你${
          input.dueTime ? `，截止 ${input.dueTime}` : ""
        }。`,
        receiverId: input.assigneeId,
        projectId: task.projectId,
        taskId: task.id,
      });
    }
  }

  revalidatePath("/kanban");
  revalidatePath("/notification");
  revalidatePath(`/task/${task.id}`);
  revalidatePath(`/project/${task.projectId}`);
  return { ok: true };
}

export interface BatchAssignResult {
  assigned?: number;
  error?: string;
}

/**
 * AI 一键分配：按 AI 拆解时给出的「建议承接角色」匹配项目成员，批量落库（人工确认后触发）。
 * 仅校验同一项目内的任务与成员；仅项目主管/管理员可执行。
 */
export async function assignTasksBatch(input: {
  projectId: string;
  assignments: { taskId: string; assigneeId: string | null }[];
}): Promise<BatchAssignResult> {
  const user = await requireFullUser();

  if (!(await canLeadProject(input.projectId, user))) {
    return { error: "仅项目负责人/技术负责人/产品负责人可分配任务。" };
  }

  const taskIds = input.assignments.map((a) => a.taskId);
  const [tasks, project] = await Promise.all([
    prisma.task.findMany({
      where: { id: { in: taskIds }, projectId: input.projectId },
      select: { id: true, assigneeId: true, title: true },
    }),
    prisma.project.findUnique({
      where: { id: input.projectId },
      select: { name: true },
    }),
  ]);
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const projectName = project?.name ?? "项目";

  const assigneeIds = Array.from(
    new Set(
      input.assignments
        .map((a) => a.assigneeId)
        .filter((v): v is string => Boolean(v))
    )
  );
  for (const id of assigneeIds) {
    const ok = await ensureProjectMembership(
      input.projectId,
      id,
      user.companyId
    );
    if (!ok) {
      return { error: "存在无法指派的用户（不存在或与你不同公司）。" };
    }
  }

  let assigned = 0;
  for (const a of input.assignments) {
    const t = taskMap.get(a.taskId);
    if (!t) continue;
    if ((t.assigneeId ?? null) === (a.assigneeId ?? null)) continue;
    await prisma.task.update({
      where: { id: a.taskId },
      data: { assigneeId: a.assigneeId },
    });
    assigned++;
    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: "TASK_ASSIGNED",
        targetType: "Task",
        targetId: a.taskId,
        detail: {
          from: t.assigneeId,
          to: a.assigneeId,
          title: t.title,
          via: "ai_auto",
        },
      },
    });

    // 通知被指派人（非操作者本人）。
    if (a.assigneeId && a.assigneeId !== user.id) {
      await createNotification({
        notificationType: "TASK_ASSIGNED",
        title: "你被指派了新任务",
        content: `项目「${projectName}」的任务「${t.title}」已指派给你。`,
        receiverId: a.assigneeId,
        projectId: input.projectId,
        taskId: a.taskId,
      });
    }
  }

  revalidatePath("/kanban");
  revalidatePath("/notification");
  revalidatePath(`/project/${input.projectId}`);
  return { assigned };
}

const TASK_TYPES = [
  "PRODUCT",
  "UI",
  "FRONTEND",
  "BACKEND",
  "ALGORITHM",
  "TEST",
  "OPS",
  "DATA",
  "DOC",
  "ACCEPTANCE",
] as const;
type TaskTypeValue = (typeof TASK_TYPES)[number];

const TASK_PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
type TaskPriorityValue = (typeof TASK_PRIORITIES)[number];

export interface CreateTaskInput {
  projectId: string;
  title: string;
  requirementId?: string | null;
  taskType?: string | null;
  priority?: string;
  assigneeId?: string | null;
  estimatedHours?: number | null;
  dueTime?: string | null;
  description?: string | null;
}

export interface CreateTaskResult {
  ok?: boolean;
  error?: string;
  taskId?: string;
}

/**
 * 手动新建任务（仅项目负责人/技术负责人/产品负责人）。
 * 可选关联需求、负责人、任务类型、优先级、预估工时、截止日；关联需求时联动需求状态。
 */
export async function createTask(
  input: CreateTaskInput
): Promise<CreateTaskResult> {
  const user = await requireFullUser();

  const title = input.title.trim();
  if (!title) return { error: "任务标题不能为空。" };
  if (title.length > 200) return { error: "任务标题过长（不超过 200 字）。" };

  const project = await prisma.project.findFirst({
    where: { id: input.projectId, members: { some: { userId: user.id } } },
    select: { id: true, name: true },
  });
  if (!project) return { error: "无权访问该项目或项目不存在。" };
  if (!(await canLeadProject(input.projectId, user))) {
    return { error: "仅项目负责人/技术负责人/产品负责人可新建任务。" };
  }

  // 关联需求必须属于同一项目
  let requirementId: string | null = null;
  if (input.requirementId) {
    const req = await prisma.requirement.findFirst({
      where: { id: input.requirementId, projectId: input.projectId },
      select: { id: true },
    });
    if (!req) return { error: "关联需求不存在或不属于该项目。" };
    requirementId = req.id;
  }

  const taskType: TaskTypeValue | null =
    input.taskType && (TASK_TYPES as readonly string[]).includes(input.taskType)
      ? (input.taskType as TaskTypeValue)
      : null;
  const priority: TaskPriorityValue = (
    TASK_PRIORITIES as readonly string[]
  ).includes(input.priority ?? "")
    ? (input.priority as TaskPriorityValue)
    : "P2";

  // 负责人：校验并自动加入项目（与指派逻辑一致）
  let assigneeId: string | null = null;
  if (input.assigneeId) {
    const ok = await ensureProjectMembership(
      input.projectId,
      input.assigneeId,
      user.companyId
    );
    if (!ok) {
      return { error: "无法指派：该用户不存在或与你不属于同一公司。" };
    }
    assigneeId = input.assigneeId;
  }

  let estimatedHours: number | null = null;
  if (input.estimatedHours != null && !Number.isNaN(input.estimatedHours)) {
    if (input.estimatedHours < 0 || input.estimatedHours > 100000) {
      return { error: "预估工时不合法。" };
    }
    estimatedHours = input.estimatedHours;
  }

  // 排到该需求/项目末尾
  const last = await prisma.task.findFirst({
    where: { projectId: input.projectId, requirementId },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });
  const orderIndex = (last?.orderIndex ?? -1) + 1;

  const task = await prisma.task.create({
    data: {
      taskCode: `TASK-${Date.now().toString(36).toUpperCase()}`,
      projectId: input.projectId,
      requirementId,
      title,
      description: input.description?.trim() || null,
      taskType,
      status: "TODO",
      priority,
      assigneeId,
      estimatedHours,
      dueTime: input.dueTime ? new Date(input.dueTime) : null,
      isAiGenerated: false,
      orderIndex,
      createdById: user.id,
    },
    select: { id: true },
  });

  await prisma.operationLog.create({
    data: {
      userId: user.id,
      action: "TASK_CREATED",
      targetType: "Task",
      targetId: task.id,
      detail: { title, requirementId, manual: true },
    },
  });

  // 新建即指派给他人时，通知负责人。
  if (assigneeId && assigneeId !== user.id) {
    await createNotification({
      notificationType: "TASK_ASSIGNED",
      title: "你被指派了新任务",
      content: `项目「${project.name}」的任务「${title}」已指派给你。`,
      receiverId: assigneeId,
      projectId: input.projectId,
      taskId: task.id,
    });
  }

  // 关联需求时联动需求/项目状态（仅在执行阶段生效，不会回退人工决策）
  if (requirementId) {
    await recomputeRequirementStatusFromTasks(requirementId);
    revalidatePath(`/requirement/${requirementId}`);
  }
  revalidatePath("/kanban");
  revalidatePath("/notification");
  revalidatePath(`/project/${input.projectId}`);
  return { ok: true, taskId: task.id };
}
