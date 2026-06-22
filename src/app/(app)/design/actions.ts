"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { retrieveProjectContext } from "@/lib/memory/retrieve";
import { enqueueMemoryIngest } from "@/lib/queue/memory-queue";
import { createAndEnqueueJob, findActiveJob } from "@/lib/jobs";
import {
  generateDesignPlan,
  generateScreenHtml,
  refineScreenHtml,
} from "@/lib/ai/design";

export interface DesignActionResult {
  ok?: boolean;
  error?: string;
  designId?: string;
}

export interface PlannedScreen {
  id: string;
  name: string;
  screenKey: string;
  purpose: string | null;
}

export interface PlanDesignResult {
  ok?: boolean;
  error?: string;
  title?: string;
  summary?: string;
  screens?: PlannedScreen[];
}

export interface ScreenHtmlResult {
  ok?: boolean;
  error?: string;
  html?: string;
}

type RequirementForDesign = {
  title: string;
  background: string | null;
  problem: string | null;
  targetUser: string | null;
  businessGoal: string | null;
  scope: string | null;
  outOfScope: string | null;
  acceptanceCriteria: string | null;
};

/** 把需求关键信息拼成供设计参考的文本。 */
function requirementToText(req: RequirementForDesign): string {
  const lines = [
    `需求：${req.title}`,
    req.background && `业务背景：${req.background}`,
    req.problem && `当前问题：${req.problem}`,
    req.targetUser && `目标用户：${req.targetUser}`,
    req.businessGoal && `业务目标：${req.businessGoal}`,
    req.scope && `功能范围：${req.scope}`,
    req.outOfScope && `不做范围：${req.outOfScope}`,
    req.acceptanceCriteria && `验收标准：${req.acceptanceCriteria}`,
  ].filter(Boolean);
  return lines.join("\n");
}

