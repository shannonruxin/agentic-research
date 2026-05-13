import { extractSummary, toJsonSafe, formatChatMemoryJson, parseChatMemoryFile } from "@/lib/chatMemoryJson";

/** Shapes of steps expected when building a Research `user-output` object (must match the orchestration loop). */
type ResearchLogStep =
  | { kind: "agent7"; result: unknown }
  | {
      kind: "agent36";
      /** Orchestration “set” (outer round): 1, 2, 3, …; parallel 3/6 runs in the same round share the same set, with iter 1,2,3,… */
      outer_index: number;
      full_loop: Record<string, unknown>;
      research_task?: import("@/lib/types").Agent7ResearchTask;
    }
  | { kind: "finalize"; reason: string; user_facing_document: string };

export type ResearchUserOutput = {
  /** Rolling findings / synthesis for this turn. */
  summary: unknown;
  /** Same text written to `workspace/user-output.md` for this turn. */
  document: string;
} & Record<string, unknown>;

/**
 * `workspace/chat-memory.json` (Research tab): each turn is a string key "1" | "2" | …
 * with `question` and nested `user-output` (summary, document, `agent7_iter*`, and
 * `agent36_<set>_iter<n>` where set is the outer round and n is 1,2,3… within a parallel batch).
 * Per-dimension markdown mirrors live under `workspace/chat-dimension-memory/` (derived from this JSON).
 */
export function nextResearchTurnKey(doc: Record<string, unknown>): string {
  let m = 0;
  for (const k of Object.keys(doc)) {
    if (/^\d+$/.test(k)) m = Math.max(m, parseInt(k, 10));
  }
  return String(m + 1);
}

export function buildResearchUserOutput(
  steps: readonly ResearchLogStep[],
  documentMarkdown: string,
  lastFindingsSummary: { key: string; value: unknown } | null,
): ResearchUserOutput {
  let a7c = 0;
  let a36Outer: number | null = null;
  let a36PosInSet = 0;
  const uo: ResearchUserOutput = {
    summary: lastFindingsSummary
      ? { key: lastFindingsSummary.key, value: lastFindingsSummary.value }
      : { note: "no findings_summary on this run" },
    document: documentMarkdown,
  };
  for (const s of steps) {
    if (s.kind === "agent7") {
      a7c++;
      uo[`agent7_iter${a7c}`] = toJsonSafe(s.result);
    } else if (s.kind === "agent36") {
      if (a36Outer !== s.outer_index) {
        a36Outer = s.outer_index;
        a36PosInSet = 0;
      }
      a36PosInSet++;
      const payload: Record<string, unknown> = { full_loop: s.full_loop };
      if (s.research_task) {
        payload.research_task = toJsonSafe(s.research_task);
      }
      uo[`agent36_${s.outer_index}_iter${a36PosInSet}`] = payload;
    } else if (s.kind === "finalize") {
      uo[`finalize_${s.reason}`] = { reason: s.reason, user_facing_document: s.user_facing_document };
    }
  }
  return uo;
}

/**
 * Agent 7 must not receive prior turns' full `document` markdown or duplicate finalization text in
 * context — it will often regurgitate them. The on-disk `chat-memory.json` stays complete; this is
 * **prompt-only** sanitization.
 */
export function stripResearchMemoryForAgent7Prompt(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const doc = parseChatMemoryFile(t);
  for (const k of Object.keys(doc)) {
    if (!/^\d+$/.test(k)) continue;
    const turn = doc[k];
    if (turn === null || typeof turn !== "object" || Array.isArray(turn)) continue;
    const uo = (turn as Record<string, unknown>)["user-output"];
    if (uo === null || typeof uo !== "object" || Array.isArray(uo)) continue;
    (turn as Record<string, unknown>)["user-output"] = sanitizeUserOutputForPrompt(uo as Record<string, unknown>);
  }
  return JSON.stringify(doc, null, 2);
}

// --- Compact prompt for Agent 7: avoid sending full Agent 3/6 loop JSON in every turn. ---

const TURN = /^\d+$/;
const A7 = /^agent7_iter(\d+)$/;
const A36 = /^agent36_(\d+)_iter(\d+)$/;
const MAX_Q = 2_000;
const MAX_PRIOR_TURNS = 2;
const MAX_TURNS_IN_DETAIL = 3;
const OMIT = "[omitted in Agent 7 context — on-disk chat-memory.json is complete]";

function truncStr(s: unknown, max: number): string | undefined {
  if (s === undefined) return undefined;
  if (typeof s !== "string") return String(s);
  if (s.length <= max) return s;
  return s.slice(0, max) + "…(truncated)";
}

function takeFirstArray<T>(arr: unknown, n: number): T[] | undefined {
  if (!Array.isArray(arr)) return undefined;
  return arr.slice(0, n) as T[];
}

