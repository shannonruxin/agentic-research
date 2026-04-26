"use client";

import { useState } from "react";
import type { Agent7Dimension, Agent7KnownGapGroup } from "@/lib/types";

type ResearchChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; preference_notification?: string; duration?: string };

type ResearchApiOk = {
  document_markdown: string;
  key_findings: Record<string, unknown>;
  dimensions: Agent7Dimension[];
  known_gaps: Agent7KnownGapGroup[];
  preference_notification?: string;
  session_preferences?: { rule: string; source: string; added: string }[];
};

function tryParseJsonObject(raw: string, label: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const t = raw.trim();
  if (!t) return { ok: true, value: {} };
  try {
    const p = JSON.parse(t) as unknown;
    if (p !== null && typeof p === "object" && !Array.isArray(p)) {
      return { ok: true, value: p as Record<string, unknown> };
    }
  } catch {
    return { ok: false, error: `${label} is not valid JSON object` };
  }
  return { ok: false, error: `${label} must be a JSON object` };
}

function tryParseDimensions(raw: string): { ok: true; value: Agent7Dimension[] | undefined } | { ok: false; error: string } {
  const t = raw.trim();
  if (!t) return { ok: true, value: undefined };
  try {
    const p = JSON.parse(t) as unknown;
    if (!Array.isArray(p)) return { ok: false, error: "dimensions must be a JSON array" };
    return { ok: true, value: p as Agent7Dimension[] };
  } catch {
    return { ok: false, error: "dimensions is not valid JSON" };
  }
}

function tryParseKnownGaps(
  raw: string,
): { ok: true; value: Agent7KnownGapGroup[] | undefined } | { ok: false; error: string } {
  const t = raw.trim();
  if (!t) return { ok: true, value: undefined };
  try {
    const p = JSON.parse(t) as unknown;
    if (!Array.isArray(p)) return { ok: false, error: "known_gaps must be a JSON array" };
    return { ok: true, value: p as Agent7KnownGapGroup[] };
  } catch {
    return { ok: false, error: "known_gaps is not valid JSON" };
  }
}

