"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Brain,
  Check,
  ExternalLink,
  FileCheck2,
  Globe,
  Lightbulb,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  TrendingUp,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";
import type { ClarifyQuestion } from "@/lib/ai/schemas";
import {
  clarifyConversation,
  researchCompetitors,
  saveRequirementFromChat,
  type ChatTurn,
  type ClarifyResult,
  type CompetitorResearchResult,
} from "./actions";

/** 对齐室固定由「AI 产品经理」承接：把模糊想法澄清为标准需求卡片。 */
const AGENT_ROLE = "ai_product_manager";

/** 对齐室草稿本地持久化键（切菜单/刷新不丢进度）。 */
const STORAGE_KEY = "teammind:align-room:v1";

const EXAMPLES = [
  "我想做一个客户工单智能分析功能",
  "希望给销售团队做一个线索自动评分",
  "想做一个新人入职知识问答助手",
];

const fieldClass =
  "h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

interface ProjectOption {
  id: string;
  name: string;
}

interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  questions?: ClarifyQuestion[];
  ready?: boolean;
  /** 本轮依据的项目记忆要点（GraphRAG）。 */
  references?: string[];
  /** 与既有需求/决策的潜在冲突点，需人工确认。 */
  conflicts?: string[];
}

/** 本地持久化的对齐草稿快照。 */
interface PersistedDraft {
  turns: Turn[];
  answers: Record<string, string[]>;
  customs: Record<string, string>;
  projectId: string;
}

let turnSeq = 0;
const nextId = () => `t${Date.now()}-${turnSeq++}`;

/** 用 AI 推荐答案预选：single/multi 预选 options 内的推荐项，text 预填建议文本。 */
function seedAnswers(questions: ClarifyQuestion[]): {
  answers: Record<string, string[]>;
  customs: Record<string, string>;
} {
  const answers: Record<string, string[]> = {};
  const customs: Record<string, string> = {};
  for (const q of questions) {
    const rec = q.recommended ?? [];
    if (q.type === "text") {
      if (rec[0]) customs[q.key] = rec[0];
    } else {
      const valid = rec.filter((r) => q.options.includes(r));
      if (valid.length)
        answers[q.key] = q.type === "single" ? [valid[0]] : valid;
    }
  }
  return { answers, customs };
}

