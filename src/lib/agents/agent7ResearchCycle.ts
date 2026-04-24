import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";
import { writeContextBuilderFile } from "@/lib/persistContextBuilderFile";
import {
  agent7AssignmentBodySchema,
  agent7DimensionSchema,
  knownGapGroupSchema,
} from "@/lib/agents/agent7Orchestrate";
import type {
  Agent7Assignment,
  Agent7Confidence,
  Agent7Dimension,
  Agent7KnownGapGroup,
  Agent7OrchestrateResult,
} from "@/lib/types";

export class Agent7ResearchCycleError extends Error {
  override readonly name = "Agent7ResearchCycleError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const jsonObjectSchema = z.record(z.string(), z.unknown());

const researchCycleBase = {
  objective_understanding: z.string().min(1),
  dimensions: z.array(agent7DimensionSchema).min(1).max(16),
  key_findings: jsonObjectSchema,
  known_gaps: z.array(knownGapGroupSchema),
  confidence: z.object({
    level: z.enum(["low", "medium", "high"]),
    rationale: z.string().optional(),
  }) satisfies z.ZodType<Agent7Confidence>,
  train_of_thought: z.string().min(1),
  orchestration: z.enum(["delegate_research", "deliver_to_user", "ask_user"]),
  /** At least one agent3_agent6 + research_task when orchestration is delegate_research. */
  assignments: z.array(agent7AssignmentBodySchema).max(16),
  /**
   * Rolling summary of findings: **dynamic key** (`key`) + any JSON `value`. The runner persists this
   * as the **first** field in `workspace/chat-memory.json` before the chrono list.
   */
  findings_summary: z.object({
    key: z
      .string()
      .min(1)
      .describe("Dynamic JSON property name for the summary block, e.g. session_findings_2024"),
    value: z.unknown().describe("Summary object or string: consolidated findings, gaps, decisions"),
  }),
  /**
   * Required when `deliver_to_user` or `ask_user` — user-facing Markdown for
   * `workspace/user-output.md` (full report, or a short note + clarifying questions).
   */
  user_facing_document: z.string().optional(),
};

export const agent7ResearchCycleOutputSchema = z
  .object(researchCycleBase)
  .superRefine((data, ctx) => {
    if (data.orchestration === "delegate_research") {
      const ok = data.assignments.some(
        (a) => a.assignee === "agent3_agent6" && a.research_task !== undefined,
      );
      if (!ok) {
        ctx.addIssue({
          code: "custom",
          message: "delegate_research requires at least one agent3_agent6 assignment with research_task",
          path: ["assignments"],
        });
      }
    } else {
      const doc = data.user_facing_document?.trim();
      if (!doc) {
        const label = data.orchestration === "ask_user" ? "ask_user" : "deliver_to_user";
        ctx.addIssue({
          code: "custom",
          message: `${label} requires a non-empty user_facing_document (markdown for the end user)`,
          path: ["user_facing_document"],
        });
      }
    }
  });

export type Agent7ResearchCycleModelOut = z.infer<typeof agent7ResearchCycleOutputSchema>;

function normalizeResearchCycleAssignments(
  raw: Agent7ResearchCycleModelOut["assignments"],
): Agent7Assignment[] {
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
          follow_domain_manual:
            typeof a.research_task.follow_domain_manual === "boolean"
              ? a.research_task.follow_domain_manual
              : undefined,
        }
      : undefined,
    verbatim_brief: a.verbatim_brief?.trim() || undefined,
    memory_directive: a.memory_directive?.trim() || undefined,
  }));
}

export type Agent7ResearchCycleResult = Omit<Agent7OrchestrateResult, "assignments"> & {
  assignments: Agent7Assignment[];
  orchestration: "delegate_research" | "deliver_to_user" | "ask_user";
  findings_summary: { key: string; value: unknown };
  user_facing_document?: string;
};

