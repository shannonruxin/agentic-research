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
    case "planner": return `Planner → ${step.result.tasks.length} tasks (${step.result.execution_strategy})`;
    case "worker": return `Worker: ${step.task_id} [conf ${(step.result.confidence).toFixed(2)}]`;
    case "synthesizer": return `Synthesizer (round 1) → continue: ${step.result.should_continue}`;
    case "dig_deeper_worker": return `Dig-deeper R${step.round}: ${step.task_id} [conf ${(step.result.confidence).toFixed(2)}]`;
    case "dig_deeper_synthesizer": return `Synthesizer (round ${step.round}) → continue: ${step.result.should_continue}`;
    case "preferences": return `Preferences → ${step.result.scope}: ${step.result.notification.slice(0, 60)}`;
  }
}

export function FullPipelineSandbox({ pipelineBusy = false, onBusyChange }: FullPipelineSandboxProps) {
  const [objective, setObjective] = useState("");
  const [subjectScope, setSubjectScope] = useState("");
  const [researchHygiene, setResearchHygiene] = useState("");
  const [maxRoundsText, setMaxRoundsText] = useState("3");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SuccessResult | null>(null);

  const disabled = pipelineBusy || loading;

  const setBusy = (b: boolean) => {
    setLoading(b);
    onBusyChange?.(b);
  };

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
    const mr = Number.parseInt(maxRoundsText.trim(), 10);
    if (!Number.isNaN(mr) && mr >= 1 && mr <= 5) body.max_rounds = mr;

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
        Full Parallel Pipeline
      </h2>
      <p className="text-xs text-zinc-500">
        End-to-end: Intent → Planner → Workers → Synthesizer (with dig-deeper loop up to{" "}
        <code className="rounded bg-zinc-100 px-1 text-[11px]">max_rounds</code>). Persists to{" "}
        <code className="rounded bg-zinc-100 px-1 text-[11px]">chat-memory.json</code> and{" "}
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

      <label className="block text-xs font-medium text-zinc-600">
        max_rounds (1–5, default 3)
        <input
          type="text"
          inputMode="numeric"
          className="ml-2 w-16 rounded border border-zinc-300 bg-white p-1.5 font-mono text-xs"
          value={maxRoundsText}
          disabled={disabled}
          onChange={(e) => setMaxRoundsText(e.target.value)}
        />
      </label>

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
