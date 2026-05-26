// Agent 4 — page text from Parallel extract; consumed by `enrichWorkerOutputWithAgent4Extract`
export interface RetrievedPage {
  url: string;
  /** Omitted in some JSON bodies; treat as unknown when absent */
  author?: string | null;
  publication?: string | null;
  year?: number | null;
  cleanText: string;
  httpStatus: number;
  /** Set when Parallel extract failed for this URL */
  extract_error?: string;
}

/** URL (normalized) → page; stable JSON key = normalized URL string */
export type ExtractBundle = Record<string, RetrievedPage>;

// ---------------------------------------------------------------------------
// Shared dimension / gap types (used by orchestrator pipeline)
// ---------------------------------------------------------------------------

/** Sub-topic lens for the objective (e.g. market size, competitors, technology). */
export interface Agent7Dimension {
  /**
   * Stable id (slug) for file names and matching — e.g. company-archetypes, competitive-dynamics.
   * Must match research_task.dimension for tasks under this lens.
   */
  id: string;
  /** Human-readable title for UI and markdown headers. */
  label: string;
  description?: string;
}

/** Missing info / evidence before a solid answer — often per-dimension; omit dimension for objective-level scope gaps. */
export interface Agent7KnownGapGroup {
  /** When set, must be a **dimension id** (same as dimensions[].id). */
  dimension?: string;
  gaps: string[];
}

// ---------------------------------------------------------------------------
// Worker extracted data
// ---------------------------------------------------------------------------

/** Signal levels for extraction quality hints. */
export type Agent6ExtractSignalLevel = "high" | "medium" | "low";

/**
 * One structured extraction row from web search (research worker).
 * Atomic bullet-like strings; avoid single-sentence compression.
 */
export interface ExtractedKeyDatum {
  entity: string;
  type?: string;
  what_it_does: string[];
  how_it_works?: string[];
  target_users?: string[];
  use_cases?: string[];
  differentiation_signals?: string[];
  key_features?: string[];
  evidence_snippets?: string[];
  signals?: {
    novelty?: Agent6ExtractSignalLevel;
    specificity?: Agent6ExtractSignalLevel;
    clarity?: Agent6ExtractSignalLevel;
  };
  status: "found" | "partial" | "not_found";
  /** Must match a returned hit URL when present (enforced server-side when possible). */
  source_url?: string;
}

// ---------------------------------------------------------------------------
// Parallel Pipeline Types
// ---------------------------------------------------------------------------

export type IntentClassification = {
  intent: "chat" | "research";
  has_preference_signal: boolean;
  reasoning: string;
  chat_reply?: string;
};

export interface PlannerResearchTask {
  task_id: string;
  dimension: string;
  factor: string;
  goal: string;
  context?: Record<string, unknown>;
  search_guidance: string[];
  variables_to_find?: string[];
  extraction_focus?: string;
  priority: "high" | "medium" | "low";
  follow_domain_manual?: boolean;
}

export interface WorkerSourceRow {
  url: string;
  title?: string;
  relevance: string;
  data_noted: string;
  /** Agent 4: Parallel `beta.extract` body text (excerpts / full_content), attached server-side after the worker runs */
  verbatim_extract?: string;
}

export interface WorkerOutput {
  task_id: string;
  dimension: string;
  factor: string;
  summary: string;
  sources: WorkerSourceRow[];
  extracted_data: ExtractedKeyDatum[];
  confidence: number;
  gaps_remaining: string[];
  search_queries_used: string[];
  rabbithole_leads?: string[];
}

export interface CoverageAssessment {
  dimension: string;
  score: number;
  reasoning: string;
}

export type PreferenceScope = "session" | "conditional_global" | "global";

export interface UserPreference {
  id: string;
  rule: string;
  source: string;
  added: string;
  context_when_stated: string;
}

export interface ConditionalPreference extends UserPreference {
  condition: string;
}

