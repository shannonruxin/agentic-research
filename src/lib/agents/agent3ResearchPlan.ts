import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { agent7ResearchTaskSchema } from "@/lib/agents/agent7Orchestrate";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";
import type { Agent3ResearchPlan, Agent3TaskResult, Agent6ResearchRunResult, Agent7ResearchTask } from "@/lib/types";

/** LLM / validation failure for Agent 3 (Phase 2 planning). */
export class Agent3ResearchPlanError extends Error {
  override readonly name = "Agent3ResearchPlanError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const agent6AssignmentSchema = z.object({
  search_objective: z.string().min(1),
  search_queries: z.array(z.string().min(1)).min(1).max(14),
  extraction_notes: z.string().optional(),
});

/**
 * **API / prior_rounds** shape (nested). Bedrock is more reliable with a **flat** root for `generateObject` — use
 * {@link agent3PlanFlatOutputSchema} for the model, then map to this.
 */
export const agent3ResearchPlanSchema = z.object({
  plan_summary: z.string().min(1),
  agent6_assignment: agent6AssignmentSchema,
  open_questions: z.array(z.string()).optional(),
});

const trimmedNonEmpty = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length > 0, "Required");

/** Flat top-level object for `generateObject` (avoids nested-object JSON-schema issues on some Bedrock models). */
const agent3PlanFlatOutputSchema = z.object({
  plan_summary: trimmedNonEmpty,
  search_objective: trimmedNonEmpty,
  search_queries: z.preprocess(
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
  ),
  extraction_notes: z.string().optional(),
  open_questions: z.preprocess(
    (val) => {
      if (val === undefined || val === null) return undefined;
      if (Array.isArray(val)) return val.map((s) => String(s).trim()).filter(Boolean);
      return undefined;
    },
    z.array(z.string().min(1)).optional(),
  ),
});

function mapFlatPlanToResult(flat: z.infer<typeof agent3PlanFlatOutputSchema>): Agent3ResearchPlan {
  const oq = flat.open_questions?.length ? flat.open_questions : undefined;
  return {
    plan_summary: flat.plan_summary,
    agent6_assignment: {
      search_objective: flat.search_objective,
      search_queries: flat.search_queries,
      extraction_notes: flat.extraction_notes?.trim() || undefined,
    },
    open_questions: oq,
  };
}

const MAX_A6_QUERIES = 14;
const MAX_PLAN_OBJECTIVE_LEN = 6000;

/**
 * Re-planning sometimes repeats the first-pass queries. When the previous Agent 3
 * review lists `suggested_queries` (or `task_gaps` if empty), fold them to the
 * **front** of `search_queries`, update the objective, and add gap context to
 * `extraction_notes` so the next `runAgent6ResearchTask` uses the new direction.
 */
export function applyPriorReviewToAgent3Plan(
  plan: Agent3ResearchPlan,
  lastReview: Agent3TaskResult | undefined,
): Agent3ResearchPlan {
  if (!lastReview) {
    return plan;
  }

  const fromReview: string[] = [];
  for (const s of lastReview.suggested_queries ?? []) {
    const t = String(s).trim();
    if (t) {
      fromReview.push(t);
    }
  }
  if (fromReview.length === 0) {
    for (const g of lastReview.task_gaps ?? []) {
      const t = String(g).trim();
      if (t) {
        fromReview.push(t);
      }
    }
  }
  if (fromReview.length === 0) {
    return plan;
  }

  const fromPlan = plan.agent6_assignment.search_queries;
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const q of [...fromReview, ...fromPlan]) {
    const k = q.toLowerCase();
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    merged.push(q);
    if (merged.length >= MAX_A6_QUERIES) {
      break;
    }
  }

  const baseObj = plan.agent6_assignment.search_objective.trim();
  const hasFollowLabel = baseObj.includes("Follow-up from Agent 3 review");
  const followSnippet = fromReview.slice(0, 4).join("; ");
  const followLine = `Follow-up from Agent 3 review (prioritize): ${followSnippet}`;
  const nextObj = hasFollowLabel
    ? baseObj
    : `${baseObj}\n\n${followLine}`.slice(0, MAX_PLAN_OBJECTIVE_LEN);

  const gapBlock = lastReview.task_gaps?.map((g) => String(g).trim()).filter(Boolean) ?? [];
  const gapText = gapBlock.length
    ? `Prior review task_gaps: ${gapBlock.join(" | ").slice(0, 1500)}`
    : "";

  const priorNotes = plan.agent6_assignment.extraction_notes?.trim() ?? "";
  const mergedNotes = [priorNotes, gapText].filter(Boolean).join("\n\n").trim();

  return {
    ...plan,
    agent6_assignment: {
      ...plan.agent6_assignment,
      search_objective: nextObj,
      search_queries: merged,
      extraction_notes: mergedNotes || plan.agent6_assignment.extraction_notes,
    },
  };
}

