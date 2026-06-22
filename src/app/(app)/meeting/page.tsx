import { requireFullUser } from "@/lib/access";
import { listProjectsForUser } from "@/lib/projects";
import { listMeetingsForUser } from "@/lib/meetings";
import {
  MeetingCenter,
  type MeetingVM,
  type ProjectOption,
} from "./meeting-center";

export const metadata = { title: "会议中心 · TeamMindAI" };

export default async function MeetingPage() {
  const user = await requireFullUser();
  const [projectRows, meetingRows] = await Promise.all([
    listProjectsForUser(user.id),
    listMeetingsForUser(user.id),
  ]);

  const projects: ProjectOption[] = projectRows.map(
    (p: { id: string; name: string }) => ({ id: p.id, name: p.name })
  );

  const meetings: MeetingVM[] = meetingRows.map(
    (m: (typeof meetingRows)[number]) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      sourceType: m.sourceType,
      projectId: m.projectId,
      projectName: m.project.name,
      participants: m.participants,
      meetingTime: m.meetingTime ? m.meetingTime.toISOString() : null,
      createdAt: m.createdAt.toISOString(),
      hasCover: Boolean(m.coverImageKey ?? m.summaryImageKey),
    })
  );

  return <MeetingCenter meetings={meetings} projects={projects} />;
}
