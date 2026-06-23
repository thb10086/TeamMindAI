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
 * 海报风格：现代商务设计感，类似高端企业年报或会议成果展示板，视觉层次丰富。
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
  const dateStr = data.meetingTime
    ? data.meetingTime.toISOString().slice(0, 10)
    : "";
  const participants = data.participants?.slice(0, 60) ?? "";

  const kpCount = data.keyPoints.length;
  const decCount = data.decisions.length;
  const todoCount = data.todos.length;
  const riskCount = data.risks.length;

  const sub = [
    dateStr,
    participants ? `参会：${participants}` : "",
  ]
    .filter(Boolean)
    .join("   |   ");

  const statsLine = [
    kpCount ? `${kpCount} 关键要点` : "",
    decCount ? `${decCount} 决策` : "",
    todoCount ? `${todoCount} 待办` : "",
    riskCount ? `${riskCount} 风险` : "",
  ]
    .filter(Boolean)
    .join("  ·  ");

  const kpLines = data.keyPoints
    .slice(0, 4)
    .map((kp, i) => `      ${i + 1}. ${kp.slice(0, 90)}`)
    .join("\n");

  const decLines = data.decisions
    .slice(0, 3)
    .map((d, i) => `      ${i + 1}. ${d.title.slice(0, 90)}`)
    .join("\n");

  const todoLines = data.todos
    .slice(0, 4)
    .map((t) => {
      const owner = t.suggestedOwner ? ` [${t.suggestedOwner}]` : "";
      const prio = t.priority ? ` ${t.priority}` : "";
      return `      • ${t.title.slice(0, 75)}${prio}${owner}`;
    })
    .join("\n");

  const riskLines = data.risks
    .slice(0, 3)
    .map((r) => `      ▲ ${r.slice(0, 90)}`)
    .join("\n");

  return `横版会议成果海报，宽幅16:10比例，设计感强，类似顶级商业杂志内页或企业年会成果展示板。

【整体风格】
现代高端商务设计。主背景深邃午夜蓝渐变（#0f1b2d 到 #1a2d4a），带细腻光晕质感，不是纯色块，有层次感。四个内容区块各有独立的高亮强调色：亮蓝、琥珀金、翠绿、珊瑚红。整体留白合理，不拥挤，视觉上像一张精心设计的成果展示海报。

【顶部标题区 — 占高度约20%】
横向渐变色条（亮蓝 #3b82f6 到紫蓝 #6366f1），左侧配半透明圆形几何光晕装饰。
居中白色粗体大字标题：「${data.title}」（视觉主焦点，字号大而突出）。
标题正下方白色小字副标题：${sub || "内部会议"}。

【中部内容区 — 占高度约55%，两列均分，四张卡片】
每张卡片：圆角矩形，半透明深色背景（#1e2d42 带10%透明度边框），顶部有3px强调色横线+对应图标+中文区块大标题，卡片内容白色细字，行距宽松，卡片之间有明显间距，整体不拥挤。

  卡片1【🔑 关键要点】亮蓝 #3b82f6 顶线：
${kpLines || "      暂无"}

  卡片2【⚖️ 决策结论】琥珀金 #f59e0b 顶线：
${decLines || "      暂无"}

  卡片3【✅ 行动待办】翠绿 #10b981 顶线：
${todoLines || "      暂无"}

  卡片4【⚠️ 风险提示】珊瑚红 #ef4444 顶线：
${riskLines || "      暂无风险"}

【底部页脚区 — 占高度约25%】
深色半透明横条，背景略深于主色。左侧：彩色大号数字+白色小字统计标签并排展示（${statsLine || "0 关键要点"}），视觉上像数据仪表板的统计摘要，数字大而突出，标签小而清晰。右侧：淡色细体英文 "TeamMindAI" 品牌标识。

【字体与文字要求】
全部文字内容使用中文，仅品牌标识允许英文。无衬线现代字体，标题粗体、正文常规细体。所有文字清晰可读，不模糊，不溢出卡片边界，不重叠。

【禁止事项】
禁止表格样式、禁止行列数据表格、禁止仪表盘风格、禁止写实照片元素。要像一张精美的商务海报，而非数据报表截图。`;
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
