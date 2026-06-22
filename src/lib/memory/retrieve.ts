import { prisma } from "@/lib/db";
import { embedText, toVectorLiteral } from "@/lib/ai/embeddings";

/** 检索可调参数。 */
const SEED_ENTITIES = 8;
const SEED_FACTS = 5;
const SEED_COMMUNITIES = 3;
const MAX_HOPS = 2;
const HOP_DECAY = 0.5;
const MAX_ENTITIES_OUT = 18;
const MAX_RELATIONS_OUT = 25;
const DEFAULT_BUDGET_CHARS = 3500;

interface EntityHit {
  id: string;
  name: string;
  type: string;
  description: string | null;
  importanceScore: number;
  similarity: number;
}

interface FactHit {
  id: string;
  title: string | null;
  content: string;
  memoryType: string;
  importanceScore: number;
  similarity: number;
}

interface CommunityHit {
  id: string;
  title: string;
  summary: string;
  similarity: number;
}

export interface ContextRef {
  type: "entity" | "relation" | "fact" | "community";
  id: string;
}

export interface RetrievedEntity {
  id: string;
  name: string;
  type: string;
  description: string | null;
  score: number;
  depth: number;
}

export interface RetrievedRelation {
  source: string;
  target: string;
  type: string;
  description: string | null;
  weight: number;
}

export interface ProjectContext {
  text: string;
  isEmpty: boolean;
  entities: RetrievedEntity[];
  relations: RetrievedRelation[];
  facts: FactHit[];
  communities: CommunityHit[];
  refs: ContextRef[];
}

const EMPTY_CONTEXT: ProjectContext = {
  text: "",
  isEmpty: true,
  entities: [],
  relations: [],
  facts: [],
  communities: [],
  refs: [],
};

/**
 * GraphRAG 检索：向量找种子实体/事实 → 图多跳扩展 → 全局社区 → 时间/重要性加权 → 预算内组装。
 * 返回可直接注入 prompt 的 text 以及结构化结果与出处 refs（写 AgentCallLog.contextRefs）。
 */
export async function retrieveProjectContext(opts: {
  projectId: string;
  query: string;
  budgetChars?: number;
}): Promise<ProjectContext> {
  const { projectId } = opts;
  const query = opts.query?.trim() ?? "";
  const budget = opts.budgetChars ?? DEFAULT_BUDGET_CHARS;

  let qlit: string | null = null;
  if (query) {
    try {
      qlit = toVectorLiteral(await embedText(query));
    } catch {
      qlit = null;
    }
  }

  // 1) 种子：向量检索（无 query 或向量失败时退化为按重要性取 top）
  const [seedEntities, facts, communities] = await Promise.all([
    seedEntityHits(projectId, qlit),
    seedFactHits(projectId, qlit),
    seedCommunityHits(projectId, qlit),
  ]);

  // 2) 图多跳扩展（BFS）
  const visited = new Map<string, { depth: number; score: number }>();
  for (const e of seedEntities) {
    visited.set(e.id, { depth: 0, score: Math.max(e.similarity, 0.01) });
  }
  const relationRows: {
    sourceEntityId: string;
    targetEntityId: string;
    type: string;
    description: string | null;
    weight: number;
  }[] = [];
  const seenRel = new Set<string>();

  let frontier = [...visited.keys()];
  for (let depth = 1; depth <= MAX_HOPS && frontier.length > 0; depth++) {
    const rels = await prisma.memoryRelation.findMany({
      where: {
        projectId,
        OR: [
          { sourceEntityId: { in: frontier } },
          { targetEntityId: { in: frontier } },
        ],
      },
      orderBy: { weight: "desc" },
      take: 80,
      select: {
        sourceEntityId: true,
        targetEntityId: true,
        type: true,
        description: true,
        weight: true,
      },
    });

    const next: string[] = [];
    for (const r of rels) {
      const relKey = `${r.sourceEntityId}|${r.targetEntityId}|${r.type}`;
      if (!seenRel.has(relKey)) {
        seenRel.add(relKey);
        relationRows.push(r);
      }
      for (const [from, to] of [
        [r.sourceEntityId, r.targetEntityId],
        [r.targetEntityId, r.sourceEntityId],
      ] as const) {
        if (!visited.has(from) || visited.has(to)) continue;
        const base = visited.get(from)!.score;
        visited.set(to, {
          depth,
          score: base * HOP_DECAY * Math.min(1, r.weight),
        });
        next.push(to);
      }
    }
    frontier = next;
  }

  if (visited.size === 0 && facts.length === 0 && communities.length === 0) {
    return EMPTY_CONTEXT;
  }

  // 3) 取实体详情并打分（路径分 + 重要性）
  const ids = [...visited.keys()];
  const entityRows = ids.length
    ? await prisma.memoryEntity.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          name: true,
          type: true,
          description: true,
          importanceScore: true,
        },
      })
    : [];
  const maxImportance = Math.max(1, ...entityRows.map((e) => e.importanceScore));
  const nameById = new Map(entityRows.map((e) => [e.id, e.name]));

  const scoredEntities: RetrievedEntity[] = entityRows
    .map((e) => {
      const v = visited.get(e.id)!;
      const score =
        v.score * 0.7 + (e.importanceScore / maxImportance) * 0.3;
      return {
        id: e.id,
        name: e.name,
        type: e.type,
        description: e.description,
        score: Math.round(score * 1000) / 1000,
        depth: v.depth,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTITIES_OUT);

  const keepIds = new Set(scoredEntities.map((e) => e.id));
  const relations: RetrievedRelation[] = relationRows
    .filter((r) => keepIds.has(r.sourceEntityId) && keepIds.has(r.targetEntityId))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_RELATIONS_OUT)
    .map((r) => ({
      source: nameById.get(r.sourceEntityId) ?? "?",
      target: nameById.get(r.targetEntityId) ?? "?",
      type: r.type,
      description: r.description,
      weight: Math.round(r.weight * 1000) / 1000,
    }));

  // 4) 组装（预算内）
  const refs: ContextRef[] = [];
  const sections: string[] = [];
  let used = 0;
  const add = (block: string) => {
    if (used + block.length > budget) return false;
    sections.push(block);
    used += block.length;
    return true;
  };

  if (communities.length) {
    const lines = communities
      .map((c) => `- 【${c.title}】${c.summary}`)
      .join("\n");
    if (add(`## 项目主题概览\n${lines}`)) {
      communities.forEach((c) => refs.push({ type: "community", id: c.id }));
    }
  }

  if (scoredEntities.length) {
    const lines = scoredEntities
      .map((e) => `- ${e.name}（${entityTypeLabel(e.type)}）：${e.description ?? ""}`)
      .join("\n");
    if (add(`## 相关实体\n${lines}`)) {
      scoredEntities.forEach((e) => refs.push({ type: "entity", id: e.id }));
    }
  }

  if (relations.length) {
    const lines = relations
      .map(
        (r) =>
          `- ${r.source} —[${r.type}]→ ${r.target}${
            r.description ? `（${r.description}）` : ""
          }`
      )
      .join("\n");
    add(`## 关系网络\n${lines}`);
  }

  if (facts.length) {
    const lines = facts
      .map((f) => `- ${f.title ? f.title + "：" : ""}${truncate(f.content, 240)}`)
      .join("\n");
    if (add(`## 相关历史记录\n${lines}`)) {
      facts.forEach((f) => refs.push({ type: "fact", id: f.id }));
    }
  }

  const text = sections.join("\n\n");
  return {
    text,
    isEmpty: text.trim().length === 0,
    entities: scoredEntities,
    relations,
    facts,
    communities,
    refs,
  };
}

