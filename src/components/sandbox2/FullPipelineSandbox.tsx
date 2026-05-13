"use client";

import { useState } from "react";
import { CopyOutputButton } from "@/components/CopyOutputButton";
import { FULL_PIPELINE_CHEATSHEET } from "@/lib/sandbox2SpecCheatsheet";
import type { ParallelPipelineResult, ParallelPipelineStep } from "@/lib/types";

type SuccessResult = Extract<ParallelPipelineResult, { success: true }>;

export type FullPipelineSandboxProps = {
  pipelineBusy?: boolean;
  onBusyChange?: (busy: boolean) => void;
};

function stepLabel(step: ParallelPipelineStep): string {
  switch (step.kind) {
    case "intent": return `Intent → ${step.result.intent}`;
    case "orchestrator_plan": return `Orchestrator Plan → ${step.result.tasks.length} tasks (${step.result.execution_strategy})`;
    case "worker": return `Worker R${step.round}: ${step.task_id} [conf ${(step.result.confidence).toFixed(2)}]`;
    case "orchestrator_review": return `Orchestrator Review R${step.round} → ${step.result.decision.action}`;
    case "orchestrator_deliver": return `Orchestrator Deliver → thesis: ${step.result.investment_thesis.slice(0, 60)}…`;
    case "preferences": return `Preferences → ${step.result.scope}: ${step.result.notification.slice(0, 60)}`;
  }
}

