"use client";

import { useState } from "react";
import { ProductionChatView } from "@/components/ProductionChatView";
import { SandboxPipelinePage } from "@/components/SandboxPipelinePage";

export default function Home() {
  const [mode, setMode] = useState<"sandbox" | "production">("sandbox");

  return (
    <div className="relative min-h-[100dvh]">
      <div
        className="fixed left-3 top-3 z-[100] flex rounded-lg border border-zinc-200 bg-white p-0.5 shadow-md sm:left-4 sm:top-4"
        role="group"
        aria-label="UI mode"
      >
        <button
          type="button"
          className={
            mode === "sandbox"
              ? "rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white sm:text-sm"
              : "rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 sm:text-sm"
          }
          onClick={() => setMode("sandbox")}
        >
          Sandbox
        </button>
        <button
          type="button"
          className={
            mode === "production"
              ? "rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white sm:text-sm"
              : "rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 sm:text-sm"
          }
          onClick={() => setMode("production")}
        >
          Production
        </button>
      </div>

      {mode === "sandbox" ? (
        <div className="pt-14">
          <SandboxPipelinePage />
        </div>
      ) : (
        <ProductionChatView />
      )}
    </div>
  );
}
