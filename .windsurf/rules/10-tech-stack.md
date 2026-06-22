---
trigger: always_on
---

# TeamMindAI · 技术栈与项目结构（统一方案A）

## 统一技术栈（不要引入其它语言/框架）
- **框架**：Next.js 15 (App Router) + React 19 + TypeScript(strict)
- **样式/UI**：Tailwind CSS v4 + shadcn/ui (new-york, neutral) + lucide-react 图标
- **数据库**：PostgreSQL + pgvector，ORM 用 **Prisma**
- **AI**：Vercel AI SDK v6（`ai` / `@ai-sdk/openai-compatible` / `@ai-sdk/react`），统一走 **AgentLLM 网关**
- **认证**：Auth.js (next-auth v5)
- **异步任务/通知/定时**：BullMQ + ioredis（Redis）
- **对象存储**：MinIO（S3 兼容）
- **校验**：zod

> 决策已定：全栈统一 TypeScript、单仓库、单 Next.js 应用。**不要**新增 Java/Python 服务。
> 未来若 AI 编排变复杂，可平滑抽出独立服务，但当前阶段保持单体。

## 目录结构（约定）
```
src/
  app/                # 路由（App Router）
    (app)/            # 登录后的主应用（带侧边栏布局）
    api/              # Route Handlers（如 /api/chat 流式）
    login/            # 独立登录页
  components/
    ui/               # shadcn 基础组件（button/card/textarea…）
    *.tsx             # 业务组件（app-sidebar、page-placeholder…）
  lib/
    ai/               # provider / embeddings / employees / schemas
    db.ts             # Prisma 单例
    env.ts            # 集中惰性读取环境变量
    nav.ts            # 导航配置
prisma/schema.prisma  # 数据模型（权威）
docker-compose.yml    # 本地基础设施
```

## AgentLLM 网关（OpenAI 兼容）
- base_url：`https://agentllm.linkyun.co/v1`，鉴权 `Authorization: Bearer <AGENTLLM_API_KEY>`。
- 通过 `src/lib/ai/provider.ts` 的 `agentllm` 调用，**不要**在业务代码里直接散落 fetch/base_url。
- 模型档位见 `MODELS`：`chat`（强指令，结构化输出）/ `fast`（快省）/ `embedding`。
- Embedding 用 `src/lib/ai/embeddings.ts`，固定降维 **1536**（pgvector 索引上限 2000）。

## 常用命令
- 开发：`npm run dev`（http://localhost:3000）
- 基础设施：`npm run infra:up` / `npm run infra:down`
- 数据库：`npm run db:push`（开发同步）/ `db:migrate` / `db:studio` / `db:generate`
- 校验：`npm run build`、`npm run typecheck`、`npm run lint`

## 环境变量
统一在 `src/lib/env.ts` 读取；新增变量必须同步更新 `.env.example`。**严禁**把密钥硬编码进源码或提交 `.env`。
