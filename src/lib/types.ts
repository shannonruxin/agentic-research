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
