import type {
  Agent3ResourceRow,
  AIAnswerOutput,
  EvidenceSegment,
  QueryDecomposition,
  SearchQueries,
} from "@/lib/types";
import { createParallelClient } from "@/lib/parallelClient";
import type { ParallelSourcePolicy } from "@/lib/parallelSourcePolicy";
import { parallelSourcePolicyFromEnv, sourcePolicyForBetaSearch } from "@/lib/parallelSourcePolicy";
import { Agent3EvidenceModelError } from "@/lib/agents/agent3Segments";

/** Parallel / configuration failure for Agent 6 (search). */
export class Agent6SearchError extends Error {
  override readonly name = "Agent6SearchError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const MAX_OBJECTIVE_LEN = 6000;
const MAX_STRATEGY_QUERIES_WIRED = 6;
const MAX_URLS_PER_SEGMENT = 4;
const MAX_SEARCH_RESULTS = 6;

function flattenStrategyQueries(searchQueries: SearchQueries): { angle_id: string; query: string }[] {
  const rows: { angle_id: string; query: string }[] = [];
  for (const [angleId, items] of Object.entries(searchQueries)) {
    for (const item of items) {
      const q = item.query?.trim();
      if (q) {
        rows.push({ angle_id: angleId, query: q });
      }
    }
  }
  return rows;
}

function buildSearchQueryStrings(
  segment: EvidenceSegment,
  strategyRows: { angle_id: string; query: string }[],
): { queries: string[]; firstAngleId: string | undefined } {
  const challenge = segment.verification_challenge.trim();
  const quote = segment.quote_from_ai_answer.trim().slice(0, 280);
  const picked = strategyRows.slice(0, MAX_STRATEGY_QUERIES_WIRED).map((r) => r.query);
  const raw = [challenge, quote, ...picked];
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const s of raw) {
    const t = s.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    queries.push(t);
  }
  return {
    queries: queries.slice(0, MAX_STRATEGY_QUERIES_WIRED + 2),
    firstAngleId: strategyRows[0]?.angle_id,
  };
}

function mergeResource(
  map: Map<string, Agent3ResourceRow>,
  url: string,
  segmentId: string,
  title: string | null | undefined,
  angleId: string | undefined,
): void {
  const normalized = url.trim();
  if (!normalized) return;
  const existing = map.get(normalized);
  const segment_ids = existing ? [...existing.segment_ids] : [];
  if (!segment_ids.includes(segmentId)) {
    segment_ids.push(segmentId);
  }
  map.set(normalized, {
    url: normalized,
    segment_ids,
    angle_id: existing?.angle_id ?? angleId,
    title: existing?.title ?? title ?? null,
    status: "ok",
  });
}

export function assertSearchQueriesMatchDecomposition(
  decomposition: QueryDecomposition | undefined,
  searchQueries: SearchQueries | undefined,
): void {
  if (!decomposition || !searchQueries || Object.keys(searchQueries).length === 0) {
    return;
  }
  const angleIds = new Set(decomposition.support_angles.map((a) => a.id));
  for (const k of Object.keys(searchQueries)) {
    if (!angleIds.has(k)) {
      throw new Agent3EvidenceModelError(
        `searchQueries key "${k}" is not a support_angles id from decomposition`,
      );
    }
  }
}

/**
 * Agent 6 — Parallel **`beta.search`** per evidence segment → deduped **`resources[]`**.
 * `aiAnswer` is accepted for API symmetry / future use; search is driven by segments + optional strategy queries.
 */
export async function generateAgent6Resources(
  aiAnswer: AIAnswerOutput,
  evidence_segments: EvidenceSegment[],
  decomposition?: QueryDecomposition,
  searchQueries?: SearchQueries,
  options?: { sourcePolicy?: ParallelSourcePolicy | null },
): Promise<Agent3ResourceRow[]> {
  if (!aiAnswer.answer_text?.trim()) {
    throw new Agent6SearchError("aiAnswer.answer_text is required.");
  }
  if (!evidence_segments.length) {
    throw new Agent6SearchError("evidence_segments must be non-empty.");
  }

  assertSearchQueriesMatchDecomposition(decomposition, searchQueries);

  const sq =
    searchQueries && Object.keys(searchQueries).length > 0 ? searchQueries : undefined;

  let client: ReturnType<typeof createParallelClient>;
  try {
    client = createParallelClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Parallel client configuration error";
    throw new Agent6SearchError(msg);
  }

  const sourcePolicy =
    options?.sourcePolicy !== undefined ? options.sourcePolicy : parallelSourcePolicyFromEnv();

  const strategyRows = sq ? flattenStrategyQueries(sq) : [];
  const urlMap = new Map<string, Agent3ResourceRow>();

  for (const seg of evidence_segments) {
    const { queries, firstAngleId } = buildSearchQueryStrings(seg, strategyRows);
    const objective = [seg.verification_challenge, `(Segment quote: ${seg.quote_from_ai_answer.slice(0, 400)})`]
      .join("\n")
      .slice(0, MAX_OBJECTIVE_LEN);

    try {
      const result = await client.beta.search({
        objective,
        search_queries: queries.length > 0 ? queries : null,
        max_results: MAX_SEARCH_RESULTS,
        mode: "one-shot",
        source_policy: sourcePolicyForBetaSearch(sourcePolicy),
      });

      const hits = result.results ?? [];
      let count = 0;
      for (const h of hits) {
        if (count >= MAX_URLS_PER_SEGMENT) break;
        mergeResource(urlMap, h.url, seg.segment_id, h.title ?? null, firstAngleId);
        count += 1;
      }
    } catch {
      /* segment may have no resources — gap recorded by absence of URLs */
    }
  }

  return Array.from(urlMap.values());
}
