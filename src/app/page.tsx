"use client";

import { useMemo, useState } from "react";
import { AppSettingsSheet } from "@/components/AppSettingsSheet";
import type { ParallelSourcePolicyMenuProps } from "@/components/ParallelSourcePolicyMenu";
import { DemoChatView } from "@/components/DemoChatView";
import { ResearchChatView } from "@/components/ResearchChatView";
import { Sandbox2PipelinePage } from "@/components/Sandbox2PipelinePage";
import { useResearchChat } from "@/hooks/useResearchChat";
import { parallelSourcePolicyRequestFromLists } from "@/lib/parallelSourcePolicy";

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mode, setMode] = useState<"sandbox2" | "research" | "demo">("demo");

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

  const researchChat = useResearchChat({ sourcePolicy: sourcePolicyRequest });
  const demoChat = useResearchChat({ sourcePolicy: sourcePolicyRequest });

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
      <AppSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        mode={mode}
        onModeChange={setMode}
        sourcePolicyMenuProps={sourcePolicyMenuProps}
        researchChat={researchChat}
        demoChat={demoChat}
      />

      {mode === "sandbox2" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <Sandbox2PipelinePage />
        </div>
      ) : mode === "research" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ResearchChatView key="research-tab" chat={researchChat} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DemoChatView
            key="demo-tab"
            chat={demoChat}
            sourcePolicyMenuProps={sourcePolicyMenuProps}
            settingsOpen={settingsOpen}
            onOpenSettings={() => setSettingsOpen((open) => !open)}
          />
        </div>
      )}
    </div>
  );
}
