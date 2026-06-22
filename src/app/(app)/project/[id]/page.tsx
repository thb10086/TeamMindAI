import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Brain,
  CircleDot,
  KanbanSquare,
  LayoutDashboard,
  LayoutTemplate,
  ListChecks,
  Sparkles,
  Users,
} from "lucide-react";

import { requireFullUser, canManageProjectMembers } from "@/lib/access";
import { getProjectForUser, getProjectStats } from "@/lib/projects";
import {
  listProjectMembers,
  listAddableUsers,
  userDisplayName,
} from "@/lib/org";
import { getProjectMemoryGraph } from "@/lib/memory/queries";
import {
  ProjectMembersPanel,
  type MemberVM,
  type AddableVM,
} from "./members-panel";
import {
  MemoryGraphView,
  type MemoryEntityVM,
  type MemoryRelationVM,
  type MemoryCommunityVM,
} from "../../memory/memory-explorer";
import {
  ProjectDesignsPanel,
  type ProjectDesignVM,
  type DesignableReqVM,
} from "./project-designs-panel";
import {
  listDesignsForProject,
  listDesignableRequirements,
} from "@/lib/designs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PRIORITY_LABEL,
  PROJECT_STATUS_LABEL,
  REQUIREMENT_STATUS_LABEL,
  TASK_STATUS_LABEL,
} from "@/lib/labels";

