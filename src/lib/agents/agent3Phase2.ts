import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { agent7ResearchTaskSchema } from "@/lib/agents/agent7Orchestrate";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";
import type {
  Agent3Phase2Response,
  Agent3ResearchDecision,
  Agent3ResearchLogEntry,
  Agent3ResearchPlan,
  Agent3TaskResult,
  Agent36PriorRound,
  Agent6ResearchRunResult,
  Agent7ResearchTask,
} from "@/lib/types";

export class Agent3Phase2Error extends Error {
  override readonly name = "Agent3Phase2Error";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const trimmedNonEmpty = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length > 0, "Required");

const preprocessQueryArray = z.preprocess(
  (val) => {
    if (Array.isArray(val)) {
      return (val as unknown[]).map((s) => String(s).trim()).filter(Boolean);
    }
    if (typeof val === "string" && val.trim()) {
      return [val.trim()];
    }
    return val;
  },
  z.array(z.string().min(1)).min(1).max(14),
);

const openQuestionsPreprocess = z.preprocess(
  (val) => {
    if (val === undefined || val === null) return undefined;
    if (Array.isArray(val)) return val.map((s) => String(s).trim()).filter(Boolean);
    return undefined;
  },
  z.array(z.string().min(1)).optional(),
);

const agent3PlanOnlyFlatSchema = z.object({
  plan_summary: trimmedNonEmpty,
  search_objective: trimmedNonEmpty,
  search_queries: preprocessQueryArray,
  extraction_notes: z.string().optional(),
  open_questions: openQuestionsPreprocess,
});

const assumptionItemSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["data_backed", "benchmark_based", "speculative"]),
  justification: z.string().optional(),
  source: z.string().optional(),
  risk_level: z.enum(["low", "medium", "high"]),
});

const agent3TaskConfidenceSchema = z.object({
  score: z.number().min(0).max(1),
  breakdown: z.object({
    data_quality: z.number().min(0).max(1),
    source_agreement: z.number().min(0).max(1),
    assumption_strength: z.number().min(0).max(1),
    method_fit: z.number().min(0).max(1),
    coverage_completeness: z.number().min(0).max(1),
  }),
  reasoning: z.array(z.string().min(1)).min(1),
});

const entityTrackingObjectSchema = z.object({
  total_entities: z.number().int().min(0),
  new_entities: z.array(z.string()).max(80),
  repeated_entities: z.array(z.string()).max(80),
  high_relevance_entities: z.array(z.string()).max(40),
  high_rabbithole_entities: z.array(z.string()).max(20),
});

const agent3Phase2FullFlatSchema = z.object({
  plan_summary: trimmedNonEmpty,
  search_objective: trimmedNonEmpty,
  search_queries: preprocessQueryArray,
  extraction_notes: z.string().optional(),
  open_questions: openQuestionsPreprocess,
  sources_and_data: z.array(
    z.object({
      url: z.string().min(1),
      relevance: z.string().min(1),
      data_noted: z.string().min(1),
    }),
  ),
  analysis_points: z.array(z.string().min(1)).min(1).max(80),
  summary: trimmedNonEmpty,
  task_gaps: z.array(z.string()).max(50),
  assumptions: z.array(assumptionItemSchema).max(30),
  confidence: agent3TaskConfidenceSchema,
  progress_metrics: z.object({
    iterations_so_far: z.number().int().min(0),
    new_info_count: z.number().min(0),
    overlap_rate: z.number().min(0).max(1),
    cumulative_overlap_rate: z.number().min(0).max(1),
    source_novelty: z.number().min(0).max(1),
    trend: z.enum(["increasing", "stable", "declining"]),
  }),
  /** Models sometimes emit a JSON string; coerce, validate, else defaultEntityTracking(). */
  entity_tracking: z.preprocess(
    (val) => {
      let raw: unknown;
      if (val === null || val === undefined) {
        return defaultEntityTracking();
      }
      if (typeof val === "string") {
        const t = val.trim();
        if (!t) return defaultEntityTracking();
        try {
          raw = JSON.parse(t) as unknown;
        } catch {
          return defaultEntityTracking();
        }
      } else if (typeof val === "object" && !Array.isArray(val)) {
        raw = val;
      } else {
        return defaultEntityTracking();
      }
      const parsed = entityTrackingObjectSchema.safeParse(raw);
      return parsed.success ? parsed.data : defaultEntityTracking();
    },
    entityTrackingObjectSchema,
  ),
  needs_further_search: z.boolean().optional(),
  suggested_queries: z.array(z.string()).max(14).optional(),
  scan_observations: z.array(z.string()).max(60),
  scan_emerging_patterns: z.array(z.string()).max(40),
  iteration_insight: trimmedNonEmpty,
  decision_reason: trimmedNonEmpty,
  decision_suggested_direction: z.string().optional(),
});

