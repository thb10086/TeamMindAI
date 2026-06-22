# TeamMindAI · AI 企业大脑平台

> 让想法变需求，让项目自动运转。面向初创团队和技术型企业的**多 Agent 智能协作中台**。

不是"AI 版禅道/Jira"，而是一个**信息对齐中台**。核心差异化价值 =
**项目记忆（Memory） + AI 员工（Agents） + 需求对齐（Requirement Alignment）**。

```
想法输入 → AI 需求澄清 → 标准需求卡片 → 需求评审 → AI 任务拆解 → 看板推进 → 通知提醒 → 项目记忆沉淀
```

## 技术栈（统一 TypeScript 全栈 · 方案A）

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** + lucide-react
- **Prisma** + **PostgreSQL** + **pgvector**
- **Vercel AI SDK v6**，统一走 **AgentLLM**（OpenAI 兼容网关）
- **Auth.js** (next-auth v5) · **BullMQ + Redis** · **MinIO**

> 详细技术说明见 `docs/AI企业大脑平台_04_技术栈落地说明.md`；工程规范见 `.windsurf/rules/`。

## 快速开始

前置：Node 20+、Docker、npm。

```bash
# 1. 配置环境变量（至少填入 AGENTLLM_API_KEY）
cp .env.example .env

# 2. 安装依赖
npm install

# 3. 启动本地基础设施（Postgres+pgvector / Redis / MinIO）
npm run infra:up

# 4. 同步数据库表结构
npm run db:push

# 5. 启动开发服务器
npm run dev
# → http://localhost:3000
```

> 仅体验 **AI 对齐室**（/align）无需数据库，配置好 `AGENTLLM_API_KEY` 后 `npm run dev` 即可。

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发服务器（Turbopack） |
| `npm run build` | 生产构建 |
| `npm run typecheck` | TS 类型检查 |
| `npm run lint` | ESLint |
| `npm run infra:up` / `infra:down` | 启动/停止基础设施 |
| `npm run db:push` | 开发期同步表结构 |
| `npm run db:studio` | Prisma Studio |
| `npm run db:generate` | 生成 Prisma Client |

## 服务端口

| 服务 | 地址 |
|---|---|
| Web | http://localhost:3000 |
| PostgreSQL | localhost:5432（teammind/teammind） |
| Redis | localhost:6379 |
| MinIO API / 控制台 | http://localhost:9000 / http://localhost:9001（teammind/teammind123） |

## 目录结构

```
src/app/(app)/      登录后主应用（侧边栏布局）：dashboard / align / project / requirement / kanban ...
src/app/api/        Route Handlers（如 /api/chat 流式）
src/lib/ai/         AgentLLM provider、embeddings、AI 员工注册表、zod schema
prisma/schema.prisma  数据模型（权威）
docs/               业务与技术文档（01-03 业务，04 技术）
.windsurf/rules/    工程规范（AI 协作必读）
```

## 已实现 / 路线图

**已实现**：工程脚手架（build 通过）、AgentLLM 客户端、8 个 AI 员工定义、完整 Prisma 数据模型、docker 基础设施、应用骨架与导航、**AI 对齐室流式对话**。

**下一步**：登录与权限 → 需求卡片落库 → 评审与任务拆解 → 看板 → 项目记忆/检索 → 通知与邮件。详见 `docs/...04...md` §8。

## 文档

- `docs/AI企业大脑平台_01_系统SPEC规划文档.md` — 业务思想、模块、AI 员工、状态流转
- `docs/AI企业大脑平台_02_项目架构设计文档.md` — 架构、服务职责、数据模型、事件流
- `docs/AI企业大脑平台_03_产品原型文档.md` — 页面、字段、交互、MVP 范围
- `docs/AI企业大脑平台_04_技术栈落地说明.md` — **技术实现权威来源**
