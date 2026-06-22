import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata = { title: "通知中心 · TeamMindAI" };

export default function NotificationPage() {
  return (
    <PagePlaceholder
      title="通知中心"
      description="统一展示站内信、邮件、企业微信等通知，支持待确认与发送状态跟踪。"
      features={[
        "通知 Tabs（全部/未读/待确认/已发送/失败）",
        "需求待确认/任务分配/延期提醒",
        "邮件模板配置",
        "通知规则引擎",
        "失败重试与发送日志",
        "重要通知人工确认后发送",
      ]}
    />
  );
}
