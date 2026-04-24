"use client";

import { useCallback, useState } from "react";
import { CopyOutputButton } from "@/components/CopyOutputButton";
import { AGENT7_SPEC_CHEATSHEET } from "@/lib/agent7SpecCheatsheet";
import type {
  Agent7Dimension,
  Agent7KnownGapGroup,
  Agent7OrchestrateResult,
} from "@/lib/types";

/**
 * Agent 7 — Orchestrator: objective + domain_manual (+ optional hygiene), iterative key_findings.
 */
type Agent73LoopSuccess = {
  success: true;
  stopped: "user_deliver" | "ask_user" | "max_iterations_forced";
  steps: unknown[];
  chat_memory_path: string;
  user_output_path: string;
};

export type Agent7SandboxProps = {
  /** User objective / query */
  goal: string;
  onGoalChange: (value: string) => void;
  pipelineBusy?: boolean;
  /** When the Agent 7↔3 orchestration loop runs, parent can block other sandboxes. */
  onLoopBusyChange?: (busy: boolean) => void;
};

function parseJsonObjectField(
  raw: string,
  fieldLabel: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: `${fieldLabel} is required (JSON object).` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: `${fieldLabel} is not valid JSON.` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: `${fieldLabel} must be a JSON object (not array or primitive).` };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

function parseOptionalJsonObject(
  raw: string,
  fieldLabel: string,
): { ok: true; value: Record<string, unknown> | undefined } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: undefined };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: `${fieldLabel} is not valid JSON.` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: `${fieldLabel} must be a JSON object when provided.` };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

function parseDimensionsSeed(
  raw: string,
): { ok: true; value: Agent7Dimension[] | undefined } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: undefined };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "dimensions seed is not valid JSON." };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "dimensions seed must be a JSON array." };
  }
  const out: Agent7Dimension[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: `dimensions[${i}] must be a JSON object with label.` };
    }
    const rec = item as Record<string, unknown>;
    const label = rec.label;
    if (typeof label !== "string" || !label.trim()) {
      return { ok: false, error: `dimensions[${i}] must have a non-empty string label.` };
    }
    const desc = rec.description;
    const dim: Agent7Dimension = { label: label.trim() };
    if (desc !== undefined) {
      if (typeof desc !== "string") {
        return { ok: false, error: `dimensions[${i}].description must be a string if present.` };
      }
      if (desc.trim()) {
        dim.description = desc.trim();
      }
    }
    out.push(dim);
  }
  return { ok: true, value: out };
}

function parseKnownGapsSeed(
  raw: string,
): { ok: true; value: Agent7KnownGapGroup[] | undefined } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: undefined };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "known_gaps seed is not valid JSON." };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "known_gaps seed must be a JSON array of { dimension?, gaps: string[] }." };
  }
  const out: Agent7KnownGapGroup[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: `known_gaps[${i}] must be an object.` };
    }
    const rec = item as Record<string, unknown>;
    const gapsRaw = rec.gaps;
    if (!Array.isArray(gapsRaw) || gapsRaw.length === 0) {
      return { ok: false, error: `known_gaps[${i}].gaps must be a non-empty string array.` };
    }
    const gaps: string[] = [];
    for (let j = 0; j < gapsRaw.length; j++) {
      const g = gapsRaw[j];
      if (typeof g !== "string" || !g.trim()) {
        return { ok: false, error: `known_gaps[${i}].gaps[${j}] must be a non-empty string.` };
      }
      gaps.push(g.trim());
    }
    const dim = rec.dimension;
    const group: Agent7KnownGapGroup = { gaps };
    if (dim !== undefined) {
      if (typeof dim !== "string") {
        return { ok: false, error: `known_gaps[${i}].dimension must be a string if present.` };
      }
      if (dim.trim()) {
        group.dimension = dim.trim();
      }
    }
    out.push(group);
  }
  return { ok: true, value: out };
}

