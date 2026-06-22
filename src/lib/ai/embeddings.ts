import { env } from "@/lib/env";

/**
 * 通过 AgentLLM 的 OpenAI 兼容 /embeddings 端点做向量化。
 * 这里用原生 fetch 而非 AI SDK，是为了显式传 `dimensions=1536`：
 * text-embedding-3-large 原生 3072 维，超过 pgvector 索引上限(2000)，降维后可建 HNSW/IVF 索引。
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const res = await fetch(`${env.agentllm.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.agentllm.apiKey}`,
    },
    body: JSON.stringify({
      model: env.agentllm.embeddingModel,
      input: texts,
      dimensions: env.agentllm.embeddingDim,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`[embeddings] AgentLLM 返回 ${res.status}: ${detail}`);
  }

  const json = (await res.json()) as {
    data: { embedding: number[]; index: number }[];
  };
  return json.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}

/** 将 number[] 转为 pgvector 字面量字符串：`[0.1,0.2,...]`，用于原生 SQL。 */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
