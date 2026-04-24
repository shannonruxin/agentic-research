import { z } from "zod";
import type { Agent3ResearchPlan, Agent3TaskResult, Agent36PriorRound, Agent7ResearchTask } from "@/lib/types";
import {
  generateAgent3Phase2,
  Agent3Phase2Error,
  phase2ToResearchPlan,
  priorRoundsToResearchLog,
} from "@/lib/agents/agent3Phase2";

/** @deprecated Import from `@/lib/types` */
export type { Agent36PriorRound } from "@/lib/types";

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
 * **API / prior_rounds** shape (nested). The live planner uses {@link generateAgent3Phase2} with a flat schema internally.
 */
export const agent3ResearchPlanSchema = z.object({
  plan_summary: z.string().min(1),
  agent6_assignment: agent6AssignmentSchema,
  open_questions: z.array(z.string()).optional(),
});

const MAX_A6_QUERIES = 14;
const MAX_PLAN_OBJECTIVE_LEN = 6000;

/**
 * Re-planning sometimes repeats the first-pass queries. When the previous Agent 3
 * review lists `suggested_queries` (or `task_gaps` if empty), fold them to the
 * **front** of `search_queries`, update the objective, and add gap context to
 * `extraction_notes` so the next `runAgent6ResearchTask` uses the new direction.
 *
 * Used for legacy follow-ups; the unified Agent 3 normally encodes the next pass via **`research_log`**.
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

/**
 * Agent 3 Phase 2 — **plan** step: produce **`agent6_assignment`** before any search.
 * Uses unified Agent 3 with optional **`research_log`** / legacy **`prior_rounds`** (converted to a log).
 */
export async function generateAgent3ResearchPlan(input: {
  research_task: Agent7ResearchTask;
  domain_manual?: Record<string, unknown>;
  research_hygiene?: Record<string, unknown>;
  /** @deprecated Prefer research_log; converted internally when set. */
  prior_rounds?: Agent36PriorRound[];
  research_log?: import("@/lib/types").Agent3ResearchLogEntry[];
  iteration_hint?: string;
}): Promise<Agent3ResearchPlan> {
  try {
    const logFromPrior = input.prior_rounds?.length ? priorRoundsToResearchLog(input.prior_rounds) : undefined;
    const research_log = input.research_log?.length ? input.research_log : logFromPrior;

    const phase = await generateAgent3Phase2({
      research_task: input.research_task,
      domain_manual: input.domain_manual,
      research_hygiene: input.research_hygiene,
      research_log: research_log?.length ? research_log : undefined,
      iteration_hint: input.iteration_hint,
    });

    return phase2ToResearchPlan(phase);
  } catch (e) {
    if (e instanceof Agent3Phase2Error) {
      throw new Agent3ResearchPlanError(e.message, { cause: e });
    }
    throw e;
  }
}
