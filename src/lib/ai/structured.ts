import { generateText, Output, type LanguageModel } from "ai";
import type { z } from "zod";

import { agentllm, MODELS } from "./provider";
import { bodyContext, extractJsonObject, tryParseLenient } from "./json";

/**
 * 结构化生成：经 AgentLLM 网关产出 JSON，并用 zod 严格校验后返回。
 *
 * 双层防御：
 * 1) **API 层强约束**：用 `output: Output.json()` 走 `@ai-sdk/openai-compatible`
 *    的 JSON 模式，向上游发送 `response_format: { type: "json_object" }`，
 *    强制模型只返回合法 JSON 对象（claude-sonnet/gpt-4o/deepseek 等均支持）。
 * 2) **解析层兜底**：上游若忽略 response_format（旧代理/网关漏发），
 *    退回 generateText 的 text 字段，用 tryParseLenient 修补「裸换行 / 裸引号」
 *    后再用 zod 校验。
 *
 * 注：之前的「`response_format: json_schema` 在 AgentLLM 上不稳定」指的是 strict mode、
 * 要传 schema；这里只用 `json_object` 轻量模式（不传 schema），本地用 zod 校验。
 */
export async function generateStructured<T extends z.ZodTypeAny>(opts: {
  schema: T;
  system: string;
  prompt: string;
  /** 对目标 JSON 结构的人类可读描述，帮助模型按字段输出。 */
  jsonHint: string;
  model?: LanguageModel;
}): Promise<z.infer<T>> {
  const systemSuffix = `\n\n输出要求：仅返回一个 JSON 对象，禁止任何解释文字或 Markdown 代码块标记。
字符串值内部的特殊字符必须按 JSON 规范转义：
- 双引号 → \\"（如：内容是 "他说\\"你好\\""，不要写成 "他说"你好""）
- 反斜杠 → \\\\
- 换行 → \\n、回车 → \\r、制表符 → \\t`;

  const model = opts.model ?? agentllm(MODELS.chat);
  const system = `${opts.system}${systemSuffix}`;
  const prompt = `${opts.prompt}\n\n# 必须严格遵循的输出 JSON 结构\n${opts.jsonHint}`;

  // 优先开启 API 层 JSON 模式（Output.json() 触发 `response_format: json_object`）。
  // 若 SDK 在解析模型输出时抛错（小概率），回退到不带 output 约束的 plain 模式，
  // 让我们拿到 raw text 后用本地宽松解析器修补。
  let text = "";
  let direct: unknown = null;
  try {
    const result = await generateText({
      model,
      system,
      prompt,
      output: Output.json(),
    });
    direct = (result as { output?: unknown }).output;
    text = result.text ?? "";
  } catch (sdkErr) {
    console.warn(
      `[ai] Output.json() 抛错，回退到 plain 文本模式：${(sdkErr as Error).message.slice(0, 200)}`
    );
    const result = await generateText({ model, system, prompt });
    text = result.text ?? "";
  }

  // 优先用 SDK 已解析好的对象（API 强 JSON 模式成功时）。
  if (direct && typeof direct === "object") {
    return opts.schema.parse(direct) as z.infer<T>;
  }

  // 回退：从 text 中抠出 JSON，再走宽松解析（修裸换行 + 裸引号 + 控制字符）。
  let json: string;
  try {
    json = extractJsonObject(text);
  } catch (e) {
    throw new Error(
      `${(e as Error).message}；model_output[0..200]=${text.slice(0, 200).replace(/[\r\n]+/g, "\\n")}`
    );
  }
  let parsed: unknown;
  try {
    parsed = tryParseLenient(json);
  } catch (e) {
    throw new Error(
      `JSON 解析失败：${(e as Error).message}；body~ ${bodyContext(json, (e as Error).message)}`
    );
  }
  return opts.schema.parse(parsed) as z.infer<T>;
}
