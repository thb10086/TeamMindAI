import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ffmpegPath from "ffmpeg-static";

import { env, assertEnv } from "@/lib/env";
import { getObjectBytes, putObject } from "@/lib/storage";
import { bodyContext, tryParseLenient } from "@/lib/ai/json";

export interface TranscriptSegment {
  start: number; // 秒（全局，已跨分片偏移）
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration: number; // 秒
  segments: TranscriptSegment[];
}

/** 每片时长（秒）。10 分钟 mono/16k/mp3 ≈ 2.4MB，远低于 whisper 25MB 限制。 */
const CHUNK_SECONDS = 600;

/**
 * 同时进行的分片转写数。4 在 yunwu 速率、本地内存（每片缓冲 ~2.4MB）与推进速度间取平衡。
 * 一小时音频（6 片）串行~120s → 并发~40s。如出现 429，下调此值。
 */
const CHUNK_CONCURRENCY = 4;

/** 致命错误：401/403/400 之类的鉴权/参数问题，重试也救不回来。 */
class AsrFatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsrFatalError";
  }
}

/** 单次调用 ASR 网关 /audio/transcriptions（OpenAI 兼容 multipart）。 */
async function transcribeOnce(input: {
  bytes: Uint8Array;
  filename: string;
  contentType: string;
  language?: string;
  model: string;
}): Promise<TranscriptionResult> {
  const apiKey = assertEnv(env.asr.apiKey, "ASR_API_KEY");
  // whisper-1 支持 verbose_json（含分段时间戳，用于说话人识别对齐）；
  // gpt-4o-transcribe 仅支持 json（无时间戳）。
  const verbose = input.model.includes("whisper");

  // 复制到一块新的 ArrayBuffer 支撑的数组，满足 Blob 的 BlobPart 类型约束。
  const buf = new Uint8Array(input.bytes.byteLength);
  buf.set(input.bytes);

  const form = new FormData();
  form.append("file", new Blob([buf], { type: input.contentType }), input.filename);
  form.append("model", input.model);
  if (input.language) form.append("language", input.language);
  form.append("response_format", verbose ? "verbose_json" : "json");
  if (verbose) form.append("timestamp_granularities[]", "segment");

  const res = await fetch(`${env.asr.baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const body = await res.text();
  if (!res.ok) {
    // 4xx 中只 408（超时）/ 429（限流）值得重试；其余视为致命。
    const transient = res.status === 408 || res.status === 429 || res.status >= 500;
    const msg = `ASR HTTP ${res.status}：${body.slice(0, 300)}`;
    if (!transient) throw new AsrFatalError(msg);
    throw new Error(msg);
  }
  let data: {
    text?: string;
    language?: string;
    duration?: number;
    segments?: { start: number; end: number; text: string }[];
  };
  try {
    data = tryParseLenient(body) as typeof data;
  } catch (e) {
    throw new Error(
      `ASR JSON 解析失败：${(e as Error).message}；body~ ${bodyContext(body, (e as Error).message)}`
    );
  }
  const segments = (data.segments ?? [])
    .map((s) => ({
      start: Number(s.start) || 0,
      end: Number(s.end) || 0,
      text: (s.text ?? "").trim(),
    }))
    .filter((s) => s.text);
  return {
    text: (data.text ?? "").trim(),
    language: data.language,
    duration: Number(data.duration) || (segments.at(-1)?.end ?? 0),
    segments,
  };
}

/** 单片重试包装。瞬时错误最多 3 次（1s/3s/9s 退避）；致命错误直接抛出。 */
async function transcribeOnceWithRetry(
  input: Parameters<typeof transcribeOnce>[0],
  chunkLabel: string
): Promise<TranscriptionResult> {
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await transcribeOnce(input);
    } catch (err) {
      lastErr = err;
      if (err instanceof AsrFatalError) throw err;
      if (attempt === MAX_ATTEMPTS) break;
      const wait = 1000 * 3 ** (attempt - 1); // 1s, 3s, 9s
      console.warn(
        `[ASR] ${chunkLabel} 第 ${attempt} 次失败，${wait}ms 后重试：${(err as Error).message.slice(0, 200)}`
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

/** 用 ffmpeg 把任意音频切成 mono/16k/mp3 的定长分片，返回分片文件路径（有序）。 */
async function segmentAudio(inputPath: string, outDir: string): Promise<string[]> {
  const bin = ffmpegPath as unknown as string | null;
  if (!bin) throw new Error("ffmpeg 不可用（ffmpeg-static 未正确安装）。");
  await new Promise<void>((resolve, reject) => {
    const ff = spawn(
      bin,
      [
        "-hide_banner",
        "-i",
        inputPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "32k",
        "-f",
        "segment",
        "-segment_time",
        String(CHUNK_SECONDS),
        join(outDir, "ck_%03d.mp3"),
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    let err = "";
    ff.stderr.on("data", (d) => {
      err += d.toString();
    });
    ff.on("error", reject);
    ff.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg 退出码 ${code}：${err.slice(-300)}`))
    );
  });
  const files = (await readdir(outDir))
    .filter((f) => f.startsWith("ck_") && f.endsWith(".mp3"))
    .sort();
  return files.map((f) => join(outDir, f));
}

