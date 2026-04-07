"use client";

export type ParallelExtractSandboxProps = {
  url: string;
  onUrlChange: (value: string) => void;
  objective: string;
  onObjectiveChange: (value: string) => void;
  excerpts: boolean;
  onExcerptsChange: (value: boolean) => void;
  fullContent: boolean;
  onFullContentChange: (value: boolean) => void;
  onRun: () => void;
  loading: boolean;
  error: string | null;
  /** Raw API JSON string for display */
  resultJson: string | null;
};

/**
 * Smoke-test Parallel **Extract** (`parallel-web` / `POST /api/parallel-extract`) before Agent 3 / Agent 2 wiring.
 */
export function ParallelExtractSandbox({
  url,
  onUrlChange,
  objective,
  onObjectiveChange,
  excerpts,
  onExcerptsChange,
  fullContent,
  onFullContentChange,
  onRun,
  loading,
  error,
  resultJson,
}: ParallelExtractSandboxProps) {
  return (
    <section aria-labelledby="parallel-extract-heading" className="shrink-0 space-y-2 border-t border-zinc-200 pt-6">
      <h2 id="parallel-extract-heading" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Parallel extract (smoke test)
      </h2>
      <p className="text-xs text-zinc-500">
        Uses the official <code className="rounded bg-zinc-100 px-1">parallel-web</code> SDK. Set{" "}
        <code className="rounded bg-zinc-100 px-1">PARALLEL_API_KEY</code> in{" "}
        <code className="rounded bg-zinc-100 px-1">.env.local</code>. Calls{" "}
        <code className="rounded bg-zinc-100 px-1">POST /api/parallel-extract</code> (server holds the key).
      </p>

      <label className="block text-xs font-medium text-zinc-600" htmlFor="parallel-url">
        URL
      </label>
      <input
        id="parallel-url"
        type="url"
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
        placeholder="https://…"
        value={url}
        disabled={loading}
        onChange={(e) => onUrlChange(e.target.value)}
      />

      <label className="block text-xs font-medium text-zinc-600" htmlFor="parallel-objective">
        Objective (optional, focuses excerpts)
      </label>
      <input
        id="parallel-objective"
        type="text"
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
        placeholder="e.g. What is the main topic?"
        value={objective}
        disabled={loading}
        onChange={(e) => onObjectiveChange(e.target.value)}
      />

      <div className="flex flex-wrap gap-4 text-sm text-zinc-800">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={excerpts}
            disabled={loading}
            onChange={(e) => onExcerptsChange(e.target.checked)}
          />
          Excerpts
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={fullContent}
            disabled={loading}
            onChange={(e) => onFullContentChange(e.target.checked)}
          />
          Full content
        </label>
      </div>

      <button
        type="button"
        className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
        disabled={loading || !url.trim()}
        onClick={() => void onRun()}
      >
        {loading ? "Extracting…" : "Run Parallel extract"}
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
