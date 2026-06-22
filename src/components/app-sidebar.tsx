"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain } from "lucide-react";

import { cn } from "@/lib/utils";
import { PRIMARY_NAV } from "@/lib/nav";

export function AppSidebar({ role }: { role: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
      <Link
        href="/dashboard"
        className="flex h-16 items-center gap-2 border-b px-5 font-semibold"
      >
        <Brain className="size-6 text-primary" />
        <span>TeamMindAI</span>
      </Link>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {PRIMARY_NAV.filter(
          (item) => !item.roles || item.roles.includes(role)
        ).map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {item.title}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4 text-xs text-muted-foreground">
        企业大脑 · MVP v0.1
      </div>
    </aside>
  );
}
