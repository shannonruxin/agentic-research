import type {
  Agent36LoopIterationTrace,
  Agent36ResearchLoopResponse,
  Agent3ResearchLogEntry,
  Agent3ResearchPlan,
  Agent6ResearchRunResult,
  Agent7ResearchTask,
} from "@/lib/types";
import {
  buildResearchLogEntry,
  generateAgent3Phase2,
  phase2ToResearchPlan,
  phase2ToTaskResult,
} from "@/lib/agents/agent3Phase2";
import { runAgent6ResearchTask } from "@/lib/agents/agent6ResearchTask";

export const DEFAULT_AGENT36_MAX_ITERATIONS = 3;
export const HARD_CAP_AGENT36_ITERATIONS = 20;

/**
 * Agent 7 → Agent 3 **plan** → Agent 6 **execute** → Agent 3 **review + next plan** → repeat until sufficient or cap.
 */
export async function runAgent36ResearchLoop(input: {
  research_task: Agent7ResearchTask;
  domain_manual?: Record<string, unknown>;
  research_hygiene?: Record<string, unknown>;
  max_iterations?: number;
  /** 0–1. When set, stop after review if `confidence.score` meets or exceeds this (even if `needs_further_search` is still true). */
  min_confidence?: number;
  /** Optional seed memory (newest last); loop appends each iteration. */
  research_log?: Agent3ResearchLogEntry[];
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
  let research_log: Agent3ResearchLogEntry[] = [...(input.research_log ?? [])];

  const initial = await generateAgent3Phase2({
    research_task: input.research_task,
    domain_manual: input.domain_manual,
    research_hygiene: input.research_hygiene,
    research_log: research_log.length ? research_log : undefined,
    iteration_hint: `Planning round 1 of ${max}.`,
  });
  let planForRound = phase2ToResearchPlan(initial);

  for (let i = 0; i < max; i++) {
    agent3_plans.push(planForRound);

    const run = await runAgent6ResearchTask({
      research_task: input.research_task,
      domain_manual: input.domain_manual,
      research_hygiene: input.research_hygiene,
      agent3_assignment: planForRound.agent6_assignment,
    });
    agent6_runs.push(run);

    const merged = await generateAgent3Phase2({
      research_task: input.research_task,
      domain_manual: input.domain_manual,
      research_hygiene: input.research_hygiene,
      agent6_result: run,
      research_log: research_log.length ? research_log : undefined,
      iteration_hint: `Review after round ${i + 1} of ${max}.`,
    });

    const entry = buildResearchLogEntry(i + 1, run, merged);
    research_log = [...research_log, entry];

    const review = phase2ToTaskResult(merged);
    iteration_trace.push({
      agent3_plan: planForRound,
      agent6_result: run,
      agent3_review: review,
    });

    if (!review.needs_further_search) {
      return {
        final_agent3_result: review,
        agent3_plans,
        agent6_runs,
        iteration_trace,
        research_log,
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
        research_log,
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
        research_log,
        iterations: max,
        stopped_reason: "max_iterations",
        ...(minConfEcho !== undefined ? { min_confidence_threshold: minConfEcho } : {}),
      };
    }

    planForRound = phase2ToResearchPlan(merged);
  }

  throw new Error("agent36 loop: invariant failed");
}
