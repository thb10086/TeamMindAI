import { streamText, convertToModelMessages, type UIMessage } from "ai";

import { agentllm, MODELS } from "@/lib/ai/provider";
import { getAgent, type AgentRoleType } from "@/lib/ai/employees";

export const maxDuration = 60;

interface ChatBody {
  messages: UIMessage[];
  agentRole?: AgentRoleType;
  projectContext?: string;
}

export async function POST(req: Request) {
  const { messages, agentRole, projectContext }: ChatBody = await req.json();

  const role: AgentRoleType = agentRole ?? "ai_product_manager";
  const agent = getAgent(role) ?? getAgent("ai_product_manager");

  const contextBlock = projectContext
    ? `\n\n# 当前项目上下文\n${projectContext}`
    : "\n\n（当前为 AI 对齐室体验模式，尚未绑定具体项目上下文。请基于用户输入进行需求澄清，必要时提出待确认问题。）";

  const result = streamText({
    model: agentllm(MODELS.chat),
    system: agent.systemPrompt + contextBlock,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
