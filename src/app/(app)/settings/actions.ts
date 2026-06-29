"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { SystemRole } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireFullUser, isCompanyAdmin } from "@/lib/access";
import { SYSTEM_ROLE_VALUES } from "@/lib/labels";

export interface ActionState {
  error?: string;
  ok?: boolean;
}

const roleSet = new Set<string>(SYSTEM_ROLE_VALUES);

const createUserSchema = z.object({
  username: z.string().min(2, "用户名至少 2 个字符").max(40),
  displayName: z.string().min(1, "请填写姓名").max(40),
  email: z.string().email("邮箱格式不正确").optional().or(z.literal("")),
  password: z.string().min(6, "密码至少 6 位"),
  systemRole: z.string().refine((r) => roleSet.has(r), "角色无效"),
  departmentId: z.string().optional().or(z.literal("")),
});

/** 创建公司用户（仅公司管理员/超管）。 */
export async function createUserAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const me = await requireFullUser();
  if (!isCompanyAdmin(me.systemRole)) {
    return { error: "无权限：仅公司管理员可创建用户" };
  }
  if (!me.companyId) return { error: "当前账号未归属公司，无法创建用户" };

  const parsed = createUserSchema.safeParse({
    username: formData.get("username"),
    displayName: formData.get("displayName"),
    email: formData.get("email") ?? "",
    password: formData.get("password"),
    systemRole: formData.get("systemRole"),
    departmentId: formData.get("departmentId") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数有误" };
  }
  const d = parsed.data;

  const exists = await prisma.user.findUnique({ where: { username: d.username } });
  if (exists) return { error: "用户名已存在" };
  if (d.email) {
    const emailUsed = await prisma.user.findUnique({ where: { email: d.email } });
    if (emailUsed) return { error: "邮箱已被使用" };
  }

  const passwordHash = await bcrypt.hash(d.password, 10);
  await prisma.user.create({
    data: {
      username: d.username,
      displayName: d.displayName,
      name: d.displayName,
      email: d.email || null,
      passwordHash,
      systemRole: d.systemRole as SystemRole,
      companyId: me.companyId,
      departmentId: d.departmentId || null,
    },
  });

  revalidatePath("/org");
  return { ok: true };
}

const createDeptSchema = z.object({
  name: z.string().min(1, "请填写部门名称").max(40),
  parentId: z.string().optional().or(z.literal("")),
});

/** 创建部门（仅公司管理员/超管）。 */
export async function createDepartmentAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const me = await requireFullUser();
  if (!isCompanyAdmin(me.systemRole)) return { error: "无权限" };
  if (!me.companyId) return { error: "当前账号未归属公司" };

  const parsed = createDeptSchema.safeParse({
    name: formData.get("name"),
    parentId: formData.get("parentId") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数有误" };
  }

  const dup = await prisma.department.findFirst({
    where: { companyId: me.companyId, name: parsed.data.name },
  });
  if (dup) return { error: "同名部门已存在" };

  const parentId = parsed.data.parentId || null;
  if (parentId) {
    const parent = await prisma.department.findFirst({
      where: { id: parentId, companyId: me.companyId },
      select: { id: true },
    });
    if (!parent) return { error: "上级部门无效" };
  }

  await prisma.department.create({
    data: { name: parsed.data.name, companyId: me.companyId, parentId },
  });
  revalidatePath("/org");
  return { ok: true };
}

// ============================================================
// 成员生命周期：编辑（角色/部门/姓名/邮箱/启停用）、重置密码
// ============================================================

const updateUserSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1, "请填写姓名").max(40),
  email: z.string().email("邮箱格式不正确").optional().or(z.literal("")),
  systemRole: z.string().refine((r) => roleSet.has(r), "角色无效"),
  departmentId: z.string().optional().or(z.literal("")),
  isActive: z.boolean(),
});

