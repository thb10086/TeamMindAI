import { prisma } from "@/lib/db";

const ASSIGNEE_SELECT = {
  select: { id: true, displayName: true, name: true, username: true },
} as const;

/** 某需求的最新界面设计（轻量：含界面数量）。 */
export function getDesignByRequirement(requirementId: string) {
  return prisma.design.findFirst({
    where: { requirementId },
    orderBy: { version: "desc" },
    include: { _count: { select: { screens: true } } },
  });
}

/** 当前用户可见（所属项目）的界面设计列表，可按项目筛选。 */
export function listDesignsForUser(userId: string, projectId?: string) {
  return prisma.design.findMany({
    where: {
      project: { members: { some: { userId } } },
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      requirement: { select: { id: true, title: true } },
      assignee: ASSIGNEE_SELECT,
      _count: { select: { screens: true } },
    },
  });
}

/** 单个设计稿详情（含按序界面），并校验用户为项目成员。 */
export function getDesignForUser(designId: string, userId: string) {
  return prisma.design.findFirst({
    where: { id: designId, project: { members: { some: { userId } } } },
    include: {
      project: { select: { id: true, name: true } },
      requirement: { select: { id: true, title: true } },
      assignee: ASSIGNEE_SELECT,
      screens: { orderBy: { orderIndex: "asc" } },
    },
  });
}

/** 某项目下的全部界面设计（列表展示用，含界面数量与关联需求）。 */
export function listDesignsForProject(projectId: string) {
  return prisma.design.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    include: {
      requirement: { select: { id: true, title: true } },
      assignee: ASSIGNEE_SELECT,
      _count: { select: { screens: true } },
    },
  });
}

/** 可发起界面设计的需求（项目内），用于「新建设计」选择器。 */
export function listDesignableRequirements(projectId: string) {
  return prisma.requirement.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, status: true },
  });
}
