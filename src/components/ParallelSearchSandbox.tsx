"use client";

export type ParallelSearchSandboxProps = {
  objective: string;
  onObjectiveChange: (value: string) => void;
  /** Raw textarea: one keyword query per line */
  queriesText: string;
  onQueriesTextChange: (value: string) => void;
  maxResults: string;
  onMaxResultsChange: (value: string) => void;
  mode: "" | "one-shot" | "agentic" | "fast";
  onModeChange: (value: "" | "one-shot" | "agentic" | "fast") => void;
  onRun: () => void;
  loading: boolean;
  error: string | null;
  resultJson: string | null;
};

/**
 * Smoke-test Parallel **Search** (`parallel-web` / `POST /api/parallel-search`) above the extract sandbox.
 */
export function ParallelSearchSandbox({
  objective,
  onObjectiveChange,
  queriesText,
  onQueriesTextChange,
  maxResults,
  onMaxResultsChange,
  mode,
  onModeChange,
  onRun,
  loading,
  error,
  resultJson,
}: ParallelSearchSandboxProps) {
  const hasObjective = objective.trim().length > 0;
  const hasQueries = queriesText
    .split(/\r?\n/)
    .some((line) => line.trim().length > 0);

  return (
    <section aria-labelledby="parallel-search-heading" className="shrink-0 space-y-2 border-t border-zinc-200 pt-6">
      <h2 id="parallel-search-heading" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Parallel search (smoke test)
      </h2>
      <p className="text-xs text-zinc-500">
        Web search via <code className="rounded bg-zinc-100 px-1">client.beta.search</code>. Same env as extract:{" "}
        <code className="rounded bg-zinc-100 px-1">PARALLEL_API_KEY</code> in{" "}
        <code className="rounded bg-zinc-100 px-1">.env.local</code>. Calls{" "}
        <code className="rounded bg-zinc-100 px-1">POST /api/parallel-search</code>.
      </p>

      <label className="block text-xs font-medium text-zinc-600" htmlFor="parallel-search-objective">
        Objective (natural language, optional if keyword queries are set)
      </label>
      <textarea
        id="parallel-search-objective"
        className="min-h-[72px] w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
        placeholder="What should the web search find?"
        value={objective}
        disabled={loading}
        onChange={(e) => onObjectiveChange(e.target.value)}
      />

      <label className="block text-xs font-medium text-zinc-600" htmlFor="parallel-search-queries">
        Keyword queries (one per line, optional if objective is set)
      </label>
      <textarea
        id="parallel-search-queries"
        className="min-h-[72px] w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
        placeholder={"United Nations founding year\nsite:un.org history"}
        value={queriesText}
        disabled={loading}
        onChange={(e) => onQueriesTextChange(e.target.value)}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label className="block text-xs font-medium text-zinc-600" htmlFor="parallel-search-max">
            Max results (optional, 1–50)
          </label>
          <input
            id="parallel-search-max"
            type="text"
            inputMode="numeric"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
            placeholder="default from API (e.g. 10)"
            value={maxResults}
            disabled={loading}
            onChange={(e) => onMaxResultsChange(e.target.value)}
          />
        </div>
        <div className="flex-1 space-y-1">
          <label className="block text-xs font-medium text-zinc-600" htmlFor="parallel-search-mode">
            Mode
          </label>
          <select
            id="parallel-search-mode"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
            value={mode}
            disabled={loading}
            onChange={(e) =>
              onModeChange(e.target.value as "" | "one-shot" | "agentic" | "fast")
            }
          >
            <option value="">Default</option>
            <option value="one-shot">one-shot</option>
            <option value="agentic">agentic</option>
            <option value="fast">fast</option>
          </select>
        </div>
      </div>

      <button
        type="button"
        className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
        disabled={loading || (!hasObjective && !hasQueries)}
        onClick={() => void onRun()}
      >
        {loading ? "Searching…" : "Run Parallel search"}
      </button>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 whitespace-pre-wrap">
          {error}
        </p>
      ) : null}

      {resultJson ? (
        <pre className="max-h-96 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
          {resultJson}
        </pre>
      ) : null}
    </section>
  );
}
