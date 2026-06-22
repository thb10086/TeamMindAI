import { prisma } from "@/lib/db";
import { embedText, embedTexts, toVectorLiteral } from "@/lib/ai/embeddings";
import type { MemoryEntityTypeValue } from "@/lib/ai/schemas";
import { extractGraph } from "./extract";

/** MemoryType 枚举值（与 Prisma 一致），仅在提供时落一条 Memory 事实。 */
export type MemoryTypeValue =
  | "PROJECT_BACKGROUND"
  | "BUSINESS_RULE"
  | "HISTORICAL_REQUIREMENT"
  | "HISTORICAL_DECISION"
  | "TECH_ARCHITECTURE"
  | "INTERFACE_DESIGN"
  | "STAFFING"
  | "CUSTOMER_FEEDBACK"
  | "RISK"
  | "RELEASE_RECORD";

/** 抽取实体类型（小写）→ Prisma MemoryEntityType（大写字面量联合）。 */
const ENTITY_TYPE_MAP = {
  person: "PERSON",
  requirement: "REQUIREMENT",
  task: "TASK",
  decision: "DECISION",
  feature: "FEATURE",
  module: "MODULE",
  risk: "RISK",
  rule: "RULE",
  customer: "CUSTOMER",
  tech: "TECH",
  metric: "METRIC",
  meeting: "MEETING",
  other: "OTHER",
} as const;

export interface IngestSourceInput {
  projectId: string;
  /** 来源对象类型：requirement | task | decision | meeting | knowledge | note */
  originType: string;
  originId?: string;
  title?: string;
  text: string;
  /** 提供则同时落一条 Memory 事实；不提供则只更新图谱。 */
  memoryType?: MemoryTypeValue;
  /** 0~1，影响 Memory 与实体的重要性基线。 */
  importanceHint?: number;
  /** 给抽取模型的背景提示（不会被抽取为实体）。 */
  contextHint?: string;
}