const AGENT7_RESEARCH_CYCLE_SYSTEM = `You are Agent 7 — research orchestrator (extended cycle).

This mode coordinates **Agent 3 + Agent 6** web research. You do NOT run search yourself. After each
research round you receive **compiled run JSON** from Agent 3/6: trust it for evidence, URLs, and
numeric confidence; reflect gaps honestly.

**Persistent memory (required):** Each turn you must output \`findings_summary\` with a **dynamic**
\`key\` (any descriptive string) and a JSON \`value\` that summarizes findings, gaps, and decisions
for the user objective. The server appends a full chrono log (Agent 7 and Agent 3/6 runs) to
\`workspace/chat-memory.json\`: first field = this summary; \`"1"\`, \`"2"\`, … = outputs in time order.

**Orchestration:**
- \`delegate_research\` — you need more web research. Set \`assignments\` with at least one
  \`agent3_agent6\` row with a full \`research_task\` (task_id, dimension, factor, goal, priority, etc.).
  **Multiple** \`agent3_agent6\` rows in one turn run **in parallel** (separate Agent 3↔6 loops); each
  result is passed back as its own compiled JSON object. You may also list agent4_agent5 or agent8
  rows for **planning**; this runner only **executes** agent3_agent6 in the research loop. Output a
  fresh \`findings_summary\` for the JSON file.
- \`deliver_to_user\` — the answer is ready for the end user. Set \`user_facing_document\` to a
  **complete** Markdown report (headings, sections, evidence-aware caveats, sources where applicable).
  Update \`findings_summary\` to note the final handoff to the user.
- \`ask_user\` — the objective is **ambiguous**, scope is **missing**, or your **confidence** in
  what to research is **low** (e.g. duplicate company names, unclear geography, or “too vague to search”).
  **Do not** start Agent 3/6 yet. Set \`user_facing_document\` to a short, friendly message plus **clear
  numbered or bulleted questions** so the user can narrow the task. \`assignments\` can be empty.
  Update \`findings_summary\` accordingly.

**When to deliver vs delegate vs ask:** Favor \`deliver_to_user\` when the user’s question can be
answered responsibly with the evidence gathered, or when further search would be redundant. Use
\`delegate_research\` when clear \`known_gaps\` remain and specific research tasks would materially
reduce them. Use \`ask_user\` when you are **not ready** to search effectively until the user clarifies
— prefer this over a wasteful or misleading research round.

**Never** fabricate URLs or quotes. Cite the compiled run JSON and memory as your evidence base.

**Context hygiene:** The \`chat_memory\` block in the user message is a **compact** view: recent
turns keep condensed Agent 7 / 3/6 **outcome** fields; older turns are mostly \`summary\` only.
\`last_compiled_runs\` carries the **current batch** of compiled Agent 3/6 runs (evidence). Do not
assume the full prior markdown is in context—use \`summary\`, your structured fields, and new
research. Answer **only** the current \`objective\` (e.g. a greeting needs a short reply, not a
prior unrelated report).

**Subject / scope (when \`subject_scope\` is present in the user message):** Treat it as binding
**research subject** and **out-of-scope** rules for this run. It may name a company, product, law,
or abstract topic—apply the same logic. **Do not** spend more than a **short** paragraph in the
delivered document re-litigating homonym names, alternate entities, or “disambiguation theater”
unless the user explicitly needs it or the subject is still genuinely ambiguous after a quick check.
Mention out-of-scope confusions in at most 2–3 sentences, then \`delegate\` or \`deliver\` on the
**stated** subject; use \`domain_manual\` as a guide when it fits the case (not when irrelevant). If the subject is **not** resolvable, use \`ask_user\` once
with targeted questions, then continue—do not loop on identity across many rounds. If
\`subject_scope\` is missing, use normal prudence: prefer one clarify step over useless broad search.`;

