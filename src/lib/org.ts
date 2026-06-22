import { prisma } from "@/lib/db";

/** 公司全部用户（用户管理列表）。 */
export function listCompanyUsers(companyId: string) {
  return prisma.user.findMany({
    where: { companyId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      name: true,
      email: true,
      systemRole: true,
      isActive: true,
      department: { select: { id: true, name: true } },
    },
  });
}

/** 公司部门列表（含成员数）。 */
export function listDepartments(companyId: string) {
  return prisma.department.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      parentId: true,
      _count: { select: { users: true } },
    },
  });
}

/** 项目成员（含用户基础信息与项目角色）。 */
export function listProjectMembers(projectId: string) {
  return prisma.projectMember.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          name: true,
          email: true,
          systemRole: true,
        },
      },
    },
  });
}

/** 多个项目的成员（用于看板按项目分组的指派下拉）。返回含项目角色与用户信息。 */
export function listMembersForProjects(projectIds: string[]) {
  if (projectIds.length === 0) return Promise.resolve([]);
  return prisma.projectMember.findMany({
    where: { projectId: { in: projectIds } },
    orderBy: { createdAt: "asc" },
    select: {
      projectId: true,
      role: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          name: true,
          systemRole: true,
        },
      },
    },
  });
}

/** 公司全部在职用户，用于任务指派候选人（不限于项目成员；被指派时自动入项目）。 */
export function listAssignableUsers(companyId: string) {
  return prisma.user.findMany({
    where: { companyId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      name: true,
      systemRole: true,
    },
  });
}

/** 公司内尚未加入该项目的用户（用于「添加成员」下拉）。 */
export function listAddableUsers(companyId: string, projectId: string) {
  return prisma.user.findMany({
    where: { companyId, memberships: { none: { projectId } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, displayName: true, name: true },
  });
}

/** 显示用：优先 displayName，回退 name / username。 */
export function userDisplayName(u: {
  displayName?: string | null;
  name?: string | null;
  username: string;
}): string {
  return u.displayName || u.name || u.username;
}
