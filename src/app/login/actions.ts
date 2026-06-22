"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/auth";

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prev: LoginState | undefined,
  formData: FormData
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", {
      username,
      password,
      redirectTo: "/dashboard",
    });
    return {};
  } catch (error) {
    // signIn 成功时会抛出重定向（NEXT_REDIRECT），需要继续向上抛出。
    if (error instanceof AuthError) {
      return { error: "账号或密码错误，请重试。" };
    }
    throw error;
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
