/**
 * 会议汇总 SVG 信息图生成器。
 * 纯 TypeScript，无额外依赖——从结构化纪要数据生成一张 1536×1024 的信息卡，
 * 直接落 MinIO（MIME: image/svg+xml）作为 summaryImageKey 的内容。
 *
 * 相比 AI 文生图方案，信息图：
 *  - 包含真实数据（关键要点、决策、待办、风险）
 *  - 生成速度快（< 1ms，无 API 调用）
 *  - 内容与会议完全对齐
 */

export interface InfographicData {
  title: string;
  meetingTime?: string | null;
  participants?: string | null;
  keyPoints: string[];
  decisions: Array<{ title: string }>;
  todos: Array<{ title: string; suggestedOwner?: string; priority?: string }>;
  risks: string[];
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Approximate pixel width of a string at given font-size. */
function measureWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of Array.from(text)) {
    if (/[\u4e00-\u9fff\u3040-\u30ff\u3400-\u4dbf\uf900-\ufaff\u2e80-\u2eff]/.test(ch)) {
      w += fontSize;
    } else if (/[A-Z]/.test(ch)) {
      w += fontSize * 0.72;
    } else if (ch === " ") {
      w += fontSize * 0.32;
    } else {
      w += fontSize * 0.6;
    }
  }
  return w;
}

/**
 * Word-aware text wrapping that handles CJK + Latin mixed content.
 * Returns at most `maxLines` lines; the last line is truncated with '…' if needed.
 */
function wrapText(text: string, maxPx: number, fontSize: number, maxLines = 3): string[] {
  // Tokenize: each CJK char is its own token; Latin runs are word tokens.
  const tokens: string[] = [];
  let buf = "";
  for (const ch of Array.from(text)) {
    const isCJK = /[\u4e00-\u9fff\u3040-\u30ff\u3400-\u4dbf\uf900-\ufaff]/.test(ch);
    if (isCJK) {
      if (buf) { tokens.push(buf); buf = ""; }
      tokens.push(ch);
    } else if (ch === " " || ch === "\u3000") {
      if (buf) { tokens.push(buf); buf = ""; }
      tokens.push(" ");
    } else {
      buf += ch;
    }
  }
  if (buf) tokens.push(buf);

  const lines: string[] = [];
  let line = "";
  let lineW = 0;

  const flush = () => {
    const trimmed = line.trimEnd();
    if (trimmed) lines.push(trimmed);
    line = "";
    lineW = 0;
  };

  for (const token of tokens) {
    if (token === " ") {
      line += " ";
      lineW += fontSize * 0.32;
      continue;
    }
    const tw = measureWidth(token, fontSize);
    if (lineW + tw > maxPx && line.trim()) {
      flush();
      if (lines.length >= maxLines) break;
      line = token;
      lineW = tw;
    } else {
      line += token;
      lineW += tw;
    }
  }
  if (line.trim() && lines.length < maxLines) lines.push(line.trim());

  // Ensure the last line ends with '…' if we hit the limit and there's leftover
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    // Add ellipsis only if we ran out of space (tokens remain)
    const consumed = lines.join("").replace(/…$/, "").length;
    if (consumed < text.replace(/\s+/g, "").length - 2) {
      // Trim the last line to fit '…'
      let trimmed = last;
      while (trimmed.length > 0 && measureWidth(trimmed + "…", fontSize) > maxPx) {
        trimmed = Array.from(trimmed).slice(0, -1).join("");
      }
      lines[maxLines - 1] = trimmed + "…";
    }
  }

  return lines.length > 0 ? lines : [text.slice(0, 20)];
}

// ────────────────────────────────────────────────────────────────
// SVG builder
// ────────────────────────────────────────────────────────────────

interface TextOpts {
  x: number;
  y: number;
  size: number;
  fill: string;
  weight?: string;
  anchor?: string;
  opacity?: number;
  letterSpacing?: number;
}

