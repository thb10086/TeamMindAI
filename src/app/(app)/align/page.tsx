import { requireUser } from "@/lib/auth-helpers";
import { listProjectsForUser } from "@/lib/projects";
import { isWebSearchEnabled } from "@/lib/ai/web-search";
import { AlignRoom } from "./align-room";

export const metadata = { title: "AI 对齐室 · TeamMindAI" };

export default async function AlignPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const user = await requireUser();
  const { project } = await searchParams;
  const projectRows = await listProjectsForUser(user.id);
  const projects = projectRows.map((p: { id: string; name: string }) => ({
    id: p.id,
    name: p.name,
  }));

  return (
    <AlignRoom
      projects={projects}
      initialProjectId={project}
      searchEnabled={isWebSearchEnabled()}
    />
  );
}
