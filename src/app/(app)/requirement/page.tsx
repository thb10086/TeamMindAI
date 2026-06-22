import Link from "next/link";
import { Sparkles } from "lucide-react";

import { requireUser } from "@/lib/auth-helpers";
import { listRequirementsForUser } from "@/lib/requirements";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  PRIORITY_LABEL,
  REQUIREMENT_STATUS_LABEL,
  requirementStatusClass,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

export const metadata = { title: "需求中心 · TeamMindAI" };

export default async function RequirementListPage() {
  const user = await requireUser();
  const requirements = await listRequirementsForUser(user.id);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">需求中心</h1>
          <p className="mt-1 text-muted-foreground">
            统一管理全部需求。先对齐，再执行：每条需求都应有清晰的背景、范围与验收标准。
          </p>
        </div>
        <Button asChild>
          <Link href="/align">
            <Sparkles className="size-4" />
            AI 澄清需求
          </Link>
        </Button>
      </div>

      {requirements.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            还没有需求。前往
            <Link href="/align" className="mx-1 text-primary underline">
              AI 对齐室
            </Link>
            ，把一句话想法澄清成标准需求卡片。
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-hidden rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-4 py-2.5 font-medium">编号</th>
                    <th className="px-4 py-2.5 font-medium">需求名称</th>
                    <th className="px-4 py-2.5 font-medium">所属项目</th>
                    <th className="px-4 py-2.5 font-medium">优先级</th>
                    <th className="px-4 py-2.5 font-medium">状态</th>
                    <th className="px-4 py-2.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {requirements.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {r.requirementCode}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/requirement/${r.id}`}
                          className="font-medium hover:text-primary hover:underline"
                        >
                          {r.title}
                        </Link>
                        {r.isAiGenerated && (
                          <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                            <Sparkles className="size-3" /> AI
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.project.name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {PRIORITY_LABEL[r.priority] ?? r.priority}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            requirementStatusClass(r.status)
                          )}
                        >
                          {REQUIREMENT_STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/requirement/${r.id}`}>查看</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
