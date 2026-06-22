/** 状态/优先级的中文标签与配色（与 Prisma 枚举值对应）。 */

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  PLANNING: "规划中",
  ACTIVE: "进行中",
  PAUSED: "已暂停",
  DONE: "已完成",
  ARCHIVED: "已归档",
};

export const REQUIREMENT_STATUS_LABEL: Record<string, string> = {
  IDEA_POOL: "想法池",
  CLARIFYING: "待澄清",
  REVIEWING: "待评审",
  CONFIRMED: "已确认",
  SCHEDULING: "待排期",
  DEVELOPING: "开发中",
  TESTING: "测试中",
  ACCEPTING: "待验收",
  ONLINE: "已上线",
  ARCHIVED: "已归档",
  REJECTED: "已驳回",
  PAUSED: "已暂停",
  MERGED: "已合并",
  SPLIT: "已拆分",
};

export const TASK_STATUS_LABEL: Record<string, string> = {
  TODO: "待开始",
  IN_PROGRESS: "进行中",
  INTEGRATING: "待联调",
  TESTING: "待测试",
  ACCEPTING: "待验收",
  DONE: "已完成",
  BLOCKED: "阻塞中",
  CANCELLED: "已取消",
  DELAYED: "延期中",
};

export const PRIORITY_LABEL: Record<string, string> = {
  P0: "P0 紧急",
  P1: "P1 高",
  P2: "P2 中",
  P3: "P3 低",
};

export const TASK_TYPE_LABEL: Record<string, string> = {
  PRODUCT: "产品",
  UI: "设计",
  FRONTEND: "前端",
  BACKEND: "后端",
  ALGORITHM: "算法",
  TEST: "测试",
  OPS: "运维",
  DATA: "数据",
  DOC: "文档",
  ACCEPTANCE: "验收",
};

/** 系统/项目角色中文标签（与 SystemRole 枚举对应）。 */
export const SYSTEM_ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "超级管理员",
  COMPANY_ADMIN: "公司管理员",
  PROJECT_OWNER: "项目负责人",
  PRODUCT_OWNER: "产品负责人",
  TECH_OWNER: "技术负责人",
  DESIGNER: "UI 设计",
  DEVELOPER: "开发",
  TESTER: "测试",
  OPERATOR: "运营",
  SALES: "销售",
  GUEST: "访客",
};

/** 可分配为项目成员的角色（项目内角色集合）。 */
export const PROJECT_ROLE_VALUES = [
  "PROJECT_OWNER",
  "TECH_OWNER",
  "PRODUCT_OWNER",
  "DESIGNER",
  "DEVELOPER",
  "TESTER",
  "OPERATOR",
  "GUEST",
] as const;

/** 可在用户管理中创建/指派的系统角色（不含超级管理员）。 */
export const SYSTEM_ROLE_VALUES = [
  "COMPANY_ADMIN",
  "PROJECT_OWNER",
  "PRODUCT_OWNER",
  "TECH_OWNER",
  "DESIGNER",
  "DEVELOPER",
  "TESTER",
  "OPERATOR",
  "SALES",
  "GUEST",
] as const;

