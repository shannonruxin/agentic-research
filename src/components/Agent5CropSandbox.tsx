"use client";

import { CopyOutputButton } from "@/components/CopyOutputButton";
import type { CroppedEvidenceItem } from "@/lib/types";

export type Agent5CropSandboxProps = {
  hasInputs: boolean;
  onRun: () => void;
  loading: boolean;
  error: string | null;
  items: CroppedEvidenceItem[] | null;
};

/**
 * Agent 5 — substring-safe **`CroppedEvidenceItem[]`** with **`flow_index`** (separate UI from Agent 4).
 */
export function Agent5CropSandbox({
  hasInputs,
  onRun,
  loading,
  error,
  items,
}: Agent5CropSandboxProps) {
  return (
    <section aria-labelledby="agent5-heading" className="shrink-0 space-y-2 border-t border-zinc-200 pt-6">
      <h2 id="agent5-heading" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Agent 5 — Crop (flow order)
      </h2>
      <p className="text-xs text-zinc-500">
        Uses latest <strong className="font-medium text-zinc-700">AIAnswer</strong>,{" "}
        <strong className="font-medium text-zinc-700">Agent 3 plan</strong>, and{" "}
        <strong className="font-medium text-zinc-700">ExtractBundle</strong> from Agent 4. Runs Bedrock structured
        crop + substring validation — only crops present in page text are returned.
      </p>

      <button
        type="button"
        className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
        disabled={loading || !hasInputs}
        onClick={() => void onRun()}
      >
        {loading ? "Cropping…" : "Run Agent 5"}
      </button>

      {error ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 whitespace-pre-wrap">
          {error}
        </p>
      ) : null}

      {items && items.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-zinc-600">Cropped evidence (sorted by flow_index)</p>
            <CopyOutputButton
              text={JSON.stringify(items, null, 2)}
              label="Copy JSON"
              disabled={loading}
            />
          </div>
          <ol className="list-decimal space-y-3 pl-4 text-sm text-zinc-900">
            {items.map((it, idx) => (
              <li key={`${it.url}-${it.flow_index}-${idx}`} className="space-y-1">
                <p className="text-xs text-zinc-500">
                  flow_index={it.flow_index} ·{" "}
                  <a href={it.url} className="text-blue-700 underline" target="_blank" rel="noreferrer">
                    {it.url}
                  </a>
                </p>
                <blockquote className="border-l-2 border-zinc-300 pl-3 text-zinc-800 whitespace-pre-wrap">
                  {it.cropped_text}
                </blockquote>
                {it.location_hint ? (
                  <p className="text-xs text-zinc-500">{it.location_hint}</p>
                ) : null}
              </li>
            ))}
          </ol>
          <p className="text-xs font-medium text-zinc-600">JSON</p>
          <pre className="max-h-64 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
            {JSON.stringify(items, null, 2)}
          </pre>
        </div>
      ) : items ? (
        <p className="text-xs text-zinc-500">No valid crops (empty bundle or model omitted segments).</p>
      ) : null}
    </section>
  );
}
