"use client";

import { useMemo, useState } from "react";
import { compileAgent36LoopToFlatJson } from "@/lib/agents/compileAgent36Run";
import {
  AGENT3_PHASE2_UNIFIED_CHEATSHEET,
  AGENT3_PLAN_PHASE2_CHEATSHEET,
  AGENT3_REVIEW_PHASE2_CHEATSHEET,
  AGENT6_PHASE2_SPEC_CHEATSHEET,
} from "@/lib/agent36SpecCheatsheet";
import { CopyOutputButton } from "@/components/CopyOutputButton";
import type {
  Agent36ResearchLoopResponse,
  Agent3Phase2Response,
  Agent3ResearchLogEntry,
  Agent3ResearchPlan,
  Agent6ResearchRunResult,
  Agent6AssignmentFromAgent3,
  Agent7ResearchTask,
} from "@/lib/types";
import type { Agent36PriorRound } from "@/lib/agents/agent3ResearchPlan";
import { HARD_CAP_AGENT36_ITERATIONS } from "@/lib/agents/agent36ResearchLoop";

const SAMPLE_RESEARCH_TASK: Agent7ResearchTask = {
  task_id: "market_size_TAM_1",
  dimension: "market_size",
  factor: "TAM estimation",
  goal: "Estimate TAM for a hypothetical B2B SaaS for clinics in Malaysia (sandbox example)",
  context: {
    business_model: "B2B SaaS",
    target_customer: "clinics",
    geography: "Malaysia",
  },
  method_instructions: [
    "Identify total number of clinics in Malaysia (or proxy)",
    "Estimate annual SaaS price per clinic from benchmarks",
    "Compute TAM using bottom-up approach",
  ],
  variables_to_find: [
    "number_of_buyers (clinics in Malaysia)",
    "price_per_customer (annual SaaS pricing)",
  ],
  calculation_logic: "TAM = number_of_buyers × annual_price_per_customer",
  search_guidance: [
    "number of clinics in Malaysia health statistics",
    "Malaysia healthcare facilities private clinics count",
    "clinic practice management software pricing SaaS",
  ],
  validation_criteria: [
    "At least 2 sources for buyer count or official proxy",
    "Pricing benchmark justified",
    "Assumptions explicitly stated",
  ],
  adaptation_signals: [
    "Cannot find clinic count after multiple queries",
    "No reliable pricing data",
    "High variance across sources",
  ],
  fallback_methods: ["Use top-down TAM from healthcare IT market reports"],
  success_criteria: ["TAM estimate with breakdown", "Assumptions listed", "Task-level confidence"],
  priority: "high",
  expected_output_format: [
    "Summary of TAM estimate",
    "Variables and sources",
    "Assumptions",
    "Confidence breakdown",
  ],
};

function parseJsonObject(
  raw: string,
  label: string,
  required: boolean,
): { ok: true; value: Record<string, unknown> | undefined } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    if (required) {
      return { ok: false, error: `${label} is required (JSON object).` };
    }
    return { ok: true, value: undefined };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: `${label} is not valid JSON.` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: `${label} must be a JSON object.` };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

function parseResearchTask(raw: string): { ok: true; value: Agent7ResearchTask } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "research_task JSON is required." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "research_task is not valid JSON." };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "research_task must be a JSON object." };
  }
  const o = parsed as Record<string, unknown>;
  if (typeof o.task_id !== "string" || !o.task_id.trim()) {
    return { ok: false, error: "research_task.task_id is required." };
  }
  if (typeof o.dimension !== "string" || !o.dimension.trim()) {
    return { ok: false, error: "research_task.dimension is required." };
  }
  if (typeof o.factor !== "string" || !o.factor.trim()) {
    return { ok: false, error: "research_task.factor is required." };
  }
  if (typeof o.goal !== "string" || !o.goal.trim()) {
    return { ok: false, error: "research_task.goal is required." };
  }
  const p = o.priority;
  if (p !== "high" && p !== "medium" && p !== "low") {
    return { ok: false, error: "research_task.priority must be high | medium | low." };
  }
  return { ok: true, value: parsed as Agent7ResearchTask };
}

function parseAgent6Result(raw: string): { ok: true; value: Agent6ResearchRunResult } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Agent 6 result JSON is required." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "Agent 6 result is not valid JSON." };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Agent 6 result must be a JSON object." };
  }
  return { ok: true, value: parsed as Agent6ResearchRunResult };
}

/** Empty string → undefined (plan-only). Otherwise must be valid Agent 6 JSON object. */
function parseAgent6ResultOptional(
  raw: string,
): { ok: true; value: Agent6ResearchRunResult | undefined } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: undefined };
  }
  return parseAgent6Result(trimmed);
}

/** Empty → undefined. Otherwise must be a JSON array (research_log entries). */
function parseResearchLogOptional(
  raw: string,
): { ok: true; value: Agent3ResearchLogEntry[] | undefined } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: undefined };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "research_log is not valid JSON." };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "research_log must be a JSON array." };
  }
  return { ok: true, value: parsed as Agent3ResearchLogEntry[] };
}

/** Max queries sent to Parallel (see agent6ResearchTask). */
const MAX_A6_QUERIES = 14;

function parseAgent3Assignment(
  raw: string,
): { ok: true; value: Agent6AssignmentFromAgent3 } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "agent3_assignment JSON is required for the normal A7→A3→A6 path." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "agent3_assignment is not valid JSON." };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "agent3_assignment must be a JSON object." };
  }
  const top = parsed as Record<string, unknown>;
  // Full Agent3ResearchPlan: { plan_summary, agent6_assignment, open_questions? }
  const o =
    top.agent6_assignment !== null &&
    typeof top.agent6_assignment === "object" &&
    !Array.isArray(top.agent6_assignment)
      ? (top.agent6_assignment as Record<string, unknown>)
      : top;
  if (typeof o.search_objective !== "string" || !o.search_objective.trim()) {
    return {
      ok: false,
      error:
        "Missing search_objective. Paste either the inner agent6_assignment object, or the full plan (with agent6_assignment.search_objective).",
    };
  }
  if (!Array.isArray(o.search_queries) || !o.search_queries.length) {
    return { ok: false, error: "search_queries must be a non-empty string array." };
  }
  if (!o.search_queries.every((q) => typeof q === "string" && q.trim())) {
    return { ok: false, error: "search_queries must contain non-empty strings." };
  }
  const queries = (o.search_queries as string[]).map((s) => s.trim()).filter(Boolean).slice(0, MAX_A6_QUERIES);
  if (queries.length === 0) {
    return { ok: false, error: "search_queries must be a non-empty string array." };
  }
  const out: Agent6AssignmentFromAgent3 = {
    search_objective: o.search_objective.trim(),
    search_queries: queries,
  };
  if (typeof o.extraction_notes === "string" && o.extraction_notes.trim()) {
    out.extraction_notes = o.extraction_notes.trim();
  }
  return { ok: true, value: out };
}

function parseIterationExtension(
  raw: string,
): { ok: true; value: { additional_queries?: string[]; objective_suffix?: string } | undefined } | {
  ok: false;
  error: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: undefined };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "iteration_extension is not valid JSON." };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "iteration_extension must be a JSON object." };
  }
  const o = parsed as Record<string, unknown>;
  const out: { additional_queries?: string[]; objective_suffix?: string } = {};
  if (o.additional_queries !== undefined) {
    if (!Array.isArray(o.additional_queries) || !o.additional_queries.every((x) => typeof x === "string")) {
      return { ok: false, error: "iteration_extension.additional_queries must be string[]." };
    }
    out.additional_queries = o.additional_queries as string[];
  }
  if (o.objective_suffix !== undefined) {
    if (typeof o.objective_suffix !== "string") {
      return { ok: false, error: "iteration_extension.objective_suffix must be a string." };
    }
    out.objective_suffix = o.objective_suffix;
  }
  return { ok: true, value: Object.keys(out).length ? out : undefined };
}

