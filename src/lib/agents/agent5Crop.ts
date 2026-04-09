import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import type {
  Agent3EvidencePlan,
  AIAnswerOutput,
  CroppedEvidenceItem,
  EvidenceSegment,
  ExtractBundle,
  RetrievedPage,
} from "@/lib/types";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";
import { normalizeExtractUrl } from "@/lib/agents/agent4Extract";

const MAX_PAGE_CHARS_IN_PROMPT = 28_000;

export class Agent5CropModelError extends Error {
  override readonly name = "Agent5CropModelError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export function flowOrderSegments(
  segments: EvidenceSegment[],
  answerText: string,
): EvidenceSegment[] {
  return [...segments].sort((a, b) => {
    const ia = answerText.indexOf(a.quote_from_ai_answer);
    const ib = answerText.indexOf(b.quote_from_ai_answer);
    const fa = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
    const fb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;
    if (fa !== fb) return fa - fb;
    return segments.indexOf(a) - segments.indexOf(b);
  });
}

function getBundlePage(bundle: ExtractBundle, url: string): RetrievedPage | undefined {
  const key = normalizeExtractUrl(url);
  return bundle[key] ?? bundle[url];
}

export function pickUrlForSegment(
  plan: Agent3EvidencePlan,
  segmentId: string,
  bundle: ExtractBundle,
): string | null {
  for (const row of plan.resources) {
    if (!row.segment_ids.includes(segmentId) || !row.url?.trim()) continue;
    const page = getBundlePage(bundle, row.url);
    if (page && !page.extract_error && page.cleanText.trim().length > 0) {
      return normalizeExtractUrl(row.url);
    }
  }
  return null;
}

const cropsSchema = z.object({
  crops: z.array(
    z.object({
      segment_id: z.string().min(1),
      cropped_text: z.string().min(1),
      location_hint: z.string().optional(),
    }),
  ),
});

const AGENT5_SYSTEM = `You are Agent 5 — evidence cropping for a dual-column UI.

For each segment provided with page_text you MUST return crops where:
- cropped_text is an EXACT contiguous substring copied from that segment's page_text (verbatim, no paraphrase).
- Prefer a short phrase or sentence that supports the verification_challenge, if it exists as a substring of page_text.
- If there is no usable substring, omit that segment from the crops array (do not invent text).

Output schema only; no prose.`;

function buildUserPrompt(
  answerText: string,
  segmentsPayload: {
    segment_id: string;
    quote_from_ai_answer: string;
    verification_challenge: string;
    url: string;
    page_text: string;
  }[],
): string {
  return [
    `answer_text (for context, do not copy from here into crops):\n"""${answerText.slice(0, 12_000)}"""`,
    "",
    "Segments (use page_text as the only source for cropped_text):",
    JSON.stringify(segmentsPayload, null, 2),
  ].join("\n");
}

/**
 * LLM crops + substring validation → **`CroppedEvidenceItem[]`** with **`flow_index`** from AIAnswer order.
 */
export async function generateCroppedEvidenceItems(
  aiAnswer: AIAnswerOutput,
  agent3Plan: Agent3EvidencePlan,
  bundle: ExtractBundle,
): Promise<CroppedEvidenceItem[]> {
  if (!aiAnswer.answer_text?.trim()) {
    throw new Agent5CropModelError("aiAnswer.answer_text is required.");
  }

  const ordered = flowOrderSegments(agent3Plan.evidence_segments, aiAnswer.answer_text);
  const flowIndexBySegment = new Map<string, number>();
  ordered.forEach((s, i) => flowIndexBySegment.set(s.segment_id, i));

  const segmentsPayload: {
    segment_id: string;
    quote_from_ai_answer: string;
    verification_challenge: string;
    url: string;
    page_text: string;
  }[] = [];

  for (const seg of ordered) {
    const url = pickUrlForSegment(agent3Plan, seg.segment_id, bundle);
    if (!url) continue;
    const page = getBundlePage(bundle, url);
    if (!page?.cleanText.trim()) continue;
    const page_text = page.cleanText.length > MAX_PAGE_CHARS_IN_PROMPT
      ? page.cleanText.slice(0, MAX_PAGE_CHARS_IN_PROMPT)
      : page.cleanText;
    segmentsPayload.push({
      segment_id: seg.segment_id,
      quote_from_ai_answer: seg.quote_from_ai_answer,
      verification_challenge: seg.verification_challenge,
      url,
      page_text,
    });
  }

  if (segmentsPayload.length === 0) {
    return [];
  }

  let model;
  try {
    model = createBedrockLanguageModel();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bedrock configuration error";
    throw new Agent5CropModelError(msg);
  }

  let object: z.infer<typeof cropsSchema>;
  try {
    const result = await generateObject({
      model,
      schema: cropsSchema,
      schemaName: "Agent5Crops",
      schemaDescription:
        "crops: one entry per segment when an exact supporting substring of page_text exists.",
      system: AGENT5_SYSTEM,
      prompt: buildUserPrompt(aiAnswer.answer_text, segmentsPayload),
      maxOutputTokens: 8192,
    });
    object = result.object;
  } catch (e) {
    const message = NoObjectGeneratedError.isInstance(e)
      ? "The model did not return valid structured output."
      : e instanceof Error
        ? e.message
        : "Agent 5 crop failed.";
    throw new Agent5CropModelError(message, { cause: e });
  }

  const items: CroppedEvidenceItem[] = [];
  const allowedIds = new Set(segmentsPayload.map((s) => s.segment_id));

  for (const c of object.crops) {
    if (!allowedIds.has(c.segment_id)) continue;
    const meta = segmentsPayload.find((s) => s.segment_id === c.segment_id);
    if (!meta) continue;
    const page = getBundlePage(bundle, meta.url);
    if (!page) continue;
    const fullText = page.cleanText;
    if (!fullText.includes(c.cropped_text)) {
      continue;
    }
    const fi = flowIndexBySegment.get(c.segment_id);
    if (fi === undefined) continue;
    items.push({
      flow_index: fi,
      segment_ids: [c.segment_id],
      url: meta.url,
      cropped_text: c.cropped_text,
      location_hint: c.location_hint?.trim() || undefined,
      author: page.author ?? undefined,
      publication: page.publication ?? undefined,
      year: page.year ?? undefined,
    });
  }

  items.sort((a, b) => a.flow_index - b.flow_index);
  return items;
}
