"use client";

import { ListFilter, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { ParallelSourcePolicyBar, type ParallelSourcePolicyBarProps } from "@/components/ParallelSourcePolicyBar";
import type { ParallelSourcePolicyRequest } from "@/lib/parallelSourcePolicy";
import { cn } from "@/lib/utils";

export type ParallelSourcePolicyMenuProps = Omit<ParallelSourcePolicyBarProps, "visualTheme"> & {
  previewRequest: ParallelSourcePolicyRequest | undefined;
  /** When true, the open button flows in normal layout (e.g. beside the mode toggle). */
  inlineTrigger?: boolean;
  /** Controlled dialog open state (use with `onOpenChange`). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** When false, only the dialog is rendered; parent must open via controlled `open`. */
  showTrigger?: boolean;
  /** Icon-only trigger: no label, no active-policy dot (e.g. in chat composer). */
  triggerIconOnly?: boolean;
  /** Claire demo styling for shell + trigger */
  visualTheme?: "default" | "demo";
};

export function ParallelSourcePolicyMenu({
  previewRequest,
  inlineTrigger = false,
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
  triggerIconOnly = false,
  visualTheme = "default",
  ...barProps
}: ParallelSourcePolicyMenuProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined && onOpenChange !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) onOpenChange(next);
    else setInternalOpen(next);
  };
  const panelId = useId();
  const titleId = useId();
  const hasPolicy =
    previewRequest !== undefined && Object.keys(previewRequest).length > 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const isDemo = visualTheme === "demo";

  return (
    <>
      {showTrigger ? (
        <button
          type="button"
          className={
            triggerIconOnly
              ? isDemo
                ? "flex size-9 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[#2d5538] transition-colors hover:bg-[#171616]/8 disabled:opacity-40"
                : "flex size-9 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-zinc-700 transition-colors hover:bg-zinc-900/5 disabled:opacity-40"
              : isDemo
                ? cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg border border-[#3d6b47]/35 bg-[#cbe6ae]/70 px-2 py-1.5 text-left text-xs font-medium text-[#171616] transition-colors hover:bg-[#cbe6ae]",
                    inlineTrigger ? "" : "",
                  )
                : inlineTrigger
                  ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white shadow-md transition-colors hover:bg-zinc-50"
                  : "fixed left-3 top-20 z-[100] flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-200 bg-white shadow-md transition-colors hover:bg-zinc-50 sm:left-4 sm:top-[4.25rem]"
          }
          aria-expanded={open}
          aria-controls={panelId}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          title="Filters"
        >
          {triggerIconOnly ? (
            <ListFilter className={cn("size-[18px] shrink-0", isDemo ? "text-[#2d5538]" : "text-zinc-700")} aria-hidden />
          ) : (
            <>
              <span className="relative inline-flex">
                <ListFilter className={cn("shrink-0", isDemo ? "size-[18px] text-[#2d5538]" : "size-5 text-zinc-800")} aria-hidden />
                {hasPolicy ? (
                  <span
                    className={cn(
                      "absolute -right-0.5 -top-0.5 size-2 rounded-full ring-2",
                      isDemo ? "bg-[#cbe6ae] ring-white/90" : "bg-amber-500 ring-white",
                    )}
                  />
                ) : null}
              </span>
              {isDemo && inlineTrigger ? (
                <span className="hidden min-[380px]:inline">Filter</span>
              ) : null}
            </>
          )}
          <span className="sr-only">Open filters</span>
        </button>
      ) : null}

      {open
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6">
              <button
                type="button"
                className={cn(
                  "absolute inset-0 backdrop-blur-[2px]",
                  isDemo ? "bg-[#171616]/30" : "bg-zinc-950/45 backdrop-blur-[1px]",
                )}
                aria-label="Close"
                onClick={() => setOpen(false)}
              />
              <div
                id={panelId}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={cn(
                  "relative mx-auto flex max-h-[min(90dvh,40rem)] w-full max-w-lg flex-col overflow-hidden shadow-2xl",
                  isDemo
                    ? "rounded-2xl border border-[#171616]/14 bg-white/95 backdrop-blur-md"
                    : "rounded-xl border border-zinc-200 bg-zinc-50",
                )}
              >
                <header
                  className={cn(
                    "flex shrink-0 items-center justify-end gap-2 border-b px-3 py-2",
                    isDemo ? "border-[#171616]/10 bg-white/90" : "border-zinc-200 bg-white",
                  )}
                >
                  <h2 id={titleId} className="sr-only">
                    Filters
                  </h2>
                  <button
                    type="button"
                    className={cn(
                      "rounded-md p-1.5",
                      isDemo
                        ? "text-[#171616]/55 hover:bg-[#171616]/8 hover:text-[#171616]"
                        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
                    )}
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                  >
                    <X className="size-5" aria-hidden />
                  </button>
                </header>
                <div className="min-h-0 overflow-y-auto overscroll-contain p-3">
                  <ParallelSourcePolicyBar {...barProps} visualTheme={isDemo ? "demo" : "default"} />
                </div>
                <footer
                  className={cn(
                    "shrink-0 border-t px-4 py-3",
                    isDemo ? "border-[#171616]/10 bg-white/90" : "border-zinc-200 bg-white",
                  )}
                >
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isDemo
                        ? "bg-[#cbe6ae] text-[#171616] hover:bg-[#b5d388]"
                        : "bg-[#3d6b47] text-[#faf8f5] hover:bg-[#345c3d]",
                    )}
                    onClick={() => setOpen(false)}
                  >
                    Done
                  </button>
                </footer>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