/**
 * Accepts a raw `Agent3TaskResult` **or** a wrapper such as
 * `{ "agent_3_assignment": { ... } }` / `{ "agent3_review": { ... } }` (and typo `agent_3assignment`)
 * for imports from other tools. Returns the inner review object to store as review output.
 */
function parsePastedAgent3Review(
  raw: string,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Paste JSON first." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "Invalid JSON." };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Root value must be a JSON object." };
  }
  const o = parsed as Record<string, unknown>;
  const fromKey = (k: string) => {
    const v = o[k];
    return isPlainObject(v) ? (v as Record<string, unknown>) : null;
  };
  const inner =
    fromKey("agent_3assignment") ??
    fromKey("agent_3_assignment") ??
    fromKey("agent3_review") ??
    (isPlainObject((o as { agent3Review?: unknown }).agent3Review)
      ? ((o as { agent3Review: Record<string, unknown> }).agent3Review)
      : null) ??
    o;
  if (!isPlainObject(inner)) {
    return { ok: false, error: "Could not find a review object to import." };
  }
  return { ok: true, value: inner };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Build the next Agent 6 `agent3_assignment` from review or unified Agent 3 Phase 2 JSON (follow-up pass). */
function buildAgent6FollowupFromReview(
  review: Record<string, unknown>,
):
  | { ok: true; value: Agent6AssignmentFromAgent3 }
  | { ok: false; error: string } {
  const uObj = review.search_objective;
  const uQ = review.search_queries;
  if (
    typeof uObj === "string" &&
    uObj.trim() &&
    Array.isArray(uQ) &&
    uQ.length &&
    uQ.every((x) => typeof x === "string" && String(x).trim())
  ) {
    const assign: Agent6AssignmentFromAgent3 = {
      search_objective: uObj.trim(),
      search_queries: (uQ as string[]).map((s) => s.trim()).filter(Boolean).slice(0, MAX_A6_QUERIES),
    };
    const en = review.extraction_notes;
    if (typeof en === "string" && en.trim()) {
      assign.extraction_notes = en.trim();
    }
    return { ok: true, value: assign };
  }

  const summary = typeof review.summary === "string" ? review.summary.trim() : "";
  const sq = review.suggested_queries;
  const gaps = review.task_gaps;
  const queries: string[] = [];
  if (Array.isArray(sq)) {
    for (const s of sq) {
      const t = String(s).trim();
      if (t) {
        queries.push(t);
      }
    }
  }
  if (queries.length === 0 && Array.isArray(gaps)) {
    for (const g of gaps) {
      const t = String(g).trim();
      if (t) {
        queries.push(t);
      }
    }
  }
  if (queries.length === 0) {
    return {
      ok: false,
      error: "Add suggested_queries or task_gaps in the review output to build a follow-up Agent 6 run.",
    };
  }
  const objective =
    (summary && summary.length > 0 ? summary.slice(0, 2000) : null) ||
    (Array.isArray(gaps) && typeof gaps[0] === "string" && String(gaps[0]).trim()
      ? `Follow-up search: ${String(gaps[0]).trim()}`
      : "Follow-up web search to close gaps from Agent 3 review.");
  const notesParts: string[] = [];
  if (Array.isArray(gaps) && gaps.length) {
    notesParts.push("task_gaps: " + gaps.map((g) => String(g).trim()).join(" | ").slice(0, 1800));
  }
  if (typeof review.needs_further_search === "boolean") {
    notesParts.push(`needs_further_search: ${review.needs_further_search}`);
  }
  return {
    ok: true,
    value: {
      search_objective: objective,
      search_queries: queries.slice(0, MAX_A6_QUERIES),
      ...(notesParts.length > 0 ? { extraction_notes: notesParts.join("\n\n") } : {}),
    },
  };
}

function parsePriorRounds(
  raw: string,
): { ok: true; value: Agent36PriorRound[] | undefined } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: undefined };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "prior_rounds is not valid JSON." };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "prior_rounds must be a JSON array." };
  }
  return { ok: true, value: parsed as Agent36PriorRound[] };
}

/** 0–1, or 1–100 as percent. Empty → stop using threshold (API omits the field). */
function parseMinConfidence(
  raw: string,
):
  | { ok: true; value: number | undefined }
  | { ok: false; error: string } {
  const t = raw.trim();
  if (!t) {
    return { ok: true, value: undefined };
  }
  const n = Number.parseFloat(t.replace(",", "."));
  if (!Number.isFinite(n)) {
    return { ok: false, error: "Minimum confidence must be a number (0–1, or 1–100 for percent)." };
  }
  if (n > 1 && n <= 100) {
    return { ok: true, value: n / 100 };
  }
  if (n < 0 || n > 1) {
    return { ok: false, error: "Minimum confidence must be between 0 and 1, or 1–100 for percent." };
  }
  return { ok: true, value: n };
}

function bodyForTaskContext(
  researchTaskText: string,
  domainManualText: string,
  researchHygieneText: string,
):
  | { ok: true; research_task: Agent7ResearchTask; domain_manual?: Record<string, unknown>; research_hygiene?: Record<string, unknown> }
  | { ok: false; error: string } {
  const task = parseResearchTask(researchTaskText);
  if (!task.ok) {
    return { ok: false, error: task.error };
  }
  const dm = parseJsonObject(domainManualText, "domain_manual", false);
  if (!dm.ok) {
    return { ok: false, error: dm.error };
  }
  const rh = parseJsonObject(researchHygieneText, "research_hygiene", false);
  if (!rh.ok) {
    return { ok: false, error: rh.error };
  }
  return {
    ok: true,
    research_task: task.value,
    domain_manual: dm.value,
    research_hygiene: rh.value,
  };
}

export type Agent36ResearchTaskSandboxProps = {
  pipelineBusy?: boolean;
};