export interface IngestResult {
  memoryId?: string;
  entityCount: number;
  relationCount: number;
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function chooseDescription(oldD: string | null, newD: string): string {
  if (!oldD) return newD;
  if (!newD) return oldD;
  return newD.length > oldD.length ? newD : oldD;
}

function clampWeight(w?: number): number {
  if (typeof w !== "number" || Number.isNaN(w)) return 0.6;
  return Math.min(1, Math.max(0.1, w));
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

async function setEmbedding(
  table: "Memory" | "MemoryEntity" | "MemoryCommunity",
  id: string,
  embedding: number[]
): Promise<void> {
  if (!embedding.length) return;
  const lit = toVectorLiteral(embedding);
  // table 是受控字面量（非外部输入），用于绕过 Prisma 对 Unsupported 向量列的限制。
  if (table === "Memory") {
    await prisma.$executeRaw`UPDATE "Memory" SET embedding = ${lit}::vector WHERE id = ${id}`;
  } else if (table === "MemoryEntity") {
    await prisma.$executeRaw`UPDATE "MemoryEntity" SET embedding = ${lit}::vector WHERE id = ${id}`;
  } else {
    await prisma.$executeRaw`UPDATE "MemoryCommunity" SET embedding = ${lit}::vector WHERE id = ${id}`;
  }
}

/**
 * 把一段来源文本沉淀进项目记忆：
 * 1) 可选落一条 Memory 事实（带向量）。
 * 2) LLM 抽取实体/关系，去重合并写入图谱（实体带向量）。
 * 3) 重算受影响实体的 degree 与 importanceScore。
 */
export async function ingestSource(
  input: IngestSourceInput
): Promise<IngestResult> {
  const { projectId, originType, originId, title } = input;
  const clean = input.text?.trim() ?? "";
  if (!clean) return { entityCount: 0, relationCount: 0 };

  // 1) Memory 事实落库（可选）
  let memoryId: string | undefined;
  if (input.memoryType) {
    const mem = await prisma.memory.create({
      data: {
        projectId,
        memoryType: input.memoryType,
        title: title ?? null,
        content: clean,
        sourceType: originType,
        sourceId: originId ?? null,
        importanceScore: input.importanceHint ?? 0.5,
      },
    });
    memoryId = mem.id;
    try {
      const emb = await embedText(`${title ? title + "\n" : ""}${clean}`);
      await setEmbedding("Memory", mem.id, emb);
    } catch {
      // 向量化失败不阻断记忆沉淀
    }
  }

  // 2) 图抽取
  const graph = await extractGraph({ text: clean, contextHint: input.contextHint });
  if (graph.entities.length === 0) {
    return { memoryId, entityCount: 0, relationCount: 0 };
  }

  // 本批次内去重合并
  const dedup = new Map<
    string,
    { name: string; normalizedName: string; type: MemoryEntityTypeValue; description: string }
  >();
  for (const e of graph.entities) {
    const normalizedName = normalizeName(e.name);
    if (!normalizedName) continue;
    const type = ENTITY_TYPE_MAP[e.type];
    const key = `${normalizedName}|${type}`;
    const description = e.description.trim();
    const prev = dedup.get(key);
    if (prev) {
      prev.description = chooseDescription(prev.description, description);
    } else {
      dedup.set(key, { name: e.name.trim(), normalizedName, type: e.type, description });
    }
  }
  const entities = [...dedup.values()];

  // 查已有实体（同 normalizedName）
  const existing = await prisma.memoryEntity.findMany({
    where: { projectId, normalizedName: { in: entities.map((e) => e.normalizedName) } },
  });
  const existingByKey = new Map(
    existing.map((x) => [`${x.normalizedName}|${x.type.toLowerCase()}`, x])
  );

  // 计算最终描述与待向量化文本
  const prepared = entities.map((e) => {
    const ex = existingByKey.get(`${e.normalizedName}|${e.type}`);
    const finalDesc = chooseDescription(ex?.description ?? null, e.description);
    return { ...e, finalDesc, existingId: ex?.id };
  });

  let embeddings: number[][] = [];
  try {
    embeddings = await embedTexts(
      prepared.map((e) => `${e.name}（${e.type}）：${e.finalDesc}`)
    );
  } catch {
    embeddings = prepared.map(() => []);
  }

  // 3) 写实体
  const nameToId = new Map<string, string>();
  const affected = new Set<string>();
  for (let i = 0; i < prepared.length; i++) {
    const e = prepared[i];
    const prismaType = ENTITY_TYPE_MAP[e.type];
    let id: string;
    if (e.existingId) {
      const updated = await prisma.memoryEntity.update({
        where: { id: e.existingId },
        data: { name: e.name, description: e.finalDesc, mentionCount: { increment: 1 } },
      });
      id = updated.id;
    } else {
      const created = await prisma.memoryEntity.create({
        data: {
          projectId,
          type: prismaType,
          name: e.name,
          normalizedName: e.normalizedName,
          description: e.finalDesc,
          mentionCount: 1,
        },
      });
      id = created.id;
    }
    nameToId.set(e.normalizedName, id);
    affected.add(id);
    try {
      await setEmbedding("MemoryEntity", id, embeddings[i] ?? []);
    } catch {
      // 忽略单实体向量写入失败
    }
  }

  // 4) 写关系
  let relationCount = 0;
  for (const r of graph.relations) {
    const sId = await resolveEntityId(projectId, r.source, nameToId);
    const tId = await resolveEntityId(projectId, r.target, nameToId);
    if (!sId || !tId || sId === tId) continue;
    const type = (r.type?.trim() || "相关").slice(0, 40);
    const weight = clampWeight(r.weight);
    const description = r.description?.trim() || null;
    try {
      await prisma.memoryRelation.upsert({
        where: {
          projectId_sourceEntityId_targetEntityId_type: {
            projectId,
            sourceEntityId: sId,
            targetEntityId: tId,
            type,
          },
        },
        update: {
          weight: { increment: weight },
          description: description ?? undefined,
        },
        create: {
          projectId,
          sourceEntityId: sId,
          targetEntityId: tId,
          type,
          description,
          weight,
          originType,
          originId: originId ?? null,
        },
      });
      relationCount++;
      affected.add(sId);
      affected.add(tId);
    } catch {
      // 忽略单条关系写入失败（如并发冲突）
    }
  }

  // 5) 重算 degree / importance
  for (const id of affected) {
    const degree = await prisma.memoryRelation.count({
      where: { projectId, OR: [{ sourceEntityId: id }, { targetEntityId: id }] },
    });
    const ent = await prisma.memoryEntity.findUnique({
      where: { id },
      select: { mentionCount: true },
    });
    const mention = ent?.mentionCount ?? 1;
    const importance = round3(
      Math.log2(1 + degree) * 0.6 + Math.log2(1 + mention) * 0.4
    );
    await prisma.memoryEntity.update({
      where: { id },
      data: { degree, importanceScore: importance },
    });
  }

  return { memoryId, entityCount: entities.length, relationCount };
}

/** 把关系端点名称解析为实体 id：先查本批次，再退查项目内已有同名实体。 */
async function resolveEntityId(
  projectId: string,
  rawName: string,
  nameToId: Map<string, string>
): Promise<string | null> {
  const norm = normalizeName(rawName);
  if (!norm) return null;
  const inBatch = nameToId.get(norm);
  if (inBatch) return inBatch;
  const found = await prisma.memoryEntity.findFirst({
    where: { projectId, normalizedName: norm },
    select: { id: true },
  });
  if (found) {
    nameToId.set(norm, found.id);
    return found.id;
  }
  return null;
}
