import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { retrieveProjectContext } from "@/lib/memory/retrieve";
import { enqueueMemoryIngest } from "@/lib/queue/memory-queue";
// 注：diarizeTranscript / turnsToReadableText 仍保留在 @/lib/ai/meeting，
// 此处暂不引用。后续接入声纹方案后再恢复调用。
import { generateMeetingMinutes } from "@/lib/ai/meeting";
import { transcribeAudio } from "@/lib/ai/asr";
import { getObjectBytes } from "@/lib/storage";
import { createAndEnqueueJob } from "./index";
import type { MeetingImagePayload } from "./run-meeting-image";

/** 超长转写稿的安全上限（约几万字），避免单次请求过大；超出部分截断。 */
const MAX_RAW_CHARS = 80000;

/**
 * 会议处理核心（供后台 worker 调用）：
 *  1. 置 PROCESSING；（音频会议先转写）
 *  2. 检索项目记忆作上下文 → AI 生成结构化纪要并落库；
 *  3. 把汇总图 prompt 与章节图 prompt 写入 Meeting，立刻置 READY 让用户可读；
 *  4. 异步入队 N+1 个 MEETING_IMAGE 子作业（汇总图 + 章节图），逐张写回 MinIO key。
 *  5. 写操作日志并沉淀项目记忆。
 * 出错时把会议置 FAILED 并抛出（由调用方统一记为作业失败）。幂等性由作业层保证。
 */
