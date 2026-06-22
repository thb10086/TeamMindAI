import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { getObjectBytes } from "@/lib/storage";

/**
 * 会议封面图鉴权代理：从 MinIO 读取并输出字节，避免暴露存储 endpoint，
 * 并校验请求者是该会议所属项目成员。
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireUser();

  const meeting = await prisma.meeting.findFirst({
    where: { id, project: { members: { some: { userId: user.id } } } },
    select: { coverImageKey: true },
  });
  if (!meeting?.coverImageKey) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const { bytes, contentType } = await getObjectBytes(meeting.coverImageKey);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Image unavailable", { status: 502 });
  }
}
