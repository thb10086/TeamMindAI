import type { ConnectionOptions } from "bullmq";

import { env } from "@/lib/env";

/**
 * 把 REDIS_URL 解析为 BullMQ 连接选项（而非传入 ioredis 实例），
 * 以避免 bullmq 自带 ioredis 与项目 ioredis 的类型/实例不一致。
 * BullMQ 会用这些选项自行创建连接（Queue 与 Worker 各自独立）。
 */
export function redisConnectionOptions(): ConnectionOptions {
  const u = new URL(env.redisUrl);
  return {
    host: u.hostname || "localhost",
    port: u.port ? Number(u.port) : 6379,
    username: u.username || undefined,
    password: u.password || undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined,
    tls: u.protocol === "rediss:" ? {} : undefined,
    // BullMQ 要求阻塞命令不做请求级重试
    maxRetriesPerRequest: null,
  };
}
