"use client";

import { ListFilter, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ParallelSourcePolicyBar, type ParallelSourcePolicyBarProps } from "@/components/ParallelSourcePolicyBar";
import type { ParallelSourcePolicyRequest } from "@/lib/parallelSourcePolicy";

export type ParallelSourcePolicyMenuProps = ParallelSourcePolicyBarProps & {
  previewRequest: ParallelSourcePolicyRequest | undefined;
  /** When true, the open button flows in normal layout (e.g. beside the mode toggle). */
  inlineTrigger?: boolean;
};

export function ParallelSourcePolicyMenu({
  previewRequest,
  inlineTrigger = false,
  ...barProps
}: ParallelSourcePolicyMenuProps) {
  const [open, setOpen] = useState(false);
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

  return (
    <>
      <button
        type="button"
        className={
          inlineTrigger
            ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white shadow-md transition-colors hover:bg-zinc-50"
            : "fixed left-3 top-20 z-[100] flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-200 bg-white shadow-md transition-colors hover:bg-zinc-50 sm:left-4 sm:top-[4.25rem]"
        }
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        title="Search source policy (Parallel)"
      >
        <span className="relative inline-flex">
          <ListFilter className="size-5 text-zinc-800" aria-hidden />
          {hasPolicy ? (
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber-500 ring-2 ring-white" />
          ) : null}
        </span>
        <span className="sr-only">Open search source policy settings</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/45 backdrop-blur-[1px]"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative flex max-h-[min(90dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 shadow-2xl"
          >
            <header className="flex shrink-0 items-start justify-between gap-2 border-b border-zinc-200 bg-white px-4 py-3">
              <div>
                <h2 id={titleId} className="text-sm font-semibold text-zinc-900">
                  Search source policy
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Parallel search — excludes, Prioritized Domains, and optional restrict (Agent 3 + smoke test).
                </p>
              </div>
              <button
                type="button"
                className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X className="size-5" aria-hidden />
              </button>
            </header>
            <div className="min-h-0 overflow-y-auto overscroll-contain p-3">
              <ParallelSourcePolicyBar {...barProps} />
            </div>
            <footer className="shrink-0 border-t border-zinc-200 bg-white px-4 py-3">
              <button
                type="button"
                className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                onClick={() => setOpen(false)}
              >
                Done
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
