import type {
  Agent36LoopIterationTrace,
  Agent36ResearchLoopResponse,
  Agent3ResearchPlan,
  Agent6ResearchRunResult,
  Agent7ResearchTask,
} from "@/lib/types";
import {
  applyPriorReviewToAgent3Plan,
  generateAgent3ResearchPlan,
  type Agent36PriorRound,
} from "@/lib/agents/agent3ResearchPlan";
import { generateAgent3ResearchTaskResult } from "@/lib/agents/agent3ResearchTask";
import { runAgent6ResearchTask } from "@/lib/agents/agent6ResearchTask";

export const DEFAULT_AGENT36_MAX_ITERATIONS = 3;
export const HARD_CAP_AGENT36_ITERATIONS = 20;

/**
 * Agent 7 → Agent 3 **plan** → Agent 6 **execute** → Agent 3 **review** → repeat until sufficient or cap.
 */
export async function runAgent36ResearchLoop(input: {
  research_task: Agent7ResearchTask;
  domain_manual?: Record<string, unknown>;
  research_hygiene?: Record<string, unknown>;
  max_iterations?: number;
  /** 0–1. When set, stop after review if `confidence.score` meets or exceeds this (even if `needs_further_search` is still true). */
  min_confidence?: number;
}): Promise<Agent36ResearchLoopResponse> {
  const max = Math.min(
    Math.max(input.max_iterations ?? DEFAULT_AGENT36_MAX_ITERATIONS, 1),
    HARD_CAP_AGENT36_ITERATIONS,
  );
  const minConfEcho =
    typeof input.min_confidence === "number" &&
    input.min_confidence >= 0 &&
    input.min_confidence <= 1
      ? input.min_confidence
      : undefined;

  const agent6_runs: Agent6ResearchRunResult[] = [];
  const agent3_plans: Agent3ResearchPlan[] = [];
  const iteration_trace: Agent36LoopIterationTrace[] = [];
  const prior_rounds: Agent36PriorRound[] = [];

  for (let i = 0; i < max; i++) {
    const planRaw = await generateAgent3ResearchPlan({
      research_task: input.research_task,
      domain_manual: input.domain_manual,
      research_hygiene: input.research_hygiene,
      prior_rounds: prior_rounds.length > 0 ? prior_rounds : undefined,
      iteration_hint: `Planning round ${i + 1} of ${max}.`,
    });
    const lastReview =
      prior_rounds.length > 0
        ? prior_rounds[prior_rounds.length - 1]!.agent3_review
        : undefined;
    const plan = applyPriorReviewToAgent3Plan(planRaw, lastReview);
    agent3_plans.push(plan);

    const run = await runAgent6ResearchTask({
      research_task: input.research_task,
      domain_manual: input.domain_manual,
      research_hygiene: input.research_hygiene,
      agent3_assignment: plan.agent6_assignment,
    });
    agent6_runs.push(run);

    const review = await generateAgent3ResearchTaskResult({
      research_task: input.research_task,
      agent6_result: run,
      domain_manual: input.domain_manual,
      research_hygiene: input.research_hygiene,
      iteration_hint: `Review after round ${i + 1} of ${max}.`,
    });
    iteration_trace.push({
      agent3_plan: plan,
      agent6_result: run,
      agent3_review: review,
    });

    prior_rounds.push({
      agent3_plan: plan,
      agent6_result: run,
      agent3_review: review,
    });

    if (!review.needs_further_search) {
      return {
        final_agent3_result: review,
        agent3_plans,
        agent6_runs,
        iteration_trace,
        iterations: i + 1,
        stopped_reason: "sufficient",
        ...(minConfEcho !== undefined ? { min_confidence_threshold: minConfEcho } : {}),
      };
    }

    const minC = input.min_confidence;
    if (typeof minC === "number" && minC >= 0 && minC <= 1 && review.confidence.score >= minC) {
      return {
        final_agent3_result: review,
        agent3_plans,
        agent6_runs,
        iteration_trace,
        iterations: i + 1,
        stopped_reason: "min_confidence",
        ...(minConfEcho !== undefined ? { min_confidence_threshold: minConfEcho } : {}),
      };
    }

    if (i === max - 1) {
      return {
        final_agent3_result: review,
        agent3_plans,
        agent6_runs,
        iteration_trace,
        iterations: max,
        stopped_reason: "max_iterations",
        ...(minConfEcho !== undefined ? { min_confidence_threshold: minConfEcho } : {}),
      };
    }
  }

  throw new Error("agent36 loop: invariant failed");
}