export function AlignRoom({
  projects,
  initialProjectId,
  searchEnabled = false,
}: {
  projects: ProjectOption[];
  initialProjectId?: string;
  searchEnabled?: boolean;
}) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [projectId, setProjectId] = useState(
    initialProjectId ?? projects[0]?.id ?? ""
  );
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [researchOpen, setResearchOpen] = useState(false);
  const [researching, setResearching] = useState(false);
  const [research, setResearch] = useState<CompetitorResearchResult | null>(
    null
  );

  // 当前激活问题集（最后一条 assistant turn）的作答状态
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [customs, setCustoms] = useState<Record<string, string>>({});

  // 草稿持久化：挂载时回填本地草稿，避免切菜单/刷新丢失对齐进度
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PersistedDraft>;
        if (Array.isArray(saved.turns) && saved.turns.length > 0) {
          setTurns(saved.turns);
          if (saved.answers) setAnswers(saved.answers);
          if (saved.customs) setCustoms(saved.customs);
          if (saved.projectId && projects.some((p) => p.id === saved.projectId))
            setProjectId(saved.projectId);
        }
      }
    } catch {
      // 忽略损坏的本地草稿
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 状态变化时写回本地草稿（hydrated 后才写，避免覆盖已存草稿）
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (turns.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const payload: PersistedDraft = { turns, answers, customs, projectId };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // 忽略写入失败（隐私模式/超额）
    }
  }, [hydrated, turns, answers, customs, projectId]);

  /** 「新对话」：清空当前草稿与本地缓存，重新开始一段对齐。 */
  function startNewConversation() {
    setTurns([]);
    setAnswers({});
    setCustoms({});
    setInput("");
    setError(null);
    setSaveError(null);
    setResearch(null);
    setResearchOpen(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  const hasAssistantReply = turns.some(
    (t) => t.role === "assistant" && t.text.trim().length > 0
  );
  const hasUserInput = turns.some((t) => t.role === "user");
  const lastTurn = turns[turns.length - 1];
  const activeQuestions =
    !loading && lastTurn?.role === "assistant" ? lastTurn.questions ?? [] : [];
  const ready = lastTurn?.role === "assistant" ? !!lastTurn.ready : false;
  const canSave = !!projectId && hasAssistantReply && !loading && !saving;

  function toChatTurns(list: Turn[]): ChatTurn[] {
    return list.map((t) => {
      if (t.role === "assistant" && t.questions && t.questions.length > 0) {
        const qs = t.questions
          .map(
            (q) =>
              `- ${q.question}${
                q.options.length ? `（选项：${q.options.join(" / ")}）` : ""
              }`
          )
          .join("\n");
        return { role: "assistant", text: `${t.text}\n${qs}` };
      }
      return { role: t.role, text: t.text };
    });
  }

  async function runClarify(history: Turn[]) {
    setLoading(true);
    setError(null);
    setAnswers({});
    setCustoms({});
    const res: ClarifyResult = await clarifyConversation({
      projectId: projectId || undefined,
      agentRole: AGENT_ROLE,
      messages: toChatTurns(history),
    });
    if (res.error) {
      setError(res.error);
      setLoading(false);
      return;
    }
    const seeded = seedAnswers(res.questions);
    setAnswers(seeded.answers);
    setCustoms(seeded.customs);
    setTurns((prev) => [
      ...prev,
      {
        id: nextId(),
        role: "assistant",
        text: res.reply,
        questions: res.questions,
        ready: res.ready,
        references: res.references,
        conflicts: res.conflicts,
      },
    ]);
    setLoading(false);
  }

  function sendText(text: string) {
    const value = text.trim();
    if (!value || loading) return;
    const userTurn: Turn = { id: nextId(), role: "user", text: value };
    const history = [...turns, userTurn];
    setTurns(history);
    setInput("");
    void runClarify(history);
  }

  function toggleOption(q: ClarifyQuestion, option: string) {
    setAnswers((prev) => {
      const cur = prev[q.key] ?? [];
      if (q.type === "single") {
        return { ...prev, [q.key]: cur[0] === option ? [] : [option] };
      }
      const has = cur.includes(option);
      return {
        ...prev,
        [q.key]: has ? cur.filter((o) => o !== option) : [...cur, option],
      };
    });
  }

  function buildAnswerText(
    a: Record<string, string[]>,
    c: Record<string, string>
  ): string | null {
    const parts: string[] = [];
    for (const q of activeQuestions) {
      const selected = a[q.key] ?? [];
      const custom = (c[q.key] ?? "").trim();
      if (q.type === "text") {
        if (custom) parts.push(`${q.question}：${custom}`);
        continue;
      }
      const all = [...selected];
      if (custom) all.push(custom);
      if (all.length) parts.push(`${q.question}：${all.join("、")}`);
    }
    if (!parts.length) return null;
    return `针对澄清问题的回答：\n${parts.map((p) => `- ${p}`).join("\n")}`;
  }

  function submitAnswers() {
    if (!activeQuestions.length) return;
    const text = buildAnswerText(answers, customs);
    if (text) sendText(text);
  }

  /** 一键采纳 AI 对所有问题的推荐答案并提交（boss 省心模式，仍可事后修改）。 */
  function acceptAllRecommended() {
    if (!activeQuestions.length) return;
    const seeded = seedAnswers(activeQuestions);
    setAnswers(seeded.answers);
    setCustoms(seeded.customs);
    const text = buildAnswerText(seeded.answers, seeded.customs);
    if (text) sendText(text);
  }

  const hasAnyAnswer = activeQuestions.some((q) => {
    const sel = answers[q.key] ?? [];
    const custom = (customs[q.key] ?? "").trim();
    return sel.length > 0 || custom.length > 0;
  });

  const hasAnyRecommended = activeQuestions.some(
    (q) => (q.recommended?.length ?? 0) > 0
  );

  async function saveAsRequirement() {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    const res = await saveRequirementFromChat({
      projectId,
      messages: toChatTurns(turns),
    });
    if (res.id) {
      router.push(`/requirement/${res.id}`);
    } else {
      setSaveError(res.error ?? "保存失败");
      setSaving(false);
    }
  }

  async function runResearch() {
    if (researching) return;
    setResearchOpen(true);
    setResearching(true);
    setResearch(null);
    const res = await researchCompetitors({
      projectId: projectId || undefined,
      messages: toChatTurns(turns),
    });
    setResearch(res);
    setResearching(false);
  }

  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
      {/* 左侧：项目上下文 */}
      <aside className="hidden flex-col gap-3 overflow-y-auto rounded-xl border bg-card p-4 lg:flex">
        <div className="text-sm font-semibold">归属项目</div>
        {projects.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            还没有项目。
            <Link href="/project/new" className="text-primary underline">
              新建项目
            </Link>
            后即可把澄清结果保存为需求卡片。
          </p>
        ) : (
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={fieldClass}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        <div className="mt-2 text-sm font-semibold">工作方式</div>
        <ContextSection title="选择题优先">
          AI 会尽量用单选/多选给出候选项，点选即可作答；也可随时在下方直接输入补充。
        </ContextSection>
        <ContextSection title="先对齐，再执行">
          补全背景、目标、范围、不做范围与验收标准后，一键保存为标准需求卡片。
        </ContextSection>
        <p className="mt-auto text-xs text-muted-foreground">
          保存后，AI 会把澄清结论整理为结构化需求卡片并落库（待澄清 / 待评审）。
        </p>
      </aside>

      {/* 右侧：对话区 */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
        {/* 头部 */}
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10">
            <Brain className="size-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              AI 产品经理
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                需求对齐
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              把模糊想法澄清为可执行、可验收的标准需求卡片
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={startNewConversation}
              disabled={loading || saving || turns.length === 0}
              title="清空当前草稿，开始一段新的需求对齐"
            >
              <RotateCcw className="size-4" />
              新对话
            </Button>
            {searchEnabled && (
              <Button
                size="sm"
                variant="outline"
                onClick={runResearch}
                disabled={!hasUserInput || researching}
                title="基于联网检索的近 30 天行业/竞品资料，辅助决策"
              >
                <TrendingUp className="size-4" />
                {researching ? "分析中…" : "竞品分析"}
              </Button>
            )}
            <Button
              size="sm"
              variant={ready ? "default" : "outline"}
              onClick={saveAsRequirement}
              disabled={!canSave}
              title={
                ready
                  ? "信息已充足，保存为标准需求卡片"
                  : "AI 判断信息尚不充足，建议先继续澄清；如确需暂存将生成草稿（待澄清），之后可在需求页就地编辑补全"
              }
            >
              <Save className="size-4" />
              {saving ? "生成中…" : ready ? "保存为需求卡片" : "暂存为草稿"}
            </Button>
          </div>
        </div>

        {/* 消息列表 */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {turns.length === 0 && (
            <div className="mx-auto mt-10 max-w-md text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10">
                <Brain className="size-6 text-primary" />
              </div>
              <h2 className="mt-4 font-semibold">把一句话想法交给 AI 产品经理</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                AI 会用选择题帮你快速澄清关键信息，并生成标准需求卡片。
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => sendText(ex)}
                    className="rounded-lg border bg-muted/30 px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t, i) => {
            const isActive = i === turns.length - 1 && t.role === "assistant";
            return (
              <div key={t.id} className="space-y-3">
                <div
                  className={cn(
                    "flex gap-3",
                    t.role === "user" ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-full",
                      t.role === "user"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {t.role === "user" ? (
                      <User className="size-4" />
                    ) : (
                      <Brain className="size-4" />
                    )}
                  </div>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                      t.role === "user"
                        ? "whitespace-pre-wrap bg-primary text-primary-foreground"
                        : "border bg-background"
                    )}
                  >
                    {t.role === "user" ? t.text : <Markdown content={t.text} />}
                  </div>
                </div>

                {/* 对齐提示：依据的项目记忆 + 与既有需求/决策的冲突 */}
                {((t.references?.length ?? 0) > 0 ||
                  (t.conflicts?.length ?? 0) > 0) && (
                  <div className="ml-11 space-y-2">
                    {(t.conflicts?.length ?? 0) > 0 && (
                      <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                        <div className="mb-1 flex items-center gap-1.5 font-medium">
                          <AlertTriangle className="size-3.5" />
                          与既有需求 / 决策可能冲突（请人工确认）
                        </div>
                        <ul className="list-disc space-y-0.5 pl-4">
                          {t.conflicts!.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(t.references?.length ?? 0) > 0 && (
                      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                          <Brain className="size-3.5 text-primary" />
                          依据的项目记忆
                        </div>
                        <ul className="list-disc space-y-0.5 pl-4">
                          {t.references!.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* 交互式问题：仅最后一条 assistant turn 可作答 */}
                {isActive && (t.questions?.length ?? 0) > 0 && (
                  <div className="ml-11 space-y-3">
                    {t.questions!.map((q) => (
                      <QuestionCard
                        key={q.key}
                        q={q}
                        selected={answers[q.key] ?? []}
                        custom={customs[q.key] ?? ""}
                        onToggle={(opt) => toggleOption(q, opt)}
                        onCustom={(v) =>
                          setCustoms((p) => ({ ...p, [q.key]: v }))
                        }
                      />
                    ))}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={submitAnswers}
                        disabled={!hasAnyAnswer || loading}
                      >
                        <Check className="size-4" />
                        提交所选答案
                      </Button>
                      {hasAnyRecommended && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={acceptAllRecommended}
                          disabled={loading}
                          title="直接采纳 AI 对所有问题的推荐答案并提交"
                        >
                          <Sparkles className="size-4" />
                          采纳全部推荐
                        </Button>
                      )}
                      <span className="text-xs text-muted-foreground">
                        已按 AI 推荐预选，可修改后再提交
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="flex gap-3">
              <div className="grid size-8 shrink-0 place-items-center rounded-full bg-muted">
                <Brain className="size-4" />
              </div>
              <div className="rounded-2xl border bg-background px-4 py-2.5 text-sm text-muted-foreground">
                AI 思考中…
              </div>
            </div>
          )}

          {(error || saveError) && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {saveError ?? error}
            </div>
          )}

          {ready && !loading && (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-emerald-300/50 bg-emerald-50 px-4 py-2 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <FileCheck2 className="size-3.5" />
              信息已基本充足，点右上角「保存为需求卡片」即可结构化落库。
            </div>
          )}
        </div>

        {/* 输入区 */}
        <div className="border-t p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendText(input);
                }
              }}
              placeholder="描述你的想法，或补充选项之外的信息。Enter 发送，Shift+Enter 换行…"
              className="max-h-40 min-h-11 flex-1 resize-none"
              rows={1}
              disabled={loading}
            />
            <Button
              size="icon"
              onClick={() => sendText(input)}
              disabled={loading || !input.trim()}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* 竞品/同行分析弹框（仅配置联网搜索时可触发） */}
      <Dialog
        open={researchOpen}
        onClose={() => setResearchOpen(false)}
        title="近 30 天竞品 / 同行分析"
        description="基于联网检索的公开资料，辅助决策；请人工核实后再下结论。"
        className="max-w-2xl"
      >
        <CompetitorResearchView loading={researching} result={research} />
      </Dialog>
    </div>
  );
}

function QuestionCard({
  q,
  selected,
  custom,
  onToggle,
  onCustom,
}: {
  q: ClarifyQuestion;
  selected: string[];
  custom: string;
  onToggle: (option: string) => void;
  onCustom: (value: string) => void;
}) {
  const typeLabel =
    q.type === "single" ? "单选" : q.type === "multi" ? "多选" : "填空";
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {typeLabel}
        </span>
        <div className="text-sm font-medium">{q.question}</div>
      </div>

      {q.type !== "text" && q.options.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {q.options.map((opt) => {
            const active = selected.includes(opt);
            const isRec = q.recommended?.includes(opt) ?? false;
            return (
              <button
                key={opt}
                onClick={() => onToggle(opt)}
                className={cn(
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : isRec
                      ? "border-primary/50 bg-primary/5 hover:bg-accent"
                      : "bg-background hover:bg-accent"
                )}
              >
                {active && <Check className="mr-1 inline size-3" />}
                {opt}
                {isRec && !active && (
                  <Sparkles className="ml-1 inline size-3 text-primary" />
                )}
              </button>
            );
          })}
        </div>
      )}

      <input
        value={custom}
        onChange={(e) => onCustom(e.target.value)}
        placeholder={
          q.type === "text" ? "请输入…" : "其他（可自行输入补充）…"
        }
        className="mt-2 h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />

      {(q.recommendReason || (q.recommended?.length ?? 0) > 0) && (
        <div className="mt-2 flex items-start gap-1.5 rounded-md bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">
          <Sparkles className="mt-0.5 size-3 shrink-0 text-primary" />
          <span>
            <span className="font-medium text-primary">AI 推荐</span>
            {q.recommended && q.recommended.length > 0
              ? `：${q.recommended.join("、")}`
              : ""}
            {q.recommendReason ? ` · ${q.recommendReason}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

function ContextSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="text-xs font-medium text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{children}</div>
    </div>
  );
}

const CONFIDENCE_LABEL: Record<
  "high" | "medium" | "low",
  { label: string; cls: string }
> = {
  high: {
    label: "高",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  medium: {
    label: "中",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
  low: { label: "低", cls: "bg-muted text-muted-foreground" },
};

/** 竞品/同行分析结果展示（弹框内）。 */
function CompetitorResearchView({
  loading,
  result,
}: {
  loading: boolean;
  result: CompetitorResearchResult | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
        <Globe className="size-4 animate-pulse text-primary" />
        正在联网检索近 30 天资料并分析…
      </div>
    );
  }
  if (!result) return null;
  if (result.error || !result.analysis) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        {result.error ?? "未获取到分析结果。"}
      </div>
    );
  }
  const a = result.analysis;
  const conf = CONFIDENCE_LABEL[a.confidence];
  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1 text-sm">
      <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        以下为 AI 基于联网公开资料的参考分析，可能不全面或存在偏差，请人工核实后再决策。
      </div>

      <div>
        <div className="mb-1 flex items-center gap-2 font-medium">
          <TrendingUp className="size-4 text-primary" />
          总体动向
          <span
            className={cn(
              "ml-auto rounded px-1.5 py-0.5 text-[11px]",
              conf.cls
            )}
          >
            置信度 {conf.label}
          </span>
        </div>
        <p className="text-muted-foreground">{a.summary}</p>
      </div>

      {a.insights.length > 0 && (
        <div className="space-y-2">
          <div className="font-medium">竞品 / 同行要点</div>
          {a.insights.map((it, i) => (
            <div key={i} className="rounded-lg border bg-muted/20 p-3">
              <div className="font-medium">{it.name}</div>
              <div className="mt-1 text-muted-foreground">{it.highlight}</div>
              <div className="mt-1 flex items-start gap-1.5 text-xs text-primary">
                <Lightbulb className="mt-0.5 size-3 shrink-0" />
                {it.implication}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-primary">
          <Sparkles className="size-4" />
          对本决策的建议
        </div>
        <p className="text-foreground">{a.recommendation}</p>
      </div>

      {a.risks.length > 0 && (
        <div>
          <div className="mb-1 font-medium">风险 / 注意</div>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {a.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {result.sources && result.sources.length > 0 && (
        <div>
          <div className="mb-1 font-medium">资料来源（近 30 天）</div>
          <ul className="space-y-1">
            {result.sources.map((s, i) => (
              <li key={i}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-start gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="mt-0.5 size-3 shrink-0" />
                  <span>
                    {s.title}
                    {s.publishedDate ? (
                      <span className="text-muted-foreground">
                        {" "}· {s.publishedDate}
                      </span>
                    ) : null}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
