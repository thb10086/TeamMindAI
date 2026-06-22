import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  KanbanSquare,
  Sparkles,
  Bot,
  CalendarClock,
  BookOpen,
  Bell,
  BarChart3,
  Building2,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** 仅这些系统角色可见；不填表示所有登录用户可见。 */
  roles?: string[];
}

/** 一级导航（对应产品原型 §3.1）。 */
export const PRIMARY_NAV: NavItem[] = [
  { title: "工作台", href: "/dashboard", icon: LayoutDashboard },
  { title: "AI 对齐室", href: "/align", icon: Sparkles },
  { title: "项目空间", href: "/project", icon: FolderKanban },
  { title: "需求中心", href: "/requirement", icon: FileText },
  { title: "任务看板", href: "/kanban", icon: KanbanSquare },
  { title: "AI 员工", href: "/agents", icon: Bot },
  { title: "会议中心", href: "/meeting", icon: CalendarClock },
  { title: "知识库", href: "/knowledge", icon: BookOpen },
  { title: "通知中心", href: "/notification", icon: Bell },
  { title: "项目报告", href: "/report", icon: BarChart3 },
  {
    title: "组织管理",
    href: "/org",
    icon: Building2,
    roles: ["SUPER_ADMIN", "COMPANY_ADMIN"],
  },
];