export function FullPipelineSandbox({ pipelineBusy = false, onBusyChange }: FullPipelineSandboxProps) {
  const [objective, setObjective] = useState("");
  const [subjectScope, setSubjectScope] = useState("");
  const [researchHygiene, setResearchHygiene] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [maxRounds, setMaxRounds] = useState("5");
  const [maxWorkersConcurrent, setMaxWorkersConcurrent] = useState("2");
  const [workerStaggerMs, setWorkerStaggerMs] = useState("2000");
  const [maxWorkerSteps, setMaxWorkerSteps] = useState("5");
  const [maxTasksPerRound, setMaxTasksPerRound] = useState("8");
  const [orchestratorTemp, setOrchestratorTemp] = useState("0.2");
  const [workerTemp, setWorkerTemp] = useState("0.2");
  const [deliverMaxTokens, setDeliverMaxTokens] = useState("16000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SuccessResult | null>(null);

  const disabled = pipelineBusy || loading;

  const setBusy = (b: boolean) => {
    setLoading(b);
    onBusyChange?.(b);
  };

  function buildPipelineConfig(): Record<string, number> | undefined {
    const cfg: Record<string, number> = {};
    const mr = Number.parseInt(maxRounds, 10);
    if (!Number.isNaN(mr) && mr >= 1 && mr <= 5) cfg.max_rounds = mr;
    const mwc = Number.parseInt(maxWorkersConcurrent, 10);
    if (!Number.isNaN(mwc) && mwc >= 1) cfg.max_workers_concurrent = mwc;
    const ws = Number.parseInt(workerStaggerMs, 10);
    if (!Number.isNaN(ws) && ws >= 0) cfg.worker_stagger_ms = ws;
    const mws = Number.parseInt(maxWorkerSteps, 10);
    if (!Number.isNaN(mws) && mws >= 1) cfg.max_worker_steps = mws;
    const mtr = Number.parseInt(maxTasksPerRound, 10);
    if (!Number.isNaN(mtr) && mtr >= 1) cfg.max_tasks_per_round = mtr;
    const ot = Number.parseFloat(orchestratorTemp);
    if (!Number.isNaN(ot)) cfg.orchestrator_temperature = ot;
    const wt = Number.parseFloat(workerTemp);
    if (!Number.isNaN(wt)) cfg.worker_temperature = wt;
    const dmt = Number.parseInt(deliverMaxTokens, 10);
    if (!Number.isNaN(dmt) && dmt >= 4000) cfg.deliver_max_tokens = dmt;
    return Object.keys(cfg).length > 0 ? cfg : undefined;
  }

  async function run() {
    if (!objective.trim()) return;
    setError(null);
    setResult(null);

    const body: Record<string, unknown> = { objective: objective.trim() };
    if (subjectScope.trim()) body.subject_scope = subjectScope.trim();
    const hyTrim = researchHygiene.trim();
    if (hyTrim) {
      try { body.research_hygiene = JSON.parse(hyTrim); } catch {
        setError("research_hygiene is not valid JSON"); return;
      }
    }
    const pipelineConfig = buildPipelineConfig();
    if (pipelineConfig) body.pipeline_config = pipelineConfig;

    setBusy(true);
    try {
      const res = await fetch("/api/sandbox2-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : "Request failed";
        setError(err);
        return;
      }
      const ok = data as SuccessResult;
      setResult(ok);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="shrink-0 space-y-2 border-b border-zinc-200 pb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Full Pipeline (Orchestrator-Driven)
      </h2>
      <p className="text-xs text-zinc-500">
        End-to-end: Intent → Orchestrator Plan → Workers → Review loop → Deliver. Persists to{" "}
        <code className="rounded bg-zinc-100 px-1 text-[11px]">chat-dimension-memory/</code>,{" "}
        <code className="rounded bg-zinc-100 px-1 text-[11px]">chat-memory.json</code>, and{" "}
        <code className="rounded bg-zinc-100 px-1 text-[11px]">user-output.md</code>.
      </p>

      <div className="flex flex-wrap items-start justify-end gap-2 rounded-md border border-zinc-200 bg-zinc-50 text-xs text-zinc-700">
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer select-none px-3 py-2 font-medium text-zinc-600">
            Field definitions (spec cheatsheet)
          </summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-zinc-200 bg-white px-3 py-2 font-mono text-[11px] text-zinc-800">
            {FULL_PIPELINE_CHEATSHEET}
          </pre>
        </details>
        <div className="shrink-0 p-1.5">
          <CopyOutputButton text={FULL_PIPELINE_CHEATSHEET} label="Copy cheatsheet" className="!bg-zinc-800 hover:!bg-zinc-900" />
        </div>
      </div>

      <label className="block text-xs font-medium text-zinc-600">Objective</label>
      <textarea
        className="min-h-[96px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        placeholder="What should be researched?"
        value={objective}
        disabled={disabled}
        onChange={(e) => setObjective(e.target.value)}
      />

      <label className="block text-xs font-medium text-zinc-600">subject_scope (optional)</label>
      <textarea
        className="min-h-[56px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        placeholder='e.g. "Subject: humeo.com only."'
        value={subjectScope}
        disabled={disabled}
        onChange={(e) => setSubjectScope(e.target.value)}
      />

      <label className="block text-xs font-medium text-zinc-600">research_hygiene (optional JSON)</label>
      <textarea
        className="min-h-[48px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        value={researchHygiene}
        disabled={disabled}
        onChange={(e) => setResearchHygiene(e.target.value)}
        spellCheck={false}
      />

      <button
        type="button"
        className="text-xs text-zinc-600 underline"
        onClick={() => setShowConfig((o) => !o)}
      >
        {showConfig ? "Hide" : "Show"} pipeline config
      </button>

      {showConfig && (
        <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs">
          <p className="font-semibold text-zinc-700">Pipeline Config</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <label className="text-zinc-600">
              max_rounds
              <input type="text" inputMode="numeric" className="mt-0.5 block w-full rounded border border-zinc-300 bg-white p-1.5 font-mono text-xs" value={maxRounds} disabled={disabled} onChange={(e) => setMaxRounds(e.target.value)} />
            </label>
            <label className="text-zinc-600">
              max_workers_concurrent
              <input type="text" inputMode="numeric" className="mt-0.5 block w-full rounded border border-zinc-300 bg-white p-1.5 font-mono text-xs" value={maxWorkersConcurrent} disabled={disabled} onChange={(e) => setMaxWorkersConcurrent(e.target.value)} />
            </label>
            <label className="text-zinc-600">
              worker_stagger_ms
              <input type="text" inputMode="numeric" className="mt-0.5 block w-full rounded border border-zinc-300 bg-white p-1.5 font-mono text-xs" value={workerStaggerMs} disabled={disabled} onChange={(e) => setWorkerStaggerMs(e.target.value)} />
            </label>
            <label className="text-zinc-600">
              max_worker_steps
              <input type="text" inputMode="numeric" className="mt-0.5 block w-full rounded border border-zinc-300 bg-white p-1.5 font-mono text-xs" value={maxWorkerSteps} disabled={disabled} onChange={(e) => setMaxWorkerSteps(e.target.value)} />
            </label>
            <label className="text-zinc-600">
              max_tasks_per_round
              <input type="text" inputMode="numeric" className="mt-0.5 block w-full rounded border border-zinc-300 bg-white p-1.5 font-mono text-xs" value={maxTasksPerRound} disabled={disabled} onChange={(e) => setMaxTasksPerRound(e.target.value)} />
            </label>
            <label className="text-zinc-600">
              orchestrator_temp
              <input type="text" inputMode="decimal" className="mt-0.5 block w-full rounded border border-zinc-300 bg-white p-1.5 font-mono text-xs" value={orchestratorTemp} disabled={disabled} onChange={(e) => setOrchestratorTemp(e.target.value)} />
            </label>
            <label className="text-zinc-600">
              worker_temp
              <input type="text" inputMode="decimal" className="mt-0.5 block w-full rounded border border-zinc-300 bg-white p-1.5 font-mono text-xs" value={workerTemp} disabled={disabled} onChange={(e) => setWorkerTemp(e.target.value)} />
            </label>
            <label className="text-zinc-600">
              deliver_max_tokens
              <input type="text" inputMode="numeric" className="mt-0.5 block w-full rounded border border-zinc-300 bg-white p-1.5 font-mono text-xs" value={deliverMaxTokens} disabled={disabled} onChange={(e) => setDeliverMaxTokens(e.target.value)} />
            </label>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}

      <button
        type="button"
        className="w-full rounded-md border border-indigo-600 bg-indigo-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
        disabled={disabled || !objective.trim()}
        onClick={() => void run()}
      >
        {loading ? "Running pipeline…" : "Run Full Pipeline"}
      </button>

      {result && (
        <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-zinc-800">Result</span>
            <CopyOutputButton text={JSON.stringify(result, null, 2)} label="Copy full JSON" />
          </div>

          <div className="flex flex-wrap gap-3">
            <div>
              <span className="font-semibold text-zinc-600">stopped: </span>
              <span className="font-medium text-violet-700">{result.stopped}</span>
            </div>
            <div>
              <span className="font-semibold text-zinc-600">rounds: </span>
              <span className="font-mono">{result.rounds_completed}</span>
            </div>
            {result.preference_notification && (
              <div className="rounded border border-amber-200 bg-amber-50/50 px-2 py-1 text-amber-800">
                {result.preference_notification}
              </div>
            )}
          </div>

          <div>
            <div className="font-semibold text-zinc-600">Pipeline steps ({result.steps.length})</div>
            <ul className="mt-1 space-y-1">
              {result.steps.map((step, i) => (
                <li key={i}>
                  <details className="rounded border border-zinc-200 bg-white">
                    <summary className="cursor-pointer select-none px-2 py-1 font-mono text-[11px]">
                      {i + 1}. {stepLabel(step)}
                    </summary>
                    <pre className="max-h-48 overflow-auto border-t border-zinc-100 px-2 py-1 font-mono text-[10px]">
                      {JSON.stringify(step.result, null, 2)}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="font-semibold text-zinc-600">document (preview)</div>
            <pre className="mt-1 max-h-64 overflow-auto rounded bg-white p-2 font-mono text-[11px] whitespace-pre-wrap">
              {result.document_markdown.slice(0, 2000)}
              {result.document_markdown.length > 2000 ? "\n\n…(truncated)" : ""}
            </pre>
          </div>

          <div>
            <div className="font-semibold text-zinc-600">key_findings</div>
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-white p-2 font-mono text-[11px]">
              {JSON.stringify(result.key_findings, null, 2)}
            </pre>
          </div>

          <div>
            <div className="font-semibold text-zinc-600">known_gaps</div>
            {result.known_gaps.length === 0 ? (
              <p className="mt-1 text-zinc-500">(none)</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {result.known_gaps.map((g, i) => (
                  <li key={i}>
                    <span className="font-medium">{g.dimension ?? "General"}: </span>
                    {g.gaps.join(", ")}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex gap-2">
            <CopyOutputButton
              text={result.document_markdown}
              label="Copy document"
            />
            <CopyOutputButton
              text={JSON.stringify({ steps: result.steps }, null, 2)}
              label="Copy trace"
            />
          </div>
        </div>
      )}
    </section>
  );
}
