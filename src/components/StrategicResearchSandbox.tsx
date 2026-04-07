"use client";

import type { QueryDecomposition, SearchQueries } from "@/lib/types";

export type StrategicResearchSandboxProps = {
  agent1Decomposition: QueryDecomposition | null;
  agent2InputJson: string;
  onAgent2InputJsonChange: (value: string) => void;
  yearRange: string;
  onYearRangeChange: (value: string) => void;
  onLoadFromAgent1: () => void;
  onRunResearch: () => void;
  loading: boolean;
  error: string | null;
  /** Parsed search queries after a successful run; shown as formatted JSON. */
  output: SearchQueries | null;
};

/**
 * Sandbox section for Agent 2 — Strategic Research.
 * Input is a `QueryDecomposition` JSON blob (typically loaded from Agent 1 output).
 */
export function StrategicResearchSandbox({
  agent1Decomposition,
  agent2InputJson,
  onAgent2InputJsonChange,
  yearRange,
  onYearRangeChange,
  onLoadFromAgent1,
  onRunResearch,
  loading,
  error,
  output,
}: StrategicResearchSandboxProps) {
  const canLoadFromAgent1 = agent1Decomposition !== null;

  return (
    <section aria-labelledby="agent2-heading" className="shrink-0 space-y-2 border-t border-zinc-200 pt-6">
      <h2 id="agent2-heading" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Strategic research (Agent 2)
      </h2>
      <p className="text-xs text-zinc-500">
        Paste or load a <code className="rounded bg-zinc-100 px-1">QueryDecomposition</code> JSON. Optional year
        range is forwarded to the API. Output appears after Agent 2 is implemented in task 5.2.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
          disabled={!canLoadFromAgent1 || loading}
          onClick={onLoadFromAgent1}
          title={
            canLoadFromAgent1
              ? "Copy current Agent 1 result into the textarea below"
              : "Run Agent 1 and get a decomposition first"
          }
        >
          Load Agent 1 output into Agent 2
        </button>
      </div>

      <label className="block text-xs font-medium text-zinc-600" htmlFor="agent2-json">
        Agent 2 input (JSON)
      </label>
      <textarea
        id="agent2-json"
        className="min-h-[140px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500"
        placeholder='{"core_query":"...","keywords":[],"support_angles":[]}'
        value={agent2InputJson}
        disabled={loading}
        onChange={(e) => onAgent2InputJsonChange(e.target.value)}
        spellCheck={false}
      />

      <label className="block text-xs font-medium text-zinc-600" htmlFor="year-range">
        Year range (optional)
      </label>
      <input
        id="year-range"
        type="text"
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
        placeholder="e.g. 2018–2024"
        value={yearRange}
        disabled={loading}
        onChange={(e) => onYearRangeChange(e.target.value)}
      />

      <button
        type="button"
        className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
        disabled={loading || !agent2InputJson.trim()}
        onClick={() => void onRunResearch()}
      >
        {loading ? "Running…" : "Run Agent 2"}
      </button>

      {error ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 whitespace-pre-wrap">
          {error}
        </p>
      ) : null}

      {output ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-600">Agent 2 output</p>
          <pre className="max-h-80 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
            {JSON.stringify(output, null, 2)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
