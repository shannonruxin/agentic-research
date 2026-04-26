import { generateText } from "ai";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";
import type {
  Agent7Dimension,
  Agent7KnownGapGroup,
  CoverageAssessment,
  OrchestratorPlanOutput,
  OrchestratorReviewOutput,
  OrchestratorDeliverOutput,
  PipelineConfig,
  PlannerResearchTask,
  WorkerOutput,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// JSON parse helper (same approach that works reliably for workers)
// ---------------------------------------------------------------------------

function extractJson(text: string): Record<string, unknown> {
  let str = text.trim();
  const fence = str.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) str = fence[1]!.trim();
  const start = str.indexOf("{");
  const end = str.lastIndexOf("}");
  if (start !== -1 && end > start) str = str.slice(start, end + 1);
  return JSON.parse(str) as Record<string, unknown>;
}

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((s) => s.trim());
}

// ---------------------------------------------------------------------------
// System prompt — same persona across all 3 phases
// ---------------------------------------------------------------------------

const ORCHESTRATOR_SYSTEM = `You are the Chief Research Analyst — a senior investment analyst conducting deep due diligence. You think like an investor: every piece of information is evaluated for what it reveals about value creation, competitive positioning, risk, and opportunity.

You operate in three phases across multiple rounds:

PLAN (Round 1): Given an objective, decompose it into parallel research tasks. Think about what an analyst would need to build a complete investment picture:
- Business model and revenue mechanics
- Competitive landscape and market positioning
- Technology moats and IP
- Management quality signals
- Financial health and trajectory
- Regulatory and macro risk exposure
Design tasks that are independent enough to run in parallel but collectively cover all angles. Choose "two_phase" when you need to identify the subject before deeper analysis (e.g., unfamiliar company → profile first, then analyze).

REVIEW (Round 2+): You receive worker findings and must think investigatively:
- What contradictions exist between sources? (e.g., company claims 40% growth but job postings are flat)
- What connections emerge across dimensions? (e.g., patent filings align with new product rumors)
- What rabbithole leads deserve pursuit? (workers may flag specific companies, patents, or datasets)
- What's the emerging investment thesis? Is it strengthening or weakening?
- Where are the critical gaps that would change your recommendation?
When issuing follow-up tasks, reference SPECIFIC findings: "Worker found revenue dropped 20% in Q3 2024 — investigate whether this correlates with the CTO departure reported in the leadership task." Do NOT repeat queries that already ran. Refine, cross-reference, and dig deeper.

DELIVER (Final): Synthesize everything into a compelling, evidence-grounded investment research document. Write like a top-tier analyst: specific numbers, named sources, clear thesis, honest about what you don't know. No filler, no generic statements.

Throughout all phases:
- Your working_notes are your private scratchpad — use them to track hypotheses, contradictions, and evolving thesis
- Never fabricate data, URLs, or quotes
- Apply user preferences (global and conditional) to shape research focus
- You are conducting due diligence, not writing a Wikipedia article — always ask "so what does this mean for the investment case?"

IMPORTANT: Your response MUST be a single valid JSON object. No markdown fences, no text before or after. Just the JSON.`;

// ---------------------------------------------------------------------------
// Phase 1: Plan
// ---------------------------------------------------------------------------