/** 编辑成员资料/角色/部门/启停用（仅公司管理员/超管，限本公司）。 */
export async function updateUserAction(input: {
  userId: string;
  displayName: string;
  email?: string;
  systemRole: string;
  departmentId?: string;
  isActive: boolean;
}): Promise<ActionState> {
  const me = await requireFullUser();
  if (!isCompanyAdmin(me.systemRole)) return { error: "无权限" };
  if (!me.companyId) return { error: "当前账号未归属公司" };

  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数有误" };
  }
  const d = parsed.data;

  const target = await prisma.user.findUnique({
    where: { id: d.userId },
    select: { id: true, companyId: true, systemRole: true },
  });
  if (!target || target.companyId !== me.companyId) {
    return { error: "用户不存在或不属于你的公司" };
  }
  if (target.systemRole === "SUPER_ADMIN") {
    return { error: "不能修改超级管理员账号" };
  }
  if (target.id === me.id) {
    return { error: "不能在此修改自己的账号，请联系其他管理员" };
  }

  if (d.email) {
    const emailUsed = await prisma.user.findFirst({
      where: { email: d.email, id: { not: d.userId } },
      select: { id: true },
    });
    if (emailUsed) return { error: "邮箱已被使用" };
  }

  if (d.departmentId) {
    const dept = await prisma.department.findFirst({
      where: { id: d.departmentId, companyId: me.companyId },
      select: { id: true },
    });
    if (!dept) return { error: "部门无效" };
  }

  await prisma.user.update({
    where: { id: d.userId },
    data: {
      displayName: d.displayName,
      name: d.displayName,
      email: d.email || null,
      systemRole: d.systemRole as SystemRole,
      departmentId: d.departmentId || null,
      isActive: d.isActive,
    },
  });
  revalidatePath("/org");
  return { ok: true };
}

/** 重置成员密码（仅公司管理员/超管，限本公司）。 */
export async function resetUserPasswordAction(input: {
  userId: string;
  password: string;
}): Promise<ActionState> {
  const me = await requireFullUser();
  if (!isCompanyAdmin(me.systemRole)) return { error: "无权限" };
  if (!me.companyId) return { error: "当前账号未归属公司" };

  if (!input.password || input.password.length < 6) {
    return { error: "新密码至少 6 位" };
  }

  const target = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, companyId: true, systemRole: true },
  });
  if (!target || target.companyId !== me.companyId) {
    return { error: "用户不存在或不属于你的公司" };
  }
  if (target.systemRole === "SUPER_ADMIN" && target.id !== me.id) {
    return { error: "不能重置超级管理员密码" };
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  await prisma.user.update({
    where: { id: input.userId },
    data: { passwordHash },
  });
  return { ok: true };
}

// ============================================================
// 部门维护：重命名、删除
// ============================================================

/** 重命名部门（仅公司管理员/超管，限本公司）。 */
export async function renameDepartmentAction(input: {
  departmentId: string;
  name: string;
}): Promise<ActionState> {
  const me = await requireFullUser();
  if (!isCompanyAdmin(me.systemRole)) return { error: "无权限" };
  if (!me.companyId) return { error: "当前账号未归属公司" };

  const name = input.name?.trim();
  if (!name) return { error: "请填写部门名称" };
  if (name.length > 40) return { error: "部门名称过长" };

  const dept = await prisma.department.findFirst({
    where: { id: input.departmentId, companyId: me.companyId },
    select: { id: true },
  });
  if (!dept) return { error: "部门不存在" };

  const dup = await prisma.department.findFirst({
    where: { companyId: me.companyId, name, id: { not: input.departmentId } },
    select: { id: true },
  });
  if (dup) return { error: "同名部门已存在" };

  await prisma.department.update({
    where: { id: input.departmentId },
    data: { name },
  });
  revalidatePath("/org");
  return { ok: true };
}

/** 删除部门（需无成员、无子部门；仅公司管理员/超管）。 */
export async function deleteDepartmentAction(input: {
  departmentId: string;
}): Promise<ActionState> {
  const me = await requireFullUser();
  if (!isCompanyAdmin(me.systemRole)) return { error: "无权限" };
  if (!me.companyId) return { error: "当前账号未归属公司" };

  const dept = await prisma.department.findFirst({
    where: { id: input.departmentId, companyId: me.companyId },
    select: { id: true, _count: { select: { users: true } } },
  });
  if (!dept) return { error: "部门不存在" };
  if (dept._count.users > 0) {
    return { error: "该部门下还有成员，请先调整成员部门" };
  }
  const childCount = await prisma.department.count({
    where: { companyId: me.companyId, parentId: input.departmentId },
  });
  if (childCount > 0) {
    return { error: "该部门下还有子部门，请先删除子部门" };
  }

  await prisma.department.delete({ where: { id: input.departmentId } });
  revalidatePath("/org");
  return { ok: true };
}
