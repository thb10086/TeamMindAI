import { redirect } from "next/navigation";

// 用户/部门管理已迁至「组织管理」(/org)；系统设置后续承载 AI 员工/通知/集成等系统级配置。
export default function SettingsPage() {
  redirect("/org");
}
