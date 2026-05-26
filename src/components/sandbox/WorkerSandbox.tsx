"use client";

import { useState } from "react";
import { CopyOutputButton } from "@/components/sandbox/CopyOutputButton";
import { WORKER_CHEATSHEET } from "@/lib/sandbox/specCheatsheet";
import type { WorkerOutput } from "@/lib/types";

const SAMPLE_TASK = JSON.stringify(
  {
    task_id: "t1_company_profile",
    dimension: "Company Overview",
    factor: "Business Model",
    goal: "Characterize the company's business model, key products, target market, and competitive positioning.",
    search_guidance: [
      "site:crunchbase.com company_name",
      "company_name business model overview",
      "company_name products services",
    ],
    variables_to_find: ["revenue_model", "target_market", "founding_year", "employee_count"],
    extraction_focus: "business model classification and market positioning",
    priority: "high",
    follow_domain_manual: true,
  },
  null,
  2,
);

export type WorkerSandboxProps = {
  pipelineBusy?: boolean;
};

export function WorkerSandbox({ pipelineBusy = false }: WorkerSandboxProps) {
  const [taskText, setTaskText] = useState(SAMPLE_TASK);
  const [researchHygiene, setResearchHygiene] = useState("");
  const [userPrefs, setUserPrefs] = useState("");
  const [profileContext, setProfileContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<WorkerOutput | null>(null);

  const disabled = pipelineBusy || loading;

  async function run() {
    setError(null);
    let task: unknown;
    try {
      task = JSON.parse(taskText.trim());
    } catch {
      setError("task is not valid JSON");
      return;
    }

    const body: Record<string, unknown> = { task };
    const hyTrim = researchHygiene.trim();
    if (hyTrim) {
      try { body.research_hygiene = JSON.parse(hyTrim); } catch {
        setError("research_hygiene is not valid JSON"); return;
      }
    }
    if (userPrefs.trim()) body.user_preferences_summary = userPrefs.trim();
    if (profileContext.trim()) body.profile_context = profileContext.trim();

    setLoading(true);
    try {
      const res = await fetch("/api/sandbox/worker", {
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
      setOutput(data as WorkerOutput);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="shrink-0 space-y-2 border-b border-zinc-200 pb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Research Worker
      </h2>
      <p className="text-xs text-zinc-500">
        Executes a single research task with web search (Parallel API). Uses{" "}
        <code className="rounded bg-zinc-100 px-1 text-[11px]">generateText</code> with a webSearch tool, max 5 steps.
      </p>

      <div className="flex flex-wrap items-start justify-end gap-2 rounded-md border border-zinc-200 bg-zinc-50 text-xs text-zinc-700">
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer select-none px-3 py-2 font-medium text-zinc-600">
            Field definitions (spec cheatsheet)
          </summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-zinc-200 bg-white px-3 py-2 font-mono text-[11px] text-zinc-800">
            {WORKER_CHEATSHEET}
          </pre>
        </details>
        <div className="shrink-0 p-1.5">
          <CopyOutputButton text={WORKER_CHEATSHEET} label="Copy cheatsheet" className="!bg-zinc-800 hover:!bg-zinc-900" />
        </div>
      </div>

      <label className="block text-xs font-medium text-zinc-600">task (PlannerResearchTask JSON)</label>
      <textarea
        className="min-h-[160px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        value={taskText}
        disabled={disabled}
        onChange={(e) => setTaskText(e.target.value)}
        spellCheck={false}
      />

      <label className="block text-xs font-medium text-zinc-600">research_hygiene (optional JSON)</label>
      <textarea
        className="min-h-[48px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        value={researchHygiene}
        disabled={disabled}
        onChange={(e) => setResearchHygiene(e.target.value)}
        spellCheck={false}
      />

      <label className="block text-xs font-medium text-zinc-600">user_preferences_summary (optional)</label>
      <textarea
        className="min-h-[48px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        value={userPrefs}
        disabled={disabled}
        onChange={(e) => setUserPrefs(e.target.value)}
      />

      <label className="block text-xs font-medium text-zinc-600">profile_context (optional — from phase-1 worker)</label>
      <textarea
        className="min-h-[48px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        value={profileContext}
        disabled={disabled}
        onChange={(e) => setProfileContext(e.target.value)}
      />

      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}

      <button
        type="button"
        className="w-full rounded-md border border-zinc-400 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        disabled={disabled}
        onClick={() => void run()}
      >
        {loading ? "Researching…" : "Run Worker"}
      </button>

      {output && (
        <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-zinc-800">Output</span>
            <CopyOutputButton text={JSON.stringify(output, null, 2)} label="Copy JSON" />
          </div>
          <div>
            <span className="font-semibold text-zinc-600">task: </span>
            <span className="font-mono">{output.task_id}</span>
            <span className="ml-2 text-zinc-500">{output.dimension} / {output.factor}</span>
            <span className="ml-2 font-medium text-violet-700">confidence: {output.confidence.toFixed(2)}</span>
          </div>
          <div>
            <div className="font-semibold text-zinc-600">summary</div>
            <p className="mt-1 whitespace-pre-wrap">{output.summary}</p>
          </div>
          <div>
            <div className="font-semibold text-zinc-600">sources ({output.sources.length})</div>
            <ul className="mt-1 list-disc pl-4">
              {output.sources.map((s, i) => (
                <li key={i}>
                  <span className="font-mono text-[11px] text-blue-700">{s.url}</span>
                  {s.title ? ` — ${s.title}` : ""}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-semibold text-zinc-600">extracted_data ({output.extracted_data.length})</div>
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-white p-2 font-mono text-[11px]">
              {JSON.stringify(output.extracted_data, null, 2)}
            </pre>
          </div>
          {output.gaps_remaining.length > 0 && (
            <div>
              <div className="font-semibold text-zinc-600">gaps_remaining</div>
              <ul className="mt-1 list-disc pl-4">
                {output.gaps_remaining.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </div>
          )}
          {output.rabbithole_leads && output.rabbithole_leads.length > 0 && (
            <div>
              <div className="font-semibold text-amber-700">rabbithole_leads</div>
              <ul className="mt-1 list-disc pl-4 text-amber-800">
                {output.rabbithole_leads.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
          <div>
            <div className="font-semibold text-zinc-600">search_queries_used</div>
            <p className="mt-1 font-mono text-[11px] text-zinc-500">
              {output.search_queries_used.join(" | ")}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