export default async function ProjectSpacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const user = await requireFullUser();
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();

  const activeTab =
    tab === "memory"
      ? "memory"
      : tab === "members"
        ? "members"
        : tab === "design"
          ? "design"
          : "overview";
  const stats = await getProjectStats(id);

  let memEntities: MemoryEntityVM[] = [];
  let memRelations: MemoryRelationVM[] = [];
  let memCommunities: MemoryCommunityVM[] = [];
  if (activeTab === "memory") {
    const graph = await getProjectMemoryGraph(id);
    memEntities = graph.entities.map((e) => ({
      id: e.id,
      type: e.type,
      name: e.name,
      description: e.description,
      importanceScore: e.importanceScore,
      degree: e.degree,
      mentionCount: e.mentionCount,
      communityId: e.communityId,
    }));
    memRelations = graph.relations.map((r) => ({
      id: r.id,
      type: r.type,
      description: r.description,
      weight: r.weight,
      sourceId: r.sourceEntityId,
      sourceName: r.sourceEntity.name,
      sourceType: r.sourceEntity.type,
      targetId: r.targetEntityId,
      targetName: r.targetEntity.name,
      targetType: r.targetEntity.type,
    }));
    memCommunities = graph.communities.map((c) => ({
      id: c.id,
      level: c.level,
      title: c.title,
      summary: c.summary,
      importanceScore: c.importanceScore,
      entityCount: c.entityCount,
    }));
  }

  let members: MemberVM[] = [];
  let addable: AddableVM[] = [];
  let canManage = false;
  if (activeTab === "members") {
    const [rawMembers, mgr] = await Promise.all([
      listProjectMembers(id),
      canManageProjectMembers(id, user),
    ]);
    canManage = mgr;
    members = rawMembers.map((m) => ({
      userId: m.userId,
      role: m.role,
      name: userDisplayName(m.user),
      username: m.user.username,
      email: m.user.email,
      systemRole: m.user.systemRole,
    }));
    if (canManage && project.companyId) {
      const raw = await listAddableUsers(project.companyId, id);
      addable = raw.map((u) => ({
        id: u.id,
        name: userDisplayName(u),
        username: u.username,
      }));
    }
  }

  let designs: ProjectDesignVM[] = [];
  let designableReqs: DesignableReqVM[] = [];
  if (activeTab === "design") {
    const [ds, rs] = await Promise.all([
      listDesignsForProject(id),
      listDesignableRequirements(id),
    ]);
    designs = ds.map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      version: d.version,
      screenCount: d._count.screens,
      requirementId: d.requirement?.id ?? null,
      requirementTitle: d.requirement?.title ?? null,
      assigneeName: d.assignee ? userDisplayName(d.assignee) : null,
      updatedAt: d.updatedAt.toISOString(),
    }));
    designableReqs = rs.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
    }));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* 头部 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
            <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
              {PROJECT_STATUS_LABEL[project.status] ?? project.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.projectCode} · 优先级 {PRIORITY_LABEL[project.priority]}
          </p>
        </div>
        <Button asChild>
          <Link href={`/align?project=${project.id}`}>
            <Sparkles className="size-4" />
            进入 AI 对齐室
          </Link>
        </Button>
      </div>

      {/* 分页签 */}
      <div className="flex gap-1 border-b">
        <TabLink
          href={`/project/${project.id}`}
          active={activeTab === "overview"}
          icon={LayoutDashboard}
        >
          概览
        </TabLink>
        <TabLink
          href={`/project/${project.id}?tab=design`}
          active={activeTab === "design"}
          icon={LayoutTemplate}
        >
          界面设计
        </TabLink>
        <TabLink
          href={`/project/${project.id}?tab=memory`}
          active={activeTab === "memory"}
          icon={Brain}
        >
          记忆图谱
        </TabLink>
        <TabLink
          href={`/project/${project.id}?tab=members`}
          active={activeTab === "members"}
          icon={Users}
        >
          成员
        </TabLink>
      </div>

      {activeTab === "memory" ? (
        <MemoryGraphView
          projectId={project.id}
          entities={memEntities}
          relations={memRelations}
          communities={memCommunities}
        />
      ) : activeTab === "members" ? (
        <ProjectMembersPanel
          projectId={project.id}
          members={members}
          addable={addable}
          canManage={canManage}
        />
      ) : activeTab === "design" ? (
        <ProjectDesignsPanel designs={designs} requirements={designableReqs} />
      ) : (
        <div className="space-y-6">
      {/* 目标与背景 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">项目目标</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {project.goal || "暂未填写项目目标。"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">业务背景</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {project.businessBackground || "暂未填写业务背景。"}
          </CardContent>
        </Card>
      </div>

      {/* 指标 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="需求总数" value={project._count.requirements} />
        <Metric label="任务总数" value={project._count.tasks} />
        <Metric label="任务完成率" value={`${stats.progress}%`} />
        <Metric label="项目成员" value={project._count.members} />
      </div>

      {/* 分布 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">需求状态分布</CardTitle>
            <CardDescription>共 {project._count.requirements} 条需求</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.reqByStatus.length === 0 ? (
              <EmptyDist hint="还没有需求，去 AI 对齐室生成第一条标准需求卡片。" />
            ) : (
              <ul className="space-y-2 text-sm">
                {stats.reqByStatus.map((r) => (
                  <li key={r.status} className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {REQUIREMENT_STATUS_LABEL[r.status] ?? r.status}
                    </span>
                    <span className="font-medium">{r._count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">任务状态分布</CardTitle>
            <CardDescription>共 {project._count.tasks} 个任务</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.taskByStatus.length === 0 ? (
              <EmptyDist hint="需求评审通过后，可由 AI 项目经理拆解任务。" />
            ) : (
              <ul className="space-y-2 text-sm">
                {stats.taskByStatus.map((t) => (
                  <li key={t.status} className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {TASK_STATUS_LABEL[t.status] ?? t.status}
                    </span>
                    <span className="font-medium">{t._count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 快捷入口 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">快捷操作</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <QuickAction href={`/align?project=${project.id}`} icon={Sparkles} label="AI 对齐需求" />
          <QuickAction href="/requirement" icon={CircleDot} label="需求中心" />
          <QuickAction href="/kanban" icon={KanbanSquare} label="任务看板" />
          <QuickAction href="/report" icon={ListChecks} label="项目周报" />
        </CardContent>
      </Card>
        </div>
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  icon: Icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors " +
        (active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground")
      }
    >
      <Icon className="size-4" />
      {children}
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyDist({ hint }: { hint: string }) {
  return <p className="text-sm text-muted-foreground">{hint}</p>;
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={href}>
        <Icon className="size-4" />
        {label}
        <ArrowRight className="size-3" />
      </Link>
    </Button>
  );
}
