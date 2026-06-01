import { generateText } from "ai";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";
import { normalizeDimensionId, resolveResearchTaskDimensionId } from "@/lib/dimensionId";
import {
  ORCHESTRATOR_SYSTEM_PROMPT_FILE,
  getCurrentSessionId,
  getSessionOrchestratorStateDir,
  readWorkspaceText,
} from "@/lib/workspaceNode";
import path from "node:path";
import type {
  Agent7Dimension,
  Agent7KnownGapGroup,
  OrchestratorPlanOutput,
  OrchestratorDeliverOutput,
  PipelineConfig,
  PlannerResearchTask,
  ThesisEvolutionEntry,
  ThesisEvolutionFile,
  PlanAction,
} from "@/lib/types";
import type { SessionWorkerFinding } from "@/lib/sessionStorage";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/**
 * Named services available to the orchestrator at PLAN time.
 * Each entry is injected into the plan prompt under an [available_services] block.
 * Add new service keys here as the system grows — the prompt renderer picks them up automatically.
 */
export type OrchestratorServices = {
  /** Research domain rules, process guidelines, and user preferences. */
  domain_manual?: Record<string, unknown>;
  /**
   * Generalizable analytical patterns learned from prior research sessions.
   * Cross-session methodology insights, not company-specific facts.
   * Read from workspace/global/orchestrator-state/learned-patterns.md.
   */
  learned_patterns?: string;
  // Future services: competitor_profiles, market_data, custom_kb, …
};

/** Compact view of one worker finding passed to orchestrator review/deliver. */
export type ActiveFindingForOrchestrator = {
  dimension: string;
  factor: string;
  task_id: string;
  round: number;
  confidence: number;
  summary: string;
  gaps_remaining: string[];
  rabbithole_leads: string[];
};

// ---------------------------------------------------------------------------
// JSON parse helper
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
// System prompt loader
// ---------------------------------------------------------------------------

async function loadOrchestratorSystemPrompt(): Promise<string> {
  // Check for a session-specific override first, fall back to the global prompt.
  const sessionId = await getCurrentSessionId();
  const sessionPromptFile = path.join(
    getSessionOrchestratorStateDir(sessionId),
    "orchestrator-system-prompt.md",
  );
  const sessionText = (await readWorkspaceText(sessionPromptFile)).trim();
  if (sessionText.length > 0) return sessionText;

  const globalText = (await readWorkspaceText(ORCHESTRATOR_SYSTEM_PROMPT_FILE)).trim();
  if (globalText.length > 0) return globalText;

  throw new Error(
    `Orchestrator system prompt is missing or empty. Checked:\n  ${sessionPromptFile}\n  ${ORCHESTRATOR_SYSTEM_PROMPT_FILE}`,
  );
}

// ---------------------------------------------------------------------------
// Shared dimension/gap mappers
// ---------------------------------------------------------------------------

