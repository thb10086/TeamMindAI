"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
} from "d3-force";
import { RotateCcw } from "lucide-react";

import { MEMORY_ENTITY_TYPE_LABEL } from "@/lib/labels";

export interface GraphEntity {
  id: string;
  name: string;
  type: string;
  importanceScore: number;
  degree: number;
}
export interface GraphRelation {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  weight: number;
}

interface NodeDatum {
  id: string;
  name: string;
  type: string;
  importance: number;
  degree: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}
interface LinkDatum {
  source: string | NodeDatum;
  target: string | NodeDatum;
  type: string;
  weight: number;
}

/** 实体类型 → 配色（与 labels.ts 的语义保持一致）。 */
const TYPE_COLOR: Record<string, string> = {
  PERSON: "#8b5cf6",
  REQUIREMENT: "#f59e0b",
  TASK: "#3b82f6",
  DECISION: "#10b981",
  FEATURE: "#0ea5e9",
  MODULE: "#6366f1",
  TECH: "#6366f1",
  RISK: "#ef4444",
  RULE: "#14b8a6",
  CUSTOMER: "#f43f5e",
  METRIC: "#06b6d4",
  MEETING: "#d946ef",
  OTHER: "#94a3b8",
};
function colorFor(type: string): string {
  return TYPE_COLOR[type] ?? TYPE_COLOR.OTHER;
}
function radiusFor(d: { degree: number; importance: number }): number {
  return 8 + Math.sqrt(d.degree) * 2.4 + d.importance * 8;
}
function asNode(x: string | NodeDatum): NodeDatum {
  return x as NodeDatum;
}

/**
 * 力导向知识图谱（d3-force 计算 + SVG 渲染）。
 * 交互：滚轮缩放、拖拽节点、空白处平移、悬停/点击高亮关联（其余淡出）。
 */
