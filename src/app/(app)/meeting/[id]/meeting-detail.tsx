"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  AudioLines,
  BellRing,
  CalendarClock,
  CheckCircle2,
  FilePlus2,
  Gavel,
  ListChecks,
  Download,
  Loader2,
  Mic,
  Pencil,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  createDecisionsFromMeeting,
  createRequirementsFromMeeting,
  createTasksFromMeeting,
  deleteMeeting,
  notifyProjectOfMeeting,
  pollMeeting,
  reprocessMeeting,
  regenerateSummaryImage,
  updateMeetingSummary,
  type MeetingExtraction,
} from "../actions";

export interface TranscriptTurnVM {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

export interface SpeakerVM {
  label: string;
  name: string;
}

export interface MeetingDetailVM {
  id: string;
  title: string;
  status: "DRAFT" | "TRANSCRIBING" | "PROCESSING" | "READY" | "FAILED";
  sourceType: "TEXT" | "AUDIO";
  projectId: string;
  projectName: string;
  participants: string | null;
  meetingTime: string | null;
  createdAt: string;
  rawContent: string;
  summary: string | null;
  extraction: MeetingExtraction | null;
  /** 详情页主图（汇总图）是否已就绪 */
  hasSummaryImage: boolean;
  hasAudio: boolean;
  audioName: string | null;
  durationSec: number | null;
  transcriptTurns: TranscriptTurnVM[];
  speakers: SpeakerVM[];
  activeJobId: string | null;
  canManage: boolean;
  canLead: boolean;
}

const PRIO: Record<string, string> = {
  P0: "bg-red-100 text-red-700",
  P1: "bg-orange-100 text-orange-700",
  P2: "bg-blue-100 text-blue-700",
  P3: "bg-neutral-100 text-neutral-600",
};

// 给说话人分配稳定的高亮配色（按出场顺序循环）。
const SPEAKER_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

function fmtTime(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function fmtDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "";
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`;
}

export function MeetingDetail({ vm }: { vm: MeetingDetailVM }) {
  const router = useRouter();

  const [status, setStatus] = useState(vm.status);
  const [summary, setSummary] = useState(vm.summary);
  const [extraction, setExtraction] = useState(vm.extraction);
  const [hasSummaryImage, setHasSummaryImage] = useState(vm.hasSummaryImage);
  // 用 ts 戳绕开 <img> 缓存；初始值必须与 SSR 一致（用 0），否则触发 hydration mismatch。
  const [summaryImgTs, setSummaryImgTs] = useState<number>(0);
  const [progress, setProgress] = useState<{ completed: number; total: number }>({
    completed: 0,
    total: vm.sourceType === "AUDIO" ? 2 : 1,
  });
  const [jobError, setJobError] = useState<string | null>(null);

  const [taskMsg, setTaskMsg] = useState<string | null>(null);
  const [creatingTasks, setCreatingTasks] = useState(false);
  const [linking, setLinking] = useState<
    null | "decisions" | "requirements" | "notify"
  >(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [regeneratingImg, setRegeneratingImg] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [savingSummary, setSavingSummary] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 进入页面/重新处理时轮询作业进度，并增量刷新纪要、抽取与封面图。
  function startPolling(jobId?: string) {
    const tick = async () => {
      const res = await pollMeeting(vm.id, jobId);
      if (res.error) {
        setJobError(res.error);
        return;
      }
      if (res.summary !== undefined) setSummary(res.summary);
      if (res.extraction !== undefined) setExtraction(res.extraction);
      if (typeof res.completed === "number" && typeof res.total === "number") {
        setProgress({ completed: res.completed, total: res.total || 1 });
      }
      if (res.hasSummaryImage) {
        setHasSummaryImage((prev) => {
          if (!prev) setSummaryImgTs(Date.now());
          return true;
        });
      }
      if (res.meetingStatus) setStatus(res.meetingStatus);

      const imagesPending = !res.hasSummaryImage;

      if (res.meetingStatus === "FAILED" || res.jobStatus === "FAILED") {
        setJobError(res.jobError ?? "处理失败，请重试。");
        return;
      }
      if (res.meetingStatus === "READY" && !imagesPending) {
        return; // 纪要与所有配图均完成，停止轮询
      }
      // 纪要 READY 但配图尚未全部就绪 → 拉长间隔轮询（节省服务器压力）。
      const delay = res.meetingStatus === "READY" ? 4000 : 2500;
      pollTimer.current = setTimeout(tick, delay);
    };
    pollTimer.current = setTimeout(tick, 1200);
  }

  useEffect(() => {
    const imagesPending = !vm.hasSummaryImage;
    if (
      vm.status === "PROCESSING" ||
      vm.status === "TRANSCRIBING" ||
      (vm.status === "DRAFT" && vm.activeJobId) ||
      (vm.status === "READY" && imagesPending)
    ) {
      startPolling(vm.activeJobId ?? undefined);
    }
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vm.activeJobId, vm.status]);

  async function runReprocess() {
    setReprocessing(true);
    setActionError(null);
    setJobError(null);
    const res = await reprocessMeeting(vm.id);
    if (res.error || !res.jobId) {
      setActionError(res.error ?? "启动失败，请重试。");
      setReprocessing(false);
      return;
    }
    setStatus("PROCESSING");
    setProgress({ completed: 0, total: vm.sourceType === "AUDIO" ? 2 : 1 });
    // 重新处理：清空旧图状态，避免旧图老赖在页面上。
    setHasSummaryImage(false);
    setReprocessing(false);
    startPolling(res.jobId);
  }

  async function runCreateTasks() {
    setCreatingTasks(true);
    setActionError(null);
    setTaskMsg(null);
    const res = await createTasksFromMeeting(vm.id);
    if (res.error) {
      setActionError(res.error);
      setCreatingTasks(false);
      return;
    }
    setTaskMsg(`已生成 ${res.count} 个任务到看板（草案，待分配）。`);
    setCreatingTasks(false);
  }

  async function runLink(kind: "decisions" | "requirements" | "notify") {
    setLinking(kind);
    setActionError(null);
    setTaskMsg(null);
    const fn =
      kind === "decisions"
        ? createDecisionsFromMeeting
        : kind === "requirements"
          ? createRequirementsFromMeeting
          : notifyProjectOfMeeting;
    const res = await fn(vm.id);
    if (res.error) {
      setActionError(res.error);
      setLinking(null);
      return;
    }
    setTaskMsg(
      kind === "decisions"
        ? `已归档 ${res.count} 条决策到项目决策记录。`
        : kind === "requirements"
          ? `已生成 ${res.count} 条需求草案（来源：本次会议）。`
          : `已向 ${res.count} 名项目成员发送站内通知。`
    );
    setLinking(null);
  }

  async function runDelete() {
    setDeleting(true);
    const res = await deleteMeeting(vm.id);
    if (res.error) {
      setActionError(res.error);
      setDeleting(false);
      setDelOpen(false);
      return;
    }
    router.push("/meeting");
  }

  const processing = status === "PROCESSING" || status === "TRANSCRIBING";
  const todos = extraction?.todos ?? [];
  const decisions = extraction?.decisions ?? [];
  const reqChanges = extraction?.requirementChanges ?? [];

  const speakerColor = useMemo(() => {
    const order: string[] = [];
    for (const t of vm.transcriptTurns) {
      if (!order.includes(t.speaker)) order.push(t.speaker);
    }
    const map = new Map<string, string>();
    order.forEach((sp, i) =>
      map.set(sp, SPEAKER_COLORS[i % SPEAKER_COLORS.length])
    );
    return (sp: string) => map.get(sp) ?? "bg-neutral-100 text-neutral-600";
  }, [vm.transcriptTurns]);
  const speakerCount =
    vm.speakers.length ||
    new Set(vm.transcriptTurns.map((t) => t.speaker)).size;

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold leading-tight">{vm.title}</h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span>{vm.projectName}</span>
            {vm.meetingTime && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3.5" />
                {fmtTime(vm.meetingTime)}
              </span>
            )}
            {vm.participants && (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" />
                {vm.participants}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status === "READY" && vm.canLead && todos.length > 0 && (
            <Button size="sm" onClick={runCreateTasks} disabled={creatingTasks}>
              {creatingTasks ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ListChecks className="size-4" />
              )}
              生成任务（{todos.length}）
            </Button>
          )}
          {status === "READY" && vm.canLead && decisions.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => runLink("decisions")}
              disabled={linking !== null}
            >
              {linking === "decisions" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Gavel className="size-4" />
              )}
              归档决策（{decisions.length}）
            </Button>
          )}
          {status === "READY" && vm.canLead && reqChanges.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => runLink("requirements")}
              disabled={linking !== null}
            >
              {linking === "requirements" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FilePlus2 className="size-4" />
              )}
              生成需求（{reqChanges.length}）
            </Button>
          )}
          {status === "READY" && vm.canLead && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => runLink("notify")}
              disabled={linking !== null}
            >
              {linking === "notify" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <BellRing className="size-4" />
              )}
              通知成员
            </Button>
          )}
          {vm.canManage && (status === "READY" || status === "FAILED") && (
            <Button size="sm" variant="outline" onClick={runReprocess} disabled={reprocessing}>
              {reprocessing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              重新处理
            </Button>
          )}
          {vm.canManage && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setDelOpen(true)}
            >
              <Trash2 className="size-4" /> 删除
            </Button>
          )}
        </div>
      </div>

      {taskMsg && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {taskMsg}
        </p>
      )}
      {actionError && (
        <p className="text-destructive text-sm">{actionError}</p>
      )}

      {/* 处理中（转写 / 生成纪要） */}
      {processing && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <Loader2 className="size-4 animate-spin" />
          <span>
            {status === "TRANSCRIBING"
              ? `正在转写音频…（${progress.completed}/${progress.total}）`
              : `AI 正在整理纪要…（${progress.completed}/${progress.total}）`}
            离开页面也会继续处理。
          </span>
        </div>
      )}

      {/* 纪要已就绪、但汇总图尚未生成：轻量提示，不阻断阅读 */}
      {status === "READY" && !hasSummaryImage && (
          <div className="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs">
            <Loader2 className="size-3.5 animate-spin" />
            <span>AI 汇总图生成中，不影响阅读。</span>
          </div>
        )}

      {/* 待处理（未入队） */}
      {status === "DRAFT" && !processing && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3 text-sm">
          <span className="text-muted-foreground">该会议尚未开始处理。</span>
          {vm.canManage && (
            <Button size="sm" onClick={runReprocess} disabled={reprocessing}>
              {reprocessing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              开始 AI 处理
            </Button>
          )}
        </div>
      )}

      {/* 失败 */}
      {status === "FAILED" && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">处理失败</p>
            {jobError && <p className="mt-0.5 text-red-600">{jobError}</p>}
            <p className="mt-0.5 text-red-600/80">可点「重新处理」重试。</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 左：纪要 + 原文 */}
        <div className="space-y-4 lg:col-span-2">
          {vm.hasAudio && (
            <div className="rounded-xl border p-4">
              <div className="mb-2.5 flex flex-wrap items-center gap-2 text-sm font-semibold">
                <span className="text-muted-foreground">
                  <AudioLines className="size-4" />
                </span>
                会议录音
                {vm.durationSec ? (
                  <span className="text-muted-foreground text-xs font-normal">
                    时长 {fmtDuration(vm.durationSec)}
                  </span>
                ) : null}
              </div>
              <audio
                controls
                preload="none"
                className="w-full"
                src={`/api/meeting/${vm.id}/audio`}
              />
              {vm.audioName && (
                <p className="text-muted-foreground mt-1.5 truncate text-xs">
                  {vm.audioName}
                </p>
              )}
            </div>
          )}

          <Section
            icon={<ScrollText className="size-4" />}
            title="会议纪要"
            action={
              vm.canManage && summary && !editingSummary ? (
                <button
                  onClick={() => {
                    setSummaryDraft(summary);
                    setEditingSummary(true);
                  }}
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
                  title="编辑纪要"
                >
                  <Pencil className="size-3.5" />
                  编辑
                </button>
              ) : undefined
            }
          >
            {hasSummaryImage && !editingSummary && (
              <div className="group relative mb-3 overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/meeting/${vm.id}/summary-image?ts=${summaryImgTs}`}
                  alt="会议汇总图"
                  className="w-full object-cover"
                  onError={() => {
                    setHasSummaryImage(false);
                    setSummaryImgTs(0);
                  }}
                />
                <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {vm.canManage && (
                    <button
                      onClick={async () => {
                        setRegeneratingImg(true);
                        setActionError(null);
                        const res = await regenerateSummaryImage(vm.id);
                        if (res.error) {
                          setActionError(res.error);
                          setRegeneratingImg(false);
                          return;
                        }
                        setHasSummaryImage(false);
                        setSummaryImgTs(0);
                        if (res.jobId) startPolling(res.jobId);
                        setRegeneratingImg(false);
                      }}
                      disabled={regeneratingImg}
                      title="重新生成汇总图"
                      className="bg-background/80 hover:bg-background inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs shadow-sm"
                    >
                      {regeneratingImg ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3.5" />
                      )}
                      重新生成
                    </button>
                  )}
                  <a
                    href={`/api/meeting/${vm.id}/summary-image?download=1`}
                    download
                    title="下载汇总图"
                    className="bg-background/80 hover:bg-background inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs shadow-sm"
                  >
                    <Download className="size-3.5" />
                    下载
                  </a>
                </div>
              </div>
            )}
            {editingSummary ? (
              <div className="space-y-2">
                <textarea
                  value={summaryDraft}
                  onChange={(e) => setSummaryDraft(e.target.value)}
                  className="border-input bg-background focus:ring-ring w-full rounded-md border px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2"
                  rows={20}
                  autoFocus
                />
                {actionError && (
                  <p className="text-destructive text-xs">{actionError}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={savingSummary}
                    onClick={async () => {
                      setSavingSummary(true);
                      setActionError(null);
                      const res = await updateMeetingSummary(vm.id, summaryDraft);
                      setSavingSummary(false);
                      if (res.error) {
                        setActionError(res.error);
                        return;
                      }
                      setSummary(summaryDraft.trim());
                      setEditingSummary(false);
                    }}
                  >
                    {savingSummary ? (
                      <Loader2 className="mr-1 size-3.5 animate-spin" />
                    ) : null}
                    保存
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={savingSummary}
                    onClick={() => setEditingSummary(false)}
                  >
                    取消
                  </Button>
                </div>
              </div>
            ) : summary ? (
              <MeetingSummaryMarkdown
                content={summary}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                {processing ? "生成中…" : "暂无纪要。"}
              </p>
            )}
          </Section>

          {vm.transcriptTurns.length > 0 ? (
            <Section
              icon={<Mic className="size-4" />}
              title={`说话人分段转写（${speakerCount} 人）`}
            >
              <div className="space-y-2.5">
                {vm.transcriptTurns.map((t, i) => (
                  <div key={i} className="flex gap-2.5">
                    <div className="flex w-16 shrink-0 flex-col items-end gap-1">
                      <span
                        className={cn(
                          "max-w-full truncate rounded px-1.5 py-0.5 text-[11px] font-medium",
                          speakerColor(t.speaker)
                        )}
                        title={t.speaker}
                      >
                        {t.speaker}
                      </span>
                      <span className="text-muted-foreground text-[10px] tabular-nums">
                        {fmtClock(t.start)}
                      </span>
                    </div>
                    <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {t.text}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          <details className="rounded-xl border">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
              {vm.sourceType === "AUDIO" ? "完整转写原文" : "原始会议内容"}
            </summary>
            <div className="border-t px-4 py-3">
              <pre className="text-muted-foreground whitespace-pre-wrap break-words text-sm leading-relaxed">
                {vm.rawContent || "（无）"}
              </pre>
            </div>
          </details>
        </div>

        {/* 右：抽取的结构化资产 */}
        <div className="space-y-4">
          {extraction?.keyPoints?.length ? (
            <Section icon={<CheckCircle2 className="size-4" />} title="关键要点">
              <ul className="space-y-1.5 text-sm">
                {extraction.keyPoints.map((k, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-muted-foreground">·</span>
                    <span>{k}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {todos.length > 0 && (
            <Section icon={<ListChecks className="size-4" />} title={`待办（${todos.length}）`}>
              <ul className="space-y-2 text-sm">
                {todos.map((t, i) => (
                  <li key={i} className="rounded-lg border p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{t.title}</span>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium",
                          PRIO[t.priority] ?? PRIO.P2
                        )}
                      >
                        {t.priority}
                      </span>
                    </div>
                    {t.suggestedOwner && (
                      <div className="text-muted-foreground mt-1 text-xs">
                        建议负责人：{t.suggestedOwner}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {decisions.length ? (
            <Section icon={<Gavel className="size-4" />} title={`决策（${decisions.length}）`}>
              <ul className="space-y-2 text-sm">
                {decisions.map((d, i) => (
                  <li key={i} className="rounded-lg border p-2.5">
                    <div className="font-medium">{d.title}</div>
                    {d.background && (
                      <div className="text-muted-foreground mt-1 text-xs leading-relaxed">
                        {d.background}
                      </div>
                    )}
                    {d.reason && (
                      <div className="text-muted-foreground mt-1 text-xs leading-relaxed">
                        <span className="text-foreground/70 font-medium">原因：</span>
                        {d.reason}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {extraction?.risks?.length ? (
            <Section icon={<ShieldAlert className="size-4" />} title={`风险（${extraction.risks.length}）`}>
              <ul className="space-y-1.5 text-sm">
                {extraction.risks.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {reqChanges.length ? (
            <Section icon={<FilePlus2 className="size-4" />} title={`需求变更（${reqChanges.length}）`}>
              <ul className="space-y-2 text-sm">
                {reqChanges.map((r, i) => (
                  <li key={i} className="rounded-lg border p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{r.title}</span>
                      <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-[11px]">
                        {r.kind === "change" ? "变更" : "新增"}
                      </span>
                    </div>
                    {r.detail && (
                      <div className="text-muted-foreground mt-1 text-xs leading-relaxed">
                        {r.detail}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>

      <Dialog
        open={delOpen}
        onClose={() => !deleting && setDelOpen(false)}
        title="删除会议"
        className="max-w-md"
      >
        <div className="border-destructive/30 bg-destructive/5 flex items-start gap-3 rounded-lg border p-3 text-sm">
          <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" />
          <div className="text-muted-foreground">
            删除后该会议的纪要与抽取结果将不可恢复（已生成的任务不受影响）。确认删除？
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => setDelOpen(false)} disabled={deleting}>
            取消
          </Button>
          <Button variant="destructive" onClick={runDelete} disabled={deleting}>
            {deleting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            确认删除
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function Section({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
        <span className="text-muted-foreground">{icon}</span>
        <span className="flex-1">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}


function MeetingSummaryMarkdown({ content }: { content: string }) {
  const components: Components = {
    p: ({ children }) => (
      <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0">{children}</p>
    ),
    h1: ({ children }) => (
      <h1 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="mb-2 mt-4 text-sm font-semibold first:mt-0">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="mb-1.5 mt-2.5 text-sm font-semibold first:mt-0">{children}</h3>
    ),
    img: ({ src, alt }) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={typeof src === "string" ? src : ""} alt={alt ?? ""} className="my-2 max-h-64 rounded-lg border" />
    ),
    ul: ({ children }) => (
      <ul className="my-1.5 ml-4 list-disc space-y-1">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="my-1.5 ml-4 list-decimal space-y-1">{children}</ol>
    ),
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-primary underline underline-offset-2"
      >
        {children}
      </a>
    ),
    hr: () => <hr className="border-border my-3" />,
    blockquote: ({ children }) => (
      <blockquote className="border-border text-muted-foreground my-2 border-l-2 pl-3">
        {children}
      </blockquote>
    ),
    code: ({ className, children }) => {
      const isBlock = className?.includes("language-");
      if (isBlock) {
        return <code className={cn("block", className)}>{children}</code>;
      }
      return (
        <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]">
          {children}
        </code>
      );
    },
    pre: ({ children }) => (
      <pre className="bg-muted my-2 overflow-x-auto rounded-lg p-3 text-xs">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-xs">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="bg-muted/50 border px-2 py-1 text-left font-medium">
        {children}
      </th>
    ),
    td: ({ children }) => <td className="border px-2 py-1">{children}</td>,
  };

  return (
    <div className="text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
