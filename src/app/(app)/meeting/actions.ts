"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { requireFullUser, canLeadProject } from "@/lib/access";
import { enqueueMemoryIngest } from "@/lib/queue/memory-queue";
import {
  createAndEnqueueJob,
  findActiveJob,
  jobStatusSelect,
} from "@/lib/jobs";

/** 抽取结果的客户端视图类型（与 run-meeting 落库结构一致）。 */
export interface MeetingExtraction {
  keyPoints: string[];
  todos: { title: string; suggestedOwner: string; priority: string }[];
  decisions: {
    title: string;
    background: string;
    reason?: string;
    impact?: string;
  }[];
  risks: string[];
  requirementChanges: {
    title: string;
    detail?: string;
    kind?: "new" | "change";
    priority?: string;
  }[];
}

const PRIORITY_IMPORTANCE: Record<string, number> = {
  P0: 0.95,
  P1: 0.8,
  P2: 0.6,
  P3: 0.4,
};

const createSchema = z
  .object({
    projectId: z.string().min(1, "请选择所属项目。"),
    title: z.string().trim().min(1, "请填写会议标题。").max(200),
    meetingTime: z.string().optional(),
    participants: z.string().trim().max(500).optional(),
    sourceType: z.enum(["TEXT", "AUDIO"]).default("TEXT"),
    rawContent: z.string().trim().optional(),
    audioKey: z.string().optional(),
    audioMime: z.string().optional(),
    audioName: z.string().optional(),
  })
  .refine(
    (d) =>
      d.sourceType === "AUDIO"
        ? Boolean(d.audioKey)
        : (d.rawContent?.trim().length ?? 0) >= 10,
    {
      message: "请粘贴会议文本（至少 10 字）或上传音频。",
      path: ["rawContent"],
    }
  );

export interface CreateMeetingResult {
  meetingId?: string;
  jobId?: string;
  error?: string;
}

/**
 * 新建会议并入队后台处理（AI 纪要 + 封面图）。立即返回 meetingId/jobId；
 * 实际处理在 worker 执行，前端轮询 pollMeeting。
 */
export async function createMeeting(input: {
  projectId: string;
  title: string;
  meetingTime?: string;
  participants?: string;
  sourceType?: "TEXT" | "AUDIO";
  rawContent?: string;
  audioKey?: string;
  audioMime?: string;
  audioName?: string;
}): Promise<CreateMeetingResult> {
  const user = await requireUser();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "输入有误。" };
  }
  const data = parsed.data;

  // 校验项目成员权限
  const member = await prisma.projectMember.findFirst({
    where: { projectId: data.projectId, userId: user.id },
    select: { id: true },
  });
  if (!member) return { error: "你不是该项目成员，无法在此创建会议。" };

  const isAudio = data.sourceType === "AUDIO";
  // 音频 key 必须是当前用户通过上传接口写入的，防止传入任意对象。
  if (isAudio && !data.audioKey?.startsWith(`meetings/uploads/${user.id}/`)) {
    return { error: "音频上传凭证无效，请重新上传。" };
  }

  let meetingTime: Date | null = null;
  if (data.meetingTime) {
    const d = new Date(data.meetingTime);
    if (!Number.isNaN(d.getTime())) meetingTime = d;
  }

  const meeting = await prisma.meeting.create({
    data: {
      projectId: data.projectId,
      title: data.title,
      meetingTime,
      participants: data.participants || null,
      sourceType: isAudio ? "AUDIO" : "TEXT",
      rawContent: isAudio ? null : data.rawContent ?? "",
      audioKey: isAudio ? data.audioKey : null,
      audioMime: isAudio ? data.audioMime ?? null : null,
      audioName: isAudio ? data.audioName ?? null : null,
      status: "DRAFT",
      createdById: user.id,
    },
    select: { id: true, projectId: true },
  });

  try {
    const jobId = await createAndEnqueueJob({
      type: "MEETING_PROCESS",
      projectId: meeting.projectId,
      meetingId: meeting.id,
      createdById: user.id,
    });
    revalidatePath("/meeting");
    return { meetingId: meeting.id, jobId };
  } catch {
    return {
      meetingId: meeting.id,
      error: "后台任务服务暂不可用，请稍后在会议详情页重试处理。",
    };
  }
}

export interface PollMeetingResult {
  error?: string;
  meetingStatus?: "DRAFT" | "TRANSCRIBING" | "PROCESSING" | "READY" | "FAILED";
  jobStatus?: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  progress?: number;
  completed?: number;
  total?: number;
  jobError?: string | null;
  summary?: string | null;
  extraction?: MeetingExtraction | null;
  /** 列表卡片缩略图 / 详情页主图是否已就绪（summaryImageKey 或旧版 coverImageKey 任一存在即可） */
  hasCover?: boolean;
  /** 详情页主图（汇总图）是否已就绪 */
  hasSummaryImage?: boolean;
}