function mapRawDimensions(rows: Record<string, unknown>[]): Agent7Dimension[] {
  return rows.map((d) => ({
    id:
      typeof d.id === "string" && d.id.trim()
        ? normalizeDimensionId(d.id)
        : normalizeDimensionId(asString(d.label, "unknown")),
    label: asString(d.label, "unknown"),
    description: typeof d.description === "string" ? d.description.trim() : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Phase 1: Plan
// ---------------------------------------------------------------------------

/** Render an [available_services] block for the plan prompt. */
function buildServicesBlock(services: OrchestratorServices): string {
  const lines: string[] = ["[available_services]"];
  let hasAny = false;

  if (services.domain_manual && Object.keys(services.domain_manual).length > 0) {
    lines.push(
      "",
      "  [domain_manual]",
      "  Research domain rules, process steps, and sourcing guidelines.",
      JSON.stringify(services.domain_manual, null, 2),
    );
    hasAny = true;
  }

  if (services.learned_patterns?.trim()) {
    lines.push(
      "",
      "  [learned_patterns]",
      "  Generalizable analytical patterns from prior research sessions — apply where relevant.",
      services.learned_patterns.trim(),
    );
    hasAny = true;
  }

  // Future services are added here — same pattern, new key.

  if (!hasAny) return "";
  return lines.join("\n");
}

function buildPlanPrompt(input: {
  objective: string;
  subject_scope?: string;
  services: OrchestratorServices;
  user_preferences_summary: string;
  thesis_evolution: ThesisEvolutionFile;
  chat_history: string[];
  dimension_status: Record<string, "active" | "inactive">;
  inactive_dimension_summaries: { dimensionId: string; summary: string }[];
  active_dimension_files: Record<string, SessionWorkerFinding[]>;
  round: number;
}): string {
  const parts: string[] = [
    `PHASE: PLAN (Round ${input.round})`,
    "",
    `objective:\n"""${input.objective.trim()}"""`,
    "",
  ];

  if (input.subject_scope?.trim()) {
    parts.push(`subject_scope:\n${input.subject_scope.trim()}`, "");
  }

  const servicesBlock = buildServicesBlock(input.services);
  if (servicesBlock) {
    parts.push(servicesBlock, "");
  }

  parts.push(`user_preferences:\n${input.user_preferences_summary}`, "");

  // Thesis evolution
  if (input.thesis_evolution.rounds.length > 0) {
    parts.push(
      "[thesis evolution]",
      "How your analytical thinking developed in this session so far:",
      JSON.stringify(input.thesis_evolution.rounds, null, 2),
      "",
    );
  }

  // Chat history
  if (input.chat_history.length > 0) {
    parts.push("[chat history — last N user messages]");
    input.chat_history.forEach((msg, i) => {
      parts.push(`${i + 1}. ${msg}`);
    });
    parts.push("");
  }

  // Dimension status
  if (Object.keys(input.dimension_status).length > 0) {
    parts.push(
      "[dimension status]",
      JSON.stringify(input.dimension_status, null, 2),
      "",
    );
  }

  // Inactive dimension summaries
  if (input.inactive_dimension_summaries.length > 0) {
    parts.push("[inactive dimension summaries]");
    for (const s of input.inactive_dimension_summaries) {
      parts.push(`### ${s.dimensionId}`, s.summary, "");
    }
  }

  // Active dimension findings
  const activeDimIds = Object.keys(input.active_dimension_files);
  if (activeDimIds.length > 0) {
    parts.push("[active dimension findings]");
    for (const dimId of activeDimIds) {
      const findings = input.active_dimension_files[dimId]!;
      parts.push(`### ${dimId}`);
      for (const f of findings) {
        parts.push(
          `  [Round ${f.round}] factor: ${f.factor}`,
          `  summary: ${f.summary.slice(0, 500)}${f.summary.length > 500 ? "…" : ""}`,
          `  gaps_remaining: ${f.gaps_remaining.length > 0 ? f.gaps_remaining.join("; ") : "none"}`,
          f.rabbithole_leads.length > 0 ? `  rabbithole_leads: ${f.rabbithole_leads.join("; ")}` : "",
        );
      }
      parts.push("");
    }
  }

  parts.push(
    "Respond with a JSON object with these fields:",
    "{",
    '  "investment_thesis_draft": "string",',
    '  "thesis_evolution_entry": {',
    '    "investment_thesis": "string",',
    '    "dimensions": [{ "id": "slug", "label": "string", "description": "string" }],',
    '    "known_gaps": [{ "dimension": "string", "gaps": ["string"] }],',
    '    "key_findings": { "dimension-id": "finding summary" },',
    '    "notes": "string — full reasoning, observations, hypotheses",',
    '    "connections": ["string"],',
    '    "contradictions": ["string"]',
    "  },",
    '  "action": {',
    '    "type": "assign_tasks",',
    '    "tasks": [{',
    '      "task_id": "string",',
    '      "dimension": "string",',
    '      "factor": "string",',
    '      "goal": "string",',
    '      "search_guidance": ["string — concrete search queries"],',
    '      "priority": "high|medium|low"',
    "    }],",
    '    "execution_strategy": "all_parallel" or "two_phase",',
    '    "profile_task_id": "string (only if two_phase, must match a task_id)"',
    "  }",
    "}",
    "",
    'OR when ready to deliver (sufficient research done):',
    "{",
    '  "investment_thesis_draft": "string",',
    '  "thesis_evolution_entry": { ... },',
    '  "action": { "type": "deliver" }',
    "}",
    "",
    "Design 3-8 tasks when assigning. Output ONLY the JSON object.",
  );
  return parts.filter((line) => line !== undefined).join("\n");
}

function parsePlanOutput(raw: Record<string, unknown>, round: number, turn: number): OrchestratorPlanOutput {
  // Parse thesis_evolution_entry
  const entryRaw = raw.thesis_evolution_entry && typeof raw.thesis_evolution_entry === "object" && !Array.isArray(raw.thesis_evolution_entry)
    ? raw.thesis_evolution_entry as Record<string, unknown>
    : {};

  const dims = Array.isArray(entryRaw.dimensions) ? mapRawDimensions(entryRaw.dimensions as Record<string, unknown>[]) : [];

  const gapsRaw: Agent7KnownGapGroup[] = Array.isArray(entryRaw.known_gaps)
    ? (entryRaw.known_gaps as Record<string, unknown>[]).map((g) => ({
        dimension: typeof g.dimension === "string" ? g.dimension.trim() : undefined,
        gaps: asStringArray(g.gaps),
      })).filter((g) => g.gaps.length > 0)
    : [];

  const known_gaps = gapsRaw.map((g) => {
    const dimRaw = g.dimension?.trim();
    if (!dimRaw) return g;
    const match = dims.find(
      (x) => x.id === dimRaw || normalizeDimensionId(x.label) === normalizeDimensionId(dimRaw),
    );
    return { ...g, dimension: match ? match.id : normalizeDimensionId(dimRaw) };
  });

  const key_findings: Record<string, string> = (typeof entryRaw.key_findings === "object" && entryRaw.key_findings !== null && !Array.isArray(entryRaw.key_findings))
    ? Object.fromEntries(
        Object.entries(entryRaw.key_findings as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" ? v : String(v)])
      )
    : {};

  const thesis_evolution_entry: ThesisEvolutionEntry = {
    turn,
    round,
    investment_thesis: asString(entryRaw.investment_thesis, ""),
    dimensions: dims,
    known_gaps,
    key_findings,
    notes: asString(entryRaw.notes, ""),
    connections: asStringArray(entryRaw.connections),
    contradictions: asStringArray(entryRaw.contradictions),
  };

  // Parse action
  const actionRaw = raw.action && typeof raw.action === "object" && !Array.isArray(raw.action)
    ? raw.action as Record<string, unknown>
    : {};

  let action: PlanAction;

  if (actionRaw.type === "deliver") {
    action = { type: "deliver" };
  } else {
    // assign_tasks
    const tasksRaw: PlannerResearchTask[] = Array.isArray(actionRaw.tasks)
      ? (actionRaw.tasks as Record<string, unknown>[]).map((t) => ({
          task_id: asString(t.task_id, "task_1"),
          dimension: asString(t.dimension, "general"),
          factor: asString(t.factor, "general"),
          goal: asString(t.goal, ""),
          search_guidance: asStringArray(t.search_guidance),
          priority: (t.priority === "high" || t.priority === "medium" || t.priority === "low") ? t.priority : "medium" as const,
        }))
      : [];

    const tasks = tasksRaw.map((t) => ({
      ...t,
      dimension: resolveResearchTaskDimensionId(t.dimension, dims),
    }));

    const strategy = actionRaw.execution_strategy === "two_phase" ? "two_phase" as const : "all_parallel" as const;
    let profileTaskId = typeof actionRaw.profile_task_id === "string" ? actionRaw.profile_task_id.trim() : undefined;
    if (strategy === "two_phase" && profileTaskId && !tasks.some((t) => t.task_id === profileTaskId)) {
      profileTaskId = tasks[0]?.task_id;
    }

    action = {
      type: "assign_tasks",
      tasks,
      execution_strategy: strategy,
      profile_task_id: profileTaskId || undefined,
    };
  }

  return {
    investment_thesis_draft: asString(raw.investment_thesis_draft, ""),
    thesis_evolution_entry,
    action,
  };
}

export async function orchestratorPlan(input: {
  objective: string;
  subject_scope?: string;
  services: OrchestratorServices;
  user_preferences_summary: string;
  thesis_evolution: ThesisEvolutionFile;
  chat_history: string[];
  dimension_status: Record<string, "active" | "inactive">;
  inactive_dimension_summaries: { dimensionId: string; summary: string }[];
  active_dimension_files: Record<string, SessionWorkerFinding[]>;
  round: number;
  config: PipelineConfig;
}): Promise<OrchestratorPlanOutput> {
  const model = createBedrockLanguageModel();
  const system = await loadOrchestratorSystemPrompt();
  const prompt = buildPlanPrompt(input);

  const { text } = await generateText({
    model,
    system,
    prompt,
    temperature: input.config.orchestrator_temperature,
    maxOutputTokens: 8000,
  });

  const raw = extractJson(text);
  // turn = last round in thesis_evolution + 1, or 1 if first
  const turn = input.thesis_evolution.rounds.length > 0
    ? (input.thesis_evolution.rounds[input.thesis_evolution.rounds.length - 1]?.turn ?? 0) + 1
    : 1;
  return parsePlanOutput(raw, input.round, turn);
}

// ---------------------------------------------------------------------------
// Phase 2: Deliver
// ---------------------------------------------------------------------------

function buildActiveFindingsBlock(findings: ActiveFindingForOrchestrator[]): string {
  if (findings.length === 0) return "(none yet)";

  // Group by dimension
  const byDim = new Map<string, ActiveFindingForOrchestrator[]>();
  for (const f of findings) {
    const arr = byDim.get(f.dimension) ?? [];
    arr.push(f);
    byDim.set(f.dimension, arr);
  }

  const lines: string[] = [];
  for (const [dim, dimFindings] of byDim) {
    for (const f of dimFindings) {
      lines.push(
        `--- dimension: ${dim} / factor: ${f.factor} [task: ${f.task_id}, round: ${f.round}, confidence: ${f.confidence.toFixed(2)}] ---`,
        `Summary: ${f.summary}`,
        `Gaps remaining: ${f.gaps_remaining.length > 0 ? f.gaps_remaining.join("; ") : "none"}`,
      );
      if (f.rabbithole_leads.length > 0) {
        lines.push(`Rabbithole leads: ${f.rabbithole_leads.join("; ")}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

function buildDeliverPrompt(input: {
  objective: string;
  subject_scope?: string;
  user_preferences_summary: string;
  thesis_evolution: ThesisEvolutionFile;
  active_findings: ActiveFindingForOrchestrator[];
  inactive_summaries: { dimensionId: string; summary: string }[];
  connection_insights: string;
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

  // Render thesis evolution — last round's entry has the final state
  if (input.thesis_evolution.rounds.length > 0) {
    const lastEntry = input.thesis_evolution.rounds[input.thesis_evolution.rounds.length - 1]!;
    parts.push(
      "Investment thesis evolution (all rounds):",
      JSON.stringify(input.thesis_evolution.rounds, null, 2),
      "",
      `Final investment thesis: ${lastEntry.investment_thesis}`,
      `Final key_findings: ${JSON.stringify(lastEntry.key_findings, null, 2)}`,
      `Final connections: ${JSON.stringify(lastEntry.connections)}`,
      `Final contradictions: ${JSON.stringify(lastEntry.contradictions)}`,
      "",
    );
  }

  parts.push(
    "[ACTIVE DIMENSION FINDINGS]",
    "Full findings from live research dimensions:",
    "",
    buildActiveFindingsBlock(input.active_findings),
  );

  if (input.inactive_summaries.length > 0) {
    parts.push(
      "[CONCLUDED DIMENSION SUMMARIES]",
      "",
    );
    for (const s of input.inactive_summaries) {
      parts.push(`### ${s.dimensionId}`, s.summary, "");
    }
  }

  if (input.connection_insights.trim()) {
    parts.push(
      "[CROSS-DIMENSION CONNECTIONS]",
      input.connection_insights,
      "",
    );
  }

  parts.push(
    "Respond with a JSON object:",
    "{",
    '  "user_facing_document": "string — full Markdown investment research report with executive summary, analysis by dimension, source citations, caveats, and conclusions",',
    '  "key_findings": { "dimension_name": "finding summary", ... },',
    '  "dimensions": [{ "id": "stable-slug-id", "label": "string", "description": "string" }],',
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
  const dims = Array.isArray(raw.dimensions) ? mapRawDimensions(raw.dimensions as Record<string, unknown>[]) : [];

  const gapsRaw: Agent7KnownGapGroup[] = Array.isArray(raw.known_gaps)
    ? (raw.known_gaps as Record<string, unknown>[]).map((g) => ({
        dimension: typeof g.dimension === "string" ? g.dimension.trim() : undefined,
        gaps: asStringArray(g.gaps),
      })).filter((g) => g.gaps.length > 0)
    : [];

  const known_gaps = gapsRaw.map((g) => {
    const dimRaw = g.dimension?.trim();
    if (!dimRaw) return g;
    const match = dims.find(
      (x) => x.id === dimRaw || normalizeDimensionId(x.label) === normalizeDimensionId(dimRaw),
    );
    return { ...g, dimension: match ? match.id : normalizeDimensionId(dimRaw) };
  });

  return {
    user_facing_document: asString(raw.user_facing_document, "No report generated."),
    key_findings: (typeof raw.key_findings === "object" && raw.key_findings !== null && !Array.isArray(raw.key_findings))
      ? raw.key_findings as Record<string, unknown>
      : {},
    dimensions: dims,
    known_gaps,
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
  thesis_evolution: ThesisEvolutionFile;
  active_findings: ActiveFindingForOrchestrator[];
  inactive_summaries: { dimensionId: string; summary: string }[];
  connection_insights: string;
  rounds_completed: number;
  config: PipelineConfig;
}): Promise<OrchestratorDeliverOutput> {
  const model = createBedrockLanguageModel();
  const system = await loadOrchestratorSystemPrompt();
  const prompt = buildDeliverPrompt(input);

  const { text } = await generateText({
    model,
    system,
    prompt,
    temperature: input.config.orchestrator_temperature,
    maxOutputTokens: input.config.deliver_max_tokens,
  });

  const raw = extractJson(text);
  return parseDeliverOutput(raw);
}
