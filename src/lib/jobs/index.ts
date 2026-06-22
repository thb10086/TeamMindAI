import type { AsyncJobType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { enqueueAsyncJob } from "@/lib/queue/job-queue";

/** 前端轮询用的精简字段集。 */
export const jobStatusSelect = {
  id: true,
  type: true,
  status: true,
  progress: true,
  total: true,
  completed: true,
  error: true,
  result: true,
  requirementId: true,
  designId: true,
  meetingId: true,
  projectId: true,
} satisfies Prisma.AsyncJobSelect;

export interface CreateJobInput {
  type: AsyncJobType;
  projectId: string;
  requirementId?: string | null;
  designId?: string | null;
  meetingId?: string | null;
  createdById?: string | null;
  total?: number;
  payload?: Prisma.InputJsonValue;
}

/**
 * 创建 AsyncJob 行并入队。入队失败则把该行置为 FAILED 并抛出，
 * 以免出现“有作业行却没人执行”的幽灵任务。
 */
export async function createAndEnqueueJob(input: CreateJobInput): Promise<string> {
  const job = await prisma.asyncJob.create({
    data: {
      type: input.type,
      projectId: input.projectId,
      requirementId: input.requirementId ?? null,
      designId: input.designId ?? null,
      meetingId: input.meetingId ?? null,
      createdById: input.createdById ?? null,
      total: input.total ?? 0,
      payload: input.payload,
      status: "QUEUED",
    },
    select: { id: true },
  });

  try {
    await enqueueAsyncJob(job.id);
  } catch (err) {
    await prisma.asyncJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        error: `任务入队失败（后台任务服务未就绪？）：${(err as Error).message}`,
        finishedAt: new Date(),
      },
    });
    throw err;
  }
  return job.id;
}

/**
 * 查找某需求/设计上仍在进行（QUEUED/RUNNING）的同类作业。
 * 用于：避免重复触发；以及前端进入页面时恢复进度。
 * 传 undefined 的关联字段会被 Prisma 忽略，故只按传入的 id 过滤。
 */
export function findActiveJob(params: {
  type: AsyncJobType;
  requirementId?: string;
  designId?: string;
  meetingId?: string;
}) {
  return prisma.asyncJob.findFirst({
    where: {
      type: params.type,
      requirementId: params.requirementId,
      designId: params.designId,
      meetingId: params.meetingId,
      status: { in: ["QUEUED", "RUNNING"] },
    },
    orderBy: { createdAt: "desc" },
    select: jobStatusSelect,
  });
}

/** 标记作业开始执行（worker 领取后调用）。 */
export async function markJobRunning(jobId: string, total?: number): Promise<void> {
  await prisma.asyncJob.update({
    where: { id: jobId },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      attempts: { increment: 1 },
      ...(total != null ? { total } : {}),
    },
  });
}

/** 更新分步进度（completed/total → progress 百分比）。 */
export async function updateJobProgress(
  jobId: string,
  completed: number,
  total: number
): Promise<void> {
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  await prisma.asyncJob.update({
    where: { id: jobId },
    data: { completed, total, progress },
  });
}

/** 标记作业成功。 */
export async function markJobSucceeded(
  jobId: string,
  result?: Prisma.InputJsonValue
): Promise<void> {
  await prisma.asyncJob.update({
    where: { id: jobId },
    data: {
      status: "SUCCEEDED",
      progress: 100,
      result,
      finishedAt: new Date(),
    },
  });
}

/** 标记作业失败（错误信息截断入库）。 */
export async function markJobFailed(jobId: string, error: string): Promise<void> {
  await prisma.asyncJob.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      error: error.slice(0, 1000),
      finishedAt: new Date(),
    },
  });
}
