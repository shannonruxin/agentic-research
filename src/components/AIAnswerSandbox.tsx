"use client";

import type { AIAnswerOutput, QueryDecomposition } from "@/lib/types";

export type AIAnswerSandboxProps = {
  topic: string;
  onTopicChange: (value: string) => void;
  /** When set, passed to the API as decomposition context (Agent 1 output). */
  decomposition: QueryDecomposition | null;
  onUseAgent1CoreQuery: () => void;
  onRun: () => void;
  loading: boolean;
  error: string | null;
  output: AIAnswerOutput | null;
  canUseAgent1: boolean;
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
  loading,
  error,
  output,
  canUseAgent1,
}: AIAnswerSandboxProps) {
  return (
    <section aria-labelledby="ai-answer-heading" className="shrink-0 space-y-2 border-b border-zinc-200 pb-6">
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
          disabled={!canUseAgent1 || loading}
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
        disabled={loading}
        onChange={(e) => onTopicChange(e.target.value)}
      />

      <button
        type="button"
        className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        disabled={loading || !topic.trim()}
        onClick={() => void onRun()}
      >
        {loading ? "Generating…" : "Run AIAnswer"}
      </button>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 whitespace-pre-wrap">
          {error}
        </p>
      ) : null}

      {output ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-600">Answer (preview)</p>
          <div className="max-h-48 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 text-sm text-zinc-900 whitespace-pre-wrap">
            {output.answer_text}
          </div>
          <p className="text-xs font-medium text-zinc-600">Full JSON</p>
          <pre className="max-h-64 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
            {JSON.stringify(output, null, 2)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
