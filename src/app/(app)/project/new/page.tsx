import { requireUser } from "@/lib/auth-helpers";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NewProjectForm } from "../new-project-form";

export const metadata = { title: "新建项目 · TeamMindAI" };

export default async function NewProjectPage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">新建项目</h1>
        <p className="mt-1 text-muted-foreground">
          创建一个拥有完整上下文的项目空间，后续所有需求、任务、决策与记忆都归属于它。
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>项目信息</CardTitle>
          <CardDescription>
            先对齐：清晰的业务背景与目标会让 AI 产品经理的需求澄清更准确。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewProjectForm />
        </CardContent>
      </Card>
    </div>
  );
}