/** 轮询会议处理进度，并回传已生成的纪要/抽取/配图就绪情况，供详情页增量刷新。 */
export async function pollMeeting(
  meetingId: string,
  jobId?: string
): Promise<PollMeetingResult> {
  const user = await requireUser();
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, project: { members: { some: { userId: user.id } } } },
    select: {
      status: true,
      aiSummary: true,
      aiExtraction: true,
      coverImageKey: true,
      summaryImageKey: true,
    },
  });
  if (!meeting) return { error: "会议不存在或你不是该项目成员。" };

  const job = jobId
    ? await prisma.asyncJob.findUnique({
        where: { id: jobId },
        select: jobStatusSelect,
      })
    : null;

  return {
    meetingStatus: meeting.status,
    jobStatus: job?.status,
    progress: job?.progress,
    completed: job?.completed,
    total: job?.total,
    jobError: job?.error ?? null,
    summary: meeting.aiSummary,
    extraction: (meeting.aiExtraction as MeetingExtraction | null) ?? null,
    hasCover: Boolean(meeting.summaryImageKey ?? meeting.coverImageKey),
    hasSummaryImage: Boolean(meeting.summaryImageKey ?? meeting.coverImageKey),
  };
}

export interface ReprocessResult {
  jobId?: string;
  error?: string;
}

/** 重新处理会议（生成失败或想重跑时）。复用进行中的作业，避免重复触发。 */
export async function reprocessMeeting(
  meetingId: string
): Promise<ReprocessResult> {
  const user = await requireUser();
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, project: { members: { some: { userId: user.id } } } },
    select: { id: true, projectId: true },
  });
  if (!meeting) return { error: "会议不存在或你不是该项目成员。" };

  const active = await findActiveJob({
    type: "MEETING_PROCESS",
    meetingId: meeting.id,
  });
  if (active) return { jobId: active.id };

  try {
    const jobId = await createAndEnqueueJob({
      type: "MEETING_PROCESS",
      projectId: meeting.projectId,
      meetingId: meeting.id,
      createdById: user.id,
    });
    return { jobId };
  } catch {
    return { error: "后台任务服务暂不可用，请稍后重试。" };
  }
}

/** 仅重新生成汇总主图（不重跑纪要生成），用于图片更新后快速刷新。 */
export async function regenerateSummaryImage(
  meetingId: string
): Promise<{ jobId?: string; error?: string }> {
  const user = await requireUser();
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, project: { members: { some: { userId: user.id } } } },
    select: { id: true, projectId: true, status: true },
  });
  if (!meeting) return { error: "会议不存在或你不是该项目成员。" };
  if (meeting.status !== "READY" && meeting.status !== "FAILED") {
    return { error: "会议尚未处理完成，请先等待纪要生成。" };
  }
  try {
    const jobId = await createAndEnqueueJob({
      type: "MEETING_IMAGE",
      projectId: meeting.projectId,
      meetingId: meeting.id,
      createdById: user.id,
      payload: { kind: "summary" },
    });
    return { jobId };
  } catch {
    return { error: "后台任务服务暂不可用，请稍后重试。" };
  }
}

export interface CreateTasksResult {
  count?: number;
  error?: string;
}

/**
 * 把会议待办一键生成为任务（人在回路：仅项目主管可执行；任务为草案、不自动指派）。
 */
export async function createTasksFromMeeting(
  meetingId: string
): Promise<CreateTasksResult> {
  const user = await requireFullUser();
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, project: { members: { some: { userId: user.id } } } },
    select: { id: true, projectId: true, title: true, aiExtraction: true },
  });
  if (!meeting) return { error: "会议不存在或你不是该项目成员。" };

  const lead = await canLeadProject(meeting.projectId, user);
  if (!lead) return { error: "仅项目主管/管理员可从会议生成任务。" };

  const extraction = meeting.aiExtraction as MeetingExtraction | null;
  const todos = extraction?.todos ?? [];
  if (!todos.length) return { error: "该会议没有可生成任务的待办。" };

  const valid = ["P0", "P1", "P2", "P3"];
  const base = Date.now().toString(36).toUpperCase();
  await prisma.$transaction(
    todos.map((t, i) =>
      prisma.task.create({
        data: {
          taskCode: `TASK-${base}-${i + 1}`,
          projectId: meeting.projectId,
          title: t.title,
          description: `来自会议《${meeting.title}》${
            t.suggestedOwner ? ` · 建议负责人：${t.suggestedOwner}` : ""
          }`,
          status: "TODO",
          priority: (valid.includes(t.priority) ? t.priority : "P2") as
            | "P0"
            | "P1"
            | "P2"
            | "P3",
          isAiGenerated: true,
          orderIndex: i,
          createdById: user.id,
        },
      })
    )
  );

  await prisma.operationLog
    .create({
      data: {
        userId: user.id,
        action: "MEETING_TASKS_CREATED",
        targetType: "Meeting",
        targetId: meeting.id,
        detail: { count: todos.length },
      },
    })
    .catch(() => {});

  revalidatePath("/kanban");
  revalidatePath(`/meeting/${meeting.id}`);
  return { count: todos.length };
}

