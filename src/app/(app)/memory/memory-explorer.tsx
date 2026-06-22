"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Brain,
  Sparkles,
  Network,
  Layers,
  Boxes,
  Loader2,
  ArrowRight,
  List,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown";
import {
  MEMORY_ENTITY_TYPE_LABEL,
  memoryEntityTypeClass,
} from "@/lib/labels";
import { askProjectMemory, type AskMemoryResult } from "./actions";
import { MemoryGraphCanvas } from "./memory-graph-canvas";

export interface MemoryEntityVM {
  id: string;
  type: string;
  name: string;
  description: string | null;
  importanceScore: number;
  degree: number;
  mentionCount: number;
  communityId: string | null;
}

export interface MemoryRelationVM {
  id: string;
  type: string;
  description: string | null;
  weight: number;
  sourceId: string;
  sourceName: string;
  sourceType: string;
  targetId: string;
  targetName: string;
  targetType: string;
}

export interface MemoryCommunityVM {
  id: string;
  level: number;
  title: string;
  summary: string;
  importanceScore: number;
  entityCount: number;
}

function typeBadge(type: string) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[11px] font-medium",
        memoryEntityTypeClass(type)
      )}
    >
      {MEMORY_ENTITY_TYPE_LABEL[type] ?? type}
    </span>
  );
}

