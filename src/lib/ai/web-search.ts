import { env } from "@/lib/env";

/**
 * 联网搜索（Tavily）。仅用于「AI 对齐室」的近 30 天竞品/同行分析。
 * 未配置 TAVILY_API_KEY 时，isWebSearchEnabled() 返回 false，调用方应隐藏相关功能。
 */

export function isWebSearchEnabled(): boolean {
  return Boolean(env.search.tavilyApiKey);
}

export interface WebSearchHit {
  title: string;
  url: string;
  /** 资料摘要（已截断，供 LLM 参考） */
  content: string;
  /** 发布日期（部分来源可能为空） */
  publishedDate?: string;
}

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
}

/**
 * 检索最近一段时间（默认 30 天）的新闻/行业资讯。
 * 使用 Tavily 的 news topic + days 时间窗，返回干净的可引用结果。
 * @throws 未配置 Key 或请求失败时抛出（调用方需 try/catch 降级）。
 */
export async function searchRecentNews(
  query: string,
  opts: { days?: number; maxResults?: number } = {}
): Promise<WebSearchHit[]> {
  const key = env.search.tavilyApiKey;
  if (!key) throw new Error("未配置联网搜索（TAVILY_API_KEY）。");

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      topic: "news",
      days: opts.days ?? 30,
      max_results: opts.maxResults ?? 8,
      search_depth: "basic",
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `联网搜索失败（${res.status}）${detail ? `：${detail.slice(0, 160)}` : ""}`
    );
  }

  const data = (await res.json()) as { results?: TavilyResult[] };
  return (data.results ?? [])
    .filter((r): r is TavilyResult & { url: string } => Boolean(r.url))
    .map((r) => ({
      title: r.title?.trim() || r.url,
      url: r.url,
      content: (r.content ?? "").slice(0, 1200),
      publishedDate: r.published_date,
    }));
}
