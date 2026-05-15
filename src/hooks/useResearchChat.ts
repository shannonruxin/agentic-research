"use client";

import { useState } from "react";
import type { ParallelSourcePolicyRequest } from "@/lib/parallelSourcePolicy";
import type { Agent7Dimension, Agent7KnownGapGroup } from "@/lib/types";

export type ResearchChatMessage =
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

export type UseResearchChatOptions = {
  /** Sent as `sourcePolicy` on `/api/research-chat`; merged with env for Parallel search */
  sourcePolicy?: ParallelSourcePolicyRequest;
};

export function useResearchChat(options?: UseResearchChatOptions) {
  const sourcePolicy = options?.sourcePolicy;
  const [messages, setMessages] = useState<ResearchChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    if (!mem.ok) {
      setError(mem.error);
      return;
    }
    const hy = tryParseJsonObject(researchHygieneText, "research_hygiene");
    if (!hy.ok) {
      setError(hy.error);
      return;
    }
    const kg = tryParseKnownGaps(knownGapsText);
    if (!kg.ok) {
      setError(kg.error);
      return;
    }
    const dim = tryParseDimensions(dimensionsText);
    if (!dim.ok) {
      setError(dim.error);
      return;
    }
    const kf = tryParseJsonObject(keyFindingsText, "key_findings");
    if (!kf.ok) {
      setError(kf.error);
      return;
    }

    const kfValue =
      Object.keys(kf.value).length > 0
        ? kf.value
        : keyFindingsSeed && Object.keys(keyFindingsSeed).length
          ? keyFindingsSeed
          : undefined;
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
    if (sourcePolicy && Object.keys(sourcePolicy).length > 0) {
      body.sourcePolicy = sourcePolicy;
    }

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

  return {
    messages,
    draft,
    setDraft,
    loading,
    error,
    setError,
    subjectScopeText,
    setSubjectScopeText,
    researchHygieneText,
    setResearchHygieneText,
    memoryText,
    setMemoryText,
    knownGapsText,
    setKnownGapsText,
    dimensionsText,
    setDimensionsText,
    keyFindingsText,
    setKeyFindingsText,
    sessionPreferences,
    maxRounds,
    setMaxRounds,
    maxWorkersConcurrent,
    setMaxWorkersConcurrent,
    workerStaggerMs,
    setWorkerStaggerMs,
    maxWorkerSteps,
    setMaxWorkerSteps,
    maxTasksPerRound,
    setMaxTasksPerRound,
    orchestratorTemp,
    setOrchestratorTemp,
    workerTemp,
    setWorkerTemp,
    deliverMaxTokens,
    setDeliverMaxTokens,
    runSend,
    newChat,
  };
}

export type ResearchChatController = ReturnType<typeof useResearchChat>;
