"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

const components: Components = {
  p: ({ children }) => (
    <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0">{children}</p>
  ),
  h1: ({ children }) => (
    <h1 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-3 text-sm font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-2.5 text-sm font-semibold first:mt-0">{children}</h3>
  ),
  ul: ({ children }) => (
    <ul className="my-1.5 ml-4 list-disc space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1.5 ml-4 list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline underline-offset-2"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-3 border-border" />,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return <code className={cn("block", className)}>{children}</code>;
    }
    return (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border bg-muted/50 px-2 py-1 text-left font-medium">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border px-2 py-1">{children}</td>,
};

export function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={cn("text-sm", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
