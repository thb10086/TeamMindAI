import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/** 返回当前会话（可能为 null）。 */
export async function getSession() {
  return auth();
}

/** 要求已登录，否则重定向到登录页。返回会话中的精简用户。 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user;
}

/** 读取当前登录用户的完整记录（含项目成员关系）。 */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.user.findUnique({
    where: { id: session.user.id },
  });
}
