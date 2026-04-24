"use client";

import { UserButton } from "@clerk/nextjs";
import { useMemo, useState } from "react";
import {
  ParallelSourcePolicyMenu,
  type ParallelSourcePolicyMenuProps,
} from "@/components/ParallelSourcePolicyMenu";
import { ProductionChatView } from "@/components/ProductionChatView";
import { ResearchChatView } from "@/components/ResearchChatView";
import { SandboxPipelinePage } from "@/components/SandboxPipelinePage";
import { parallelSourcePolicyRequestFromLists } from "@/lib/parallelSourcePolicy";

export default function Home() {
  const [mode, setMode] = useState<"sandbox" | "verbatim" | "research">("sandbox");

  const [excludedDomains, setExcludedDomains] = useState<string[]>(["wikipedia.org"]);
  const [includedDomains, setIncludedDomains] = useState<string[]>([]);
  const [publishedAfter, setPublishedAfter] = useState("");
  const [publishedBefore, setPublishedBefore] = useState("");
  const [onlyUseIncludedDomains, setOnlyUseIncludedDomains] = useState(false);

  const sourcePolicyRequest = useMemo(
    () =>
      parallelSourcePolicyRequestFromLists({
        excludeDomains: excludedDomains,
        includeDomains: onlyUseIncludedDomains ? includedDomains : [],
        publishedAfter,
        publishedBefore,
      }),
    [excludedDomains, includedDomains, onlyUseIncludedDomains, publishedAfter, publishedBefore],
  );

  const sourcePolicyMenuProps = {
    excludedDomains,
    includedDomains,
    onExcludedDomainsChange: setExcludedDomains,
    onIncludedDomainsChange: setIncludedDomains,
    publishedAfter,
    onPublishedAfterChange: setPublishedAfter,
    publishedBefore,
    onPublishedBeforeChange: setPublishedBefore,
    onlyUseIncludedDomains,
    onOnlyUseIncludedDomainsChange: setOnlyUseIncludedDomains,
    previewRequest: sourcePolicyRequest,
  } satisfies ParallelSourcePolicyMenuProps;

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <div className="fixed left-3 right-3 top-3 z-[100] flex items-center justify-between gap-2 sm:left-4 sm:right-4 sm:top-4">
        <div
          className="flex w-fit max-w-[calc(100vw-8rem)] flex-wrap gap-0.5 rounded-lg border border-zinc-200 bg-white p-0.5 shadow-md sm:max-w-none"
          role="group"
          aria-label="UI mode"
        >
          <button
            type="button"
            className={
              mode === "sandbox"
                ? "rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white sm:px-3 sm:text-sm"
                : "rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 sm:px-3 sm:text-sm"
            }
            onClick={() => setMode("sandbox")}
          >
            Sandbox
          </button>
          <button
            type="button"
            className={
              mode === "verbatim"
                ? "rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white sm:px-3 sm:text-sm"
                : "rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 sm:px-3 sm:text-sm"
            }
            onClick={() => setMode("verbatim")}
          >
            Verbatim
          </button>
          <button
            type="button"
            className={
              mode === "research"
                ? "rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white sm:px-3 sm:text-sm"
                : "rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 sm:px-3 sm:text-sm"
            }
            onClick={() => setMode("research")}
          >
            Research
          </button>
        </div>
        <ParallelSourcePolicyMenu {...sourcePolicyMenuProps} inlineTrigger />
        <div className="shrink-0 [&_.cl-rootBox]:leading-none">
          <UserButton />
        </div>
      </div>

      {mode === "sandbox" ? (
        <div className="flex min-h-0 flex-1 flex-col pt-14 sm:pt-16">
          <SandboxPipelinePage sourcePolicyRequest={sourcePolicyRequest} />
        </div>
      ) : mode === "verbatim" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-14 sm:pt-16">
          <ProductionChatView sourcePolicyRequest={sourcePolicyRequest} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-14 sm:pt-16">
          <ResearchChatView />
        </div>
      )}
    </div>
  );
}
