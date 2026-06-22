"use server";

import { revalidatePath } from "next/cache";

import { enqueueMemoryIngest } from "@/lib/queue/memory-queue";
import { feedbackRequirementOnline } from "@/lib/memory/feedback";
import {
  createAndEnqueueJob,
  findActiveJob,
  jobStatusSelect,
} from "@/lib/jobs";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { requireFullUser, canLeadProject } from "@/lib/access";

export interface BreakdownResult {
  jobId?: string;
  error?: string;
}

/**
 * AI 任务拆解（后台异步）：校验后入队一个 REQUIREMENT_BREAKDOWN 作业，立即返回 jobId。
 * 实际拆解在 worker 执行（见 lib/jobs/run-breakdown），离开页面也会继续完成；前端轮询 getJobStatus。
 * 人在回路：仅创建任务草案，不自动指派负责人。
 */
export async function breakdownRequirement(
  requirementId: string
): Promise<BreakdownResult> {
  const user = await requireUser();

  const req = await prisma.requirement.findFirst({
    where: {
      id: requirementId,
      project: { members: { some: { userId: user.id } } },
    },
    select: { id: true, projectId: true },
  });
  if (!req) return { error: "无权访问该需求或需求不存在。" };

  const existing = await prisma.task.count({
    where: { requirementId: req.id },
  });
  if (existing > 0) {
    return { error: `该需求已拆解 ${existing} 个任务，请在看板中查看或管理。` };
  }

  // 已有进行中的拆解作业则复用，避免重复触发
  const active = await findActiveJob({
    type: "REQUIREMENT_BREAKDOWN",
    requirementId: req.id,
  });
  if (active) return { jobId: active.id };

  try {
    const jobId = await createAndEnqueueJob({
      type: "REQUIREMENT_BREAKDOWN",
      projectId: req.projectId,
      requirementId: req.id,
      createdById: user.id,
    });
    return { jobId };
  } catch {
    return { error: "后台任务服务暂不可用，请稍后重试。" };
  }
}

export interface JobStatusResult {
  status?: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  progress?: number;
  total?: number;
  completed?: number;
  jobError?: string | null;
  error?: string;
}

/** 轮询后台作业状态（校验项目成员权限）。供需求拆解等场景前端轮询。 */
export async function getJobStatus(jobId: string): Promise<JobStatusResult> {
  const user = await requireUser();
  const job = await prisma.asyncJob.findFirst({
    where: { id: jobId, project: { members: { some: { userId: user.id } } } },
    select: jobStatusSelect,
  });
  if (!job) return { error: "任务不存在或无权访问。" };
  return {
    status: job.status,
    progress: job.progress,
    total: job.total,
    completed: job.completed,
    jobError: job.error,
  };
}

export interface ConfirmResult {
  ok?: boolean;
  error?: string;
}

/**
 * 人工确认需求（评审通过）：CLARIFYING/REVIEWING → CONFIRMED。
 * 体现「先对齐，再执行」：仅项目主管/管理员可确认，且无待确认问题。
 */
export async function confirmRequirement(
  requirementId: string
): Promise<ConfirmResult> {
  const user = await requireFullUser();
  const req = await prisma.requirement.findFirst({
    where: {
      id: requirementId,
      project: { members: { some: { userId: user.id } } },
    },
    select: {
      id: true,
      projectId: true,
      status: true,
      openQuestions: true,
      title: true,
    },
  });
  if (!req) return { error: "无权访问该需求或需求不存在。" };
  if (!(await canLeadProject(req.projectId, user))) {
    return { error: "仅项目负责人/产品负责人可确认需求。" };
  }
  if (req.openQuestions > 0) {
    return { error: "仍有待确认问题，请先回到 AI 对齐室澄清。" };
  }
  if (!(["CLARIFYING", "REVIEWING"] as string[]).includes(req.status)) {
    return { error: "当前状态无需确认。" };
  }
  await prisma.requirement.update({
    where: { id: req.id },
    data: { status: "CONFIRMED" },
  });
  await prisma.operationLog.create({
    data: {
      userId: user.id,
      action: "REQUIREMENT_CONFIRMED",
      targetType: "Requirement",
      targetId: req.id,
      detail: { title: req.title },
    },
  });
  revalidatePath(`/requirement/${req.id}`);
  revalidatePath(`/project/${req.projectId}`);
  return { ok: true };
}

/**
 * 人工确认需求上线：ACCEPTING/TESTING → ONLINE。
 * 体现「上线验收由人确认」：仅项目主管/管理员可操作（不自动联动，闭环收口）。
 */