function buildPlanPrompt(input: {
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
    "PHASE: PLAN (Round 1)",
    "",
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

  parts.push(
    "Respond with a JSON object with these fields:",
    "{",
    '  "objective_understanding": "string — restatement of the investment question",',
    '  "investment_thesis_draft": "string — initial hypothesis to test",',
    '  "dimensions": [{ "label": "string", "description": "string" }],',
    '  "known_gaps": [{ "dimension": "string", "gaps": ["string"] }],',
    '  "tasks": [{',
    '    "task_id": "string",',
    '    "dimension": "string",',
    '    "factor": "string",',
    '    "goal": "string",',
    '    "search_guidance": ["string — concrete search queries"],',
    '    "priority": "high|medium|low"',
    "  }],",
    '  "execution_strategy": "all_parallel" or "two_phase",',
    '  "profile_task_id": "string (only if two_phase, must match a task_id)",',
    '  "working_notes": "string — your initial hypotheses and reasoning"',
    "}",
    "",
    "Design 3-8 tasks. Output ONLY the JSON object.",
  );
  return parts.join("\n");
}

function parsePlanOutput(raw: Record<string, unknown>): OrchestratorPlanOutput {
  const tasks: PlannerResearchTask[] = Array.isArray(raw.tasks)
    ? (raw.tasks as Record<string, unknown>[]).map((t) => ({
        task_id: asString(t.task_id, "task_1"),
        dimension: asString(t.dimension, "general"),
        factor: asString(t.factor, "general"),
        goal: asString(t.goal, ""),
        search_guidance: asStringArray(t.search_guidance),
        variables_to_find: t.variables_to_find ? asStringArray(t.variables_to_find) : undefined,
        extraction_focus: typeof t.extraction_focus === "string" ? t.extraction_focus.trim() : undefined,
        priority: (t.priority === "high" || t.priority === "medium" || t.priority === "low") ? t.priority : "medium" as const,
      }))
    : [];

  const dims: Agent7Dimension[] = Array.isArray(raw.dimensions)
    ? (raw.dimensions as Record<string, unknown>[]).map((d) => ({
        label: asString(d.label, "unknown"),
        description: typeof d.description === "string" ? d.description.trim() : undefined,
      }))
    : [];

  const gaps: Agent7KnownGapGroup[] = Array.isArray(raw.known_gaps)
    ? (raw.known_gaps as Record<string, unknown>[]).map((g) => ({
        dimension: typeof g.dimension === "string" ? g.dimension.trim() : undefined,
        gaps: asStringArray(g.gaps),
      })).filter((g) => g.gaps.length > 0)
    : [];

  const strategy = raw.execution_strategy === "two_phase" ? "two_phase" as const : "all_parallel" as const;
  let profileTaskId = typeof raw.profile_task_id === "string" ? raw.profile_task_id.trim() : undefined;
  if (strategy === "two_phase" && profileTaskId && !tasks.some((t) => t.task_id === profileTaskId)) {
    profileTaskId = tasks[0]?.task_id;
  }

  return {
    objective_understanding: asString(raw.objective_understanding, ""),
    investment_thesis_draft: asString(raw.investment_thesis_draft, ""),
    dimensions: dims,
    known_gaps: gaps,
    tasks,
    execution_strategy: strategy,
    profile_task_id: profileTaskId || undefined,
    working_notes: asString(raw.working_notes, ""),
  };
}

export async function orchestratorPlan(input: {
  objective: string;
  subject_scope?: string;
  domain_manual: Record<string, unknown>;
  conversation_context: string;
  user_preferences_summary: string;
  research_hygiene?: Record<string, unknown>;
  prior_key_findings?: Record<string, unknown>;
  prior_dimensions?: Agent7Dimension[];
  prior_known_gaps?: Agent7KnownGapGroup[];
  config: PipelineConfig;
}): Promise<OrchestratorPlanOutput> {
  const model = createBedrockLanguageModel();
  const prompt = buildPlanPrompt(input);

  const { text } = await generateText({
    model,
    system: ORCHESTRATOR_SYSTEM,
    prompt,
    temperature: input.config.orchestrator_temperature,
    maxOutputTokens: 8000,
  });

  const raw = extractJson(text);
  return parsePlanOutput(raw);
}

// ---------------------------------------------------------------------------
// Phase 2: Review (runs after each worker round)
// ---------------------------------------------------------------------------

function buildReviewPrompt(input: {
  objective: string;
  subject_scope?: string;
  user_preferences_summary: string;
  plan: OrchestratorPlanOutput;
  all_worker_results: WorkerOutput[];
  round: number;
  max_rounds: number;
  prior_review?: OrchestratorReviewOutput;
}): string {
  const parts: string[] = [
    `PHASE: REVIEW (Round ${input.round} of ${input.max_rounds})`,
    "",
    `objective:\n"""${input.objective.trim()}"""`,
    "",
  ];

  if (input.subject_scope?.trim()) {
    parts.push(`subject_scope:\n${input.subject_scope.trim()}`, "");
  }

  parts.push(`user_preferences:\n${input.user_preferences_summary}`, "");

  parts.push(
    "Your initial plan and thesis:",
    `investment_thesis_draft: ${input.plan.investment_thesis_draft}`,
    `working_notes from plan: ${input.plan.working_notes}`,
    "",
  );

  if (input.prior_review) {
    parts.push(
      "Your review from previous round:",
      `working_notes: ${input.prior_review.working_notes}`,
      `key_findings: ${JSON.stringify(input.prior_review.key_findings, null, 2)}`,
      `contradictions: ${JSON.stringify(input.prior_review.contradictions)}`,
      `connections: ${JSON.stringify(input.prior_review.connections)}`,
      "",
    );
  }

  parts.push("ALL worker results collected so far:");
  for (const wr of input.all_worker_results) {
    parts.push(
      `\n--- Task: ${wr.task_id} (${wr.dimension} / ${wr.factor}) [confidence: ${wr.confidence}] ---`,
      `Summary: ${wr.summary}`,
      `Sources: ${JSON.stringify(wr.sources, null, 2)}`,
      `Extracted data: ${JSON.stringify(wr.extracted_data, null, 2)}`,
      `Gaps remaining: ${JSON.stringify(wr.gaps_remaining)}`,
      `Queries used: ${JSON.stringify(wr.search_queries_used)}`,
    );
    if (wr.rabbithole_leads?.length) {
      parts.push(`Rabbithole leads: ${JSON.stringify(wr.rabbithole_leads)}`);
    }
  }

  parts.push("");

  if (input.round >= input.max_rounds) {
    parts.push(
      "IMPORTANT: This is the FINAL round. You MUST set decision_action to 'deliver'.",
      "Set follow_up_tasks to an empty array.",
      "",
    );
  } else {
    parts.push(
      "Review the evidence investigatively.",
      "If critical gaps remain, set decision_action to 'dig_deeper' and provide follow_up_tasks.",
      "If coverage is sufficient, set decision_action to 'deliver'.",
      "",
    );
  }

  parts.push(
    "Respond with a JSON object:",
    "{",
    '  "working_notes": "string — evolving thesis and reasoning",',
    '  "key_findings": { "dimension_name": "finding summary", ... },',
    '  "coverage_assessment": [{ "dimension": "string", "score": 0.0-1.0, "reasoning": "string" }],',
    '  "dimensions": [{ "label": "string", "description": "string" }],',
    '  "known_gaps": [{ "dimension": "string", "gaps": ["string"] }],',
    '  "contradictions": ["string"],',
    '  "connections": ["string"],',
    '  "decision_action": "dig_deeper" or "deliver",',
    '  "follow_up_tasks": [{ "task_id": "string", "dimension": "string", "factor": "string", "goal": "string", "search_guidance": ["string"], "priority": "high|medium|low" }]',
    "}",
    "",
    "Output ONLY the JSON object.",
  );
  return parts.join("\n");
}

function parseReviewOutput(raw: Record<string, unknown>): OrchestratorReviewOutput {
  const dims: Agent7Dimension[] = Array.isArray(raw.dimensions)
    ? (raw.dimensions as Record<string, unknown>[]).map((d) => ({
        label: asString(d.label, "unknown"),
        description: typeof d.description === "string" ? d.description.trim() : undefined,
      }))
    : [];

  const gaps: Agent7KnownGapGroup[] = Array.isArray(raw.known_gaps)
    ? (raw.known_gaps as Record<string, unknown>[]).map((g) => ({
        dimension: typeof g.dimension === "string" ? g.dimension.trim() : undefined,
        gaps: asStringArray(g.gaps),
      })).filter((g) => g.gaps.length > 0)
    : [];

  const coverage: CoverageAssessment[] = Array.isArray(raw.coverage_assessment)
    ? (raw.coverage_assessment as Record<string, unknown>[]).map((c) => ({
        dimension: asString(c.dimension, "unknown"),
        score: typeof c.score === "number" ? c.score : 0.5,
        reasoning: asString(c.reasoning, ""),
      }))
    : [];

  const followUpTasks: PlannerResearchTask[] = Array.isArray(raw.follow_up_tasks)
    ? (raw.follow_up_tasks as Record<string, unknown>[]).map((t) => ({
        task_id: asString(t.task_id, "task_1"),
        dimension: asString(t.dimension, "general"),
        factor: asString(t.factor, "general"),
        goal: asString(t.goal, ""),
        search_guidance: asStringArray(t.search_guidance),
        priority: (t.priority === "high" || t.priority === "medium" || t.priority === "low") ? t.priority : "medium" as const,
      }))
    : [];

  const action = raw.decision_action === "dig_deeper" && followUpTasks.length > 0
    ? "dig_deeper" as const
    : "deliver" as const;

  return {
    working_notes: asString(raw.working_notes, ""),
    key_findings: (typeof raw.key_findings === "object" && raw.key_findings !== null && !Array.isArray(raw.key_findings))
      ? raw.key_findings as Record<string, unknown>
      : {},
    coverage_assessment: coverage,
    dimensions: dims,
    known_gaps: gaps,
    contradictions: asStringArray(raw.contradictions),
    connections: asStringArray(raw.connections),
    decision: action === "deliver"
      ? { action: "deliver" as const }
      : { action: "dig_deeper" as const, tasks: followUpTasks },
  };
}

export async function orchestratorReview(input: {
  objective: string;
  subject_scope?: string;
  user_preferences_summary: string;
  plan: OrchestratorPlanOutput;
  all_worker_results: WorkerOutput[];
  round: number;
  max_rounds: number;
  prior_review?: OrchestratorReviewOutput;
  config: PipelineConfig;
}): Promise<OrchestratorReviewOutput> {
  const model = createBedrockLanguageModel();
  const prompt = buildReviewPrompt(input);

  const { text } = await generateText({
    model,
    system: ORCHESTRATOR_SYSTEM,
    prompt,
    temperature: input.config.orchestrator_temperature,
    maxOutputTokens: 8000,
  });

  const raw = extractJson(text);
  return parseReviewOutput(raw);
}

// ---------------------------------------------------------------------------
// Phase 3: Deliver (final synthesis)
// ---------------------------------------------------------------------------

function buildDeliverPrompt(input: {
  objective: string;
  subject_scope?: string;
  user_preferences_summary: string;
  plan: OrchestratorPlanOutput;
  all_worker_results: WorkerOutput[];
  final_review: OrchestratorReviewOutput;
  rounds_completed: number;
}): string {
  const parts: string[] = [
    `PHASE: DELIVER (after ${input.rounds_completed} round(s) of research)`,
    "",
    `objective:\n"""${input.objective.trim()}"""`,
    "",
  ];

  if (input.subject_scope?.trim()) {
    parts.push(`subject_scope:\n${input.subject_scope.trim()}`, "");
  }

  parts.push(`user_preferences:\n${input.user_preferences_summary}`, "");

  parts.push(
    "Your investment thesis evolution:",
    `Initial draft: ${input.plan.investment_thesis_draft}`,
    `Plan working_notes: ${input.plan.working_notes}`,
    `Final review working_notes: ${input.final_review.working_notes}`,
    "",
  );

  parts.push(
    "Final review findings:",
    `key_findings: ${JSON.stringify(input.final_review.key_findings, null, 2)}`,
    `contradictions: ${JSON.stringify(input.final_review.contradictions)}`,
    `connections: ${JSON.stringify(input.final_review.connections)}`,
    `coverage_assessment: ${JSON.stringify(input.final_review.coverage_assessment, null, 2)}`,
    `known_gaps: ${JSON.stringify(input.final_review.known_gaps, null, 2)}`,
    "",
  );

  parts.push("ALL worker results:");
  for (const wr of input.all_worker_results) {
    parts.push(
      `\n--- Task: ${wr.task_id} (${wr.dimension} / ${wr.factor}) [confidence: ${wr.confidence}] ---`,
      `Summary: ${wr.summary}`,
      `Sources: ${JSON.stringify(wr.sources, null, 2)}`,
      `Extracted data: ${JSON.stringify(wr.extracted_data, null, 2)}`,
    );
  }

  parts.push(
    "",
    "Respond with a JSON object:",
    "{",
    '  "user_facing_document": "string — full Markdown investment research report with executive summary, analysis by dimension, source citations, caveats, and conclusions",',
    '  "key_findings": { "dimension_name": "finding summary", ... },',
    '  "dimensions": [{ "label": "string", "description": "string" }],',
    '  "known_gaps": [{ "dimension": "string", "gaps": ["string"] }],',
    '  "findings_summary_key": "string — descriptive label e.g. \'Aerodyne Group Analysis\'",',
    '  "findings_summary_value": { ... structured summary data ... },',
    '  "investment_thesis": "string — concise 2-4 sentence thesis statement"',
    "}",
    "",
    "Output ONLY the JSON object.",
  );

  return parts.join("\n");
}

function parseDeliverOutput(raw: Record<string, unknown>): OrchestratorDeliverOutput {
  const dims: Agent7Dimension[] = Array.isArray(raw.dimensions)
    ? (raw.dimensions as Record<string, unknown>[]).map((d) => ({
        label: asString(d.label, "unknown"),
        description: typeof d.description === "string" ? d.description.trim() : undefined,
      }))
    : [];

  const gaps: Agent7KnownGapGroup[] = Array.isArray(raw.known_gaps)
    ? (raw.known_gaps as Record<string, unknown>[]).map((g) => ({
        dimension: typeof g.dimension === "string" ? g.dimension.trim() : undefined,
        gaps: asStringArray(g.gaps),
      })).filter((g) => g.gaps.length > 0)
    : [];

  return {
    user_facing_document: asString(raw.user_facing_document, "No report generated."),
    key_findings: (typeof raw.key_findings === "object" && raw.key_findings !== null && !Array.isArray(raw.key_findings))
      ? raw.key_findings as Record<string, unknown>
      : {},
    dimensions: dims,
    known_gaps: gaps,
    findings_summary: {
      key: asString(raw.findings_summary_key, "Research Summary"),
      value: raw.findings_summary_value ?? {},
    },
    investment_thesis: asString(raw.investment_thesis, ""),
  };
}

export async function orchestratorDeliver(input: {
  objective: string;
  subject_scope?: string;
  user_preferences_summary: string;
  plan: OrchestratorPlanOutput;
  all_worker_results: WorkerOutput[];
  final_review: OrchestratorReviewOutput;
  rounds_completed: number;
  config: PipelineConfig;
}): Promise<OrchestratorDeliverOutput> {
  const model = createBedrockLanguageModel();
  const prompt = buildDeliverPrompt(input);

  const { text } = await generateText({
    model,
    system: ORCHESTRATOR_SYSTEM,
    prompt,
    temperature: input.config.orchestrator_temperature,
    maxOutputTokens: input.config.deliver_max_tokens,
  });

  const raw = extractJson(text);
  return parseDeliverOutput(raw);
}
