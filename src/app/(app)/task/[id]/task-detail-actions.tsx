"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Send, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { TASK_STATUS_LABEL, taskStatusClass } from "@/lib/labels";
import { updateTaskStatus } from "@/app/(app)/kanban/actions";
import { addTaskComment, buildTaskDevPrompt } from "./actions";

const ALL_STATUSES = Object.keys(TASK_STATUS_LABEL);

export function TaskStatusControl({
  taskId,
  status,
}: {
  taskId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(next: string) {
    setError(null);
    startTransition(async () => {
      const res = await updateTaskStatus(taskId, next);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={status}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        className={cn(
          "rounded-md border px-2 py-1.5 text-sm font-medium outline-none",
          taskStatusClass(status)
        )}
      >
        {ALL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {TASK_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      {pending && (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

export function TaskCommentForm({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const text = body.trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      const res = await addTaskComment(taskId, text);
      if (res.error) setError(res.error);
      else {
        setBody("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="写下进展、问题或决策…"
        rows={3}
        className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end">
        <button
          onClick={submit}
          disabled={pending || !body.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          发表评论
        </button>
      </div>
    </div>
  );
}

export function DevHandoffCard({ taskId }: { taskId: string }) {
  const [pending, startTransition] = useTransition();
  const [prompt, setPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function generate() {
    setError(null);
    startTransition(async () => {
      const res = await buildTaskDevPrompt(taskId);
      if (res.error || !res.prompt) {
        setError(res.error ?? "生成失败。");
        return;
      }
      setPrompt(res.prompt);
      try {
        await navigator.clipboard.writeText(res.prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        // 剪贴板不可用时，用户可从下方文本框手动复制
      }
    });
  }

  async function copyAgain() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("自动复制失败，请手动选择文本复制。");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={generate}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {prompt ? "重新生成" : "生成 AI 开发提示"}
        </button>
        {prompt && (
          <button
            onClick={copyAgain}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            {copied ? (
              <Check className="size-4 text-emerald-600" />
            ) : (
              <Copy className="size-4" />
            )}
            {copied ? "已复制" : "复制"}
          </button>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
      {prompt && (
        <textarea
          readOnly
          value={prompt}
          rows={14}
          className="w-full resize-y rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs leading-relaxed outline-none"
        />
      )}
      <p className="text-xs text-muted-foreground">
        粘贴到本地 Cursor / Windsurf 等 AI 编程工具，即可带着完整背景开发。后续将提供 MCP，让本地 AI 直接读取项目上下文与记忆。
      </p>
    </div>
  );
}
