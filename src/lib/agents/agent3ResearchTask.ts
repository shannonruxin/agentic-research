import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { agent7ResearchTaskSchema } from "@/lib/agents/agent7Orchestrate";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";
import type {
  Agent3TaskResult,
  Agent6ResearchRunResult,
  Agent7ResearchTask,
} from "@/lib/types";

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
});

const AGENT3_TASK_SYSTEM = `You are Agent 3 — Phase 2 research task analyst.

You receive one research_task (goal, variables, validation criteria, success criteria) and Agent 6 structured outputs (queries_used, source_urls, extracted_key_data).

You do NOT run web search. Reason only from the provided JSON.

Rules:
- sources_and_data: only use URLs that appear in Agent 6 source_urls. If a URL is not in that list, omit that row.
- analysis_points: chain of reasoning — what worked, what failed, negative results allowed.
- task_gaps: task-level limitations (missing variables, weak sources).
- assumptions: material assumptions per schema types (data_backed | benchmark_based | speculative).
- confidence.breakdown: scores 0–1; penalize missing variables, disagreement, weak method fit.
- needs_further_search: true only if validation_criteria or success_criteria are clearly unmet and more targeted search could help.
- suggested_queries: when needs_further_search, propose 2–6 concrete search strings; otherwise omit.`;

function buildAgent3UserMessage(input: {
  research_task: Agent7ResearchTask;
  agent6_result: Agent6ResearchRunResult;
  domain_manual?: Record<string, unknown>;
  research_hygiene?: Record<string, unknown>;
  iteration_hint?: string;
}): string {
  const parts = [
    input.iteration_hint ? `${input.iteration_hint}\n` : "",
    "research_task:",
    JSON.stringify(input.research_task, null, 2),
    "",
    "agent6_result:",
    JSON.stringify(input.agent6_result, null, 2),
  ];
  if (input.domain_manual && Object.keys(input.domain_manual).length > 0) {
    parts.push("", "domain_manual:", JSON.stringify(input.domain_manual, null, 2));
  }
  if (input.research_hygiene && Object.keys(input.research_hygiene).length > 0) {
    parts.push("", "research_hygiene:", JSON.stringify(input.research_hygiene, null, 2));
  }
  parts.push("", "Emit structured task result per schema.");
  return parts.join("\n");
}

function sanitizeSources(result: Agent3TaskResult, allowedUrls: Set<string>): Agent3TaskResult {
  return {
    ...result,
    sources_and_data: result.sources_and_data.filter((s) => allowedUrls.has(s.url.trim())),
  };
}

/**
 * Agent 3 (Phase 2) — task-level JSON for one **`research_task`** + Agent 6 run.
 */
export async function generateAgent3ResearchTaskResult(input: {
  research_task: Agent7ResearchTask;
  agent6_result: Agent6ResearchRunResult;
  domain_manual?: Record<string, unknown>;
  research_hygiene?: Record<string, unknown>;
  iteration_hint?: string;
}): Promise<Agent3TaskResult> {
  const taskParse = agent7ResearchTaskSchema.safeParse(input.research_task);
  if (!taskParse.success) {
    throw new Agent3ResearchTaskError(taskParse.error.issues[0]?.message ?? "Invalid research_task");
  }

  const allowed = new Set(input.agent6_result.source_urls.map((u) => u.trim()));

  try {
    const model = createBedrockLanguageModel();
    const { object } = await generateObject({
      model,
      schema: agent3TaskResultSchema,
      system: AGENT3_TASK_SYSTEM,
      prompt: buildAgent3UserMessage({
        research_task: taskParse.data,
        agent6_result: input.agent6_result,
        domain_manual: input.domain_manual,
        research_hygiene: input.research_hygiene,
        iteration_hint: input.iteration_hint,
      }),
    });
    return sanitizeSources(object as Agent3TaskResult, allowed);
  } catch (e) {
    if (e instanceof NoObjectGeneratedError) {
      throw new Agent3ResearchTaskError("Agent 3 did not return valid structured output.", {
        cause: e,
      });
    }
    if (e instanceof Agent3ResearchTaskError) {
      throw e;
    }
    const msg = e instanceof Error ? e.message : "Agent 3 research task failed";
    throw new Agent3ResearchTaskError(msg, e instanceof Error ? { cause: e } : undefined);
  }
}
