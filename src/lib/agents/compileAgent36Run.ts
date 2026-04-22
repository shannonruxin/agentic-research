import type { Agent36ResearchLoopResponse } from "@/lib/types";

/**
 * Flat run log: one key per step per iteration, raw payloads only (no transformation).
 * Example: `agent_3_iter_1`, `agent_6_iter_1`, `agent_3review_iter_1`, …
 * `__run` is stopping metadata; agent step keys are identical to the API objects.
 */
export function compileAgent36LoopToFlatJson(
  loop: Agent36ResearchLoopResponse,
  opts?: { min_confidence_request?: number | undefined },
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < loop.iteration_trace.length; i++) {
    const n = i + 1;
    const t = loop.iteration_trace[i]!;
    out[`agent_3_iter_${n}`] = t.agent3_plan;
    out[`agent_6_iter_${n}`] = t.agent6_result;
    out[`agent_3review_iter_${n}`] = t.agent3_review;
  }
  const minReq = opts?.min_confidence_request ?? loop.min_confidence_threshold;
  out.__run = {
    stopped_reason: loop.stopped_reason,
    iterations: loop.iterations,
    final_confidence_score: loop.final_agent3_result.confidence.score,
    ...(typeof minReq === "number" ? { min_confidence_request: minReq } : {}),
  };
  return out;
}