/** 为某需求发起界面设计（创建空设计稿；已存在则复用最新版本）。项目成员可操作。 */
export async function createDesignForRequirement(
  requirementId: string
): Promise<DesignActionResult> {
  const user = await requireUser();
  const req = await prisma.requirement.findFirst({
    where: {
      id: requirementId,
      project: { members: { some: { userId: user.id } } },
    },
    select: { id: true, projectId: true, title: true },
  });
  if (!req) return { error: "需求不存在或你不是该项目成员。" };

  const existing = await prisma.design.findFirst({
    where: { requirementId: req.id },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (existing) return { ok: true, designId: existing.id };

  const design = await prisma.design.create({
    data: {
      projectId: req.projectId,
      requirementId: req.id,
      title: `${req.title} · 界面设计`,
      status: "DRAFT",
      createdById: user.id,
    },
    select: { id: true },
  });

  await prisma.operationLog.create({
    data: {
      userId: user.id,
      action: "DESIGN_CREATED",
      targetType: "Design",
      targetId: design.id,
      detail: { requirementId: req.id },
    },
  });

  revalidatePath(`/project/${req.projectId}`);
  revalidatePath(`/requirement/${req.id}`);
  return { ok: true, designId: design.id };
}

/** 第一步：AI 规划界面清单并落占位屏（html 暂空，逐屏再生成）。重新规划会替换旧界面并升版本。项目成员可操作。 */
export async function planDesignScreens(
  designId: string
): Promise<PlanDesignResult> {
  const user = await requireUser();
  const design = await prisma.design.findFirst({
    where: {
      id: designId,
      project: { members: { some: { userId: user.id } } },
    },
    select: {
      id: true,
      projectId: true,
      version: true,
      requirement: {
        select: {
          id: true,
          title: true,
          background: true,
          problem: true,
          targetUser: true,
          businessGoal: true,
          scope: true,
          outOfScope: true,
          acceptanceCriteria: true,
        },
      },
    },
  });
  if (!design) return { error: "设计稿不存在或你不是该项目成员。" };
  if (!design.requirement) return { error: "该设计未关联需求，暂无法生成。" };

  const requirementText = requirementToText(design.requirement);

  let projectContext: string | undefined;
  try {
    const ctx = await retrieveProjectContext({
      projectId: design.projectId,
      query: `${design.requirement.title} 界面设计 信息架构 页面`,
      budgetChars: 2000,
    });
    if (ctx && !ctx.isEmpty) projectContext = ctx.text;
  } catch {
    // 记忆检索失败不阻断设计生成
  }

  let plan: Awaited<ReturnType<typeof generateDesignPlan>>;
  try {
    plan = await generateDesignPlan({ requirementText, projectContext });
  } catch (err) {
    console.error("[design] 规划界面失败：", (err as Error).message);
    return { error: "AI 规划界面失败，请稍后重试。" };
  }
  if (!plan.screens?.length) {
    return { error: "AI 未能规划出界面，请补充需求信息后重试。" };
  }

  const hadScreens = await prisma.designScreen.count({
    where: { designId: design.id },
  });
  const nextVersion = hadScreens > 0 ? design.version + 1 : design.version;

  await prisma.$transaction([
    prisma.designScreen.deleteMany({ where: { designId: design.id } }),
    prisma.design.update({
      where: { id: design.id },
      data: {
        title: plan.title,
        summary: plan.summary,
        version: nextVersion,
        status: "DRAFT",
        screens: {
          create: plan.screens.map((s, i) => ({
            name: s.name,
            screenKey: s.screenKey,
            purpose: s.purpose,
            html: "",
            orderIndex: i,
          })),
        },
      },
    }),
  ]);

  const screens = await prisma.designScreen.findMany({
    where: { designId: design.id },
    orderBy: { orderIndex: "asc" },
    select: { id: true, name: true, screenKey: true, purpose: true },
  });

  revalidatePath(`/design/${design.id}`);
  return { ok: true, title: plan.title, summary: plan.summary, screens };
}

/** 第二步：为单个界面生成可交互 HTML 并入库；全部完成后写日志并沉淀记忆。项目成员可操作。 */
export async function generateDesignScreen(
  designId: string,
  screenId: string
): Promise<ScreenHtmlResult> {
  const user = await requireUser();
  const design = await prisma.design.findFirst({
    where: {
      id: designId,
      project: { members: { some: { userId: user.id } } },
    },
    select: {
      id: true,
      projectId: true,
      title: true,
      summary: true,
      requirement: {
        select: {
          title: true,
          background: true,
          problem: true,
          targetUser: true,
          businessGoal: true,
          scope: true,
          outOfScope: true,
          acceptanceCriteria: true,
        },
      },
      screens: {
        orderBy: { orderIndex: "asc" },
        select: { id: true, name: true, screenKey: true, purpose: true },
      },
    },
  });
  if (!design) return { error: "设计稿不存在或你不是该项目成员。" };
  if (!design.requirement) return { error: "该设计未关联需求，暂无法生成。" };

  const target = design.screens.find((s) => s.id === screenId);
  if (!target) return { error: "界面不存在。" };

  const requirementText = requirementToText(design.requirement);
  const allScreens = design.screens.map((s) => ({
    name: s.name,
    screenKey: s.screenKey,
  }));

  let projectContext: string | undefined;
  try {
    const ctx = await retrieveProjectContext({
      projectId: design.projectId,
      query: `${design.requirement.title} ${target.name} 界面`,
      budgetChars: 1500,
    });
    if (ctx && !ctx.isEmpty) projectContext = ctx.text;
  } catch {
    // 忽略检索失败
  }

  let html: string;
  try {
    html = await generateScreenHtml({
      requirementText,
      designSummary: design.summary ?? "",
      screen: {
        name: target.name,
        screenKey: target.screenKey,
        purpose: target.purpose ?? "",
      },
      allScreens,
      projectContext,
    });
  } catch (err) {
    console.error("[design] 生成界面失败：", (err as Error).message);
    return { error: "AI 生成该界面失败，请重试。" };
  }
  if (!html.trim()) {
    html = `<div class="p-6 text-sm text-neutral-500">该界面生成内容为空，请点击重新生成。</div>`;
  }

  await prisma.designScreen.update({
    where: { id: target.id },
    data: { html },
  });

  // 全部界面生成完成后：写操作日志并沉淀项目记忆（best-effort）
  const remaining = await prisma.designScreen.count({
    where: { designId: design.id, html: "" },
  });
  if (remaining === 0) {
    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: "DESIGN_GENERATED",
        targetType: "Design",
        targetId: design.id,
        detail: { screens: design.screens.length },
      },
    });
    const memoText = `界面设计「${design.title}」。信息架构：${
      design.summary ?? ""
    } 包含界面：${design.screens.map((s) => s.name).join("、")}。`;
    await enqueueMemoryIngest({
      projectId: design.projectId,
      originType: "design",
      originId: design.id,
      title: `界面设计：${design.title}`,
      text: memoText,
    });
  }

  revalidatePath(`/design/${design.id}`);
  return { ok: true, html };
}

