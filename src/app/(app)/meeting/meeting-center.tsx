"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarClock,
  FileAudio,
  Loader2,
  Mic,
  Plus,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createMeeting } from "./actions";

export interface ProjectOption {
  id: string;
  name: string;
}

export interface MeetingVM {
  id: string;
  title: string;
  status: "DRAFT" | "TRANSCRIBING" | "PROCESSING" | "READY" | "FAILED";
  sourceType: "TEXT" | "AUDIO";
  projectId: string;
  projectName: string;
  participants: string | null;
  meetingTime: string | null;
  createdAt: string;
  hasCover: boolean;
}

const STATUS: Record<MeetingVM["status"], { label: string; cls: string }> = {
  DRAFT: { label: "待处理", cls: "bg-neutral-100 text-neutral-600" },
  TRANSCRIBING: { label: "转写中", cls: "bg-violet-100 text-violet-700" },
  PROCESSING: { label: "处理中", cls: "bg-blue-100 text-blue-700" },
  READY: { label: "已生成", cls: "bg-emerald-100 text-emerald-700" },
  FAILED: { label: "失败", cls: "bg-red-100 text-red-700" },
};

const INPUT_CLASS =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function fmtTime(iso: string): string {
  // 直接截取 ISO，避免 SSR/CSR 时区差异导致 hydration 不一致
  return iso.slice(0, 16).replace("T", " ");
}

