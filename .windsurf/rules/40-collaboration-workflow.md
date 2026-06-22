---
trigger: model_decision
description: 团队协同、Git 规范、本地启动、如何新增一个功能/页面、数据库迁移流程。当用户询问开发流程、提交规范、如何加功能或如何启动项目时参考。
---

# TeamMindAI · 团队协同工作流

## 本地启动（首次）
1. `cp .env.example .env`，填好 `AGENTLLM_API_KEY`（其余可用默认值）。
2. `npm install`
3. `npm run infra:up`（启动 Postgres+pgvector / Redis / MinIO）
4. `npm run db:push`（建表）
5. `npm run dev` → http://localhost:3000

## Git 规范（小团队，主干开发）
- 分支：`feat/<域>-<简述>`、`fix/...`、`chore/...`、`docs/...`。
- 提交信息用 Conventional Commits：`feat(requirement): 新增需求卡片保存`、`fix(kanban): 修复拖拽状态`。
- 合并前本地必须通过：`npm run typecheck && npm run lint && npm run build`。
- 一个 PR 只做一件事，附上对应的 SPEC/原型条目与截图。

## 如何新增一个功能（标准动作）
1. 先对照三份文档确认字段、状态流转与页面归属（业务以文档为准）。
2. 改 `prisma/schema.prisma`（如需）→ `npm run db:push` → `db:generate`。
3. Server Component 取数 / Server Action 写数；AI 能力走 `src/lib/ai/*`。
4. UI 复用 shadcn 组件与既有布局；状态用主题 token。
5. 需要落库的 AI 产物用 `generateObject` + zod schema。
6. 关键动作加人工确认；写 `OperationLog` / `AgentCallLog`。

## 数据库迁移
- 开发期用 `db:push` 快速同步；进入多人协作/预发后改用 `prisma migrate dev` 生成迁移文件并提交。
- 不要手改数据库结构绕过 Prisma。

## 不要做
- 不引入第二种后端语言/框架；不绕过 `env.ts` 读密钥；不把业务文案散落成魔法字符串（集中到常量/配置）。
- 不把 AI 输出当作可信，落库前校验；不让 AI 直接执行删除/群发等高风险操作。
