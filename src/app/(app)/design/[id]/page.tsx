import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireFullUser } from "@/lib/access";
import { getDesignForUser } from "@/lib/designs";
import { findActiveJob } from "@/lib/jobs";
import { userDisplayName } from "@/lib/org";
import { DesignCanvas, type DesignVM } from "./design-canvas";

export default async function DesignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireFullUser();
  const { id } = await params;
  const design = await getDesignForUser(id, user.id);
  if (!design) notFound();

  // 进行中的生成作业：传给画布以便进入页面时恢复进度轮询。
  const activeJob = await findActiveJob({
    type: "DESIGN_GENERATE",
    designId: design.id,
  });

  const vm: DesignVM = {
    id: design.id,
    title: design.title,
    summary: design.summary,
    status: design.status,
    version: design.version,
    projectName: design.project.name,
    requirementId: design.requirement?.id ?? null,
    requirementTitle: design.requirement?.title ?? null,
    assigneeName: design.assignee ? userDisplayName(design.assignee) : null,
    activeJobId: activeJob?.id ?? null,
    screens: design.screens.map((s) => ({
      id: s.id,
      name: s.name,
      screenKey: s.screenKey,
      purpose: s.purpose,
      html: s.html,
    })),
  };

  return (
    <div className="space-y-4">
      <Link
        href={`/project/${design.project.id}?tab=design`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> 返回项目 · 界面设计
      </Link>
      <DesignCanvas design={vm} />
    </div>
  );
}
