import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";
import type {
  Agent7Assignment,
  Agent7Confidence,
  Agent7Dimension,
  Agent7KnownGapGroup,
  Agent7OrchestrateResult,
} from "@/lib/types";

/** Configuration / LLM / validation failure for Agent 7 (orchestrator). */
export class Agent7ModelError extends Error {
  override readonly name = "Agent7ModelError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const jsonObjectSchema = z.record(z.string(), z.unknown());

/** One thematic slice of the objective (market, competition, tech, etc.). */
export const agent7DimensionSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional(),
});

export const knownGapGroupSchema = z.object({
  dimension: z.string().optional(),
  gaps: z.array(z.string().min(1)).min(1),
});

export const agent7ResearchTaskSchema = z.object({
  task_id: z.string().min(1),
  dimension: z.string().min(1),
  factor: z.string().min(1),
  goal: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
  method_instructions: z.array(z.string()).optional(),
  variables_to_find: z.array(z.string()).optional(),
  calculation_logic: z.string().optional(),
  search_guidance: z.array(z.string()).optional(),
  validation_criteria: z.array(z.string()).optional(),
  adaptation_signals: z.array(z.string()).optional(),
  fallback_methods: z.array(z.string()).optional(),
  success_criteria: z.array(z.string()).optional(),
  priority: z.enum(["high", "medium", "low"]),
  expected_output_format: z.array(z.string()).optional(),
});

export const agent7AssignmentBodySchema = z
  .object({
    assignee: z.enum(["agent3_agent6", "agent4_agent5", "agent8"]),
    summary: z.string().optional(),
    research_task: agent7ResearchTaskSchema.optional(),
    verbatim_brief: z.string().optional(),
    memory_directive: z.string().optional(),
  })
  .superRefine((a, ctx) => {
    if (a.assignee === "agent3_agent6" && !a.research_task) {
      ctx.addIssue({
        code: "custom",
        message: "agent3_agent6 assignments must include research_task",
        path: ["research_task"],
      });
    }
  });

const agent7OutputSchema = z.object({
  objective_understanding: z.string().min(1),
  dimensions: z.array(agent7DimensionSchema).min(1).max(16),
  key_findings: jsonObjectSchema,
  known_gaps: z.array(knownGapGroupSchema),
  confidence: z.object({
    level: z.enum(["low", "medium", "high"]),
    rationale: z.string().optional(),
  }) satisfies z.ZodType<Agent7Confidence>,
  train_of_thought: z.string().min(1),
  assignments: z.array(agent7AssignmentBodySchema).min(1).max(16),
});

export const AGENT7_SYSTEM_PROMPT = `You are Agent 7 — research orchestrator and judge.

You receive:
- objective: what the user wants answered or decided.
- domain_manual: JSON object with domain rules, vocabulary, and constraints you MUST respect.
- research_hygiene: optional JSON with citation or process constraints (may be empty).
- memory: optional JSON — durable facts from the conversation (may be empty on first turn).
- known_gaps_seed: optional prior gap groups — refine and EXTEND; do not drop unresolved items unless resolved.
- key_findings (optional): prior structured findings — merge and extend.
- dimensions (optional input): prior lenses — refine or replace.

You do NOT run web search or see raw page text. Reason only from inputs.

known_gaps (grouped, REQUIRED every turn):
- Always include what is missing BEFORE you could answer responsibly — including on the FIRST user message.
- Examples: user asks "how fast can the company grow?" → gaps may include: which company, industry/vertical, geography, revenue model, and per-dimension items like under Market size: TAM/SAM, addressable segment, growth ceilings.
- Use one group per dimension when gaps are dimension-specific; use dimension omitted or label "Objective / scope" for cross-cutting missing facts (entity name, time horizon, definitions).
- Each group has gaps: string[] of concrete missing items.

train_of_thought:
- Plain-language reasoning: how you interpreted the objective, which dimensions matter, why gaps exist, and how assignments follow.

assignments (at least one entry):
- agent3_agent6: MUST include full research_task (task_id, dimension, factor, goal, priority high|medium|low, plus method_instructions, variables_to_find, search_guidance, etc. when you can specify them). One assignment per distinct factor-level research task you are delegating.
- agent4_agent5: optional row when verbatim extract+crop is needed; include verbatim_brief (URLs/claims scope).
- agent8: optional row when memory should be updated; include memory_directive.
- Prefer concrete agent3_agent6 tasks for each high-priority gap you can turn into research.

Output fields also: objective_understanding, dimensions, key_findings, confidence (level + rationale).

Never fabricate verbatim quotes or URLs. If you lack evidence, reflect that in known_gaps and confidence.`;

