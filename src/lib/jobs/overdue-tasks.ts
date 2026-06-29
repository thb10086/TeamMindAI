import type { TaskStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import { recomputeRequirementStatusFromTasks } from "@/lib/lifecycle";
import { feedbackTaskProgress } from "@/lib/memory/feedback";
import { createNotification } from "@/lib/notifications";

/**
 * 视为「活动中、可被判定为逾期」的任务状态。
 * 不含：已完成(DONE)/已取消(CANCELLED)/已延期(DELAYED，避免重复处理)/已阻塞(BLOCKED，
 * 阻塞是更具体的可处理状态，不被逾期覆盖）。
 */
const OVERDUE_CANDIDATE_STATUSES: TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "INTEGRATING",
  "TESTING",
  "ACCEPTING",
];

export interface SweepOverdueResult {
  scanned: number;
  delayed: number;
}

/**
 * 扫描所有 dueTime 已过且仍处于活动状态的任务，自动转为 DELAYED，
 * 并：写操作日志、回流项目记忆（风险）、联动需求状态、通知负责人。
 *
 * best-effort：单条任务的副作用失败不影响其它任务；整体可被定时任务重复安全执行（幂等：
 * 已是 DELAYED 的任务不在候选集内，不会被重复通知）。
 */
export async function sweepOverdueTasks(
  now: Date = new Date()
): Promise<SweepOverdueResult> {
  const overdue = await prisma.task.findMany({
    where: {
      status: { in: OVERDUE_CANDIDATE_STATUSES },
      dueTime: { not: null, lt: now },
    },
    select: {
      id: true,
      title: true,
      status: true,
      projectId: true,
      requirementId: true,
      assigneeId: true,
      dueTime: true,
      requirement: { select: { title: true } },
      assignee: { select: { displayName: true, name: true } },
    },
  });

  let delayed = 0;
  for (const task of overdue) {
    try {
      // 幂等保护：只在仍为候选状态时才置为 DELAYED，避免与人工操作竞态。
      const res = await prisma.task.updateMany({
        where: { id: task.id, status: { in: OVERDUE_CANDIDATE_STATUSES } },
        data: { status: "DELAYED" },
      });
      if (res.count === 0) continue;
      delayed++;

      await prisma.operationLog.create({
        data: {
          userId: null,
          action: "TASK_AUTO_DELAYED",
          targetType: "Task",
          targetId: task.id,
          detail: {
            from: task.status,
            to: "DELAYED",
            title: task.title,
            dueTime: task.dueTime?.toISOString() ?? null,
            reason: "系统检测到任务已超过截止时间且未完成",
          },
        },
      });

      // 风险回流项目记忆（DELAYED 已在 feedback 映射为 RISK）。
      await feedbackTaskProgress({
        projectId: task.projectId,
        taskId: task.id,
        title: task.title,
        fromStatus: task.status,
        toStatus: "DELAYED",
        assigneeName:
          task.assignee?.displayName ?? task.assignee?.name ?? null,
        requirementTitle: task.requirement?.title ?? null,
      });

      // 任务 → 需求状态联动。
      if (task.requirementId) {
        await recomputeRequirementStatusFromTasks(task.requirementId);
      }

      // 通知负责人（系统触发，无「操作者本人」需排除）。
      if (task.assigneeId) {
        const due = task.dueTime
          ? task.dueTime.toISOString().slice(0, 10)
          : "未知";
        await createNotification({
          notificationType: "TASK_DELAYED",
          title: "任务已逾期，自动标记为延期",
          content: `任务「${task.title}」已超过截止时间（${due}）仍未完成，系统已自动标记为「延期」，请尽快处理或更新计划。`,
          receiverId: task.assigneeId,
          projectId: task.projectId,
          taskId: task.id,
          requirementId: task.requirementId,
          needsConfirm: true,
        });
      }
    } catch (e) {
      console.error(
        `[overdue-sweep] 处理任务 ${task.id} 失败：`,
        (e as Error).message
      );
    }
  }

  return { scanned: overdue.length, delayed };
}
