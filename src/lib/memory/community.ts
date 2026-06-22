import { prisma } from "@/lib/db";
import { embedText } from "@/lib/ai/embeddings";
import { toVectorLiteral } from "@/lib/ai/embeddings";
import { generateStructured } from "@/lib/ai/structured";
import { CommunitySummarySchema } from "@/lib/ai/schemas";

/** 一次最多 LLM 摘要的社区数（按规模降序取前 N），其余实体 communityId 置空。 */
const MAX_COMMUNITIES = 15;
/** 单个社区列入摘要的最大成员数。 */
const MAX_MEMBERS_PER_COMMUNITY = 40;
/** 触发社区重建的最小实体数。 */
const MIN_ENTITIES = 3;

const SUMMARY_SYSTEM = `你是项目知识分析师。给你一组彼此关联的实体及其关系，请输出该"知识社区"的主题标题与概览式摘要。
规则：严格基于给定的实体与关系，禁止编造未提供的信息；摘要 2~4 句，突出该社区在项目中的角色与关键关系。`;

const SUMMARY_HINT = `{
  "title": string,
  "summary": string,
  "importance": number
}`;

interface NodeRow {
  id: string;
  name: string;
  type: string;
  description: string | null;
  importanceScore: number;
}

/** 加权无向标签传播社区发现。 */
function detectCommunities(
  nodeIds: string[],
  edges: { s: string; t: string; w: number }[]
): Map<string, string[]> {
  const adj = new Map<string, Map<string, number>>();
  for (const id of nodeIds) adj.set(id, new Map());
  for (const e of edges) {
    const a = adj.get(e.s);
    const b = adj.get(e.t);
    if (!a || !b) continue;
    a.set(e.t, (a.get(e.t) ?? 0) + e.w);
    b.set(e.s, (b.get(e.s) ?? 0) + e.w);
  }

  const label = new Map<string, string>();
  for (const id of nodeIds) label.set(id, id);
  const order = [...nodeIds];

  for (let iter = 0; iter < 12; iter++) {
    let changed = false;
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const id of order) {
      const neigh = adj.get(id);
      if (!neigh || neigh.size === 0) continue;
      const score = new Map<string, number>();
      for (const [nb, w] of neigh) {
        const lb = label.get(nb)!;
        score.set(lb, (score.get(lb) ?? 0) + w);
      }
      let best = label.get(id)!;
      let bestScore = -1;
      for (const [lb, sc] of score) {
        if (sc > bestScore || (sc === bestScore && lb < best)) {
          best = lb;
          bestScore = sc;
        }
      }
      if (best !== label.get(id)) {
        label.set(id, best);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const groups = new Map<string, string[]>();
  for (const id of nodeIds) {
    const lb = label.get(id)!;
    const arr = groups.get(lb);
    if (arr) arr.push(id);
    else groups.set(lb, [id]);
  }
  return groups;
}

/**
 * 重建项目的记忆社区：标签传播聚类 → 每个社区 LLM 摘要 + 向量化 → 落库并回写实体 communityId。
 * 设计为幂等：每次全量重算并替换旧社区。
 */
export async function rebuildCommunities(
  projectId: string
): Promise<{ communities: number }> {
  const [nodes, relations] = await Promise.all([
    prisma.memoryEntity.findMany({
      where: { projectId },
      select: { id: true, name: true, type: true, description: true, importanceScore: true },
    }),
    prisma.memoryRelation.findMany({
      where: { projectId },
      select: { sourceEntityId: true, targetEntityId: true, type: true, weight: true, description: true },
    }),
  ]);

  // 旧社区清理（onDelete: SetNull 会清空实体 communityId）
  await prisma.memoryCommunity.deleteMany({ where: { projectId } });

  if (nodes.length < MIN_ENTITIES || relations.length === 0) {
    return { communities: 0 };
  }

  const nodeById = new Map<string, NodeRow>(nodes.map((n) => [n.id, n]));
  const groups = detectCommunities(
    nodes.map((n) => n.id),
    relations.map((r) => ({ s: r.sourceEntityId, t: r.targetEntityId, w: r.weight }))
  );

  // 仅保留规模 >= 2 的社区，按规模降序取前 N
  const clusters = [...groups.values()]
    .filter((ids) => ids.length >= 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_COMMUNITIES);

  let created = 0;
  for (const ids of clusters) {
    const idSet = new Set(ids);
    const members = ids
      .map((id) => nodeById.get(id))
      .filter((n): n is NodeRow => Boolean(n))
      .slice(0, MAX_MEMBERS_PER_COMMUNITY);

    const intraRelations = relations.filter(
      (r) => idSet.has(r.sourceEntityId) && idSet.has(r.targetEntityId)
    );

    const memberText = members
      .map((m) => `- ${m.name}（${m.type}）：${m.description ?? ""}`)
      .join("\n");
    const relationText = intraRelations
      .slice(0, 80)
      .map((r) => {
        const s = nodeById.get(r.sourceEntityId)?.name ?? "?";
        const t = nodeById.get(r.targetEntityId)?.name ?? "?";
        return `- ${s} --${r.type}--> ${t}${r.description ? `（${r.description}）` : ""}`;
      })
      .join("\n");

    let title = members[0]?.name ?? "项目知识社区";
    let summary = memberText;
    let importanceHint: number | undefined;
    try {
      const res = await generateStructured({
        schema: CommunitySummarySchema,
        jsonHint: SUMMARY_HINT,
        system: SUMMARY_SYSTEM,
        prompt: `# 实体\n${memberText}\n\n# 关系\n${relationText || "（无显式关系）"}`,
      });
      title = res.title.trim() || title;
      summary = res.summary.trim() || summary;
      importanceHint = res.importance;
    } catch {
      // 摘要失败则退化为成员列表
    }

    const memberImportance = members.reduce((acc, m) => acc + m.importanceScore, 0);
    const importanceScore =
      Math.round((memberImportance + (importanceHint ?? 0) * members.length) * 1000) /
      1000;

    const community = await prisma.memoryCommunity.create({
      data: {
        projectId,
        level: 0,
        title: title.slice(0, 200),
        summary,
        entityCount: members.length,
        importanceScore,
      },
    });

    await prisma.memoryEntity.updateMany({
      where: { id: { in: ids } },
      data: { communityId: community.id },
    });

    try {
      const emb = await embedText(`${title}\n${summary}`);
      if (emb.length) {
        await prisma.$executeRaw`UPDATE "MemoryCommunity" SET embedding = ${toVectorLiteral(
          emb
        )}::vector WHERE id = ${community.id}`;
      }
    } catch {
      // 向量化失败不阻断
    }

    created++;
  }

  return { communities: created };
}
