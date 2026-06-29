import { requireUser } from "@/lib/auth-helpers";
import { listNotifications } from "@/lib/notifications";
import { NotificationCenter } from "./notification-center";

export const metadata = { title: "通知中心 · TeamMindAI" };

export default async function NotificationPage() {
  const user = await requireUser();
  const items = await listNotifications(user.id, "all", 200);

  const data = items.map((n) => ({
    id: n.id,
    notificationType: n.notificationType,
    title: n.title,
    content: n.content,
    projectId: n.projectId,
    requirementId: n.requirementId,
    taskId: n.taskId,
    status: n.status,
    needsConfirm: n.needsConfirm,
    createdAt: n.createdAt.toISOString(),
  }));

  return <NotificationCenter items={data} />;
}
