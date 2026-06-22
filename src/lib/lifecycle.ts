import type { RequirementStatus } from "@prisma/client";

import { prisma } from "@/lib/db";

/**
 * 需求「执行阶段」状态：只有处于这些状态时，才随其任务进度自动联动。
 * 想法池/澄清/评审/驳回/上线/归档等不在此自动机内，避免覆盖人工决策。
 */
const EXECUTION_PHASES = new Set<string>([
  "CONFIRMED",
  "SCHEDULING",
  "DEVELOPING",
  "TESTING",
  "ACCEPTING",
]);

/**
 * 任务 → 需求状态联动（loop）。依据需求下任务的整体进度回推需求状态：
 *  - 全部完成        → ACCEPTING（待验收；是否上线由人工确认）
 *  - 全部进入测试/验收 → TESTING（测试中）
 *  - 有任意任务开工   → DEVELOPING（开发中）
 *  - 全部待开始       → SCHEDULING（待排期）
 * 仅当需求当前处于执行阶段时改写；不会自动置为 ONLINE / ARCHIVED（保留人工确认）。
 * 已取消任务不计入；附带把「规划中」项目在进入开发时置为「进行中」。
 */
export async function recomputeRequirementStatusFromTasks(
  requirementId: string
): Promise<void> {
  const req = await prisma.requirement.findUnique({
    where: { id: requirementId },
    select: { id: true, status: true, projectId: true },
  });
  if (!req || !EXECUTION_PHASES.has(req.status)) return;

  const tasks = await prisma.task.findMany({
    where: { requirementId, NOT: { status: "CANCELLED" } },
    select: { status: true },
  });
  if (tasks.length === 0) return;

  const statuses = tasks.map((t) => t.status);
  const allDone = statuses.every((s) => s === "DONE");
  const allTestOrLater = statuses.every((s) =>
    ["TESTING", "ACCEPTING", "DONE"].includes(s)
  );
  const anyStarted = statuses.some((s) => s !== "TODO");

  let next: RequirementStatus;
  if (allDone) next = "ACCEPTING";
  else if (allTestOrLater) next = "TESTING";
  else if (anyStarted) next = "DEVELOPING";
  else next = "SCHEDULING";

  if (next !== req.status) {
    await prisma.requirement.update({
      where: { id: req.id },
      data: { status: next },
    });
  }

  // 进入开发即把「规划中」项目置为「进行中」（轻量项目级联动）。
  if (next === "DEVELOPING") {
    await prisma.project.updateMany({
      where: { id: req.projectId, status: "PLANNING" },
      data: { status: "ACTIVE" },
    });
  }
}
