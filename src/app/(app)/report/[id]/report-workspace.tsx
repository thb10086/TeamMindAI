"use client";

import { useState, useTransition } from "react";
import {
  Sparkles,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ListChecks,
  Lightbulb,
  Activity,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  REQUIREMENT_STATUS_LABEL as REQ_LABEL,
  TASK_STATUS_LABEL,
} from "@/lib/labels";
import type { ProjectReport } from "@/lib/ai/schemas";
import type { ProjectReportFacts, ReportRange } from "@/lib/reports";
import { REPORT_RANGE_LABEL } from "@/lib/reports";
import { generateReportAction } from "./actions";

const RANGES: ReportRange[] = ["daily", "weekly", "monthly"];

function healthClass(score: number): string {
  if (score >= 80)
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
  if (score >= 60)
    return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
      {label}
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}

function reportToMarkdown(
  report: ProjectReport,
  facts: ProjectReportFacts,
  range: ReportRange
): string {
  const lines: string[] = [];
  lines.push(`# ${facts.project.name} · ${REPORT_RANGE_LABEL[range]}`);
  lines.push("");
  lines.push(
    `> 项目编号 ${facts.project.projectCode} · 健康评分 ${report.healthScore}/100 · 总体进度 ${facts.progress}%`
  );
  if (report.healthReason) lines.push(`> ${report.healthReason}`);
  lines.push("");
  lines.push("## 本期概述");
  lines.push(report.overview);
  const section = (title: string, items: string[]) => {
    if (!items.length) return;
    lines.push("");
    lines.push(`## ${title}`);
    items.forEach((i) => lines.push(`- ${i}`));
  };
  section("完成项与亮点", report.highlights);
  section("进行中", report.inProgress);
  if (report.risks.length) {
    lines.push("");
    lines.push("## 风险 / 阻塞 / 延期");
    report.risks.forEach((r) => {
      lines.push(`- **${r.title}**`);
      if (r.impact) lines.push(`  - 影响：${r.impact}`);
      if (r.suggestion) lines.push(`  - 建议：${r.suggestion}`);
    });
  }
  section("下阶段计划", report.nextPlan);
  section("管理建议", report.managementAdvice);
  return lines.join("\n");
}

export function ReportWorkspace({
  projectId,
  facts,
}: {
  projectId: string;
  facts: ProjectReportFacts;
}) {
  const [range, setRange] = useState<ReportRange>("weekly");
  const [report, setReport] = useState<ProjectReport | null>(null);
  const [reportRange, setReportRange] = useState<ReportRange>("weekly");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function onGenerate() {
    setError(null);
    startTransition(async () => {
      const res = await generateReportAction(projectId, range);
      if (res.ok) {
        setReport(res.report);
        setReportRange(res.range);
      } else {
        setError(res.error);
      }
    });
  }

  function onCopy() {
    if (!report) return;
    const md = reportToMarkdown(report, facts, reportRange);
    void navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const overdueCount = facts.overdueTasks.length;
  const blockedCount = facts.blockedTasks.length;
  const delayedCount = facts.delayedTasks.length;
  const upcomingCount = facts.upcomingTasks.length;

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      {/* 事实快照面板 */}
      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">数据快照</h2>
            <span className="text-xs text-muted-foreground">实时</span>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">总体进度</span>
              <span className="font-semibold">{facts.progress}%</span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${facts.progress}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {facts.doneTasks}/{facts.totalTasks} 任务已完成
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <StatPill label="阻塞" value={blockedCount} />
            <StatPill label="延期" value={delayedCount} />
            <StatPill label="逾期" value={overdueCount} />
            <StatPill label="临期(7天)" value={upcomingCount} />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">需求状态分布</h2>
          <div className="mt-2 space-y-1.5">
            {facts.reqByStatus.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无需求</p>
            ) : (
              facts.reqByStatus.map((s) => (
                <div
                  key={s.status}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-muted-foreground">
                    {REQ_LABEL[s.status] ?? s.status}
                  </span>
                  <span className="font-medium">{s.count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">任务状态分布</h2>
          <div className="mt-2 space-y-1.5">
            {facts.taskByStatus.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无任务</p>
            ) : (
              facts.taskByStatus.map((s) => (
                <div
                  key={s.status}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-muted-foreground">
                    {TASK_STATUS_LABEL[s.status] ?? s.status}
                  </span>
                  <span className="font-medium">{s.count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 报告生成与展示 */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
          <div className="inline-flex rounded-lg border p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  range === r
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {REPORT_RANGE_LABEL[r]}
              </button>
            ))}
          </div>
          <Button onClick={onGenerate} disabled={pending} className="gap-1.5">
            <Sparkles className="size-4" />
            {pending ? "AI 生成中…" : report ? "重新生成" : "生成报告"}
          </Button>
          {report && (
            <Button
              variant="outline"
              onClick={onCopy}
              className="gap-1.5"
              type="button"
            >
              {copied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
              {copied ? "已复制" : "复制 Markdown"}
            </Button>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {!report && !error && (
          <div className="rounded-xl border border-dashed bg-card py-16 text-center text-sm text-muted-foreground">
            {pending
              ? "AI 项目经理正在基于真实数据生成报告，请稍候…"
              : "选择周期后点击「生成报告」，AI 项目经理将基于左侧真实数据生成结构化报告。"}
          </div>
        )}

        {report && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Activity className="size-4 text-primary" />
                  本期概述
                </h2>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    healthClass(report.healthScore)
                  )}
                >
                  健康 {report.healthScore}/100
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                {report.overview}
              </p>
              {report.healthReason && (
                <p className="mt-2 text-xs text-muted-foreground">
                  评分理由：{report.healthReason}
                </p>
              )}
            </div>

            <ReportList
              icon={<CheckCircle2 className="size-4 text-emerald-600" />}
              title="完成项与亮点"
              items={report.highlights}
            />
            <ReportList
              icon={<Clock className="size-4 text-blue-600" />}
              title="进行中"
              items={report.inProgress}
            />

            {report.risks.length > 0 && (
              <div className="rounded-xl border bg-card p-5">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <AlertTriangle className="size-4 text-red-600" />
                  风险 / 阻塞 / 延期
                </h2>
                <div className="mt-3 space-y-3">
                  {report.risks.map((r, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-red-100 bg-red-50/50 p-3 dark:border-red-950 dark:bg-red-950/30"
                    >
                      <p className="text-sm font-medium">{r.title}</p>
                      {r.impact && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          影响：{r.impact}
                        </p>
                      )}
                      {r.suggestion && (
                        <p className="mt-1 text-xs text-foreground">
                          建议：{r.suggestion}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <ReportList
              icon={<ListChecks className="size-4 text-indigo-600" />}
              title="下阶段计划"
              items={report.nextPlan}
            />
            <ReportList
              icon={<Lightbulb className="size-4 text-amber-600" />}
              title="管理建议"
              items={report.managementAdvice}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ReportList({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
}) {
  if (!items.length) return null;
  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        {icon}
        {title}
      </h2>
      <ul className="mt-3 space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
