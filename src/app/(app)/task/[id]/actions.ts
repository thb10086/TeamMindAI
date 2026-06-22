"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { retrieveProjectContext } from "@/lib/memory/retrieve";
import {
  PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  TASK_TYPE_LABEL,
} from "@/lib/labels";

export interface CommentResult {
  ok?: boolean;
  error?: string;
}

/** 在任务下添加评论（校验项目成员权限）。 */
export async function addTaskComment(
  taskId: string,
  body: string
): Promise<CommentResult> {
  const user = await requireUser();
  const text = body.trim();
  if (!text) return { error: "评论内容不能为空。" };
  if (text.length > 2000) return { error: "评论过长（不超过 2000 字）。" };

  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { members: { some: { userId: user.id } } } },
    select: { id: true },
  });
  if (!task) return { error: "无权操作该任务或任务不存在。" };

  await prisma.taskComment.create({
    data: { taskId: task.id, authorId: user.id, body: text },
  });

  revalidatePath(`/task/${task.id}`);
  return { ok: true };
}

export interface DevPromptResult {
  prompt?: string;
  error?: string;
}

/**
 * 交付桥：把任务组装成可直接粘贴到本地 AI 编程工具（Cursor/Windsurf）的开发提示，
 * 含背景 + 关联需求 + 验收标准 + 同需求任务（依赖）+ 项目记忆（GraphRAG）。
 */
export async function buildTaskDevPrompt(
  taskId: string
): Promise<DevPromptResult> {
  const user = await requireUser();
  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { members: { some: { userId: user.id } } } },
    include: {
      project: { select: { id: true, name: true } },
      requirement: {
        select: {
          id: true,
          title: true,
          background: true,
          businessGoal: true,
          scope: true,
          acceptanceCriteria: true,
        },
      },
    },
  });
  if (!task) return { error: "无权访问该任务或任务不存在。" };

  const siblings = task.requirementId
    ? await prisma.task.findMany({
        where: { requirementId: task.requirementId, NOT: { id: task.id } },
        orderBy: { orderIndex: "asc" },
        select: { taskCode: true, title: true, status: true },
      })
    : [];

  // 项目记忆（best-effort，检索失败不阻断）
  let memoryText = "";
  try {
    const ctx = await retrieveProjectContext({
      projectId: task.projectId,
      query: `${task.title}\n${task.description ?? ""}`,
      budgetChars: 2000,
    });
    memoryText = ctx.isEmpty ? "" : ctx.text.trim();
  } catch {
    memoryText = "";
  }

  const typeLabel = task.taskType
    ? TASK_TYPE_LABEL[task.taskType] ?? task.taskType
    : "未分类";
  const parts: string[] = [];
  parts.push(`# 开发任务：${task.title}`);
  parts.push(
    `> 项目：${task.project.name} ｜ 任务编号：${task.taskCode} ｜ 类型：${typeLabel} ｜ 优先级：${
      PRIORITY_LABEL[task.priority] ?? task.priority
    }`
  );
  parts.push(`\n## 任务说明\n${task.description?.trim() || "（无）"}`);

  const acc = (task.acceptanceCriteria ?? "").trim();
  if (acc) parts.push(`\n## 验收标准（逐条满足）\n${acc}`);

  if (task.requirement) {
    const r = task.requirement;
    const reqLines: string[] = [`\n## 关联需求：${r.title}`];
    if (r.background?.trim())
      reqLines.push(`- 业务背景：${r.background.trim()}`);
    if (r.businessGoal?.trim())
      reqLines.push(`- 业务目标：${r.businessGoal.trim()}`);
    if (r.scope?.trim()) reqLines.push(`- 功能范围：\n${r.scope.trim()}`);
    if (r.acceptanceCriteria?.trim())
      reqLines.push(`- 需求级验收：\n${r.acceptanceCriteria.trim()}`);
    parts.push(reqLines.join("\n"));
  }

  if (siblings.length) {
    parts.push(
      `\n## 同需求下的其它任务（协作 / 依赖参考）\n` +
        siblings
          .map(
            (s) =>
              `- [${TASK_STATUS_LABEL[s.status] ?? s.status}] ${s.taskCode} ${
                s.title
              }`
          )
          .join("\n")
    );
  }

  if (memoryText) {
    parts.push(
      `\n## 项目记忆（历史上下文，仅供参考；不得据此编造未确认的需求/接口）\n${memoryText}`
    );
  }

  parts.push(
    `\n## 开发要求\n` +
      `1. 严格遵循本项目现有技术栈与代码规范，复用现有模块，不要引入未约定的依赖。\n` +
      `2. 逐条实现「验收标准」并自检通过。\n` +
      `3. 若信息不足或与历史上下文冲突，先提出澄清问题，不要擅自假设。\n` +
      `4. 输出：实现代码 + 简要变更说明 + 自测点。`
  );

  return { prompt: parts.join("\n") };
}
