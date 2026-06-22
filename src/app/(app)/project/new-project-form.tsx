"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createProjectAction, type CreateProjectState } from "./actions";

const initial: CreateProjectState = {};

const inputClass =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function NewProjectForm() {
  const [state, formAction, pending] = useActionState(
    createProjectAction,
    initial
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="name">
          项目名称 <span className="text-destructive">*</span>
        </label>
        <input id="name" name="name" className={inputClass} placeholder="如：客户工单智能分析" />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="description">
          项目简介
        </label>
        <Textarea id="description" name="description" rows={2} placeholder="一句话描述这个项目做什么" />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="businessBackground">
          业务背景
        </label>
        <Textarea
          id="businessBackground"
          name="businessBackground"
          rows={3}
          placeholder="当前面临的问题、为什么要做这个项目"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="goal">
          项目目标
        </label>
        <Textarea id="goal" name="goal" rows={2} placeholder="希望达成的业务目标" />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="priority">
          优先级
        </label>
        <select id="priority" name="priority" defaultValue="P2" className={inputClass}>
          <option value="P0">P0 紧急</option>
          <option value="P1">P1 高</option>
          <option value="P2">P2 中</option>
          <option value="P3">P3 低</option>
        </select>
      </div>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "创建中…" : "创建项目"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href="/project">取消</Link>
        </Button>
      </div>
    </form>
  );
}