export async function markRequirementOnline(
  requirementId: string
): Promise<ConfirmResult> {
  const user = await requireFullUser();
  const req = await prisma.requirement.findFirst({
    where: {
      id: requirementId,
      project: { members: { some: { userId: user.id } } },
    },
    select: { id: true, projectId: true, status: true, title: true },
  });
  if (!req) return { error: "无权访问该需求或需求不存在。" };
  if (!(await canLeadProject(req.projectId, user))) {
    return { error: "仅项目负责人/产品负责人可确认上线。" };
  }
  if (!(["ACCEPTING", "TESTING"] as string[]).includes(req.status)) {
    return { error: "仅待验收 / 测试中的需求可标记上线。" };
  }
  await prisma.requirement.update({
    where: { id: req.id },
    data: { status: "ONLINE" },
  });
  await prisma.operationLog.create({
    data: {
      userId: user.id,
      action: "REQUIREMENT_ONLINE",
      targetType: "Requirement",
      targetId: req.id,
      detail: { title: req.title },
    },
  });
  // 上线里程碑回流项目记忆（loop-feedback）。
  await feedbackRequirementOnline({
    projectId: req.projectId,
    requirementId: req.id,
    title: req.title,
  });
  revalidatePath(`/requirement/${req.id}`);
  revalidatePath(`/project/${req.projectId}`);
  return { ok: true };
}

// ============================================================
// 需求编辑 / 删除（人工就地补全与维护，闭环关键）
// ============================================================

/** 优先级 → 记忆重要性基线。 */
const PRIORITY_IMPORTANCE: Record<string, number> = {
  P0: 0.95,
  P1: 0.8,
  P2: 0.6,
  P3: 0.4,
};

const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
type PriorityValue = (typeof PRIORITIES)[number];

export interface RequirementEditInput {
  title: string;
  priority: string;
  background: string;
  problem: string;
  targetUser: string;
  businessGoal: string;
  /** 每行一条 */
  scope: string;
  /** 每行一条 */
  outOfScope: string;
  userStory: string;
  /** 每行一条 */
  acceptanceCriteria: string;
}

/** 字段中文名（写入 RequirementHistory，便于审计阅读）。 */
const EDITABLE_LABELS: Record<keyof RequirementEditInput, string> = {
  title: "需求名称",
  priority: "优先级",
  background: "业务背景",
  problem: "当前问题",
  targetUser: "目标用户",
  businessGoal: "业务目标",
  scope: "功能范围",
  outOfScope: "不做范围",
  userStory: "用户故事",
  acceptanceCriteria: "验收标准",
};

function norm(v: string | null | undefined): string {
  return (v ?? "").trim();
}

/** 多行文本转「；」分隔的一行（供记忆沉淀）。 */
function joinLines(v: string): string {
  return v
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("；");
}

/** 统计「对齐必备项」缺失数（背景/目标/范围/验收），用于重算 openQuestions。 */
function countMissingEssentials(r: {
  background: string;
  businessGoal: string;
  scope: string;
  acceptanceCriteria: string;
}): number {
  return [r.background, r.businessGoal, r.scope, r.acceptanceCriteria].filter(
    (v) => !v.trim()
  ).length;
}

/**
 * 人工编辑需求（就地补全/修订，闭环关键）：项目成员可编辑。
 * - 逐字段写 RequirementHistory（审计）。
 * - 依「对齐必备项」完整度重算 openQuestions；补齐后 CLARIFYING 自动进入 REVIEWING（解除卡壳）。
 * - 重新沉淀项目记忆（#5：更改需求后记忆自动整理）。
 */
