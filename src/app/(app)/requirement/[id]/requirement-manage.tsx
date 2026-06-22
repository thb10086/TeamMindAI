"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteRequirement,
  updateRequirement,
  type RequirementEditInput,
} from "./actions";

const PRIORITY_OPTIONS = [
  { value: "P0", label: "P0 · 最高" },
  { value: "P1", label: "P1 · 高" },
  { value: "P2", label: "P2 · 中" },
  { value: "P3", label: "P3 · 低" },
];

const INPUT_CLASS =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** 需求详情页的「编辑 / 删除」管理条：就地补全需求（闭环关键），删除需二次确认。 */
export function RequirementManage({
  requirementId,
  initial,
  canDelete,
}: {
  requirementId: string;
  initial: RequirementEditInput;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [form, setForm] = useState<RequirementEditInput>(initial);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openEdit() {
    setForm(initial);
    setError(null);
    setEditOpen(true);
  }

  function set<K extends keyof RequirementEditInput>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.title.trim()) {
      setError("需求名称不能为空。");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await updateRequirement(requirementId, form);
    if (res.error) {
      setError(res.error);
      setSaving(false);
      return;
    }
    setSaving(false);
    setEditOpen(false);
    router.refresh();
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    const res = await deleteRequirement(requirementId);
    if (res.error) {
      setError(res.error);
      setDeleting(false);
      return;
    }
    router.push("/requirement");
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={openEdit}>
          <Pencil className="size-4" /> 编辑
        </Button>
        {canDelete && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              setError(null);
              setDelOpen(true);
            }}
          >
            <Trash2 className="size-4" /> 删除
          </Button>
        )}
      </div>

      {/* 编辑对话框 */}
      <Dialog
        open={editOpen}
        onClose={() => !saving && setEditOpen(false)}
        title="编辑需求"
        description="就地补全 / 修订需求卡片。补齐「业务背景 · 业务目标 · 功能范围 · 验收标准」后即可进入评审。"
        className="max-w-2xl"
      >
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          <Field label="需求名称" required>
            <input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              className={INPUT_CLASS}
              placeholder="简洁、可检索的需求名称"
            />
          </Field>
          <Field label="优先级">
            <select
              value={form.priority}
              onChange={(e) => set("priority", e.target.value)}
              className={INPUT_CLASS}
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="业务背景" hint="对齐必备">
            <Textarea
              value={form.background}
              onChange={(e) => set("background", e.target.value)}
              className="min-h-20"
              placeholder="为什么要做？业务上下文是什么？"
            />
          </Field>
          <Field label="当前问题 / 痛点">
            <Textarea
              value={form.problem}
              onChange={(e) => set("problem", e.target.value)}
              className="min-h-16"
            />
          </Field>
          <Field label="目标用户">
            <Textarea
              value={form.targetUser}
              onChange={(e) => set("targetUser", e.target.value)}
              className="min-h-16"
            />
          </Field>
          <Field label="业务目标" hint="对齐必备">
            <Textarea
              value={form.businessGoal}
              onChange={(e) => set("businessGoal", e.target.value)}
              className="min-h-16"
              placeholder="希望达成的可衡量结果"
            />
          </Field>
          <Field label="功能范围" hint="对齐必备 · 每行一条">
            <Textarea
              value={form.scope}
              onChange={(e) => set("scope", e.target.value)}
              className="min-h-20"
              placeholder={"每行一条\n如：支持手机号 + 验证码登录"}
            />
          </Field>
          <Field label="不做范围" hint="每行一条">
            <Textarea
              value={form.outOfScope}
              onChange={(e) => set("outOfScope", e.target.value)}
              className="min-h-16"
              placeholder={"每行一条，明确不做什么"}
            />
          </Field>
          <Field label="用户故事">
            <Textarea
              value={form.userStory}
              onChange={(e) => set("userStory", e.target.value)}
              className="min-h-16"
              placeholder="作为…我希望…以便…"
            />
          </Field>
          <Field label="验收标准" hint="对齐必备 · 每行一条 · 可量化可测试">
            <Textarea
              value={form.acceptanceCriteria}
              onChange={(e) => set("acceptanceCriteria", e.target.value)}
              className="min-h-20"
              placeholder={"每行一条\n如：登录成功率 ≥ 99%；P95 响应 < 500ms"}
            />
          </Field>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-4 flex items-center justify-end gap-2 border-t pt-4">
          <Button
            variant="ghost"
            onClick={() => setEditOpen(false)}
            disabled={saving}
          >
            取消
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {saving ? "保存中…" : "保存修改"}
          </Button>
        </div>
      </Dialog>

      {/* 删除确认 */}
      <Dialog
        open={delOpen}
        onClose={() => !deleting && setDelOpen(false)}
        title="删除需求"
        className="max-w-md"
      >
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="text-muted-foreground">
            删除该需求将
            <strong className="text-foreground">
              一并删除其下的任务、界面设计、评审与决策记录
            </strong>
            ，且不可恢复。确认删除？
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => setDelOpen(false)}
            disabled={deleting}
          >
            取消
          </Button>
          <Button variant="destructive" onClick={remove} disabled={deleting}>
            {deleting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            {deleting ? "删除中…" : "确认删除"}
          </Button>
        </div>
      </Dialog>
    </>
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
          <span className="text-[11px] font-normal text-muted-foreground">
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
