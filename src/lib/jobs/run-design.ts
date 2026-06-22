import { prisma } from "@/lib/db";
import { retrieveProjectContext } from "@/lib/memory/retrieve";
import { enqueueMemoryIngest } from "@/lib/queue/memory-queue";
import { generateDesignPlan, generateScreenHtml } from "@/lib/ai/design";

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
  return [
    `需求：${req.title}`,
    req.background && `业务背景：${req.background}`,
    req.problem && `当前问题：${req.problem}`,
    req.targetUser && `目标用户：${req.targetUser}`,
    req.businessGoal && `业务目标：${req.businessGoal}`,
    req.scope && `功能范围：${req.scope}`,
    req.outOfScope && `不做范围：${req.outOfScope}`,
    req.acceptanceCriteria && `验收标准：${req.acceptanceCriteria}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 界面设计生成的核心逻辑（供后台 worker 调用）：
 *  1. 当 replan=true 或当前无界面时，先 AI 规划界面清单并落占位屏（重规划会替换旧屏并升版本）。
 *  2. 逐屏生成 HTML，每完成一屏通过 onProgress 上报进度。
 *  3. 全部完成后写操作日志并沉淀项目记忆。
 * 不含鉴权与 revalidate（鉴权在入队 action 完成，前端轮询刷新）。幂等：已生成的屏不会重复生成。
 */
export async function runDesignGenerate(
  designId: string,
  createdById: string | null,
  replan: boolean,
  onProgress: (completed: number, total: number) => Promise<void>
): Promise<{ generated: number }> {
  const design = await prisma.design.findUnique({
    where: { id: designId },
    select: {
      id: true,
      projectId: true,
      title: true,
      summary: true,
      version: true,
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
    },
  });
  if (!design) throw new Error("设计稿不存在。");
  if (!design.requirement) throw new Error("该设计未关联需求，暂无法生成。");

  const requirementText = requirementToText(design.requirement);

  const existingCount = await prisma.designScreen.count({
    where: { designId: design.id },
  });

  // 规划阶段：重规划或尚无界面时，调用 AI 规划并重建占位屏
  let designSummary = design.summary ?? "";
  if (replan || existingCount === 0) {
    let projectContext: string | undefined;
    try {
      const ctx = await retrieveProjectContext({
        projectId: design.projectId,
        query: `${design.requirement.title} 界面设计 信息架构 页面`,
        budgetChars: 2000,
      });
      if (ctx && !ctx.isEmpty) projectContext = ctx.text;
    } catch {
      // 记忆检索失败不阻断
    }

    const plan = await generateDesignPlan({ requirementText, projectContext });
    if (!plan.screens?.length) {
      throw new Error("AI 未能规划出界面，请补充需求信息后重试。");
    }

    const nextVersion =
      existingCount > 0 ? design.version + 1 : design.version;
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
    designSummary = plan.summary;
  }

  // 生成阶段：逐屏填充 HTML，上报进度
  const allScreens = await prisma.designScreen.findMany({
    where: { designId: design.id },
    orderBy: { orderIndex: "asc" },
    select: { id: true, name: true, screenKey: true, purpose: true, html: true },
  });
  const total = allScreens.length;
  const screenRefs = allScreens.map((s) => ({
    name: s.name,
    screenKey: s.screenKey,
  }));

  let completed = allScreens.filter((s) => s.html !== "").length;
  await onProgress(completed, total);

  let generated = 0;
  for (const screen of allScreens) {
    if (screen.html !== "") continue; // 幂等：已生成的跳过

    let projectContext: string | undefined;
    try {
      const ctx = await retrieveProjectContext({
        projectId: design.projectId,
        query: `${design.requirement.title} ${screen.name} 界面`,
        budgetChars: 1500,
      });
      if (ctx && !ctx.isEmpty) projectContext = ctx.text;
    } catch {
      // 忽略检索失败
    }

    let html = await generateScreenHtml({
      requirementText,
      designSummary,
      screen: {
        name: screen.name,
        screenKey: screen.screenKey,
        purpose: screen.purpose ?? "",
      },
      allScreens: screenRefs,
      projectContext,
    });
    if (!html.trim()) {
      html = `<div class="p-6 text-sm text-neutral-500">该界面生成内容为空，请点击重新生成。</div>`;
    }

    await prisma.designScreen.update({
      where: { id: screen.id },
      data: { html },
    });
    generated++;
    completed++;
    await onProgress(completed, total);
  }

  // 全部完成：写操作日志并沉淀记忆（best-effort）
  const remaining = await prisma.designScreen.count({
    where: { designId: design.id, html: "" },
  });
  if (remaining === 0) {
    await prisma.operationLog.create({
      data: {
        userId: createdById,
        action: "DESIGN_GENERATED",
        targetType: "Design",
        targetId: design.id,
        detail: { screens: total },
      },
    });
    const names = allScreens.map((s) => s.name).join("、");
    await enqueueMemoryIngest({
      projectId: design.projectId,
      originType: "design",
      originId: design.id,
      title: `界面设计：${design.title}`,
      text: `界面设计「${design.title}」。信息架构：${designSummary} 包含界面：${names}。`,
    });
  }

  return { generated };
}
