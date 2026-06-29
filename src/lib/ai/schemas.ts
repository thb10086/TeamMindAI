import { z } from "zod";

/**
 * AI 结构化输出 Schema（用于 generateObject 落库）。
 * 对应架构文档 §6.6「结构化输出规范」与产品原型的需求/任务结构。
 */

export const PrioritySchema = z.enum(["P0", "P1", "P2", "P3"]);

/** 标准需求卡片草案（AI 产品经理输出）。 */
export const RequirementDraftSchema = z.object({
  /** 是否信息已充足、可以生成完整需求卡片 */
  ready: z
    .boolean()
    .describe("信息是否充足到可以形成完整需求卡片；不足则为 false"),
  title: z.string().describe("需求名称，简洁可检索"),
  background: z.string().describe("业务背景"),
  problem: z.string().describe("当前问题/痛点"),
  targetUser: z.string().describe("目标用户"),
  businessGoal: z.string().describe("业务目标"),
  scope: z.array(z.string()).describe("功能范围（做什么）"),
  outOfScope: z.array(z.string()).describe("不做范围（明确不做什么）"),
  userStory: z.string().describe("用户故事：作为…我希望…以便…"),
  acceptanceCriteria: z.array(z.string()).describe("验收标准，可测试"),
  priority: PrioritySchema.describe("优先级建议"),
  questions: z
    .array(z.string())
    .describe("仍需向提出人澄清的问题；信息充足时为空数组"),
});
export type RequirementDraft = z.infer<typeof RequirementDraftSchema>;

/** 单个澄清问题：支持单选/多选/填空，降低用户输入成本、便于做决策。 */
export const ClarifyQuestionSchema = z.object({
  key: z
    .string()
    .describe("问题稳定标识，英文短横线，如 trigger-scene"),
  question: z.string().describe("问题文本"),
  type: z
    .enum(["single", "multi", "text"])
    .describe("single=单选 multi=多选 text=填空"),
  options: z
    .array(z.string())
    .describe("single/multi 的候选项（2-5 个具体可选项）；text 类型为空数组 []"),
  allowCustom: z
    .boolean()
    .describe("是否允许用户在选项之外补充自定义答案"),
  recommended: z
    .array(z.string())
    .default([])
    .describe(
      "AI 推荐的默认答案，供决策者拿不准时直接采纳：single 给 1 个、multi 给 1 个或多个（必须是 options 中的值）；text 给 1 条建议答案文本；无明确推荐时为空数组 []"
    ),
  recommendReason: z
    .string()
    .default("")
    .describe("推荐该默认答案的简短理由（1 句，便于决策者判断是否采纳）；无推荐时为空字符串"),
});
export type ClarifyQuestion = z.infer<typeof ClarifyQuestionSchema>;

/** AI 澄清的一轮输出：小结 + 本轮问题 + 是否信息充足 + 项目记忆对齐。 */
export const ClarifyTurnSchema = z.object({
  reply: z
    .string()
    .describe("对用户上一条输入的简短回应或小结，可用 Markdown"),
  questions: z
    .array(ClarifyQuestionSchema)
    .describe("本轮澄清问题；信息已充足时为空数组 []"),
  ready: z
    .boolean()
    .describe("信息是否已充足、可以生成标准需求卡片"),
  references: z
    .array(z.string())
    .default([])
    .describe(
      "本轮澄清/推荐所依据的项目记忆要点（必须来自提供的「项目记忆」，逐条简述，不得编造）；无相关记忆时为空数组 []"
    ),
  conflicts: z
    .array(z.string())
    .default([])
    .describe(
      "当前想法与项目记忆中既有需求/决策的潜在冲突或重复点，需人工确认；无冲突时为空数组 []"
    ),
});
export type ClarifyTurn = z.infer<typeof ClarifyTurnSchema>;

/**
 * 竞品/同行决策参考分析（基于联网检索的近 30 天公开资料）。
 * 用于「AI 对齐室」辅助 boss 在需求澄清阶段做决策；所有结论须可追溯到检索资料。
 */
