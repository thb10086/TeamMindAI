"use server";

import { generateText } from "ai";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { retrieveProjectContext } from "@/lib/memory/retrieve";
import { agentllm, MODELS } from "@/lib/ai/provider";
import { getAgent } from "@/lib/ai/employees";

export interface RetrieveTestResult {
  text?: string;
  isEmpty?: boolean;
  counts?: { entities: number; relations: number; facts: number; communities: number };
  error?: string;
}

/**
 * 检索测试器：对某项目用给定 query 跑一次 GraphRAG 混合检索，返回组装好的上下文。
 * 用于「项目记忆」页直观验证检索质量；仅项目成员可用。
 */
export async function testRetrieve(
  projectId: string,
  query: string
): Promise<RetrieveTestResult> {
  const user = await requireUser();

  const trimmed = query.trim();
  if (!trimmed) return { error: "请输入要检索的问题。" };

  const member = await prisma.project.findFirst({
    where: { id: projectId, members: { some: { userId: user.id } } },
    select: { id: true },
  });
  if (!member) return { error: "无权访问该项目或项目不存在。" };

  try {
    const ctx = await retrieveProjectContext({ projectId, query: trimmed });
    return {
      text: ctx.text,
      isEmpty: ctx.isEmpty,
      counts: {
        entities: ctx.entities.length,
        relations: ctx.relations.length,
        facts: ctx.facts.length,
        communities: ctx.communities.length,
      },
    };
  } catch {
    return { error: "检索失败，请确认已生成记忆并稍后重试。" };
  }
}

export interface AskMemoryResult {
  answer?: string;
  /** 本次回答所依据的检索上下文（供「查看依据」展开）。 */
  contextText?: string;
  isEmpty?: boolean;
  counts?: { entities: number; relations: number; facts: number; communities: number };
  error?: string;
}

/**
 * 项目记忆问答：面向全体项目成员（含开发人员）。
 * 先用 GraphRAG 检索项目上下文，再由 AI 产品经理「严格基于上下文」作答（不编造）。
 * 用于「开发人员不清楚业务细节时，直接在项目记忆里问 AI」。
 */
export async function askProjectMemory(
  projectId: string,
  question: string
): Promise<AskMemoryResult> {
  const user = await requireUser();

  const trimmed = question.trim();
  if (!trimmed) return { error: "请输入你的问题。" };

  const member = await prisma.project.findFirst({
    where: { id: projectId, members: { some: { userId: user.id } } },
    select: { id: true },
  });
  if (!member) return { error: "无权访问该项目或项目不存在。" };

  let ctx;
  try {
    ctx = await retrieveProjectContext({ projectId, query: trimmed });
  } catch {
    return { error: "检索项目记忆失败，请稍后重试。" };
  }

  const pm = getAgent("ai_product_manager");
  const contextBlock = ctx.isEmpty
    ? "（项目记忆暂为空，没有可参考的已沉淀信息。）"
    : ctx.text;

  try {
    const { text } = await generateText({
      model: agentllm(MODELS.chat),
      system: `${pm.systemPrompt}

补充任务：你现在处于「项目记忆问答」场景，面向团队成员（含开发人员）解答关于本项目的业务背景、需求细节、决策与分工等问题。
回答规则：
1. 只能依据下方「项目记忆上下文」作答，严禁编造上下文中不存在的需求、人名、决策、接口或数据。
2. 若上下文不足以回答，明确说明「项目记忆中暂无相关信息」，并建议向谁/在何处确认（如对应需求负责人、AI 对齐室）。
3. 回答简洁、结构化（可用要点），使用中文。`,
      prompt: `# 项目记忆上下文（唯一可信来源）
${contextBlock}

# 团队成员的问题
${trimmed}`,
    });
    return {
      answer: text.trim(),
      contextText: ctx.isEmpty ? undefined : ctx.text,
      isEmpty: ctx.isEmpty,
      counts: {
        entities: ctx.entities.length,
        relations: ctx.relations.length,
        facts: ctx.facts.length,
        communities: ctx.communities.length,
      },
    };
  } catch {
    return { error: "AI 回答生成失败，请稍后重试。" };
  }
}
