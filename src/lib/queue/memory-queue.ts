import { Queue } from "bullmq";

import { redisConnectionOptions } from "./connection";
import type { MemoryTypeValue } from "@/lib/memory/ingest";

export const MEMORY_QUEUE_NAME = "memory-ingest";

export interface MemoryIngestJobData {
  projectId: string;
  /** 来源对象类型：requirement | task | decision | meeting | knowledge | note */
  originType: string;
  originId?: string;
  title?: string;
  text: string;
  /** 提供则同时落一条 Memory 事实。 */
  memoryType?: MemoryTypeValue;
  importanceHint?: number;
  contextHint?: string;
  /** 入库后是否重建该项目的记忆社区。 */
  rebuildCommunities?: boolean;
}

// 不给 Queue 指定泛型：BullMQ v5 的多泛型签名对单一类型参数不友好；
// 类型安全由 enqueueMemoryIngest 的入参签名保证。
let queueSingleton: Queue | null = null;

function getQueue(): Queue {
  if (!queueSingleton) {
    queueSingleton = new Queue(MEMORY_QUEUE_NAME, {
      connection: redisConnectionOptions(),
    });
  }
  return queueSingleton;
}

/**
 * 入队记忆沉淀任务。best-effort：失败仅记录日志、绝不抛出，
 * 以免阻断用户主流程（需求保存、任务拆解等）。
 */
export async function enqueueMemoryIngest(
  data: MemoryIngestJobData
): Promise<boolean> {
  try {
    await getQueue().add("ingest", data, {
      attempts: 2,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: 200,
      removeOnFail: 100,
    });
    return true;
  } catch (err) {
    console.error("[memory-queue] 入队失败：", (err as Error).message);
    return false;
  }
}
