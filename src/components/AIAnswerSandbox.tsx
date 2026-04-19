"use client";

import { CopyOutputButton } from "@/components/CopyOutputButton";
import { SelectableAnswerWithProof } from "@/components/SelectableAnswerWithProof";
import type { AIAnswerOutput, QueryDecomposition } from "@/lib/types";

export type AIAnswerSandboxProps = {
  topic: string;
  onTopicChange: (value: string) => void;
  /** When set, passed to the API as decomposition context (Agent 1 output). */
  decomposition: QueryDecomposition | null;
  onUseAgent1CoreQuery: () => void;
  onRun: () => void;
  /** AIAnswer → Agent 3 → Agent 4 → Agent 5 in one run. */
  onRunFullVerification: () => void | Promise<void>;
  /** True while any sandbox pipeline step is in flight (blocks both run buttons). */
  pipelineBusy: boolean;
  loading: boolean;
  /** True for the full stacked run until Agent 5 finishes or any step errors. */
  fullVerificationRunning: boolean;
  error: string | null;
  output: AIAnswerOutput | null;
  canUseAgent1: boolean;
  /** Highlight a passage and run Agent 3 → 5 on that slice only. */
  onProofSelection?: (synthetic: AIAnswerOutput) => void;
  onProofSelectionInvalid?: (message: string) => void;
  proofVerificationRunning?: boolean;
  proofSelectionError?: string | null;
  /** When true, omit outer section border (e.g. nested under Archive). */
  embedded?: boolean;
};

/**
 * AIAnswer stage — direct answer + declared_sources (Agent 3 reads this from app state).
 */
export function AIAnswerSandbox({
  topic,
  onTopicChange,
  decomposition,
  onUseAgent1CoreQuery,
  onRun,
  onRunFullVerification,
  pipelineBusy,
  loading,
  fullVerificationRunning,
  error,
  output,
  canUseAgent1,
  onProofSelection,
  onProofSelectionInvalid,
  proofVerificationRunning = false,
  proofSelectionError,
  embedded = false,
}: AIAnswerSandboxProps) {
  return (
    <section
      aria-labelledby="ai-answer-heading"
      className={`shrink-0 space-y-2 ${embedded ? "" : "border-b border-zinc-200 pb-6"}`}
    >
      <h2 id="ai-answer-heading" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        AIAnswer (pipeline)
      </h2>
      <p className="text-xs text-zinc-500">
        Direct answer + <code className="rounded bg-zinc-100 px-1">declared_sources</code>. When Agent 1 has run, its
        decomposition is sent automatically for alignment. Agent 3 below uses this output together with Agent 2.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
          disabled={!canUseAgent1 || pipelineBusy}
          onClick={onUseAgent1CoreQuery}
          title={canUseAgent1 ? "Fill topic with decomposition.core_query" : "Run Agent 1 first"}
        >
          Use Agent 1 core query as topic
        </button>
      </div>

      {decomposition ? (
        <p className="text-xs text-emerald-700">
          Agent 1 decomposition will be included in the API request ({decomposition.support_angles.length} angles).
        </p>
      ) : (
        <p className="text-xs text-zinc-500">No Agent 1 decomposition in context yet (optional).</p>
      )}

      <label className="block text-xs font-medium text-zinc-600" htmlFor="ai-answer-topic">
        Topic / user question
      </label>
      <textarea
        id="ai-answer-topic"
        className="min-h-[88px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-zinc-500"
        placeholder="Question or topic for the direct answer…"
        value={topic}
        disabled={pipelineBusy}
        onChange={(e) => onTopicChange(e.target.value)}
      />

      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="flex-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          disabled={pipelineBusy || !topic.trim()}
          onClick={() => void onRun()}
        >
          {loading ? "Generating…" : "Run AIAnswer"}
        </button>
        <button
          type="button"
          className="flex-1 rounded-md border border-zinc-900 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
          disabled={pipelineBusy || !topic.trim()}
          onClick={() => void onRunFullVerification()}
        >
          {fullVerificationRunning ? "Running verification…" : "Run AIAnswer & Verification"}
        </button>
      </div>
      <p className="text-xs text-zinc-500">
        <strong>Verification</strong> runs Agent 3 (search), Agent 4 (extract), and Agent 5 (crops) using the
        optional decomposition / Agent 2 search queries already in sandbox state.
      </p>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 whitespace-pre-wrap">
          {error}
        </p>
      ) : null}

      {proofSelectionError ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {proofSelectionError}
        </p>
      ) : null}

      {output && onProofSelection ? (
        <p className="text-[11px] text-zinc-500">
          Highlight text in the preview, then tap <span className="font-semibold">Proof</span> to run Agent 3 → 5 on
          that passage only.
        </p>
      ) : null}

      {output ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-zinc-600">Answer (preview)</p>
            <CopyOutputButton text={output.answer_text} label="Copy answer" disabled={pipelineBusy} />
          </div>
          {onProofSelection ? (
            <SelectableAnswerWithProof
              fullAnswer={output}
              className="max-h-48 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50/80 p-3"
              textClassName="text-sm text-zinc-900 whitespace-pre-wrap select-text"
              disabled={pipelineBusy}
              proofBusy={proofVerificationRunning}
              onProof={onProofSelection}
              onProofInvalid={onProofSelectionInvalid}
            />
          ) : (
            <div className="max-h-48 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 text-sm text-zinc-900 whitespace-pre-wrap">
              {output.answer_text}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-zinc-600">Full JSON</p>
            <CopyOutputButton
              text={JSON.stringify(output, null, 2)}
              label="Copy"
              disabled={pipelineBusy}
            />
          </div>
          <pre className="max-h-64 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
            {JSON.stringify(output, null, 2)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
