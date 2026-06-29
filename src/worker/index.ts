import { Worker } from "bullmq";

import { redisConnectionOptions } from "@/lib/queue/connection";
import {
  MEMORY_QUEUE_NAME,
  type MemoryIngestJobData,
} from "@/lib/queue/memory-queue";
import { ingestSource } from "@/lib/memory/ingest";
import { rebuildCommunities } from "@/lib/memory/community";
import { JOB_QUEUE_NAME, type AsyncJobRef } from "@/lib/queue/job-queue";
import { processAsyncJob } from "@/lib/jobs/process";
import {
  MAINTENANCE_QUEUE_NAME,
  SWEEP_OVERDUE_JOB,
  registerMaintenanceSchedules,
} from "@/lib/queue/maintenance-queue";
import { sweepOverdueTasks } from "@/lib/jobs/overdue-tasks";

/**
 * 记忆沉淀 worker：消费 memory-ingest 队列，执行图抽取入库，
 * 可选重建社区。独立进程运行：`npm run worker`（dev: `npm run worker:dev`）。
 */
const worker = new Worker(
  MEMORY_QUEUE_NAME,
  async (job) => {
    const data = job.data as MemoryIngestJobData;
    const started = Date.now();
    const result = await ingestSource(data);
    let communities = 0;
    if (data.rebuildCommunities) {
      communities = (await rebuildCommunities(data.projectId)).communities;
    }
    return { ...result, communities, ms: Date.now() - started };
  },
  { connection: redisConnectionOptions(), concurrency: 2 }
);

worker.on("ready", () =>
  console.log(`[worker] 已连接 Redis，监听队列「${MEMORY_QUEUE_NAME}」`)
);
worker.on("completed", (job, result) =>
  console.log(`[worker] job ${job.id} 完成：`, result)
);
worker.on("failed", (job, err) =>
  console.error(`[worker] job ${job?.id} 失败：`, err?.message)
);
worker.on("error", (err) => console.error("[worker] 连接/运行错误：", err.message));

/**
 * 后台长任务 worker：消费 async-jobs 队列（AI 任务拆解、界面生成等）。
 * 作业详情/进度/结果以 AsyncJob 表为准，前端轮询该表获取状态。
 */
const jobWorker = new Worker(
  JOB_QUEUE_NAME,
  async (job) => {
    const { jobId } = job.data as AsyncJobRef;
    await processAsyncJob(jobId);
  },
  {
    connection: redisConnectionOptions(),
    concurrency: 2,
    // AI 长任务（设计生成、会议处理）单任务最长可达 10 分钟，必须大于单屏 AI 调用超时。
    lockDuration: 600_000,
    // stall 检测间隔也要相应加长，否则 lockDuration 内仍会被触发多次 stall。
    stalledInterval: 60_000,
  }
);
jobWorker.on("ready", () =>
  console.log(`[worker] 已连接 Redis，监听队列「${JOB_QUEUE_NAME}」`)
);
jobWorker.on("completed", (job, result) =>
  console.log(`[worker] async-job ${job.id} 完成：`, result)
);
jobWorker.on("failed", (job, err) =>
  console.error(`[worker] async-job ${job?.id} 失败：`, err?.message)
);
jobWorker.on("error", (err) =>
  console.error("[worker] async-jobs 连接/运行错误：", err.message)
);

/**
 * 维护 worker：消费 maintenance 队列的定时作业（如逾期任务自动转 DELAYED）。
 * 定时调度由 registerMaintenanceSchedules() 注册的 BullMQ repeatable job 驱动。
 */
const maintenanceWorker = new Worker(
  MAINTENANCE_QUEUE_NAME,
  async (job) => {
    if (job.name === SWEEP_OVERDUE_JOB) {
      return await sweepOverdueTasks();
    }
    return { skipped: job.name };
  },
  { connection: redisConnectionOptions(), concurrency: 1 }
);
maintenanceWorker.on("ready", () =>
  console.log(`[worker] 已连接 Redis，监听队列「${MAINTENANCE_QUEUE_NAME}」`)
);
maintenanceWorker.on("completed", (job, result) =>
  console.log(`[worker] maintenance ${job.name} 完成：`, result)
);
maintenanceWorker.on("failed", (job, err) =>
  console.error(`[worker] maintenance ${job?.name} 失败：`, err?.message)
);
maintenanceWorker.on("error", (err) =>
  console.error("[worker] maintenance 连接/运行错误：", err.message)
);

void registerMaintenanceSchedules()
  .then(() => console.log("[worker] 已注册定时作业：逾期任务扫描"))
  .catch((err) =>
    console.error("[worker] 注册定时作业失败：", (err as Error).message)
  );

async function shutdown(signal: string) {
  console.log(`[worker] 收到 ${signal}，正在优雅关闭…`);
  await Promise.all([worker.close(), jobWorker.close(), maintenanceWorker.close()]);
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

console.log(
  "[worker] worker 启动中（memory-ingest + async-jobs + maintenance）…"
);
