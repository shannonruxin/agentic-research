"use client";

import { useState } from "react";
import { CopyOutputButton } from "@/components/CopyOutputButton";
import { PLANNER_CHEATSHEET } from "@/lib/sandbox2SpecCheatsheet";
import type { PlannerOutput } from "@/lib/types";

export type PlannerSandboxProps = {
  pipelineBusy?: boolean;
};

export function PlannerSandbox({ pipelineBusy = false }: PlannerSandboxProps) {
  const [objective, setObjective] = useState("");
  const [subjectScope, setSubjectScope] = useState("");
  const [researchHygiene, setResearchHygiene] = useState("");
  const [conversationContext, setConversationContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<PlannerOutput | null>(null);

  const disabled = pipelineBusy || loading;

  async function run() {
    const text = objective.trim();
    if (!text) return;
    setError(null);
    setLoading(true);
    try {
      const body: Record<string, unknown> = { objective: text };
      if (subjectScope.trim()) body.subject_scope = subjectScope.trim();
      if (conversationContext.trim()) body.conversation_context = conversationContext.trim();
      const hyTrim = researchHygiene.trim();
      if (hyTrim) {
        try { body.research_hygiene = JSON.parse(hyTrim); } catch {
          setError("research_hygiene is not valid JSON"); setLoading(false); return;
        }
      }

      const res = await fetch("/api/sandbox2-planner", {
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
      setOutput(data as PlannerOutput);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="shrink-0 space-y-2 border-b border-zinc-200 pb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Planner
      </h2>
      <p className="text-xs text-zinc-500">
        Decomposes a research objective into parallel tasks. Domain manual loaded from{" "}
        <code className="rounded bg-zinc-100 px-1 text-[11px]">workspace/domain-manuals/domain-manual.json</code>.
      </p>

      <div className="flex flex-wrap items-start justify-end gap-2 rounded-md border border-zinc-200 bg-zinc-50 text-xs text-zinc-700">
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer select-none px-3 py-2 font-medium text-zinc-600">
            Field definitions (spec cheatsheet)
          </summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-zinc-200 bg-white px-3 py-2 font-mono text-[11px] text-zinc-800">
            {PLANNER_CHEATSHEET}
          </pre>
        </details>
        <div className="shrink-0 p-1.5">
          <CopyOutputButton text={PLANNER_CHEATSHEET} label="Copy cheatsheet" className="!bg-zinc-800 hover:!bg-zinc-900" />
        </div>
      </div>

      <label className="block text-xs font-medium text-zinc-600">Objective</label>
      <textarea
        className="min-h-[96px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        placeholder="What should be researched?"
        value={objective}
        disabled={disabled}
        onChange={(e) => setObjective(e.target.value)}
      />

      <label className="block text-xs font-medium text-zinc-600">subject_scope (optional)</label>
      <textarea
        className="min-h-[56px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        placeholder='e.g. "Subject: humeo.com only. Out: Hume AI."'
        value={subjectScope}
        disabled={disabled}
        onChange={(e) => setSubjectScope(e.target.value)}
      />

      <label className="block text-xs font-medium text-zinc-600">research_hygiene (optional JSON)</label>
      <textarea
        className="min-h-[56px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        value={researchHygiene}
        disabled={disabled}
        onChange={(e) => setResearchHygiene(e.target.value)}
        spellCheck={false}
      />

      <label className="block text-xs font-medium text-zinc-600">conversation_context (optional)</label>
      <textarea
        className="min-h-[56px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        placeholder="Prior turn summary"
        value={conversationContext}
        disabled={disabled}
        onChange={(e) => setConversationContext(e.target.value)}
        spellCheck={false}
      />

      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}

      <button
        type="button"
        className="w-full rounded-md border border-zinc-400 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        disabled={disabled || !objective.trim()}
        onClick={() => void run()}
      >
        {loading ? "Planning…" : "Run Planner"}
      </button>

      {output && (
        <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-zinc-800">Output</span>
            <CopyOutputButton text={JSON.stringify(output, null, 2)} label="Copy JSON" />
          </div>
          <div>
            <div className="font-semibold text-zinc-600">objective_understanding</div>
            <p className="mt-1 whitespace-pre-wrap">{output.objective_understanding}</p>
          </div>
          <div>
            <div className="font-semibold text-zinc-600">
              execution_strategy: <span className="font-mono text-violet-700">{output.execution_strategy}</span>
              {output.profile_task_id ? ` (profile: ${output.profile_task_id})` : ""}
            </div>
          </div>
          <div>
            <div className="font-semibold text-zinc-600">dimensions ({output.dimensions.length})</div>
            <ul className="mt-1 list-disc pl-4">
              {output.dimensions.map((d, i) => (
                <li key={i}>
                  <span className="font-medium">{d.label}</span>
                  {d.description ? ` — ${d.description}` : ""}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-semibold text-zinc-600">tasks ({output.tasks.length})</div>
            <ul className="mt-1 space-y-2">
              {output.tasks.map((t, i) => (
                <li key={i} className="rounded border border-zinc-200 bg-white p-2">
                  <div className="font-mono text-[11px] font-semibold text-zinc-700">
                    {t.task_id} — {t.dimension} / {t.factor}
                    <span className="ml-2 text-zinc-400">[{t.priority}]</span>
                  </div>
                  <p className="mt-1 text-zinc-800">{t.goal}</p>
                  <p className="mt-1 text-zinc-500">
                    queries: {t.search_guidance.join(" | ")}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-semibold text-zinc-600">reasoning</div>
            <p className="mt-1 whitespace-pre-wrap">{output.reasoning}</p>
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