type FullModelOut = z.infer<typeof agent3Phase2FullFlatSchema>;

function defaultProgress(iterationsSoFar: number) {
  return {
    iterations_so_far: iterationsSoFar,
    new_info_count: 0,
    overlap_rate: 0,
    cumulative_overlap_rate: 0,
    source_novelty: 0,
    trend: "stable" as const,
  };
}

function defaultEntityTracking() {
  return {
    total_entities: 0,
    new_entities: [] as string[],
    repeated_entities: [] as string[],
    high_relevance_entities: [] as string[],
    high_rabbithole_entities: [] as string[],
  };
}

function planOnlyToPhase2Response(flat: z.infer<typeof agent3PlanOnlyFlatSchema>): Agent3Phase2Response {
  const oq = flat.open_questions?.length ? flat.open_questions : undefined;
  return {
    plan_summary: flat.plan_summary,
    search_objective: flat.search_objective,
    search_queries: flat.search_queries,
    extraction_notes: flat.extraction_notes?.trim() || undefined,
    open_questions: oq,
    sources_and_data: [],
    analysis_points: ["Planning pass only — no Agent 6 execution yet; scan and deep analysis apply after the first search batch."],
    summary: "Initial search objective and query set produced. Awaiting Agent 6 (Parallel beta.search + extraction).",
    task_gaps: [],
    assumptions: [],
    confidence: {
      score: 0,
      breakdown: {
        data_quality: 0,
        source_agreement: 0,
        assumption_strength: 0,
        method_fit: 0,
        coverage_completeness: 0,
      },
      reasoning: ["No web evidence ingested in this pass."],
    },
    progress_metrics: defaultProgress(0),
    entity_tracking: defaultEntityTracking(),
  };
}

function fullFlatToPhase2Response(flat: FullModelOut): Agent3Phase2Response {
  const oq = flat.open_questions?.length ? flat.open_questions : undefined;
  const nf = flat.needs_further_search ?? false;
  const sq = flat.suggested_queries?.length ? flat.suggested_queries : undefined;
  const direction = flat.decision_suggested_direction?.trim() || undefined;
  return {
    plan_summary: flat.plan_summary,
    search_objective: flat.search_objective,
    search_queries: flat.search_queries,
    extraction_notes: flat.extraction_notes?.trim() || undefined,
    open_questions: oq,
    sources_and_data: flat.sources_and_data,
    analysis_points: flat.analysis_points,
    summary: flat.summary,
    task_gaps: flat.task_gaps,
    assumptions: flat.assumptions,
    confidence: flat.confidence,
    progress_metrics: flat.progress_metrics,
    entity_tracking: flat.entity_tracking,
    needs_further_search: flat.needs_further_search,
    suggested_queries: sq,
    scan: {
      observations: flat.scan_observations,
      emerging_patterns: flat.scan_emerging_patterns,
    },
    insight: flat.iteration_insight,
    decision: {
      needs_further_search: nf,
      reason: flat.decision_reason,
      suggested_direction: direction,
      suggested_queries: sq,
    },
  };
}

