import { requireUser } from "@/lib/auth-helpers";
import { env } from "@/lib/env";

const TEXT_EXTS = /\.(txt|md|markdown|csv|json|yaml|yml|xml|html|htm|log)$/i;
const IMAGE_MIME = /^image\/(png|jpeg|webp|gif)$/i;

const MAX_TEXT_CHARS = 12_000;
const MAX_FILE_MB = 20;

/**
 * POST /api/align/analyze-attachment
 * FormData: { file: File }
 * 返回: { content: string; filename: string } | { error: string }
 *
 * 支持文件类型：
 * - 图片（PNG/JPG/WEBP/GIF）→ AI Vision 提取内容
 * - PDF → pdf-parse 提取文本
 * - Word（.docx）→ mammoth 提取文本
 * - 文本文件（TXT/MD/CSV/JSON…）→ 直接读取
 */
export async function POST(req: Request) {
  await requireUser();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "请求格式错误，请上传 FormData。" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "缺少 file 字段。" }, { status: 400 });
  }
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    return Response.json(
      { error: `文件超过 ${MAX_FILE_MB}MB 限制，请压缩后再上传。` },
      { status: 413 }
    );
  }

  const mime = file.type;
  const name = file.name;
  const lname = name.toLowerCase();

  // ── 文本文件：直接读取 ────────────────────────────────────────
  if (mime.startsWith("text/") || TEXT_EXTS.test(name)) {
    const text = await file.text();
    const out = text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) + "\n…（内容过长已截断）" : text;
    return Response.json({ content: out, filename: name });
  }

  // ── PDF：提取文本 ──────────────────────────────────────────────
  if (mime === "application/pdf" || lname.endsWith(".pdf")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
      const buf = Buffer.from(await file.arrayBuffer());
      const { text } = await pdfParse(buf);
      const out = text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) + "\n…（内容过长已截断）" : text;
      return Response.json({ content: out.trim(), filename: name });
    } catch {
      return Response.json({ error: "PDF 解析失败，请确认文件未加密或损坏。" }, { status: 422 });
    }
  }

  // ── Word .docx：mammoth 提取文本 ──────────────────────────────
  const DOCX_MIME = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ];
  if (DOCX_MIME.includes(mime) || lname.endsWith(".docx") || lname.endsWith(".doc")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth") as { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> };
      const buf = Buffer.from(await file.arrayBuffer());
      const { value } = await mammoth.extractRawText({ buffer: buf });
      const out = value.length > MAX_TEXT_CHARS ? value.slice(0, MAX_TEXT_CHARS) + "\n…（内容过长已截断）" : value;
      return Response.json({ content: out.trim(), filename: name });
    } catch {
      return Response.json({ error: "Word 文档解析失败，请确认文件格式为 .docx。" }, { status: 422 });
    }
  }

  // ── 图片：直接调用 OpenAI 兼容接口（image_url 格式）──────────────
  if (IMAGE_MIME.test(mime)) {
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const base64 = buf.toString("base64");
      const dataUrl = `data:${mime};base64,${base64}`;

      const apiResp = await fetch(`${env.agentllm.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.agentllm.apiKey}`,
        },
        body: JSON.stringify({
          model: env.agentllm.visionModel,
          max_tokens: 2000,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `请详细分析这张图片，提取并整理其中的所有关键信息：
1. 提取所有可见文字（标题、标签、按钮、表格内容等）
2. 描述界面布局、流程图、架构图、思维导图的结构和逻辑
3. 总结核心功能点、业务流程、关键数据
4. 如果是截图或原型图，描述用户操作路径和功能模块
5. 用中文输出，结构清晰，分条列举`,
                },
                {
                  type: "image_url",
                  image_url: { url: dataUrl },
                },
              ],
            },
          ],
        }),
      });

      if (!apiResp.ok) {
        const errText = await apiResp.text().catch(() => apiResp.statusText);
        throw new Error(`API 返回 ${apiResp.status}: ${errText.slice(0, 200)}`);
      }

      const data = (await apiResp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      return Response.json({ content: text, filename: name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json(
        { error: `图片识别失败：${msg.slice(0, 200)}` },
        { status: 502 }
      );
    }
  }

  return Response.json(
    {
      error: `不支持该文件类型（${mime || name}）。支持：图片（PNG/JPG/WEBP/GIF）、PDF、Word（.docx）、文本文件（TXT/MD/CSV/JSON 等）。`,
    },
    { status: 415 }
  );
}
