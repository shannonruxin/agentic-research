import type {
  Agent3EvidencePlan,
  Agent3ResourceRow,
  AIAnswerOutput,
  EvidenceSegment,
  QueryDecomposition,
  SearchQueries,
} from "@/lib/types";
import type { ParallelSourcePolicy } from "@/lib/parallelSourcePolicy";
import { Agent3EvidenceModelError, generateEvidenceSegments } from "@/lib/agents/agent3Segments";
import { generateAgent6Resources } from "@/lib/agents/agent6Search";

export {
  Agent3EvidenceModelError,
  AGENT3_SEGMENTS_SYSTEM_PROMPT,
  generateEvidenceSegments,
  resolveVerbatimQuoteInAnswer,
} from "@/lib/agents/agent3Segments";

export { Agent6SearchError, generateAgent6Resources } from "@/lib/agents/agent6Search";

export function composeAgent3EvidencePlan(
  evidence_segments: EvidenceSegment[],
  resources: Agent3ResourceRow[],
): Agent3EvidencePlan {
  return { evidence_segments, resources };
}

/**
 * Full composed plan: Agent 3 (segments) + Agent 6 (search).
 * Prefer calling **`generateEvidenceSegments`** + **`generateAgent6Resources`** + **`composeAgent3EvidencePlan`**
 * when stages must be logged or persisted separately.
 */
export async function generateAgent3EvidencePlan(
  aiAnswer: AIAnswerOutput,
  decomposition?: QueryDecomposition,
  searchQueries?: SearchQueries,
  options?: { sourcePolicy?: ParallelSourcePolicy | null },
): Promise<Agent3EvidencePlan> {
  if (!aiAnswer.answer_text?.trim()) {
    throw new Agent3EvidenceModelError("aiAnswer.answer_text is required.");
  }

  const dec = decomposition;
  const sq =
    searchQueries && Object.keys(searchQueries).length > 0 ? searchQueries : undefined;

  const evidence_segments = await generateEvidenceSegments(aiAnswer.answer_text, dec);
  const resources = await generateAgent6Resources(aiAnswer, evidence_segments, dec, sq, options);
  return composeAgent3EvidencePlan(evidence_segments, resources);
}
