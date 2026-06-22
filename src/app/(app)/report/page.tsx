import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata = { title: "项目报告 · TeamMindAI" };

export default function ReportPage() {
  return (
    <PagePlaceholder
      title="项目报告"
      description="自动生成日报、周报、月报、项目健康报告与复盘。"
      features={[
        "AI 生成项目周报",
        "本期进展/完成/延期/阻塞",
        "风险清单与下阶段计划",
        "AI 管理建议",
        "导出与邮件发送",
        "项目健康评分",
      ]}
    />
  );
}
