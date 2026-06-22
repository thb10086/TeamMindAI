import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { env } from "@/lib/env";

/**
 * AgentLLM 网关（OpenAI 兼容）。所有 AI 员工的对话/结构化输出都经由此 provider。
 * base_url: https://agentllm.linkyun.co/v1
 */
export const agentllm = createOpenAICompatible({
  name: "agentllm",
  baseURL: env.agentllm.baseUrl,
  apiKey: env.agentllm.apiKey,
});

/** 模型别名。完整可用列表见 GET /v1/models。 */
export const MODELS = {
  /** 强指令跟随，适合需求澄清/任务拆解等结构化输出 */
  chat: env.agentllm.chatModel,
  /** 快/省，适合摘要、轻量分类、提醒文案 */
  fast: env.agentllm.fastModel,
  /** 向量化（text-embedding-3-large，降维到 1536） */
  embedding: env.agentllm.embeddingModel,
} as const;

/** 返回一个对话语言模型（默认使用 MODELS.chat）。 */
export function chatModel(id?: string) {
  return agentllm(id ?? MODELS.chat);
}
