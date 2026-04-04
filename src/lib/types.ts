// Agent 1 output
export interface SupportAngle {
  id: string;          // e.g. "angle_1"
  label: string;       // e.g. "meta-analysis"
  description: string;
}

export interface ClaimDecomposition {
  core_claim: string;
  keywords: string[];
  support_angles: SupportAngle[];
}

// Agent 2 output
export interface SearchQueries {
  [angleId: string]: string[];
}

// Agent 3 intermediate — a page that passed the credibility filter
export interface RetrievedPage {
  url: string;
  author: string | null;
  publication: string | null;
  year: number | null;
  cleanText: string;
  httpStatus: number;
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
  claim: string;
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
  claim: string;
  results: EvidenceResult[]; // 0–3 items
  pipeline_run_id: string;
}
