import Link from "next/link";
import { ArrowUpRight, Bot, CheckCircle2, Clock } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AGENT_LIST, type AgentRoleType } from "@/lib/ai/employees";

export const metadata = { title: "AI 员工 · TeamMindAI" };

interface AgentEntry {
  label: string;
  /** 有 href = 已可用入口；缺省 = 规划中。 */
  href?: string;
}

interface AgentUsage {
  /** 在产品中的职责定位（一句话）。 */
  where: string;
  entries: AgentEntry[];
}

/** AI 员工 → 在工作流中的用途与入口（与已落地功能对应）。 */
const AGENT_USAGE: Record<AgentRoleType, AgentUsage> = {
  ai_product_manager: {
    where: "在「AI 对齐室」主导需求澄清，把模糊想法变成标准需求卡片。",
    entries: [{ label: "AI 对齐室 · 需求澄清", href: "/align" }],
  },
  ai_project_manager: {
    where: "需求确认后拆解任务，并在看板按建议角色一键分配负责人。",
    entries: [
      { label: "需求详情 · AI 任务拆解", href: "/requirement" },
      { label: "任务看板 · AI 一键分配", href: "/kanban" },
      { label: "项目报告 · 日报/周报" },
    ],
  },
  ai_architect: {
    where: "评估需求的技术影响范围、接口与数据结构草案、技术风险。",
    entries: [{ label: "需求详情 · 技术方案分析" }],
  },
  ai_ux_designer: {
    where: "把已确认需求转成可交互的低保真界面原型（真实可点击页面）。",
    entries: [{ label: "项目空间 · 界面设计", href: "/project" }],
  },
  ai_test_engineer: {
    where: "基于验收标准生成测试用例、边界场景与回归清单。",
    entries: [{ label: "任务详情 · 测试用例生成" }],
  },
  ai_meeting_secretary: {
    where: "把会议内容转成纪要、待办、决策、风险与需求变更。",
    entries: [{ label: "会议中心 · 纪要与抽取" }],
  },
  ai_knowledge_manager: {
    where: "把需求/任务/决策自动沉淀为可检索的项目记忆（GraphRAG）。",
    entries: [
      { label: "项目空间 · 项目记忆", href: "/project" },
      { label: "知识库 · 问答检索" },
    ],
  },
  ai_notification_secretary: {
    where: "基于业务事件生成站内信/邮件文案，并跟踪发送与提醒。",
    entries: [{ label: "通知中心 · 文案与发送" }],
  },
  ai_ops_analyst: {
    where: "分析项目健康度、团队效率与交付质量，给出管理建议。",
    entries: [{ label: "项目报告 · 健康度分析" }],
  },
};

function isLive(usage: AgentUsage): boolean {
  return usage.entries.some((e) => e.href);
}

export default function AgentsPage() {
  const liveCount = AGENT_LIST.filter((a) =>
    isLive(AGENT_USAGE[a.roleType])
  ).length;
  const plannedCount = AGENT_LIST.length - liveCount;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI 员工</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          AI 员工不是聊天框，而是嵌入工作流的角色：在对齐、拆解、设计、记忆、通知等环节主动承担职责，产出可结构化落库的草案，关键动作由人工确认。
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="size-3.5" /> 已上线 {liveCount}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
            <Clock className="size-3.5" /> 规划中 {plannedCount}
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {AGENT_LIST.map((agent) => {
          const usage = AGENT_USAGE[agent.roleType];
          const live = isLive(usage);
          return (
            <Card key={agent.roleType} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-primary">
                    <Bot className="size-5" />
                    <CardTitle className="text-base">{agent.name}</CardTitle>
                  </div>
                  <span
                    className={
                      live
                        ? "shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                    }
                  >
                    {live ? "已上线" : "规划中"}
                  </span>
                </div>
                <CardDescription>{agent.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3 text-xs">
                <p className="text-muted-foreground">{usage.where}</p>

                <div className="space-y-1.5">
                  <div className="font-medium text-foreground">工作入口</div>
                  <ul className="space-y-1">
                    {usage.entries.map((e) =>
                      e.href ? (
                        <li key={e.label}>
                          <Link
                            href={e.href}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            {e.label}
                            <ArrowUpRight className="size-3" />
                          </Link>
                        </li>
                      ) : (
                        <li
                          key={e.label}
                          className="inline-flex items-center gap-1.5 text-muted-foreground"
                        >
                          {e.label}
                          <span className="rounded bg-muted px-1 py-0.5 text-[10px]">
                            规划中
                          </span>
                        </li>
                      )
                    )}
                  </ul>
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-muted-foreground">
                  <span>
                    模型：
                    <span className="font-medium text-foreground">
                      {agent.modelTier === "chat" ? "强指令" : "快/省"}
                    </span>
                  </span>
                  <span>
                    人工确认：
                    <span className="font-medium text-foreground">
                      {agent.requiresHumanApproval ? "需要" : "不需要"}
                    </span>
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
