import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { generateImage } from "@/lib/ai/image";
import { putObject } from "@/lib/storage";

/**
 * MEETING_IMAGE 子作业 payload：
 *  - kind=cover：装饰性封面（列表卡片缩略图），写 coverImageKey。
 *  - kind=summary：信息图汇总（含真实会议数据，嵌入纪要内容区），写 summaryImageKey。
 *  - kind=section：章节配图（已停用）。
 */
export interface MeetingImagePayload {
  kind: "cover" | "summary" | "section";
  index?: number;
}

export interface MeetingSectionImageRow {
  heading: string;
  prompt: string;
  key: string | null;
}

/** 章节配图风格约束（装饰性插画，不含文字）。 */
const SECTION_STYLE =
  "Flat minimal vector illustration, professional, soft muted palette, clean composition, ample negative space, no text, no letters, no numbers, no logos, no watermarks.";

/**
 * 从结构化纪要数据构建汇总图 prompt。
 * 汇总图要求：信息图/看板风格，包含会议标题、关键要点、决策、待办、风险全部真实内容；
 * 不加"no text"限制，要求模型将文字内容清晰渲染在画面中。
 */
function buildSummaryImagePrompt(data: {
  title: string;
  meetingTime?: Date | null;
  participants?: string | null;
  keyPoints: string[];
  decisions: Array<{ title: string }>;
  todos: Array<{ title: string; suggestedOwner?: string; priority?: string }>;
  risks: string[];
}): string {
  const lines: string[] = [];

  lines.push(
    "专业会议汇总信息图卡片。深海军蓝背景。简洁仪表板UI布局，各区块用彩色强调色条分隔，所有文字内容必须全部使用中文，清晰可读。"
  );
  lines.push("");
  lines.push(`标题：「${data.title}」`);

  const meta: string[] = [];
  if (data.meetingTime) {
    meta.push(data.meetingTime.toISOString().slice(0, 10));
  }
  if (data.participants) {
    meta.push(`参会者：${data.participants.slice(0, 60)}`);
  }
  if (meta.length) lines.push(meta.join("  |  "));

  if (data.keyPoints.length > 0) {
    lines.push("");
    lines.push("【关键要点】蓝色色条：");
    data.keyPoints.slice(0, 5).forEach((kp, i) => {
      lines.push(`  ${i + 1}. ${kp.slice(0, 100)}`);
    });
  }

  if (data.decisions.length > 0) {
    lines.push("");
    lines.push("【决策结论】琥珀色条：");
    data.decisions.slice(0, 3).forEach((d, i) => {
      lines.push(`  ${i + 1}. ${d.title.slice(0, 100)}`);
    });
  }

  if (data.todos.length > 0) {
    lines.push("");
    lines.push("【行动待办】绿色色条：");
    data.todos.slice(0, 4).forEach((t) => {
      const owner = t.suggestedOwner ? ` [${t.suggestedOwner}]` : "";
      const prio = t.priority ? ` ${t.priority}` : "";
      lines.push(`  • ${t.title.slice(0, 80)}${prio}${owner}`);
    });
  }

  if (data.risks.length > 0) {
    lines.push("");
    lines.push("【风险提示】红色色条：");
    data.risks.slice(0, 2).forEach((r) => {
      lines.push(`  ⚠ ${r.slice(0, 80)}`);
    });
  }

  lines.push("");
  lines.push(
    "视觉风格：专业扁平UI，深色模式仪表板，深色背景白色文字，彩色区块标题栏，简洁无衬线字体，高可读性，信息密集布局，无装饰插图。"
  );

  return lines.join("\n");
}

/**
 * 处理一张会议配图（汇总主图 / 章节配图），落 MinIO 并把对应字段写回 Meeting 表。
 * 任意一张图失败不会影响其它图与纪要可读性——由调用方（processAsyncJob）把异常落为 AsyncJob.FAILED。
 */
export async function runMeetingImage(
  meetingId: string,
  payload: MeetingImagePayload
): Promise<{ kind: MeetingImagePayload["kind"]; index: number | null }> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      title: true,
      meetingTime: true,
      participants: true,
      summaryImagePrompt: true,
      sectionImages: true,
      aiExtraction: true,
    },
  });
  if (!meeting) throw new Error("会议不存在，跳过图片生成。");

  if (payload.kind === "cover") {
    // 封面图：装饰性插画，与会议主题相关，用于列表卡片缩略图，不含文字。
    const coverPrompt = meeting.summaryImagePrompt?.trim();
    if (!coverPrompt) throw new Error("缺少 summaryImagePrompt，无法生成封面图。");
    const img = await generateImage({
      prompt: `${coverPrompt}. ${SECTION_STYLE}`,
      size: "1536x1024",
    });
    const key = `meetings/${meetingId}/cover-${Date.now()}.png`;
    await putObject(key, img.bytes, img.mime);
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { coverImageKey: key },
    });
    console.log(`[image] 封面图已生成并写入 DB：key=${key}`);
    return { kind: "cover", index: null };
  }

  if (payload.kind === "summary") {
    // 汇总图：信息图看板，含真实会议数据（全中文），嵌入纪要内容区展示。
    const extraction = meeting.aiExtraction as {
      keyPoints?: string[];
      decisions?: Array<{ title: string }>;
      todos?: Array<{ title: string; suggestedOwner?: string; priority?: string }>;
      risks?: string[];
    } | null;

    const prompt = buildSummaryImagePrompt({
      title: meeting.title,
      meetingTime: meeting.meetingTime,
      participants: meeting.participants,
      keyPoints: extraction?.keyPoints ?? [],
      decisions: extraction?.decisions ?? [],
      todos: extraction?.todos ?? [],
      risks: extraction?.risks ?? [],
    });

    const img = await generateImage({ prompt, size: "1536x1024" });
    const key = `meetings/${meetingId}/summary-${Date.now()}.png`;
    await putObject(key, img.bytes, img.mime);
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { summaryImageKey: key },
    });
    console.log(`[image] 汇总图已生成并写入 DB：key=${key}`);
    return { kind: "summary", index: null };
  }

  // kind === "section"
  const items = (meeting.sectionImages as MeetingSectionImageRow[] | null) ?? [];
  const idx = payload.index ?? -1;
  const target = items[idx];
  if (!target) {
    throw new Error(`章节配图索引越界（idx=${idx}, total=${items.length}）。`);
  }
  if (!target.prompt?.trim()) {
    throw new Error(`章节「${target.heading}」缺少 prompt，跳过。`);
  }

  const img = await generateImage({
    prompt: `${target.prompt}. ${SECTION_STYLE}`,
    size: "1536x1024",
  });
  const key = `meetings/${meetingId}/section-${idx}-${Date.now()}.png`;
  await putObject(key, img.bytes, img.mime);

  // 用 PostgreSQL 的 jsonb_set 原子地只更新 sectionImages[idx].key，
  // 避免多个并发 MEETING_IMAGE 子作业 read-modify-write 时互相覆盖。
  // path 形如 '{0,key}'：第 idx 个元素的 key 字段。
  const path = `{${idx},key}`;
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Meeting"
    SET "sectionImages" = jsonb_set(
      "sectionImages",
      ${path}::text[],
      to_jsonb(${key}::text),
      false
    )
    WHERE "id" = ${meetingId}
  `);

  return { kind: "section", index: idx };
}
