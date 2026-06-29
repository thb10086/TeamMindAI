import { Queue } from "bullmq";

import { redisConnectionOptions } from "./connection";

export const MAINTENANCE_QUEUE_NAME = "maintenance";

/** 维护类定时作业名（BullMQ repeatable job 的 name 与 jobId）。 */
export const SWEEP_OVERDUE_JOB = "sweep-overdue-tasks";

/** 逾期任务扫描的执行频率（cron）。默认每 15 分钟一次。 */
export const SWEEP_OVERDUE_CRON = "*/15 * * * *";

let queueSingleton: Queue | null = null;

export function getMaintenanceQueue(): Queue {
  if (!queueSingleton) {
    queueSingleton = new Queue(MAINTENANCE_QUEUE_NAME, {
      connection: redisConnectionOptions(),
    });
  }
  return queueSingleton;
}

/**
 * 注册（幂等）维护类可重复定时作业。worker 启动时调用。
 * 用固定 jobId 确保重复注册不会产生多条 repeatable scheduler。
 */
export async function registerMaintenanceSchedules(): Promise<void> {
  await getMaintenanceQueue().add(
    SWEEP_OVERDUE_JOB,
    {},
    {
      repeat: { pattern: SWEEP_OVERDUE_CRON },
      jobId: SWEEP_OVERDUE_JOB,
      removeOnComplete: 50,
      removeOnFail: 50,
    }
  );
}
