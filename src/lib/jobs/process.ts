import { prisma } from "@/lib/db";

import {
  markJobFailed,
  markJobRunning,
  markJobSucceeded,
  updateJobProgress,
} from "./index";
import { runRequirementBreakdown } from "./run-breakdown";
import { runDesignGenerate } from "./run-design";
import { runMeetingProcess } from "./run-meeting";
import {
  runMeetingImage,
  type MeetingImagePayload,
} from "./run-meeting-image";

/**
 * 后台作业总调度：加载 AsyncJob 行 → 置 RUNNING → 按 type 分发 → 置 SUCCEEDED/FAILED。
 * 由 worker 进程在消费 async-jobs 队列时调用。自身吞掉异常（统一落库为 FAILED），
 * 以免 worker 因单个作业崩溃。
 */
export async function processAsyncJob(jobId: string): Promise<void> {
  const job = await prisma.asyncJob.findUnique({ where: { id: jobId } });
  if (!job) {
    console.warn(`[jobs] 作业 ${jobId} 不存在，跳过`);
    return;
  }
  if (job.status === "SUCCEEDED") return; // 幂等：已完成不重跑

  await markJobRunning(jobId);

  try {
    if (job.type === "REQUIREMENT_BREAKDOWN") {
      if (!job.requirementId) throw new Error("作业缺少 requirementId。");
      const r = await runRequirementBreakdown(job.requirementId, job.createdById);
      await markJobSucceeded(jobId, { count: r.count });
    } else if (job.type === "DESIGN_GENERATE") {
      if (!job.designId) throw new Error("作业缺少 designId。");
      const replan =
        (job.payload as { replan?: boolean } | null)?.replan ?? false;
      const r = await runDesignGenerate(
        job.designId,
        job.createdById,
        replan,
        (completed, total) => updateJobProgress(jobId, completed, total)
      );
      await markJobSucceeded(jobId, { generated: r.generated });
    } else if (job.type === "MEETING_PROCESS") {
      if (!job.meetingId) throw new Error("作业缺少 meetingId。");
      await runMeetingProcess(job.meetingId, (completed, total) =>
        updateJobProgress(jobId, completed, total)
      );
      await markJobSucceeded(jobId, { ok: true });
    } else if (job.type === "MEETING_IMAGE") {
      if (!job.meetingId) throw new Error("配图作业缺少 meetingId。");
      const payload = (job.payload ?? {}) as Partial<MeetingImagePayload>;
      if (payload.kind !== "cover" && payload.kind !== "summary" && payload.kind !== "section") {
        throw new Error(`配图作业 payload.kind 非法：${String(payload.kind)}`);
      }
      const r = await runMeetingImage(job.meetingId, {
        kind: payload.kind,
        index: payload.index,
      });
      await markJobSucceeded(jobId, r);
    } else {
      throw new Error(`未知作业类型：${job.type}`);
    }
  } catch (err) {
    const errMsg =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : (JSON.stringify(err) ?? "未知错误（non-Error rejection）");
    console.error(`[jobs] 作业 ${jobId}(${job.type}) 失败：`, errMsg);
    await markJobFailed(jobId, errMsg || "未知错误（空消息）");
  }
}