export const CompetitorInsightSchema = z.object({
  name: z.string().describe("竞品/同行/资料主体名称"),
  highlight: z
    .string()
    .describe("近期动向或关键做法（必须来自检索资料，不得编造）"),
  implication: z.string().describe("对当前决策的启示（1 句）"),
});
export type CompetitorInsight = z.infer<typeof CompetitorInsightSchema>;

export const CompetitorAnalysisSchema = z.object({
  summary: z.string().describe("近 30 天行业/竞品动向总体小结（2-4 句）"),
  insights: z
    .array(CompetitorInsightSchema)
    .describe("竞品/同行要点（2-5 条，均须可追溯到检索资料）"),
  recommendation: z
    .string()
    .describe("结合当前决策上下文给出的具体、可执行建议"),
  risks: z.array(z.string()).describe("需注意的风险或不确定性"),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("基于资料充分度与一致性的置信度"),
});
export type CompetitorAnalysis = z.infer<typeof CompetitorAnalysisSchema>;

export const TaskTypeSchema = z.enum([
  "product",
  "ui",
  "frontend",
  "backend",
  "algorithm",
  "test",
  "ops",
  "data",
  "doc",
  "acceptance",
]);

/** 单个拆解任务。 */
export const TaskDraftSchema = z.object({
  title: z.string().describe("任务标题"),
  taskType: TaskTypeSchema.describe("任务类型"),
  description: z.string().describe("执行内容/技术说明"),
  acceptanceCriteria: z.string().describe("该任务的完成/验收标准"),
  estimatedHours: z.number().describe("预计工时（小时）"),
  priority: PrioritySchema,
  suggestedRole: z
    .string()
    .describe("建议承接的角色，如 前端/后端/测试/产品"),
});
export type TaskDraft = z.infer<typeof TaskDraftSchema>;

/** 任务拆解结果（AI 项目经理输出）。 */
export const TaskBreakdownSchema = z.object({
  summary: z.string().describe("对该需求拆解思路的一句话总结"),
  tasks: z.array(TaskDraftSchema).describe("可执行任务列表"),
  risks: z.array(z.string()).describe("拆解过程中识别到的风险或依赖"),
});
export type TaskBreakdown = z.infer<typeof TaskBreakdownSchema>;

// ============================================================
// GraphRAG · 项目记忆图谱抽取
// ============================================================

/** GraphRAG 实体类型（小写），与 Prisma MemoryEntityType 一一对应。 */
export const MemoryEntityTypeSchema = z.enum([
  "person",
  "requirement",
  "task",
  "decision",
  "feature",
  "module",
  "risk",
  "rule",
  "customer",
  "tech",
  "metric",
  "meeting",
  "other",
]);
export type MemoryEntityTypeValue = z.infer<typeof MemoryEntityTypeSchema>;

/** 从文本抽取出的实体。 */
export const ExtractedEntitySchema = z.object({
  name: z
    .string()
    .describe("实体规范名称，简洁、可作为唯一标识，如「邮件通知服务」"),
  type: MemoryEntityTypeSchema.describe("实体类型"),
  description: z.string().describe("基于原文的简短客观描述（1-2 句）"),
});
export type ExtractedEntity = z.infer<typeof ExtractedEntitySchema>;

/** 从文本抽取出的有向关系：source -> target。 */
export const ExtractedRelationSchema = z.object({
  source: z.string().describe("源实体名称，必须出现在 entities 列表中"),
  target: z.string().describe("目标实体名称，必须出现在 entities 列表中"),
  type: z
    .string()
    .describe("关系类型短语，动词性，如 依赖 / 负责 / 阻塞 / 属于 / 影响"),
  description: z.string().describe("基于原文的关系说明（1 句）"),
  weight: z.coerce
    .number()
    .optional()
    .describe("关系强度/置信度 0~1，可省略"),
});
export type ExtractedRelation = z.infer<typeof ExtractedRelationSchema>;

/** 图抽取结果：实体 + 关系（严格基于输入文本，禁止编造）。 */
export const GraphExtractionSchema = z.object({
  entities: z.array(ExtractedEntitySchema).describe("文本中出现的关键实体"),
  relations: z
    .array(ExtractedRelationSchema)
    .describe("实体之间的有向关系；两端实体都必须在 entities 中"),
});
export type GraphExtraction = z.infer<typeof GraphExtractionSchema>;

