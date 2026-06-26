import { generateText, type ModelMessage } from "ai";

import { agentllm, MODELS } from "@/lib/ai/provider";
import { getAgent } from "@/lib/ai/employees";
import { generateStructured } from "@/lib/ai/structured";
import { DesignPlanSchema, type DesignPlan } from "@/lib/ai/schemas";

/** 单次 AI 调用最长等待时间（ms）。超时主动 abort，避免任务无限挂起。 */
const AI_CALL_TIMEOUT_MS = 120_000; // 2 分钟

/** 单次调用最大输出 token（HTML 片段一轮）。 */
const MAX_OUTPUT_TOKENS = 6000;

/** 包装 AbortSignal 超时，用于传入 generateText abortSignal。 */
function makeTimeoutSignal(ms = AI_CALL_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(ms);
}

/**
 * Agentic 续写生成器——参考 Claude Code 的 multi-turn agent loop 设计：
 *
 * 1. 发起首次生成请求；
 * 2. 若 finishReason === 'length'（max_tokens 截断），将已输出作为 assistant turn
 *    追加到 message history，再请求续写，最多重试 maxContinuations 次；
 * 3. finishReason === 'stop' 时返回拼接后的完整文本。
 *
 * 这样无论中间输出多长都能确保完整输出，同时每次单次属于独立调用、具备自己的 timeout。
 */
async function generateWithContinuation(opts: {
  system: string;
  initialMessages: ModelMessage[];
  maxOutputTokens?: number;
  maxContinuations?: number;
  label?: string;
}): Promise<string> {
  const maxOut = opts.maxOutputTokens ?? MAX_OUTPUT_TOKENS;
  const maxCont = opts.maxContinuations ?? 3;
  const label = opts.label ?? "AI 调用";

  let accumulated = "";
  let messages: ModelMessage[] = [...opts.initialMessages];

  for (let attempt = 0; attempt <= maxCont; attempt++) {
    const result = await generateText({
      model: agentllm(MODELS.chat),
      system: opts.system,
      messages,
      maxOutputTokens: maxOut,
      abortSignal: makeTimeoutSignal(),
    });

    accumulated += result.text;

    if (result.finishReason !== "length") {
      // 正常结束（stop / tool-calls / content-filter 等）
      break;
    }

    if (attempt < maxCont) {
      console.log(
        `[design] ${label} 被 max_tokens 截断，续写 (${attempt + 1}/${maxCont})…`
      );
      // 把本轮输出追加为 assistant turn，再请求从中断处继续
      messages = [
        ...messages,
        { role: "assistant", content: result.text },
        {
          role: "user",
          content:
            "请从上一条输出中断的地方直接继续输出，不要重复已有内容。",
        },
      ];
    } else {
      console.warn(
        `[design] ${label} 达到续写上限 (${maxCont}次)，输出可能不完整。`
      );
    }
  }

  return accumulated;
}

const DESIGNER = getAgent("ai_ux_designer");

const DESIGN_PLAN_HINT = `{
  "title": string,
  "summary": string,
  "screens": [
    { "name": string, "screenKey": string, "purpose": string }
  ]
}`;

/** 规划该需求需要哪些可交互界面（屏），HTML 随后逐屏生成。 */
export async function generateDesignPlan(opts: {
  requirementText: string;
  projectContext?: string;
}): Promise<DesignPlan> {
  const contextBlock = opts.projectContext
    ? `\n\n# 项目上下文（对齐已有约定与术语，不可臆造）\n${opts.projectContext}`
    : "";
  return generateStructured({
    schema: DesignPlanSchema,
    jsonHint: DESIGN_PLAN_HINT,
    system: DESIGNER.systemPrompt,
    prompt: `请基于以下「已确认需求」规划可交互界面原型需要哪些界面（屏）。
要求：
- 覆盖完成该需求的关键用户路径，界面 2-5 个；
- 每个界面给出简洁中文名称、英文短标识 screenKey（小写+连字符）与核心目标一句话；
- 只规划与该需求范围一致的界面，不要臆造无关界面。

# 需求
${opts.requirementText}${contextBlock}`,
  });
}

const HTML_RULES = `输出要求（务必严格遵守）：
1. 只输出该界面 <body> 内部的 HTML 片段，禁止包含 <!DOCTYPE>、<html>、<head>、<body>、<script>、<style> 等标签。
2. 仅用 Tailwind CSS 原子类做样式（运行环境已注入 Tailwind），不要写行内 style，不要引用任何外部资源/图片/字体/脚本。
3. 用真实、贴合需求的中文示例数据；体现空态/加载/错误等关键状态（以文案与占位呈现）。
4. 需要跳转到其它界面的可点击元素，加属性 data-goto="目标screenKey"（按钮/链接/卡片均可）；普通 href 一律用 "#"。
5. 头像/图标用纯色圆形+文字或内联 <svg> 代替，禁止 <img> 外链。
6. 克制配色：以中性灰白（neutral/slate）为主、少量强调色；响应式布局；信息层级清晰、留白合理。
7. 不确定或需产品确认处，用小号灰色文案标注「待确认：…」。
只返回 HTML 片段本身，不要任何解释文字或 Markdown 代码块标记。`;