export function MeetingCenter({
  meetings,
  projects,
}: {
  meetings: MeetingVM[];
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);

  const projectsWithMeetings = useMemo(() => {
    const ids = new Set(meetings.map((m) => m.projectId));
    return projects.filter((p) => ids.has(p.id));
  }, [meetings, projects]);

  const visible = useMemo(
    () =>
      filter === "all"
        ? meetings
        : meetings.filter((m) => m.projectId === filter),
    [meetings, filter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">会议中心</h1>
          <p className="text-muted-foreground text-sm">
            上传会议录音（自动转写 + 说话人识别）或粘贴转写稿，AI 整理纪要、抽取待办 / 决策 / 需求，并生成封面图。
          </p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={projects.length === 0}>
          <Plus className="size-4" /> 新建会议
        </Button>
      </div>

      {projects.length === 0 && (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
          你还没有加入任何项目，请先创建或加入项目后再创建会议。
        </p>
      )}

      {projectsWithMeetings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            全部（{meetings.length}）
          </FilterChip>
          {projectsWithMeetings.map((p) => (
            <FilterChip
              key={p.id}
              active={filter === p.id}
              onClick={() => setFilter(p.id)}
            >
              {p.name}
            </FilterChip>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Sparkles className="text-muted-foreground mx-auto mb-3 size-9" />
          <p className="font-medium">还没有会议</p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
            点击「新建会议」，粘贴录音转写稿或会议文本，AI 会议纪要员会整理为结构化纪要与资产。
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((m) => (
            <MeetingCard key={m.id} m={m} />
          ))}
        </div>
      )}

      <NewMeetingDialog
        open={open}
        onClose={() => setOpen(false)}
        projects={projects}
        onCreated={(id) => router.push(`/meeting/${id}`)}
      />
    </div>
  );
}

function MeetingCard({ m }: { m: MeetingVM }) {
  const st = STATUS[m.status];
  return (
    <Link
      href={`/meeting/${m.id}`}
      className="bg-card group flex flex-col overflow-hidden rounded-xl border transition-shadow hover:shadow-md"
    >
      <div className="bg-muted relative aspect-[16/9] w-full">
        {m.hasCover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/meeting/${m.id}/cover-image`}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center">
            {m.status === "PROCESSING" || m.status === "TRANSCRIBING" ? (
              <Loader2 className="size-6 animate-spin" />
            ) : m.sourceType === "AUDIO" ? (
              <FileAudio className="size-7" />
            ) : (
              <CalendarClock className="size-7" />
            )}
          </div>
        )}
        <span
          className={cn(
            "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-medium",
            st.cls
          )}
        >
          {st.label}
        </span>
        {m.sourceType === "AUDIO" && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">
            <Mic className="size-3" /> 录音
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="group-hover:text-primary line-clamp-2 font-medium leading-snug">
          {m.title}
        </div>
        <div className="text-muted-foreground text-xs">{m.projectName}</div>
        <div className="text-muted-foreground mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs">
          {m.meetingTime && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3" />
              {fmtTime(m.meetingTime)}
            </span>
          )}
          {m.participants && (
            <span className="inline-flex max-w-full items-center gap-1 truncate">
              <Users className="size-3 shrink-0" />
              <span className="truncate">{m.participants}</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

interface UploadedAudio {
  audioKey: string;
  audioMime: string;
  audioName: string;
}

/** 用 XHR 上传音频以获得上传进度（fetch 不便拿 upload 进度）。 */
function uploadAudio(
  file: File,
  projectId: string,
  onProgress: (pct: number) => void
): Promise<UploadedAudio> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/meeting/audio");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const j = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(j as UploadedAudio);
        else reject(new Error(j.error ?? `上传失败（${xhr.status}）`));
      } catch {
        reject(new Error("上传响应解析失败。"));
      }
    };
    xhr.onerror = () => reject(new Error("网络错误，上传失败。"));
    const fd = new FormData();
    fd.append("file", file);
    fd.append("projectId", projectId);
    xhr.send(fd);
  });
}

function NewMeetingDialog({
  open,
  onClose,
  projects,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectOption[];
  onCreated: (id: string) => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [participants, setParticipants] = useState("");
  const [mode, setMode] = useState<"audio" | "text">("audio");
  const [rawContent, setRawContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [saving, setSaving] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "creating">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!projectId) return setError("请选择项目。");
    if (!title.trim()) return setError("请填写会议标题。");
    if (mode === "text" && rawContent.trim().length < 10) {
      return setError("请粘贴会议内容（转写稿 / 纪要，至少 10 字）。");
    }
    if (mode === "audio" && !file) {
      return setError("请选择要上传的会议录音。");
    }

    setSaving(true);
    setError(null);

    let audio: UploadedAudio | undefined;
    if (mode === "audio" && file) {
      setPhase("uploading");
      setUploadPct(0);
      try {
        audio = await uploadAudio(file, projectId, setUploadPct);
      } catch (err) {
        setError((err as Error).message || "音频上传失败，请重试。");
        setSaving(false);
        setPhase("idle");
        return;
      }
    }

    setPhase("creating");
    const res = await createMeeting({
      projectId,
      title: title.trim(),
      meetingTime: meetingTime || undefined,
      participants: participants.trim() || undefined,
      sourceType: mode === "audio" ? "AUDIO" : "TEXT",
      rawContent: mode === "text" ? rawContent.trim() : undefined,
      audioKey: audio?.audioKey,
      audioMime: audio?.audioMime,
      audioName: audio?.audioName,
    });
    // 即便入队失败，只要会议已创建也进入详情页（可在详情页重试处理）
    if (res.meetingId) {
      onCreated(res.meetingId);
      return;
    }
    setError(res.error ?? "创建失败，请重试。");
    setSaving(false);
    setPhase("idle");
  }

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      title="新建会议"
      description="上传会议录音，AI 自动转写并识别发言人（谁说了什么），再整理纪要、抽取待办/决策/需求并生成封面图；也可直接粘贴转写稿。"
      className="max-w-2xl"
    >
      <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
        <Field label="所属项目" required>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={INPUT_CLASS}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="会议标题" required>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={INPUT_CLASS}
            placeholder="如：登录模块需求评审会"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="会议时间">
            <input
              type="datetime-local"
              value={meetingTime}
              onChange={(e) => setMeetingTime(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="参会人" hint="逗号分隔，有助于说话人识别">
            <input
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              className={INPUT_CLASS}
              placeholder="张三, 李四, 王五"
            />
          </Field>
        </div>

        {/* 输入方式切换 */}
        <div className="bg-muted inline-flex rounded-lg p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setMode("audio")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors",
              mode === "audio"
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground"
            )}
          >
            <Mic className="size-3.5" /> 上传录音
          </button>
          <button
            type="button"
            onClick={() => setMode("text")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors",
              mode === "text"
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground"
            )}
          >
            <Sparkles className="size-3.5" /> 粘贴文本
          </button>
        </div>

        {mode === "audio" ? (
          <Field
            label="会议录音"
            required
            hint="mp3/m4a/wav/webm 等，≤200MB，支持 1 小时以上"
          >
            <label className="hover:border-ring/60 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors">
              <input
                type="file"
                accept="audio/*,video/mp4,video/webm,.m4a,.mp3,.wav,.ogg,.aac"
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setError(null);
                }}
              />
              {file ? (
                <>
                  <FileAudio className="text-primary size-7" />
                  <span className="text-sm font-medium">{file.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {formatBytes(file.size)} · 点击可重新选择
                  </span>
                </>
              ) : (
                <>
                  <Upload className="text-muted-foreground size-7" />
                  <span className="text-sm font-medium">点击选择音频文件</span>
                  <span className="text-muted-foreground text-xs">
                    上传后将自动转写并识别发言人
                  </span>
                </>
              )}
            </label>
            {phase === "uploading" && (
              <div className="mt-2 space-y-1">
                <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  上传中 {uploadPct}%…
                </p>
              </div>
            )}
          </Field>
        ) : (
          <Field
            label="会议内容"
            required
            hint="录音转写稿 / 速记 / 纪要草稿，越完整越好"
          >
            <Textarea
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              className="min-h-48"
              placeholder="粘贴会议转写稿或文本…若已含「张三：…」这样的说话人前缀，AI 会保留并据此整理。"
            />
          </Field>
        )}
      </div>
      {error && <p className="text-destructive mt-3 text-sm">{error}</p>}
      <div className="mt-4 flex items-center justify-end gap-2 border-t pt-4">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          取消
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {phase === "uploading"
            ? "上传中…"
            : phase === "creating"
              ? "创建中…"
              : mode === "audio"
                ? "上传并转写"
                : "创建并生成纪要"}
        </Button>
      </div>
    </Dialog>
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
        "rounded-full border px-3 py-1 text-sm transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background hover:bg-accent text-muted-foreground"
      )}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
        {label}
        {required && <span className="text-destructive">*</span>}
        {hint && (
          <span className="text-muted-foreground text-[11px] font-normal">
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