export function Agent36ResearchTaskSandbox({ pipelineBusy = false }: Agent36ResearchTaskSandboxProps) {
  const defaultTaskJson = useMemo(() => JSON.stringify(SAMPLE_RESEARCH_TASK, null, 2), []);

  /* Agent 3 — UNIFIED /api/agent3-phase2 */
  const [u3TaskText, setU3TaskText] = useState(defaultTaskJson);
  const [u3DomainText, setU3DomainText] = useState("{}");
  const [u3HygieneText, setU3HygieneText] = useState("{}");
  const [u3Agent6Text, setU3Agent6Text] = useState("");
  const [u3ResearchLogText, setU3ResearchLogText] = useState("");
  const [u3HintText, setU3HintText] = useState("");
  const [u3OutputText, setU3OutputText] = useState("");
  const [u3Error, setU3Error] = useState<string | null>(null);
  const [busyU3, setBusyU3] = useState(false);

  /* Agent 3 — PLAN (Agent 7 handoff) */
  const [planTaskText, setPlanTaskText] = useState(defaultTaskJson);
  const [planDomainText, setPlanDomainText] = useState("{}");
  const [planHygieneText, setPlanHygieneText] = useState("{}");
  const [planResearchLogText, setPlanResearchLogText] = useState("");
  const [planPriorRoundsText, setPlanPriorRoundsText] = useState("");
  const [planHintText, setPlanHintText] = useState("");
  const [planOutputText, setPlanOutputText] = useState("");
  const [planError, setPlanError] = useState<string | null>(null);
  const [busyPlan, setBusyPlan] = useState(false);

  /* Agent 6 */
  const [a6TaskText, setA6TaskText] = useState(defaultTaskJson);
  const [a6DomainText, setA6DomainText] = useState("{}");
  const [a6HygieneText, setA6HygieneText] = useState("{}");
  const [a6AssignmentText, setA6AssignmentText] = useState("");
  const [a6IterExtText, setA6IterExtText] = useState("");
  const [a6OutputText, setA6OutputText] = useState("");
  const [a6Error, setA6Error] = useState<string | null>(null);
  const [busyA6, setBusyA6] = useState(false);

  /* Agent 3 — REVIEW */
  const [revTaskText, setRevTaskText] = useState(defaultTaskJson);
  const [revDomainText, setRevDomainText] = useState("{}");
  const [revHygieneText, setRevHygieneText] = useState("{}");
  const [revAgent6InputText, setRevAgent6InputText] = useState("");
  const [revResearchLogText, setRevResearchLogText] = useState("");
  const [revHintText, setRevHintText] = useState("");
  const [revOutputText, setRevOutputText] = useState("");
  const [revImportText, setRevImportText] = useState("");
  const [revError, setRevError] = useState<string | null>(null);
  const [busyRev, setBusyRev] = useState(false);

  const [maxLoopIterations, setMaxLoopIterations] = useState("3");
  /** Seed for POST /api/agent3-6-research-loop — uses unified panel § research_task / domain / hygiene. */
  const [u3LoopResearchLogText, setU3LoopResearchLogText] = useState("");
  const [minLoopConfidenceText, setMinLoopConfidenceText] = useState("");
  const [loopTrace, setLoopTrace] = useState<Agent36ResearchLoopResponse | null>(null);
  const [loopError, setLoopError] = useState<string | null>(null);
  const [busyLoop, setBusyLoop] = useState(false);

  const compiledRunJson = useMemo(() => {
    if (!loopTrace) {
      return "";
    }
    return JSON.stringify(compileAgent36LoopToFlatJson(loopTrace), null, 2);
  }, [loopTrace]);

  const disabledU3 = pipelineBusy || busyU3 || busyLoop;
  const disabledPlan = pipelineBusy || busyPlan || busyLoop;
  const disabledA6 = pipelineBusy || busyA6 || busyLoop;
  const disabledRev = pipelineBusy || busyRev;
  const disabledLoop = pipelineBusy || busyLoop;

  function applyAssignmentFromPlanOutput() {
    setPlanError(null);
    const trimmed = planOutputText.trim();
    if (!trimmed) {
      setPlanError("Run Agent 3 plan first, or paste a plan JSON.");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      setPlanError("Plan output is not valid JSON.");
      return;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      setPlanError("Plan must be a JSON object.");
      return;
    }
    const plan = parsed as Agent3ResearchPlan & {
      search_objective?: string;
      search_queries?: string[];
      extraction_notes?: string;
    };
    if (plan.agent6_assignment) {
      setA6AssignmentText(JSON.stringify(plan.agent6_assignment, null, 2));
      return;
    }
    if (
      typeof plan.search_objective === "string" &&
      plan.search_objective.trim() &&
      Array.isArray(plan.search_queries) &&
      plan.search_queries.length
    ) {
      const assign: Agent6AssignmentFromAgent3 = {
        search_objective: plan.search_objective.trim(),
        search_queries: plan.search_queries.map((s) => String(s).trim()).filter(Boolean).slice(0, MAX_A6_QUERIES),
      };
      if (typeof plan.extraction_notes === "string" && plan.extraction_notes.trim()) {
        assign.extraction_notes = plan.extraction_notes.trim();
      }
      setA6AssignmentText(JSON.stringify(assign, null, 2));
      return;
    }
    setPlanError("Plan JSON missing agent6_assignment or unified search_objective/search_queries.");
  }

  function applyAssignmentFromUnifiedOutput() {
    setU3Error(null);
    const trimmed = u3OutputText.trim();
    if (!trimmed) {
      setU3Error("Run unified Agent 3 first, or paste a response JSON.");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      setU3Error("Unified output is not valid JSON.");
      return;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      setU3Error("Unified output must be a JSON object.");
      return;
    }
    const plan = parsed as Agent3ResearchPlan & {
      search_objective?: string;
      search_queries?: string[];
      extraction_notes?: string;
    };
    if (plan.agent6_assignment) {
      setA6AssignmentText(JSON.stringify(plan.agent6_assignment, null, 2));
      return;
    }
    if (
      typeof plan.search_objective === "string" &&
      plan.search_objective.trim() &&
      Array.isArray(plan.search_queries) &&
      plan.search_queries.length
    ) {
      const assign: Agent6AssignmentFromAgent3 = {
        search_objective: plan.search_objective.trim(),
        search_queries: plan.search_queries.map((s) => String(s).trim()).filter(Boolean).slice(0, MAX_A6_QUERIES),
      };
      if (typeof plan.extraction_notes === "string" && plan.extraction_notes.trim()) {
        assign.extraction_notes = plan.extraction_notes.trim();
      }
      setA6AssignmentText(JSON.stringify(assign, null, 2));
      return;
    }
    setU3Error("Response missing agent6_assignment or top-level search_objective/search_queries.");
  }

  function syncUnifiedFromPlanPanel() {
    setU3TaskText(planTaskText);
    setU3DomainText(planDomainText);
    setU3HygieneText(planHygieneText);
    setU3HintText(planHintText);
    if (planResearchLogText.trim()) {
      setU3ResearchLogText(planResearchLogText);
    }
  }

  async function runUnifiedPhase2() {
    setU3Error(null);
    const task = parseResearchTask(u3TaskText);
    if (!task.ok) {
      setU3Error(task.error);
      return;
    }
    const dm = parseJsonObject(u3DomainText, "domain_manual", false);
    if (!dm.ok) {
      setU3Error(dm.error);
      return;
    }
    const rh = parseJsonObject(u3HygieneText, "research_hygiene", false);
    if (!rh.ok) {
      setU3Error(rh.error);
      return;
    }
    const a6 = parseAgent6ResultOptional(u3Agent6Text);
    if (!a6.ok) {
      setU3Error(a6.error);
      return;
    }
    const log = parseResearchLogOptional(u3ResearchLogText);
    if (!log.ok) {
      setU3Error(log.error);
      return;
    }
    const hint = u3HintText.trim() || undefined;
    setBusyU3(true);
    try {
      const res = await fetch("/api/agent3-phase2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          research_task: task.value,
          domain_manual: dm.value,
          research_hygiene: rh.value,
          ...(a6.value ? { agent6_result: a6.value } : {}),
          ...(log.value?.length ? { research_log: log.value } : {}),
          iteration_hint: hint,
        }),
      });
      const data = (await res.json()) as Agent3Phase2Response | { error?: string };
      if (!res.ok) {
        setU3Error(typeof data === "object" && data && "error" in data ? String(data.error) : `HTTP ${res.status}`);
        return;
      }
      setU3OutputText(JSON.stringify(data, null, 2));
      setLoopTrace(null);
    } catch (e) {
      setU3Error(e instanceof Error ? e.message : "Unified Agent 3 request failed");
    } finally {
      setBusyU3(false);
    }
  }

  async function runPlan() {
    setPlanError(null);
    const ctx = bodyForTaskContext(planTaskText, planDomainText, planHygieneText);
    if (!ctx.ok) {
      setPlanError(ctx.error);
      return;
    }
    const pr = parsePriorRounds(planPriorRoundsText);
    if (!pr.ok) {
      setPlanError(pr.error);
      return;
    }
    const prLog = parseResearchLogOptional(planResearchLogText);
    if (!prLog.ok) {
      setPlanError(prLog.error);
      return;
    }
    const hint = planHintText.trim() || undefined;
    setBusyPlan(true);
    try {
      const res = await fetch("/api/agent3-research-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          research_task: ctx.research_task,
          domain_manual: ctx.domain_manual,
          research_hygiene: ctx.research_hygiene,
          prior_rounds: pr.value,
          ...(prLog.value?.length ? { research_log: prLog.value } : {}),
          iteration_hint: hint,
        }),
      });
      const data = (await res.json()) as Agent3ResearchPlan | { error?: string };
      if (!res.ok) {
        setPlanError(typeof data === "object" && data && "error" in data ? String(data.error) : `HTTP ${res.status}`);
        return;
      }
      setPlanOutputText(JSON.stringify(data, null, 2));
      setLoopTrace(null);
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "Plan request failed");
    } finally {
      setBusyPlan(false);
    }
  }

  async function runAgent6() {
    setA6Error(null);
    const ctx = bodyForTaskContext(a6TaskText, a6DomainText, a6HygieneText);
    if (!ctx.ok) {
      setA6Error(ctx.error);
      return;
    }
    const assignParse = parseAgent3Assignment(a6AssignmentText);
    const assignment = assignParse.ok ? assignParse.value : undefined;
    if (!assignParse.ok && a6AssignmentText.trim()) {
      setA6Error(assignParse.error);
      return;
    }
    const ext = parseIterationExtension(a6IterExtText);
    if (!ext.ok) {
      setA6Error(ext.error);
      return;
    }
    setBusyA6(true);
    try {
      const res = await fetch("/api/agent6-research-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          research_task: ctx.research_task,
          domain_manual: ctx.domain_manual,
          research_hygiene: ctx.research_hygiene,
          agent3_assignment: assignment,
          iteration_extension: ext.value,
        }),
      });
      const data = (await res.json()) as Agent6ResearchRunResult | { error?: string };
      if (!res.ok) {
        setA6Error(typeof data === "object" && data && "error" in data ? String(data.error) : `HTTP ${res.status}`);
        return;
      }
      setA6OutputText(JSON.stringify(data, null, 2));
      setLoopTrace(null);
    } catch (e) {
      setA6Error(e instanceof Error ? e.message : "Agent 6 request failed");
    } finally {
      setBusyA6(false);
    }
  }

  async function runReview() {
    setRevError(null);
    const ctx = bodyForTaskContext(revTaskText, revDomainText, revHygieneText);
    if (!ctx.ok) {
      setRevError(ctx.error);
      return;
    }
    const a6 = parseAgent6Result(revAgent6InputText);
    if (!a6.ok) {
      setRevError(a6.error);
      return;
    }
    const revLog = parseResearchLogOptional(revResearchLogText);
    if (!revLog.ok) {
      setRevError(revLog.error);
      return;
    }
    const hint = revHintText.trim() || undefined;
    setBusyRev(true);
    try {
      const res = await fetch("/api/agent3-research-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          research_task: ctx.research_task,
          agent6_result: a6.value,
          domain_manual: ctx.domain_manual,
          research_hygiene: ctx.research_hygiene,
          ...(revLog.value?.length ? { research_log: revLog.value } : {}),
          iteration_hint: hint,
        }),
      });
      const data = (await res.json()) as Record<string, unknown> | { error?: string };
      if (!res.ok) {
        setRevError(typeof data === "object" && data && "error" in data ? String(data.error) : `HTTP ${res.status}`);
        setRevOutputText("");
        return;
      }
      setRevOutputText(JSON.stringify(data, null, 2));
      setLoopTrace(null);
    } catch (e) {
      setRevError(e instanceof Error ? e.message : "Agent 3 review failed");
    } finally {
      setBusyRev(false);
    }
  }

  async function runLoop() {
    setLoopError(null);
    const ctx = bodyForTaskContext(u3TaskText, u3DomainText, u3HygieneText);
    if (!ctx.ok) {
      setLoopError(ctx.error);
      return;
    }
    const minParsed = parseMinConfidence(minLoopConfidenceText);
    if (!minParsed.ok) {
      setLoopError(minParsed.error);
      return;
    }
    const maxRaw = maxLoopIterations.trim();
    const maxIt = maxRaw ? Number.parseInt(maxRaw, 10) : 3;
    if (!Number.isFinite(maxIt) || maxIt < 1 || maxIt > HARD_CAP_AGENT36_ITERATIONS) {
      setLoopError(`max_iterations must be 1–${HARD_CAP_AGENT36_ITERATIONS}.`);
      return;
    }
    const seedLog = parseResearchLogOptional(u3LoopResearchLogText);
    if (!seedLog.ok) {
      setLoopError(seedLog.error);
      return;
    }
    setBusyLoop(true);
    try {
      const res = await fetch("/api/agent3-6-research-loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          research_task: ctx.research_task,
          domain_manual: ctx.domain_manual,
          research_hygiene: ctx.research_hygiene,
          max_iterations: maxIt,
          ...(seedLog.value?.length ? { research_log: seedLog.value } : {}),
          ...(minParsed.value !== undefined ? { min_confidence: minParsed.value } : {}),
        }),
      });
      const data = (await res.json()) as Agent36ResearchLoopResponse | { error?: string };
      if (!res.ok) {
        setLoopError(typeof data === "object" && data && "error" in data ? String(data.error) : `HTTP ${res.status}`);
        setLoopTrace(null);
        return;
      }
      const loop = data as Agent36ResearchLoopResponse;
      setLoopTrace(loop);
      const logJson = JSON.stringify(loop.research_log ?? [], null, 2);
      setU3LoopResearchLogText(logJson);
      setU3ResearchLogText(logJson);
      const lastRound = loop.iteration_trace[loop.iteration_trace.length - 1];
      if (lastRound) {
        setPlanOutputText(JSON.stringify(lastRound.agent3_plan, null, 2));
        setA6OutputText(JSON.stringify(lastRound.agent6_result, null, 2));
        setA6AssignmentText(JSON.stringify(lastRound.agent3_plan.agent6_assignment, null, 2));
        setRevAgent6InputText(JSON.stringify(lastRound.agent6_result, null, 2));
        setRevOutputText(JSON.stringify(lastRound.agent3_review, null, 2));
        setPlanResearchLogText(logJson);
      }
    } catch (e) {
      setLoopError(e instanceof Error ? e.message : "Loop request failed");
    } finally {
      setBusyLoop(false);
    }
  }

  const panelInputClass =
    "w-full resize-y rounded-md border p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50";

  return (
    <div className="shrink-0 space-y-8 border-b border-zinc-200 pb-8">
      <header>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Phase 2 — Unified Agent 3 API · Plan · Agent 6 · Review
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Orchestration order: <strong className="font-medium text-zinc-700">Agent 7</strong> assigns a{" "}
          <code className="rounded bg-zinc-100 px-1">research_task</code>.{" "}
          <strong className="font-medium text-zinc-700">Agent 3</strong> (unified) plans, then after{" "}
          <strong className="font-medium text-zinc-700">Agent 6</strong> (search + extract) returns review + next
          assignment. POST <code className="rounded bg-zinc-100 px-1">/api/agent3-phase2</code> for a single pass; loop
          API maintains <code className="rounded bg-zinc-100 px-1">research_log</code>.
        </p>

        <div className="mt-3 flex flex-wrap items-start justify-end gap-2 rounded-md border border-zinc-200 bg-zinc-50/80 text-xs text-zinc-900">
          <details className="min-w-0 flex-1">
            <summary className="cursor-pointer select-none px-3 py-2 font-medium text-zinc-800">
              Cheatsheet · Agent 3 unified Phase 2
            </summary>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-zinc-100 bg-white px-3 py-2 font-mono text-[11px] text-zinc-800">
              {AGENT3_PHASE2_UNIFIED_CHEATSHEET}
            </pre>
          </details>
          <div className="shrink-0 p-1.5">
            <CopyOutputButton
              text={AGENT3_PHASE2_UNIFIED_CHEATSHEET}
              label="Copy"
              className="!bg-zinc-800 hover:!bg-zinc-900 disabled:hover:!bg-zinc-800"
            />
          </div>
        </div>
      </header>

      {/* —— Agent 3 UNIFIED API —— */}
      <section
        aria-labelledby="a3-unified-p2-heading"
        className="space-y-2 rounded-lg border border-teal-200 bg-teal-50/50 p-4 shadow-sm"
      >
        <h3 id="a3-unified-p2-heading" className="text-sm font-semibold text-teal-950">
          Agent 3 · Unified — <code className="rounded bg-teal-100 px-1 text-xs font-normal">POST /api/agent3-phase2</code>
        </h3>
        <p className="text-[11px] text-teal-900/90">
          One call: <strong>plan only</strong> if <code className="text-[10px]">agent6_result</code> is empty;{" "}
          <strong>plan + review + next assignment</strong> if you paste Agent 6 output. Optional{" "}
          <code className="text-[10px]">research_log</code> (JSON array, newest last) is sent as-is to the model.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-teal-600 bg-white px-3 py-1.5 text-xs font-medium text-teal-900 hover:bg-teal-50 disabled:opacity-50"
            disabled={disabledU3}
            onClick={syncUnifiedFromPlanPanel}
          >
            Sync context from §1 (task, domain, hygiene, hint, research_log)
          </button>
          <button
            type="button"
            className="rounded-md border border-teal-600 bg-white px-3 py-1.5 text-xs font-medium text-teal-900 hover:bg-teal-50 disabled:opacity-50"
            disabled={disabledU3 || !a6OutputText.trim()}
            onClick={() => setU3Agent6Text(a6OutputText)}
          >
            Paste §2 Agent 6 output → agent6_result
          </button>
        </div>

        <label className="block text-xs font-medium text-teal-900" htmlFor="p2-u3-task">
          research_task (JSON) — required
        </label>
        <textarea
          id="p2-u3-task"
          className={`${panelInputClass} min-h-[140px] border-teal-200 bg-white`}
          value={u3TaskText}
          disabled={disabledU3}
          onChange={(e) => setU3TaskText(e.target.value)}
          spellCheck={false}
        />

        <label className="block text-xs font-medium text-teal-900" htmlFor="p2-u3-domain">
          domain_manual (JSON) — optional
        </label>
        <textarea
          id="p2-u3-domain"
          className={`${panelInputClass} min-h-[56px] border-teal-200 bg-white`}
          placeholder="{}"
          value={u3DomainText}
          disabled={disabledU3}
          onChange={(e) => setU3DomainText(e.target.value)}
          spellCheck={false}
        />

        <label className="block text-xs font-medium text-teal-900" htmlFor="p2-u3-hygiene">
          research_hygiene (JSON) — optional
        </label>
        <textarea
          id="p2-u3-hygiene"
          className={`${panelInputClass} min-h-[56px] border-teal-200 bg-white`}
          placeholder="{}"
          value={u3HygieneText}
          disabled={disabledU3}
          onChange={(e) => setU3HygieneText(e.target.value)}
          spellCheck={false}
        />

        <label className="block text-xs font-medium text-teal-900" htmlFor="p2-u3-a6">
          agent6_result (JSON) — optional; leave empty for planning-only
        </label>
        <textarea
          id="p2-u3-a6"
          className={`${panelInputClass} min-h-[120px] border-teal-200 bg-white`}
          placeholder='queries_used, source_urls, extracted_key_data, parallel_search_id? — paste Agent 6 response'
          value={u3Agent6Text}
          disabled={disabledU3}
          onChange={(e) => setU3Agent6Text(e.target.value)}
          spellCheck={false}
        />

        <label className="block text-xs font-medium text-teal-900" htmlFor="p2-u3-log">
          research_log (JSON array) — optional; per-iteration memory, newest last
        </label>
        <textarea
          id="p2-u3-log"
          className={`${panelInputClass} min-h-[72px] border-teal-200 bg-white`}
          placeholder='[ ] or [ { "iteration": 1, "queries": [...], "a6_raw_findings": {...}, "scan": {...}, ... }, ... ]'
          value={u3ResearchLogText}
          disabled={disabledU3}
          onChange={(e) => setU3ResearchLogText(e.target.value)}
          spellCheck={false}
        />

        <label className="block text-xs font-medium text-teal-900" htmlFor="p2-u3-hint">
          iteration_hint — optional
        </label>
        <input
          id="p2-u3-hint"
          type="text"
          className={`${panelInputClass} min-h-0 border-teal-200 bg-white py-2`}
          placeholder='e.g. "Planning round 2 of 3"'
          value={u3HintText}
          disabled={disabledU3}
          onChange={(e) => setU3HintText(e.target.value)}
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-teal-800 bg-teal-900 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
            disabled={disabledU3}
            onClick={() => void runUnifiedPhase2()}
          >
            {busyU3 ? "Running…" : "Run unified Agent 3"}
          </button>
          <button
            type="button"
            className="rounded-md border border-teal-600 bg-white px-3 py-2 text-sm font-medium text-teal-950 hover:bg-teal-50 disabled:opacity-50"
            disabled={disabledU3 || !u3OutputText.trim()}
            onClick={applyAssignmentFromUnifiedOutput}
          >
            Copy response → Agent 6 assignment
          </button>
        </div>

        {u3Error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {u3Error}
          </p>
        ) : null}

        <div className="space-y-2 border-t border-teal-200/80 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-medium text-teal-900" htmlFor="p2-u3-out">
              Response (JSON) — full Agent3Phase2Response after review; plan-only omits deep review fields
            </label>
            <CopyOutputButton text={u3OutputText} label="Copy" disabled={!u3OutputText.trim()} />
          </div>
          <textarea
            id="p2-u3-out"
            className={`${panelInputClass} min-h-[180px] border-teal-300 bg-white`}
            placeholder="Run to populate."
            value={u3OutputText}
            disabled={disabledU3}
            onChange={(e) => setU3OutputText(e.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="space-y-2 border-t border-teal-200/80 pt-3">
          <p className="text-xs font-medium text-teal-900">
            Full iteration (Agent 3 plan → Agent 6 → Agent 3 review, repeat)
          </p>
          <p className="text-[11px] text-teal-900/85">
            Uses this section’s <code className="text-[10px]">research_task</code>,{" "}
            <code className="text-[10px]">domain_manual</code>, and <code className="text-[10px]">research_hygiene</code>{" "}
            above. Optional seed <code className="text-[10px]">research_log</code> below is sent on the first iteration.
            Stops when the model sets <code className="text-[10px]">needs_further_search: false</code>, when review{" "}
            <code className="text-[10px]">confidence.score</code> (0–1) meets your minimum, or at max iterations. On
            success, the last round is copied into the §1 plan, Agent 6, and review panels below; the accumulated{" "}
            <code className="text-[10px]">research_log</code> is written back into the seed field and the unified{" "}
            <code className="text-[10px]">research_log</code> textarea.
          </p>
          <label className="block text-[11px] font-medium text-teal-900" htmlFor="p2-u3-loop-seed-log">
            research_log seed (optional JSON array)
          </label>
          <textarea
            id="p2-u3-loop-seed-log"
            className={`${panelInputClass} min-h-[48px] border-teal-200 bg-white`}
            placeholder="[] — or paste prior research_log to continue memory"
            value={u3LoopResearchLogText}
            disabled={disabledLoop}
            onChange={(e) => setU3LoopResearchLogText(e.target.value)}
            spellCheck={false}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-teal-900" htmlFor="p2-u3-loop-min-conf">
                Minimum confidence (0–1, or 1–100 for %)
              </label>
              <input
                id="p2-u3-loop-min-conf"
                type="text"
                inputMode="decimal"
                className="w-40 rounded-md border border-teal-200 bg-white px-2 py-2 text-sm disabled:opacity-50"
                placeholder="e.g. 0.75 or 75 (optional)"
                value={minLoopConfidenceText}
                disabled={disabledLoop}
                onChange={(e) => setMinLoopConfidenceText(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-teal-900" htmlFor="p2-u3-loop-max-it">
                Max iterations
              </label>
              <input
                id="p2-u3-loop-max-it"
                type="number"
                min={1}
                max={HARD_CAP_AGENT36_ITERATIONS}
                className="w-20 rounded-md border border-teal-200 bg-white px-2 py-2 text-sm disabled:opacity-50"
                value={maxLoopIterations}
                disabled={disabledLoop}
                onChange={(e) => setMaxLoopIterations(e.target.value)}
                aria-label="Max loop iterations"
              />
            </div>
            <button
              type="button"
              className="rounded-md border border-teal-600 bg-teal-100 px-3 py-2 text-sm font-medium text-teal-950 hover:bg-teal-200 disabled:opacity-50 sm:mb-0.5"
              disabled={disabledLoop}
              onClick={() => void runLoop()}
            >
              {busyLoop ? "Running iteration…" : "Run full iteration"}
            </button>
          </div>
          {loopError ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {loopError}
            </p>
          ) : null}
          {loopTrace ? (
            <div className="rounded-md border border-teal-300 bg-white/90 p-3 text-xs text-zinc-800">
              <div className="font-semibold text-teal-900">
                {loopTrace.iterations} round(s) · {loopTrace.stopped_reason}
                {typeof loopTrace.final_agent3_result.confidence?.score === "number"
                  ? ` · final confidence ${loopTrace.final_agent3_result.confidence.score.toFixed(3)}`
                  : null}
              </div>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[10px]">
                {JSON.stringify(
                  loopTrace.iteration_trace.map((t) => ({
                    plan_summary: t.agent3_plan.plan_summary,
                    queries: t.agent6_result.queries_used,
                    sources: t.agent6_result.source_urls.length,
                    needs_further: t.agent3_review.needs_further_search,
                    confidence: t.agent3_review.confidence?.score,
                  })),
                  null,
                  2,
                )}
              </pre>
            </div>
          ) : null}
          {loopTrace && compiledRunJson ? (
            <div className="space-y-2 border-t border-teal-200/80 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-teal-900">
                  Compiled run JSON (<code className="text-[10px]">agent_3_iter_*</code> unified plan + post–Agent 6
                  fields, <code className="text-[10px]">agent_6_iter_*</code>,{" "}
                  <code className="text-[10px]">research_log</code>, <code className="text-[10px]">__run</code>)
                </p>
                <CopyOutputButton
                  text={compiledRunJson}
                  label="Copy compiled JSON"
                  className="!bg-teal-800 hover:!bg-teal-900"
                />
              </div>
              <textarea
                className="w-full resize-y rounded-md border border-teal-200 bg-zinc-950/5 p-3 font-mono text-[10px] text-zinc-800 outline-none"
                readOnly
                rows={12}
                value={compiledRunJson}
                spellCheck={false}
                aria-label="Compiled iteration JSON"
              />
            </div>
          ) : null}
        </div>
      </section>

      {/* —— Agent 3 PLAN —— */}
      <section
        aria-labelledby="a3-plan-p2-heading"
        className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/50 p-4 shadow-sm"
      >
        <h3 id="a3-plan-p2-heading" className="text-sm font-semibold text-violet-950">
          1 — Agent 3 · Plan (after Agent 7)
        </h3>

        <div className="flex flex-wrap items-start justify-end gap-2 rounded-md border border-violet-200/80 bg-white/80 text-xs text-violet-950">
          <details className="min-w-0 flex-1">
            <summary className="cursor-pointer select-none px-3 py-2 font-medium text-violet-900">
              Cheatsheet · Agent 3 plan
            </summary>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-violet-100 bg-white px-3 py-2 font-mono text-[11px] text-zinc-800">
              {AGENT3_PLAN_PHASE2_CHEATSHEET}
            </pre>
          </details>
          <div className="shrink-0 p-1.5">
            <CopyOutputButton
              text={AGENT3_PLAN_PHASE2_CHEATSHEET}
              label="Copy cheatsheet"
              className="!bg-violet-700 hover:!bg-violet-800 disabled:hover:!bg-violet-700"
            />
          </div>
        </div>

        <label className="block text-xs font-medium text-violet-900" htmlFor="p2-plan-task">
          research_task (JSON)
        </label>
        <textarea
          id="p2-plan-task"
          className={`${panelInputClass} min-h-[160px] border-violet-200 bg-white`}
          value={planTaskText}
          disabled={disabledPlan}
          onChange={(e) => setPlanTaskText(e.target.value)}
          spellCheck={false}
        />

        <label className="block text-xs font-medium text-violet-900" htmlFor="p2-plan-domain">
          domain_manual (JSON)
        </label>
        <textarea
          id="p2-plan-domain"
          className={`${panelInputClass} min-h-[56px] border-violet-200 bg-white`}
          placeholder="{}"
          value={planDomainText}
          disabled={disabledPlan}
          onChange={(e) => setPlanDomainText(e.target.value)}
          spellCheck={false}
        />

        <label className="block text-xs font-medium text-violet-900" htmlFor="p2-plan-hygiene">
          research_hygiene (JSON)
        </label>
        <textarea
          id="p2-plan-hygiene"
          className={`${panelInputClass} min-h-[56px] border-violet-200 bg-white`}
          placeholder="{}"
          value={planHygieneText}
          disabled={disabledPlan}
          onChange={(e) => setPlanHygieneText(e.target.value)}
          spellCheck={false}
        />

        <label className="block text-xs font-medium text-violet-900" htmlFor="p2-plan-prior">
          prior_rounds (optional JSON array — re-plan only; legacy)
        </label>
        <textarea
          id="p2-plan-prior"
          className={`${panelInputClass} min-h-[48px] border-violet-200 bg-white`}
          placeholder='Leave empty, or paste [{ "agent3_plan": {...}, "agent6_result": {...}, "agent3_review": {...} }, ...]'
          value={planPriorRoundsText}
          disabled={disabledPlan}
          onChange={(e) => setPlanPriorRoundsText(e.target.value)}
          spellCheck={false}
        />

        <label className="block text-xs font-medium text-violet-900" htmlFor="p2-plan-log">
          research_log (optional JSON array — preferred memory; newest last)
        </label>
        <textarea
          id="p2-plan-log"
          className={`${panelInputClass} min-h-[56px] border-violet-200 bg-white`}
          placeholder="Leave empty, or paste full research_log from a prior run / unified panel"
          value={planResearchLogText}
          disabled={disabledPlan}
          onChange={(e) => setPlanResearchLogText(e.target.value)}
          spellCheck={false}
        />

        <label className="block text-xs font-medium text-violet-900" htmlFor="p2-plan-hint">
          iteration_hint (optional)
        </label>
        <input
          id="p2-plan-hint"
          type="text"
          className={`${panelInputClass} min-h-0 border-violet-200 bg-white py-2`}
          value={planHintText}
          disabled={disabledPlan}
          onChange={(e) => setPlanHintText(e.target.value)}
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-violet-800 bg-violet-900 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50"
            disabled={disabledPlan}
            onClick={() => void runPlan()}
          >
            {busyPlan ? "Planning…" : "Run Agent 3 plan"}
          </button>
          <button
            type="button"
            className="rounded-md border border-violet-300 bg-white px-3 py-2 text-sm font-medium text-violet-900 hover:bg-violet-50 disabled:opacity-50"
            disabled={disabledPlan || !planOutputText.trim()}
            onClick={applyAssignmentFromPlanOutput}
          >
            Copy plan → Agent 6 assignment
          </button>
        </div>

        {planError ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {planError}
          </p>
        ) : null}

        <div className="space-y-2 border-t border-violet-200/80 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-medium text-violet-900" htmlFor="p2-plan-out">
              Plan output (JSON)
            </label>
            <CopyOutputButton text={planOutputText} label="Copy" disabled={!planOutputText.trim()} />
          </div>
          <textarea
            id="p2-plan-out"
            className={`${panelInputClass} min-h-[140px] border-violet-300 bg-white`}
            placeholder="Run plan to populate."
            value={planOutputText}
            disabled={disabledPlan}
            onChange={(e) => setPlanOutputText(e.target.value)}
            spellCheck={false}
          />
        </div>
      </section>

      {/* —— Agent 6 —— */}
      <section
        id="agent6-p2-section"
        aria-labelledby="a6-p2-heading"
        className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/40 p-4 shadow-sm"
      >
        <h3 id="a6-p2-heading" className="text-sm font-semibold text-sky-950">
          2 — Agent 6 · Execute
        </h3>

        <div className="flex flex-wrap items-start justify-end gap-2 rounded-md border border-sky-200/80 bg-white/70 text-xs text-sky-950">
          <details className="min-w-0 flex-1">
            <summary className="cursor-pointer select-none px-3 py-2 font-medium text-sky-900">
              Cheatsheet · Agent 6
            </summary>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-sky-100 bg-white px-3 py-2 font-mono text-[11px] text-zinc-800">
              {AGENT6_PHASE2_SPEC_CHEATSHEET}
            </pre>
          </details>
          <div className="shrink-0 p-1.5">
            <CopyOutputButton
              text={AGENT6_PHASE2_SPEC_CHEATSHEET}
              label="Copy cheatsheet"
              className="!bg-sky-700 hover:!bg-sky-800 disabled:hover:!bg-sky-700"
            />
          </div>
        </div>

        <label className="block text-xs font-medium text-sky-900" htmlFor="p2-a6-task">
          research_task (JSON)
        </label>
        <textarea
          id="p2-a6-task"
          className={`${panelInputClass} min-h-[140px] border-sky-200 bg-white`}
          value={a6TaskText}
          disabled={disabledA6}
          onChange={(e) => setA6TaskText(e.target.value)}
          spellCheck={false}
        />

        <label className="block text-xs font-medium text-sky-900" htmlFor="p2-a6-domain">
          domain_manual (JSON)
        </label>
        <textarea
          id="p2-a6-domain"
          className={`${panelInputClass} min-h-[56px] border-sky-200 bg-white`}
          placeholder="{}"
          value={a6DomainText}
          disabled={disabledA6}
          onChange={(e) => setA6DomainText(e.target.value)}
          spellCheck={false}
        />

        <label className="block text-xs font-medium text-sky-900" htmlFor="p2-a6-hygiene">
          research_hygiene (JSON)
        </label>
        <textarea
          id="p2-a6-hygiene"
          className={`${panelInputClass} min-h-[56px] border-sky-200 bg-white`}
          placeholder="{}"
          value={a6HygieneText}
          disabled={disabledA6}
          onChange={(e) => setA6HygieneText(e.target.value)}
          spellCheck={false}
        />

        <label className="block text-xs font-medium text-sky-900" htmlFor="p2-a6-assign">
          agent3_assignment (JSON — from Agent 3 plan)
        </label>
        <textarea
          id="p2-a6-assign"
          className={`${panelInputClass} min-h-[120px] border-sky-200 bg-white`}
          placeholder="Inner agent6_assignment only, or full plan JSON (plan_summary + agent6_assignment) — both accepted"
          value={a6AssignmentText}
          disabled={disabledA6}
          onChange={(e) => setA6AssignmentText(e.target.value)}
          spellCheck={false}
        />

        <label className="block text-xs font-medium text-sky-900" htmlFor="p2-a6-itere">
          iteration_extension (optional JSON)
        </label>
        <textarea
          id="p2-a6-itere"
          className={`${panelInputClass} min-h-[40px] border-sky-200 bg-white`}
          placeholder="{}"
          value={a6IterExtText}
          disabled={disabledA6}
          onChange={(e) => setA6IterExtText(e.target.value)}
          spellCheck={false}
        />

        <button
          type="button"
          className="rounded-md border border-sky-800 bg-sky-900 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
          disabled={disabledA6}
          onClick={() => void runAgent6()}
        >
          {busyA6 ? "Running…" : "Run Agent 6"}
        </button>

        {a6Error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {a6Error}
          </p>
        ) : null}

        <div className="space-y-2 border-t border-sky-200/80 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-medium text-sky-900" htmlFor="p2-a6-out">
              Agent 6 output (JSON)
            </label>
            <div className="flex gap-2">
              <CopyOutputButton text={a6OutputText} label="Copy" disabled={!a6OutputText.trim()} />
              <button
                type="button"
                className="rounded-md border border-sky-300 bg-white px-2 py-1 text-[11px] font-medium text-sky-900 hover:bg-sky-50 disabled:opacity-50"
                disabled={disabledRev || !a6OutputText.trim()}
                onClick={() => setRevAgent6InputText(a6OutputText)}
              >
                Copy → Agent 3 review input
              </button>
            </div>
          </div>
          <textarea
            id="p2-a6-out"
            className={`${panelInputClass} min-h-[160px] border-sky-300 bg-white`}
            value={a6OutputText}
            disabled={disabledA6}
            onChange={(e) => setA6OutputText(e.target.value)}
            spellCheck={false}
          />
        </div>
      </section>

      {/* —— Agent 3 REVIEW —— */}
      <section
        aria-labelledby="a3-rev-p2-heading"
        className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-4 shadow-sm"
      >
        <h3 id="a3-rev-p2-heading" className="text-sm font-semibold text-amber-950">
          3 — Agent 3 · Review (after Agent 6)
        </h3>

        <div className="flex flex-wrap items-start justify-end gap-2 rounded-md border border-amber-200/80 bg-white/70 text-xs text-amber-950">
          <details className="min-w-0 flex-1">
            <summary className="cursor-pointer select-none px-3 py-2 font-medium text-amber-900">
              Cheatsheet · Agent 3 review
            </summary>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-amber-100 bg-white px-3 py-2 font-mono text-[11px] text-zinc-800">
              {AGENT3_REVIEW_PHASE2_CHEATSHEET}
            </pre>
          </details>
          <div className="shrink-0 p-1.5">
            <CopyOutputButton
              text={AGENT3_REVIEW_PHASE2_CHEATSHEET}
              label="Copy cheatsheet"
              className="!bg-amber-800 hover:!bg-amber-900 disabled:hover:!bg-amber-800"
            />
          </div>
        </div>

        <label className="block text-xs font-medium text-amber-900" htmlFor="p2-rev-task">
          research_task (JSON)
        </label>
        <textarea
          id="p2-rev-task"
          className={`${panelInputClass} min-h-[140px] border-amber-200 bg-white`}
          value={revTaskText}
          disabled={disabledRev}
          onChange={(e) => setRevTaskText(e.target.value)}
          spellCheck={false}
        />

        <label className="block text-xs font-medium text-amber-900" htmlFor="p2-rev-domain">
          domain_manual (JSON)
        </label>
        <textarea
          id="p2-rev-domain"
          className={`${panelInputClass} min-h-[56px] border-amber-200 bg-white`}
          placeholder="{}"
          value={revDomainText}
          disabled={disabledRev}
          onChange={(e) => setRevDomainText(e.target.value)}
          spellCheck={false}
        />

        <label className="block text-xs font-medium text-amber-900" htmlFor="p2-rev-hygiene">
          research_hygiene (JSON)
        </label>
        <textarea
          id="p2-rev-hygiene"
          className={`${panelInputClass} min-h-[56px] border-amber-200 bg-white`}
          placeholder="{}"
          value={revHygieneText}
          disabled={disabledRev}
          onChange={(e) => setRevHygieneText(e.target.value)}
          spellCheck={false}
        />

        <label className="block text-xs font-medium text-amber-900" htmlFor="p2-rev-a6">
          agent6_result (JSON input)
        </label>
        <textarea
          id="p2-rev-a6"
          className={`${panelInputClass} min-h-[160px] border-amber-200 bg-white`}
          placeholder="Paste Agent 6 output, or use Copy from Agent 6 panel."
          value={revAgent6InputText}
          disabled={disabledRev}
          onChange={(e) => setRevAgent6InputText(e.target.value)}
          spellCheck={false}
        />

        <label className="block text-xs font-medium text-amber-900" htmlFor="p2-rev-log">
          research_log (optional JSON array)
        </label>
        <textarea
          id="p2-rev-log"
          className={`${panelInputClass} min-h-[56px] border-amber-200 bg-white`}
          placeholder="Leave empty, or paste cumulative research_log (newest last)"
          value={revResearchLogText}
          disabled={disabledRev}
          onChange={(e) => setRevResearchLogText(e.target.value)}
          spellCheck={false}
        />

        <label className="block text-xs font-medium text-amber-900" htmlFor="p2-rev-hint">
          iteration_hint (optional)
        </label>
        <input
          id="p2-rev-hint"
          type="text"
          className={`${panelInputClass} min-h-0 border-amber-200 bg-white py-2`}
          value={revHintText}
          disabled={disabledRev}
          onChange={(e) => setRevHintText(e.target.value)}
        />

        <div className="space-y-2 rounded-md border border-amber-200/80 bg-amber-100/20 p-3">
          <p className="text-xs text-amber-950">
            <span className="font-medium">Import review JSON (optional)</span> — paste a full <strong>Agent3TaskResult</strong>{" "}
            (e.g. <code className="text-[11px]">sources_and_data</code>, <code className="text-[11px]">analysis_points</code>,{" "}
            <code className="text-[11px]">summary</code>, <code className="text-[11px]">confidence</code>, …) or wrap it in{" "}
            <code className="text-[11px]">{"{ \"agent_3_assignment\": { ... } }"}</code>,{" "}
            <code className="text-[11px]">agent3_review</code>, or <code className="text-[11px]">agent_3assignment</code>. Then
            apply to the output field below (no API call).
          </p>
          <label className="block text-xs font-medium text-amber-900" htmlFor="p2-rev-import">
            Paste (raw review or wrapped)
          </label>
          <textarea
            id="p2-rev-import"
            className={`${panelInputClass} min-h-[100px] border-amber-200 bg-white`}
            placeholder="{}"
            value={revImportText}
            disabled={disabledRev}
            onChange={(e) => setRevImportText(e.target.value)}
            spellCheck={false}
          />
          <button
            type="button"
            className="rounded-md border border-amber-600 bg-amber-100 px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-200 disabled:opacity-50"
            disabled={disabledRev || !revImportText.trim()}
            onClick={() => {
              setRevError(null);
              const p = parsePastedAgent3Review(revImportText);
              if (!p.ok) {
                setRevError(p.error);
                return;
              }
              setRevOutputText(JSON.stringify(p.value, null, 2));
            }}
          >
            Apply to review output
          </button>
        </div>

        <button
          type="button"
          className="rounded-md border border-amber-800 bg-amber-900 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
          disabled={disabledRev}
          onClick={() => void runReview()}
        >
          {busyRev ? "Running…" : "Run Agent 3 review"}
        </button>

        {revError ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {revError}
          </p>
        ) : null}

        <div className="space-y-2 border-t border-amber-200/80 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-medium text-amber-900" htmlFor="p2-rev-out">
              Review output (JSON)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-sky-500 bg-sky-100 px-3 py-1.5 text-xs font-medium text-sky-950 hover:bg-sky-200 disabled:opacity-50"
                disabled={disabledRev || !revOutputText.trim()}
                onClick={() => {
                  setRevError(null);
                  let parsed: unknown;
                  try {
                    parsed = JSON.parse(revOutputText.trim());
                  } catch {
                    setRevError("Review output is not valid JSON.");
                    return;
                  }
                  if (!isPlainObject(parsed)) {
                    setRevError("Review output must be a JSON object.");
                    return;
                  }
                  const built = buildAgent6FollowupFromReview(parsed);
                  if (!built.ok) {
                    setRevError(built.error);
                    return;
                  }
                  setA6AssignmentText(JSON.stringify(built.value, null, 2));
                  setA6IterExtText("");
                  setA6TaskText(revTaskText);
                  setA6DomainText(revDomainText);
                  setA6HygieneText(revHygieneText);
                  document.getElementById("agent6-p2-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                → Agent 6 (follow-up)
              </button>
              <CopyOutputButton text={revOutputText} label="Copy" disabled={!revOutputText.trim()} />
            </div>
          </div>
          <p className="text-[11px] text-amber-900/85">
            <strong>→ Agent 6</strong> builds <code className="text-[10px]">agent3_assignment</code> from{" "}
            <code className="text-[10px]">suggested_queries</code> (or <code className="text-[10px]">task_gaps</code> if
            needed), sets <code className="text-[10px]">search_objective</code> from <code className="text-[10px]">summary</code>,
            and copies this panel’s <code className="text-[10px]">research_task</code> / domain / hygiene to section 2.
          </p>
          <textarea
            id="p2-rev-out"
            className={`${panelInputClass} min-h-[200px] border-amber-300 bg-white`}
            placeholder='Run review to populate, or use "Import review JSON" above. Top-level fields: sources_and_data, analysis_points, summary, task_gaps, assumptions, confidence, needs_further_search, suggested_queries.'
            value={revOutputText}
            disabled={disabledRev}
            onChange={(e) => setRevOutputText(e.target.value)}
            spellCheck={false}
          />
        </div>
      </section>
    </div>
  );
}
