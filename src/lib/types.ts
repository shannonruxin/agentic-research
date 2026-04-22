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
  label: string;
  description?: string;
}

/** Missing info / evidence before a solid answer — often per-dimension; omit dimension for objective-level scope gaps. */
export interface Agent7KnownGapGroup {
  /** e.g. "Market size"; omit or use "Objective / scope" for pre-dimension gaps (company name, industry, etc.). */
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

/** One mapped datum from web search → **`variables_to_find`** (Agent 6 Phase 2). */
export interface ExtractedKeyDatum {
  variable: string;
  status: "found" | "partial" | "not_found";
  value_summary: string;
  supporting_snippet?: string;
  /** Must be one of the URLs returned by search for this run (enforced server-side when possible). */
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
  iterations: number;
  stopped_reason: "sufficient" | "max_iterations" | "min_confidence";
  /** Echo: request `min_confidence` (0–1) when the client sent it. */
  min_confidence_threshold?: number;
}
