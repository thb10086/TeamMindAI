import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { getObjectBytes } from "@/lib/storage";

interface SectionImageRow {
  heading: string;
  prompt: string;
  key: string | null;
}

/**
 * 会议章节配图鉴权代理：从 sectionImages[idx].key 读取对应图片。
 * 子作业未完成时 key 为 null，返回 404；前端轮询到字段更新后会自动重渲染。
 *  - 默认 inline 展示；?download=1 时返回 Content-Disposition: attachment，触发下载。
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; idx: string }> }
) {
  const { id, idx: idxStr } = await params;
  const idx = Number.parseInt(idxStr, 10);
  if (!Number.isInteger(idx) || idx < 0) {
    return new Response("Bad index", { status: 400 });
  }

  const user = await requireUser();

  const meeting = await prisma.meeting.findFirst({
    where: { id, project: { members: { some: { userId: user.id } } } },
    select: { title: true, sectionImages: true },
  });
  const items = (meeting?.sectionImages as SectionImageRow[] | null) ?? [];
  const row = items[idx];
  const key = row?.key ?? null;
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
      const heading = row?.heading?.trim() || `section-${idx + 1}`;
      headers["Content-Disposition"] = buildAttachment(
        meeting?.title ?? "meeting",
        heading
      );
    }
    return new Response(Buffer.from(bytes), { headers });
  } catch {
    return new Response("Image unavailable", { status: 502 });
  }
}

/** RFC 5987 兼容的 Content-Disposition：兼顾 ASCII 回退与 UTF-8 中文文件名。 */
function buildAttachment(title: string, kind: string): string {
  const sanitize = (s: string) =>
    s.replace(/[\\/:*?"<>|\r\n]/g, "_").slice(0, 80) || "meeting";
  const safeTitle = sanitize(title);
  const safeKind = sanitize(kind);
  const ascii = `${safeTitle}-${safeKind}`.replace(/[^\x20-\x7E]/g, "_");
  const utf8 = encodeURIComponent(`${safeTitle}-${safeKind}`);
  return `attachment; filename="${ascii}.png"; filename*=UTF-8''${utf8}.png`;
}
