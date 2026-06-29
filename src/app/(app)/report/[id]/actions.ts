"use server";

import { requireUser } from "@/lib/auth-helpers";
import { getProjectForUser } from "@/lib/projects";
import {
  gatherProjectReportFacts,
  type ReportRange,
} from "@/lib/reports";
import { generateProjectReport } from "@/lib/ai/report";
import type { ProjectReport } from "@/lib/ai/schemas";

export type GenerateReportState =
  | { ok: true; report: ProjectReport; range: ReportRange; generatedAt: string }
  | { ok: false; error: string };

const VALID_RANGES: ReportRange[] = ["daily", "weekly", "monthly"];

/**
 * 生成项目报告（AI 项目经理，基于真实事实数据）。
 * 关键节点人工触发：由用户在报告工作台点击「生成」后执行。
 */
export async function generateReportAction(
  projectId: string,
  range: ReportRange
): Promise<GenerateReportState> {
  const user = await requireUser();
  const project = await getProjectForUser(projectId, user.id);
  if (!project) {
    return { ok: false, error: "无权访问该项目或项目不存在。" };
  }
  if (!VALID_RANGES.includes(range)) {
    return { ok: false, error: "无效的报告周期。" };
  }

  try {
    const facts = await gatherProjectReportFacts(projectId, range);
    const report = await generateProjectReport(facts);
    return {
      ok: true,
      report,
      range,
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      ok: false,
      error: `生成报告失败：${(e as Error).message.slice(0, 200)}`,
    };
  }
}
