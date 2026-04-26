"use client";

import { useState } from "react";
import { IntentRouterSandbox } from "@/components/sandbox2/IntentRouterSandbox";
import { PlannerSandbox } from "@/components/sandbox2/PlannerSandbox";
import { WorkerSandbox } from "@/components/sandbox2/WorkerSandbox";
import { SynthesizerSandbox } from "@/components/sandbox2/SynthesizerSandbox";
import { FullPipelineSandbox } from "@/components/sandbox2/FullPipelineSandbox";

export function Sandbox2PipelinePage() {
  const [pipelineBusy, setPipelineBusy] = useState(false);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-10 pt-0 sm:px-6">
      <header className="flex shrink-0 items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Parallel Pipeline Sandbox</h1>
          <p className="text-xs text-zinc-500">
            Test individual agents in the parallel research pipeline. Each panel runs its agent
            independently. Full Pipeline runs the complete loop with dig-deeper feedback.
          </p>
        </div>
      </header>

      <FullPipelineSandbox pipelineBusy={pipelineBusy} onBusyChange={setPipelineBusy} />
      <IntentRouterSandbox pipelineBusy={pipelineBusy} />
      <PlannerSandbox pipelineBusy={pipelineBusy} />
      <WorkerSandbox pipelineBusy={pipelineBusy} />
      <SynthesizerSandbox pipelineBusy={pipelineBusy} />
    </div>
  );
}