/** 社区摘要（GraphRAG 全局/概览式检索用）。 */
export const CommunitySummarySchema = z.object({
  title: z.string().describe("社区主题标题，简洁"),
  summary: z.string().describe("该社区涉及实体与关系的概览式摘要"),
  importance: z.coerce
    .number()
    .optional()
    .describe("社区重要性 0~1，可省略"),
});
export type CommunitySummary = z.infer<typeof CommunitySummarySchema>;

// ============================================================
// 界面设计（AI 产品设计师：可交互原型规划）
// ============================================================

/** 界面设计规划：先规划信息架构与需要的界面（屏），HTML 再逐屏生成。 */
export const DesignPlanSchema = z.object({
  title: z.string().describe("设计方案名称"),
  summary: z.string().describe("信息架构与关键用户路径概述（2-4 句）"),
  screens: z
    .array(
      z.object({
        name: z.string().describe("界面名称，如「需求列表」「需求详情」"),
        screenKey: z
          .string()
          .describe(
            "英文短标识（小写+连字符），界面间跳转用，如 req-list、req-detail"
          ),
        purpose: z.string().describe("该界面要解决的核心目标（1 句）"),
      })
    )
    .min(1)
    .describe("需要的界面清单（2-5 个为宜，覆盖关键用户路径）"),
});
export type DesignPlan = z.infer<typeof DesignPlanSchema>;

// ============================================================
// 会议纪要（AI 会议纪要员：结构化纪要 + 资产抽取 + 封面图提示词）
// ============================================================

/** 会议待办：尽量给出建议负责人（须为参会人之一）。 */
export const MeetingTodoSchema = z.object({
  title: z.string().describe("待办事项，动宾结构，明确可执行"),
  suggestedOwner: z
    .string()
    .default("")
    .describe("建议负责人（须是参会人之一）；不明确则空字符串"),
  priority: PrioritySchema.default("P2"),
});
export type MeetingTodo = z.infer<typeof MeetingTodoSchema>;

/** 会议决策：结论 + 背景原因（均须可追溯到原文）。 */
export const MeetingDecisionSchema = z.object({
  title: z.string().describe("决策结论，一句话"),
  background: z.string().default("").describe("背景与原因（基于会议原文）"),
  reason: z.string().default("").describe("为什么这么决定 / 否决了哪些方案（基于原文）"),
  impact: z.string().default("").describe("影响范围或后续动作；不明确则空"),
});
export type MeetingDecision = z.infer<typeof MeetingDecisionSchema>;

/** 会议中的新增/变更需求：可一键落为需求草案（source=MEETING）。 */
export const MeetingRequirementChangeSchema = z.object({
  title: z.string().describe("需求名称，简洁可检索"),
  detail: z.string().default("").describe("需求要点/背景（基于会议原文）"),
  kind: z
    .enum(["new", "change"])
    .default("new")
    .describe("new=新增需求；change=对既有需求的变更"),
  priority: PrioritySchema.default("P2"),
});
export type MeetingRequirementChange = z.infer<
  typeof MeetingRequirementChangeSchema
>;

/** 章节配图：每个 prompt 对应纪要 Markdown 中的一个二级标题（h2），用于在标题下方内联展示。 */
export const MeetingSectionImagePromptSchema = z.object({
  heading: z
    .string()
    .describe(
      "对应纪要 Markdown 中的某个二级标题文本（精确匹配，不带 ##；如「关键讨论」「核心决策」「待办与下一步」）"
    ),
  prompt: z
    .string()
    .describe(
      "该章节的英文插画提示词：扁平、简洁、专业，体现章节主题；严禁包含任何文字/字母/数字/logo"
    ),
});
export type MeetingSectionImagePrompt = z.infer<
  typeof MeetingSectionImagePromptSchema
>;

