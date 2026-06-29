import Link from "next/link";
import { Bell, LogOut, Plus, Search } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { requireFullUser } from "@/lib/access";
import { countUnread } from "@/lib/notifications";
import { logoutAction } from "@/app/login/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireFullUser();
  const initial = (user.name ?? "U").trim().charAt(0).toUpperCase();
  const unread = await countUnread(user.id);

  return (
    <div className="flex min-h-screen bg-muted/20">
      <AppSidebar role={user.systemRole} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b bg-background/80 px-6 backdrop-blur">
          <div className="relative hidden max-w-md flex-1 items-center md:flex">
            <Search className="absolute left-3 size-4 text-muted-foreground" />
            <input
              placeholder="搜索项目、需求、任务、知识…"
              className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline">
              <Plus className="size-4" />
              创建需求
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link href="/notification" className="relative" title="通知中心">
                <Bell className="size-4" />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-medium leading-4 text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            </Button>
            <div className="flex items-center gap-2 pl-1">
              <div className="grid size-8 place-items-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                {initial}
              </div>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {user.name}
              </span>
              <form action={logoutAction}>
                <Button
                  size="icon"
                  variant="ghost"
                  type="submit"
                  title="退出登录"
                >
                  <LogOut className="size-4" />
                </Button>
              </form>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