/** 角色标签底色（Tailwind class）。 */
export function systemRoleClass(role: string): string {
  switch (role) {
    case "SUPER_ADMIN":
    case "COMPANY_ADMIN":
      return "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300";
    case "PROJECT_OWNER":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
    case "TECH_OWNER":
      return "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300";
    case "PRODUCT_OWNER":
      return "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300";
    case "DESIGNER":
      return "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300";
    case "DEVELOPER":
      return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
    case "TESTER":
      return "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** 把 AI「建议承接角色」（自由文本）映射为系统角色，用于默认指派候选人。 */
export function mapSuggestedRole(text: string | null | undefined): string {
  const s = (text ?? "").toLowerCase();
  if (/(ui|设计|视觉|design|ux|交互|原型)/.test(s)) return "DESIGNER";
  if (/(测试|qa|test|质量)/.test(s)) return "TESTER";
  if (/(产品|product|pm|需求)/.test(s)) return "PRODUCT_OWNER";
  if (/(架构|技术负责|架构师|tech\s*lead|cto)/.test(s)) return "TECH_OWNER";
  if (/(运维|ops|devops|部署|sre)/.test(s)) return "OPERATOR";
  return "DEVELOPER";
}

/** 操作日志动作的中文标签。 */
export const OPERATION_LABEL: Record<string, string> = {
  TASK_ASSIGNED: "分配负责人",
  TASK_STATUS_CHANGED: "状态变更",
  TASK_COMMENTED: "评论",
  REQUIREMENT_CONFIRMED: "确认需求",
  REQUIREMENT_ONLINE: "需求上线",
  DESIGN_CREATED: "发起界面设计",
  DESIGN_GENERATED: "AI 生成界面",
  DESIGN_ASSIGNED: "指派设计师",
  DESIGN_STATUS_CHANGED: "设计状态变更",
};

/** 界面设计状态标签与配色。 */
export const DESIGN_STATUS_LABEL: Record<string, string> = {
  DRAFT: "AI 草案",
  DESIGNING: "设计中",
  IN_REVIEW: "评审中",
  APPROVED: "已定稿",
  ARCHIVED: "已归档",
};

export const DESIGN_STATUS_VALUES = [
  "DRAFT",
  "DESIGNING",
  "IN_REVIEW",
  "APPROVED",
  "ARCHIVED",
] as const;

export function designStatusClass(status: string): string {
  switch (status) {
    case "DRAFT":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
    case "DESIGNING":
      return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
    case "IN_REVIEW":
      return "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300";
    case "APPROVED":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** 看板列顺序（不含已取消）。 */
export const KANBAN_STATUSES = [
  "TODO",
  "IN_PROGRESS",
  "INTEGRATING",
  "TESTING",
  "ACCEPTING",
  "DONE",
  "BLOCKED",
] as const;

/** 任务状态对应的标签底色（Tailwind class）。 */
export function taskStatusClass(status: string): string {
  switch (status) {
    case "DONE":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
    case "IN_PROGRESS":
    case "INTEGRATING":
    case "TESTING":
    case "ACCEPTING":
      return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
    case "BLOCKED":
    case "DELAYED":
      return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
    case "CANCELLED":
      return "bg-muted text-muted-foreground line-through";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** GraphRAG 记忆实体类型中文标签（与 MemoryEntityType 枚举对应）。 */
export const MEMORY_ENTITY_TYPE_LABEL: Record<string, string> = {
  PERSON: "人员",
  REQUIREMENT: "需求",
  TASK: "任务",
  DECISION: "决策",
  FEATURE: "功能",
  MODULE: "模块",
  RISK: "风险",
  RULE: "规则",
  CUSTOMER: "客户",
  TECH: "技术",
  METRIC: "指标",
  MEETING: "会议",
  OTHER: "其他",
};

/** 记忆实体类型对应的标签配色（Tailwind class）。 */
export function memoryEntityTypeClass(type: string): string {
  switch (type) {
    case "PERSON":
      return "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300";
    case "REQUIREMENT":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
    case "TASK":
      return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
    case "DECISION":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
    case "FEATURE":
      return "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300";
    case "MODULE":
    case "TECH":
      return "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300";
    case "RISK":
      return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
    case "RULE":
      return "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300";
    case "CUSTOMER":
      return "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300";
    case "METRIC":
      return "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300";
    case "MEETING":
      return "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** 需求状态对应的标签底色（Tailwind class）。 */
export function requirementStatusClass(status: string): string {
  switch (status) {
    case "IDEA_POOL":
    case "ARCHIVED":
      return "bg-muted text-muted-foreground";
    case "CLARIFYING":
    case "REVIEWING":
    case "ACCEPTING":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
    case "CONFIRMED":
    case "ONLINE":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
    case "DEVELOPING":
    case "TESTING":
    case "SCHEDULING":
      return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
    case "REJECTED":
      return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}
