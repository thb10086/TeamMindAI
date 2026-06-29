"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  Check,
  FolderKanban,
  FileText,
  KanbanSquare,
  AlertTriangle,
  Rocket,
  UserPlus,
  Inbox,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  markReadAction,
  markAllReadAction,
  confirmNotificationAction,
} from "./actions";

type NotificationVM = {
  id: string;
  notificationType: string;
  title: string;
  content: string;
  projectId: string | null;
  requirementId: string | null;
  taskId: string | null;
  status: string;
  needsConfirm: boolean;
  createdAt: string;
};

type TabKey = "all" | "unread" | "needsConfirm";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "unread", label: "未读" },
  { key: "needsConfirm", label: "待确认" },
];

const TYPE_META: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  TASK_ASSIGNED: {
    icon: KanbanSquare,
    tone: "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300",
  },
  TASK_BLOCKED: {
    icon: AlertTriangle,
    tone: "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-300",
  },
  REQUIREMENT_CONFIRMED: {
    icon: FileText,
    tone: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  REQUIREMENT_ONLINE: {
    icon: Rocket,
    tone: "bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300",
  },
  PROJECT_MEMBER_ADDED: {
    icon: UserPlus,
    tone: "bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
  },
};

function isUnread(status: string): boolean {
  return status === "PENDING" || status === "SENT";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

/** 通知跳转目标：优先任务 → 需求 → 项目。 */
function targetHref(n: NotificationVM): string | null {
  if (n.taskId) return `/task/${n.taskId}`;
  if (n.requirementId) return `/requirement/${n.requirementId}`;
  if (n.projectId) return `/project/${n.projectId}`;
  return null;
}

export function NotificationCenter({ items }: { items: NotificationVM[] }) {
  const [tab, setTab] = useState<TabKey>("all");
  const [pending, startTransition] = useTransition();

  const unreadCount = useMemo(
    () => items.filter((n) => isUnread(n.status)).length,
    [items]
  );
  const needsConfirmCount = useMemo(
    () => items.filter((n) => n.needsConfirm && isUnread(n.status)).length,
    [items]
  );

  const filtered = useMemo(() => {
    if (tab === "unread") return items.filter((n) => isUnread(n.status));
    if (tab === "needsConfirm")
      return items.filter((n) => n.needsConfirm && isUnread(n.status));
    return items;
  }, [items, tab]);

  const onMarkRead = (id: string) =>
    startTransition(async () => {
      await markReadAction(id);
    });
  const onMarkAll = () =>
    startTransition(async () => {
      await markAllReadAction();
    });
  const onConfirm = (id: string) =>
    startTransition(async () => {
      await confirmNotificationAction(id);
    });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Bell className="size-6 text-primary" />
            通知中心
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            任务指派、需求评审与上线、阻塞提醒等协作动态都会汇聚到这里。
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onMarkAll}
          disabled={pending || unreadCount === 0}
        >
          <CheckCheck className="size-4" /> 全部已读
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b">
        {TABS.map((t) => {
          const active = tab === t.key;
          const badge =
            t.key === "unread"
              ? unreadCount
              : t.key === "needsConfirm"
                ? needsConfirmCount
                : 0;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-2 text-sm transition-colors",
                active
                  ? "font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              {badge > 0 && (
                <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary tabular-nums">
                  {badge}
                </span>
              )}
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-card text-muted-foreground flex flex-col items-center gap-2 rounded-xl border py-20 text-sm">
          <Inbox className="size-8 opacity-40" />
          {tab === "all" ? "暂无通知。" : "该分类下暂无通知。"}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((n) => {
            const meta = TYPE_META[n.notificationType] ?? {
              icon: FolderKanban,
              tone: "bg-muted text-muted-foreground",
            };
            const Icon = meta.icon;
            const unread = isUnread(n.status);
            const href = targetHref(n);
            return (
              <li
                key={n.id}
                className={cn(
                  "bg-card flex gap-3 rounded-xl border p-4 transition-colors",
                  unread ? "border-primary/30" : "opacity-80"
                )}
              >
                <div
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-lg",
                    meta.tone
                  )}
                >
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {unread && (
                      <span className="size-2 shrink-0 rounded-full bg-primary" />
                    )}
                    <span className="truncate font-medium">{n.title}</span>
                    {n.needsConfirm && n.status !== "CONFIRMED" && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        待确认
                      </span>
                    )}
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                      {relativeTime(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {n.content}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                    {href && (
                      <Link
                        href={href}
                        className="text-primary hover:underline"
                        onClick={() => unread && onMarkRead(n.id)}
                      >
                        查看详情
                      </Link>
                    )}
                    {n.needsConfirm && n.status !== "CONFIRMED" ? (
                      <button
                        type="button"
                        onClick={() => onConfirm(n.id)}
                        disabled={pending}
                        className="text-emerald-600 hover:underline disabled:opacity-50"
                      >
                        确认
                      </button>
                    ) : (
                      unread && (
                        <button
                          type="button"
                          onClick={() => onMarkRead(n.id)}
                          disabled={pending}
                          className="text-muted-foreground inline-flex items-center gap-1 hover:text-foreground disabled:opacity-50"
                        >
                          <Check className="size-3" /> 标记已读
                        </button>
                      )
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
