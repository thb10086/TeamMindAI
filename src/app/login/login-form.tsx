"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="username">
          账号
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          defaultValue="admin"
          className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          placeholder="请输入账号"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="password">
          密码
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          defaultValue="admin123"
          className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          placeholder="请输入密码"
        />
      </div>
      {state?.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "登录中…" : "登录"}
      </Button>
    </form>
  );
}
