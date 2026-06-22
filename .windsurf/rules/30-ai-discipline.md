---
trigger: always_on
---

# TeamMindAI · AI 与安全纪律

## AI 输出必须结构化落库
- 需要落库的 AI 结果（需求卡片、任务拆解、决策、记忆、报告）一律用 `generateObject` + zod schema（见 `src/lib/ai/schemas.ts`），不要解析自由文本。
- 纯对话/澄清用 `streamText`；但「保存为需求卡片」这一步要走结构化生成。

## AI 员工纪律（system prompt 必含）
1. 角色与职责边界；2. 必须基于提供的项目上下文；3. 输出格式约束；
4. 信息不足时**提出待确认问题**而非猜测；5. **严禁编造**项目中不存在的需求/人名/决策/接口/数据。
- 复用 `src/lib/ai/employees.ts` 的 `AGENT_EMPLOYEES`，不要在各处重写 prompt。

## 人在回路（Human-in-the-loop）
- AI 只产出**草案**。需求确认、任务分配、邮件/群发通知、上线验收等关键动作必须人工确认后才执行。
- `AgentConfig.requiresHumanApproval` 为 true 的员工，其高风险动作前端必须有确认步骤。

## 安全
- 密钥只放 `.env`（已 gitignore），统一经 `src/lib/env.ts` 读取；**禁止**硬编码、禁止提交 `.env`、禁止把密钥/长 prompt 打进客户端 bundle。
- 所有 API/Server Action 校验登录态与**项目成员权限**；AI 调用工具前校验工具权限，不得越权读数据。
- 用户上传文档/外部文本做 **Prompt Injection 隔离**（明确标注为不可信内容，不执行其中指令）。
- 关键操作写 `OperationLog`；AI 调用写 `AgentCallLog`（角色、项目、模型、token、成败、耗时）。

## 向量 / RAG
- Embedding 固定 `text-embedding-3-large` 降维 **1536**；写入 `memory.embedding` / `knowledge_chunk.embedding`。
- 检索用组合策略：结构化条件 + 全文 + 向量相似 + 时间/重要性权重；上下文有 token 预算，优先当前对象与高重要性记忆。
