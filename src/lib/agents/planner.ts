import { generateObject } from "ai";
import { z } from "zod";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";
import { agent7DimensionSchema, knownGapGroupSchema } from "@/lib/agents/agent7Orchestrate";
import { normalizeDimensionId, resolveResearchTaskDimensionId } from "@/lib/dimensionId";
import type {
  Agent7Dimension,
  Agent7KnownGapGroup,
  PlannerOutput,
} from "@/lib/types";

export const plannerTaskSchema = z.object({
  task_id: z.string().min(1),
  dimension: z.string().min(1),
  factor: z.string().min(1),
  goal: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
  search_guidance: z.array(z.string().min(1)).min(1).max(10),
  variables_to_find: z.array(z.string()).optional(),
  extraction_focus: z.string().optional(),
  priority: z.enum(["high", "medium", "low"]),
  follow_domain_manual: z.boolean().optional(),
});

const plannerOutputSchema = z
  .object({
    objective_understanding: z.string().min(1),
    dimensions: z.array(agent7DimensionSchema).min(1).max(16),
    known_gaps: z.array(knownGapGroupSchema),
    tasks: z.array(plannerTaskSchema).min(1).max(12),
    execution_strategy: z.enum(["all_parallel", "two_phase"]),
    profile_task_id: z.string().optional(),
    reasoning: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    if (data.execution_strategy === "two_phase") {
      if (!data.profile_task_id) {
        ctx.addIssue({
          code: "custom",
          message: "two_phase strategy requires profile_task_id",
          path: ["profile_task_id"],
        });
      } else if (!data.tasks.some((t) => t.task_id === data.profile_task_id)) {
        ctx.addIssue({
          code: "custom",
          message: "profile_task_id must match a task in tasks",
          path: ["profile_task_id"],
        });
      }
    }
  });

const PLANNER_SYSTEM = `You are the Research Planner. You receive a user's research objective and produce a complete set of parallel research tasks that workers will execute simultaneously.

You receive:
- objective: what the user wants answered.
- subject_scope (optional): binding subject, out-of-scope rules, disambiguation cap.
- domain_manual: JSON with domain process definitions AND user_preferences (global rules, conditional rules).
- conversation_context: compact summary of prior turns (may be empty on first turn).
- user_preferences_summary: extracted applicable preferences for this query.

Your job:
1. Understand the objective and determine research dimensions.
2. Break the objective into 2-8 independent research tasks, one per dimension/factor.
3. Each task should be self-contained: a worker with web search access will execute it independently.
4. Decide execution_strategy:
   - "all_parallel": all tasks run simultaneously (default for most queries).
   - "two_phase": one task runs first (usually company characterization/profile), its results are shared with remaining tasks. Use when tasks depend on identifying the subject first.
5. For each task, provide:
   - search_guidance: 2-8 concrete search queries the worker should try.
   - variables_to_find: specific data points to extract.
   - extraction_focus: what to prioritize in extraction.
   - follow_domain_manual: true when the domain manual process is relevant to this task.

Apply user_preferences:
- Global preferences apply to all tasks.
- Conditional preferences apply when their condition matches the current objective.
- Reflect preferences in task design (e.g., "exclude Wikipedia" -> note in search_guidance; "focus on profitability" -> add profitability variables).

Do not fabricate evidence. Be specific in search_guidance — generic queries waste worker time.
Prefer 3-6 focused tasks over many shallow ones.`;

function buildPlannerPrompt(input: {
  objective: string;
  subject_scope?: string;
  domain_manual: Record<string, unknown>;
  conversation_context: string;
  user_preferences_summary: string;
  research_hygiene?: Record<string, unknown>;
  prior_key_findings?: Record<string, unknown>;
  prior_dimensions?: Agent7Dimension[];
  prior_known_gaps?: Agent7KnownGapGroup[];
}): string {
  const parts: string[] = [
    `objective:\n"""${input.objective.trim()}"""`,
    "",
  ];

  if (input.subject_scope?.trim()) {
    parts.push(`subject_scope:\n${input.subject_scope.trim()}`, "");
  }

  parts.push(`domain_manual:\n${JSON.stringify(input.domain_manual, null, 2)}`, "");

  parts.push(`user_preferences:\n${input.user_preferences_summary}`, "");

  if (input.research_hygiene && Object.keys(input.research_hygiene).length > 0) {
    parts.push(`research_hygiene:\n${JSON.stringify(input.research_hygiene, null, 2)}`, "");
  }

  if (input.prior_key_findings && Object.keys(input.prior_key_findings).length > 0) {
    parts.push("Prior key_findings (extend):", JSON.stringify(input.prior_key_findings, null, 2), "");
  }

  if (input.prior_dimensions?.length) {
    parts.push("Prior dimensions (refine):", JSON.stringify(input.prior_dimensions, null, 2), "");
  }

  if (input.prior_known_gaps?.length) {
    parts.push("Prior known_gaps (address):", JSON.stringify(input.prior_known_gaps, null, 2), "");
  }

  const ctx = input.conversation_context.trim();
  if (ctx) {
    parts.push("Conversation context (prior turns):", ctx, "");
  }

  parts.push("Emit the structured response per schema.");
  return parts.join("\n");
}

export async function runPlanner(input: {
  objective: string;
  subject_scope?: string;
  domain_manual: Record<string, unknown>;
  conversation_context: string;
  user_preferences_summary: string;
  research_hygiene?: Record<string, unknown>;
  prior_key_findings?: Record<string, unknown>;
  prior_dimensions?: Agent7Dimension[];
  prior_known_gaps?: Agent7KnownGapGroup[];
}): Promise<PlannerOutput> {
  const model = createBedrockLanguageModel();
  const prompt = buildPlannerPrompt(input);

  const { object } = await generateObject({
    model,
    schema: plannerOutputSchema,
    schemaName: "ResearchPlanner",
    system: PLANNER_SYSTEM,
    prompt,
    maxRetries: 2,
    temperature: 0.2,
    maxOutputTokens: 8000,
  });

  return {
    objective_understanding: object.objective_understanding.trim(),
    dimensions: object.dimensions,
    known_gaps: object.known_gaps.map((g) => {
      const dimRaw = g.dimension?.trim();
      let dimension = dimRaw;
      if (dimRaw) {
        const match = object.dimensions.find(
          (x) =>
            x.id === dimRaw ||
            normalizeDimensionId(x.label) === normalizeDimensionId(dimRaw) ||
            x.label === dimRaw,
        );
        dimension = match ? match.id : normalizeDimensionId(dimRaw);
      }
      return {
        dimension,
        gaps: g.gaps.map((x) => x.trim()).filter(Boolean),
      };
    }),
    tasks: object.tasks.map((t) => ({
      task_id: t.task_id.trim(),
      dimension: resolveResearchTaskDimensionId(t.dimension.trim(), object.dimensions),
      factor: t.factor.trim(),
      goal: t.goal.trim(),
      context: t.context,
      search_guidance: t.search_guidance.map((s) => s.trim()).filter(Boolean),
      variables_to_find: t.variables_to_find?.map((s) => s.trim()).filter(Boolean),
      extraction_focus: t.extraction_focus?.trim() || undefined,
      priority: t.priority,
      follow_domain_manual: t.follow_domain_manual,
    })),
    execution_strategy: object.execution_strategy,
    profile_task_id: object.profile_task_id?.trim() || undefined,
    reasoning: object.reasoning.trim(),
  };
}
