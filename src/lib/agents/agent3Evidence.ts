import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import type {
  AIAnswerOutput,
  Agent3EvidencePlan,
  Agent3ResourceRow,
  EvidenceSegment,
  QueryDecomposition,
  SearchQueries,
} from "@/lib/types";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";
import { createParallelClient } from "@/lib/parallelClient";

/** Configuration / LLM / validation failure for Agent 3. */
export class Agent3EvidenceModelError extends Error {
  override readonly name = "Agent3EvidenceModelError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const MAX_SEGMENTS = 14;
const MAX_OBJECTIVE_LEN = 6000;
const MAX_STRATEGY_QUERIES_WIRED = 6;
const MAX_URLS_PER_SEGMENT = 4;
const MAX_SEARCH_RESULTS = 6;

const evidenceSegmentSchema = z.object({
  segment_id: z.string().min(1),
  quote_from_ai_answer: z.string().min(1),
  intent: z.string().optional(),
  verification_challenge: z.string().min(1),
});

const segmentsResultSchema = z.object({
  evidence_segments: z.array(evidenceSegmentSchema).min(1).max(MAX_SEGMENTS),
}).superRefine((data, ctx) => {
  const seen = new Set<string>();
  for (let i = 0; i < data.evidence_segments.length; i++) {
    const seg = data.evidence_segments[i]!;
    if (seen.has(seg.segment_id)) {
      ctx.addIssue({
        code: "custom",
        message: `duplicate segment_id: ${seg.segment_id}`,
        path: ["evidence_segments", i, "segment_id"],
      });
    }
    seen.add(seg.segment_id);
  }
});

export const AGENT3_SEGMENTS_SYSTEM_PROMPT = `You are Agent 3.1 — Evidence segmentation for a cynical verification pipeline.

The model produced an AIAnswer (answer_text). Your job is to partition it into evidence_segments: atomic claims, numbers, causal explanations, or other passages that MUST be checked against the web — not optional summaries.

For EACH segment you MUST output:
- segment_id: stable id (e.g. seg_1, seg_2) — unique in the array
- quote_from_ai_answer: an EXACT contiguous substring copied from the provided answer_text (verbatim, including punctuation). Used to tie the segment to the answer for ordering later.
- intent: optional short label for what kind of claim this is
- verification_challenge: REQUIRED. A short, plain-language audit question — what you are trying to validate or falsify for that span (cynical lens: the answer may be wrong, overstated, outdated, or confuse correlation with causation until sources support it).

Do not invent quotes. Every quote_from_ai_answer must appear exactly in answer_text.`;

function buildSegmentsUserMessage(answerText: string, decomposition?: QueryDecomposition): string {
  const core = [
    `answer_text:\n"""${answerText}"""`,
    "",
  ];
  if (decomposition) {
    core.push(
      "Investigation framing (neutral context — use to diversify angles if helpful):",
      `core_query: ${decomposition.core_query}`,
      `keywords: ${decomposition.keywords.join(", ")}`,
      "support_angles:",
      ...decomposition.support_angles.map(
        (a) => `- [${a.id}] ${a.label}: ${a.description}`,
      ),
      "",
    );
  } else {
    core.push(
      "No separate query decomposition was provided. Infer what must be verified using only answer_text.",
      "",
    );
  }
  core.push("Emit evidence_segments per schema.");
  return core.join("\n");
}

/**
 * Map a model-emitted quote to the **exact** slice present in `answer` when possible
 * (trim, Unicode spaces, straight vs curly quotes).
 */
export function resolveVerbatimQuoteInAnswer(answer: string, rawQuote: string): string | null {
  const tryDirect = (q: string): string | null => {
    const i = answer.indexOf(q);
    return i >= 0 ? answer.slice(i, i + q.length) : null;
  };

  const unified = (s: string) =>
    s
      .replace(/\u00a0/g, " ")
      .replace(/\u202f/g, " ")
      .replace(/\u2009/g, " ");

  const unifyQuotes = (s: string) =>
    s
      .replace(/\u201c|\u201d/g, '"')
      .replace(/\u2018|\u2019/g, "'");

  const candidates = [
    rawQuote,
    rawQuote.trim(),
    unified(rawQuote),
    unified(rawQuote).trim(),
    unifyQuotes(rawQuote),
    unifyQuotes(rawQuote).trim(),
    unifyQuotes(unified(rawQuote)).trim(),
  ];

  for (const q of candidates) {
    if (!q) continue;
    const hit = tryDirect(q);
    if (hit) return hit;
  }

  const answerU = unified(answer);
  for (const q of candidates) {
    if (!q) continue;
    const qu = unified(q);
    const i = answerU.indexOf(qu);
    if (i < 0) continue;
    return answer.slice(i, i + qu.length);
  }

  const answerQ = unifyQuotes(unified(answer));
  for (const q of candidates) {
    if (!q) continue;
    const qq = unifyQuotes(unified(q));
    const i = answerQ.indexOf(qq);
    if (i < 0) continue;
    return answer.slice(i, i + qq.length);
  }

  return null;
}

export async function generateEvidenceSegments(
  answerText: string,
  decomposition?: QueryDecomposition,
): Promise<EvidenceSegment[]> {
  const trimmed = answerText.trim();
  if (!trimmed) {
    throw new Agent3EvidenceModelError("AIAnswer answer_text is empty.");
  }

  let model;
  try {
    model = createBedrockLanguageModel();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bedrock configuration error";
    throw new Agent3EvidenceModelError(msg);
  }

  try {
    const { object } = await generateObject({
      model,
      schema: segmentsResultSchema,
      system: AGENT3_SEGMENTS_SYSTEM_PROMPT,
      prompt: buildSegmentsUserMessage(trimmed, decomposition),
    });

    const kept: EvidenceSegment[] = [];
    for (const s of object.evidence_segments) {
      const resolved = resolveVerbatimQuoteInAnswer(trimmed, s.quote_from_ai_answer);
      if (!resolved) {
        continue;
      }
      kept.push({
        segment_id: s.segment_id.trim(),
        quote_from_ai_answer: resolved,
        intent: s.intent?.trim() || undefined,
        verification_challenge: s.verification_challenge.trim(),
      });
    }

    if (kept.length === 0) {
      throw new Agent3EvidenceModelError(
        "No evidence segments could be tied to exact text in the answer (the model’s quotes did not match any contiguous span). Try Send again, or use Sandbox with Agent 1 decomposition.",
      );
    }

    return kept;
  } catch (e) {
    if (e instanceof Agent3EvidenceModelError) {
      throw e;
    }
    if (NoObjectGeneratedError.isInstance(e)) {
      throw new Agent3EvidenceModelError("The model did not return valid structured output.", { cause: e });
    }
    const msg = e instanceof Error ? e.message : "Evidence segmentation failed";
    throw new Agent3EvidenceModelError(msg, e instanceof Error ? { cause: e } : undefined);
  }
}

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

/**
 * Full Agent 3: segments (LLM) + Parallel search per segment → resources JSON.
 * `decomposition` and `searchQueries` are optional: search uses verification_challenge + quote only when absent;
 * when provided, Agent 2 strategy queries add extra search strings and optional `angle_id` on resources.
 */
export async function generateAgent3EvidencePlan(
  aiAnswer: AIAnswerOutput,
  decomposition?: QueryDecomposition,
  searchQueries?: SearchQueries,
): Promise<Agent3EvidencePlan> {
  if (!aiAnswer.answer_text?.trim()) {
    throw new Agent3EvidenceModelError("aiAnswer.answer_text is required.");
  }

  const dec = decomposition;
  const sq =
    searchQueries && Object.keys(searchQueries).length > 0 ? searchQueries : undefined;

  if (dec && sq) {
    const angleIds = new Set(dec.support_angles.map((a) => a.id));
    for (const k of Object.keys(sq)) {
      if (!angleIds.has(k)) {
        throw new Agent3EvidenceModelError(
          `searchQueries key "${k}" is not a support_angles id from decomposition`,
        );
      }
    }
  }

  const evidence_segments = await generateEvidenceSegments(aiAnswer.answer_text, dec);

  let client: ReturnType<typeof createParallelClient>;
  try {
    client = createParallelClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Parallel client configuration error";
    throw new Agent3EvidenceModelError(msg);
  }

  const strategyRows = sq ? flattenStrategyQueries(sq) : [];
  const urlMap = new Map<string, Agent3ResourceRow>();

  for (const seg of evidence_segments) {
    const { queries, firstAngleId } = buildSearchQueryStrings(seg, strategyRows);
    const objective = [
      seg.verification_challenge,
      `(Segment quote: ${seg.quote_from_ai_answer.slice(0, 400)})`,
    ]
      .join("\n")
      .slice(0, MAX_OBJECTIVE_LEN);

    try {
      const result = await client.beta.search({
        objective,
        search_queries: queries.length > 0 ? queries : null,
        max_results: MAX_SEARCH_RESULTS,
        mode: "one-shot",
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

  const resources = Array.from(urlMap.values());
  return { evidence_segments, resources };
}
