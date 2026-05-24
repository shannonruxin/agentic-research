// Agent 1 output (Query Decomposition)
export interface SupportAngle {
  id: string;          // e.g. "angle_1"
  label: string;       // e.g. "meta-analysis"
  description: string;
}

export interface QueryDecomposition {
  /** Single normalized, investigable query. */
  core_query: string;
  keywords: string[];
  support_angles: SupportAngle[];
}

/** One planned web search under a support angle (Agent 2). */
export interface StrategyQueryItem {
  type: string;        // e.g. "baseline" | "deep_dive"
  query: string;       // string passed to search APIs
  reasoning: string;
}

// Agent 2 output — keyed by `support_angles[].id`
export interface SearchQueries {
  [angleId: string]: StrategyQueryItem[];
}

// --- Target pipeline: AIAnswer → Agent 3 —

export interface AIAnswerDeclaredSource {
  url: string;
  title?: string | null;
}

export interface AIAnswerOutput {
  answer_text: string;
  declared_sources: AIAnswerDeclaredSource[];
}

export interface EvidenceSegment {
  segment_id: string;
  /** Exact substring of AIAnswer.answer_text for flow ordering */
  quote_from_ai_answer: string;
  intent?: string;
  /** Cynical audit question: what to validate or falsify for this span */
  verification_challenge: string;
}

export type Agent3ResourceStatus = "ok" | "fetch_failed" | "not_credible" | "pending";

export interface Agent3ResourceRow {
  url: string;
  segment_ids: string[];
  angle_id?: string;
  title?: string | null;
  status: Agent3ResourceStatus;
  notes?: string;
}

export interface Agent3EvidencePlan {
  evidence_segments: EvidenceSegment[];
  resources: Agent3ResourceRow[];
}

// Agent 4 — page text after Parallel extract (Agent 3 credibility filter may gate later use)
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

/** Agent 5 — substring-safe crop aligned to AIAnswer flow */
export interface CroppedEvidenceItem {
  /** Order by first occurrence of supporting quote in `answer_text` */
  flow_index: number;
  segment_ids: string[];
  url: string;
  cropped_text: string;
  location_hint?: string;
  author?: string;
  publication?: string;
  year?: number | string;
}

/** Full target pipeline API response (dual-column UI) */
export interface PipelineDualColumnResponse {
  /** User or decomposition **`core_query`**; same as request `query` when decomposition omitted. */
  core_query: string;
  decomposition?: QueryDecomposition;
  ai_answer: AIAnswerOutput;
  agent3_plan: Agent3EvidencePlan;
  evidence_items: CroppedEvidenceItem[];
  pipeline_run_id?: string;
}

// Agent 4 output
export interface VerbatimExtract {
  text: string;          // exact 2–3 sentence passage, word-for-word
  location_hint: string; // paragraph index or section heading
}

// Agent 4 rejection
export interface ExtractionRejection {
  rejected: true;
  reason: string;
}

// Agent 5 output
export interface ScoreBreakdown {
  directness: number;
  quantitative_strength: number;
  causal_language: number;
  scale: number;
  authority: number;
  recency: number;
}

export interface SourceMetadata {
  url: string;
  author: string;
  publication: string;
  year: number | string; // "Not available" if missing
}

export interface ScoredEvidence {
  angle_id: string;
  core_query: string;
  extract: VerbatimExtract;
  source: SourceMetadata;
  breakdown: ScoreBreakdown;
  total_score: number;
}

// Agent 6 / Output Formatter
export interface EvidenceResult {
  rank: number;
  total_score: number;
  author: string;
  publication: string;
  year: number | string;
  url: string;
  verbatim_extract: string;
  location_hint: string;
  breakdown: ScoreBreakdown;
}

export interface Top3Result {
  core_query: string;
  results: EvidenceResult[]; // 0–3 items
  pipeline_run_id: string;
}

// --- Agent 7 — orchestrator / judge ---

export interface Agent7Confidence {
  level: "low" | "medium" | "high";
  rationale?: string;
}

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
  /** When set, must be a **dimension id** (same as dimensions[].id), or legacy label text coerced to id. */
  dimension?: string;
  gaps: string[];
}

export type Agent7Assignee = "agent3_agent6" | "agent4_agent5" | "agent8";

