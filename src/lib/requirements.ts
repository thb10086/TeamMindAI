import { prisma } from "@/lib/db";

/** 当前用户可见（其所属项目）的全部需求。 */
export async function listRequirementsForUser(userId: string) {
  return prisma.requirement.findMany({
    where: { project: { members: { some: { userId } } } },
    orderBy: { updatedAt: "desc" },
    include: { project: { select: { id: true, name: true } } },
  });
}

/** 指定项目集合下的需求（看板手动建任务的需求选择器用，轻量字段）。 */
export function listRequirementsForProjects(projectIds: string[]) {
  if (projectIds.length === 0)
    return Promise.resolve(
      [] as { id: string; title: string; projectId: string }[]
    );
  return prisma.requirement.findMany({
    where: { projectId: { in: projectIds } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, projectId: true },
  });
}

/** 校验用户对需求所属项目有访问权后返回需求详情。 */
export async function getRequirementForUser(id: string, userId: string) {
  return prisma.requirement.findFirst({
    where: { id, project: { members: { some: { userId } } } },
    include: { project: { select: { id: true, name: true } } },
  });
}