export interface DeleteMeetingResult {
  ok?: boolean;
  error?: string;
}

/** 删除会议（创建者或项目主管）。 */
export async function deleteMeeting(
  meetingId: string
): Promise<DeleteMeetingResult> {
  const user = await requireFullUser();
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, project: { members: { some: { userId: user.id } } } },
    select: { id: true, projectId: true, createdById: true },
  });
  if (!meeting) return { error: "会议不存在或你不是该项目成员。" };

  const lead = await canLeadProject(meeting.projectId, user);
  if (meeting.createdById !== user.id && !lead) {
    return { error: "仅创建者或项目主管可删除会议。" };
  }

  await prisma.meeting.delete({ where: { id: meeting.id } });
  revalidatePath("/meeting");
  return { ok: true };
}

// ============================================================
// 串联：把会议抽取的资产落到决策 / 需求 / 通知（人在回路，由用户确认触发）
// ============================================================

export interface LinkResult {
  count?: number;
  error?: string;
}

const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
type PriorityValue = (typeof PRIORITIES)[number];

/** 把会议决策一键归档为项目决策记录（仅项目主管；幂等：已归档过则拒绝重复）。 */
export async function createDecisionsFromMeeting(
  meetingId: string
): Promise<LinkResult> {
  const user = await requireFullUser();
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, project: { members: { some: { userId: user.id } } } },
    select: {
      id: true,
      projectId: true,
      title: true,
      participants: true,
      aiExtraction: true,
    },
  });
  if (!meeting) return { error: "会议不存在或你不是该项目成员。" };
  if (!(await canLeadProject(meeting.projectId, user))) {
    return { error: "仅项目主管/管理员可归档决策。" };
  }

  const decisions =
    (meeting.aiExtraction as MeetingExtraction | null)?.decisions ?? [];
  if (!decisions.length) return { error: "该会议没有可归档的决策。" };

  const dup = await prisma.operationLog.findFirst({
    where: {
      action: "MEETING_DECISIONS_CREATED",
      targetType: "Meeting",
      targetId: meeting.id,
    },
    select: { id: true },
  });
  if (dup) return { error: "该会议的决策已归档过，请勿重复生成。" };

  await prisma.decision.createMany({
    data: decisions.map((d) => ({
      projectId: meeting.projectId,
      title: d.title,
      background: d.background || null,
      reason: d.reason || null,
      impact: d.impact || null,
      participants: meeting.participants,
      confirmed: false,
      createdById: user.id,
    })),
  });

  await prisma.operationLog
    .create({
      data: {
        userId: user.id,
        action: "MEETING_DECISIONS_CREATED",
        targetType: "Meeting",
        targetId: meeting.id,
        detail: { count: decisions.length },
      },
    })
    .catch(() => {});

  revalidatePath(`/meeting/${meeting.id}`);
  revalidatePath(`/project/${meeting.projectId}`);
  return { count: decisions.length };
}

