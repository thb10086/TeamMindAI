"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  Loader2,
  Monitor,
  MousePointerClick,
  RefreshCw,
  Smartphone,
  Sparkles,
  Tablet,
  Wand2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { DESIGN_STATUS_LABEL, designStatusClass } from "@/lib/labels";
import {
  refineDesignScreen,
  startDesignGeneration,
  pollDesignGeneration,
} from "../actions";

export interface DesignScreenVM {
  id: string;
  name: string;
  screenKey: string;
  purpose: string | null;
  html: string;
}

export interface DesignVM {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  version: number;
  projectName: string;
  requirementId: string | null;
  requirementTitle: string | null;
  assigneeName: string | null;
  activeJobId: string | null;
  screens: DesignScreenVM[];
}

type ScreenStatus = "pending" | "generating" | "done";

interface ScreenState {
  id: string;
  name: string;
  screenKey: string;
  purpose: string | null;
  html: string;
  status: ScreenStatus;
}

type Phase = "idle" | "planning" | "generating";

function toState(s: DesignScreenVM): ScreenState {
  return {
    id: s.id,
    name: s.name,
    screenKey: s.screenKey,
    purpose: s.purpose,
    html: s.html,
    status: s.html ? "done" : "pending",
  };
}

/** 把界面 HTML 片段包成完整文档：注入 Tailwind CDN + 跨屏点击桥接。 */
function buildSrcDoc(html: string): string {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-white text-neutral-900 antialiased">${html}<script>document.addEventListener("click",function(e){var t=e.target.closest("[data-goto]");if(t){e.preventDefault();parent.postMessage({type:"design-goto",key:t.getAttribute("data-goto")},"*")}});</script></body></html>`;
}

/** 设备预览预设：宽度模拟手机/平板/桌面访问（width=null 表示满宽）。 */
const DEVICES = [
  { key: "mobile", label: "手机", icon: Smartphone, width: 390, height: 760 },
  { key: "tablet", label: "平板", icon: Tablet, width: 834, height: 720 },
  { key: "desktop", label: "桌面", icon: Monitor, width: null, height: 680 },
] as const;
type DeviceKey = (typeof DEVICES)[number]["key"];