function sanitizeSources(result: Agent3Phase2Response, allowedUrls: Set<string>): Agent3Phase2Response {
  return {
    ...result,
    sources_and_data: result.sources_and_data.filter((s) => allowedUrls.has(s.url.trim())),
  };
}

function formatGenerationFailure(e: NoObjectGeneratedError): string {
  const bits: string[] = [e.message];
  if (e.cause !== undefined) {
    bits.push("cause: " + (e.cause instanceof Error ? e.cause.message : String(e.cause)));
  }
  if (e.text !== undefined && e.text.length > 0) {
    const t = e.text.length > 3000 ? `${e.text.slice(0, 3000)}…` : e.text;
    bits.push("model_output: " + t);
  }
  if (e.finishReason) {
    bits.push("finish_reason: " + e.finishReason);
  }
  return bits.join(" | ");
}

const AGENT3_PHASE2_PLAN_ONLY_SYSTEM = `You are Agent 3 — Phase 2 (unified planner + reviewer). This invocation is **planning only**: no Agent 6 results yet. Do not pretend you have web evidence.

Agent 7 assigned research_task. Plan the first investigative pass for Agent 6 (the only step that may call Parallel beta.search here).

Rules:
- plan_summary: why this pass is structured this way and what Agent 6 should achieve; if research_log is non-empty, reference its observations, patterns, gaps, progress, and past decisions.
- search_objective: one clear beta.search objective (what to find or verify this round).
- search_queries: 1–14 distinct, concrete strings; avoid repeating queries already in research_log; reflect deliberate strategy (broad early, pivot if stagnation signals in the log).
- extraction_notes (optional): map snippets to variables_to_find, norms, hygiene; structured extraction, atomic detail.
- open_questions (optional): uncertainties to track.

Return JSON with keys: plan_summary, search_objective, search_queries (array), optional extraction_notes, optional open_questions.`;

const AGENT3_PHASE2_FULL_SYSTEM = `You are Agent 3 — Phase 2 unified agent (plan + review). You do NOT run web search.

Primary structured signal: agent6_result.extracted_key_data (entity-level atomic fields). Do not collapse entities prematurely; extract patterns, comparisons, and differentiation across entities. Do not re-summarize into generic categories too early.

Treat research_log as primary memory: reason queries → observations → patterns → outcomes → insights across iterations.

Separation of passes (in one output):
- Scan: populate scan_observations and scan_emerging_patterns — identify entities, patterns, signals (light filtering).
- Analysis: analysis_points, task_gaps, assumptions, confidence — evaluation and gaps.

Progress (progress_metrics): compute honestly from research_log + this agent6_result when prior iterations exist — iteration count, new_info_count (new signals vs all prior, not entity count), overlap_rate (vs previous iteration), cumulative_overlap_rate (vs any prior), source_novelty (new URLs vs prior), trend from new_info_count trajectory.

Stagnation: high overlap or cumulative overlap, low source_novelty, declining new_info_count → set needs_further_search false unless a clear pivot exists; pivot search_objective and search_queries instead of similar queries.

needs_further_search: false when plateau / diminishing returns unless a concrete pivot strategy exists. When true, suggested_queries must be non-redundant, anchored to entities/patterns/gaps, with clear intent (explore | expand | reframe | deepen | validate).

Entity tracking: high_relevance_entities answer the research_task goal; high_rabbithole_entities are rare, high-signal directions that could unlock new search space.

Output (flat JSON keys):
- Plan: plan_summary, search_objective, search_queries (1–14 distinct strings), optional extraction_notes, optional open_questions
- Review: sources_and_data (only URLs from agent6_result.source_urls), analysis_points, summary, task_gaps, assumptions, confidence
- progress_metrics, entity_tracking
- needs_further_search (optional), suggested_queries (optional)
- scan_observations, scan_emerging_patterns — map to response.scan.observations / scan.emerging_patterns (research_log.scan; sources_and_data is top-level and copied into the log row server-side).
- iteration_insight — maps to response.insight (research_log.insight).
- decision_reason, optional decision_suggested_direction — together with needs_further_search and suggested_queries form response.decision (research_log.decision).

sources_and_data rows: url from source list, relevance, data_noted grounded in extracted_key_data.`;