function buildAgent7ResearchCycleUserMessage(input: {
  objective: string;
  /**
   * Optional: what “thing” is in scope, what is not, and how much to spend on name disambiguation.
   * Injected for every Agent 7 + finalize call in the 7↔3 loop.
   */
  subject_scope?: string;
  domain_manual: Record<string, unknown>;
  research_hygiene?: Record<string, unknown>;
  memoryJson?: Record<string, unknown>;
  known_gaps_seed?: Agent7KnownGapGroup[];
  key_findings?: Record<string, unknown>;
  dimensions?: Agent7Dimension[];
  chat_memory_current: string;
  last_compiled_runs: unknown[];
  outer_iteration: { index: number; max: number };
  inner_loop: { min_confidence?: number; max_iterations: number };
}): string {
  const parts: string[] = [
    `objective:\n"""${input.objective.trim()}"""`,
    "",
  ];
  const sc = input.subject_scope?.trim();
  if (sc) {
    parts.push(
      "subject_scope (binding for this run — company, product, or non-company subject; out-of-scope; cap on disambiguation):",
      sc,
      "",
    );
  } else {
    parts.push("subject_scope: (none — infer scope from the objective; use ask_user if the subject is too ambiguous to search.)", "");
  }
  parts.push(`domain_manual:\n${JSON.stringify(input.domain_manual, null, 2)}`, "");
  if (input.research_hygiene && Object.keys(input.research_hygiene).length > 0) {
    parts.push(`research_hygiene:\n${JSON.stringify(input.research_hygiene, null, 2)}`, "");
  } else {
    parts.push("research_hygiene: (none provided)", "");
  }
  if (input.memoryJson && Object.keys(input.memoryJson).length > 0) {
    parts.push(`supplemental memory (JSON, optional):\n${JSON.stringify(input.memoryJson, null, 2)}`, "");
  }
  if (input.known_gaps_seed && input.known_gaps_seed.length > 0) {
    parts.push(
      "known_gaps_seed (merge; keep unresolved):",
      JSON.stringify(input.known_gaps_seed, null, 2),
      "",
    );
  } else {
    parts.push("known_gaps_seed: (none on first pass.)", "");
  }
  if (input.key_findings && Object.keys(input.key_findings).length > 0) {
    parts.push("Prior key_findings (extend/merge in output):", JSON.stringify(input.key_findings, null, 2), "");
  } else {
    parts.push("Prior key_findings: (none — start a fresh object.)", "");
  }
  if (input.dimensions && input.dimensions.length > 0) {
    parts.push("Prior dimensions (refine in output):", JSON.stringify(input.dimensions, null, 2), "");
  } else {
    parts.push("Prior dimensions: (none — infer from objective.)", "");
  }
  const cm = input.chat_memory_current.trim();
  if (cm) {
    parts.push(
      "---\n\nCurrent workspace/chat-memory.json (first key = rolling summary, then 1,2,… = chrono):",
      cm,
      "",
    );
  } else {
    parts.push("Current chat_memory.json: (empty or first run — you provide the new findings_summary).", "");
  }
  if (input.last_compiled_runs.length > 0) {
    parts.push(
      "Compiled Agent 3/6 run JSON (most recent last; use for evidence and confidence).",
      JSON.stringify(input.last_compiled_runs, null, 2),
      "",
    );
  } else {
    parts.push("Compiled Agent 3/6 run JSON: (none yet — you have not run research in this session.)", "");
  }
  parts.push(
    `outer_iteration: ${input.outer_iteration.index} of ${input.outer_iteration.max} (when at max, prefer delivery if the objective allows).`,
    `inner Agent 3↔6 settings for the next research batch: min_confidence=${input.inner_loop.min_confidence ?? "none"}, max_iterations_per_task=${input.inner_loop.max_iterations}.`,
  );
  parts.push("Emit the structured response per schema.");
  return parts.join("\n");
}

