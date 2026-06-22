"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/** 轻量模态框（无第三方依赖）：Esc 关闭、点击遮罩关闭、打开时锁定滚动、Portal 到 body。 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "bg-background relative z-10 w-full max-w-lg rounded-xl border shadow-xl",
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && (
              <p className="text-muted-foreground mt-1 text-sm">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:bg-muted hover:text-foreground -mr-1 rounded-md p-1"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