/** 单片处理：命中缓存→直接返回；未命中→读盘→重试转写→写缓存。供上层 worker-pool 并发调用。 */
async function processChunk(
  index: number,
  chunkPath: string,
  total: number,
  opts: {
    model: string;
    modelSafe: string;
    language: string;
    cacheKeyPrefix?: string;
  }
): Promise<TranscriptionResult> {
  const label = `chunk ${index + 1}/${total}`;
  const cacheKey = opts.cacheKeyPrefix
    ? `${opts.cacheKeyPrefix}${opts.modelSafe}/c${index}_${CHUNK_SECONDS}.json`
    : null;

  // 命中缓存 → 跳过实际转写，节省网关调用与时间。
  if (cacheKey) {
    try {
      const cached = await getObjectBytes(cacheKey);
      const r = JSON.parse(
        Buffer.from(cached.bytes).toString("utf8")
      ) as TranscriptionResult;
      console.log(`[ASR] ${label} 命中缓存，跳过`);
      return r;
    } catch {
      /* 缓存不存在或解析失败：当作未命中 */
    }
  }

  const buf = await readFile(chunkPath);
  console.log(
    `[ASR] ${label} 转写中（${(buf.byteLength / 1024).toFixed(0)} KB）…`
  );
  const t0 = Date.now();
  const r = await transcribeOnceWithRetry(
    {
      bytes: new Uint8Array(buf),
      filename: `chunk_${index}.mp3`,
      contentType: "audio/mpeg",
      language: opts.language,
      model: opts.model,
    },
    label
  );
  console.log(
    `[ASR] ${label} 完成（${Math.round(
      (Date.now() - t0) / 1000
    )}s，${r.segments.length} 段）`
  );

  if (cacheKey) {
    try {
      await putObject(
        cacheKey,
        Buffer.from(JSON.stringify(r), "utf8"),
        "application/json"
      );
    } catch (e) {
      console.warn(
        `[ASR] ${label} 写缓存失败（不影响主流程）：${(e as Error).message}`
      );
    }
  }
  return r;
}

/**
 * 转写音频（支持长音频，1 小时以上亦可）：
 * 1) ffmpeg 切成单声道/16k 的定长分片；
 * 2) worker-pool 并发转写各片（默认 CHUNK_CONCURRENCY 路），单片内部仍有重试与缓存；
 * 3) 任一片失败也让其它片跑完、写缓存，下次重跑只补跳过的那几片；
 * 4) 按片序偏移合并时间戳与文本。
 */
export async function transcribeAudio(input: {
  bytes: Uint8Array;
  filename: string;
  contentType?: string;
  language?: string;
  model?: string;
  /** 缓存前缀（建议 `meetings/cache/<meetingId>/`）。提供后每片成功即写缓存，重跑会跳过已缓存分片。 */
  cacheKeyPrefix?: string;
}): Promise<TranscriptionResult> {
  const model = input.model ?? env.asr.model;
  const language = input.language ?? "zh";
  const modelSafe = model.replace(/[^a-zA-Z0-9._-]/g, "_");
  const dir = await mkdtemp(join(tmpdir(), "tm-asr-"));
  const ext = (input.filename.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? ".bin").toLowerCase();
  const inputPath = join(dir, `input${ext}`);
  try {
    await writeFile(inputPath, input.bytes);
    const chunkDir = join(dir, "chunks");
    await mkdir(chunkDir, { recursive: true });
    const chunks = await segmentAudio(inputPath, chunkDir);
    if (chunks.length === 0) {
      throw new Error("音频切片为空，请确认文件是有效的音频且可被解码。");
    }
    const concurrency = Math.min(CHUNK_CONCURRENCY, chunks.length);
    console.log(
      `[ASR] 切片完成：${chunks.length} 片，每片 ${CHUNK_SECONDS}s，并发 ${concurrency}`
    );

    // 并发执行各片：小型 worker-pool，全部跑完后在报错，
    // 这样成功的片能写入缓存，下次重跑只补剩下那几片，不重复花 ASR 费用。
    const results = new Array<TranscriptionResult | null>(chunks.length).fill(
      null
    );
    const errors: { index: number; err: unknown }[] = [];
    let cursor = 0;
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (true) {
          const i = cursor++;
          if (i >= chunks.length) return;
          try {
            results[i] = await processChunk(i, chunks[i], chunks.length, {
              model,
              modelSafe,
              language,
              cacheKeyPrefix: input.cacheKeyPrefix,
            });
          } catch (err) {
            errors.push({ index: i, err });
          }
        }
      })
    );
    if (errors.length) {
      errors.sort((a, b) => a.index - b.index);
      const first = errors[0];
      throw new Error(
        `转写失败：${errors.length}/${chunks.length} 片未通过；最早失败 chunk ${
          first.index + 1
        }/${chunks.length}：${(first.err as Error).message}`
      );
    }

    // 按片序合并：时间戳加片内偏移、文本顺序拼接、duration 取末片终点。
    const allSegments: TranscriptSegment[] = [];
    const allText: string[] = [];
    let duration = 0;
    for (let i = 0; i < chunks.length; i++) {
      const r = results[i];
      if (!r) continue; // 不应触达：上方已报错
      const base = i * CHUNK_SECONDS;
      for (const s of r.segments) {
        allSegments.push({
          start: s.start + base,
          end: s.end + base,
          text: s.text,
        });
      }
      if (r.text) allText.push(r.text);
      duration = Math.max(
        duration,
        base + (r.duration || r.segments.at(-1)?.end || 0)
      );
    }
    return {
      text: allText.join("\n").trim(),
      segments: allSegments,
      duration,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
