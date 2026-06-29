import type { TaskStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  REQUIREMENT_STATUS_LABEL,
  TASK_STATUS_LABEL,
  PRIORITY_LABEL,
} from "@/lib/labels";

/** 报告统计周期（天）。默认 7 天（周报）。 */
export const REPORT_RANGE_DAYS = {
  daily: 1,
  weekly: 7,
  monthly: 30,
} as const;
export type ReportRange = keyof typeof REPORT_RANGE_DAYS;

export const REPORT_RANGE_LABEL: Record<ReportRange, string> = {
  daily: "日报",
  weekly: "周报",
  monthly: "月报",
};

type StatusCount = { status: string; count: number };
type TaskBrief = {
  id: string;
  taskCode: string;
  title: string;
  status: string;
  priority: string;
  assignee: string | null;
  dueTime: string | null;
  blockedReason: string | null;
};
type RequirementBrief = {
  id: string;
  requirementCode: string;
  title: string;
  status: string;
  priority: string;
};

export type ProjectReportFacts = {
  project: {
    id: string;
    name: string;
    projectCode: string;
    status: string;
  };
  range: ReportRange;
  rangeDays: number;
  generatedAt: Date;
  progress: number;
  totalTasks: number;
  doneTasks: number;
  reqByStatus: StatusCount[];
  taskByStatus: StatusCount[];
  completedThisPeriod: TaskBrief[];
  blockedTasks: TaskBrief[];
  delayedTasks: TaskBrief[];
  overdueTasks: TaskBrief[];
  upcomingTasks: TaskBrief[];
  confirmedRequirements: RequirementBrief[];
  onlineRequirements: RequirementBrief[];
  pendingRequirements: RequirementBrief[];
  counts: {
    decisions: number;
    meetings: number;
    newRequirements: number;
  };
};

type RawTask = {
  id: string;
  taskCode: string;
  title: string;
  status: string;
  priority: string;
  dueTime: Date | null;
  blockedReason: string | null;
  assignee: { displayName: string | null; name: string | null } | null;
};

function toTaskBrief(t: RawTask): TaskBrief {
  return {
    id: t.id,
    taskCode: t.taskCode,
    title: t.title,
    status: t.status,
    priority: t.priority,
    assignee: t.assignee?.displayName ?? t.assignee?.name ?? null,
    dueTime: t.dueTime ? t.dueTime.toISOString() : null,
    blockedReason: t.blockedReason ?? null,
  };
}

const TASK_SELECT = {
  id: true,
  taskCode: true,
  title: true,
  status: true,
  priority: true,
  dueTime: true,
  blockedReason: true,
  assignee: { select: { displayName: true, name: true } },
} as const;

const REQ_SELECT = {
  id: true,
  requirementCode: true,
  title: true,
  status: true,
  priority: true,
} as const;

/**
 * 汇总单个项目在指定周期内的真实事实数据，供「事实面板」展示与 AI 报告生成共用。
 * 全部基于库内数据，不含任何 AI 推断，确保报告「用数据说话」。
 */
