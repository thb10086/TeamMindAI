import { generateText } from "ai";

import { agentllm, MODELS } from "@/lib/ai/provider";
import { getAgent } from "@/lib/ai/employees";
import { generateStructured } from "@/lib/ai/structured";
import { DesignPlanSchema, type DesignPlan } from "@/lib/ai/schemas";

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
  const { text } = await generateText({
    model: agentllm(MODELS.chat),
    system: `${DESIGNER.systemPrompt}\n\n${HTML_RULES}`,
    prompt: `请为以下界面生成可交互的低保真原型 HTML 片段。

# 设计方案概述
${opts.designSummary}

# 当前界面
名称：${opts.screen.name}
标识（screenKey）：${opts.screen.screenKey}
目标：${opts.screen.purpose}

# 可跳转的其它界面（用 data-goto 链接）
${others || "（无）"}

# 所属需求
${opts.requirementText}${contextBlock}`,
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
  const { text } = await generateText({
    model: agentllm(MODELS.chat),
    system: `${DESIGNER.systemPrompt}\n\n${HTML_RULES}`,
    prompt: `请根据「用户反馈」调整下面这个界面的低保真原型 HTML。
重要约束：
- 严格围绕「所属需求」，不得偏离已确认的需求范围与目标；反馈与需求冲突时以需求为准，并用「待确认：…」标注。
- 只调整当前界面，保持与其它界面一致的视觉风格与跳转（data-goto）。
- 在满足反馈的同时，尽量保留当前界面里仍合理的结构与内容，做有针对性的修改而非全盘推倒。

# 用户反馈（本次要改的点）
${opts.feedback}

# 当前界面的 HTML（在此基础上修改）
${opts.currentHtml || "（当前为空，请重新生成）"}

# 设计方案概述
${opts.designSummary}

# 当前界面
名称：${opts.screen.name}
标识（screenKey）：${opts.screen.screenKey}
目标：${opts.screen.purpose}

# 可跳转的其它界面（用 data-goto 链接）
${others || "（无）"}

# 所属需求
${opts.requirementText}${contextBlock}`,
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