function buildUserMessage(input: {
  research_task: Agent7ResearchTask;
  domain_manual?: Record<string, unknown>;
  research_hygiene?: Record<string, unknown>;
  agent6_result?: Agent6ResearchRunResult;
  research_log?: Agent3ResearchLogEntry[];
  iteration_hint?: string;
}): string {
  const parts: string[] = [
    input.iteration_hint ? `${input.iteration_hint}\n` : "",
    "research_task:",
    JSON.stringify(input.research_task, null, 2),
  ];
  if (input.domain_manual && Object.keys(input.domain_manual).length > 0) {
    parts.push("", "domain_manual:", JSON.stringify(input.domain_manual, null, 2));
  }
  if (input.research_hygiene && Object.keys(input.research_hygiene).length > 0) {
    parts.push("", "research_hygiene:", JSON.stringify(input.research_hygiene, null, 2));
  }
  if (input.research_log?.length) {
    parts.push("", "research_log (newest last — primary memory, do not ignore):", JSON.stringify(input.research_log, null, 2));
  }
  if (input.agent6_result) {
    parts.push("", "agent6_result (latest iteration):", JSON.stringify(input.agent6_result, null, 2));
  }
  if (!input.agent6_result) {
    parts.push(
      "",
      "This is the planning pass only (no agent6_result). Return plan fields only in JSON as specified in the system message.",
    );
  } else {
    parts.push(
      "",
      "Return the full unified JSON object as specified in the system message (plan + review + scan fields + progress + entity_tracking + decision fields).",
    );
  }
  return parts.join("\n");
}

/**
 * Convert legacy prior rounds to research_log (best-effort; missing log fields defaulted).
 */
export function priorRoundsToResearchLog(rounds: Agent36PriorRound[]): Agent3ResearchLogEntry[] {
  return rounds.map((r, idx) => {
    const review = r.agent3_review;
    const pm = review.progress_metrics ?? defaultProgress(idx + 1);
    return {
      iteration: idx + 1,
      queries: r.agent6_result.queries_used,
      a6_raw_findings: {
        queries_used: r.agent6_result.queries_used,
        source_urls: r.agent6_result.source_urls,
        extracted_key_data: r.agent6_result.extracted_key_data,
      },
      scan: {
        sources_and_data: review.sources_and_data,
        observations: review.scan?.observations ?? [],
        emerging_patterns: review.scan?.emerging_patterns ?? [],
      },
      analysis: {
        analysis_points: review.analysis_points,
        task_gaps: review.task_gaps,
        assumptions: review.assumptions,
        confidence: review.confidence,
      },
      progress: pm,
      decision:
        review.decision ??
        ({
          needs_further_search: review.needs_further_search ?? false,
          reason: "",
          suggested_direction: undefined,
          suggested_queries: review.suggested_queries,
        } satisfies Agent3ResearchDecision),
      insight: review.insight ?? "",
    };
  });
}

export function phase2ToResearchPlan(r: Agent3Phase2Response): Agent3ResearchPlan {
  const oq = r.open_questions?.length ? r.open_questions : undefined;
  return {
    plan_summary: r.plan_summary,
    agent6_assignment: {
      search_objective: r.search_objective,
      search_queries: r.search_queries,
      extraction_notes: r.extraction_notes,
    },
    open_questions: oq,
  };
}

export function phase2ToTaskResult(r: Agent3Phase2Response): Agent3TaskResult {
  return {
    sources_and_data: r.sources_and_data,
    analysis_points: r.analysis_points,
    summary: r.summary,
    task_gaps: r.task_gaps,
    assumptions: r.assumptions,
    confidence: r.confidence,
    needs_further_search: r.needs_further_search,
    suggested_queries: r.suggested_queries,
    progress_metrics: r.progress_metrics,
    entity_tracking: r.entity_tracking,
    scan: r.scan,
    insight: r.insight,
    decision: r.decision,
  };
}

