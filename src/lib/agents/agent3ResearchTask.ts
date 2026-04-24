import { z } from "zod";
import { agent7ResearchTaskSchema } from "@/lib/agents/agent7Orchestrate";
import { Agent3Phase2Error, generateAgent3Phase2 } from "@/lib/agents/agent3Phase2";
import { extractedKeyDatumZod } from "@/lib/agents/agent6ResearchTask";
import type { Agent3Phase2Response, Agent6ResearchRunResult, Agent7ResearchTask } from "@/lib/types";

/** LLM / validation failure for Agent 3 (Phase 2 research task). */
export class Agent3ResearchTaskError extends Error {
  override readonly name = "Agent3ResearchTaskError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

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

const agent3ResearchDecisionSchema = z.object({
  needs_further_search: z.boolean(),
  reason: z.string(),
  suggested_direction: z.string().optional(),
  suggested_queries: z.array(z.string()).optional(),
});

export const agent3TaskResultSchema = z.object({
  sources_and_data: z.array(
    z.object({
      url: z.string().min(1),
      relevance: z.string().min(1),
      data_noted: z.string().min(1),
    }),
  ),
  analysis_points: z.array(z.string().min(1)).min(1),
  summary: z.string().min(1),
  task_gaps: z.array(z.string()),
  assumptions: z.array(assumptionItemSchema),
  confidence: agent3TaskConfidenceSchema,
  needs_further_search: z.boolean().optional(),
  suggested_queries: z.array(z.string()).optional(),
  progress_metrics: z
    .object({
      iterations_so_far: z.number().int().min(0),
      new_info_count: z.number().min(0),
      overlap_rate: z.number().min(0).max(1),
      cumulative_overlap_rate: z.number().min(0).max(1),
      source_novelty: z.number().min(0).max(1),
      trend: z.enum(["increasing", "stable", "declining"]),
    })
    .optional(),
  entity_tracking: z
    .object({
      total_entities: z.number().int().min(0),
      new_entities: z.array(z.string()),
      repeated_entities: z.array(z.string()),
      high_relevance_entities: z.array(z.string()),
      high_rabbithole_entities: z.array(z.string()),
    })
    .optional(),
  scan: z
    .object({
      observations: z.array(z.string()),
      emerging_patterns: z.array(z.string()),
    })
    .optional(),
  insight: z.string().optional(),
  decision: agent3ResearchDecisionSchema.optional(),
});

export const agent6ResultBodySchema = z.object({
  queries_used: z.array(z.string()),
  source_urls: z.array(z.string()),
  extracted_key_data: z.array(extractedKeyDatumZod),
  parallel_search_id: z.string().nullable().optional(),
});

/**
 * Agent 3 (Phase 2) — unified review + next plan (**`Agent3Phase2Response`**), including **`scan`**, **`insight`**, and **`decision`** when returned by the model.
 */
export async function generateAgent3ResearchTaskResult(input: {
  research_task: Agent7ResearchTask;
  agent6_result: Agent6ResearchRunResult;
  domain_manual?: Record<string, unknown>;
  research_hygiene?: Record<string, unknown>;
  research_log?: import("@/lib/types").Agent3ResearchLogEntry[];
  iteration_hint?: string;
}): Promise<Agent3Phase2Response> {
  const taskParse = agent7ResearchTaskSchema.safeParse(input.research_task);
  if (!taskParse.success) {
    throw new Agent3ResearchTaskError(taskParse.error.issues[0]?.message ?? "Invalid research_task");
  }

  try {
    const full = await generateAgent3Phase2({
      research_task: taskParse.data,
      agent6_result: input.agent6_result,
      domain_manual: input.domain_manual,
      research_hygiene: input.research_hygiene,
      research_log: input.research_log?.length ? input.research_log : undefined,
      iteration_hint: input.iteration_hint,
    });
    return full;
  } catch (e) {
    if (e instanceof Agent3Phase2Error) {
      throw new Agent3ResearchTaskError(e.message, { cause: e });
    }
    if (e instanceof Agent3ResearchTaskError) {
      throw e;
    }
    const msg = e instanceof Error ? e.message : "Agent 3 research task failed";
    throw new Agent3ResearchTaskError(msg, e instanceof Error ? { cause: e } : undefined);
  }
}
