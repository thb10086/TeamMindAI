"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth-helpers";
import {
  markRead,
  markAllRead,
  confirmNotification,
} from "@/lib/notifications";

export interface NotificationActionState {
  ok?: boolean;
  error?: string;
  updated?: number;
}

/** 标记单条通知为已读。 */
export async function markReadAction(
  notificationId: string
): Promise<NotificationActionState> {
  const user = await requireUser();
  const ok = await markRead(notificationId, user.id);
  revalidatePath("/notification");
  return { ok };
}

/** 一键全部已读。 */
export async function markAllReadAction(): Promise<NotificationActionState> {
  const user = await requireUser();
  const updated = await markAllRead(user.id);
  revalidatePath("/notification");
  return { ok: true, updated };
}

/** 确认一条「待确认」通知。 */
export async function confirmNotificationAction(
  notificationId: string
): Promise<NotificationActionState> {
  const user = await requireUser();
  const ok = await confirmNotification(notificationId, user.id);
  revalidatePath("/notification");
  return { ok };
}
