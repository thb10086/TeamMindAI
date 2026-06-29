import { getAgent } from "@/lib/ai/employees";
import { generateStructured } from "@/lib/ai/structured";
import { ProjectReportSchema, type ProjectReport } from "@/lib/ai/schemas";
import { retrieveProjectContext } from "@/lib/memory/retrieve";
import {
  formatReportFactsForPrompt,
  REPORT_RANGE_LABEL,
  type ProjectReportFacts,
} from "@/lib/reports";

const REPORT_JSON_HINT = `{
  "overview": string,                 // 本期整体进展概述（3-5 句，用数据说话）
  "highlights": string[],             // 本期完成项与亮点
  "inProgress": string[],             // 进行中的关键事项
  "risks": [
    { "title": string, "impact": string, "suggestion": string }
  ],
  "nextPlan": string[],               // 下阶段计划
  "managementAdvice": string[],       // 给管理者的可执行建议
  "healthScore": number,              // 项目健康评分 0-100
  "healthReason": string              // 评分理由（1-2 句）
}`;

/**
 * 基于真实事实数据生成结构化项目报告（AI 项目经理）。
 * 纪律：只能基于传入的事实数据与项目记忆判断，严禁编造库中不存在的任务/需求/人名。
 */
export async function generateProjectReport(
  facts: ProjectReportFacts
): Promise<ProjectReport> {
  const agent = getAgent("ai_project_manager");
  const factsText = formatReportFactsForPrompt(facts);
  const rangeLabel = REPORT_RANGE_LABEL[facts.range];

  // GraphRAG：检索项目记忆，让风险/建议贴合既有架构与历史决策
  let memoryContext = "";
  try {
    const ctx = await retrieveProjectContext({
      projectId: facts.project.id,
      query: `${facts.project.name} 项目进展 风险 阻塞 下一步计划`,
      budgetChars: 1500,
    });
    if (!ctx.isEmpty) memoryContext = ctx.text;
  } catch {
    // 检索失败不阻断报告生成
  }

  return generateStructured({
    schema: ProjectReportSchema,
    jsonHint: REPORT_JSON_HINT,
    system: agent.systemPrompt,
    prompt: `请基于以下「事实数据」生成项目${rangeLabel}。
要求：
- 严格依据事实数据，所有结论可追溯到具体任务/需求/数字，严禁编造库中不存在的内容。
- overview 用数据说话（进度、完成数、阻塞/延期数等）。
- risks 必须对应「阻塞/延期/逾期/临期」中的真实事项，给出影响与可执行的应对建议；若确无风险则为空数组。
- nextPlan 基于「临期任务」「待推进的需求」给出。
- healthScore 综合：进度高、无阻塞/逾期则高分；阻塞、逾期、临期压力大则扣分。
- 区分「事实」与「建议」，管理建议要具体、可执行，不要空泛表态。

# 项目记忆（从历史需求/任务/决策检索，供参考，不可臆造）
${memoryContext || "（暂无相关记忆）"}

# 事实数据
${factsText}`,
  });
}
