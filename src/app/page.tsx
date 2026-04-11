"use client";

import { useMemo, useState } from "react";
import {
  ParallelSourcePolicyMenu,
  type ParallelSourcePolicyMenuProps,
} from "@/components/ParallelSourcePolicyMenu";
import { ProductionChatView } from "@/components/ProductionChatView";
import { SandboxPipelinePage } from "@/components/SandboxPipelinePage";
import { parallelSourcePolicyRequestFromLists } from "@/lib/parallelSourcePolicy";

export default function Home() {
  const [mode, setMode] = useState<"sandbox" | "production">("sandbox");

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
      <div className="fixed left-3 top-3 z-[100] flex items-center gap-2 sm:left-4 sm:top-4">
        <div
          className="flex w-fit rounded-lg border border-zinc-200 bg-white p-0.5 shadow-md"
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
        <ParallelSourcePolicyMenu {...sourcePolicyMenuProps} inlineTrigger />
      </div>

      {mode === "sandbox" ? (
        <div className="flex min-h-0 flex-1 flex-col pt-14 sm:pt-16">
          <SandboxPipelinePage sourcePolicyRequest={sourcePolicyRequest} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-14 sm:pt-16">
          <ProductionChatView sourcePolicyRequest={sourcePolicyRequest} />
        </div>
      )}
    </div>
  );
}
