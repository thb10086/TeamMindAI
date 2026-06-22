import { prisma } from "@/lib/db";

/**
 * 读取某项目的完整记忆图谱（实体 / 关系 / 社区），用于「项目记忆」查看页。
 * 不包含 embedding 向量列（Unsupported 类型，Prisma 不返回）。
 */
export async function getProjectMemoryGraph(projectId: string) {
  const [entities, relations, communities] = await Promise.all([
    prisma.memoryEntity.findMany({
      where: { projectId },
      orderBy: [{ importanceScore: "desc" }, { degree: "desc" }],
      select: {
        id: true,
        type: true,
        name: true,
        description: true,
        importanceScore: true,
        degree: true,
        mentionCount: true,
        communityId: true,
      },
    }),
    prisma.memoryRelation.findMany({
      where: { projectId },
      orderBy: { weight: "desc" },
      select: {
        id: true,
        type: true,
        description: true,
        weight: true,
        sourceEntityId: true,
        targetEntityId: true,
        sourceEntity: { select: { name: true, type: true } },
        targetEntity: { select: { name: true, type: true } },
      },
    }),
    prisma.memoryCommunity.findMany({
      where: { projectId },
      orderBy: { importanceScore: "desc" },
      select: {
        id: true,
        level: true,
        title: true,
        summary: true,
        importanceScore: true,
        entityCount: true,
      },
    }),
  ]);

  return { entities, relations, communities };
}