/** Full research task handed to Agent 3+6 (design-phase2 task schema). */
export interface Agent7ResearchTask {
  task_id: string;
  dimension: string;
  factor: string;
  goal: string;
  context?: Record<string, unknown>;
  method_instructions?: string[];
  variables_to_find?: string[];
  calculation_logic?: string;
  search_guidance?: string[];
  validation_criteria?: string[];
  adaptation_signals?: string[];
  fallback_methods?: string[];
  success_criteria?: string[];
  priority: "high" | "medium" | "low";
  expected_output_format?: string[];
  /**
   * Set by Agent 7 per task. When `false`, Agent 3/6 do not load `workspace/domain-manuals/domain-manual.json`.
   * When omitted or `true`, they use that file. Use `false` when the task is unrelated to the manual.
   */
  follow_domain_manual?: boolean;
}

export interface Agent7Assignment {
  assignee: Agent7Assignee;
  /** Why this assignee / how it fits the plan. */
  summary?: string;
  research_task?: Agent7ResearchTask;
  /** Short brief for verbatim extract+crop when assignee is agent4_agent5. */
  verbatim_brief?: string;
  /** Instructions for Agent 8 memory merge when assignee is agent8. */
  memory_directive?: string;
}

/** Result of one Agent 7 orchestration step (may be iterated with prior key_findings). */
export interface Agent7OrchestrateResult {
  objective_understanding: string;
  /** Sub-considerations Agent 7 uses to structure the topic. */
  dimensions: Agent7Dimension[];
  key_findings: Record<string, unknown>;
  /** Grouped known gaps — includes first-turn “need more info” under dimensions or objective scope. */
  known_gaps: Agent7KnownGapGroup[];
  confidence: Agent7Confidence;
  /** Orchestrator reasoning trace for review. */
  train_of_thought: string;
  /** Concrete handoffs: who does what next (dispatch not executed in sandbox). */
  assignments: Agent7Assignment[];
}

// --- Phase 2 — Agent 6 / Agent 3 research task execution (design-phase2) ---

/** Input to Phase 2 research-task runners; same shape as **`assignments[].research_task`**. */
export type ResearchTaskInput = Agent7ResearchTask;

/** Signal levels for extraction quality hints (Agent 6 Phase 2). */
export type Agent6ExtractSignalLevel = "high" | "medium" | "low";

/**
 * One structured extraction row from web search (Agent 6 Phase 2).
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

/** Structured result of one Agent 6 Phase 2 pass over a **`research_task`**. */
export interface Agent6ResearchRunResult {
  queries_used: string[];
  source_urls: string[];
  extracted_key_data: ExtractedKeyDatum[];
  parallel_search_id?: string | null;
}

export interface Agent3TaskAssumption {
  name: string;
  type: "data_backed" | "benchmark_based" | "speculative";
  justification?: string;
  source?: string;
  risk_level: "low" | "medium" | "high";
}

/** Task-level confidence breakdown (design-phase2 § Confidence — Agent 3). */
export interface Agent3TaskConfidence {
  score: number;
  breakdown: {
    data_quality: number;
    source_agreement: number;
    assumption_strength: number;
    method_fit: number;
    coverage_completeness: number;
  };
  reasoning: string[];
}

export interface Agent3TaskSourceRow {
  url: string;
  relevance: string;
  data_noted: string;
}

/** Progress / stagnation signals across Agent 3 ↔ Agent 6 iterations. */
export interface Agent3ProgressMetrics {
  iterations_so_far: number;
  /** New signals or concepts vs all prior iterations (not raw entity count). */
  new_info_count: number;
  /** Share of this iteration repeating the immediately previous iteration. */
  overlap_rate: number;
  /** Share of this iteration repeating anything seen in any prior iteration. */
  cumulative_overlap_rate: number;
  /** Share of sources in this iteration not seen before. */
  source_novelty: number;
  trend: "increasing" | "stable" | "declining";
}

/** Entity bookkeeping for query strategy (Agent 3 Phase 2). */
export interface Agent3EntityTracking {
  total_entities: number;
  new_entities: string[];
  repeated_entities: string[];
  high_relevance_entities: string[];
  high_rabbithole_entities: string[];
}

/** Decision block for research_log / unified Agent 3 (mirrors research_log[].decision). */
export interface Agent3ResearchDecision {
  needs_further_search: boolean;
  reason: string;
  suggested_direction?: string;
  suggested_queries?: string[];
}

/** Per-iteration memory for Agent 3 Phase 2 (primary context for re-planning). */
export interface Agent3ResearchLogEntry {
  iteration: number;
  queries: string[];
  a6_raw_findings: Pick<Agent6ResearchRunResult, "queries_used" | "source_urls" | "extracted_key_data">;
  scan: {
    sources_and_data: Agent3TaskSourceRow[];
    observations: string[];
    emerging_patterns: string[];
  };
  analysis: {
    analysis_points: string[];
    task_gaps: string[];
    assumptions: Agent3TaskAssumption[];
    confidence: Agent3TaskConfidence;
  };
  progress: Agent3ProgressMetrics;
  decision: Agent3ResearchDecision;
  insight: string;
}

