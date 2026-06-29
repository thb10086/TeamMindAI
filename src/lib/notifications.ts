import type { NotificationStatus } from "@prisma/client";

import { prisma } from "@/lib/db";

/**
 * 站内通知（协调闭环收口）。
 * 关键协作事件（任务分配 / 需求确认 / 需求上线 / 任务阻塞等）统一经此创建 IN_APP 通知，
 * 让被指派人/负责人在「通知中心」与顶栏铃铛即时看到，不再依赖口头同步。
 *
 * 说明：当前仅落地站内信（IN_APP）。邮件/企业微信等渠道留作后续（需 SMTP/集成配置）。
 */

export type NotificationType =
  | "TASK_ASSIGNED" // 任务被指派给你
  | "TASK_BLOCKED" // 你负责的任务被标记阻塞
  | "TASK_DELAYED" // 你负责的任务逾期被自动标记为延期
  | "REQUIREMENT_CONFIRMED" // 你提的/负责的需求评审通过
  | "REQUIREMENT_ONLINE" // 你负责的需求已上线
  | "PROJECT_MEMBER_ADDED"; // 你被加入某项目

export interface CreateNotificationInput {
  notificationType: NotificationType;
  title: string;
  content: string;
  receiverId: string;
  projectId?: string | null;
  requirementId?: string | null;
  taskId?: string | null;
  needsConfirm?: boolean;
}

/**
 * 创建单条站内通知。失败时吞掉异常（通知不应阻断主业务动作），仅在控制台告警。
 * 不给「操作者本人」发自己触发的通知由调用方决定（传入正确的 receiverId）。
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        notificationType: input.notificationType,
        channel: "IN_APP",
        title: input.title,
        content: input.content,
        receiverId: input.receiverId,
        projectId: input.projectId ?? null,
        requirementId: input.requirementId ?? null,
        taskId: input.taskId ?? null,
        needsConfirm: input.needsConfirm ?? false,
        status: "PENDING",
      },
    });
  } catch (e) {
    console.error("[notifications] 创建站内通知失败：", e);
  }
}

/** 批量创建（同一事件通知多个接收人，自动跳过空接收人）。 */
export async function createNotifications(
  inputs: CreateNotificationInput[]
): Promise<void> {
  const valid = inputs.filter((i) => i.receiverId);
  if (valid.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: valid.map((input) => ({
        notificationType: input.notificationType,
        channel: "IN_APP" as const,
        title: input.title,
        content: input.content,
        receiverId: input.receiverId,
        projectId: input.projectId ?? null,
        requirementId: input.requirementId ?? null,
        taskId: input.taskId ?? null,
        needsConfirm: input.needsConfirm ?? false,
        status: "PENDING" as const,
      })),
    });
  } catch (e) {
    console.error("[notifications] 批量创建站内通知失败：", e);
  }
}

/** 某用户的未读通知数（PENDING/SENT 视为未读；READ/CONFIRMED 视为已读）。 */
export function countUnread(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { receiverId: userId, status: { in: ["PENDING", "SENT"] } },
  });
}

export type NotificationFilter = "all" | "unread" | "needsConfirm";

/** 列出某用户的通知（按筛选条件，最新优先）。 */
export function listNotifications(
  userId: string,
  filter: NotificationFilter = "all",
  take = 100
) {
  const where: {
    receiverId: string;
    status?: { in: NotificationStatus[] };
    needsConfirm?: boolean;
  } = { receiverId: userId };
  if (filter === "unread") where.status = { in: ["PENDING", "SENT"] };
  else if (filter === "needsConfirm") {
    where.needsConfirm = true;
    where.status = { in: ["PENDING", "SENT"] };
  }
  return prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
  });
}

/** 标记单条为已读（仅本人可操作；返回是否命中）。 */
export async function markRead(
  notificationId: string,
  userId: string
): Promise<boolean> {
  const res = await prisma.notification.updateMany({
    where: {
      id: notificationId,
      receiverId: userId,
      status: { in: ["PENDING", "SENT"] },
    },
    data: { status: "READ", readTime: new Date() },
  });
  return res.count > 0;
}

/** 标记本人全部未读为已读，返回更新条数。 */
export async function markAllRead(userId: string): Promise<number> {
  const res = await prisma.notification.updateMany({
    where: { receiverId: userId, status: { in: ["PENDING", "SENT"] } },
    data: { status: "READ", readTime: new Date() },
  });
  return res.count;
}

/** 确认一条「待确认」通知（needsConfirm），标记为 CONFIRMED。 */
export async function confirmNotification(
  notificationId: string,
  userId: string
): Promise<boolean> {
  const res = await prisma.notification.updateMany({
    where: { id: notificationId, receiverId: userId, needsConfirm: true },
    data: { status: "CONFIRMED", readTime: new Date() },
  });
  return res.count > 0;
}
