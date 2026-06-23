import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { getObjectBytes } from "@/lib/storage";

/**
 * 会议封面图鉴权代理：读取 coverImageKey（兼容旧会议的 summaryImageKey），
 * 校验请求者是该会议所属项目成员后从 MinIO 输出字节。用于列表卡片缩略图。
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireUser();

  const meeting = await prisma.meeting.findFirst({
    where: { id, project: { members: { some: { userId: user.id } } } },
    select: { title: true, coverImageKey: true },
  });
  const key = meeting?.coverImageKey;
  if (!key) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const { bytes, contentType } = await getObjectBytes(key);
    const url = new URL(req.url);
    const wantDownload = url.searchParams.get("download") === "1";
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    };
    if (wantDownload) {
      const safe = (meeting?.title ?? "meeting").replace(/[\\/:*?"<>|\r\n]/g, "_").slice(0, 80) || "meeting";
      const ascii = safe.replace(/[^\x20-\x7E]/g, "_");
      const utf8 = encodeURIComponent(safe);
      headers["Content-Disposition"] = `attachment; filename="${ascii}-cover.png"; filename*=UTF-8''${utf8}-cover.png`;
    }
    return new Response(Buffer.from(bytes), { headers });
  } catch {
    return new Response("Image unavailable", { status: 502 });
  }
}
