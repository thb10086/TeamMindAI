import Link from "next/link";
import {
  ArrowRight,
  Brain,
  Sparkles,
  LayoutDashboard,
  ListChecks,
  Bell,
  Database,
  Users,
  FileText,
  GitMerge,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const loopSteps = [
  "想法输入",
  "AI 需求澄清",
  "标准需求卡片",
  "需求评审",
  "AI 任务拆解",
  "看板推进",
  "通知提醒",
  "项目记忆沉淀",
];

const aiEmployees = [
  { name: "AI 产品经理", desc: "把模糊想法变成标准需求", icon: Sparkles },
  { name: "AI 项目经理", desc: "任务推进、风险提醒、周报", icon: LayoutDashboard },
  { name: "AI 架构师", desc: "技术方案与系统影响分析", icon: GitMerge },
  { name: "AI 测试工程师", desc: "测试用例与验收标准", icon: ListChecks },
  { name: "AI 会议纪要员", desc: "会议转结构化资产", icon: FileText },
  { name: "AI 知识库管理员", desc: "项目知识沉淀与检索", icon: Database },
  { name: "AI 通知秘书", desc: "多渠道通知与二次提醒", icon: Bell },
  { name: "AI 运营分析师", desc: "项目健康与效率分析", icon: Users },
];

const principles = [
  { title: "先对齐，再执行", desc: "需求进入开发前必须补全背景、目标、范围、验收标准。" },
  { title: "AI 是员工，不是聊天框", desc: "AI 在需求、任务、会议、报告中主动承担职责。" },
  { title: "项目空间是核心容器", desc: "所有需求、任务、决策、知识都归属到项目。" },
  { title: "信息要结构化", desc: "AI 输出落库为需求卡片、任务、决策、记忆。" },
  { title: "关键节点人工确认", desc: "AI 生成草案，人类保留确认与审批权。" },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2 font-semibold">
            <Brain className="size-6 text-primary" />
            <span>TeamMindAI</span>
            <span className="ml-1 hidden text-sm text-muted-foreground sm:inline">
              AI 企业大脑平台
            </span>
          </div>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">登录</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard">
                进入工作台 <ArrowRight className="size-4" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto flex max-w-6xl flex-col items-center px-6 py-24 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm text-muted-foreground">
          <Sparkles className="size-4 text-primary" /> 多 Agent 智能协作中台
        </div>
        <h1 className="max-w-3xl text-balance text-5xl font-bold tracking-tight sm:text-6xl">
          让想法变需求，<br className="hidden sm:block" />让项目自动运转
        </h1>
        <p className="mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
          面向初创团队和技术型企业的信息对齐中台。通过 AI 产品经理、AI 项目经理、AI
          架构师等 AI 员工，完成需求对齐、任务拆解、项目推进、通知提醒和企业知识沉淀。
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/dashboard">
              立即开始 <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/project">查看项目空间</Link>
          </Button>
        </div>
      </section>

      {/* Core loop */}
      <section className="border-y bg-muted/30 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-sm font-medium uppercase tracking-wider text-muted-foreground">
            核心业务闭环
          </h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            {loopSteps.map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <span className="rounded-lg border bg-background px-4 py-2 text-sm font-medium shadow-xs">
                  {step}
                </span>
                {i < loopSteps.length - 1 && (
                  <ArrowRight className="size-4 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI employees */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">AI 员工体系</h2>
        <p className="mt-3 text-center text-muted-foreground">
          每个 AI 员工按职责分工，基于项目上下文工作，关键动作由人类确认。
        </p>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {aiEmployees.map(({ name, desc, icon: Icon }) => (
            <div
              key={name}
              className="rounded-xl border bg-card p-5 transition-colors hover:bg-accent/40"
            >
              <Icon className="size-6 text-primary" />
              <h3 className="mt-3 font-semibold">{name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Principles */}
      <section className="border-t bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-10 flex items-center justify-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <h2 className="text-3xl font-bold tracking-tight">五大设计原则</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {principles.map((p, i) => (
              <div key={p.title} className="rounded-xl border bg-card p-6">
                <div className="text-sm font-semibold text-primary">
                  0{i + 1}
                </div>
                <h3 className="mt-2 font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <Brain className="size-5" />
            <span>TeamMindAI · 把公司内部混乱的信息变成结构化资产</span>
          </div>
          <span>MVP v0.1</span>
        </div>
      </footer>
    </div>
  );
}