/** 把会议「需求变更」一键落为需求草案（source=MEETING，仅项目主管；幂等）。 */
export async function createRequirementsFromMeeting(
  meetingId: string
): Promise<LinkResult> {
  const user = await requireFullUser();
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, project: { members: { some: { userId: user.id } } } },
    select: {
      id: true,
      projectId: true,
      title: true,
      aiExtraction: true,
      project: { select: { name: true } },
    },
  });
  if (!meeting) return { error: "会议不存在或你不是该项目成员。" };
  if (!(await canLeadProject(meeting.projectId, user))) {
    return { error: "仅项目主管/管理员可生成需求。" };
  }

  const changes =
    (meeting.aiExtraction as MeetingExtraction | null)?.requirementChanges ?? [];
  if (!changes.length) return { error: "该会议没有可生成的需求。" };

  const dup = await prisma.operationLog.findFirst({
    where: {
      action: "MEETING_REQUIREMENTS_CREATED",
      targetType: "Meeting",
      targetId: meeting.id,
    },
    select: { id: true },
  });
  if (dup) return { error: "该会议的需求已生成过，请勿重复生成。" };

  const base = Date.now().toString(36).toUpperCase();
  let count = 0;
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    const priority: PriorityValue = (PRIORITIES as readonly string[]).includes(
      c.priority ?? ""
    )
      ? (c.priority as PriorityValue)
      : "P2";
    const req = await prisma.requirement.create({
      data: {
        requirementCode: `REQ-${base}-${i + 1}`,
        projectId: meeting.projectId,
        title: c.title,
        source: "MEETING",
        originalContent: `来自会议《${meeting.title}》`,
        background: c.detail || null,
        priority,
        status: "IDEA_POOL",
        isAiGenerated: true,
        proposerId: user.id,
        ownerId: user.id,
        createdById: user.id,
      },
      select: { id: true },
    });
    count += 1;
    await enqueueMemoryIngest({
      projectId: meeting.projectId,
      originType: "requirement",
      originId: req.id,
      title: c.title,
      text: [
        `需求：${c.title}`,
        c.detail ? `要点：${c.detail}` : "",
        `来源：会议《${meeting.title}》`,
      ]
        .filter(Boolean)
        .join("\n"),
      memoryType: "HISTORICAL_REQUIREMENT",
      importanceHint: PRIORITY_IMPORTANCE[priority] ?? 0.6,
      contextHint: `项目：${meeting.project.name}（会议产生的需求）`,
      rebuildCommunities: i === changes.length - 1,
    }).catch(() => {});
  }

  await prisma.operationLog
    .create({
      data: {
        userId: user.id,
        action: "MEETING_REQUIREMENTS_CREATED",
        targetType: "Meeting",
        targetId: meeting.id,
        detail: { count },
      },
    })
    .catch(() => {});

  revalidatePath("/requirement");
  revalidatePath(`/meeting/${meeting.id}`);
  revalidatePath(`/project/${meeting.projectId}`);
  return { count };
}

/** 会议纪要生成后，给项目成员发送站内通知（人在回路：由用户点击触发）。 */
export async function notifyProjectOfMeeting(
  meetingId: string
): Promise<LinkResult> {
  const user = await requireFullUser();
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, project: { members: { some: { userId: user.id } } } },
    select: {
      id: true,
      projectId: true,
      title: true,
      status: true,
      aiSummary: true,
    },
  });
  if (!meeting) return { error: "会议不存在或你不是该项目成员。" };
  if (meeting.status !== "READY") return { error: "纪要尚未生成完成。" };

  const members = await prisma.projectMember.findMany({
    where: { projectId: meeting.projectId },
    select: { userId: true },
  });
  if (!members.length) return { error: "项目暂无成员可通知。" };

  const snippet = (meeting.aiSummary ?? "")
    .replace(/[#*`>_]/g, "")
    .trim()
    .slice(0, 120);
  await prisma.notification.createMany({
    data: members.map((m: { userId: string }) => ({
      notificationType: "MEETING_MINUTES",
      channel: "IN_APP" as const,
      title: `会议纪要已生成：${meeting.title}`,
      content: snippet || `会议《${meeting.title}》的纪要已生成，请查看。`,
      receiverId: m.userId,
      projectId: meeting.projectId,
      status: "SENT" as const,
      sendTime: new Date(),
    })),
  });

  await prisma.operationLog
    .create({
      data: {
        userId: user.id,
        action: "MEETING_NOTIFIED",
        targetType: "Meeting",
        targetId: meeting.id,
        detail: { receivers: members.length },
      },
    })
    .catch(() => {});

  return { count: members.length };
}

/** 手动编辑并保存会议纪要（创建者或项目主管）。 */
export async function updateMeetingSummary(
  meetingId: string,
  summary: string
): Promise<{ error?: string }> {
  const user = await requireFullUser();
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, project: { members: { some: { userId: user.id } } } },
    select: { id: true, projectId: true, createdById: true, status: true },
  });
  if (!meeting) return { error: "会议不存在或你不是该项目成员。" };
  const canManage =
    meeting.createdById === user.id ||
    (await canLeadProject(meeting.projectId, user));
  if (!canManage) return { error: "仅会议创建者或项目主管可编辑纪要。" };
  if (meeting.status !== "READY" && meeting.status !== "FAILED") {
    return { error: "会议尚未处理完成，暂不可编辑。" };
  }
  await prisma.meeting.update({
    where: { id: meetingId },
    data: { aiSummary: summary.trim() },
  });
  return {};
}