function svgText(content: string, opts: TextOpts): string {
  const attrs = [
    `x="${opts.x}"`,
    `y="${opts.y}"`,
    `font-family="'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif"`,
    `font-size="${opts.size}"`,
    opts.weight ? `font-weight="${opts.weight}"` : "",
    `fill="${opts.fill}"`,
    opts.anchor ? `text-anchor="${opts.anchor}"` : "",
    opts.opacity !== undefined ? `opacity="${opts.opacity}"` : "",
    opts.letterSpacing ? `letter-spacing="${opts.letterSpacing}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<text ${attrs}>${esc(content)}</text>`;
}

// ────────────────────────────────────────────────────────────────
// Main export
// ────────────────────────────────────────────────────────────────

export function generateMeetingSummaryInfographic(data: InfographicData): Buffer {
  const W = 1536;
  const H = 1024;

  // ── Color palette ──────────────────────────────────────────────
  const C = {
    bg0: "#090e1f",
    bg1: "#0e1628",
    headerBg: "#0d1730",
    cardL: "#111c34",
    cardR: "#121b31",
    cardR2: "#0f1829",
    border: "#1e2d48",
    blue: "#4f8ef7",
    green: "#34d399",
    orange: "#fbbf24",
    red: "#f87171",
    purple: "#a78bfa",
    textPri: "#f1f5f9",
    textSec: "#94a3b8",
    textDim: "#3d5070",
  };

  const parts: string[] = [];

  // ── SVG open ───────────────────────────────────────────────────
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
  );

  // ── Defs ───────────────────────────────────────────────────────
  parts.push(`<defs>
  <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${C.bg0}"/>
    <stop offset="100%" stop-color="${C.bg1}"/>
  </linearGradient>
  <linearGradient id="hGrad" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#152850"/>
    <stop offset="60%" stop-color="${C.headerBg}"/>
    <stop offset="100%" stop-color="${C.bg1}"/>
  </linearGradient>
  <linearGradient id="blueAccent" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="${C.blue}"/>
    <stop offset="100%" stop-color="#60a5fa"/>
  </linearGradient>
</defs>`);

  // ── Background ─────────────────────────────────────────────────
  parts.push(`<rect width="${W}" height="${H}" fill="url(#bgGrad)"/>`);

  // ── Header (H=88) ──────────────────────────────────────────────
  const HDR_H = 88;
  parts.push(`<rect x="0" y="0" width="${W}" height="${HDR_H}" fill="url(#hGrad)"/>`);
  // left accent bar
  parts.push(`<rect x="0" y="0" width="6" height="${HDR_H}" fill="url(#blueAccent)"/>`);
  // bottom rule
  parts.push(`<line x1="0" y1="${HDR_H}" x2="${W}" y2="${HDR_H}" stroke="${C.border}" stroke-width="1.5"/>`);

  // Meeting title
  const titleRaw = data.title ?? "会议纪要";
  const titleText = titleRaw.length > 52 ? Array.from(titleRaw).slice(0, 50).join("") + "…" : titleRaw;
  parts.push(svgText(titleText, { x: 30, y: 55, size: 34, fill: C.textPri, weight: "700" }));

  // Meta: time
  let metaY = 32;
  if (data.meetingTime) {
    const t = String(data.meetingTime).replace("T", " ").slice(0, 16);
    parts.push(svgText(t, { x: W - 28, y: metaY, size: 17, fill: C.textSec, anchor: "end" }));
    metaY += 26;
  }
  // Meta: participants
  if (data.participants) {
    const pArr = data.participants.split(/[,，、\s]+/).filter(Boolean);
    const pText = pArr.slice(0, 6).join(" · ") + (pArr.length > 6 ? " …" : "");
    parts.push(svgText(pText, { x: W - 28, y: metaY, size: 15, fill: C.textDim, anchor: "end" }));
  }

  // ── Layout constants ───────────────────────────────────────────
  const BODY_Y = HDR_H + 16;                  // body top
  const BODY_H = H - HDR_H - 16 - 62;         // body height (leave 62 for footer)
  const DIV_X = 628;                           // vertical divider X
  const PAD = 28;                              // card inner padding
  const CARD_RADIUS = 10;

  // ── LEFT CARD: Key Points ──────────────────────────────────────
  const KP_X = 16;
  const KP_W = DIV_X - 16 - 10;
  parts.push(
    `<rect x="${KP_X}" y="${BODY_Y}" width="${KP_W}" height="${BODY_H}" rx="${CARD_RADIUS}" fill="${C.cardL}" stroke="${C.border}" stroke-width="1"/>`
  );
  // top accent bar
  parts.push(
    `<rect x="${KP_X}" y="${BODY_Y}" width="${KP_W}" height="4" rx="${CARD_RADIUS}" fill="${C.blue}" opacity="0.9"/>`
  );
  // section label
  parts.push(
    svgText("KEY POINTS", {
      x: KP_X + PAD,
      y: BODY_Y + 36,
      size: 14,
      fill: C.blue,
      weight: "600",
      letterSpacing: 3,
    })
  );
  parts.push(
    `<line x1="${KP_X + PAD}" y1="${BODY_Y + 46}" x2="${KP_X + KP_W - PAD}" y2="${BODY_Y + 46}" stroke="${C.border}" stroke-width="1"/>`
  );

  // Key point items
  const KP_TEXT_X = KP_X + PAD + 22;
  const KP_MAX_W = KP_W - PAD * 2 - 26;
  const kpItems = (data.keyPoints ?? []).slice(0, 8);
  let kpY = BODY_Y + 66;
  const KP_LINE_H = 26;

  for (const kp of kpItems) {
    const wrapped = wrapText(kp, KP_MAX_W, 18, 2);
    // bullet
    parts.push(
      `<circle cx="${KP_X + PAD + 6}" cy="${kpY + 8}" r="4" fill="${C.blue}" opacity="0.75"/>`
    );
    for (let li = 0; li < wrapped.length; li++) {
      parts.push(
        svgText(wrapped[li], {
          x: KP_TEXT_X,
          y: kpY + (li === 0 ? 14 : 14 + li * KP_LINE_H),
          size: 18,
          fill: C.textPri,
        })
      );
    }
    kpY += wrapped.length === 1 ? 36 : 36 + (wrapped.length - 1) * KP_LINE_H;
    if (kpY > BODY_Y + BODY_H - 80) break;
  }

  // Bottom stats strip in left card
  const STATS_Y = BODY_Y + BODY_H - 50;
  parts.push(
    `<rect x="${KP_X + 10}" y="${STATS_Y - 8}" width="${KP_W - 20}" height="42" rx="6" fill="${C.bg0}" opacity="0.6"/>`
  );
  const stats = [
    { n: data.keyPoints.length, label: "要点", color: C.blue },
    { n: data.decisions.length, label: "决策", color: C.orange },
    { n: data.todos.length, label: "待办", color: C.green },
    { n: data.risks.length, label: "风险", color: C.red },
  ];
  let stX = KP_X + PAD;
  for (const s of stats) {
    parts.push(svgText(String(s.n), { x: stX, y: STATS_Y + 20, size: 24, fill: s.color, weight: "700" }));
    parts.push(svgText(s.label, { x: stX + (s.n >= 10 ? 32 : 22), y: STATS_Y + 20, size: 14, fill: C.textDim }));
    stX += Math.floor(KP_W / 4) - 4;
  }

  // ── RIGHT COLUMN: Decisions (top) + Todos (bottom) ────────────
  const RC_X = DIV_X + 10;
  const RC_W = W - RC_X - 16;
  const DEC_H = Math.floor(BODY_H * 0.46);
  const TODO_H = BODY_H - DEC_H - 10;

  // DECISIONS card
  parts.push(
    `<rect x="${RC_X}" y="${BODY_Y}" width="${RC_W}" height="${DEC_H}" rx="${CARD_RADIUS}" fill="${C.cardR}" stroke="${C.border}" stroke-width="1"/>`
  );
  parts.push(
    `<rect x="${RC_X}" y="${BODY_Y}" width="${RC_W}" height="4" rx="${CARD_RADIUS}" fill="${C.orange}" opacity="0.9"/>`
  );
  parts.push(
    svgText("DECISIONS", {
      x: RC_X + PAD,
      y: BODY_Y + 36,
      size: 14,
      fill: C.orange,
      weight: "600",
      letterSpacing: 3,
    })
  );
  parts.push(
    `<line x1="${RC_X + PAD}" y1="${BODY_Y + 46}" x2="${RC_X + RC_W - PAD}" y2="${BODY_Y + 46}" stroke="${C.border}" stroke-width="1"/>`
  );

  const DEC_TEXT_X = RC_X + PAD + 36;
  const DEC_MAX_W = RC_W - PAD * 2 - 40;
  const NUMS = ["①", "②", "③", "④", "⑤", "⑥"];
  const decItems = (data.decisions ?? []).slice(0, 5);
  let decY = BODY_Y + 62;

  if (decItems.length === 0) {
    parts.push(svgText("（暂无决策记录）", { x: RC_X + PAD, y: BODY_Y + 80, size: 17, fill: C.textDim }));
  }

  for (let di = 0; di < decItems.length; di++) {
    const wrapped = wrapText(decItems[di].title, DEC_MAX_W, 18, 2);
    parts.push(
      svgText(NUMS[di] ?? "·", {
        x: RC_X + PAD,
        y: decY + 16,
        size: 22,
        fill: C.orange,
        opacity: 0.85,
      })
    );
    for (let li = 0; li < wrapped.length; li++) {
      parts.push(
        svgText(wrapped[li], {
          x: DEC_TEXT_X,
          y: decY + (li === 0 ? 16 : 16 + li * 24),
          size: 18,
          fill: C.textPri,
        })
      );
    }
    decY += wrapped.length === 1 ? 38 : 38 + (wrapped.length - 1) * 24;
    if (decY > BODY_Y + DEC_H - 8) break;
  }

  // ACTION ITEMS (todos) card
  const TODO_Y = BODY_Y + DEC_H + 10;
  parts.push(
    `<rect x="${RC_X}" y="${TODO_Y}" width="${RC_W}" height="${TODO_H}" rx="${CARD_RADIUS}" fill="${C.cardR2}" stroke="${C.border}" stroke-width="1"/>`
  );
  parts.push(
    `<rect x="${RC_X}" y="${TODO_Y}" width="${RC_W}" height="4" rx="${CARD_RADIUS}" fill="${C.green}" opacity="0.9"/>`
  );
  parts.push(
    svgText("ACTION ITEMS", {
      x: RC_X + PAD,
      y: TODO_Y + 36,
      size: 14,
      fill: C.green,
      weight: "600",
      letterSpacing: 3,
    })
  );
  parts.push(
    `<line x1="${RC_X + PAD}" y1="${TODO_Y + 46}" x2="${RC_X + RC_W - PAD}" y2="${TODO_Y + 46}" stroke="${C.border}" stroke-width="1"/>`
  );

  const TODO_TEXT_X = RC_X + PAD + 26;
  const BADGE_X = RC_X + RC_W - 100;
  const TODO_MAX_W = RC_W - PAD * 2 - 120;
  const todoItems = (data.todos ?? []).slice(0, 7);
  const prioColors: Record<string, string> = {
    P0: C.red,
    P1: C.orange,
    P2: C.blue,
    P3: C.textDim,
  };
  let todoY = TODO_Y + 60;

  if (todoItems.length === 0) {
    parts.push(svgText("（暂无待办事项）", { x: RC_X + PAD, y: TODO_Y + 78, size: 17, fill: C.textDim }));
  }

  for (const todo of todoItems) {
    const prio = todo.priority ?? "P2";
    const pc = prioColors[prio] ?? C.blue;
    const wrapped = wrapText(todo.title, TODO_MAX_W, 17, 2);
    // Arrow
    parts.push(svgText("▶", { x: RC_X + PAD + 4, y: todoY + 12, size: 13, fill: C.green, opacity: 0.8 }));
    for (let li = 0; li < wrapped.length; li++) {
      parts.push(
        svgText(wrapped[li], {
          x: TODO_TEXT_X,
          y: todoY + (li === 0 ? 12 : 12 + li * 22),
          size: 17,
          fill: C.textPri,
        })
      );
    }
    // Priority badge
    parts.push(`<rect x="${BADGE_X}" y="${todoY - 4}" width="48" height="22" rx="5" fill="${pc}" opacity="0.18"/>`);
    parts.push(
      svgText(prio, { x: BADGE_X + 24, y: todoY + 12, size: 14, fill: pc, weight: "600", anchor: "middle" })
    );
    // Owner (if present)
    if (todo.suggestedOwner) {
      const ownerText = todo.suggestedOwner.slice(0, 5);
      parts.push(
        svgText(ownerText, {
          x: RC_X + RC_W - PAD,
          y: todoY + 12,
          size: 13,
          fill: C.textDim,
          anchor: "end",
        })
      );
    }
    todoY += wrapped.length === 1 ? 34 : 34 + (wrapped.length - 1) * 22;
    if (todoY > TODO_Y + TODO_H - 10) break;
  }

  // ── Footer: Risks ──────────────────────────────────────────────
  const FTR_Y = H - 60;
  parts.push(`<rect x="0" y="${FTR_Y}" width="${W}" height="60" fill="${C.bg0}"/>`);
  parts.push(`<line x1="0" y1="${FTR_Y}" x2="${W}" y2="${FTR_Y}" stroke="${C.border}" stroke-width="1"/>`);

  const riskItems = (data.risks ?? []).slice(0, 3);
  if (riskItems.length > 0) {
    parts.push(svgText("⚠ RISKS", { x: 28, y: FTR_Y + 36, size: 14, fill: C.red, weight: "600", letterSpacing: 2 }));
    const riskLine = riskItems.join("   ·   ");
    const truncRisk = measureWidth(riskLine, 15) > W - 240 ? Array.from(riskLine).slice(0, 100).join("") + "…" : riskLine;
    parts.push(svgText(truncRisk, { x: 130, y: FTR_Y + 36, size: 15, fill: C.textSec }));
  } else {
    parts.push(svgText("✓  暂无风险或遗留问题", { x: 28, y: FTR_Y + 36, size: 15, fill: C.textDim }));
  }

  // Branding
  parts.push(svgText("TeamMindAI", { x: W - 28, y: FTR_Y + 36, size: 13, fill: C.textDim, anchor: "end" }));

  // ── Close ──────────────────────────────────────────────────────
  parts.push("</svg>");

  return Buffer.from(parts.join("\n"), "utf-8");
}
