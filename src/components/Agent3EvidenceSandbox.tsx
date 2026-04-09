"use client";

import type { Agent3EvidencePlan } from "@/lib/types";

export type Agent3EvidenceSandboxProps = {
  hasAIAnswer: boolean;
  hasDecomposition: boolean;
  decompositionSource: "agent1" | "agent2_input" | "none";
  hasSearchQueries: boolean;
  onRun: () => void;
  loading: boolean;
  error: string | null;
  output: Agent3EvidencePlan | null;
};

/**
 * Agent 3 — only AIAnswer is required. Decomposition and SearchQueries add context for segments and search.
 */
export function Agent3EvidenceSandbox({
  hasAIAnswer,
  hasDecomposition,
  decompositionSource,
  hasSearchQueries,
  onRun,
  loading,
  error,
  output,
}: Agent3EvidenceSandboxProps) {
  const canRun = hasAIAnswer;

  return (
    <section aria-labelledby="agent3-heading" className="shrink-0 space-y-2 border-t border-zinc-200 pt-6">
      <h2 id="agent3-heading" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Agent 3 — Evidence plan
      </h2>
      <p className="text-xs text-zinc-500">
        Required: a successful <strong className="font-medium text-zinc-700">AIAnswer</strong> above. Optional:{" "}
        <strong className="font-medium text-zinc-700">decomposition</strong> (Agent 1 or Agent 2 JSON) and{" "}
        <strong className="font-medium text-zinc-700">SearchQueries</strong> (Agent 2) to broaden search queries. Then
        Parallel <code className="rounded bg-zinc-100 px-1">beta.search</code> per segment.
      </p>

      <ul className="list-inside list-disc text-xs text-zinc-600">
        <li className={hasAIAnswer ? "text-emerald-800" : ""}>
          AIAnswer{hasAIAnswer ? " — ready" : " — run AIAnswer above (required)"}
        </li>
        <li className={hasDecomposition ? "text-emerald-800" : "text-zinc-500"}>
          Decomposition (optional)
          {hasDecomposition
            ? decompositionSource === "agent1"
              ? " — from Agent 1"
              : " — from Agent 2 JSON input"
            : " — not loaded; segmentation uses answer text only"}
        </li>
        <li className={hasSearchQueries ? "text-emerald-800" : "text-zinc-500"}>
          SearchQueries (optional)
          {hasSearchQueries ? " — from Agent 2" : " — not loaded; search uses challenge + quote only"}
        </li>
      </ul>

      <button
        type="button"
        className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
        disabled={loading || !canRun}
        onClick={() => void onRun()}
      >
        {loading ? "Running Agent 3…" : "Run Agent 3"}
      </button>

      {error ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 whitespace-pre-wrap">
          {error}
        </p>
      ) : null}

      {output ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-600">Agent 3 output</p>
          <pre className="max-h-96 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
            {JSON.stringify(output, null, 2)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
