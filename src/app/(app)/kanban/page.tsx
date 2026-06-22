import { listProjectsForUser } from "@/lib/projects";
import { listTasksForUser } from "@/lib/tasks";
import { listRequirementsForProjects } from "@/lib/requirements";
import { listAssignableUsers, userDisplayName } from "@/lib/org";
import { canLeadProject, requireFullUser } from "@/lib/access";
import {
  KanbanBoard,
  type AssignMember,
  type CreatableRequirement,
  type KanbanTask,
} from "./kanban-board";

export const metadata = { title: "任务看板 · TeamMindAI" };

export default async function KanbanPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const user = await requireFullUser();
  const { project } = await searchParams;

  const [projectRows, taskRows] = await Promise.all([
    listProjectsForUser(user.id),
    listTasksForUser(user.id, project),
  ]);

  const projects = projectRows.map((p: { id: string; name: string }) => ({
    id: p.id,
    name: p.name,
  }));

  const tasks: KanbanTask[] = taskRows.map((t: (typeof taskRows)[number]) => ({
    id: t.id,
    taskCode: t.taskCode,
    title: t.title,
    status: t.status,
    priority: t.priority,
    taskType: t.taskType,
    isAiGenerated: t.isAiGenerated,
    estimatedHours: t.estimatedHours != null ? Number(t.estimatedHours) : null,
    requirement: t.requirement
      ? { id: t.requirement.id, title: t.requirement.title }
      : null,
    projectId: t.projectId,
    projectName: t.project.name,
    suggestedRole: t.suggestedRole,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee ? userDisplayName(t.assignee) : null,
    dueTime: t.dueTime ? t.dueTime.toISOString() : null,
  }));

  // 指派候选人 = 全公司在职成员（被指派时自动加入项目）；按系统角色匹配 AI 建议角色。
  // 「能否指派」仍按任务所属项目的主管权限判定。
  const projectIds = Array.from(
    new Set(taskRows.map((t: (typeof taskRows)[number]) => t.projectId))
  );
  const [userRows, leadFlags] = await Promise.all([
    user.companyId ? listAssignableUsers(user.companyId) : Promise.resolve([]),
    Promise.all(
      projectIds.map(
        async (id) => [id, await canLeadProject(id, user)] as const
      )
    ),
  ]);

  const members: AssignMember[] = userRows.map((u) => ({
    id: u.id,
    name: userDisplayName(u),
    role: u.systemRole,
  }));
  const leadProjectIds = leadFlags
    .filter(([, ok]) => ok)
    .map(([id]) => id);

  // 手动建任务的需求选择器：仅取当前用户可主管项目下的需求。
  const reqRows = await listRequirementsForProjects(leadProjectIds);
  const creatableRequirements: CreatableRequirement[] = reqRows.map((r) => ({
    id: r.id,
    title: r.title,
    projectId: r.projectId,
  }));

  return (
    <KanbanBoard
      tasks={tasks}
      projects={projects}
      selectedProjectId={project}
      members={members}
      leadProjectIds={leadProjectIds}
      requirements={creatableRequirements}
    />
  );
}
