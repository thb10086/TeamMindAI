"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Rocket,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  breakdownRequirement,
  confirmRequirement,
  getJobStatus,
  markRequirementOnline,
} from "./actions";

export function RequirementActions({
  requirementId,
  projectId,
  hasTasks,
  canConfirm,
  canMarkOnline,
  breakdownJobId,
}: {
  requirementId: string;
  projectId: string;
  hasTasks: boolean;
  canConfirm: boolean;
  canMarkOnline: boolean;
  breakdownJobId?: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [onlining, setOnlining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 进入页面时若已有进行中的拆解作业，自动恢复轮询（作业在后台跑，刷新/离开不影响）。
  useEffect(() => {
    if (breakdownJobId) pollBreakdown(breakdownJobId);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdownJobId]);

  // 轮询后台拆解作业状态；完成后 router.refresh 拉取新任务。
  function pollBreakdown(jobId: string) {
    setLoading(true);
    const tick = async () => {
      const s = await getJobStatus(jobId);
      if (s.error) {
        setError(s.error);
        setLoading(false);
        return;
      }
      if (s.status === "SUCCEEDED") {
        setLoading(false);
        router.refresh();
        return;
      }
      if (s.status === "FAILED") {
        setError(s.jobError ?? "AI 任务拆解失败，请重试。");
        setLoading(false);
        return;
      }
      pollTimer.current = setTimeout(tick, 2000);
    };
    pollTimer.current = setTimeout(tick, 1500);
  }

  async function runBreakdown() {
    setLoading(true);
    setError(null);
    const res = await breakdownRequirement(requirementId);
    if (res.error || !res.jobId) {
      setError(res.error ?? "启动失败，请重试。");
      setLoading(false);
      return;
    }
    pollBreakdown(res.jobId);
  }

  async function runConfirm() {
    setConfirming(true);
    setError(null);
    const res = await confirmRequirement(requirementId);
    if (res.error) {
      setError(res.error);
      setConfirming(false);
      return;
    }
    router.refresh();
    setConfirming(false);
  }

  async function runMarkOnline() {
    setOnlining(true);
    setError(null);
    const res = await markRequirementOnline(requirementId);
    if (res.error) {
      setError(res.error);
      setOnlining(false);
      return;
    }
    router.refresh();
    setOnlining(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href={`/align?project=${projectId}`}>
            <Sparkles className="size-4" /> 继续澄清
          </Link>
        </Button>
        {canConfirm && (
          <Button onClick={runConfirm} disabled={confirming} variant="outline">
            {confirming ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            {confirming ? "确认中…" : "确认需求（评审通过）"}
          </Button>
        )}
        {canMarkOnline && (
          <Button onClick={runMarkOnline} disabled={onlining} variant="outline">
            {onlining ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Rocket className="size-4" />
            )}
            {onlining ? "上线中…" : "标记已上线"}
          </Button>
        )}
        {hasTasks ? (
          <Button asChild>
            <Link href={`/kanban?project=${projectId}`}>
              查看任务看板 <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : (
          <Button onClick={runBreakdown} disabled={loading}>
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {loading ? "AI 拆解中（后台）…" : "AI 任务拆解"}
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
