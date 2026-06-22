import { env } from "@/lib/env";

/**
 * 文生图（经 AgentLLM 网关，OpenAI 兼容 /images/generations）。
 * 网关的图片模型（gpt-image-2）以 base64 返回，无 url，故这里返回字节由调用方落对象存储。
 * AI SDK 的 openai-compatible provider 暂不稳定支持该端点，故用集中封装的 fetch（同 provider.ts 思路）。
 */
export interface GeneratedImage {
  bytes: Buffer;
  mime: string;
}

export async function generateImage(opts: {
  prompt: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024";
  model?: string;
}): Promise<GeneratedImage> {
  if (!env.agentllm.apiKey) {
    throw new Error("未配置 AGENTLLM_API_KEY，无法生成图片。");
  }
  const res = await fetch(`${env.agentllm.baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.agentllm.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model ?? env.agentllm.imageModel,
      prompt: opts.prompt,
      n: 1,
      size: opts.size ?? "1024x1024",
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`图像生成失败（HTTP ${res.status}）：${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const item = data.data?.[0];

  if (item?.b64_json) {
    return { bytes: Buffer.from(item.b64_json, "base64"), mime: "image/png" };
  }
  if (item?.url) {
    const img = await fetch(item.url);
    const buf = Buffer.from(await img.arrayBuffer());
    return { bytes: buf, mime: img.headers.get("content-type") ?? "image/png" };
  }
  throw new Error("图像生成返回为空（无 b64_json/url）。");
}
