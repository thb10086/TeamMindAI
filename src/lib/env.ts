/**
 * 集中、惰性读取环境变量。
 * 注意：不要在模块加载期 throw，否则会破坏 `next build`（构建期无需数据库/密钥）。
 * 真正使用到缺失变量时再由调用方处理报错。
 */
export const env = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "TeamMindAI",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  nodeEnv: process.env.NODE_ENV ?? "development",

  databaseUrl: process.env.DATABASE_URL ?? "",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",

  agentllm: {
    baseUrl: process.env.AGENTLLM_BASE_URL ?? "https://agentllm.linkyun.co/v1",
    apiKey: process.env.AGENTLLM_API_KEY ?? "",
    chatModel: process.env.AGENTLLM_CHAT_MODEL ?? "claude-sonnet",
    fastModel: process.env.AGENTLLM_FAST_MODEL ?? "gemini-3.5-flash",
    embeddingModel:
      process.env.AGENTLLM_EMBEDDING_MODEL ?? "text-embedding-3-large",
    embeddingDim: Number(process.env.AGENTLLM_EMBEDDING_DIM ?? 1536),
    imageModel: process.env.AGENTLLM_IMAGE_MODEL ?? "gpt-image-2",
  },

  // 语音转写（ASR）。AgentLLM 网关暂不提供 transcriptions，故走兼容 OpenAI 的
  // yunwu.ai 网关。whisper-1 支持 verbose_json（含分段时间戳），用于说话人识别对齐。
  asr: {
    baseUrl: process.env.ASR_BASE_URL ?? "https://yunwu.ai/v1",
    apiKey: process.env.ASR_API_KEY ?? "",
    model: process.env.ASR_MODEL ?? "whisper-1",
  },

  s3: {
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    region: process.env.S3_REGION ?? "us-east-1",
    accessKey: process.env.S3_ACCESS_KEY ?? "",
    secretKey: process.env.S3_SECRET_KEY ?? "",
    bucket: process.env.S3_BUCKET ?? "teammind",
  },

  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: (process.env.SMTP_SECURE ?? "true") === "true",
    user: process.env.SMTP_USER ?? "",
    password: process.env.SMTP_PASSWORD ?? "",
    from: process.env.SMTP_FROM ?? "TeamMindAI <noreply@example.com>",
  },

  // 联网搜索（Tavily）：用于 AI 对齐室「近 30 天竞品/同行分析」。
  // 未配置 TAVILY_API_KEY 时，该功能整体不展示。
  search: {
    tavilyApiKey: process.env.TAVILY_API_KEY ?? "",
  },
} as const;

export function assertEnv(value: string, name: string): string {
  if (!value) {
    throw new Error(
      `[env] 缺少必需的环境变量 ${name}，请在 .env 中配置（参考 .env.example）。`
    );
  }
  return value;
}