export async function orchestrateAgent7ResearchCycle(input: {
  objective: string;
  subject_scope?: string;
  domain_manual: Record<string, unknown>;
  research_hygiene?: Record<string, unknown>;
  memoryJson?: Record<string, unknown>;
  known_gaps_seed?: Agent7KnownGapGroup[];
  key_findings?: Record<string, unknown>;
  dimensions?: Agent7Dimension[];
  chat_memory_current: string;
  last_compiled_runs: unknown[];
  outer_iteration: { index: number; max: number };
  inner_loop: { min_confidence?: number; max_iterations: number };
}): Promise<Agent7ResearchCycleResult> {
  const objective = input.objective.trim();
  if (!objective) {
    throw new Agent7ResearchCycleError("objective is empty.");
  }

  let model;
  try {
    model = createBedrockLanguageModel();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bedrock configuration error";
    throw new Agent7ResearchCycleError(msg);
  }

  const prompt = buildAgent7ResearchCycleUserMessage(input);

  const mc = input.inner_loop.min_confidence;
  await writeContextBuilderFile({
    kind: "research_cycle",
    updatedAt: new Date().toISOString(),
    modelCall: { provider: "bedrock", method: "generateObject", schemaName: "Agent7ResearchCycle" },
    outerIteration: input.outer_iteration,
    innerLoop: {
      min_confidence: typeof mc === "number" ? mc : "none",
      max_iterations_per_task: input.inner_loop.max_iterations,
    },
    system: AGENT7_RESEARCH_CYCLE_SYSTEM,
    user: prompt,
  });

  try {
    const { object } = await generateObject({
      model,
      schema: agent7ResearchCycleOutputSchema,
      schemaName: "Agent7ResearchCycle",
      schemaDescription:
        "Agent 7: delegate_research | deliver_to_user | ask_user (clarify before search); findings_summary; user_facing_document when not delegating",
      system: AGENT7_RESEARCH_CYCLE_SYSTEM,
      prompt,
      maxRetries: 2,
      temperature: 0.2,
      maxOutputTokens: 16_000,
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
      assignments: normalizeResearchCycleAssignments(object.assignments),
      orchestration: object.orchestration,
      findings_summary: {
        key: object.findings_summary.key.trim(),
        value: object.findings_summary.value,
      },
      user_facing_document: object.user_facing_document?.trim() || undefined,
    };
  } catch (e) {
    if (e instanceof Agent7ResearchCycleError) {
      throw e;
    }
    if (NoObjectGeneratedError.isInstance(e)) {
      throw new Agent7ResearchCycleError("The model did not return valid structured output.", { cause: e });
    }
    const msg = e instanceof Error ? e.message : "Agent 7 research cycle failed";
    throw new Agent7ResearchCycleError(msg, e instanceof Error ? { cause: e } : undefined);
  }
}

const finalizeSchema = z.object({
  user_facing_document: z.string().min(1),
  findings_summary: z.object({
    key: z.string().min(1),
    value: z.unknown(),
  }),
});

const AGENT7_FINALIZE_SYSTEM = `You are Agent 7. The research loop has reached the maximum number of
outer iterations without an explicit "deliver" decision. Using ONLY the information in the user message
(the objective, domain constraints, key_findings, known_gaps, chat memory, and compiled research JSON),
write the best possible complete Markdown document for the end user. Be explicit about limitations
and missing data. Do not invent URLs. \`chat_memory\` has prior \`document\` text stripped—do not repeat an unrelated old report. Output \`findings_summary\` (dynamic key + value) noting that
the final user document was written because the outer iteration cap was reached.`;

function buildFinalizePrompt(input: {
  objective: string;
  subject_scope?: string;
  domain_manual: Record<string, unknown>;
  research_hygiene?: Record<string, unknown>;
  key_findings: Record<string, unknown>;
  known_gaps: Agent7KnownGapGroup[];
  dimensions: Agent7Dimension[];
  chat_memory_current: string;
  compiled_runs: unknown[];
}): string {
  const sc = input.subject_scope?.trim();
  const scopeBlock = sc
    ? ["subject_scope (binding for this run):", sc, ""]
    : ["subject_scope: (none)", ""];
  return [
    `objective:\n"""${input.objective.trim()}"""`,
    "",
    ...scopeBlock,
    `domain_manual:\n${JSON.stringify(input.domain_manual, null, 2)}`,
    "",
    input.research_hygiene && Object.keys(input.research_hygiene).length
      ? `research_hygiene:\n${JSON.stringify(input.research_hygiene, null, 2)}\n\n`
      : "research_hygiene: (none)\n\n",
    "key_findings (JSON):",
    JSON.stringify(input.key_findings, null, 2),
    "",
    "known_gaps (JSON):",
    JSON.stringify(input.known_gaps, null, 2),
    "",
    "dimensions (JSON):",
    JSON.stringify(input.dimensions, null, 2),
    "",
    "chat-memory.json (current):",
    input.chat_memory_current || "(empty)",
    "",
    "compiled Agent 3/6 runs (JSON):",
    JSON.stringify(input.compiled_runs, null, 2),
  ].join("\n");
}

/** Last-resort: produce `user_facing_document` + updated memory when the outer loop runs out. */
export async function finalizeAgent7OnMaxIterations(input: {
  objective: string;
  subject_scope?: string;
  domain_manual: Record<string, unknown>;
  research_hygiene?: Record<string, unknown>;
  key_findings: Record<string, unknown>;
  known_gaps: Agent7KnownGapGroup[];
  dimensions: Agent7Dimension[];
  chat_memory_current: string;
  compiled_runs: unknown[];
}): Promise<{ user_facing_document: string; findings_summary: { key: string; value: unknown } }> {
  let model;
  try {
    model = createBedrockLanguageModel();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bedrock configuration error";
    throw new Agent7ResearchCycleError(msg);
  }

  const prompt = buildFinalizePrompt(input);

  await writeContextBuilderFile({
    kind: "finalize_max_outer_iterations",
    updatedAt: new Date().toISOString(),
    modelCall: { provider: "bedrock", method: "generateObject", schemaName: "Agent7Finalize" },
    system: AGENT7_FINALIZE_SYSTEM,
    user: prompt,
  });

  try {
    const { object } = await generateObject({
      model,
      schema: finalizeSchema,
      schemaName: "Agent7Finalize",
      system: AGENT7_FINALIZE_SYSTEM,
      prompt,
      maxRetries: 2,
      temperature: 0.2,
      maxOutputTokens: 12_000,
    });
    return {
      user_facing_document: object.user_facing_document.trim(),
      findings_summary: {
        key: object.findings_summary.key.trim(),
        value: object.findings_summary.value,
      },
    };
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) {
      throw new Agent7ResearchCycleError("Finalize: structured output failed.", { cause: e });
    }
    const msg = e instanceof Error ? e.message : "Agent 7 finalize failed";
    throw new Agent7ResearchCycleError(msg, e instanceof Error ? { cause: e } : undefined);
  }
}