function formatPlanGenerationFailure(e: NoObjectGeneratedError): string {
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

export type Agent36PriorRound = {
  agent3_plan: Agent3ResearchPlan;
  agent6_result: Agent6ResearchRunResult;
  agent3_review: Agent3TaskResult;
};

const AGENT3_PLAN_SYSTEM = `You are Agent 3 — Phase 2 research **planner** (no web search).

Agent 7 has assigned a research_task (from the orchestrator). Your job is to **plan** the first investigative pass and **assign** concrete work to Agent 6 (the only component that may call web search in this pipeline).

You do NOT see live web results in this step. Reason from the research_task, domain_manual, and research_hygiene only.

Output rules:
- plan_summary: short internal rationale for what Agent 6 should do this round.
- agent6_assignment.search_objective: a single clear beta.search objective (what we need to find or verify).
- agent6_assignment.search_queries: 1–14 distinct, concrete query strings Agent 6 should run (not placeholders).
- agent6_assignment.extraction_notes: optional — remind extraction to map snippets to variables_to_find and citation norms.
- open_questions: optional list of uncertainty strings to track (omit or use [] if none).

**JSON shape (flat, required):** The model must return a single JSON object with these top-level string/array fields (not nested under agent6_assignment):
- plan_summary
- search_objective
- search_queries  (array of 1-14 non-empty strings; NOT a single comma-separated string)
- extraction_notes (optional)
- open_questions (optional array of strings)

If prior_rounds are provided, you are **re-planning**:
- The **LATEST** review is the last object under prior_rounds (newest last). That review's **suggested_queries** and **task_gaps** are the primary inputs for the NEW search pass — you MUST reflect them in **search_objective** and **search_queries** (rephrase for search engines if needed, but do not drop them in favor of repeating earlier queries).
- Read each prior plan, Agent 6 result, and Agent 3 review for context. Do not repeat failed queries blindly; refine or broaden strategically.`;

function buildPlanUserMessage(input: {
  research_task: Agent7ResearchTask;
  domain_manual?: Record<string, unknown>;
  research_hygiene?: Record<string, unknown>;
  prior_rounds?: Agent36PriorRound[];
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
  if (input.prior_rounds?.length) {
    const latest = input.prior_rounds[input.prior_rounds.length - 1]!;
    parts.push(
      "",
      "LATEST_REVIEW (highest priority for the NEW search_queries and search_objective — do not ignore):",
      "suggested_queries:",
      JSON.stringify(latest.agent3_review.suggested_queries ?? []),
      "task_gaps:",
      JSON.stringify(latest.agent3_review.task_gaps ?? []),
      "needs_further_search:",
      String(latest.agent3_review.needs_further_search),
      "",
      "prior_rounds (newest last):",
    );
    input.prior_rounds.forEach((r, i) => {
      parts.push(
        `--- round ${i + 1} ---`,
        "plan:",
        JSON.stringify(r.agent3_plan, null, 2),
        "agent6_result:",
        JSON.stringify(r.agent6_result, null, 2),
        "agent3_review:",
        JSON.stringify(r.agent3_review, null, 2),
      );
    });
  }
  parts.push(
    "",
    "Return ONE JSON object with top-level keys: plan_summary, search_objective, search_queries (string array), optional extraction_notes, optional open_questions (string array).",
  );
  return parts.join("\n");
}

/**
 * Agent 3 Phase 2 — **plan** step: produce **`agent6_assignment`** before any search.
 */
export async function generateAgent3ResearchPlan(input: {
  research_task: Agent7ResearchTask;
  domain_manual?: Record<string, unknown>;
  research_hygiene?: Record<string, unknown>;
  prior_rounds?: Agent36PriorRound[];
  iteration_hint?: string;
}): Promise<Agent3ResearchPlan> {
  const taskParse = agent7ResearchTaskSchema.safeParse(input.research_task);
  if (!taskParse.success) {
    throw new Agent3ResearchPlanError(taskParse.error.issues[0]?.message ?? "Invalid research_task");
  }

  try {
    const model = createBedrockLanguageModel();
    const { object } = await generateObject({
      model,
      schema: agent3PlanFlatOutputSchema,
      schemaName: "Agent3ResearchPlan",
      schemaDescription:
        "Agent 3 plan: plan_summary, search_objective, search_queries (1-14 items), optional extraction_notes, open_questions",
      system: AGENT3_PLAN_SYSTEM,
      prompt: buildPlanUserMessage({
        research_task: taskParse.data,
        domain_manual: input.domain_manual,
        research_hygiene: input.research_hygiene,
        prior_rounds: input.prior_rounds,
        iteration_hint: input.iteration_hint,
      }),
      maxRetries: 2,
      temperature: 0.2,
      maxOutputTokens: 4096,
    });
    return mapFlatPlanToResult(object);
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) {
      throw new Agent3ResearchPlanError(
        `Agent 3 plan: structured output failed. ${formatPlanGenerationFailure(e)}`,
        { cause: e },
      );
    }
    if (e instanceof Agent3ResearchPlanError) {
      throw e;
    }
    const msg = e instanceof Error ? e.message : "Agent 3 research plan failed";
    throw new Agent3ResearchPlanError(msg, e instanceof Error ? { cause: e } : undefined);
  }
}
