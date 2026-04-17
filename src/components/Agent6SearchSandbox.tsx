"use client";

import { CopyOutputButton } from "@/components/CopyOutputButton";
import type { Agent3EvidencePlan, Agent3ResourceRow } from "@/lib/types";

export type Agent6SearchSandboxProps = {
  hasSegments: boolean;
  segmentCount: number;
  hasSearchQueries: boolean;
  onRun: () => void;
  loading: boolean;
  error: string | null;
  /** Composed plan preview after search (segments + resources). */
  composedPlan: Agent3EvidencePlan | null;
  resourcesOnly: Agent3ResourceRow[] | null;
};

/**
 * Agent 6 — **`beta.search`** per segment (**`/api/agent6-search`**). Requires **`evidence_segments`** from Agent 3.
 */
export function Agent6SearchSandbox({
  hasSegments,
  segmentCount,
  hasSearchQueries,
  onRun,
  loading,
  error,
  composedPlan,
  resourcesOnly,
}: Agent6SearchSandboxProps) {
  return (
    <section aria-labelledby="agent6-heading" className="shrink-0 space-y-2 border-t border-zinc-200 pt-6">
      <h2 id="agent6-heading" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Agent 6 — Parallel search
      </h2>
      <p className="text-xs text-zinc-500">
        Runs Parallel <code className="rounded bg-zinc-100 px-1">beta.search</code> for each segment from Agent 3. Optional{" "}
        <strong className="font-medium text-zinc-700">SearchQueries</strong> (Agent 2) add extra query strings when
        decomposition is present.
      </p>

      <ul className="list-inside list-disc text-xs text-zinc-600">
        <li className={hasSegments ? "text-emerald-800" : "text-zinc-500"}>
          Segments{hasSegments ? ` — ${segmentCount} loaded (run Agent 3 first if empty)` : " — run Agent 3 first"}
        </li>
        <li className={hasSearchQueries ? "text-emerald-800" : "text-zinc-500"}>
          SearchQueries (optional)
          {hasSearchQueries ? " — from Agent 2" : " — not loaded; search uses challenge + quote only"}
        </li>
      </ul>

      <button
        type="button"
        className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
        disabled={loading || !hasSegments}
        onClick={() => void onRun()}
      >
        {loading ? "Running Agent 6…" : "Run Agent 6 (search)"}
      </button>

      {error ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 whitespace-pre-wrap">
          {error}
        </p>
      ) : null}

      {resourcesOnly && resourcesOnly.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-600">Resources ({resourcesOnly.length})</p>
          <pre className="max-h-48 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
            {JSON.stringify({ resources: resourcesOnly }, null, 2)}
          </pre>
        </div>
      ) : null}

      {composedPlan ? (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-zinc-600">Composed plan (Agent 4 / 5)</p>
            <CopyOutputButton text={JSON.stringify(composedPlan, null, 2)} label="Copy plan" disabled={loading} />
          </div>
          <pre className="max-h-96 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
            {JSON.stringify(composedPlan, null, 2)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
