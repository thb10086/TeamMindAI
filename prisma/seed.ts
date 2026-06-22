import {
  PrismaClient,
  AgentRole,
  SystemRole,
  ProjectStatus,
  Priority,
} from "@prisma/client";
import bcrypt from "bcryptjs";

import { AGENT_EMPLOYEES } from "../src/lib/ai/employees";

const prisma = new PrismaClient();

async function main() {
  // 1) 演示公司
  let company = await prisma.company.findFirst({
    where: { name: "TeamMind 演示公司" },
  });
  if (!company) {
    company = await prisma.company.create({
      data: { name: "TeamMind 演示公司", description: "用于本地开发与演示" },
    });
  }
  const companyId = company.id;

  // 2) 管理员用户（admin / admin123）
  const passwordHash = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: { companyId: company.id, passwordHash, isActive: true },
    create: {
      username: "admin",
      email: "admin@teammind.local",
      name: "管理员",
      displayName: "管理员",
      passwordHash,
      systemRole: SystemRole.SUPER_ADMIN,
      companyId: company.id,
    },
  });

  // 2.1) 演示团队：核心成员加入示例项目（覆盖各岗位，便于演示「任务分配给谁」）；
  //      「人才池」成员仅属公司、未加入示例项目，用于测试「添加成员」可搜索下拉。密码均为 admin123。
  type Teammate = {
    username: string;
    displayName: string;
    email: string;
    systemRole: SystemRole;
  };

  const coreTeam: Teammate[] = [
    { username: "product", displayName: "周产品", email: "product@teammind.local", systemRole: SystemRole.PRODUCT_OWNER },
    { username: "tech", displayName: "张架构", email: "tech@teammind.local", systemRole: SystemRole.TECH_OWNER },
    { username: "designer", displayName: "李设计", email: "designer@teammind.local", systemRole: SystemRole.DESIGNER },
    { username: "frontend", displayName: "王前端", email: "frontend@teammind.local", systemRole: SystemRole.DEVELOPER },
    { username: "backend", displayName: "陈后端", email: "backend@teammind.local", systemRole: SystemRole.DEVELOPER },
    { username: "tester", displayName: "赵测试", email: "tester@teammind.local", systemRole: SystemRole.TESTER },
  ];

  const benchTeam: Teammate[] = [
    { username: "frontend2", displayName: "刘前端", email: "frontend2@teammind.local", systemRole: SystemRole.DEVELOPER },
    { username: "designer2", displayName: "郑设计", email: "designer2@teammind.local", systemRole: SystemRole.DESIGNER },
    { username: "ops", displayName: "孙运维", email: "ops@teammind.local", systemRole: SystemRole.OPERATOR },
    { username: "qa2", displayName: "钱测试", email: "qa2@teammind.local", systemRole: SystemRole.TESTER },
  ];

  async function upsertTeammate(t: Teammate) {
    return prisma.user.upsert({
      where: { username: t.username },
      update: {
        companyId,
        systemRole: t.systemRole,
        displayName: t.displayName,
        name: t.displayName,
        passwordHash,
        isActive: true,
      },
      create: {
        username: t.username,
        email: t.email,
        name: t.displayName,
        displayName: t.displayName,
        passwordHash,
        systemRole: t.systemRole,
        companyId,
      },
    });
  }

  const coreMembers: { id: string; role: SystemRole }[] = [];
  for (const t of coreTeam) {
    const u = await upsertTeammate(t);
    coreMembers.push({ id: u.id, role: t.systemRole });
  }
  // 人才池：仅创建公司用户，不加入示例项目
  for (const t of benchTeam) {
    await upsertTeammate(t);
  }

  // 3) 8 个 AI 员工配置（来自 src/lib/ai/employees.ts）
  for (const agent of Object.values(AGENT_EMPLOYEES)) {
    const roleEnum =
      AgentRole[agent.roleType.toUpperCase() as keyof typeof AgentRole];
    const model =
      agent.modelTier === "chat"
        ? process.env.AGENTLLM_CHAT_MODEL ?? "claude-sonnet"
        : process.env.AGENTLLM_FAST_MODEL ?? "gemini-3.5-flash";

    await prisma.agentConfig.upsert({
      where: { roleType: roleEnum },
      update: {
        name: agent.name,
        description: agent.description,
        model,
        tools: agent.tools,
        requiresHumanApproval: agent.requiresHumanApproval,
      },
      create: {
        roleType: roleEnum,
        name: agent.name,
        description: agent.description,
        model,
        tools: agent.tools,
        requiresHumanApproval: agent.requiresHumanApproval,
      },
    });
  }

  // 4) 示例项目 + 成员
  const project = await prisma.project.upsert({
    where: { projectCode: "DEMO-001" },
    update: {},
    create: {
      projectCode: "DEMO-001",
      name: "AI 企业大脑平台",
      description: "面向初创团队的多 Agent 智能协作中台",
      businessBackground:
        "内部需求不清、任务不明、信息差严重，缺乏专职产品/项目经理。",
      goal: "通过 AI 员工把模糊想法变成清晰需求、可执行任务并沉淀为项目记忆。",
      status: ProjectStatus.ACTIVE,
      priority: Priority.P1,
      ownerId: admin.id,
      companyId: company.id,
      createdById: admin.id,
    },
  });

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId: admin.id } },
    update: {},
    create: {
      projectId: project.id,
      userId: admin.id,
      role: SystemRole.PROJECT_OWNER,
    },
  });

  for (const tm of coreMembers) {
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId: tm.id } },
      update: { role: tm.role },
      create: { projectId: project.id, userId: tm.id, role: tm.role },
    });
  }

  console.log("✅ Seed 完成");
  console.log("   登录账号：admin / admin123");
  console.log(`   公司：${company.name}`);
  console.log(`   示例项目：${project.projectCode} ${project.name}`);
  console.log(`   AI 员工配置：${Object.keys(AGENT_EMPLOYEES).length} 个`);
  console.log(
    `   项目团队：${coreTeam.length} 人（product/tech/designer/frontend/backend/tester，密码 admin123）`
  );
  console.log(
    `   人才池（未加入项目，可在「项目成员」搜索添加）：${benchTeam.length} 人（frontend2/designer2/ops/qa2）`
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
