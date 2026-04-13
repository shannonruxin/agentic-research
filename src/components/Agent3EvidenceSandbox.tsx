"use client";

import type { Agent3EvidencePlan } from "@/lib/types";

export type Agent3EvidenceSandboxProps = {
  /** True when AIAnswer (or proof scope) exists — enables “Fill from pipeline”. */
  hasPipelineAIAnswer: boolean;
  customAnswerText: string;
  onCustomAnswerTextChange: (value: string) => void;
  onFillFromPipelineAIAnswer: () => void;
  canRunAgent3: boolean;
  hasDecomposition: boolean;
  decompositionSource: "agent1" | "agent2_input" | "none";
  hasSearchQueries: boolean;
  onRun: () => void;
  loading: boolean;
  error: string | null;
  output: Agent3EvidencePlan | null;
};

/**
 * Agent 3 — answer text from the textarea and/or pipeline AIAnswer. Decomposition and SearchQueries add search context.
 */
export function Agent3EvidenceSandbox({
  hasPipelineAIAnswer,
  customAnswerText,
  onCustomAnswerTextChange,
  onFillFromPipelineAIAnswer,
  canRunAgent3,
  hasDecomposition,
  decompositionSource,
  hasSearchQueries,
  onRun,
  loading,
  error,
  output,
}: Agent3EvidenceSandboxProps) {
  return (
    <section aria-labelledby="agent3-heading" className="shrink-0 space-y-2 border-t border-zinc-200 pt-6">
      <h2 id="agent3-heading" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Agent 3 — Evidence plan
      </h2>
      <p className="text-xs text-zinc-500">
        Provide <strong className="font-medium text-zinc-700">answer text</strong> below (any prose you want to
        segment and verify), or leave it empty and use the pipeline <strong className="font-medium text-zinc-700">AIAnswer</strong>{" "}
        from above. Optional: <strong className="font-medium text-zinc-700">decomposition</strong> (Agent 1 or Agent 2
        JSON) and <strong className="font-medium text-zinc-700">SearchQueries</strong> (Agent 2). Then Parallel{" "}
        <code className="rounded bg-zinc-100 px-1">beta.search</code> per segment.
      </p>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs font-medium text-zinc-600" htmlFor="agent3-custom-answer">
            Answer text for Agent 3
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
          id="agent3-custom-answer"
          className="min-h-[120px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
          placeholder="Paste or type a passage to segment. Leave empty to use the full pipeline AIAnswer (including declared URLs). If this box has any text, Agent 3 uses it with an empty declared_sources list."
          value={customAnswerText}
          disabled={loading}
          onChange={(e) => onCustomAnswerTextChange(e.target.value)}
        />
        <p className="text-[11px] text-zinc-500">
          <strong className="font-medium text-zinc-600">Fill from pipeline</strong> copies answer text only. Clear the
          box to run on the full AIAnswer object again (with sources).
        </p>
      </div>

      <ul className="list-inside list-disc text-xs text-zinc-600">
        <li className={canRunAgent3 ? "text-emerald-800" : ""}>
          Input{canRunAgent3 ? " — ready (custom text or pipeline AIAnswer)" : " — add text above or run AIAnswer"}
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
        disabled={loading || !canRunAgent3}
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
