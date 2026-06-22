import { prisma } from "@/lib/db";

/** 当前用户参与项目下的会议列表（可选按项目过滤），按创建时间倒序。 */
export function listMeetingsForUser(userId: string, projectId?: string) {
  return prisma.meeting.findMany({
    where: {
      project: { members: { some: { userId } } },
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      sourceType: true,
      meetingTime: true,
      participants: true,
      // 卡片缩略图：优先用新版 summaryImageKey，回落到旧版 coverImageKey。
      summaryImageKey: true,
      coverImageKey: true,
      createdAt: true,
      projectId: true,
      project: { select: { id: true, name: true } },
    },
  });
}

/** 单个会议详情（校验项目成员权限）。 */
export function getMeetingForUser(id: string, userId: string) {
  return prisma.meeting.findFirst({
    where: { id, project: { members: { some: { userId } } } },
    select: {
      id: true,
      title: true,
      status: true,
      sourceType: true,
      meetingTime: true,
      participants: true,
      rawContent: true,
      audioKey: true,
      audioName: true,
      durationSec: true,
      transcript: true,
      transcriptSegments: true,
      speakers: true,
      aiSummary: true,
      aiExtraction: true,
      coverImageKey: true,
      coverImagePrompt: true,
      summaryImageKey: true,
      summaryImagePrompt: true,
      sectionImages: true,
      createdById: true,
      createdAt: true,
      projectId: true,
      project: { select: { id: true, name: true } },
    },
  });
}