export async function runMeetingProcess(
  meetingId: string,
  onProgress: (completed: number, total: number) => Promise<void>
): Promise<{ ok: true }> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      projectId: true,
      title: true,
      participants: true,
      meetingTime: true,
      rawContent: true,
      sourceType: true,
      audioKey: true,
      audioMime: true,
      audioName: true,
      transcript: true,
      createdById: true,
    },
  });
  if (!meeting) throw new Error("会议不存在。");

  const isAudio = meeting.sourceType === "AUDIO";
  if (!isAudio && !meeting.rawContent?.trim()) {
    throw new Error("会议没有可整理的原始内容。");
  }
  if (isAudio && !meeting.audioKey && !meeting.transcript?.trim()) {
    throw new Error("音频会议缺少音频文件，无法转写。");
  }

  // 音频且尚未转写：转写 + 纪要（2 步）；纯文本会议或已转写：仅 纪要（1 步）。
  // 配图（汇总图 + 章节图）由独立的 MEETING_IMAGE 子作业异步处理，不计入本作业步数。
  // 注：说话人识别（diarization）已暂时关闭，后续接入声纹方案后恢复。
  const needsTranscribe =
    isAudio && Boolean(meeting.audioKey) && !meeting.transcript?.trim();
  const total = needsTranscribe ? 2 : 1;
  let step = 0;
  const bump = async () => {
    step += 1;
    await onProgress(step, total);
  };
  await onProgress(0, total);

  try {
    let rawContent = meeting.rawContent ?? "";

    // 0) 音频：转写 + 说话人识别（diarization）
    if (needsTranscribe) {
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { status: "TRANSCRIBING" },
      });

      const audio = await getObjectBytes(meeting.audioKey as string);
      const tr = await transcribeAudio({
        bytes: audio.bytes,
        filename: meeting.audioName ?? "audio",
        contentType: meeting.audioMime ?? audio.contentType,
        language: "zh",
        // 每片成功后写 MinIO 缓存；重新处理时已转写的分片直接命中，不再调用 ASR 网关。
        cacheKeyPrefix: `meetings/cache/${meetingId}/`,
      });
      if (!tr.text.trim()) {
        throw new Error("转写结果为空，请确认音频包含有效人声。");
      }
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { transcript: tr.text, durationSec: tr.duration },
      });
      // 说话人识别暂未启用（后续接入声纹方案再恢复）：
      // 直接把纯转写当作 rawContent 喂给后续纪要生成。主要二极管补位。
      rawContent = tr.text;
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { rawContent: tr.text },
      });
      await bump(); // 转写完成
      console.log(
        `[meeting] 转写完成：${tr.segments.length} 段，${Math.round(
          tr.duration
        )}s，${tr.text.length} 字`
      );
    }

    await prisma.meeting.update({
      where: { id: meetingId },
      data: { status: "PROCESSING" },
    });

    // 项目记忆上下文（best-effort）
    let projectContext: string | undefined;
    try {
      const ctx = await retrieveProjectContext({
        projectId: meeting.projectId,
        query: `${meeting.title} 会议 纪要 决策`,
        budgetChars: 1500,
      });
      if (ctx && !ctx.isEmpty) projectContext = ctx.text;
    } catch {
      // 检索失败不阻断
    }

    // 1) 结构化纪要
    console.log(
      `[meeting] 开始生成纪要（rawContent ${rawContent.length} 字）…`
    );
    const tMinutes = Date.now();
    const minutes = await generateMeetingMinutes({
      title: meeting.title,
      participants: meeting.participants,
      meetingTime: meeting.meetingTime
        ? meeting.meetingTime.toISOString().slice(0, 16).replace("T", " ")
        : null,
      rawContent: rawContent.slice(0, MAX_RAW_CHARS),
      projectContext,
    });
    console.log(
      `[meeting] 纪要生成完成（${Math.round(
        (Date.now() - tMinutes) / 1000
      )}s；todos=${minutes.todos.length}, decisions=${minutes.decisions.length}, requirementChanges=${minutes.requirementChanges.length}）`
    );

    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        aiSummary: minutes.summary,
        aiExtraction: {
          keyPoints: minutes.keyPoints,
          todos: minutes.todos,
          decisions: minutes.decisions,
          risks: minutes.risks,
          requirementChanges: minutes.requirementChanges,
        },
        summaryImagePrompt: minutes.summaryImagePrompt,
        summaryImageKey: null,
        sectionImages: [],
        coverImageKey: null,
        coverImagePrompt: minutes.summaryImagePrompt,
      },
    });
    await bump(); // 纪要完成

    // 纪要可读：立刻置 READY，配图由子作业异步追加。
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { status: "READY" },
    });

    // 入队封面图（装饰性）+ 汇总信息图（内容图）两张图片子作业。
    try {
      await createAndEnqueueJob({
        type: "MEETING_IMAGE",
        projectId: meeting.projectId,
        meetingId,
        createdById: meeting.createdById ?? null,
        payload: { kind: "cover" } satisfies MeetingImagePayload as Prisma.InputJsonValue,
      });
      await createAndEnqueueJob({
        type: "MEETING_IMAGE",
        projectId: meeting.projectId,
        meetingId,
        createdById: meeting.createdById ?? null,
        payload: { kind: "summary" } satisfies MeetingImagePayload as Prisma.InputJsonValue,
      });
      console.log(`[meeting] 已入队配图子作业：封面图 + 汇总图`);
    } catch (err) {
      console.error(
        "[meeting] 配图子作业入队失败（不影响纪要）：",
        (err as Error).message
      );
    }

    // 操作日志（best-effort）
    await prisma.operationLog
      .create({
        data: {
          userId: meeting.createdById,
          action: "MEETING_PROCESSED",
          targetType: "Meeting",
          targetId: meetingId,
          detail: {
            todos: minutes.todos.length,
            decisions: minutes.decisions.length,
            risks: minutes.risks.length,
          },
        },
      })
      .catch(() => {});

    // 沉淀项目记忆
    const memText = [
      `会议「${meeting.title}」纪要：`,
      minutes.summary,
      minutes.decisions.length
        ? `决策：${minutes.decisions.map((d) => d.title).join("；")}`
        : "",
      minutes.requirementChanges.length
        ? `需求变更：${minutes.requirementChanges
            .map((r) => r.title)
            .join("；")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    await enqueueMemoryIngest({
      projectId: meeting.projectId,
      originType: "meeting",
      originId: meetingId,
      title: `会议纪要：${meeting.title}`,
      text: memText,
      contextHint: `这是会议「${meeting.title}」的纪要与抽取结果`,
      rebuildCommunities: true,
    });

    return { ok: true };
  } catch (err) {
    await prisma.meeting
      .update({ where: { id: meetingId }, data: { status: "FAILED" } })
      .catch(() => {});
    throw err;
  }
}
