import { Queue } from "bullmq";

import { redisConnectionOptions } from "./connection";

export const JOB_QUEUE_NAME = "async-jobs";

/**
 * Redis 中只携带 AsyncJob.id，作业详情一律以数据库行为准。
 * 这样可避免 payload 陈旧/重复，并让进度、结果统一落库供前端轮询。
 */
export interface AsyncJobRef {
  jobId: string;
}

let queueSingleton: Queue | null = null;

function getQueue(): Queue {
  if (!queueSingleton) {
    queueSingleton = new Queue(JOB_QUEUE_NAME, {
      connection: redisConnectionOptions(),
    });
  }
  return queueSingleton;
}

/**
 * 入队一个后台作业。失败会向上抛出，由调用方回滚 AsyncJob 状态。
 * 注意：attempts=1，长 AI 作业不让 BullMQ 自动整段重试（避免重复消耗/重复落库），
 * 业务级重试交由用户重新触发或我们自定义的幂等逻辑处理。
 */
export async function enqueueAsyncJob(jobId: string): Promise<void> {
  await getQueue().add(
    "run",
    { jobId } satisfies AsyncJobRef,
    {
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 200,
    }
  );
}
