/**
 * 宽松 JSON 工具：处理 OpenAI 兼容代理 / 各种 LLM 偶尔吐出的「非标 JSON」。
 *
 * 最常见的两种故障：
 * 1) 字符串值里含**裸控制字符**（\n / \r / \t），违反 JSON 必须转义的规定；
 *    典型场景：whisper 代理把转写文本里的换行直接塞进 `"text"` 字段；
 *    LLM 把含换行的 Markdown 直接塞进 `"summary"` 字段。
 * 2) 我们关心的 JSON 对象被前后无关文字包围（如 Markdown 代码块、解释性前后语）。
 *
 * 解决：先尝试严格 `JSON.parse`，失败时用字符级状态机给双引号内裸控制字符加转义再试一遍。
 */

/** 从可能包含说明文字 / Markdown 代码块的文本中，截取首个看起来像 JSON 的对象片段。 */
export function extractJsonObject(text: string): string {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("响应中未发现有效的 JSON 对象。");
  }
  return t.slice(start, end + 1);
}

/**
 * 宽松解析：严格 JSON.parse 失败时做一次字符级修补再试。
 * 修补两类典型问题：
 *   1) 字符串值内的「裸控制字符」（裸 \n / \r / \t / 其它 0x00–0x1F）→ 合法转义；
 *   2) 字符串值内的「裸双引号」→ 通过前瞻判断当前 " 是否真为字符串终结符
 *      （后跟 , } ] : 或 EOF 才认作终结，否则视为内容里的 "，自动补 \"）。
 * 修补后仍失败则抛回原始错误。
 */
export function tryParseLenient(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (origin) {
    let inString = false;
    let escape = false;
    const out: string[] = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const code = text.charCodeAt(i);
      if (escape) {
        out.push(ch);
        escape = false;
        continue;
      }
      if (ch === "\\") {
        out.push(ch);
        escape = true;
        continue;
      }
      if (ch === '"') {
        if (!inString) {
          // 字符串外的 " → 开启新字符串
          inString = true;
          out.push(ch);
        } else {
          // 字符串内的 " → 前瞻判断：后面跳过空白后是 ,}]: 或 EOF 才算合法终结符。
          let j = i + 1;
          while (j < text.length && /\s/.test(text[j])) j++;
          const next = j < text.length ? text[j] : undefined;
          const isTerminator =
            next === undefined ||
            next === "," ||
            next === "}" ||
            next === "]" ||
            next === ":";
          if (isTerminator) {
            inString = false;
            out.push(ch);
          } else {
            // 裸引号：自动补转义，inString 不变。
            out.push("\\", ch);
          }
        }
        continue;
      }
      if (inString && code <= 0x1f) {
        out.push(
          ch === "\n"
            ? "\\n"
            : ch === "\r"
              ? "\\r"
              : ch === "\t"
                ? "\\t"
                : `\\u${code.toString(16).padStart(4, "0")}`
        );
        continue;
      }
      out.push(ch);
    }
    try {
      return JSON.parse(out.join(""));
    } catch {
      throw origin;
    }
  }
}

/** 返回 JSON.parse 报错位置周边 80 字符的上下文，便于在日志里直接定位坏字符。 */
export function bodyContext(text: string, message: string): string {
  const m = message.match(/position (\d+)/);
  if (!m) return text.slice(0, 200);
  const pos = Number(m[1]);
  const start = Math.max(0, pos - 80);
  const end = Math.min(text.length, pos + 80);
  return `…${text.slice(start, end).replace(/[\r\n]+/g, "\\n")}…@${pos}`;
}
