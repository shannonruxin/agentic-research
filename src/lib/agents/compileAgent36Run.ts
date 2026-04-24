import type { Agent36ResearchLoopResponse } from "@/lib/types";

/**
 * Flat run log per iteration: **`agent_3_iter_*`** is a single unified Agent 3 payload (assignment
 * for this round’s Agent 6 + post–Agent 6 synthesis in one object, aligned with **`Agent3Phase2Response`** shape).
 * **`agent_6_iter_*`** is the Agent 6 run. No separate “review” key — one Agent 3, not plan vs review split.
 */
export function compileAgent36LoopToFlatJson(
  loop: Agent36ResearchLoopResponse,
  opts?: { min_confidence_request?: number | undefined },
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < loop.iteration_trace.length; i++) {
    const n = i + 1;
    const t = loop.iteration_trace[i]!;
    const p = t.agent3_plan;
    const a = p.agent6_assignment;
    out[`agent_3_iter_${n}`] = {
      plan_summary: p.plan_summary,
      search_objective: a.search_objective,
      search_queries: a.search_queries,
      ...(a.extraction_notes ? { extraction_notes: a.extraction_notes } : {}),
      ...(p.open_questions?.length ? { open_questions: p.open_questions } : {}),
      ...t.agent3_review,
    };
    out[`agent_6_iter_${n}`] = t.agent6_result;
  }
  const minReq = opts?.min_confidence_request ?? loop.min_confidence_threshold;
  out.research_log = loop.research_log;
  out.__run = {
    stopped_reason: loop.stopped_reason,
    iterations: loop.iterations,
    final_confidence_score: loop.final_agent3_result.confidence.score,
    ...(typeof minReq === "number" ? { min_confidence_request: minReq } : {}),
  };
  return out;
}