/** 基于用户反馈调整单个界面（在不偏离已确认需求的前提下重做该屏）。项目成员可操作。 */
export async function refineDesignScreen(
  designId: string,
  screenId: string,
  feedback: string
): Promise<ScreenHtmlResult> {
  const user = await requireUser();
  const fb = feedback.trim();
  if (!fb) return { error: "请先输入你想调整的内容。" };

  const design = await prisma.design.findFirst({
    where: {
      id: designId,
      project: { members: { some: { userId: user.id } } },
    },
    select: {
      id: true,
      projectId: true,
      summary: true,
      requirement: {
        select: {
          title: true,
          background: true,
          problem: true,
          targetUser: true,
          businessGoal: true,
          scope: true,
          outOfScope: true,
          acceptanceCriteria: true,
        },
      },
      screens: {
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          name: true,
          screenKey: true,
          purpose: true,
          html: true,
        },
      },
    },
  });
  if (!design) return { error: "设计稿不存在或你不是该项目成员。" };
  if (!design.requirement) return { error: "该设计未关联需求，暂无法调整。" };

  const target = design.screens.find((s) => s.id === screenId);
  if (!target) return { error: "界面不存在。" };

  const requirementText = requirementToText(design.requirement);
  const allScreens = design.screens.map((s) => ({
    name: s.name,
    screenKey: s.screenKey,
  }));

  let projectContext: string | undefined;
  try {
    const ctx = await retrieveProjectContext({
      projectId: design.projectId,
      query: `${design.requirement.title} ${target.name} ${fb}`,
      budgetChars: 1500,
    });
    if (ctx && !ctx.isEmpty) projectContext = ctx.text;
  } catch {
    // 忽略检索失败
  }

  let html: string;
  try {
    html = await refineScreenHtml({
      requirementText,
      designSummary: design.summary ?? "",
      screen: {
        name: target.name,
        screenKey: target.screenKey,
        purpose: target.purpose ?? "",
      },
      currentHtml: target.html,
      feedback: fb,
      allScreens,
      projectContext,
    });
  } catch (err) {
    console.error("[design] 调整界面失败：", (err as Error).message);
    return { error: "AI 调整该界面失败，请重试。" };
  }
  if (!html.trim()) return { error: "调整结果为空，请换个说法再试。" };

  await prisma.designScreen.update({
    where: { id: target.id },
    data: { html },
  });

  await prisma.operationLog.create({
    data: {
      userId: user.id,
      action: "DESIGN_SCREEN_REFINED",
      targetType: "DesignScreen",
      targetId: target.id,
      detail: { designId: design.id, feedback: fb.slice(0, 500) },
    },
  });

  revalidatePath(`/design/${design.id}`);
  return { ok: true, html };
}

export interface StartDesignResult {
  jobId?: string;
  error?: string;
}

/**
 * 发起界面生成（后台异步）：校验后入队 DESIGN_GENERATE 作业，立即返回 jobId。
 * worker 负责（按需）规划界面并逐屏生成，离开页面也继续；前端轮询 pollDesignGeneration。
 * replan=true 时重新规划并替换旧界面（升版本）。
 */
export async function startDesignGeneration(
  designId: string,
  replan = false
): Promise<StartDesignResult> {
  const user = await requireUser();
  const design = await prisma.design.findFirst({
    where: { id: designId, project: { members: { some: { userId: user.id } } } },
    select: { id: true, projectId: true, requirementId: true },
  });
  if (!design) return { error: "设计稿不存在或你不是该项目成员。" };
  if (!design.requirementId) return { error: "该设计未关联需求，暂无法生成。" };

  const active = await findActiveJob({
    type: "DESIGN_GENERATE",
    designId: design.id,
  });
  if (active) return { jobId: active.id };

  try {
    const jobId = await createAndEnqueueJob({
      type: "DESIGN_GENERATE",
      projectId: design.projectId,
      designId: design.id,
      createdById: user.id,
      payload: { replan },
    });
    return { jobId };
  } catch {
    return { error: "后台任务服务暂不可用，请稍后重试。" };
  }
}

export interface DesignScreenVM {
  id: string;
  name: string;
  screenKey: string;
  purpose: string | null;
  html: string;
}

export interface DesignPollResult {
  error?: string;
  status?: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  progress?: number;
  total?: number;
  completed?: number;
  jobError?: string | null;
  screens?: DesignScreenVM[];
}

/** 轮询界面生成进度，并返回当前所有界面（含已生成 HTML），供画布增量刷新。 */
export async function pollDesignGeneration(
  designId: string,
  jobId: string
): Promise<DesignPollResult> {
  const user = await requireUser();
  const design = await prisma.design.findFirst({
    where: { id: designId, project: { members: { some: { userId: user.id } } } },
    select: { id: true },
  });
  if (!design) return { error: "设计稿不存在或你不是该项目成员。" };

  const job = await prisma.asyncJob.findUnique({
    where: { id: jobId },
    select: {
      status: true,
      progress: true,
      total: true,
      completed: true,
      error: true,
    },
  });
  if (!job) return { error: "任务不存在。" };

  const screens = await prisma.designScreen.findMany({
    where: { designId: design.id },
    orderBy: { orderIndex: "asc" },
    select: {
      id: true,
      name: true,
      screenKey: true,
      purpose: true,
      html: true,
    },
  });

  return {
    status: job.status,
    progress: job.progress,
    total: job.total,
    completed: job.completed,
    jobError: job.error,
    screens,
  };
}
