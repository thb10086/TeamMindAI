import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { getObjectRange } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * 会议音频鉴权代理：校验项目成员后从 MinIO 读取并输出，支持 HTTP Range（拖动播放）。
 * 不暴露存储 endpoint。
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireUser();

  const meeting = await prisma.meeting.findFirst({
    where: { id, project: { members: { some: { userId: user.id } } } },
    select: { audioKey: true, audioMime: true },
  });
  if (!meeting?.audioKey) {
    return new Response("Not found", { status: 404 });
  }

  const range = req.headers.get("range") ?? undefined;
  try {
    const o = await getObjectRange(meeting.audioKey, range);
    const headers = new Headers({
      "Content-Type": meeting.audioMime || o.contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    });
    if (o.contentLength != null) {
      headers.set("Content-Length", String(o.contentLength));
    }
    if (range && o.contentRange) {
      headers.set("Content-Range", o.contentRange);
      return new Response(Buffer.from(o.bytes), { status: 206, headers });
    }
    return new Response(Buffer.from(o.bytes), { status: 200, headers });
  } catch {
    return new Response("Audio unavailable", { status: 502 });
  }
}