export function Agent7Sandbox({ goal, onGoalChange, pipelineBusy = false, onLoopBusyChange }: Agent7SandboxProps) {
  const [domainManualText, setDomainManualText] = useState("{}");
  const [researchHygieneText, setResearchHygieneText] = useState("");
  const [memoryText, setMemoryText] = useState("{}");
  const [knownGapsSeedText, setKnownGapsSeedText] = useState("");
  const [dimensionsSeedText, setDimensionsSeedText] = useState("");
  const [keyFindingsSeedText, setKeyFindingsSeedText] = useState("");
  const [busy, setBusy] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Agent7OrchestrateResult | null>(null);

  const [loopMinConf, setLoopMinConf] = useState("0.75");
  const [loopMaxOuter, setLoopMaxOuter] = useState("5");
  const [loopMaxA36, setLoopMaxA36] = useState("3");
  const [subjectScopeText, setSubjectScopeText] = useState("");
  const [loopBusy, setLoopBusy] = useState(false);
  const [loopError, setLoopError] = useState<string | null>(null);
  const [lastLoopResult, setLastLoopResult] = useState<Agent73LoopSuccess | null>(null);

  const setLoop = (b: boolean) => {
    setLoopBusy(b);
    onLoopBusyChange?.(b);
  };

  const disabled = pipelineBusy || busy || loopBusy;

  const run = useCallback(async () => {
    setClientError(null);
    setServerError(null);

    const objective = goal.trim();
    if (!objective) {
      setClientError("Objective is required.");
      return;
    }

    const dm = parseJsonObjectField(domainManualText, "domain_manual");
    if (!dm.ok) {
      setClientError(dm.error);
      return;
    }

    const hy = parseOptionalJsonObject(researchHygieneText, "research_hygiene");
    if (!hy.ok) {
      setClientError(hy.error);
      return;
    }

    const mem = parseOptionalJsonObject(memoryText, "memory");
    if (!mem.ok) {
      setClientError(mem.error);
      return;
    }

    const kg = parseKnownGapsSeed(knownGapsSeedText);
    if (!kg.ok) {
      setClientError(kg.error);
      return;
    }

    let key_findings: Record<string, unknown> | undefined;
    const kfTrim = keyFindingsSeedText.trim();
    if (kfTrim) {
      const kf = parseJsonObjectField(keyFindingsSeedText, "key_findings");
      if (!kf.ok) {
        setClientError(kf.error);
        return;
      }
      key_findings = kf.value;
    }

    const dimParsed = parseDimensionsSeed(dimensionsSeedText);
    if (!dimParsed.ok) {
      setClientError(dimParsed.error);
      return;
    }
    const dimensions = dimParsed.value;

    setBusy(true);
    try {
      const res = await fetch("/api/agent7-orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective,
          ...(Object.keys(dm.value).length > 0 ? { domain_manual: dm.value } : {}),
          ...(hy.value !== undefined ? { research_hygiene: hy.value } : {}),
          ...(mem.value !== undefined && Object.keys(mem.value).length > 0 ? { memory: mem.value } : {}),
          ...(kg.value !== undefined && kg.value.length > 0 ? { known_gaps_seed: kg.value } : {}),
          ...(key_findings !== undefined ? { key_findings } : {}),
          ...(dimensions !== undefined && dimensions.length > 0 ? { dimensions } : {}),
        }),
      });
      const data = (await res.json()) as Agent7OrchestrateResult | { error?: string };
      if (!res.ok) {
        setServerError(typeof (data as { error?: string }).error === "string" ? (data as { error: string }).error : res.statusText);
        return;
      }
      const ok = data as Agent7OrchestrateResult;
      setLastResult(ok);
      setKeyFindingsSeedText(JSON.stringify(ok.key_findings, null, 2));
      setDimensionsSeedText(JSON.stringify(ok.dimensions, null, 2));
      setKnownGapsSeedText(JSON.stringify(ok.known_gaps, null, 2));
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }, [
    goal,
    domainManualText,
    researchHygieneText,
    memoryText,
    knownGapsSeedText,
    keyFindingsSeedText,
    dimensionsSeedText,
  ]);

  const runAgent73Loop = useCallback(async () => {
    setClientError(null);
    setServerError(null);
    setLoopError(null);
    setLastLoopResult(null);

    const objective = goal.trim();
    if (!objective) {
      setClientError("Objective is required for the 7↔3 loop.");
      return;
    }

    const mcRaw = loopMinConf.trim();
    const minC =
      mcRaw === ""
        ? undefined
        : (() => {
            const n = Number.parseFloat(mcRaw);
            if (Number.isNaN(n) || n < 0 || n > 1) {
              return NaN;
            }
            return n;
          })();
    if (minC !== undefined && Number.isNaN(minC)) {
      setClientError("min_confidence must be a number between 0 and 1, or leave empty.");
      return;
    }

    const maxOuterN = Number.parseInt(loopMaxOuter.trim(), 10);
    if (Number.isNaN(maxOuterN) || maxOuterN < 1 || maxOuterN > 50) {
      setClientError("max outer iterations must be an integer 1–50.");
      return;
    }

    const maxA36N = Number.parseInt(loopMaxA36.trim(), 10);
    if (Number.isNaN(maxA36N) || maxA36N < 1 || maxA36N > 20) {
      setClientError("max Agent 3↔6 iterations must be 1–20 per research task.");
      return;
    }

    const dm = parseJsonObjectField(domainManualText, "domain_manual");
    if (!dm.ok) {
      setClientError(dm.error);
      return;
    }
    const hy = parseOptionalJsonObject(researchHygieneText, "research_hygiene");
    if (!hy.ok) {
      setClientError(hy.error);
      return;
    }
    const mem = parseOptionalJsonObject(memoryText, "memory");
    if (!mem.ok) {
      setClientError(mem.error);
      return;
    }
    const kg = parseKnownGapsSeed(knownGapsSeedText);
    if (!kg.ok) {
      setClientError(kg.error);
      return;
    }
    const dimParsed = parseDimensionsSeed(dimensionsSeedText);
    if (!dimParsed.ok) {
      setClientError(dimParsed.error);
      return;
    }
    const dimensions = dimParsed.value;
    let key_findings: Record<string, unknown> | undefined;
    const kfTrim = keyFindingsSeedText.trim();
    if (kfTrim) {
      const kf = parseJsonObjectField(keyFindingsSeedText, "key_findings");
      if (!kf.ok) {
        setClientError(kf.error);
        return;
      }
      key_findings = kf.value;
    }

    setLoop(true);
    try {
      const res = await fetch("/api/agent7-3-orchestrate-loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective,
          ...(Object.keys(dm.value).length > 0 ? { domain_manual: dm.value } : {}),
          ...(subjectScopeText.trim() ? { subject_scope: subjectScopeText.trim() } : {}),
          ...(hy.value !== undefined ? { research_hygiene: hy.value } : {}),
          ...(mem.value !== undefined && Object.keys(mem.value).length > 0 ? { memory: mem.value } : {}),
          ...(kg.value !== undefined && kg.value.length > 0 ? { known_gaps_seed: kg.value } : {}),
          ...(key_findings !== undefined ? { key_findings } : {}),
          ...(dimensions !== undefined && dimensions.length > 0 ? { dimensions } : {}),
          max_outer_iterations: maxOuterN,
          max_iterations_3_6: maxA36N,
          ...(minC !== undefined ? { min_confidence: minC } : {}),
        }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : res.statusText;
        setLoopError(err);
        return;
      }
      const ok = data as Agent73LoopSuccess;
      setLastLoopResult(ok);
      for (let i = ok.steps.length - 1; i >= 0; i--) {
        const s = ok.steps[i];
        if (
          typeof s === "object" &&
          s !== null &&
          (s as { kind?: string }).kind === "agent7" &&
          "result" in s
        ) {
          const kf = (s as { result: { key_findings?: Record<string, unknown> } }).result.key_findings;
          if (kf && typeof kf === "object") {
            setKeyFindingsSeedText(JSON.stringify(kf, null, 2));
          }
          break;
        }
      }
    } catch (e) {
      setLoopError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoop(false);
    }
  }, [
    goal,
    domainManualText,
    researchHygieneText,
    memoryText,
    knownGapsSeedText,
    keyFindingsSeedText,
    dimensionsSeedText,
    loopMinConf,
    loopMaxOuter,
    loopMaxA36,
    subjectScopeText,
  ]);

  return (
    <section
      aria-labelledby="agent7-heading"
      className="shrink-0 space-y-2 border-b border-zinc-200 pb-6"
    >
      <h2 id="agent7-heading" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Agent 7 — Orchestrator
      </h2>
      <p className="text-xs text-zinc-500">
        Provide a JSON <strong className="font-medium text-zinc-700">domain_manual</strong> and your{" "}
        <strong className="font-medium text-zinc-700">objective</strong>. Agent 7 returns{" "}
        <strong className="font-medium text-zinc-700">dimensions</strong>,{" "}
        <strong className="font-medium text-zinc-700">key_findings</strong>, grouped{" "}
        <strong className="font-medium text-zinc-700">known_gaps</strong> (including first-turn missing info),{" "}
        <strong className="font-medium text-zinc-700">train_of_thought</strong>,{" "}
        <strong className="font-medium text-zinc-700">assignments</strong>, and{" "}
        <strong className="font-medium text-zinc-700">confidence</strong>. Seeds below refresh after a successful run
        for iteration.
      </p>

      <div className="flex flex-wrap items-start justify-end gap-2 rounded-md border border-zinc-200 bg-zinc-50 text-xs text-zinc-700">
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer select-none px-3 py-2 font-medium text-zinc-600">
            Field definitions (spec cheatsheet)
          </summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-zinc-200 bg-white px-3 py-2 font-mono text-[11px] text-zinc-800">
            {AGENT7_SPEC_CHEATSHEET}
          </pre>
        </details>
        <div className="shrink-0 p-1.5">
          <CopyOutputButton text={AGENT7_SPEC_CHEATSHEET} label="Copy cheatsheet" className="!bg-zinc-800 hover:!bg-zinc-900" />
        </div>
      </div>

      <label className="block text-xs font-medium text-zinc-600" htmlFor="agent7-domain">
        domain_manual (JSON) — <code className="text-[11px]">{"{}"}</code> or omit from request uses{" "}
        <code className="text-[11px]">workspace/domain_manual.json</code>
      </label>
      <textarea
        id="agent7-domain"
        className="min-h-[120px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        placeholder='{"sector": "...", "rules": [...]}'
        value={domainManualText}
        disabled={disabled}
        onChange={(e) => setDomainManualText(e.target.value)}
        spellCheck={false}
      />

      <label className="block text-xs font-medium text-zinc-600" htmlFor="agent7-hygiene">
        research_hygiene (optional JSON object)
      </label>
      <textarea
        id="agent7-hygiene"
        className="min-h-[72px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        placeholder="Leave empty or {} — citation rules, must-use sources, etc."
        value={researchHygieneText}
        disabled={disabled}
        onChange={(e) => setResearchHygieneText(e.target.value)}
        spellCheck={false}
      />

      <label className="block text-xs font-medium text-zinc-600" htmlFor="agent7-memory">
        memory (optional JSON object — durable facts; leave {"{}"} if none)
      </label>
      <textarea
        id="agent7-memory"
        className="min-h-[72px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        placeholder="{}"
        value={memoryText}
        disabled={disabled}
        onChange={(e) => setMemoryText(e.target.value)}
        spellCheck={false}
      />

      <label className="block text-xs font-medium text-zinc-600" htmlFor="agent7-goal">
        Objective (your query)
      </label>
      <textarea
        id="agent7-goal"
        className="min-h-[96px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        placeholder="What should Agent 7 answer or decide?"
        value={goal}
        disabled={disabled}
        onChange={(e) => onGoalChange(e.target.value)}
      />

      <label className="block text-xs font-medium text-zinc-600" htmlFor="agent7-dim-seed">
        dimensions seed (optional JSON array — after first run, filled automatically)
      </label>
      <textarea
        id="agent7-dim-seed"
        className="min-h-[88px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        placeholder='e.g. [{"label":"Market size","description":"TAM/SAM"},{"label":"Competitors"}] — or leave empty on first run.'
        value={dimensionsSeedText}
        disabled={disabled}
        onChange={(e) => setDimensionsSeedText(e.target.value)}
        spellCheck={false}
      />

      <label className="block text-xs font-medium text-zinc-600" htmlFor="agent7-kg-seed">
        known_gaps seed (optional JSON array — after first run, filled automatically)
      </label>
      <textarea
        id="agent7-kg-seed"
        className="min-h-[88px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        placeholder='e.g. [{"dimension":"Market size","gaps":["TAM/SAM not stated","Industry vertical unclear"]}] — or leave empty on first run.'
        value={knownGapsSeedText}
        disabled={disabled}
        onChange={(e) => setKnownGapsSeedText(e.target.value)}
        spellCheck={false}
      />

      <label className="block text-xs font-medium text-zinc-600" htmlFor="agent7-kf-seed">
        key_findings seed (optional — after first run, filled automatically for next iteration)
      </label>
      <textarea
        id="agent7-kf-seed"
        className="min-h-[100px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        placeholder="Leave empty on first run, or paste prior key_findings JSON object."
        value={keyFindingsSeedText}
        disabled={disabled}
        onChange={(e) => setKeyFindingsSeedText(e.target.value)}
        spellCheck={false}
      />

      {(clientError || serverError) && (
        <p className="text-xs text-red-600" role="alert">
          {clientError ?? serverError}
        </p>
      )}

      <button
        type="button"
        className="w-full rounded-md border border-zinc-400 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        disabled={disabled}
        onClick={() => void run()}
      >
        {busy ? "Running…" : "Run Agent 7"}
      </button>

      <div className="mt-4 space-y-2 rounded-md border border-indigo-200 bg-indigo-50/50 p-3 text-xs text-zinc-800">
        <h3 className="text-sm font-semibold text-indigo-900">Agent 7 ↔ 3/6 — run until user-ready</h3>
        <p className="text-zinc-600">
          Iterates: Agent 7 → compiled Agent 3/6 run JSON → Agent 7. Multiple{" "}
          <code className="rounded bg-white px-1">agent3_agent6</code> tasks in one turn run in{" "}
          <strong className="font-medium">parallel</strong>.           Persists session JSON to{" "}
          <code className="rounded bg-white px-1">workspace/sandbox-73-memory.json</code> and the final user report to{" "}
          <code className="rounded bg-white px-1">workspace/user-output.md</code> (on the server).
        </p>
        <label className="block text-[11px] font-medium text-zinc-600" htmlFor="agent7-subject-scope">
          subject_scope (optional — in-scope / out-of-scope / disambig cap; sent as Agent 7 user prompt, not in domain_manual
          JSON)
        </label>
        <textarea
          id="agent7-subject-scope"
          className="min-h-[64px] w-full resize-y rounded border border-zinc-300 bg-white p-2 text-xs text-zinc-900"
          value={subjectScopeText}
          disabled={disabled}
          onChange={(e) => setSubjectScopeText(e.target.value)}
          placeholder="e.g. Target: humeo.com only. Do not re-litigate Hume AI. Then follow domain manual."
        />
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block text-[11px] font-medium text-zinc-600">
            min confidence (0–1, optional)
            <input
              type="text"
              className="mt-1 w-full rounded border border-zinc-300 bg-white p-1.5 font-mono text-xs"
              value={loopMinConf}
              disabled={disabled}
              onChange={(e) => setLoopMinConf(e.target.value)}
              placeholder="0.75 or empty"
            />
          </label>
          <label className="block text-[11px] font-medium text-zinc-600">
            max outer (Agent 7 turns)
            <input
              type="text"
              inputMode="numeric"
              className="mt-1 w-full rounded border border-zinc-300 bg-white p-1.5 font-mono text-xs"
              value={loopMaxOuter}
              disabled={disabled}
              onChange={(e) => setLoopMaxOuter(e.target.value)}
            />
          </label>
          <label className="block text-[11px] font-medium text-zinc-600">
            max 3↔6 iterations / task
            <input
              type="text"
              inputMode="numeric"
              className="mt-1 w-full rounded border border-zinc-300 bg-white p-1.5 font-mono text-xs"
              value={loopMaxA36}
              disabled={disabled}
              onChange={(e) => setLoopMaxA36(e.target.value)}
            />
          </label>
        </div>
        {loopError && <p className="text-red-600">{loopError}</p>}
        <button
          type="button"
          className="w-full rounded-md border border-indigo-600 bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
          disabled={disabled}
          onClick={() => void runAgent73Loop()}
        >
          {loopBusy ? "Running 7↔3 loop…" : "Run until final user output"}
        </button>
        {lastLoopResult && (
          <div className="rounded border border-indigo-100 bg-white p-2 text-[11px] text-zinc-800">
            <p>
              <span className="font-medium">Stopped:</span> {lastLoopResult.stopped}
            </p>
            <p className="mt-1 font-mono text-[10px] text-zinc-600">chat: {lastLoopResult.chat_memory_path}</p>
            <p className="font-mono text-[10px] text-zinc-600">user: {lastLoopResult.user_output_path}</p>
            <CopyOutputButton
              className="mt-2"
              text={JSON.stringify({ steps: lastLoopResult.steps }, null, 2)}
              label="Copy loop trace (JSON)"
            />
          </div>
        )}
      </div>

      {lastResult && (
        <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-zinc-800">Output</span>
            <CopyOutputButton
              text={JSON.stringify(lastResult, null, 2)}
              label="Copy JSON"
            />
          </div>
          <div>
            <div className="font-semibold text-zinc-600">objective_understanding</div>
            <p className="mt-1 whitespace-pre-wrap">{lastResult.objective_understanding}</p>
          </div>
          <div>
            <div className="font-semibold text-zinc-600">dimensions</div>
            <ul className="mt-1 list-disc pl-4">
              {lastResult.dimensions.map((d, i) => (
                <li key={i} className="whitespace-pre-wrap">
                  <span className="font-medium">{d.label}</span>
                  {d.description ? ` — ${d.description}` : null}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-semibold text-zinc-600">key_findings</div>
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-white p-2 font-mono text-[11px]">
              {JSON.stringify(lastResult.key_findings, null, 2)}
            </pre>
          </div>
          <div>
            <div className="font-semibold text-zinc-600">train_of_thought</div>
            <p className="mt-1 whitespace-pre-wrap">{lastResult.train_of_thought}</p>
          </div>
          <div>
            <div className="font-semibold text-zinc-600">assignments</div>
            {lastResult.assignments.length === 0 ? (
              <p className="mt-1 text-zinc-500">(none)</p>
            ) : (
              <ul className="mt-1 space-y-2">
                {lastResult.assignments.map((a, i) => (
                  <li key={i} className="rounded border border-zinc-200 bg-white p-2">
                    <div className="font-mono text-[11px] font-semibold text-zinc-700">{a.assignee}</div>
                    {a.summary ? <p className="mt-1 whitespace-pre-wrap text-zinc-800">{a.summary}</p> : null}
                    {a.research_task ? (
                      <pre className="mt-1 max-h-40 overflow-auto rounded bg-zinc-50 p-2 font-mono text-[10px]">
                        {JSON.stringify(a.research_task, null, 2)}
                      </pre>
                    ) : null}
                    {a.verbatim_brief ? (
                      <p className="mt-1 whitespace-pre-wrap text-zinc-700">
                        <span className="font-medium">verbatim_brief:</span> {a.verbatim_brief}
                      </p>
                    ) : null}
                    {a.memory_directive ? (
                      <p className="mt-1 whitespace-pre-wrap text-zinc-700">
                        <span className="font-medium">memory_directive:</span> {a.memory_directive}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="font-semibold text-zinc-600">known_gaps</div>
            {lastResult.known_gaps.length === 0 ? (
              <p className="mt-1 text-zinc-500">(none)</p>
            ) : (
              <ul className="mt-1 space-y-2">
                {lastResult.known_gaps.map((group, i) => (
                  <li key={i} className="rounded border border-zinc-200 bg-white p-2">
                    <div className="font-medium text-zinc-700">
                      {group.dimension ?? "Objective / scope"}
                    </div>
                    <ul className="mt-1 list-disc pl-4">
                      {group.gaps.map((g, j) => (
                        <li key={j} className="whitespace-pre-wrap">
                          {g}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="font-semibold text-zinc-600">confidence</div>
            <p className="mt-1">
              <span className="font-medium capitalize">{lastResult.confidence.level}</span>
              {lastResult.confidence.rationale ? ` — ${lastResult.confidence.rationale}` : null}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
