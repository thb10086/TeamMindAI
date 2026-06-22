---
trigger: glob
globs: src/**/*.ts,src/**/*.tsx
---

# TeamMindAI · 编码规范

## TypeScript
- 全程 `strict`，禁止 `any`（必要时用 `unknown` + 收窄）。导出的函数/组件 props 显式标注类型。
- 用 zod 定义外部输入与 AI 输出的 schema，并用 `z.infer` 派生类型，避免重复定义。

## Next.js App Router
- **默认 Server Component**；只有需要交互/浏览器 API/hooks 时才加 `"use client"`，并尽量下沉到叶子组件。
- 数据读取优先在 Server Component 直接 `await prisma...`；写操作用 **Server Actions**（`"use server"`）或 Route Handler。
- 不在 Client Component 里 import 服务端模块（`db.ts`、含密钥的代码、长 system prompt）。
- 流式 AI 用 Route Handler（`src/app/api/.../route.ts`）+ `streamText().toUIMessageStreamResponse()`，前端用 `useChat`。

## UI / 样式
- 组件用 **shadcn/ui**：新增基础组件 `npx shadcn@latest add <name>`，放 `src/components/ui/`。
- 类名合并一律用 `cn()`（`src/lib/utils.ts`）。颜色只用主题 token（`bg-background`/`text-muted-foreground`/`border` 等），不要写死 hex。
- 图标统一 `lucide-react`。界面文案用简体中文。

## Prisma
- schema 是数据权威源（`prisma/schema.prisma`）。改模型后跑 `npm run db:push`（开发）并 `db:generate`。
- 主键 `cuid()`；状态字段用枚举；跨实体软引用用标量外键（如 `ownerId`），高频导航关系才建 relation。
- 向量列 `Unsupported("vector(1536)")` 不能用 Prisma 普通查询读写，必须用 `$queryRaw` / `$executeRaw`（注意引号标识符）。

## 命名与组织
- 文件用 kebab-case（`app-sidebar.tsx`），组件用 PascalCase，变量/函数 camelCase，常量 UPPER_SNAKE。
- 业务逻辑放 `src/lib/`，按域分子目录（`ai/`、`notifications/`、`projects/`…）。路由文件保持薄。

## 注释
- 不要无故新增/删除注释。仅在解释「为什么」时写注释，不写复述代码的废话。