function trimSources(s: unknown, max: number) {
  if (!Array.isArray(s)) return s;
  return s.slice(0, max).map((row) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) return row;
    const r = row as Record<string, unknown>;
    return {
      url: r.url,
      relevance: truncStr(r.relevance, 160),
      data_noted: truncStr(r.data_noted, 280),
    };
  });
}

/**
 * `final_agent3_result` from an Agent 3/6 full loop: keep evidence pointers, not full logs.
 */
function compactTaskResultPreview(fin: unknown): unknown {
  if (fin === null || typeof fin !== "object" || Array.isArray(fin)) {
    return fin;
  }
  const t = fin as Record<string, unknown>;
  return {
    plan_summary: truncStr(t.plan_summary, 800),
    search_objective: truncStr(t.search_objective, 600),
    summary: truncStr(t.summary, 1_200),
    confidence: t.confidence,
    analysis_points: takeFirstArray<string>(t.analysis_points, 6),
    task_gaps: takeFirstArray<string>(t.task_gaps, 5),
    sources_and_data: trimSources(t.sources_and_data, 5),
    needs_further_search: t.needs_further_search,
    decision: t.decision,
  };
}

/** Drop iteration_trace, agent6_runs, research_log, plans — keep one-line outcome for memory. */
function compactFullLoopForPrompt(loop: unknown): unknown {
  if (loop === null || typeof loop !== "object" || Array.isArray(loop)) {
    return { note: "invalid agent36 loop" };
  }
  const o = loop as Record<string, unknown>;
  return {
    iterations: o.iterations,
    stopped_reason: o.stopped_reason,
    min_confidence_threshold: o.min_confidence_threshold,
    final_agent3_result: compactTaskResultPreview(o.final_agent3_result),
  };
}

/**
 * `assignments` can be large; keep task shapes needed for “what we already ran”.
 */
function compactAgent7ForPrompt(out: unknown): unknown {
  if (out === null || typeof out !== "object" || Array.isArray(out)) {
    return out;
  }
  const o = out as Record<string, unknown>;
  const keyFind = o.key_findings;
  const kf = keyFind;
  let kfOut: unknown = kf;
  if (kf !== null && typeof kf === "object" && !Array.isArray(kf)) {
    const j = JSON.stringify(kf);
    if (j.length > 3_000) {
      kfOut = { _truncated: true, preview: j.slice(0, 2_800) + "…" };
    }
  } else if (typeof kf === "string" && kf.length > 3_000) {
    kfOut = truncStr(kf, 3_000);
  }
  return {
    objective_understanding: truncStr(o.objective_understanding, 900),
    orchestration: o.orchestration,
    train_of_thought: truncStr(o.train_of_thought, 1_500),
    confidence: o.confidence,
    dimensions: o.dimensions,
    known_gaps: o.known_gaps,
    key_findings: kfOut,
    findings_summary: o.findings_summary,
    assignments: Array.isArray(o.assignments)
      ? o.assignments.map((a) => {
          if (a === null || typeof a !== "object" || Array.isArray(a)) return a;
          const b = a as Record<string, unknown>;
          const rt = b.research_task;
          if (rt !== null && typeof rt === "object" && !Array.isArray(rt)) {
            const r = rt as Record<string, unknown>;
            return {
              assignee: b.assignee,
              summary: truncStr(b.summary, 400),
              research_task: {
                task_id: r.task_id,
                goal: truncStr(r.goal, 500),
                dimension: r.dimension,
                factor: r.factor,
                priority: r.priority,
              },
            };
          }
          return { assignee: b.assignee, summary: truncStr(b.summary, 400) };
        })
      : o.assignments,
  };
}

function compactUserOutputForPrompt(
  uo: Record<string, unknown>,
  detailLevel: "full" | "summary_only",
): Record<string, unknown> {
  if (detailLevel === "summary_only") {
    return {
      summary: uo.summary,
      document: OMIT,
    };
  }
  const out: Record<string, unknown> = {
    summary: uo.summary,
    document: OMIT,
  };
  for (const key of Object.keys(uo)) {
    if (key === "summary" || key === "document") continue;
    if (key.startsWith("finalize_") && uo[key] !== null && typeof uo[key] === "object" && !Array.isArray(uo[key])) {
      const fin = { ...(uo[key] as Record<string, unknown>) };
      if (typeof fin.user_facing_document === "string") {
        fin.user_facing_document = OMIT;
      }
      out[key] = fin;
      continue;
    }
    if (A7.test(key)) {
      out[key] = compactAgent7ForPrompt(uo[key]);
      continue;
    }
    if (A36.test(key)) {
      out[key] = compactFullLoopForPrompt(uo[key]);
      continue;
    }
    if (key === "document" || key === "summary") {
      // handled
      continue;
    }
    if (!key.startsWith("agent7_") && !key.startsWith("agent36_")) {
      out[key] = uo[key];
    }
  }
  return out;
}

