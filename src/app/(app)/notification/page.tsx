import { requireUser } from "@/lib/auth-helpers";
import { listNotifications } from "@/lib/notifications";
import { NotificationCenter } from "./notification-center";

export const metadata = { title: "通知中心 · TeamMindAI" };

type TabKey = "all" | "unread" | "needsConfirm";

export default async function NotificationPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await requireUser();
  const { filter } = await searchParams;
  const initialTab: TabKey =
    filter === "unread" || filter === "needsConfirm" ? filter : "all";
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

  return <NotificationCenter items={data} initialTab={initialTab} />;
}