export function MemoryGraphView({
  projectId,
  entities,
  relations,
  communities,
}: {
  projectId: string;
  entities: MemoryEntityVM[];
  relations: MemoryRelationVM[];
  communities: MemoryCommunityVM[];
}) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<AskMemoryResult | null>(null);
  const [showCtx, setShowCtx] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("");
  // 默认「列表」优先：列表更适合快速浏览实体/关系/社区，知识图谱按需切换。
  const [view, setView] = useState<"graph" | "list">("list");

  const presentTypes = useMemo(
    () => Array.from(new Set(entities.map((e) => e.type))),
    [entities]
  );
  const filteredEntities = typeFilter
    ? entities.filter((e) => e.type === typeFilter)
    : entities;

  const graphEntities = useMemo(
    () =>
      entities.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        importanceScore: e.importanceScore,
        degree: e.degree,
      })),
    [entities]
  );
  const graphRelations = useMemo(
    () =>
      relations.map((r) => ({
        id: r.id,
        sourceId: r.sourceId,
        targetId: r.targetId,
        type: r.type,
        weight: r.weight,
      })),
    [relations]
  );

  function onAsk() {
    if (!query.trim() || pending) return;
    setShowCtx(false);
    startTransition(async () => {
      const r = await askProjectMemory(projectId, query.trim());
      setResult(r);
    });
  }

  const isEmpty = entities.length === 0 && communities.length === 0;

  if (isEmpty) {
    return (
      <div className="rounded-xl border bg-card py-16 text-center text-muted-foreground">
        该项目暂无记忆。到「AI 对齐室」澄清需求或在需求页执行
        <span className="mx-1 font-medium text-foreground">AI 任务拆解</span>
        后会自动沉淀。
        <div className="mt-2 text-xs">
          提示：记忆入库走后台 worker，请确保已运行
          <code className="mx-1 rounded bg-muted px-1.5 py-0.5">
            npm run worker
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
          {/* 统计 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={Boxes} label="实体" value={entities.length} />
            <StatCard icon={Network} label="关系" value={relations.length} />
            <StatCard icon={Layers} label="社区" value={communities.length} />
            <StatCard
              icon={Brain}
              label="高价值实体"
              value={entities.filter((e) => e.importanceScore >= 0.6).length}
            />
          </div>

          {/* 问 AI（基于项目记忆） */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-primary" />
              问 AI（基于项目记忆）
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              不清楚业务细节？直接问。AI 产品经理会严格基于本项目已沉淀的记忆作答，不编造。
            </p>
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="例如：这个项目要解决什么问题？XX 需求的验收标准是什么？谁负责验收？"
              className="mt-3 min-h-20"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onAsk();
              }}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {result?.counts
                  ? `依据 ${result.counts.entities} 实体 · ${result.counts.relations} 关系 · ${result.counts.facts} 事实 · ${result.counts.communities} 社区`
                  : "⌘/Ctrl + Enter 快速提问"}
              </span>
              <Button onClick={onAsk} disabled={pending || !query.trim()}>
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    思考中…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    问 AI
                  </>
                )}
              </Button>
            </div>
            {result?.error && (
              <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {result.error}
              </div>
            )}
            {result && !result.error && (
              <div className="mt-3 space-y-2">
                <div className="rounded-lg border bg-muted/30 p-3">
                  {result.answer ? (
                    <Markdown content={result.answer} />
                  ) : (
                    <p className="text-sm text-muted-foreground">未生成回答。</p>
                  )}
                </div>
                {result.contextText && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowCtx((v) => !v)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {showCtx ? "收起" : "查看"} AI 作答所依据的记忆上下文
                    </button>
                    {showCtx && (
                      <div className="mt-2 rounded-lg border bg-background p-3">
                        <Markdown content={result.contextText} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 探索区：知识图谱 / 列表 切换 */}
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Brain className="size-4" />
              记忆探索
            </h2>
            <div className="inline-flex rounded-lg border p-0.5">
              <ViewToggle
                active={view === "graph"}
                onClick={() => setView("graph")}
                icon={Network}
              >
                知识图谱
              </ViewToggle>
              <ViewToggle
                active={view === "list"}
                onClick={() => setView("list")}
                icon={List}
              >
                列表
              </ViewToggle>
            </div>
          </div>

          {view === "graph" ? (
            <MemoryGraphCanvas
              entities={graphEntities}
              relations={graphRelations}
            />
          ) : (
            <>
          {/* 社区摘要 */}
          {communities.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Layers className="size-4" />
                主题社区（{communities.length}）
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {communities.map((c) => (
                  <div key={c.id} className="rounded-xl border bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold">{c.title}</h3>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {c.entityCount} 实体
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {c.summary}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 实体 */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Boxes className="size-4" />
                实体（{filteredEntities.length}/{entities.length}）
              </h2>
              <div className="flex flex-wrap items-center gap-1.5">
                <FilterChip
                  active={typeFilter === ""}
                  onClick={() => setTypeFilter("")}
                >
                  全部
                </FilterChip>
                {presentTypes.map((t) => (
                  <FilterChip
                    key={t}
                    active={typeFilter === t}
                    onClick={() => setTypeFilter(t)}
                  >
                    {MEMORY_ENTITY_TYPE_LABEL[t] ?? t}
                  </FilterChip>
                ))}
              </div>
            </div>
            <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-3">
              {filteredEntities.map((e) => (
                <div
                  key={e.id}
                  className="rounded-lg border bg-card p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium leading-snug">
                      {e.name}
                    </span>
                    {typeBadge(e.type)}
                  </div>
                  {e.description && (
                    <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                      {e.description}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span title="重要性">
                      重要性 {Math.round(clamp01(e.importanceScore) * 100)}%
                    </span>
                    <span title="连接度">连接 {e.degree}</span>
                    <span title="提及次数">提及 {e.mentionCount}</span>
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${clamp01(e.importanceScore) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 关系 */}
          {relations.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Network className="size-4" />
                关系网络（{relations.length}）
              </h2>
              <div className="divide-y rounded-xl border bg-card">
                {relations.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-sm"
                  >
                    <span className="font-medium">{r.sourceName}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <ArrowRight className="size-3.5" />
                      <span className="rounded bg-muted px-1.5 py-0.5">
                        {r.type}
                      </span>
                      <ArrowRight className="size-3.5" />
                    </span>
                    <span className="font-medium">{r.targetName}</span>
                    {r.description && (
                      <span className="w-full text-xs text-muted-foreground">
                        {r.description}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
            </>
          )}
    </div>
  );
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function ViewToggle({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Brain;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}
