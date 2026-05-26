"use client";

import { useState } from "react";
import { IntentRouterSandbox } from "@/components/sandbox/IntentRouterSandbox";
import { OrchestratorSandbox } from "@/components/sandbox/OrchestratorSandbox";
import { WorkerSandbox } from "@/components/sandbox/WorkerSandbox";
import { FullPipelineSandbox } from "@/components/sandbox/FullPipelineSandbox";

export function Sandbox2PipelinePage() {
  const [pipelineBusy, setPipelineBusy] = useState(false);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-10 pt-0 sm:px-6">
      <header className="flex shrink-0 items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Parallel Pipeline Sandbox</h1>
          <p className="text-xs text-zinc-500">
            Test individual agents in the orchestrator-driven research pipeline. Full Pipeline runs
            the complete Orchestrator → Workers → Review loop.
          </p>
        </div>
      </header>

      <FullPipelineSandbox pipelineBusy={pipelineBusy} onBusyChange={setPipelineBusy} />
      <IntentRouterSandbox pipelineBusy={pipelineBusy} />
      <OrchestratorSandbox pipelineBusy={pipelineBusy} />
      <WorkerSandbox pipelineBusy={pipelineBusy} />
    </div>
  );
}
