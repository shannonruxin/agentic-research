"use client";

import type { ExtractBundle } from "@/lib/types";

export type Agent4ExtractSandboxProps = {
  hasInputs: boolean;
  onRun: () => void;
  loading: boolean;
  error: string | null;
  bundle: ExtractBundle | null;
};

/**
 * Agent 4 — Parallel **`beta.extract`** over AIAnswer + Agent 3 URLs → **`ExtractBundle`**.
 * Separate from **Agent5CropSandbox** (crop stage).
 */
export function Agent4ExtractSandbox({
  hasInputs,
  onRun,
  loading,
  error,
  bundle,
}: Agent4ExtractSandboxProps) {
  const urlCount = bundle ? Object.keys(bundle).length : 0;

  return (
    <section aria-labelledby="agent4-heading" className="shrink-0 space-y-2 border-t border-zinc-200 pt-6">
      <h2 id="agent4-heading" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Agent 4 — Parallel extract
      </h2>
      <p className="text-xs text-zinc-500">
        Builds <code className="rounded bg-zinc-100 px-1">ExtractBundle</code> from the latest{" "}
        <strong className="font-medium text-zinc-700">AIAnswer</strong> declared URLs ∪{" "}
        <strong className="font-medium text-zinc-700">Agent 3</strong> resource URLs (deduped). Uses Parallel{" "}
        <code className="rounded bg-zinc-100 px-1">beta.extract</code> in chunks.
      </p>

      <button
        type="button"
        className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
        disabled={loading || !hasInputs}
        onClick={() => void onRun()}
      >
        {loading ? "Extracting URLs…" : "Run Agent 4"}
      </button>

      {error ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 whitespace-pre-wrap">
          {error}
        </p>
      ) : null}

      {bundle && urlCount > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-600">
            ExtractBundle ({urlCount} URL{urlCount === 1 ? "" : "s"})
          </p>
          <pre className="max-h-96 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
            {JSON.stringify(bundle, null, 2)}
          </pre>
        </div>
      ) : bundle ? (
        <p className="text-xs text-zinc-500">No URLs to extract (empty union).</p>
      ) : null}
    </section>
  );
}