/** Agent 3 Phase 2 — one research task conclusion for Agent 7. */
export interface Agent3TaskResult {
  sources_and_data: Agent3TaskSourceRow[];
  analysis_points: string[];
  summary: string;
  task_gaps: string[];
  assumptions: Agent3TaskAssumption[];
  confidence: Agent3TaskConfidence;
  /** When true, orchestration may schedule another plan → Agent 6 → review round. */
  needs_further_search?: boolean;
  suggested_queries?: string[];
  progress_metrics?: Agent3ProgressMetrics;
  entity_tracking?: Agent3EntityTracking;
  /**
   * Scan layer: observations + emerging_patterns (review pass). `sources_and_data` stays top-level;
   * when assembling research_log.scan, copy sources_and_data into the log row.
   */
  scan?: {
    observations: string[];
    emerging_patterns: string[];
  };
  /** How understanding of the domain changed this iteration (research_log.insight). */
  insight?: string;
  /** Full decision mirror for orchestration / research_log.decision. */
  decision?: Agent3ResearchDecision;
}

/**
 * Unified Agent 3 Phase 2 response: next Agent 6 assignment (flat plan fields) plus
 * synthesis / review fields after **`agent6_result`** is available.
 */
export interface Agent3Phase2Response extends Agent3TaskResult {
  plan_summary: string;
  search_objective: string;
  search_queries: string[];
  extraction_notes?: string;
  open_questions?: string[];
}

/**
 * Agent 3 → Agent 6 handoff for one search+extract pass (Phase 2).
 * Produced by Agent 3 **plan** step before any web search.
 */
export interface Agent6AssignmentFromAgent3 {
  /** Natural-language objective for Parallel beta.search. */
  search_objective: string;
  /** Keyword / query strings for beta.search. */
  search_queries: string[];
  /** Optional notes for the extraction LLM (variables emphasis, hygiene). */
  extraction_notes?: string;
}

/** Agent 3 Phase 2 — planning step after Agent 7 assigns a research_task. */
export interface Agent3ResearchPlan {
  plan_summary: string;
  agent6_assignment: Agent6AssignmentFromAgent3;
  open_questions?: string[];
}

/** Legacy prior-round shape (plan → Agent 6 → review); newest last. */
export interface Agent36PriorRound {
  agent3_plan: Agent3ResearchPlan;
  agent6_result: Agent6ResearchRunResult;
  agent3_review: Agent3TaskResult;
}

/** One full plan → search → review cycle inside the A3↔A6 loop. */
export interface Agent36LoopIterationTrace {
  agent3_plan: Agent3ResearchPlan;
  agent6_result: Agent6ResearchRunResult;
  agent3_review: Agent3TaskResult;
}

/** Loop API: final Agent 3 **review** plus traces (Agent 7 → A3 plan → A6 → A3 review, iterate). */
export interface Agent36ResearchLoopResponse {
  final_agent3_result: Agent3TaskResult;
  /** One plan per iteration (before each Agent 6 run). */
  agent3_plans: Agent3ResearchPlan[];
  agent6_runs: Agent6ResearchRunResult[];
  /** Ordered rounds: plan, then Agent 6 output, then review. */
  iteration_trace: Agent36LoopIterationTrace[];
  /** Cumulative research memory (newest last), echoed for orchestration / sandbox. */
  research_log: Agent3ResearchLogEntry[];
  iterations: number;
  stopped_reason: "sufficient" | "max_iterations" | "min_confidence";
  /** Echo: request `min_confidence` (0–1) when the client sent it. */
  min_confidence_threshold?: number;
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

export interface PlannerOutput {
  objective_understanding: string;
  dimensions: Agent7Dimension[];
  known_gaps: Agent7KnownGapGroup[];
  tasks: PlannerResearchTask[];
  execution_strategy: "all_parallel" | "two_phase";
  profile_task_id?: string;
  reasoning: string;
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

export interface SynthesizerOutput {
  user_facing_document: string;
  key_findings: Record<string, unknown>;
  dimensions: Agent7Dimension[];
  known_gaps: Agent7KnownGapGroup[];
  findings_summary: { key: string; value: unknown };
  coverage_assessment: CoverageAssessment[];
  dig_deeper: PlannerResearchTask[];
  should_continue: boolean;
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
