"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";

const createProjectSchema = z.object({
  name: z.string().min(2, "项目名称至少 2 个字"),
  description: z.string().optional(),
  goal: z.string().optional(),
  businessBackground: z.string().optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).default("P2"),
});

export interface CreateProjectState {
  error?: string;
}

export async function createProjectAction(
  _prev: CreateProjectState | undefined,
  formData: FormData
): Promise<CreateProjectState> {
  const user = await requireUser();

  const parsed = createProjectSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    goal: formData.get("goal") || undefined,
    businessBackground: formData.get("businessBackground") || undefined,
    priority: formData.get("priority") || "P2",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "参数有误" };
  }

  const projectCode = `PRJ-${Date.now().toString(36).toUpperCase()}`;

  const project = await prisma.project.create({
    data: {
      projectCode,
      name: parsed.data.name,
      description: parsed.data.description,
      goal: parsed.data.goal,
      businessBackground: parsed.data.businessBackground,
      priority: parsed.data.priority,
      status: "ACTIVE",
      ownerId: user.id,
      createdById: user.id,
      members: { create: { userId: user.id, role: "PROJECT_OWNER" } },
    },
  });

  revalidatePath("/project");
  redirect(`/project/${project.id}`);
}