/** 生成单个界面的可交互低保真 HTML 片段（body 内部，沙箱 iframe 渲染）。 */
export async function generateScreenHtml(opts: {
  requirementText: string;
  designSummary: string;
  screen: { name: string; screenKey: string; purpose: string };
  allScreens: { name: string; screenKey: string }[];
  projectContext?: string;
}): Promise<string> {
  const others = opts.allScreens
    .filter((s) => s.screenKey !== opts.screen.screenKey)
    .map((s) => `${s.name}（${s.screenKey}）`)
    .join("、");
  const contextBlock = opts.projectContext
    ? `\n\n# 项目上下文（参考，不可臆造）\n${opts.projectContext}`
    : "";
  const prompt = `请为以下界面生成可交互的低保真原型 HTML 片段。

# 设计方案概述
${opts.designSummary}

# 当前界面
名称：${opts.screen.name}
标识（screenKey）：${opts.screen.screenKey}
目标：${opts.screen.purpose}

# 可跳转的其它界面（用 data-goto 链接）
${others || "（无）"}

# 所属需求
${opts.requirementText}${contextBlock}`;

  const text = await generateWithContinuation({
    system: `${DESIGNER.systemPrompt}\n\n${HTML_RULES}`,
    initialMessages: [{ role: "user", content: prompt }],
    label: `界面 ${opts.screen.screenKey}`,
  });
  return sanitizeScreenHtml(text);
}

/**
 * 基于用户反馈调整单个界面：在「不偏离已确认需求」的前提下，按反馈修订当前界面 HTML。
 * 反馈与需求冲突时以需求为准，并在界面以「待确认：…」标注。
 */
export async function refineScreenHtml(opts: {
  requirementText: string;
  designSummary: string;
  screen: { name: string; screenKey: string; purpose: string };
  currentHtml: string;
  feedback: string;
  allScreens: { name: string; screenKey: string }[];
  projectContext?: string;
}): Promise<string> {
  const others = opts.allScreens
    .filter((s) => s.screenKey !== opts.screen.screenKey)
    .map((s) => `${s.name}（${s.screenKey}）`)
    .join("、");
  const contextBlock = opts.projectContext
    ? `\n\n# 项目上下文（参考，不可臆造）\n${opts.projectContext}`
    : "";
  // HTML 过长时截断：避免 refine prompt 超过上下文限制
  const MAX_HTML_FOR_PROMPT = 8000;
  const htmlForPrompt =
    opts.currentHtml.length > MAX_HTML_FOR_PROMPT
      ? opts.currentHtml.slice(0, MAX_HTML_FOR_PROMPT) + "\n<!-- ...（截断）-->"
      : opts.currentHtml;

  const refinePrompt = `请根据「用户反馈」调整下面这个界面的低保真原型 HTML。
重要约束：
- 严格围绕「所属需求」，不得偏离已确认的需求范围与目标；反馈与需求冲突时以需求为准，并用「待确认：…」标注。
- 只调整当前界面，保持与其它界面一致的视觉风格与跳转（data-goto）。
- 在满足反馈的同时，尽量保留当前界面里仍合理的结构与内容，做有针对性的修改而非全盘推倒。

# 用户反馈（本次要改的点）
${opts.feedback}

# 当前界面的 HTML（在此基础上修改）
${htmlForPrompt || "（当前为空，请重新生成）"}

# 设计方案概述
${opts.designSummary}

# 当前界面
名称：${opts.screen.name}
标识（screenKey）：${opts.screen.screenKey}
目标：${opts.screen.purpose}

# 可跳转的其它界面（用 data-goto 链接）
${others || "（无）"}

# 所属需求
${opts.requirementText}${contextBlock}`;

  const text = await generateWithContinuation({
    system: `${DESIGNER.systemPrompt}\n\n${HTML_RULES}`,
    initialMessages: [{ role: "user", content: refinePrompt }],
    label: `refine ${opts.screen.screenKey}`,
  });
  return sanitizeScreenHtml(text);
}

/**
 * 清洗模型产出的 HTML：去围栏、抽 <body> 内部、剥离脚本/样式/外链与文档级标签。
 * 既保证可注入沙箱 iframe，也作为对模型输出的安全兜底。
 */
export function sanitizeScreenHtml(raw: string): string {
  let html = (raw ?? "").trim();
  const fence = html.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) html = fence[1].trim();
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (body) html = body[1].trim();
  html = html
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<\/?(?:html|head|body)[^>]*>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<link[^>]*>/gi, "");
  return html.trim();
}
