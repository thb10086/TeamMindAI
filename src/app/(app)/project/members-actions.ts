"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SystemRole } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireFullUser, canManageProjectMembers } from "@/lib/access";
import { PROJECT_ROLE_VALUES } from "@/lib/labels";

export interface MemberActionState {
  error?: string;
  ok?: boolean;
}

const roleSet = new Set<string>(PROJECT_ROLE_VALUES);

const memberSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  role: z.string().refine((r) => roleSet.has(r), "项目角色无效"),
});

/** 把项目负责人/技术/产品角色同步到 Project 去规范化字段（供看板/工作台显示）。 */
async function syncOwnerFields(projectId: string): Promise<void> {
  const members = await prisma.projectMember.findMany({
    where: { projectId },
    select: { userId: true, role: true },
  });
  const holder = (role: SystemRole) =>
    members.find((m) => m.role === role)?.userId ?? null;
  await prisma.project.update({
    where: { id: projectId },
    data: {
      ownerId: holder("PROJECT_OWNER"),
      techOwnerId: holder("TECH_OWNER"),
      productOwnerId: holder("PRODUCT_OWNER"),
    },
  });
}

/** 添加项目成员（公司管理员或项目负责人）。 */
export async function addProjectMemberAction(input: {
  projectId: string;
  userId: string;
  role: string;
}): Promise<MemberActionState> {
  const me = await requireFullUser();
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数有误" };
  }
  const { projectId, userId, role } = parsed.data;

  if (!(await canManageProjectMembers(projectId, me))) {
    return { error: "无权限管理该项目成员" };
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  if (!target) return { error: "用户不存在" };
  if (me.companyId && target.companyId !== me.companyId) {
    return { error: "不能添加其它公司的用户" };
  }

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    update: { role: role as SystemRole },
    create: { projectId, userId, role: role as SystemRole },
  });
  await syncOwnerFields(projectId);
  revalidatePath(`/project/${projectId}`);
  return { ok: true };
}

/** 修改成员项目角色。 */
export async function updateProjectMemberRoleAction(input: {
  projectId: string;
  userId: string;
  role: string;
}): Promise<MemberActionState> {
  const me = await requireFullUser();
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数有误" };
  }
  const { projectId, userId, role } = parsed.data;

  if (!(await canManageProjectMembers(projectId, me))) {
    return { error: "无权限" };
  }
  await prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    data: { role: role as SystemRole },
  });
  await syncOwnerFields(projectId);
  revalidatePath(`/project/${projectId}`);
  return { ok: true };
}

/** 移除项目成员（不允许移除唯一的项目负责人）。 */
export async function removeProjectMemberAction(input: {
  projectId: string;
  userId: string;
}): Promise<MemberActionState> {
  const me = await requireFullUser();
  const { projectId, userId } = input;
  if (!projectId || !userId) return { error: "参数有误" };

  if (!(await canManageProjectMembers(projectId, me))) {
    return { error: "无权限" };
  }

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!member) return { error: "成员不存在" };
  if (member.role === "PROJECT_OWNER") {
    const owners = await prisma.projectMember.count({
      where: { projectId, role: "PROJECT_OWNER" },
    });
    if (owners <= 1) return { error: "不能移除唯一的项目负责人" };
  }

  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId } },
  });
  await syncOwnerFields(projectId);
  revalidatePath(`/project/${projectId}`);
  return { ok: true };
}