export type BuildCompactAgent7MemoryOptions = {
  /** How many most recent chrono turns keep compact agent7/agent36 detail (default 3). */
  maxTurnsInFullDetail?: number;
  /**
   * Older chrono turns only get `question` + `user-output.summary` (default: all turns older
   * than the last `maxTurnsInFullDetail` and last `minOlderTurnsForSummaryOnly`).
   */
  minOlderTurnsForSummaryOnly?: number;
};

/**
 * Builds a **small** JSON string for the Agent 7 user prompt. On-disk
 * `chat-memory.json` is unchanged. Uses rolling summary (non-numeric first key, if
 * present), then for chrono keys `"1"`,`"2"`,…: recent turns get compact
 * `agent7_iter*` / `agent36_*_iter*`; older turns get only the turn `question` and
 * `user-output.summary` to save tokens. Pair with `last_compiled_runs` in the runner for
 * the current batch’s full evidence.
 */
export function buildCompactResearchMemoryForAgent7Prompt(
  raw: string,
  opts: BuildCompactAgent7MemoryOptions = {},
): string {
  const t = raw.trim();
  if (!t) return "";
  const fullDetail = Math.max(1, Math.min(20, opts.maxTurnsInFullDetail ?? MAX_TURNS_IN_DETAIL));
  const olderAsSummary = opts.minOlderTurnsForSummaryOnly ?? MAX_PRIOR_TURNS;
  const doc = parseChatMemoryFile(t);
  const out: Record<string, unknown> = {};

  const sum = extractSummary(doc);
  if (sum) {
    out[sum.key] = sum.value;
  }

  const chronoIdx = Object.keys(doc)
    .filter((k) => TURN.test(k))
    .map((k) => parseInt(k, 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  const nTurn = chronoIdx.length;
  const detailFrom = nTurn - fullDetail;

  for (const n of chronoIdx) {
    const ks = String(n);
    const turn = doc[ks];
    if (turn === null || typeof turn !== "object" || Array.isArray(turn)) {
      out[ks] = turn;
      continue;
    }
    const tr = turn as Record<string, unknown>;
    const uo = tr["user-output"];
    if (uo === null || typeof uo !== "object" || Array.isArray(uo)) {
      out[ks] = {
        question: truncStr(tr.question, MAX_Q),
        "user-output": uo,
      };
      continue;
    }
    const uoObj = uo as Record<string, unknown>;
    const isRecent = n > detailFrom;
    const isVeryOld = n <= (nTurn - fullDetail - olderAsSummary) && nTurn - fullDetail - olderAsSummary > 0;
    if (isVeryOld) {
      out[ks] = {
        question: truncStr(tr.question, 400),
        "user-output": {
          summary: uoObj.summary,
          _note: "older turn — only summary kept; see newer turns and last_compiled_runs",
          document: OMIT,
        },
      };
    } else if (isRecent) {
      out[ks] = {
        question: truncStr(tr.question, MAX_Q),
        "user-output": compactUserOutputForPrompt(uoObj, "full"),
      };
    } else {
      out[ks] = {
        question: truncStr(tr.question, 600),
        "user-output": compactUserOutputForPrompt(uoObj, "summary_only"),
      };
    }
  }

  return JSON.stringify(out, null, 2);
}

function sanitizeUserOutputForPrompt(uo: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...uo };
  if ("document" in out) {
    out.document =
      "[omitted in prompt — prior user markdown; answer the current objective from memory/summary only]";
  }
  for (const key of Object.keys(out)) {
    if (key.startsWith("finalize_") && out[key] !== null && typeof out[key] === "object" && !Array.isArray(out[key])) {
      const fin = { ...(out[key] as Record<string, unknown>) };
      if (typeof fin.user_facing_document === "string") {
        fin.user_facing_document = "[omitted — see chat-memory.json]";
      }
      out[key] = fin;
    }
  }
  return out;
}

export function mergeResearchTurn(
  currentRaw: string,
  turnKey: string,
  block: { question: string; "user-output": ResearchUserOutput },
): string {
  const cur = parseChatMemoryFile(currentRaw);
  const head: Record<string, unknown> = {};
  for (const k of Object.keys(cur)) {
    if (!/^\d+$/.test(k)) {
      head[k] = cur[k] as unknown;
    }
  }
  const numerics: Record<string, unknown> = {};
  for (const k of Object.keys(cur)) {
    if (/^\d+$/.test(k)) numerics[k] = cur[k] as unknown;
  }
  numerics[turnKey] = { question: block.question, "user-output": block["user-output"] };
  const sortedKeys = Object.keys(numerics)
    .map((k) => parseInt(k, 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const out: Record<string, unknown> = { ...head };
  for (const n of sortedKeys) {
    out[String(n)] = numerics[String(n)]!;
  }
  return formatChatMemoryJson(out);
}