export function MemoryGraphCanvas({
  entities,
  relations,
}: {
  entities: GraphEntity[];
  relations: GraphRelation[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodesRef = useRef<NodeDatum[]>([]);
  const linksRef = useRef<LinkDatum[]>([]);
  const simRef = useRef<Simulation<NodeDatum, LinkDatum> | null>(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const dragRef = useRef<{ id: string } | null>(null);
  const panRef = useRef<boolean>(false);

  const [size, setSize] = useState({ w: 800, h: 520 });
  const [, setTick] = useState(0);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const dataSig = useMemo(
    () =>
      entities.map((e) => e.id).join(",") +
      "|" +
      relations.map((r) => r.id).join(","),
    [entities, relations]
  );

  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const add = (a: string, b: string) => {
      let s = m.get(a);
      if (!s) {
        s = new Set();
        m.set(a, s);
      }
      s.add(b);
    };
    for (const r of relations) {
      add(r.sourceId, r.targetId);
      add(r.targetId, r.sourceId);
    }
    return m;
  }, [relations]);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  // 容器尺寸自适应
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setSize({ w, h: Math.max(440, Math.min(640, Math.round(w * 0.6))) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 数据变化 → 重建力学模拟
  useEffect(() => {
    const valid = new Set(entities.map((e) => e.id));
    const nodes: NodeDatum[] = entities.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      importance: e.importanceScore,
      degree: e.degree,
    }));
    const links: LinkDatum[] = relations
      .filter((r) => valid.has(r.sourceId) && valid.has(r.targetId))
      .map((r) => ({
        source: r.sourceId,
        target: r.targetId,
        type: r.type,
        weight: r.weight,
      }));
    nodesRef.current = nodes;
    linksRef.current = links;

    const sim = forceSimulation<NodeDatum, LinkDatum>(nodes)
      .force(
        "link",
        forceLink<NodeDatum, LinkDatum>(links)
          .id((d) => d.id)
          .distance(92)
          .strength((l) => 0.08 + Math.min(0.3, (l.weight ?? 0.5) * 0.15))
      )
      .force("charge", forceManyBody<NodeDatum>().strength(-240))
      .force("center", forceCenter(size.w / 2, size.h / 2))
      .force(
        "collide",
        forceCollide<NodeDatum>().radius((d) => radiusFor(d) + 6)
      )
      .on("tick", () => setTick((t) => (t + 1) % 1_000_000));
    simRef.current = sim;
    sim.alpha(1).restart();

    return () => {
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSig]);

  // 尺寸变化时仅更新居中力，不重建
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.force("center", forceCenter(size.w / 2, size.h / 2));
    sim.alpha(0.3).restart();
  }, [size.w, size.h]);

  // 滚轮缩放（原生非被动监听，避免 preventDefault 警告）
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const t = transformRef.current;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const k = Math.max(0.3, Math.min(3, t.k * factor));
      const rect = svg.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const nx = px - ((px - t.x) * k) / t.k;
      const ny = py - ((py - t.y) * k) / t.k;
      setTransform({ x: nx, y: ny, k });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  function clientToGraph(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    const t = transformRef.current;
    const sx = clientX - (rect?.left ?? 0);
    const sy = clientY - (rect?.top ?? 0);
    return { x: (sx - t.x) / t.k, y: (sy - t.y) / t.k };
  }

  function onNodePointerDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { id };
    setSelected(id);
    simRef.current?.alphaTarget(0.3).restart();
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragRef.current) {
      const n = nodesRef.current.find((x) => x.id === dragRef.current!.id);
      if (n) {
        const p = clientToGraph(e.clientX, e.clientY);
        n.fx = p.x;
        n.fy = p.y;
      }
    } else if (panRef.current) {
      setTransform((t) => ({
        ...t,
        x: t.x + (e.movementX || 0),
        y: t.y + (e.movementY || 0),
      }));
    }
  }

  function endInteraction() {
    if (dragRef.current) {
      const n = nodesRef.current.find((x) => x.id === dragRef.current!.id);
      if (n) {
        n.fx = null;
        n.fy = null;
      }
      simRef.current?.alphaTarget(0);
      dragRef.current = null;
    }
    panRef.current = false;
  }

  function onBgPointerDown() {
    panRef.current = true;
    setSelected(null);
  }

  function reset() {
    setTransform({ x: 0, y: 0, k: 1 });
    simRef.current?.alpha(0.6).restart();
  }

  const focus = hovered ?? selected;
  const neighbors = focus ? adjacency.get(focus) ?? null : null;
  const presentTypes = useMemo(
    () => Array.from(new Set(entities.map((e) => e.type))),
    [entities]
  );

  if (entities.length === 0) {
    return (
      <div className="rounded-xl border bg-card py-16 text-center text-sm text-muted-foreground">
        暂无可绘制的实体。继续在 AI 对齐室澄清需求、拆解任务后，知识图谱会逐渐成形。
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-xl border bg-card"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 0%, rgba(99,102,241,0.07), transparent 60%)",
        }}
      >
        <svg
          ref={svgRef}
          width={size.w}
          height={size.h}
          className="block w-full cursor-grab touch-none select-none active:cursor-grabbing"
          onPointerDown={onBgPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endInteraction}
          onPointerLeave={endInteraction}
        >
          <g
            transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}
          >
            {linksRef.current.map((l, i) => {
              const s = asNode(l.source);
              const t = asNode(l.target);
              if (s.x == null || t.x == null) return null;
              const active =
                !focus ||
                s.id === focus ||
                t.id === focus ||
                !!(neighbors && (neighbors.has(s.id) || neighbors.has(t.id)));
              return (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke="currentColor"
                  className={active ? "text-border" : "text-border/20"}
                  strokeWidth={Math.max(1, Math.min(3, l.weight))}
                />
              );
            })}
            {nodesRef.current.map((n) => {
              if (n.x == null) return null;
              const r = radiusFor(n);
              const isFocus = focus === n.id;
              const dim =
                !!focus && !isFocus && !(neighbors && neighbors.has(n.id));
              const showLabel = isFocus || n.importance >= 0.5 || r >= 16;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  className={dim ? "opacity-20" : "opacity-100"}
                  style={{ transition: "opacity 120ms" }}
                  onPointerDown={(e) => onNodePointerDown(e, n.id)}
                  onPointerEnter={() => setHovered(n.id)}
                  onPointerLeave={() => setHovered(null)}
                >
                  <circle
                    r={r}
                    fill={colorFor(n.type)}
                    stroke="white"
                    strokeWidth={isFocus ? 3 : 1.5}
                    className="cursor-pointer drop-shadow"
                  />
                  {showLabel && (
                    <text
                      y={r + 11}
                      textAnchor="middle"
                      className="pointer-events-none fill-foreground text-[10px] font-medium"
                    >
                      {n.name.length > 12 ? n.name.slice(0, 12) + "…" : n.name}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        <button
          type="button"
          onClick={reset}
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border bg-background/80 px-2 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur hover:text-foreground"
        >
          <RotateCcw className="size-3.5" /> 重置视图
        </button>
        <div className="pointer-events-none absolute bottom-2 left-2 text-[11px] text-muted-foreground">
          滚轮缩放 · 拖拽节点 · 空白处平移 · 悬停高亮关联
        </div>
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {presentTypes.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
          >
            <span
              className="size-2.5 rounded-full"
              style={{ background: colorFor(t) }}
            />
            {MEMORY_ENTITY_TYPE_LABEL[t] ?? t}
          </span>
        ))}
      </div>
    </div>
  );
}
