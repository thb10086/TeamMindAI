import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { getObjectBytes } from "@/lib/storage";

/**
 * 会议汇总主图鉴权代理：读取 summaryImageKey（兼容旧会议的 coverImageKey），
 * 校验请求者是该会议所属项目成员后从 MinIO 输出字节，不暴露存储 endpoint。
 *  - 默认 inline 展示；?download=1 时附 Content-Disposition: attachment，触发浏览器下载。
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireUser();

  const meeting = await prisma.meeting.findFirst({
    where: { id, project: { members: { some: { userId: user.id } } } },
    select: { title: true, summaryImageKey: true, coverImageKey: true },
  });
  const key = meeting?.summaryImageKey ?? meeting?.coverImageKey;
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
      headers["Content-Disposition"] = buildAttachment(meeting?.title ?? "meeting", "summary", contentType);
    }
    return new Response(Buffer.from(bytes), { headers });
  } catch {
    return new Response("Image unavailable", { status: 502 });
  }
}

/** RFC 5987 兼容的 Content-Disposition：同时给出 ASCII 回退与 UTF-8 文件名，避免非 ASCII 标题被截断。 */
function buildAttachment(title: string, kind: string, contentType?: string): string {
  const ext = contentType?.includes("svg") ? "svg" : "png";
  const safe = title.replace(/[\\/:*?"<>|\r\n]/g, "_").slice(0, 80) || "meeting";
  const ascii = safe.replace(/[^\x20-\x7E]/g, "_");
  const utf8 = encodeURIComponent(safe);
  return `attachment; filename="${ascii}-${kind}.${ext}"; filename*=UTF-8''${utf8}-${kind}.${ext}`;
}