export function buildResearchLogEntry(
  iteration: number,
  agent6: Agent6ResearchRunResult,
  r: Agent3Phase2Response,
): Agent3ResearchLogEntry {
  const dec: Agent3ResearchDecision =
    r.decision ??
    ({
      needs_further_search: r.needs_further_search ?? false,
      reason: "",
      suggested_direction: undefined,
      suggested_queries: r.suggested_queries,
    } satisfies Agent3ResearchDecision);
  return {
    iteration,
    queries: agent6.queries_used,
    a6_raw_findings: {
      queries_used: agent6.queries_used,
      source_urls: agent6.source_urls,
      extracted_key_data: agent6.extracted_key_data,
    },
    scan: {
      sources_and_data: r.sources_and_data,
      observations: r.scan?.observations ?? [],
      emerging_patterns: r.scan?.emerging_patterns ?? [],
    },
    analysis: {
      analysis_points: r.analysis_points,
      task_gaps: r.task_gaps,
      assumptions: r.assumptions,
      confidence: r.confidence,
    },
    progress: r.progress_metrics ?? defaultProgress(iteration),
    decision: dec,
    insight: r.insight ?? "",
  };
}

export { agent3PlanOnlyFlatSchema, agent3Phase2FullFlatSchema };

/**
 * Unified Agent 3 Phase 2: planning when **`agent6_result`** is absent; full plan + review when present.
 */
export async function generateAgent3Phase2(input: {
  research_task: Agent7ResearchTask;
  domain_manual?: Record<string, unknown>;
  research_hygiene?: Record<string, unknown>;
  agent6_result?: Agent6ResearchRunResult;
  research_log?: Agent3ResearchLogEntry[];
  iteration_hint?: string;
}): Promise<Agent3Phase2Response> {
  const taskParse = agent7ResearchTaskSchema.safeParse(input.research_task);
  if (!taskParse.success) {
    throw new Agent3Phase2Error(taskParse.error.issues[0]?.message ?? "Invalid research_task");
  }

  const prompt = buildUserMessage({
    research_task: taskParse.data,
    domain_manual: input.domain_manual,
    research_hygiene: input.research_hygiene,
    agent6_result: input.agent6_result,
    research_log: input.research_log,
    iteration_hint: input.iteration_hint,
  });

  try {
    const model = createBedrockLanguageModel();

    if (!input.agent6_result) {
      const { object } = await generateObject({
        model,
        schema: agent3PlanOnlyFlatSchema,
        schemaName: "Agent3Phase2Plan",
        schemaDescription: "Agent 3 planning only: plan_summary, search_objective, search_queries, optional notes",
        system: AGENT3_PHASE2_PLAN_ONLY_SYSTEM,
        prompt,
        maxRetries: 2,
        temperature: 0.2,
        maxOutputTokens: 4096,
      });
      return planOnlyToPhase2Response(object);
    }

    const { object } = await generateObject({
      model,
      schema: agent3Phase2FullFlatSchema,
      schemaName: "Agent3Phase2Unified",
      schemaDescription:
        "Agent 3 unified: plan fields, review fields, progress_metrics, entity_tracking, scan and decision fields",
      system: AGENT3_PHASE2_FULL_SYSTEM,
      prompt,
      maxRetries: 2,
      temperature: 0.2,
      maxOutputTokens: 8192,
    });

    const allowed = new Set(input.agent6_result.source_urls.map((u) => u.trim()));
    return sanitizeSources(fullFlatToPhase2Response(object), allowed);
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) {
      throw new Agent3Phase2Error(`Agent 3 Phase 2: structured output failed. ${formatGenerationFailure(e)}`, {
        cause: e,
      });
    }
    if (e instanceof Agent3Phase2Error) {
      throw e;
    }
    const msg = e instanceof Error ? e.message : "Agent 3 Phase 2 failed";
    throw new Agent3Phase2Error(msg, e instanceof Error ? { cause: e } : undefined);
  }
}
