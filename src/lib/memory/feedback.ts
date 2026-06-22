import { enqueueMemoryIngest } from "@/lib/queue/memory-queue";
import type { MemoryTypeValue } from "@/lib/memory/ingest";

/**
 * 值得回流进项目记忆的任务状态（里程碑 / 风险）。
 * 普通流转（如 TODO→IN_PROGRESS）不沉淀，避免噪声与不必要的 LLM 成本。
 */
const TASK_PROGRESS_MEMORY: Record<
  string,
  { memoryType: MemoryTypeValue; importance: number; phrase: string }
> = {
  ACCEPTING: { memoryType: "RELEASE_RECORD", importance: 0.5, phrase: "进入待验收" },
  DONE: { memoryType: "RELEASE_RECORD", importance: 0.55, phrase: "已完成交付" },
  BLOCKED: { memoryType: "RISK", importance: 0.75, phrase: "被阻塞" },
  DELAYED: { memoryType: "RISK", importance: 0.7, phrase: "已延期" },
  CANCELLED: { memoryType: "RISK", importance: 0.45, phrase: "已取消" },
};

export interface TaskProgressInput {
  projectId: string;
  taskId: string;
  title: string;
  fromStatus: string;
  toStatus: string;
  assigneeName?: string | null;
  requirementTitle?: string | null;
}

/**
 * 任务状态回流项目记忆（loop-feedback）：仅在里程碑/风险类状态时沉淀。
 * best-effort：底层 enqueue 不抛错；rebuildCommunities=false 控制成本（社区择机重建）。
 */
export async function feedbackTaskProgress(
  input: TaskProgressInput
): Promise<void> {
  const sig = TASK_PROGRESS_MEMORY[input.toStatus];
  if (!sig) return;

  const text = [
    `任务「${input.title}」${sig.phrase}。`,
    input.assigneeName ? `负责人：${input.assigneeName}。` : "",
    input.requirementTitle ? `所属需求：${input.requirementTitle}。` : "",
    `状态流转：${input.fromStatus} → ${input.toStatus}。`,
  ]
    .filter(Boolean)
    .join("");

  await enqueueMemoryIngest({
    projectId: input.projectId,
    originType: "task_progress",
    originId: input.taskId,
    title: `任务进展：${input.title}`,
    text,
    memoryType: sig.memoryType,
    importanceHint: sig.importance,
    contextHint: "项目任务状态流转事件（执行进展回流）",
    rebuildCommunities: false,
  });
}

export interface RequirementOnlineInput {
  projectId: string;
  requirementId: string;
  title: string;
}

/**
 * 需求上线回流项目记忆：作为交付里程碑（RELEASE_RECORD）沉淀。
 */
export async function feedbackRequirementOnline(
  input: RequirementOnlineInput
): Promise<void> {
  await enqueueMemoryIngest({
    projectId: input.projectId,
    originType: "requirement",
    originId: input.requirementId,
    title: `需求上线：${input.title}`,
    text: `需求「${input.title}」已确认上线交付。`,
    memoryType: "RELEASE_RECORD",
    importanceHint: 0.7,
    contextHint: "需求生命周期里程碑：上线",
    rebuildCommunities: false,
  });
}