export async function gatherProjectReportFacts(
  projectId: string,
  range: ReportRange = "weekly"
): Promise<ProjectReportFacts> {
  const rangeDays = REPORT_RANGE_DAYS[range];
  const now = new Date();
  const since = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);
  const upcomingUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const activeTaskStatuses: TaskStatus[] = [
    "TODO",
    "IN_PROGRESS",
    "INTEGRATING",
    "TESTING",
    "ACCEPTING",
    "BLOCKED",
    "DELAYED",
  ];

  const [
    project,
    reqByStatus,
    taskByStatus,
    doneTasks,
    totalTasks,
    completedThisPeriod,
    blockedTasks,
    delayedTasks,
    overdueTasks,
    upcomingTasks,
    confirmedRequirements,
    onlineRequirements,
    pendingRequirements,
    decisions,
    meetings,
    newRequirements,
  ] = await Promise.all([
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { id: true, name: true, projectCode: true, status: true },
    }),
    prisma.requirement.groupBy({
      by: ["status"],
      where: { projectId },
      _count: true,
    }),
    prisma.task.groupBy({ by: ["status"], where: { projectId }, _count: true }),
    prisma.task.count({ where: { projectId, status: "DONE" } }),
    prisma.task.count({ where: { projectId } }),
    prisma.task.findMany({
      where: { projectId, status: "DONE", updatedAt: { gte: since } },
      select: TASK_SELECT,
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    prisma.task.findMany({
      where: { projectId, status: "BLOCKED" },
      select: TASK_SELECT,
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    prisma.task.findMany({
      where: { projectId, status: "DELAYED" },
      select: TASK_SELECT,
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    prisma.task.findMany({
      where: {
        projectId,
        status: { in: activeTaskStatuses },
        dueTime: { lt: now },
      },
      select: TASK_SELECT,
      orderBy: { dueTime: "asc" },
      take: 30,
    }),
    prisma.task.findMany({
      where: {
        projectId,
        status: { in: activeTaskStatuses },
        dueTime: { gte: now, lte: upcomingUntil },
      },
      select: TASK_SELECT,
      orderBy: { dueTime: "asc" },
      take: 30,
    }),
    prisma.requirement.findMany({
      where: { projectId, status: "CONFIRMED", updatedAt: { gte: since } },
      select: REQ_SELECT,
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.requirement.findMany({
      where: { projectId, status: "ONLINE", updatedAt: { gte: since } },
      select: REQ_SELECT,
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.requirement.findMany({
      where: {
        projectId,
        status: { in: ["IDEA_POOL", "CLARIFYING", "REVIEWING", "SCHEDULING"] },
      },
      select: REQ_SELECT,
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.decision.count({ where: { projectId, createdAt: { gte: since } } }),
    prisma.meeting.count({ where: { projectId, createdAt: { gte: since } } }),
    prisma.requirement.count({
      where: { projectId, createdAt: { gte: since } },
    }),
  ]);

  const progress =
    totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const mapStatus = (
    rows: { status: string; _count: number }[]
  ): StatusCount[] =>
    rows
      .map((r) => ({ status: r.status, count: r._count }))
      .sort((a, b) => b.count - a.count);

  return {
    project,
    range,
    rangeDays,
    generatedAt: now,
    progress,
    totalTasks,
    doneTasks,
    reqByStatus: mapStatus(reqByStatus as { status: string; _count: number }[]),
    taskByStatus: mapStatus(
      taskByStatus as { status: string; _count: number }[]
    ),
    completedThisPeriod: completedThisPeriod.map(toTaskBrief),
    blockedTasks: blockedTasks.map(toTaskBrief),
    delayedTasks: delayedTasks.map(toTaskBrief),
    overdueTasks: overdueTasks.map(toTaskBrief),
    upcomingTasks: upcomingTasks.map(toTaskBrief),
    confirmedRequirements,
    onlineRequirements,
    pendingRequirements,
    counts: {
      decisions,
      meetings,
      newRequirements,
    },
  };
}

/** 把事实数据格式化为喂给 AI 的纯文本上下文（中文标签 + 数字事实）。 */
export function formatReportFactsForPrompt(facts: ProjectReportFacts): string {
  const taskBriefLine = (t: TaskBrief) =>
    `- ${t.title}（${t.taskCode}，${PRIORITY_LABEL[t.priority] ?? t.priority}` +
    `${t.assignee ? `，负责人 ${t.assignee}` : "，未指派"}` +
    `${t.dueTime ? `，截止 ${t.dueTime.slice(0, 10)}` : ""}` +
    `${t.blockedReason ? `，阻塞原因：${t.blockedReason}` : ""}）`;
  const reqBriefLine = (r: RequirementBrief) =>
    `- ${r.title}（${r.requirementCode}，${PRIORITY_LABEL[r.priority] ?? r.priority}）`;
  const statusLine = (rows: StatusCount[], labels: Record<string, string>) =>
    rows.length
      ? rows.map((s) => `${labels[s.status] ?? s.status} ${s.count}`).join("、")
      : "无";
  const section = (title: string, lines: string[]) =>
    `## ${title}\n${lines.length ? lines.join("\n") : "（无）"}`;

  return [
    `项目：${facts.project.name}（${facts.project.projectCode}）`,
    `统计周期：最近 ${facts.rangeDays} 天`,
    `任务总数 ${facts.totalTasks}，已完成 ${facts.doneTasks}，总体进度 ${facts.progress}%`,
    `需求状态分布：${statusLine(facts.reqByStatus, REQUIREMENT_STATUS_LABEL)}`,
    `任务状态分布：${statusLine(facts.taskByStatus, TASK_STATUS_LABEL)}`,
    `本周期：新增需求 ${facts.counts.newRequirements}、决策 ${facts.counts.decisions}、会议 ${facts.counts.meetings}`,
    "",
    section(
      "本周期已完成任务",
      facts.completedThisPeriod.map(taskBriefLine)
    ),
    section("阻塞中的任务", facts.blockedTasks.map(taskBriefLine)),
    section("延期中的任务", facts.delayedTasks.map(taskBriefLine)),
    section("已逾期未完成任务", facts.overdueTasks.map(taskBriefLine)),
    section("未来 7 天临期任务", facts.upcomingTasks.map(taskBriefLine)),
    section("本周期确认的需求", facts.confirmedRequirements.map(reqBriefLine)),
    section("本周期上线的需求", facts.onlineRequirements.map(reqBriefLine)),
    section("待推进的需求（想法/澄清/评审/排期）", facts.pendingRequirements.map(reqBriefLine)),
  ].join("\n");
}