/** 会议纪要结构化结果（AI 会议纪要员输出）。 */
export const MeetingMinutesSchema = z.object({
  summary: z
    .string()
    .describe(
      "会议纪要正文（Markdown：用「## 标题」组织 3-5 个章节，如「## 议题」「## 关键讨论」「## 核心决策」「## 待办与下一步」「## 风险与遗留」），客观准确不臆造"
    ),
  keyPoints: z.array(z.string()).default([]).describe("关键要点 3-6 条"),
  todos: z.array(MeetingTodoSchema).default([]).describe("待办事项"),
  decisions: z.array(MeetingDecisionSchema).default([]).describe("项目决策"),
  risks: z.array(z.string()).default([]).describe("风险/遗留问题"),
  requirementChanges: z
    .array(MeetingRequirementChangeSchema)
    .default([])
    .describe("新增/变更需求（结构化，便于一键生成需求草案）"),
  summaryImagePrompt: z
    .string()
    .describe(
      "整场会议的英文【汇总插画】提示词：扁平、简洁、专业，体现会议整体主题与氛围；严禁包含任何文字/字母/数字/logo"
    ),
  sectionImagePrompts: z
    .array(MeetingSectionImagePromptSchema)
    .min(1)
    .max(8)
    .describe(
      "章节配图提示词（理想 3-5 张，至少 1 张），heading 必须与 summary 中的二级标题（## 后的文本）一一对应，便于前端按标题内联渲染"
    ),
});
export type MeetingMinutes = z.infer<typeof MeetingMinutesSchema>;

// ============================================================
// 项目报告（AI 项目经理：基于真实数据的结构化周报/健康报告）
// ============================================================

/** 报告中的风险/阻塞条目（含影响与应对建议）。 */
export const ReportRiskSchema = z.object({
  title: z.string().describe("风险/阻塞/延期事项（须对应事实数据，不得编造）"),
  impact: z.string().default("").describe("对进度/交付的影响（1 句）"),
  suggestion: z.string().default("").describe("应对/缓解建议（可执行）"),
});
export type ReportRisk = z.infer<typeof ReportRiskSchema>;

/** 项目报告结构化结果（AI 项目经理输出，须严格基于提供的事实数据）。 */
export const ProjectReportSchema = z.object({
  overview: z
    .string()
    .describe("本期整体进展概述（3-5 句），用数据说话，客观不浮夸"),
  highlights: z
    .array(z.string())
    .default([])
    .describe("本期完成项与亮点（基于已完成任务、上线需求）"),
  inProgress: z
    .array(z.string())
    .default([])
    .describe("进行中的关键事项"),
  risks: z
    .array(ReportRiskSchema)
    .default([])
    .describe("延期/阻塞/风险清单及应对建议；无则空数组"),
  nextPlan: z
    .array(z.string())
    .default([])
    .describe("下阶段计划（基于临期任务、待排期/待评审需求）"),
  managementAdvice: z
    .array(z.string())
    .default([])
    .describe("给管理者的具体、可执行建议；区分事实与建议"),
  healthScore: z.coerce
    .number()
    .describe("项目健康评分 0-100（综合进度、阻塞、延期、临期压力）"),
  healthReason: z.string().default("").describe("评分理由（1-2 句）"),
});
export type ProjectReport = z.infer<typeof ProjectReportSchema>;

/** 说话人分段（diarization）：基于 Whisper 转写片段 + 参会人，用 LLM 归属发言人。 */
export const DiarizedTurnSchema = z.object({
  speaker: z
    .string()
    .describe("说话人：优先用参会人真实姓名；无法确定时用「发言人1/发言人2…」"),
  text: z.string().describe("该说话人这一段连续发言（可合并相邻同人片段）"),
  start: z.number().default(0).describe("起始秒"),
  end: z.number().default(0).describe("结束秒"),
});
export type DiarizedTurn = z.infer<typeof DiarizedTurnSchema>;

export const DiarizationSchema = z.object({
  speakers: z
    .array(z.string())
    .default([])
    .describe("识别到的说话人列表（去重，按出场顺序）"),
  turns: z.array(DiarizedTurnSchema).default([]).describe("按时间顺序的发言分段"),
});
export type Diarization = z.infer<typeof DiarizationSchema>;
