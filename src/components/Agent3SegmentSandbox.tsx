"use client";

import { CopyOutputButton } from "@/components/CopyOutputButton";
import type { EvidenceSegment } from "@/lib/types";

export type Agent3SegmentSandboxProps = {
  hasPipelineAIAnswer: boolean;
  customAnswerText: string;
  onCustomAnswerTextChange: (value: string) => void;
  onFillFromPipelineAIAnswer: () => void;
  canRun: boolean;
  hasDecomposition: boolean;
  decompositionSource: "agent1" | "agent2_input" | "none";
  onRun: () => void;
  loading: boolean;
  error: string | null;
  segments: EvidenceSegment[] | null;
};

/**
 * Agent 3 — segmentation only (**`/api/agent3-segments`**). Hand off **`evidence_segments`** to Agent 6 search.
 */
export function Agent3SegmentSandbox({
  hasPipelineAIAnswer,
  customAnswerText,
  onCustomAnswerTextChange,
  onFillFromPipelineAIAnswer,
  canRun,
  hasDecomposition,
  decompositionSource,
  onRun,
  loading,
  error,
  segments,
}: Agent3SegmentSandboxProps) {
  return (
    <section aria-labelledby="agent3-seg-heading" className="shrink-0 space-y-2 border-t border-zinc-200 pt-6">
      <h2 id="agent3-seg-heading" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Agent 3 — Evidence segments
      </h2>
      <p className="text-xs text-zinc-500">
        Partition the answer into checkable spans with **`verification_challenge`**. No web search here — use{" "}
        <strong className="font-medium text-zinc-700">Agent 6 — Parallel search</strong> next.
      </p>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs font-medium text-zinc-600" htmlFor="agent3-seg-custom-answer">
            Answer text
          </label>
          <button
            type="button"
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-40"
            disabled={!hasPipelineAIAnswer || loading}
            onClick={onFillFromPipelineAIAnswer}
            title={
              hasPipelineAIAnswer
                ? "Copy AIAnswer answer_text into the box (overwrites)"
                : "Run AIAnswer above first"
            }
          >
            Fill from pipeline AIAnswer
          </button>
        </div>
        <textarea
          id="agent3-seg-custom-answer"
          className="min-h-[120px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
          placeholder="Paste or type a passage to segment. Leave empty to use the full pipeline AIAnswer (including declared URLs). If this box has any text, segmentation uses it with an empty declared_sources list."
          value={customAnswerText}
          disabled={loading}
          onChange={(e) => onCustomAnswerTextChange(e.target.value)}
        />
      </div>

      <ul className="list-inside list-disc text-xs text-zinc-600">
        <li className={canRun ? "text-emerald-800" : ""}>
          Input{canRun ? " — ready" : " — add text above or run AIAnswer"}
        </li>
        <li className={hasDecomposition ? "text-emerald-800" : "text-zinc-500"}>
          Decomposition (optional)
          {hasDecomposition
            ? decompositionSource === "agent1"
              ? " — from Agent 1"
              : " — from Agent 2 JSON input"
            : " — not loaded; segmentation uses answer text only"}
        </li>
      </ul>

      <button
        type="button"
        className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
        disabled={loading || !canRun}
        onClick={() => void onRun()}
      >
        {loading ? "Running Agent 3…" : "Run Agent 3 (segments)"}
      </button>

      {error ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 whitespace-pre-wrap">
          {error}
        </p>
      ) : null}

      {segments && segments.length > 0 ? (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-zinc-600">
              {segments.length} segment{segments.length === 1 ? "" : "s"} — next: Agent 6
            </p>
            <CopyOutputButton text={JSON.stringify({ evidence_segments: segments }, null, 2)} label="Copy" disabled={loading} />
          </div>
          <pre className="max-h-96 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
            {JSON.stringify({ evidence_segments: segments }, null, 2)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
