"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";

export interface SearchableOption {
  value: string;
  label: string;
  /** 次要信息（如账号、角色），同时参与搜索匹配。 */
  hint?: string;
}

/** 轻量可搜索下拉（无第三方依赖）：点击展开、输入过滤、点击外部关闭。 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "选择…",
  searchPlaceholder = "搜索…",
  emptyText = "无匹配项",
  disabled,
  className,
}: {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? null;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          (o.hint?.toLowerCase().includes(q) ?? false)
      )
    : options;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="bg-background focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px] disabled:opacity-60"
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
      </button>

      {open && (
        <div className="bg-popover absolute z-50 mt-1 w-full overflow-hidden rounded-md border shadow-md">
          <div className="flex items-center gap-2 border-b px-2.5">
            <Search className="text-muted-foreground size-4 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="text-muted-foreground px-2 py-3 text-center text-sm">
                {emptyText}
              </p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "hover:bg-accent flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                    o.value === value && "bg-accent/60"
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {o.label}
                    {o.hint ? (
                      <span className="text-muted-foreground ml-1 text-xs">
                        {o.hint}
                      </span>
                    ) : null}
                  </span>
                  {o.value === value && <Check className="size-4 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
