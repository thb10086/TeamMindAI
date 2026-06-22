import { getAgent } from "@/lib/ai/employees";
import { generateStructured } from "@/lib/ai/structured";
import {
  DiarizationSchema,
  MeetingMinutesSchema,
  type Diarization,
  type MeetingMinutes,
} from "@/lib/ai/schemas";

const SECRETARY = getAgent("ai_meeting_secretary");

/** 秒 → mm:ss，用于转写片段标注。 */
function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Whisper 把音频切成很多 3–10s 的碎段，对说话人识别既冗长又烧 token。
 * 这里把相邻碎段合并成约 10–20s 的「粗段」：
 *  - 间隔 ≥ 2.5s 视为可能换人/换话题，断开；
 *  - 单段累计 > maxDurationSec 或 > maxChars 也断开；
 * 合并后段数通常 ↓ 80–90%，LLM 调用更快更稳；timestamp 仍准。
 */
function mergeAdjacentSegments(
  segs: { start: number; end: number; text: string }[],
  opts: { maxChars?: number; maxGapSec?: number; maxDurationSec?: number } = {}
): { start: number; end: number; text: string }[] {
  const maxChars = opts.maxChars ?? 200;
  const maxGap = opts.maxGapSec ?? 2.5;
  const maxDur = opts.maxDurationSec ?? 18;
  if (segs.length === 0) return [];
  const out: { start: number; end: number; text: string }[] = [];
  let cur = { ...segs[0] };
  for (let i = 1; i < segs.length; i++) {
    const next = segs[i];
    const gap = next.start - cur.end;
    const dur = next.end - cur.start;
    const merged = cur.text.endsWith(" ") ? cur.text + next.text : `${cur.text} ${next.text}`;
    if (gap <= maxGap && dur <= maxDur && merged.length <= maxChars) {
      cur = { start: cur.start, end: next.end, text: merged };
    } else {
      out.push(cur);
      cur = { ...next };
    }
  }
  out.push(cur);
  return out;
}

const DIARIZE_HINT = `{
  "speakers": string[],
  "turns": [ { "speaker": string, "text": string, "start": number, "end": number } ]
}`;

/**
 * 说话人识别（diarization）：基于 Whisper 的转写分段（带时间戳）+ 参会人名单，
 * 用 LLM 判断「谁说了什么」。whisper-1 本身不含声纹分离，故采用「转写 + LLM 归属」
 * 的实用方案：依据自我介绍、互相称呼、话题衔接判断说话人，不确定时用稳定占位名。
 *
 * 性能：先把 Whisper 的小碎段合并成 ~15s 粗段（段数 -80%），再送 LLM，避免长会议
 * 输入爆 token / 触发上游 RetryError。
 */
export async function diarizeTranscript(opts: {
  title: string;
  participants?: string | null;
  segments: { start: number; end: number; text: string }[];
}): Promise<Diarization> {
  const merged = mergeAdjacentSegments(opts.segments);
  console.log(
    `[diarize] 预处理：原始 ${opts.segments.length} 段 → 合并后 ${merged.length} 段`
  );
  const lines = merged.map(
    (s, i) => `${i + 1}. [${fmtClock(s.start)}-${fmtClock(s.end)}] ${s.text}`
  );
  let body = lines.join("\n");
  // 控制上下文长度（极长录音截断，避免超预算）。
  if (body.length > 40000) {
    body = body.slice(0, 40000) + "\n…（转写过长，已截断后续片段）";
  }

  return generateStructured({
    schema: DiarizationSchema,
    jsonHint: DIARIZE_HINT,
    system: SECRETARY.systemPrompt,
    prompt: `下面是一段会议录音的「自动转写分段」（每段带时间戳）。请判断每段是谁说的，输出按时间顺序的「说话人分段」。
规则：
- 优先把发言归到「参会人名单」中的真实姓名；依据自我介绍（如「我是张三」）、互相称呼（如「李四你怎么看」）、话题与口吻衔接来判断。
- 无法确定身份时，用稳定占位名「发言人1」「发言人2」……同一个人请始终用同一占位名。
- 可把相邻且同一人的多段合并为一段，使结果连贯；合并后 start 取第一段起点、end 取最后一段终点。
- 严禁编造参会人名单之外的真实姓名；不确定就用占位名。
- 严格基于转写文本，不要新增、删改或润色话语内容。

# 会议标题
${opts.title}
# 参会人名单（说话人候选）
${opts.participants || "（未提供，请统一用占位名）"}

# 自动转写分段
${body}`,
  });
}

