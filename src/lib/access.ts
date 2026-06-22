import { redirect } from "next/navigation";
import type { SystemRole } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/** 公司级管理角色。 */
const COMPANY_ADMIN_ROLES: SystemRole[] = ["SUPER_ADMIN", "COMPANY_ADMIN"];

/** 项目主管角色：可确认需求、分配任务、做关键节点确认。 */
const PROJECT_LEAD_ROLES: SystemRole[] = [
  "PROJECT_OWNER",
  "TECH_OWNER",
  "PRODUCT_OWNER",
];

/** 是否为公司管理员/超级管理员。 */
export function isCompanyAdmin(role: SystemRole): boolean {
  return COMPANY_ADMIN_ROLES.includes(role);
}

/** 要求已登录并返回完整用户记录（含 companyId / systemRole）；未登录则跳转登录。 */
export async function requireFullUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/login");
  return user;
}

/** 当前用户在某项目中的成员关系（含项目角色），非成员返回 null。 */
export function getProjectMembership(projectId: string, userId: string) {
  return prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

/**
 * 是否可管理该项目成员：公司管理员/超管，或该项目的项目负责人。
 * 用于成员增删改、关键配置等高权限动作的服务端校验。
 */
export async function canManageProjectMembers(
  projectId: string,
  user: { id: string; systemRole: SystemRole }
): Promise<boolean> {
  if (isCompanyAdmin(user.systemRole)) return true;
  const membership = await getProjectMembership(projectId, user.id);
  return membership?.role === "PROJECT_OWNER";
}

/**
 * 是否可在该项目执行主管动作（确认需求 / 分配任务 / 关键确认）：
 * 公司管理员，或项目内主管角色（项目/技术/产品负责人）。
 */
export async function canLeadProject(
  projectId: string,
  user: { id: string; systemRole: SystemRole }
): Promise<boolean> {
  if (isCompanyAdmin(user.systemRole)) return true;
  const membership = await getProjectMembership(projectId, user.id);
  return membership ? PROJECT_LEAD_ROLES.includes(membership.role) : false;
}
