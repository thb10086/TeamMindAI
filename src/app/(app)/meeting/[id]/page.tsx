import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireFullUser, canLeadProject } from "@/lib/access";
import { getMeetingForUser } from "@/lib/meetings";
import { findActiveJob } from "@/lib/jobs";
import {
  MeetingDetail,
  type MeetingDetailVM,
  type SpeakerVM,
  type TranscriptTurnVM,
} from "./meeting-detail";
import type { MeetingExtraction } from "../actions";


export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireFullUser();
  const meeting = await getMeetingForUser(id, user.id);
  if (!meeting) notFound();

  const canLead = await canLeadProject(meeting.projectId, user);
  const activeJob = await findActiveJob({
    type: "MEETING_PROCESS",
    meetingId: meeting.id,
  });

  const turns = (meeting.transcriptSegments as TranscriptTurnVM[] | null) ?? [];
  const speakers = (meeting.speakers as SpeakerVM[] | null) ?? [];
  const vm: MeetingDetailVM = {
    id: meeting.id,
    title: meeting.title,
    status: meeting.status,
    sourceType: meeting.sourceType,
    projectId: meeting.projectId,
    projectName: meeting.project.name,
    participants: meeting.participants,
    meetingTime: meeting.meetingTime ? meeting.meetingTime.toISOString() : null,
    createdAt: meeting.createdAt.toISOString(),
    rawContent: meeting.rawContent ?? "",
    summary: meeting.aiSummary,
    extraction: (meeting.aiExtraction as MeetingExtraction | null) ?? null,
    hasSummaryImage: Boolean(meeting.summaryImageKey ?? meeting.coverImageKey),
    hasAudio: Boolean(meeting.audioKey),
    audioName: meeting.audioName,
    durationSec: meeting.durationSec,
    transcriptTurns: turns,
    speakers,
    activeJobId: activeJob?.id ?? null,
    canManage: canLead || meeting.createdById === user.id,
    canLead,
  };

  return (
    <div className="space-y-4">
      <Link
        href="/meeting"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> 返回会议中心
      </Link>
      <MeetingDetail vm={vm} />
    </div>
  );
}
