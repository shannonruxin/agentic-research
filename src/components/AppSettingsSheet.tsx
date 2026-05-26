"use client";

import { UserButton } from "@clerk/nextjs";
import { ChevronLeft, ChevronRight, ListFilter, RotateCcw, Settings } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  ParallelSourcePolicyMenu,
  type ParallelSourcePolicyMenuProps,
} from "@/components/ParallelSourcePolicyMenu";
import { ResearchAdvancedSettingsForm } from "@/components/ResearchAdvancedSettingsForm";
import type { ResearchChatController } from "@/hooks/useResearchChat";
import { cn } from "@/lib/utils";

type UiMode = "sandbox" | "demo";

type AppSettingsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: UiMode;
  onModeChange: (mode: UiMode) => void;
  sourcePolicyMenuProps: ParallelSourcePolicyMenuProps;
  demoChat: ResearchChatController;
};

export function AppSettingsSheet({
  open,
  onOpenChange,
  mode,
  onModeChange,
  sourcePolicyMenuProps,
  demoChat,
}: AppSettingsSheetProps) {
  const [Subview, setSubview] = useState<"main" | "advanced">("main");
  const [policyOpen, setPolicyOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const titleId = useId();
  const clearingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (policyOpen) return;
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange, policyOpen]);

  useEffect(() => {
    if (open) setSubview("main");
  }, [open]);

  const showFloatingTrigger = true;

  const modeBtn = (m: UiMode, label: string) => (
    <button
      key={m}
      type="button"
      className={
        mode === m
          ? "rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white sm:text-sm"
          : "rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 sm:text-sm"
      }
      onClick={() => onModeChange(m)}
    >
      {label}
    </button>
  );

  return (
    <>
      {showFloatingTrigger ? (
        <button
          type="button"
          className={cn(
            "fixed right-3 top-3 z-[100] flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white shadow-md transition-colors hover:bg-zinc-50 sm:right-4 sm:top-4",
            open && "border-zinc-400 bg-zinc-50",
          )}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => onOpenChange(!open)}
          title="Settings"
        >
          <Settings className="size-5 text-zinc-800" aria-hidden />
          <span className="sr-only">Settings</span>
        </button>
      ) : null}

      <ParallelSourcePolicyMenu
        {...sourcePolicyMenuProps}
        open={policyOpen}
        onOpenChange={setPolicyOpen}
        showTrigger={false}
      />

      {open ? (
        <div className="fixed inset-0 z-[110] flex justify-end sm:justify-center sm:pt-10 sm:pb-10" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[1px]"
            aria-label="Close settings"
            onClick={() => onOpenChange(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative flex h-full w-full max-w-md animate-in flex-col border-l border-zinc-200 bg-white shadow-2xl duration-200 slide-in-from-right sm:my-auto sm:h-[min(92dvh,48rem)] sm:max-h-[92dvh] sm:rounded-xl sm:border"
          >
            {Subview === "main" ? (
              <>
                <header className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-4 py-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-zinc-900 text-white">
                    <Settings className="size-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 id={titleId} className="text-sm font-semibold text-zinc-900">
                      Settings
                    </h2>
                    <p className="text-[11px] text-zinc-500">Workspace, filters, account, and research options</p>
                  </div>
                </header>

                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4">
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Workspace</h3>
                    <p className="text-xs text-zinc-600">Choose which tool surface to show.</p>
                    <div
                      className="flex flex-wrap gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50/80 p-0.5"
                      role="group"
                      aria-label="UI mode"
                    >
                      {modeBtn("sandbox", "Sandbox")}
                      {modeBtn("demo", "Demo")}
                    </div>
                  </section>

                  <section className="space-y-2">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-left text-sm font-medium text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50"
                      onClick={() => setPolicyOpen(true)}
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-zinc-100">
                          <ListFilter className="size-4 text-zinc-700" aria-hidden />
                        </span>
                        <span>Filters</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-zinc-400" aria-hidden />
                    </button>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Account</h3>
                    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-3">
                      <div className="min-w-0 flex-1 text-xs text-zinc-600">
                        Signed in with Clerk. Use your profile menu for account actions.
                      </div>
                      <div className="shrink-0 [&_.cl-rootBox]:leading-none">
                        <UserButton />
                      </div>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Research</h3>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-left text-sm font-medium text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50"
                      onClick={() => setSubview("advanced")}
                    >
                      <span>Advanced settings</span>
                      <ChevronRight className="size-4 shrink-0 text-zinc-400" aria-hidden />
                    </button>
                    <p className="text-[11px] leading-relaxed text-zinc-500">
                      Pipeline overrides and JSON seeds — same payload as the Demo chat API.
                    </p>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">History</h3>
                    <button
                      type="button"
                      disabled={clearing}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-red-100 bg-white px-3 py-3 text-left text-sm font-medium text-red-600 shadow-sm transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={async () => {
                        if (clearingRef.current) return;
                        clearingRef.current = true;
                        setClearing(true);
                        await demoChat.clearAllSessions();
                        setClearing(false);
                        clearingRef.current = false;
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-red-50">
                          <RotateCcw className={cn("size-4 text-red-500", clearing && "animate-spin")} aria-hidden />
                        </span>
                        <span>{clearing ? "Clearing…" : "Clear all chat history"}</span>
                      </span>
                    </button>
                    <p className="text-[11px] leading-relaxed text-zinc-500">
                      Deletes all sessions and resets to session 0. Cannot be undone.
                    </p>
                  </section>
                </div>
              </>
            ) : (
              <>
                <header className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-3 py-3">
                  <button
                    type="button"
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100"
                    onClick={() => setSubview("main")}
                    aria-label="Back to settings"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <h2 id={titleId} className="text-sm font-semibold text-zinc-900">
                      Advanced settings
                    </h2>
                    <p className="text-[11px] text-zinc-500">Demo chat API payload</p>
                  </div>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
                  <ResearchAdvancedSettingsForm chat={demoChat} />
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
