"use client";

import { useState } from "react";
import { CopyOutputButton } from "@/components/CopyOutputButton";
import { ORCHESTRATOR_CHEATSHEET } from "@/lib/sandbox2SpecCheatsheet";

type Phase = "plan" | "review" | "deliver";

export type OrchestratorSandboxProps = {
  pipelineBusy?: boolean;
};

export function OrchestratorSandbox({ pipelineBusy = false }: OrchestratorSandboxProps) {
  const [phase, setPhase] = useState<Phase>("plan");
  const [objective, setObjective] = useState("");
  const [subjectScope, setSubjectScope] = useState("");
  const [conversationContext, setConversationContext] = useState("");
  const [planJson, setPlanJson] = useState("");
  const [workerResultsJson, setWorkerResultsJson] = useState("");
  const [priorReviewJson, setPriorReviewJson] = useState("");
  const [round, setRound] = useState("1");
  const [maxRounds, setMaxRounds] = useState("3");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<Record<string, unknown> | null>(null);

  const disabled = pipelineBusy || loading;

  async function run() {
    const text = objective.trim();
    if (!text) return;
    setError(null);
    setLoading(true);
    try {
      const body: Record<string, unknown> = { phase, objective: text };
      if (subjectScope.trim()) body.subject_scope = subjectScope.trim();
      if (conversationContext.trim()) body.conversation_context = conversationContext.trim();

      if (phase === "review" || phase === "deliver") {
        if (!planJson.trim()) {
          setError("Plan JSON is required for review/deliver phase");
          setLoading(false);
          return;
        }
        try { body.plan = JSON.parse(planJson.trim()); } catch {
          setError("Plan JSON is not valid"); setLoading(false); return;
        }
        if (!workerResultsJson.trim()) {
          setError("Worker results JSON is required for review/deliver phase");
          setLoading(false);
          return;
        }
        try { body.all_worker_results = JSON.parse(workerResultsJson.trim()); } catch {
          setError("Worker results JSON is not valid"); setLoading(false); return;
        }
      }

      if (phase === "review") {
        const r = Number.parseInt(round.trim(), 10);
        if (!Number.isNaN(r)) body.round = r;
        const mr = Number.parseInt(maxRounds.trim(), 10);
        if (!Number.isNaN(mr)) body.max_rounds = mr;
        if (priorReviewJson.trim()) {
          try { body.prior_review = JSON.parse(priorReviewJson.trim()); } catch {
            setError("Prior review JSON is not valid"); setLoading(false); return;
          }
        }
      }

      if (phase === "deliver") {
        if (!priorReviewJson.trim()) {
          setError("Final review JSON is required for deliver phase");
          setLoading(false);
          return;
        }
        try { body.final_review = JSON.parse(priorReviewJson.trim()); } catch {
          setError("Final review JSON is not valid"); setLoading(false); return;
        }
        const rc = Number.parseInt(round.trim(), 10);
        if (!Number.isNaN(rc)) body.rounds_completed = rc;
      }

      const res = await fetch("/api/sandbox2-orchestrator", {
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
      setOutput(data as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="shrink-0 space-y-2 border-b border-zinc-200 pb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Orchestrator (Chief Research Analyst)
      </h2>
      <p className="text-xs text-zinc-500">
        Single-brain agent with 3 phases: Plan → Review → Deliver. Investment analyst persona.
      </p>

      <div className="flex flex-wrap items-start justify-end gap-2 rounded-md border border-zinc-200 bg-zinc-50 text-xs text-zinc-700">
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer select-none px-3 py-2 font-medium text-zinc-600">
            Field definitions (spec cheatsheet)
          </summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-zinc-200 bg-white px-3 py-2 font-mono text-[11px] text-zinc-800">
            {ORCHESTRATOR_CHEATSHEET}
          </pre>
        </details>
        <div className="shrink-0 p-1.5">
          <CopyOutputButton text={ORCHESTRATOR_CHEATSHEET} label="Copy cheatsheet" className="!bg-zinc-800 hover:!bg-zinc-900" />
        </div>
      </div>

      <div className="flex gap-2">
        {(["plan", "review", "deliver"] as Phase[]).map((p) => (
          <button
            key={p}
            type="button"
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
              phase === p
                ? "border-indigo-600 bg-indigo-700 text-white"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
            disabled={disabled}
            onClick={() => setPhase(p)}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      <label className="block text-xs font-medium text-zinc-600">Objective</label>
      <textarea
        className="min-h-[80px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        placeholder="What should be researched?"
        value={objective}
        disabled={disabled}
        onChange={(e) => setObjective(e.target.value)}
      />

      <label className="block text-xs font-medium text-zinc-600">subject_scope (optional)</label>
      <textarea
        className="min-h-[48px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        placeholder='e.g. "Subject: humeo.com only."'
        value={subjectScope}
        disabled={disabled}
        onChange={(e) => setSubjectScope(e.target.value)}
      />

      {phase === "plan" && (
        <>
          <label className="block text-xs font-medium text-zinc-600">conversation_context (optional)</label>
          <textarea
            className="min-h-[48px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
            placeholder="Prior turn summary"
            value={conversationContext}
            disabled={disabled}
            onChange={(e) => setConversationContext(e.target.value)}
          />
        </>
      )}

      {(phase === "review" || phase === "deliver") && (
        <>
          <label className="block text-xs font-medium text-zinc-600">
            plan (JSON — paste Orchestrator Plan output)
          </label>
          <textarea
            className="min-h-[80px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
            placeholder='{"objective_understanding":..., "tasks":[...]}'
            value={planJson}
            disabled={disabled}
            onChange={(e) => setPlanJson(e.target.value)}
          />

          <label className="block text-xs font-medium text-zinc-600">
            all_worker_results (JSON array)
          </label>
          <textarea
            className="min-h-[80px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
            placeholder='[{"task_id":"...", "summary":"...", ...}]'
            value={workerResultsJson}
            disabled={disabled}
            onChange={(e) => setWorkerResultsJson(e.target.value)}
          />
        </>
      )}

      {phase === "review" && (
        <>
          <div className="flex gap-4">
            <label className="text-xs font-medium text-zinc-600">
              round
              <input
                type="text"
                inputMode="numeric"
                className="ml-2 w-16 rounded border border-zinc-300 bg-white p-1.5 font-mono text-xs"
                value={round}
                disabled={disabled}
                onChange={(e) => setRound(e.target.value)}
              />
            </label>
            <label className="text-xs font-medium text-zinc-600">
              max_rounds
              <input
                type="text"
                inputMode="numeric"
                className="ml-2 w-16 rounded border border-zinc-300 bg-white p-1.5 font-mono text-xs"
                value={maxRounds}
                disabled={disabled}
                onChange={(e) => setMaxRounds(e.target.value)}
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-zinc-600">
            prior_review (optional JSON — from previous review round)
          </label>
          <textarea
            className="min-h-[64px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
            value={priorReviewJson}
            disabled={disabled}
            onChange={(e) => setPriorReviewJson(e.target.value)}
          />
        </>
      )}

      {phase === "deliver" && (
        <>
          <label className="block text-xs font-medium text-zinc-600">
            final_review (JSON — paste Review output)
          </label>
          <textarea
            className="min-h-[64px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
            value={priorReviewJson}
            disabled={disabled}
            onChange={(e) => setPriorReviewJson(e.target.value)}
          />
          <label className="text-xs font-medium text-zinc-600">
            rounds_completed
            <input
              type="text"
              inputMode="numeric"
              className="ml-2 w-16 rounded border border-zinc-300 bg-white p-1.5 font-mono text-xs"
              value={round}
              disabled={disabled}
              onChange={(e) => setRound(e.target.value)}
            />
          </label>
        </>
      )}

      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}

      <button
        type="button"
        className="w-full rounded-md border border-zinc-400 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        disabled={disabled || !objective.trim()}
        onClick={() => void run()}
      >
        {loading ? `Running ${phase}…` : `Run Orchestrator (${phase})`}
      </button>

      {output && (
        <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-zinc-800">Output ({phase})</span>
            <CopyOutputButton text={JSON.stringify(output, null, 2)} label="Copy JSON" />
          </div>
          <pre className="max-h-96 overflow-auto rounded bg-white p-2 font-mono text-[11px] whitespace-pre-wrap">
            {JSON.stringify(output, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}
