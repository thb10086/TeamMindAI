import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { userDisplayName } from "@/lib/org";
import {
  PRIORITY_LABEL,
  REQUIREMENT_STATUS_LABEL,
  TASK_STATUS_LABEL,
  TASK_TYPE_LABEL,
} from "@/lib/labels";

/**
 * 需求详情导出为 Markdown 文件（鉴权代理）。
 * GET /api/requirement/[id]/export
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireUser();

  const req = await prisma.requirement.findFirst({
    where: { id, project: { members: { some: { userId: user.id } } } },
    include: {
      project: { select: { name: true } },
      tasks: {
        orderBy: { createdAt: "asc" },
        include: {
          assignee: { select: { name: true, email: true, username: true, displayName: true } },
        },
      },
    },
  });

  if (!req) {
    return new Response("Not found", { status: 404 });
  }

  function lines(value: string | null | undefined): string[] {
    if (!value) return [];
    return value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function listSection(title: string, items: string[]): string {
    if (items.length === 0) return `## ${title}\n\n（暂无）\n`;
    return `## ${title}\n\n${items.map((it) => `- ${it}`).join("\n")}\n`;
  }

  function textSection(
    title: string,
    value: string | null | undefined
  ): string {
    return `## ${title}\n\n${value?.trim() || "（暂无）"}\n`;
  }

  const meta = [
    `**需求编号**：${req.requirementCode}`,
    `**所属项目**：${req.project.name}`,
    `**优先级**：${PRIORITY_LABEL[req.priority] ?? req.priority}`,
    `**状态**：${REQUIREMENT_STATUS_LABEL[req.status] ?? req.status}`,
    req.expectedOnlineTime
      ? `**预计上线**：${req.expectedOnlineTime.toISOString().slice(0, 10)}`
      : null,
    `**创建时间**：${req.createdAt.toISOString().slice(0, 10)}`,
    `**更新时间**：${req.updatedAt.toISOString().slice(0, 10)}`,
    req.isAiGenerated ? `**AI 生成**：是` : null,
  ]
    .filter(Boolean)
    .join("  \n");

  let taskTable = "";
  if (req.tasks.length > 0) {
    const header = "| 任务名称 | 类型 | 负责人 | 状态 |";
    const divider = "| --- | --- | --- | --- |";
    const rows = req.tasks
      .map((t: (typeof req.tasks)[number]) => {
        const name = t.title.replace(/\|/g, "｜");
        const type = t.taskType ? (TASK_TYPE_LABEL[t.taskType] ?? t.taskType) : "—";
        const assignee = t.assignee ? userDisplayName(t.assignee) : "未分配";
        const status = TASK_STATUS_LABEL[t.status] ?? t.status;
        return `| ${name} | ${type} | ${assignee} | ${status} |`;
      })
      .join("\n");
    taskTable =
      `## 已拆解任务（${req.tasks.length}）\n\n` +
      [header, divider, rows].join("\n") +
      "\n";
  }

  const clarificationSection = req.originalContent
    ? `## AI 澄清记录\n\n\`\`\`\n${req.originalContent.trim()}\n\`\`\`\n`
    : "";

  const md = [
    `# ${req.title}`,
    "",
    meta,
    "",
    "---",
    "",
    textSection("业务背景", req.background),
    textSection("当前问题 / 痛点", req.problem),
    textSection("目标用户", req.targetUser),
    textSection("业务目标", req.businessGoal),
    listSection("功能范围", lines(req.scope)),
    listSection("不做范围", lines(req.outOfScope)),
    textSection("用户故事", req.userStory),
    listSection("验收标准", lines(req.acceptanceCriteria)),
    taskTable || "",
    clarificationSection,
  ]
    .join("\n")
    .trimEnd();

  const safeTitle = req.title.replace(/[\\/:*?"<>|\r\n]/g, "_").slice(0, 80) || "requirement";
  const ascii = safeTitle.replace(/[^\x20-\x7E]/g, "_");
  const utf8 = encodeURIComponent(safeTitle);

  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ascii}.md"; filename*=UTF-8''${utf8}.md`,
    },
  });
}
