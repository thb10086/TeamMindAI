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
