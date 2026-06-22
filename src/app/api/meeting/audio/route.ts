import { randomUUID } from "node:crypto";

import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { putObject } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

/** 音频上限 200MB（约 3 小时压缩录音）。 */
const MAX_BYTES = 200 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".aac",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};

function pickExt(name: string, mime: string): string {
  const m = name.match(/\.[a-zA-Z0-9]{1,5}$/);
  if (m) return m[0].toLowerCase();
  return EXT_BY_MIME[mime] ?? ".bin";
}

/**
 * 会议音频上传：校验登录态与项目成员权限后存入 MinIO，返回对象 key 及元信息。
 * 走独立 route handler（而非 Server Action）以承载较大的 multipart 音频。
 * 实际转写在会议处理作业里进行（见 lib/jobs/run-meeting）。
 */
export async function POST(req: Request) {
  const user = await requireUser();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "请求体解析失败。" }, { status: 400 });
  }

  const file = form.get("file");
  const projectId = String(form.get("projectId") ?? "").trim();
  if (!(file instanceof File)) {
    return Response.json({ error: "未收到音频文件。" }, { status: 400 });
  }
  if (!projectId) {
    return Response.json({ error: "缺少项目。" }, { status: 400 });
  }

  const member = await prisma.projectMember.findFirst({
    where: { projectId, userId: user.id },
    select: { id: true },
  });
  if (!member) {
    return Response.json({ error: "你不是该项目成员。" }, { status: 403 });
  }

  if (file.size === 0) {
    return Response.json({ error: "音频文件为空。" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "音频过大（上限 200MB）。" }, { status: 413 });
  }

  const mime = file.type || "application/octet-stream";
  const isAudioLike =
    mime.startsWith("audio/") ||
    mime.startsWith("video/") ||
    mime === "application/octet-stream";
  if (!isAudioLike) {
    return Response.json({ error: "请上传音频文件。" }, { status: 415 });
  }

  const ext = pickExt(file.name || "", mime);
  const key = `meetings/uploads/${user.id}/${randomUUID()}${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    await putObject(key, bytes, mime);
  } catch {
    return Response.json({ error: "音频存储失败，请稍后重试。" }, { status: 502 });
  }

  return Response.json({
    audioKey: key,
    audioMime: mime,
    audioName: file.name || "audio",
    size: file.size,
  });
}
