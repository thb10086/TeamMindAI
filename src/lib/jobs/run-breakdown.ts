import { generateStructured } from "@/lib/ai/structured";
import { TaskBreakdownSchema } from "@/lib/ai/schemas";
import { getAgent } from "@/lib/ai/employees";
import { retrieveProjectContext } from "@/lib/memory/retrieve";
import { enqueueMemoryIngest } from "@/lib/queue/memory-queue";
import { prisma } from "@/lib/db";

/** AI 任务类型（小写）映射到 Prisma TaskType 枚举值（大写字面量联合）。 */
const TASK_TYPE_MAP = {
  product: "PRODUCT",
  ui: "UI",
  frontend: "FRONTEND",
  backend: "BACKEND",
  algorithm: "ALGORITHM",
  test: "TEST",
  ops: "OPS",
  data: "DATA",
  doc: "DOC",
  acceptance: "ACCEPTANCE",
} as const;

const TASK_BREAKDOWN_JSON_HINT = `{
  "summary": string,                  // 对拆解思路的一句话总结
  "tasks": [
    {
      "title": string,                // 任务标题
      "taskType": "product" | "ui" | "frontend" | "backend" | "algorithm" | "test" | "ops" | "data" | "doc" | "acceptance",
      "description": string,          // 执行内容/技术说明
      "acceptanceCriteria": string,   // 该任务的完成/验收标准
      "estimatedHours": number,       // 预计工时（小时）
      "priority": "P0" | "P1" | "P2" | "P3",
      "suggestedRole": string         // 建议承接角色，如 前端/后端/测试/产品
    }
  ],
  "risks": string[]                   // 风险或依赖
}`;

/**
 * 需求 → 任务拆解的核心逻辑（供后台 worker 调用）。
 * 不含鉴权与 revalidate：鉴权在入队的 server action 完成，缓存刷新由前端轮询后 router.refresh 处理。
 * 幂等：若该需求已有任务则直接返回 count=0，不重复创建。
 */
export async function runRequirementBreakdown(
  requirementId: string,
  createdById: string | null
): Promise<{ count: number }> {
  const req = await prisma.requirement.findUnique({
    where: { id: requirementId },
  });
  if (!req) throw new Error("需求不存在。");

  const existing = await prisma.task.count({
    where: { requirementId: req.id },
  });
  if (existing > 0) return { count: 0 };

  const context = [
    `需求名称：${req.title}`,
    req.background ? `业务背景：${req.background}` : "",
    req.problem ? `当前问题：${req.problem}` : "",
    req.targetUser ? `目标用户：${req.targetUser}` : "",
    req.businessGoal ? `业务目标：${req.businessGoal}` : "",
    req.scope ? `功能范围：\n${req.scope}` : "",
    req.outOfScope ? `不做范围：\n${req.outOfScope}` : "",
    req.acceptanceCriteria ? `验收标准：\n${req.acceptanceCriteria}` : "",
    `优先级：${req.priority}`,
  ]
    .filter(Boolean)
    .join("\n");

  const agent = getAgent("ai_project_manager");

  // GraphRAG：检索项目记忆，让拆解贴合既有技术架构/历史决策/依赖
  let memoryContext = "";
  try {
    const ctx = await retrieveProjectContext({
      projectId: req.projectId,
      query: `${req.title}\n${req.businessGoal ?? ""}\n${req.scope ?? ""}`,
      budgetChars: 2000,
    });
    if (!ctx.isEmpty) memoryContext = ctx.text;
  } catch {
    // 检索失败不阻断拆解
  }

  const breakdown = await generateStructured({
    schema: TaskBreakdownSchema,
    jsonHint: TASK_BREAKDOWN_JSON_HINT,
    system: agent.systemPrompt,
    prompt: `请把以下「已澄清需求」拆解为可执行任务。
要求：
- 覆盖必要维度（产品/UI/前端/后端/算法/测试/运维/数据/文档/验收），按需选择，不要硬凑。
- 每个任务应可独立交付、可验收，给出预计工时与建议承接角色。
- 参考「项目记忆」中的既有技术架构、历史决策与依赖，避免与之冲突或重复造轮子。
- 严格依据需求内容，不要编造范围外的任务。

# 项目记忆（从历史需求/任务/决策检索，供参考）
${memoryContext || "（暂无相关记忆）"}

# 需求内容
${context}`,
  });

  if (!breakdown.tasks.length) {
    throw new Error("AI 未能拆解出任务，请补充需求信息后重试。");
  }

  const base = Date.now().toString(36).toUpperCase();
  await prisma.$transaction(
    breakdown.tasks.map((t, i) =>
      prisma.task.create({
        data: {
          taskCode: `TASK-${base}-${i + 1}`,
          projectId: req.projectId,
          requirementId: req.id,
          title: t.title,
          description: t.description,
          taskType: TASK_TYPE_MAP[t.taskType],
          suggestedRole: t.suggestedRole,
          status: "TODO",
          priority: t.priority,
          estimatedHours: t.estimatedHours,
          acceptanceCriteria: t.acceptanceCriteria,
          isAiGenerated: true,
          orderIndex: i,
          createdById,
        },
      })
    )
  );

  // 拆解意味着需求已进入排期阶段
  if (["CLARIFYING", "REVIEWING", "CONFIRMED"].includes(req.status)) {
    await prisma.requirement.update({
      where: { id: req.id },
      data: { status: "SCHEDULING" },
    });
  }

  // GraphRAG：把拆解结果（任务实体与依赖）沉淀进项目记忆
  const breakdownText = [
    `需求「${req.title}」的任务拆解：`,
    breakdown.summary,
    ...breakdown.tasks.map(
      (t, i) => `任务${i + 1}：${t.title}（${t.suggestedRole}）— ${t.description}`
    ),
    breakdown.risks.length ? `风险/依赖：${breakdown.risks.join("；")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  await enqueueMemoryIngest({
    projectId: req.projectId,
    originType: "task_breakdown",
    originId: req.id,
    title: `任务拆解：${req.title}`,
    text: breakdownText,
    contextHint: `这是需求「${req.title}」的任务拆解结果`,
    rebuildCommunities: true,
  });

  return { count: breakdown.tasks.length };
}
