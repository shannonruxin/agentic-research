"use client";

import { useState } from "react";
import { CopyOutputButton } from "@/components/CopyOutputButton";
import { SYNTHESIZER_CHEATSHEET } from "@/lib/sandbox2SpecCheatsheet";
import type { SynthesizerOutput } from "@/lib/types";

export type SynthesizerSandboxProps = {
  pipelineBusy?: boolean;
};

export function SynthesizerSandbox({ pipelineBusy = false }: SynthesizerSandboxProps) {
  const [objective, setObjective] = useState("");
  const [subjectScope, setSubjectScope] = useState("");
  const [workerResultsText, setWorkerResultsText] = useState("");
  const [researchHygiene, setResearchHygiene] = useState("");
  const [userPrefs, setUserPrefs] = useState("");
  const [roundText, setRoundText] = useState("1");
  const [maxRoundsText, setMaxRoundsText] = useState("3");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<SynthesizerOutput | null>(null);

  const disabled = pipelineBusy || loading;

  async function run() {
    if (!objective.trim()) { setError("objective is required"); return; }
    setError(null);

    let workerResults: unknown;
    try {
      workerResults = JSON.parse(workerResultsText.trim());
      if (!Array.isArray(workerResults)) { setError("worker_results must be a JSON array"); return; }
    } catch {
      setError("worker_results is not valid JSON"); return;
    }

    const body: Record<string, unknown> = {
      objective: objective.trim(),
      worker_results: workerResults,
    };
    if (subjectScope.trim()) body.subject_scope = subjectScope.trim();
    if (userPrefs.trim()) body.user_preferences_summary = userPrefs.trim();
    const hyTrim = researchHygiene.trim();
    if (hyTrim) {
      try { body.research_hygiene = JSON.parse(hyTrim); } catch {
        setError("research_hygiene is not valid JSON"); return;
      }
    }
    const r = Number.parseInt(roundText.trim(), 10);
    if (!Number.isNaN(r) && r >= 1) body.round = r;
    const mr = Number.parseInt(maxRoundsText.trim(), 10);
    if (!Number.isNaN(mr) && mr >= 1) body.max_rounds = mr;

    setLoading(true);
    try {
      const res = await fetch("/api/sandbox2-synthesizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : "Request failed";
        setError(err);
        return;
      }
      setOutput(data as SynthesizerOutput);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="shrink-0 space-y-2 border-b border-zinc-200 pb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Synthesizer
      </h2>
      <p className="text-xs text-zinc-500">
        Merges worker results into a unified report. Assesses per-dimension coverage and can emit{" "}
        <strong className="font-medium text-zinc-700">dig_deeper</strong> follow-up tasks.
      </p>

      <div className="flex flex-wrap items-start justify-end gap-2 rounded-md border border-zinc-200 bg-zinc-50 text-xs text-zinc-700">
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer select-none px-3 py-2 font-medium text-zinc-600">
            Field definitions (spec cheatsheet)
          </summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-zinc-200 bg-white px-3 py-2 font-mono text-[11px] text-zinc-800">
            {SYNTHESIZER_CHEATSHEET}
          </pre>
        </details>
        <div className="shrink-0 p-1.5">
          <CopyOutputButton text={SYNTHESIZER_CHEATSHEET} label="Copy cheatsheet" className="!bg-zinc-800 hover:!bg-zinc-900" />
        </div>
      </div>

      <label className="block text-xs font-medium text-zinc-600">Objective</label>
      <textarea
        className="min-h-[72px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        value={objective}
        disabled={disabled}
        onChange={(e) => setObjective(e.target.value)}
      />

      <label className="block text-xs font-medium text-zinc-600">worker_results (JSON array of WorkerOutput)</label>
      <textarea
        className="min-h-[200px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        placeholder="Paste worker results JSON array here…"
        value={workerResultsText}
        disabled={disabled}
        onChange={(e) => setWorkerResultsText(e.target.value)}
        spellCheck={false}
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs font-medium text-zinc-600">
          round
          <input type="text" inputMode="numeric" className="mt-1 w-full rounded border border-zinc-300 bg-white p-1.5 font-mono text-xs"
            value={roundText} disabled={disabled} onChange={(e) => setRoundText(e.target.value)} />
        </label>
        <label className="block text-xs font-medium text-zinc-600">
          max_rounds
          <input type="text" inputMode="numeric" className="mt-1 w-full rounded border border-zinc-300 bg-white p-1.5 font-mono text-xs"
            value={maxRoundsText} disabled={disabled} onChange={(e) => setMaxRoundsText(e.target.value)} />
        </label>
      </div>

      <label className="block text-xs font-medium text-zinc-600">subject_scope (optional)</label>
      <textarea
        className="min-h-[48px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        value={subjectScope} disabled={disabled} onChange={(e) => setSubjectScope(e.target.value)}
      />

      <label className="block text-xs font-medium text-zinc-600">research_hygiene (optional JSON)</label>
      <textarea
        className="min-h-[48px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        value={researchHygiene} disabled={disabled} onChange={(e) => setResearchHygiene(e.target.value)} spellCheck={false}
      />

      <label className="block text-xs font-medium text-zinc-600">user_preferences_summary (optional)</label>
      <textarea
        className="min-h-[48px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        value={userPrefs} disabled={disabled} onChange={(e) => setUserPrefs(e.target.value)}
      />

      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}

      <button
        type="button"
        className="w-full rounded-md border border-zinc-400 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        disabled={disabled || !objective.trim() || !workerResultsText.trim()}
        onClick={() => void run()}
      >
        {loading ? "Synthesizing…" : "Run Synthesizer"}
      </button>

      {output && (
        <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-zinc-800">Output</span>
            <CopyOutputButton text={JSON.stringify(output, null, 2)} label="Copy JSON" />
          </div>

          <div>
            <div className="font-semibold text-zinc-600">should_continue: {" "}
              <span className={output.should_continue ? "text-amber-700" : "text-emerald-700"}>
                {String(output.should_continue)}
              </span>
            </div>
          </div>

          <div>
            <div className="font-semibold text-zinc-600">coverage_assessment</div>
            <div className="mt-1 overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead><tr className="border-b border-zinc-200">
                  <th className="py-1 pr-3 font-medium">Dimension</th>
                  <th className="py-1 pr-3 font-medium">Score</th>
                  <th className="py-1 font-medium">Reasoning</th>
                </tr></thead>
                <tbody>
                  {output.coverage_assessment.map((c, i) => (
                    <tr key={i} className="border-b border-zinc-100">
                      <td className="py-1 pr-3 font-medium">{c.dimension}</td>
                      <td className={`py-1 pr-3 font-mono ${c.score < 0.5 ? "text-red-600" : c.score < 0.7 ? "text-amber-600" : "text-emerald-600"}`}>
                        {c.score.toFixed(2)}
                      </td>
                      <td className="py-1 text-zinc-600">{c.reasoning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {output.dig_deeper.length > 0 && (
            <div>
              <div className="font-semibold text-amber-700">dig_deeper tasks ({output.dig_deeper.length})</div>
              <ul className="mt-1 space-y-1">
                {output.dig_deeper.map((t, i) => (
                  <li key={i} className="rounded border border-amber-200 bg-amber-50/50 p-2">
                    <div className="font-mono text-[11px] font-medium">{t.task_id} — {t.dimension} / {t.factor}</div>
                    <p className="mt-0.5 text-zinc-700">{t.goal}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="font-semibold text-zinc-600">user_facing_document (preview)</div>
            <pre className="mt-1 max-h-64 overflow-auto rounded bg-white p-2 font-mono text-[11px] whitespace-pre-wrap">
              {output.user_facing_document.slice(0, 2000)}
              {output.user_facing_document.length > 2000 ? "\n\n…(truncated)" : ""}
            </pre>
          </div>

          <div>
            <div className="font-semibold text-zinc-600">key_findings</div>
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-white p-2 font-mono text-[11px]">
              {JSON.stringify(output.key_findings, null, 2)}
            </pre>
          </div>

          <div>
            <div className="font-semibold text-zinc-600">known_gaps</div>
            {output.known_gaps.length === 0 ? (
              <p className="mt-1 text-zinc-500">(none)</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {output.known_gaps.map((g, i) => (
                  <li key={i}>
                    <span className="font-medium">{g.dimension ?? "General"}: </span>
                    {g.gaps.join(", ")}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
