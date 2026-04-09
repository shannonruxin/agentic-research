import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import type { AIAnswerOutput, QueryDecomposition } from "@/lib/types";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";

/** Configuration or `generateObject` failure (maps to HTTP 502 from API routes). */
export class AIAnswerModelError extends Error {
  override readonly name = "AIAnswerModelError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export const AI_ANSWER_SYSTEM_PROMPT = `You are the AIAnswer stage of a research pipeline.

Your job is to write a helpful, direct answer the user can read immediately, and to list URLs you are willing to stand behind as sources you consulted or that substantiate your answer.

RULES:
- Use clear prose. Markdown in answer_text is allowed (headings, lists) when it helps readability.
- declared_sources must contain only real URLs you believe exist. Do NOT invent or guess URLs.
- If you are not confident in any specific URL, use an empty declared_sources array rather than fabricating links.
- Stay aligned with the user's topic and any core_query provided; do not ignore the investigation framing.
- You may use general knowledge, but declared_sources should reflect pages you would cite for the factual claims you make.`;

const declaredSourceSchema = z.object({
  url: z.string().min(1),
  title: z.string().nullable().optional(),
});

const aiAnswerResultSchema = z.object({
  answer_text: z.string().min(1),
  declared_sources: z.array(declaredSourceSchema),
});

function buildUserMessage(query: string, decomposition: QueryDecomposition | undefined): string {
  const q = query.trim();
  if (!decomposition) {
    return `USER_TOPIC:\n"""${q}"""\n\nProduce answer_text and declared_sources per schema.`;
  }
  return [
    `USER_TOPIC:\n"""${q}"""`,
    "",
    "DECOMPOSITION_CONTEXT (for alignment only — you may answer the user directly):",
    `core_query: ${decomposition.core_query}`,
    `keywords: ${decomposition.keywords.join(", ")}`,
    "support_angles:",
    ...decomposition.support_angles.map(
      (a) => `- [${a.id}] ${a.label}: ${a.description}`,
    ),
    "",
    "Produce answer_text and declared_sources per schema.",
  ].join("\n");
}

/**
 * Direct LLM answer + declared source URLs (AIAnswer pipeline stage).
 */
export async function generateAIAnswer(
  query: string,
  decomposition?: QueryDecomposition,
): Promise<AIAnswerOutput> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new AIAnswerModelError("A non-empty query is required.");
  }

  let model;
  try {
    model = createBedrockLanguageModel();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bedrock configuration error";
    throw new AIAnswerModelError(msg);
  }

  try {
    const { object } = await generateObject({
      model,
      schema: aiAnswerResultSchema,
      system: AI_ANSWER_SYSTEM_PROMPT,
      prompt: buildUserMessage(trimmed, decomposition),
    });

    const declared_sources = object.declared_sources.map((s) => ({
      url: s.url.trim(),
      title: s.title === undefined || s.title === null ? null : s.title,
    }));

    return {
      answer_text: object.answer_text.trim(),
      declared_sources,
    };
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) {
      throw new AIAnswerModelError("The model did not return valid structured output.", { cause: e });
    }
    const msg = e instanceof Error ? e.message : "AIAnswer generation failed";
    throw new AIAnswerModelError(msg, e instanceof Error ? { cause: e } : undefined);
  }
}