function buildAgent7UserMessage(input: {
  objective: string;
  domain_manual: Record<string, unknown>;
  research_hygiene?: Record<string, unknown>;
  memory?: Record<string, unknown>;
  known_gaps_seed?: Agent7KnownGapGroup[];
  key_findings?: Record<string, unknown>;
  dimensions?: Agent7Dimension[];
}): string {
  const parts = [
    `objective:\n"""${input.objective.trim()}"""`,
    "",
    `domain_manual:\n${JSON.stringify(input.domain_manual, null, 2)}`,
    "",
  ];
  if (input.research_hygiene && Object.keys(input.research_hygiene).length > 0) {
    parts.push(`research_hygiene:\n${JSON.stringify(input.research_hygiene, null, 2)}`, "");
  } else {
    parts.push("research_hygiene: (none provided)", "");
  }
  if (input.memory && Object.keys(input.memory).length > 0) {
    parts.push(`memory:\n${JSON.stringify(input.memory, null, 2)}`, "");
  } else {
    parts.push("memory: (none — empty object or first turn.)", "");
  }
  if (input.known_gaps_seed && input.known_gaps_seed.length > 0) {
    parts.push(
      "Prior known_gaps_seed (merge unresolved into your output known_gaps):",
      JSON.stringify(input.known_gaps_seed, null, 2),
      "",
    );
  } else {
    parts.push("Prior known_gaps_seed: (none.)", "");
  }
  if (input.key_findings && Object.keys(input.key_findings).length > 0) {
    parts.push(
      "Prior key_findings (update/extend this object in your output):",
      JSON.stringify(input.key_findings, null, 2),
      "",
    );
  } else {
    parts.push("Prior key_findings: (none — start a fresh findings object.)", "");
  }
  if (input.dimensions && input.dimensions.length > 0) {
    parts.push(
      "Prior dimensions (refine, merge, or replace in your output as appropriate):",
      JSON.stringify(input.dimensions, null, 2),
      "",
    );
  } else {
    parts.push("Prior dimensions: (none — infer dimensions from objective and domain_manual.)", "");
  }
  parts.push("Emit the structured response per schema.");
  return parts.join("\n");
}

function normalizeAssignments(raw: z.infer<typeof agent7OutputSchema>["assignments"]): Agent7Assignment[] {
  return raw.map((a) => ({
    assignee: a.assignee,
    summary: a.summary?.trim() || undefined,
    research_task: a.research_task
      ? {
          task_id: a.research_task.task_id.trim(),
          dimension: a.research_task.dimension.trim(),
          factor: a.research_task.factor.trim(),
          goal: a.research_task.goal.trim(),
          context: a.research_task.context,
          method_instructions: a.research_task.method_instructions?.map((s) => s.trim()).filter(Boolean),
          variables_to_find: a.research_task.variables_to_find?.map((s) => s.trim()).filter(Boolean),
          calculation_logic: a.research_task.calculation_logic?.trim() || undefined,
          search_guidance: a.research_task.search_guidance?.map((s) => s.trim()).filter(Boolean),
          validation_criteria: a.research_task.validation_criteria?.map((s) => s.trim()).filter(Boolean),
          adaptation_signals: a.research_task.adaptation_signals?.map((s) => s.trim()).filter(Boolean),
          fallback_methods: a.research_task.fallback_methods?.map((s) => s.trim()).filter(Boolean),
          success_criteria: a.research_task.success_criteria?.map((s) => s.trim()).filter(Boolean),
          priority: a.research_task.priority,
          expected_output_format: a.research_task.expected_output_format?.map((s) => s.trim()).filter(Boolean),
        }
      : undefined,
    verbatim_brief: a.verbatim_brief?.trim() || undefined,
    memory_directive: a.memory_directive?.trim() || undefined,
  }));
}

export async function orchestrateAgent7(input: {
  objective: string;
  domain_manual: Record<string, unknown>;
  research_hygiene?: Record<string, unknown>;
  memory?: Record<string, unknown>;
  known_gaps_seed?: Agent7KnownGapGroup[];
  key_findings?: Record<string, unknown>;
  dimensions?: Agent7Dimension[];
}): Promise<Agent7OrchestrateResult> {
  const objective = input.objective.trim();
  if (!objective) {
    throw new Agent7ModelError("objective is empty.");
  }

  let model;
  try {
    model = createBedrockLanguageModel();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bedrock configuration error";
    throw new Agent7ModelError(msg);
  }

  try {
    const { object } = await generateObject({
      model,
      schema: agent7OutputSchema,
      system: AGENT7_SYSTEM_PROMPT,
      prompt: buildAgent7UserMessage({
        objective,
        domain_manual: input.domain_manual,
        research_hygiene: input.research_hygiene,
        memory: input.memory,
        known_gaps_seed: input.known_gaps_seed,
        key_findings: input.key_findings,
        dimensions: input.dimensions,
      }),
    });

    return {
      objective_understanding: object.objective_understanding.trim(),
      dimensions: object.dimensions.map((d) => ({
        label: d.label.trim(),
        description: d.description?.trim() || undefined,
      })),
      key_findings: object.key_findings,
      known_gaps: object.known_gaps.map((g) => ({
        dimension: g.dimension?.trim() || undefined,
        gaps: g.gaps.map((x) => x.trim()).filter(Boolean),
      })),
      confidence: {
        level: object.confidence.level,
        rationale: object.confidence.rationale?.trim() || undefined,
      },
      train_of_thought: object.train_of_thought.trim(),
      assignments: normalizeAssignments(object.assignments),
    };
  } catch (e) {
    if (e instanceof Agent7ModelError) {
      throw e;
    }
    if (NoObjectGeneratedError.isInstance(e)) {
      throw new Agent7ModelError("The model did not return valid structured output.", { cause: e });
    }
    const msg = e instanceof Error ? e.message : "Agent 7 orchestration failed";
    throw new Agent7ModelError(msg, e instanceof Error ? { cause: e } : undefined);
  }
}