export function ResearchChatView() {
  const [messages, setMessages] = useState<ResearchChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const [subjectScopeText, setSubjectScopeText] = useState("");
  const [researchHygieneText, setResearchHygieneText] = useState("");
  const [memoryText, setMemoryText] = useState("{}");
  const [knownGapsText, setKnownGapsText] = useState("");
  const [dimensionsText, setDimensionsText] = useState("");
  const [keyFindingsText, setKeyFindingsText] = useState("");

  const [keyFindingsSeed, setKeyFindingsSeed] = useState<Record<string, unknown> | undefined>(undefined);
  const [dimensionsSeed, setDimensionsSeed] = useState<Agent7Dimension[] | undefined>(undefined);
  const [knownGapsSeed, setKnownGapsSeed] = useState<Agent7KnownGapGroup[] | undefined>(undefined);

  const [sessionPreferences, setSessionPreferences] = useState<
    { rule: string; source: string; added: string }[]
  >([]);

  const [maxRounds, setMaxRounds] = useState("5");
  const [maxWorkersConcurrent, setMaxWorkersConcurrent] = useState("2");
  const [workerStaggerMs, setWorkerStaggerMs] = useState("2000");
  const [maxWorkerSteps, setMaxWorkerSteps] = useState("5");
  const [maxTasksPerRound, setMaxTasksPerRound] = useState("8");
  const [orchestratorTemp, setOrchestratorTemp] = useState("0.2");
  const [workerTemp, setWorkerTemp] = useState("0.2");
  const [deliverMaxTokens, setDeliverMaxTokens] = useState("16000");

  async function runSend() {
    const text = draft.trim();
    if (!text || loading) return;
    setError(null);

    const mem = tryParseJsonObject(memoryText, "memory");
    if (!mem.ok) { setError(mem.error); return; }
    const hy = tryParseJsonObject(researchHygieneText, "research_hygiene");
    if (!hy.ok) { setError(hy.error); return; }
    const kg = tryParseKnownGaps(knownGapsText);
    if (!kg.ok) { setError(kg.error); return; }
    const dim = tryParseDimensions(dimensionsText);
    if (!dim.ok) { setError(dim.error); return; }
    const kf = tryParseJsonObject(keyFindingsText, "key_findings");
    if (!kf.ok) { setError(kf.error); return; }

    const kfValue =
      Object.keys(kf.value).length > 0 ? kf.value : keyFindingsSeed && Object.keys(keyFindingsSeed).length ? keyFindingsSeed : undefined;
    const dVal = dim.value?.length ? dim.value : dimensionsSeed?.length ? dimensionsSeed : undefined;
    const gVal = kg.value?.length ? kg.value : knownGapsSeed?.length ? knownGapsSeed : undefined;

    setDraft("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);

    const body: Record<string, unknown> = { message: text };
    if (Object.keys(mem.value).length) body.memory = mem.value;
    const ss = subjectScopeText.trim();
    if (ss) body.subject_scope = ss;
    if (Object.keys(hy.value).length) body.research_hygiene = hy.value;
    if (gVal) body.known_gaps_seed = gVal;
    if (dVal) body.dimensions = dVal;
    if (kfValue && Object.keys(kfValue).length) body.key_findings = kfValue;
    if (sessionPreferences.length > 0) body.session_preferences = sessionPreferences;

    const pipelineCfg: Record<string, number> = {};
    const mrVal = Number.parseInt(maxRounds, 10);
    if (!Number.isNaN(mrVal) && mrVal >= 1 && mrVal <= 5) pipelineCfg.max_rounds = mrVal;
    const mwcVal = Number.parseInt(maxWorkersConcurrent, 10);
    if (!Number.isNaN(mwcVal) && mwcVal >= 1) pipelineCfg.max_workers_concurrent = mwcVal;
    const wsVal = Number.parseInt(workerStaggerMs, 10);
    if (!Number.isNaN(wsVal) && wsVal >= 0) pipelineCfg.worker_stagger_ms = wsVal;
    const mwsVal = Number.parseInt(maxWorkerSteps, 10);
    if (!Number.isNaN(mwsVal) && mwsVal >= 1) pipelineCfg.max_worker_steps = mwsVal;
    const mtrVal = Number.parseInt(maxTasksPerRound, 10);
    if (!Number.isNaN(mtrVal) && mtrVal >= 1) pipelineCfg.max_tasks_per_round = mtrVal;
    const otVal = Number.parseFloat(orchestratorTemp);
    if (!Number.isNaN(otVal)) pipelineCfg.orchestrator_temperature = otVal;
    const wtVal = Number.parseFloat(workerTemp);
    if (!Number.isNaN(wtVal)) pipelineCfg.worker_temperature = wtVal;
    const dmtVal = Number.parseInt(deliverMaxTokens, 10);
    if (!Number.isNaN(dmtVal) && dmtVal >= 4000) pipelineCfg.deliver_max_tokens = dmtVal;
    if (Object.keys(pipelineCfg).length > 0) body.pipeline_config = pipelineCfg;

    const t0 = performance.now();
    try {
      const res = await fetch("/api/research-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: unknown = await res.json().catch(() => ({}));
      const totalSec = Math.floor((performance.now() - t0) / 1000);
      const elapsed = `${Math.floor(totalSec / 60)}m${totalSec % 60}s`;
      if (!res.ok) {
        const err =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : "Request failed";
        setError(`${err} (${elapsed})`);
        setMessages((m) => m.slice(0, -1));
        return;
      }
      const ok = data as ResearchApiOk;
      setKeyFindingsSeed(ok.key_findings);
      setDimensionsSeed(ok.dimensions);
      setKnownGapsSeed(ok.known_gaps);
      setKeyFindingsText(JSON.stringify(ok.key_findings, null, 2));
      setDimensionsText(JSON.stringify(ok.dimensions, null, 2));
      setKnownGapsText(JSON.stringify(ok.known_gaps, null, 2));
      if (ok.session_preferences?.length) {
        setSessionPreferences(ok.session_preferences);
      }
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: ok.document_markdown,
          preference_notification: ok.preference_notification,
          duration: elapsed,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setMessages((m) => m.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  async function newChat() {
    setError(null);
    try {
      const res = await fetch("/api/research-clear-chat-memory", { method: "POST" });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => ({}));
        const err =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : "Could not clear chat memory";
        setError(err);
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear chat memory");
      return;
    }
    setMessages([]);
    setKeyFindingsSeed(undefined);
    setDimensionsSeed(undefined);
    setKnownGapsSeed(undefined);
    setKeyFindingsText("");
    setDimensionsText("");
    setKnownGapsText("");
    setSessionPreferences([]);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50">
      <div className="shrink-0 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <h1 className="text-sm font-semibold text-zinc-800">Research</h1>
        <p className="mt-1 text-xs text-zinc-500">
          Chat-driven research. Each response updates{" "}
          <code className="rounded bg-zinc-100 px-1">user-output.md</code> and{" "}
          <code className="rounded bg-zinc-100 px-1">chat-memory.json</code>.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
        {messages.length === 0 && !error ? (
          <p className="text-sm text-zinc-500">Set Config if needed, then type a question and Send.</p>
        ) : null}
        {messages.map((m, i) => (
          <div key={i}>
            <div
              className={
                m.role === "user"
                  ? "ml-auto max-w-[min(100%,40rem)] rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 shadow-sm"
                  : "mr-auto max-w-[min(100%,48rem)] rounded-2xl border border-violet-200/80 bg-violet-50/50 px-4 py-2.5 text-sm text-zinc-900"
              }
            >
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.content}</p>
            </div>
            {m.role === "assistant" && m.duration ? (
              <p className="mr-auto mt-1 text-[11px] text-zinc-400">{m.duration}</p>
            ) : null}
            {m.role === "assistant" && m.preference_notification ? (
              <div className="mr-auto mt-1.5 max-w-[min(100%,48rem)] rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs text-amber-800">
                <span className="font-medium">Preference learned: </span>
                {m.preference_notification}
              </div>
            ) : null}
          </div>
        ))}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {loading ? <p className="text-xs text-zinc-500">Researching…</p> : null}
      </div>

      {configOpen ? (
        <div className="shrink-0 max-h-[60vh] overflow-y-auto border-t border-zinc-200 bg-white px-4 py-3 sm:px-6">
          <div className="mx-auto max-w-3xl space-y-2 text-xs">
            <p className="font-semibold text-zinc-800">Config</p>
            <p className="text-zinc-600">
              Domain context is read from{" "}
              <code className="rounded bg-zinc-100 px-0.5">workspace/domain-manuals/domain-manual.json</code>.
              User preferences are learned automatically and stored there too.
            </p>
            <label className="block text-zinc-600">
              subject_scope (optional — in-scope subject, out-of-scope, disambiguation cap)
            </label>
            <textarea
              className="h-20 w-full rounded border border-zinc-200 bg-zinc-50 p-2 text-sm"
              value={subjectScopeText}
              onChange={(e) => setSubjectScopeText(e.target.value)}
              placeholder='e.g. "Subject: humeo.com only. Out: Hume AI, Humeo Poland."'
            />
            <label className="block text-zinc-600">research_hygiene (JSON object, optional)</label>
            <textarea
              className="h-16 w-full rounded border border-zinc-200 bg-zinc-50 p-2 font-mono"
              value={researchHygieneText}
              onChange={(e) => setResearchHygieneText(e.target.value)}
            />
            <label className="block text-zinc-600">memory (JSON object, optional)</label>
            <textarea
              className="h-16 w-full rounded border border-zinc-200 bg-zinc-50 p-2 font-mono"
              value={memoryText}
              onChange={(e) => setMemoryText(e.target.value)}
            />
            <label className="block text-zinc-600">key_findings (auto-updated; optional override)</label>
            <textarea
              className="h-20 w-full rounded border border-zinc-200 bg-zinc-50 p-2 font-mono"
              value={keyFindingsText}
              onChange={(e) => setKeyFindingsText(e.target.value)}
            />
            <label className="block text-zinc-600">dimensions (JSON array, optional)</label>
            <textarea
              className="h-16 w-full rounded border border-zinc-200 bg-zinc-50 p-2 font-mono"
              value={dimensionsText}
              onChange={(e) => setDimensionsText(e.target.value)}
            />
            <label className="block text-zinc-600">known_gaps_seed (JSON array, optional)</label>
            <textarea
              className="h-16 w-full rounded border border-zinc-200 bg-zinc-50 p-2 font-mono"
              value={knownGapsText}
              onChange={(e) => setKnownGapsText(e.target.value)}
            />
            <p className="font-semibold text-zinc-800">Pipeline Config</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
              <label className="text-zinc-600">
                max_rounds
                <input type="text" inputMode="numeric" className="mt-0.5 block w-full rounded border border-zinc-200 bg-zinc-50 p-1.5 font-mono" value={maxRounds} onChange={(e) => setMaxRounds(e.target.value)} />
              </label>
              <label className="text-zinc-600">
                max_workers
                <input type="text" inputMode="numeric" className="mt-0.5 block w-full rounded border border-zinc-200 bg-zinc-50 p-1.5 font-mono" value={maxWorkersConcurrent} onChange={(e) => setMaxWorkersConcurrent(e.target.value)} />
              </label>
              <label className="text-zinc-600">
                stagger_ms
                <input type="text" inputMode="numeric" className="mt-0.5 block w-full rounded border border-zinc-200 bg-zinc-50 p-1.5 font-mono" value={workerStaggerMs} onChange={(e) => setWorkerStaggerMs(e.target.value)} />
              </label>
              <label className="text-zinc-600">
                worker_steps
                <input type="text" inputMode="numeric" className="mt-0.5 block w-full rounded border border-zinc-200 bg-zinc-50 p-1.5 font-mono" value={maxWorkerSteps} onChange={(e) => setMaxWorkerSteps(e.target.value)} />
              </label>
              <label className="text-zinc-600">
                tasks/round
                <input type="text" inputMode="numeric" className="mt-0.5 block w-full rounded border border-zinc-200 bg-zinc-50 p-1.5 font-mono" value={maxTasksPerRound} onChange={(e) => setMaxTasksPerRound(e.target.value)} />
              </label>
              <label className="text-zinc-600">
                orch_temp
                <input type="text" inputMode="decimal" className="mt-0.5 block w-full rounded border border-zinc-200 bg-zinc-50 p-1.5 font-mono" value={orchestratorTemp} onChange={(e) => setOrchestratorTemp(e.target.value)} />
              </label>
              <label className="text-zinc-600">
                worker_temp
                <input type="text" inputMode="decimal" className="mt-0.5 block w-full rounded border border-zinc-200 bg-zinc-50 p-1.5 font-mono" value={workerTemp} onChange={(e) => setWorkerTemp(e.target.value)} />
              </label>
              <label className="text-zinc-600">
                deliver_tokens
                <input type="text" inputMode="numeric" className="mt-0.5 block w-full rounded border border-zinc-200 bg-zinc-50 p-1.5 font-mono" value={deliverMaxTokens} onChange={(e) => setDeliverMaxTokens(e.target.value)} />
              </label>
            </div>
            {sessionPreferences.length > 0 ? (
              <div className="rounded border border-amber-200 bg-amber-50/50 p-2">
                <p className="font-medium text-amber-800">Session preferences (learned this chat):</p>
                {sessionPreferences.map((sp, i) => (
                  <p key={i} className="text-amber-700">• {sp.rule}</p>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className="text-xs text-violet-700 underline"
              onClick={() => setConfigOpen(false)}
            >
              Close config
            </button>
          </div>
        </div>
      ) : null}

      <div className="shrink-0 border-t border-zinc-200 bg-zinc-100 px-3 py-3 sm:px-4">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-end gap-2">
            <textarea
              className="min-h-[44px] flex-1 resize-y rounded-2xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              rows={1}
              placeholder="Message…"
              value={draft}
              disabled={loading}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void runSend();
                }
              }}
            />
            <div className="flex shrink-0 gap-2 self-end">
              <button
                type="button"
                className="rounded-2xl border border-zinc-400 bg-white px-3 py-2 text-sm font-medium text-zinc-800"
                onClick={() => setConfigOpen((o) => !o)}
              >
                Config
              </button>
              <button
                type="button"
                className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                disabled={loading || !draft.trim()}
                onClick={() => void runSend()}
              >
                {loading ? "…" : "Send"}
              </button>
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              className="text-xs text-zinc-500 underline"
              onClick={() => void newChat()}
            >
              New chat (clears <code className="rounded bg-zinc-200/80 px-0.5">chat-memory.json</code>)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