export function DesignCanvas({ design }: { design: DesignVM }) {
  const router = useRouter();
  // 本地以屏数组为准，生成过程中逐屏更新（mount 时由服务端数据初始化）。
  const [screens, setScreens] = useState<ScreenState[]>(() =>
    design.screens.map(toState)
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    design.screens[0]?.screenKey ?? null
  );
  const [deviceKey, setDeviceKey] = useState<DeviceKey>("desktop");
  const device = DEVICES.find((d) => d.key === deviceKey) ?? DEVICES[2];
  const [feedback, setFeedback] = useState("");
  const [refining, setRefining] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const busy = phase !== "idle";
  const total = screens.length;
  const doneCount = screens.filter((s) => s.status === "done").length;
  const pendingCount = total - doneCount;

  const selected = useMemo(
    () =>
      screens.find((s) => s.screenKey === selectedKey) ?? screens[0] ?? null,
    [screens, selectedKey]
  );
  const srcDoc = useMemo(
    () => (selected?.html ? buildSrcDoc(selected.html) : ""),
    [selected]
  );

  // 跨屏点击桥接：iframe 内点击带 data-goto 的元素会 postMessage 到父窗口，这里切换到目标屏。
  const screensRef = useRef(screens);
  screensRef.current = screens;
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data as { type?: string; key?: string } | null;
      if (data?.type === "design-goto" && data.key) {
        if (screensRef.current.some((s) => s.screenKey === data.key)) {
          setSelectedKey(data.key);
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // 进入页面时若有进行中的生成作业，自动恢复轮询（作业在后台跑，刷新/离开不影响）。
  useEffect(() => {
    if (design.activeJobId) {
      setPhase(screens.length === 0 ? "planning" : "generating");
      pollGeneration(design.activeJobId);
    }
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design.activeJobId]);

  async function refineSelected() {
    if (!selected || !feedback.trim() || refining) return;
    setError(null);
    setRefining(true);
    const id = selected.id;
    setScreens((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "generating" } : s))
    );
    const res = await refineDesignScreen(design.id, id, feedback.trim());
    if (res.error) {
      setError(res.error);
      setScreens((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: "done" } : s))
      );
    } else {
      setScreens((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, html: res.html ?? "", status: "done" } : s
        )
      );
      setFeedback("");
    }
    setRefining(false);
  }

  // 轮询后台界面生成作业：增量刷新界面与进度；完成后 router.refresh 同步服务端。
  function pollGeneration(jobId: string) {
    const tick = async () => {
      const res = await pollDesignGeneration(design.id, jobId);
      if (res.error) {
        setError(res.error);
        setPhase("idle");
        return;
      }
      if (res.screens) {
        const list = res.screens;
        setScreens(list.map(toState));
        setSelectedKey((cur) => cur ?? list[0]?.screenKey ?? null);
        setPhase(list.length === 0 ? "planning" : "generating");
      }
      if (res.status === "SUCCEEDED") {
        setPhase("idle");
        router.refresh();
        return;
      }
      if (res.status === "FAILED") {
        setError(res.jobError ?? "AI 界面生成失败，请重试。");
        setPhase("idle");
        return;
      }
      pollTimer.current = setTimeout(tick, 2500);
    };
    pollTimer.current = setTimeout(tick, 1200);
  }

  // 发起后台生成：replan=true 重新规划并替换旧界面；否则生成尚未完成的界面。
  async function startGeneration(replan: boolean) {
    setError(null);
    setPhase(screens.length === 0 || replan ? "planning" : "generating");
    const res = await startDesignGeneration(design.id, replan);
    if (res.error || !res.jobId) {
      setError(res.error ?? "启动失败，请重试。");
      setPhase("idle");
      return;
    }
    pollGeneration(res.jobId);
  }

  const hasScreens = total > 0;

  return (
    <div className="space-y-4">
      {/* 顶栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {design.title}
            </h1>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs",
                designStatusClass(design.status)
              )}
            >
              {DESIGN_STATUS_LABEL[design.status] ?? design.status}
            </span>
            <span className="text-muted-foreground text-xs">
              v{design.version}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            {design.projectName}
            {design.requirementId ? (
              <>
                {" · 需求："}
                <Link
                  href={`/requirement/${design.requirementId}`}
                  className="hover:underline"
                >
                  {design.requirementTitle}
                </Link>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasScreens && !busy ? (
            <div className="bg-muted flex items-center rounded-md p-0.5">
              {DEVICES.map((d) => {
                const Icon = d.icon;
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setDeviceKey(d.key)}
                    className={cn(
                      "flex items-center gap-1 rounded px-2 py-1 text-xs",
                      deviceKey === d.key
                        ? "bg-background shadow-sm"
                        : "text-muted-foreground"
                    )}
                  >
                    <Icon className="size-3.5" /> {d.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          {busy ? (
            <span className="text-muted-foreground inline-flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              {phase === "planning"
                ? "正在规划界面…"
                : `正在生成 ${doneCount}/${total}`}
            </span>
          ) : hasScreens ? (
            <>
              {pendingCount > 0 ? (
                <Button onClick={() => startGeneration(false)} size="sm">
                  <Sparkles className="size-4" /> 继续生成（剩 {pendingCount}）
                </Button>
              ) : null}
              <Button
                onClick={() => startGeneration(true)}
                variant="outline"
                size="sm"
              >
                <RefreshCw className="size-4" /> 重新生成
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* 进度条 */}
      {busy && total > 0 ? (
        <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all"
            style={{ width: `${Math.round((doneCount / total) * 100)}%` }}
          />
        </div>
      ) : null}

      {design.summary ? (
        <p className="text-muted-foreground border-l-2 pl-3 text-sm">
          {design.summary}
        </p>
      ) : null}

      {error ? (
        <p className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      {!hasScreens ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          {phase === "planning" ? (
            <>
              <Loader2 className="text-muted-foreground mx-auto mb-3 size-10 animate-spin" />
              <p className="font-medium">正在规划界面…</p>
            </>
          ) : (
            <>
              <Sparkles className="text-muted-foreground mx-auto mb-3 size-10" />
              <p className="font-medium">还没有界面</p>
              <p className="text-muted-foreground mx-auto mt-1 mb-4 max-w-md text-sm">
                AI 产品设计师会先规划信息架构，再逐屏生成可点击的低保真界面原型，你可实时看到进度。
              </p>
              <Button onClick={() => startGeneration(false)}>
                <Sparkles className="size-4" /> AI 生成界面
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="flex gap-4">
          {/* 左侧屏列表 */}
          <aside className="w-48 shrink-0 space-y-1">
            <p className="text-muted-foreground px-2 pb-1 text-xs font-medium">
              界面（{doneCount}/{total}）
            </p>
            {screens.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedKey(s.screenKey)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  s.screenKey === selected?.screenKey
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-muted"
                )}
              >
                <ScreenBadge index={i + 1} status={s.status} />
                <span className="truncate">{s.name}</span>
              </button>
            ))}
            <p className="text-muted-foreground flex items-center gap-1 px-2 pt-2 text-xs">
              <MousePointerClick className="size-3" /> 点击界面内元素可跳转
            </p>
          </aside>

          {/* 预览区 */}
          <div className="bg-muted/40 flex min-w-0 flex-1 justify-center rounded-xl border p-4">
            {selected ? (
              <div
                className="mx-auto w-full transition-all"
                style={{ maxWidth: device.width ?? undefined }}
              >
                {selected.purpose ? (
                  <p className="text-muted-foreground mb-2 text-center text-xs">
                    {selected.purpose}
                  </p>
                ) : null}
                {selected.html ? (
                  <iframe
                    key={selected.id}
                    title={selected.name}
                    srcDoc={srcDoc}
                    sandbox="allow-scripts"
                    className="w-full rounded-lg border bg-white"
                    style={{ height: device.height }}
                  />
                ) : (
                  <div
                    className="flex w-full flex-col items-center justify-center gap-3 rounded-lg border bg-white text-center"
                    style={{ height: device.height }}
                  >
                    {selected.status === "generating" ? (
                      <>
                        <Loader2 className="text-muted-foreground size-8 animate-spin" />
                        <p className="text-muted-foreground text-sm">
                          正在生成「{selected.name}」…
                        </p>
                      </>
                    ) : (
                      <>
                        <Sparkles className="text-muted-foreground size-8" />
                        <p className="text-muted-foreground text-sm">
                          该界面尚未生成
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* 基于反馈调整当前界面（不偏离需求） */}
      {hasScreens && selected?.html && !busy ? (
        <div className="bg-card rounded-xl border p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Wand2 className="text-primary size-4" />
            调整「{selected.name}」
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            用一句话说明要改什么，AI 会在不偏离已确认需求的前提下重做这一屏。例如「列表改成卡片，顶部加筛选」。
          </p>
          <div className="mt-2 flex gap-2">
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="例如：信息太挤，改成两栏；强调主操作按钮…（⌘/Ctrl+Enter 提交）"
              className="min-h-10 flex-1"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter")
                  refineSelected();
              }}
            />
            <Button
              onClick={refineSelected}
              disabled={refining || !feedback.trim()}
            >
              {refining ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  调整中…
                </>
              ) : (
                <>
                  <Wand2 className="size-4" />
                  调整该界面
                </>
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ScreenBadge({
  index,
  status,
}: {
  index: number;
  status: ScreenStatus;
}) {
  if (status === "generating") {
    return <Loader2 className="text-primary size-5 shrink-0 animate-spin" />;
  }
  if (status === "done") {
    return (
      <span className="bg-primary/15 text-primary flex size-5 shrink-0 items-center justify-center rounded">
        <Check className="size-3.5" />
      </span>
    );
  }
  return (
    <span className="bg-muted text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded text-xs">
      {index}
    </span>
  );
}