/** 把说话人分段拼成可读转写（用于纪要生成与展示）。 */
export function turnsToReadableText(
  turns: { speaker: string; text: string }[]
): string {
  return turns.map((t) => `${t.speaker}：${t.text}`).join("\n");
}

const MINUTES_HINT = `{
  "summary": string,                 // 会议纪要正文（Markdown：用「## 标题」组织 3-5 个章节）
  "keyPoints": string[],             // 关键要点 3-6 条
  "todos": [
    { "title": string, "suggestedOwner": string, "priority": "P0" | "P1" | "P2" | "P3" }
  ],
  "decisions": [ { "title": string, "background": string, "reason": string, "impact": string } ],
  "risks": string[],
  "requirementChanges": [
    { "title": string, "detail": string, "kind": "new" | "change", "priority": "P0" | "P1" | "P2" | "P3" }
  ],
  "summaryImagePrompt": string,      // 英文，整场会议的汇总插画提示词，严禁含任何文字
  "sectionImagePrompts": [           // 3-5 张章节配图，heading 须与 summary 中「## 标题」一一对应
    { "heading": string, "prompt": string }
  ]
}`;

/**
 * 把会议原始内容（转写稿/纪要文本）整理为结构化纪要并抽取资产。
 * 严格基于原文，不臆造；信息不足的字段给空数组（schema 已 .default 容错）。
 *
 * 关于配图：本函数只产出**提示词**（轻量、几百 token），实际配图由后台 MEETING_IMAGE
 * 子作业逐张异步生成，确保纪要可读时间不被图片生成阻塞。
 */
export async function generateMeetingMinutes(opts: {
  title: string;
  participants?: string | null;
  meetingTime?: string | null;
  rawContent: string;
  projectContext?: string;
}): Promise<MeetingMinutes> {
  const contextBlock = opts.projectContext
    ? `\n\n# 项目上下文（对齐术语与既有决策，不可臆造）\n${opts.projectContext}`
    : "";
  return generateStructured({
    schema: MeetingMinutesSchema,
    jsonHint: MINUTES_HINT,
    system: SECRETARY.systemPrompt,
    prompt: `请把以下会议的原始内容整理为结构化纪要，并抽取待办、决策、风险、需求变更。
要求：
- 纪要正文（summary）用 Markdown，**必须用「## 标题」组织 3-5 个章节**，章节通常包括：议题、关键讨论、核心决策、待办与下一步、风险与遗留（按本次会议实际内容裁剪取舍，不一定全有）。客观准确，严格基于原文，不臆造。
- 所有抽取项必须可追溯到会议原文；某类信息不足时给空数组。
- 待办尽量给出建议负责人（必须是参会人之一）。
- summaryImagePrompt：英文，描述一张能体现本次会议整体主题的简洁扁平专业插画，严禁包含任何文字。
- sectionImagePrompts：**3-5 张**章节配图，每张的 heading **必须**与 summary 中某个「## 标题」**完全一致**（不带 ## 和空格）；prompt 为英文，与该章节内容呼应；严禁含任何文字/字母/数字。

# 会议标题
${opts.title}
# 会议时间
${opts.meetingTime ?? "（未填写）"}
# 参会人
${opts.participants ?? "（未填写）"}

# 会议原始内容（转写稿 / 纪要文本）
${opts.rawContent}${contextBlock}`,
  });
}