async function seedEntityHits(
  projectId: string,
  qlit: string | null
): Promise<EntityHit[]> {
  if (qlit) {
    return prisma.$queryRaw<EntityHit[]>`
      SELECT id, name, type::text AS type, description, "importanceScore",
             1 - (embedding <=> ${qlit}::vector) AS similarity
      FROM "MemoryEntity"
      WHERE "projectId" = ${projectId} AND embedding IS NOT NULL
      ORDER BY embedding <=> ${qlit}::vector
      LIMIT ${SEED_ENTITIES}
    `;
  }
  const rows = await prisma.memoryEntity.findMany({
    where: { projectId },
    orderBy: { importanceScore: "desc" },
    take: SEED_ENTITIES,
    select: {
      id: true,
      name: true,
      type: true,
      description: true,
      importanceScore: true,
    },
  });
  return rows.map((r) => ({ ...r, similarity: 0.3 }));
}

async function seedFactHits(
  projectId: string,
  qlit: string | null
): Promise<FactHit[]> {
  if (qlit) {
    return prisma.$queryRaw<FactHit[]>`
      SELECT id, title, content, "memoryType"::text AS "memoryType", "importanceScore",
             1 - (embedding <=> ${qlit}::vector) AS similarity
      FROM "Memory"
      WHERE "projectId" = ${projectId} AND embedding IS NOT NULL
        AND "validityStatus" = 'valid'
      ORDER BY embedding <=> ${qlit}::vector
      LIMIT ${SEED_FACTS}
    `;
  }
  return [];
}

async function seedCommunityHits(
  projectId: string,
  qlit: string | null
): Promise<CommunityHit[]> {
  if (qlit) {
    return prisma.$queryRaw<CommunityHit[]>`
      SELECT id, title, summary,
             1 - (embedding <=> ${qlit}::vector) AS similarity
      FROM "MemoryCommunity"
      WHERE "projectId" = ${projectId} AND embedding IS NOT NULL
      ORDER BY embedding <=> ${qlit}::vector
      LIMIT ${SEED_COMMUNITIES}
    `;
  }
  const rows = await prisma.memoryCommunity.findMany({
    where: { projectId },
    orderBy: { importanceScore: "desc" },
    take: SEED_COMMUNITIES,
    select: { id: true, title: true, summary: true },
  });
  return rows.map((r) => ({ ...r, similarity: 0.3 }));
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

const ENTITY_TYPE_LABEL: Record<string, string> = {
  PERSON: "人员",
  REQUIREMENT: "需求",
  TASK: "任务",
  DECISION: "决策",
  FEATURE: "功能",
  MODULE: "模块",
  RISK: "风险",
  RULE: "规则",
  CUSTOMER: "客户",
  TECH: "技术",
  METRIC: "指标",
  MEETING: "会议",
  OTHER: "其他",
};

function entityTypeLabel(type: string): string {
  return ENTITY_TYPE_LABEL[type] ?? type;
}
