"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Layers, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  DESIGN_STATUS_LABEL,
  designStatusClass,
  REQUIREMENT_STATUS_LABEL,
} from "@/lib/labels";
import { createDesignForRequirement } from "../../design/actions";

export interface ProjectDesignVM {
  id: string;
  title: string;
  status: string;
  version: number;
  screenCount: number;
  requirementId: string | null;
  requirementTitle: string | null;
  assigneeName: string | null;
  updatedAt: string;
}

export interface DesignableReqVM {
  id: string;
  title: string;
  status: string;
}

export function ProjectDesignsPanel({
  designs,
  requirements,
}: {
  designs: ProjectDesignVM[];
  requirements: DesignableReqVM[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reqId, setReqId] = useState<string>(requirements[0]?.id ?? "");
  const [filter, setFilter] = useState<string>("");

  // 按需求分组（保留 updatedAt 降序），未关联需求归入单独分组。
  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        title: string;
        reqId: string | null;
        items: ProjectDesignVM[];
      }
    >();
    for (const d of designs) {
      const key = d.requirementId ?? "__none__";
      if (!map.has(key)) {
        map.set(key, {
          key,
          title: d.requirementTitle ?? "未关联需求",
          reqId: d.requirementId,
          items: [],
        });
      }
      map.get(key)!.items.push(d);
    }
    return Array.from(map.values());
  }, [designs]);
  const visibleGroups = filter
    ? groups.filter((g) => g.key === filter)
    : groups;

  function start() {
    if (!reqId) return;
    setError(null);
    startTransition(async () => {
      const res = await createDesignForRequirement(reqId);
      if (res.error) setError(res.error);
      else if (res.designId) router.push(`/design/${res.designId}`);
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 py-5">
          <div className="flex items-center gap-2">
            <Sparkles className="text-muted-foreground size-4" />
            <h3 className="font-medium">从需求发起界面设计</h3>
          </div>
          <p className="text-muted-foreground text-sm">
            选择一个需求，AI 产品设计师会规划信息架构并生成可点击的低保真界面原型。
          </p>
          {requirements.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              该项目还没有需求，先去 AI 对齐室生成需求卡片。
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={reqId}
                onChange={(e) => setReqId(e.target.value)}
                className="bg-background h-9 min-w-[260px] rounded-md border px-3 text-sm"
              >
                {requirements.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}（{REQUIREMENT_STATUS_LABEL[r.status] ?? r.status}）
                  </option>
                ))}
              </select>
              <Button onClick={start} disabled={pending || !reqId} size="sm">
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                发起界面设计
              </Button>
            </div>
          )}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </CardContent>
      </Card>

      {designs.length === 0 ? (
        <p className="text-muted-foreground text-sm">还没有界面设计。</p>
      ) : (
        <div className="space-y-5">
          {/* 按需求筛选 */}
          {groups.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip active={filter === ""} onClick={() => setFilter("")}>
                全部（{designs.length}）
              </FilterChip>
              {groups.map((g) => (
                <FilterChip
                  key={g.key}
                  active={filter === g.key}
                  onClick={() => setFilter(g.key)}
                >
                  {g.title}（{g.items.length}）
                </FilterChip>
              ))}
            </div>
          ) : null}

          {/* 按需求分组展示 */}
          {visibleGroups.map((g) => (
            <section key={g.key} className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Layers className="text-muted-foreground size-4 shrink-0" />
                {g.reqId ? (
                  <Link
                    href={`/requirement/${g.reqId}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {g.title}
                  </Link>
                ) : (
                  <span className="text-sm font-medium">{g.title}</span>
                )}
                <span className="text-muted-foreground text-xs">
                  {g.items.length} 个设计
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {g.items.map((d) => (
                  <DesignCard key={d.id} design={d} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** 单个设计稿卡片（需求已在分组标题展示，卡片内不重复）。 */
function DesignCard({ design: d }: { design: ProjectDesignVM }) {
  return (
    <Link href={`/design/${d.id}`} className="group">
      <Card className="group-hover:border-primary/40 h-full gap-2 py-4 transition-colors">
        <CardContent className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-1.5 font-medium">
              <Layers className="text-muted-foreground size-4 shrink-0" />
              <span className="line-clamp-1">{d.title}</span>
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-xs",
                designStatusClass(d.status)
              )}
            >
              {DESIGN_STATUS_LABEL[d.status] ?? d.status}
            </span>
          </div>
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <span>{d.screenCount} 个界面</span>
            <span>·</span>
            <span>v{d.version}</span>
          </div>
          <div className="text-primary inline-flex items-center gap-1 text-xs opacity-0 transition-opacity group-hover:opacity-100">
            打开画布 <ArrowRight className="size-3" />
          </div>
        </CardContent>
      </Card>
    </Link>
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