export async function updateRequirement(
  requirementId: string,
  input: RequirementEditInput
): Promise<ConfirmResult> {
  const user = await requireUser();
  const req = await prisma.requirement.findFirst({
    where: {
      id: requirementId,
      project: { members: { some: { userId: user.id } } },
    },
    select: {
      id: true,
      projectId: true,
      status: true,
      title: true,
      priority: true,
      background: true,
      problem: true,
      targetUser: true,
      businessGoal: true,
      scope: true,
      outOfScope: true,
      userStory: true,
      acceptanceCriteria: true,
      project: { select: { name: true } },
    },
  });
  if (!req) return { error: "无权访问该需求或需求不存在。" };

  const title = norm(input.title);
  if (!title) return { error: "需求名称不能为空。" };
  if (title.length > 200) return { error: "需求名称过长（不超过 200 字）。" };

  const priority: PriorityValue = (PRIORITIES as readonly string[]).includes(
    input.priority
  )
    ? (input.priority as PriorityValue)
    : (req.priority as PriorityValue);

  const next = {
    title,
    priority,
    background: norm(input.background),
    problem: norm(input.problem),
    targetUser: norm(input.targetUser),
    businessGoal: norm(input.businessGoal),
    scope: norm(input.scope),
    outOfScope: norm(input.outOfScope),
    userStory: norm(input.userStory),
    acceptanceCriteria: norm(input.acceptanceCriteria),
  };
  const longFields = [
    "background",
    "problem",
    "targetUser",
    "businessGoal",
    "scope",
    "outOfScope",
    "userStory",
    "acceptanceCriteria",
  ] as const;
  for (const k of longFields) {
    if (next[k].length > 5000) {
      return { error: `「${EDITABLE_LABELS[k]}」内容过长（不超过 5000 字）。` };
    }
  }

  // 逐字段 diff → 历史记录
  const changes: { field: string; oldValue: string; newValue: string }[] = [];
  (Object.keys(next) as (keyof typeof next)[]).forEach((k) => {
    const before = k === "priority" ? req.priority : norm(req[k] as string | null);
    const after = String(next[k]);
    if (String(before) !== after) {
      changes.push({
        field: EDITABLE_LABELS[k],
        oldValue: String(before ?? ""),
        newValue: after,
      });
    }
  });

  const missing = countMissingEssentials(next);
  const status =
    missing === 0 && req.status === "CLARIFYING" ? "REVIEWING" : req.status;

  await prisma.$transaction([
    prisma.requirement.update({
      where: { id: req.id },
      data: { ...next, openQuestions: missing, status },
    }),
    ...changes.map((c) =>
      prisma.requirementHistory.create({
        data: {
          requirementId: req.id,
          field: c.field,
          oldValue: c.oldValue,
          newValue: c.newValue,
          changedById: user.id,
          note: "手动编辑",
        },
      })
    ),
  ]);

  await prisma.operationLog.create({
    data: {
      userId: user.id,
      action: "REQUIREMENT_UPDATED",
      targetType: "Requirement",
      targetId: req.id,
      detail: { fields: changes.map((c) => c.field) },
    },
  });

  // #5：需求更改后重新沉淀项目记忆（异步，不阻断保存）。
  const cardText = [
    `需求：${next.title}`,
    next.background && `业务背景：${next.background}`,
    next.problem && `当前问题：${next.problem}`,
    next.targetUser && `目标用户：${next.targetUser}`,
    next.businessGoal && `业务目标：${next.businessGoal}`,
    next.scope && `功能范围：${joinLines(next.scope)}`,
    next.outOfScope && `不做范围：${joinLines(next.outOfScope)}`,
    next.userStory && `用户故事：${next.userStory}`,
    next.acceptanceCriteria &&
      `验收标准：${joinLines(next.acceptanceCriteria)}`,
  ]
    .filter(Boolean)
    .join("\n");
  await enqueueMemoryIngest({
    projectId: req.projectId,
    originType: "requirement",
    originId: req.id,
    title: next.title,
    text: cardText,
    memoryType: "HISTORICAL_REQUIREMENT",
    importanceHint: PRIORITY_IMPORTANCE[priority] ?? 0.6,
    contextHint: `项目：${req.project.name}（需求更新）`,
    rebuildCommunities: true,
  });

  revalidatePath("/requirement");
  revalidatePath(`/requirement/${req.id}`);
  revalidatePath(`/project/${req.projectId}`);
  return { ok: true };
}

/**
 * 删除需求（仅项目负责人/产品负责人）。
 * 级联清理该需求派生的产物（看板任务/界面设计/评审/决策），不留孤儿数据。
 */
export async function deleteRequirement(
  requirementId: string
): Promise<ConfirmResult> {
  const user = await requireFullUser();
  const req = await prisma.requirement.findFirst({
    where: {
      id: requirementId,
      project: { members: { some: { userId: user.id } } },
    },
    select: { id: true, projectId: true, title: true },
  });
  if (!req) return { error: "无权访问该需求或需求不存在。" };
  if (!(await canLeadProject(req.projectId, user))) {
    return { error: "仅项目负责人/产品负责人可删除需求。" };
  }

  await prisma.$transaction([
    prisma.task.deleteMany({ where: { requirementId: req.id } }),
    prisma.design.deleteMany({ where: { requirementId: req.id } }),
    prisma.review.deleteMany({ where: { requirementId: req.id } }),
    prisma.decision.deleteMany({ where: { requirementId: req.id } }),
    prisma.requirement.delete({ where: { id: req.id } }),
  ]);

  await prisma.operationLog.create({
    data: {
      userId: user.id,
      action: "REQUIREMENT_DELETED",
      targetType: "Requirement",
      targetId: req.id,
      detail: { title: req.title },
    },
  });

  revalidatePath("/requirement");
  revalidatePath(`/project/${req.projectId}`);
  return { ok: true };
}