export interface PendingPromotion {
  pattern: string;
  occurrences: { date: string; context: string }[];
  times_seen: number;
  promote_threshold: number;
  candidate_rule: string;
  candidate_scope: "conditional_global" | "global";
}

export interface DomainManualUserPreferences {
  global: UserPreference[];
  conditional: ConditionalPreference[];
  pending_promotions: PendingPromotion[];
}

export interface SessionPreference {
  rule: string;
  source: string;
  added: string;
}

export interface PreferencesAgentOutput {
  scope: PreferenceScope;
  notification: string;
  domain_manual_patch?: {
    add_global?: UserPreference[];
    add_conditional?: ConditionalPreference[];
    add_pending_promotion?: PendingPromotion[];
    promote_pending?: string[];
  };
  session_preference?: SessionPreference;
}

// ---------------------------------------------------------------------------
// Pipeline Config
// ---------------------------------------------------------------------------

export interface PipelineConfig {
  max_rounds: number;
  max_workers_concurrent: number;
  worker_stagger_ms: number;
  max_worker_steps: number;
  max_tasks_per_round: number;
  orchestrator_temperature: number;
  worker_temperature: number;
  deliver_max_tokens: number;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  max_rounds: 5,
  max_workers_concurrent: 2,
  worker_stagger_ms: 2000,
  max_worker_steps: 5,
  max_tasks_per_round: 8,
  orchestrator_temperature: 0.2,
  worker_temperature: 0.2,
  deliver_max_tokens: 16_000,
};

// ---------------------------------------------------------------------------
// Orchestrator Types
// ---------------------------------------------------------------------------

export interface OrchestratorPlanOutput {
  objective_understanding: string;
  investment_thesis_draft: string;
  dimensions: Agent7Dimension[];
  known_gaps: Agent7KnownGapGroup[];
  tasks: PlannerResearchTask[];
  execution_strategy: "all_parallel" | "two_phase";
  profile_task_id?: string;
  working_notes: string;
}

export interface OrchestratorReviewOutput {
  working_notes: string;
  key_findings: Record<string, unknown>;
  coverage_assessment: CoverageAssessment[];
  dimensions: Agent7Dimension[];
  known_gaps: Agent7KnownGapGroup[];
  contradictions: string[];
  connections: string[];
  decision: { action: "dig_deeper"; tasks: PlannerResearchTask[] } | { action: "deliver" };
}

export interface OrchestratorDeliverOutput {
  user_facing_document: string;
  key_findings: Record<string, unknown>;
  dimensions: Agent7Dimension[];
  known_gaps: Agent7KnownGapGroup[];
  findings_summary: { key: string; value: unknown };
  investment_thesis: string;
}

// ---------------------------------------------------------------------------
// Pipeline Steps & Result
// ---------------------------------------------------------------------------

export type ParallelPipelineStep =
  | { kind: "intent"; result: IntentClassification }
  | { kind: "orchestrator_plan"; result: OrchestratorPlanOutput }
  | { kind: "worker"; task_id: string; round: number; result: WorkerOutput }
  | { kind: "orchestrator_review"; round: number; result: OrchestratorReviewOutput }
  | { kind: "orchestrator_deliver"; result: OrchestratorDeliverOutput }
  | { kind: "preferences"; result: PreferencesAgentOutput };

export type ParallelPipelineResult =
  | {
      success: true;
      stopped: "user_deliver" | "ask_user" | "chat_reply";
      document_markdown: string;
      key_findings: Record<string, unknown>;
      dimensions: Agent7Dimension[];
      known_gaps: Agent7KnownGapGroup[];
      chat_memory_path: string;
      user_output_path: string;
      preference_notification?: string;
      session_preferences?: SessionPreference[];
      rounds_completed: number;
      steps: ParallelPipelineStep[];
    }
  | { success: false; error: string; steps?: ParallelPipelineStep[] };
