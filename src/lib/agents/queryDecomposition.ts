import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import type { QueryDecomposition } from "@/lib/types";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";

/** Thrown when input is empty or whitespace only (before any model call). Req 1.4 */
export class EmptyQueryError extends Error {
  override readonly name = "EmptyQueryError";

  constructor(message = "A non-empty query is required.") {
    super(message);
  }
}

/** Thrown when configuration is wrong or `generateObject` fails. Req 2.5 */
export class QueryDecompositionModelError extends Error {
  override readonly name = "QueryDecompositionModelError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/** Model signaled that input has no extractable query (`kind: invalid_input`). */
export class NoValidQueryError extends Error {
  override readonly name = "NoValidQueryError";

  constructor(message: string) {
    super(message);
  }
}

const supportAngleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});

/**
 * Single root object schema (required by Amazon Bedrock tool `inputSchema`: root `type` must be `object`).
 */
const queryDecompositionResultSchema = z
  .object({
    kind: z.enum(["success", "invalid_input"]),
    core_query: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    support_angles: z.array(supportAngleSchema).optional(),
    error_message: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "success") {
      if (!data.core_query?.trim()) {
        ctx.addIssue({ code: "custom", message: "core_query is required when kind is success", path: ["core_query"] });
      }
      const keywords = data.keywords;
      if (!keywords?.length) {
        ctx.addIssue({ code: "custom", message: "keywords is required when kind is success", path: ["keywords"] });
      } else if (keywords.some((k) => !k.trim())) {
        ctx.addIssue({ code: "custom", message: "keywords must be non-empty strings", path: ["keywords"] });
      }
      const angles = data.support_angles;
      if (!angles || angles.length < 2 || angles.length > 6) {
        ctx.addIssue({
          code: "custom",
          message: "support_angles must have 2–6 items when kind is success",
          path: ["support_angles"],
        });
      } else if (new Set(angles.map((a) => a.id)).size !== angles.length) {
        ctx.addIssue({ code: "custom", message: "support_angles ids must be distinct", path: ["support_angles"] });
      } else {
        for (let i = 0; i < angles.length; i++) {
          const a = angles[i]!;
          if (!a.id.trim() || !a.label.trim() || !a.description.trim()) {
            ctx.addIssue({
              code: "custom",
              message: "each support angle needs non-empty id, label, description",
              path: ["support_angles", i],
            });
            break;
          }
        }
      }
    } else {
      if (!data.error_message?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "error_message is required when kind is invalid_input",
          path: ["error_message"],
        });
      }
    }
  });

/**
 * System instructions for Agent 1 — Query Decomposition (also documented in `specs/design.md`).
 * The model fills the schema via `generateObject`; the app owns JSON serialization (see `/api/decompose`).
 */
export const QUERY_DECOMPOSITION_SYSTEM_PROMPT = `You are a Query Decomposition Agent.

Your job is NOT to answer the input.

Your job is to:
1. Extract ONE atomic, neutral core query
2. Expand it into multiple investigation angles

INPUT TYPES YOU MUST HANDLE:
- A declarative assertion (factual statement to investigate)
- A question
- A request for explanation

NORMALIZATION RULES:
- Convert the input into a SINGLE, clear, investigable core_query
- Preserve the original intent exactly
- Remove fluff, context, or extra sentences
- DO NOT introduce assumptions or conclusions

EXAMPLES:
- "Is smoking actually bad for you?" → "Is smoking harmful to human health?"
- "Explain the war in Iran and why it affects oil prices" → "How does conflict in Iran affect oil prices?"
- "Smoking causes cancer" → "Does smoking cause cancer?"

STRICT RULES:
- Do NOT assume the underlying assertion is true or false
- Do NOT bias toward any side
- Do NOT answer the question
- Do NOT include conclusions or opinions
- Keep everything investigable and neutral
- Do not browse the web, retrieve URLs, cite sources, or rely on external knowledge in the output

OUTPUT REQUIREMENTS:
Fill the structured schema exactly (no prose outside schema fields).

On success (kind success):
- core_query (string)
- keywords (array of strings)
- support_angles (2–6 items)

On failure (kind invalid_input):
- error_message (string) only — do not invent core_query, keywords, or support_angles

KEYWORDS (when kind is success):
- Expand the conceptual meaning of the query
- Include related measurable or researchable terms

SUPPORT ANGLES (when kind is success):
Each angle must:
- Represent a DISTINCT way to investigate the query
- Be phrased as a research direction, NOT a conclusion
- Cover different dimensions such as:
  - causality
  - statistical evidence
  - comparison
  - mechanisms
  - economic or system effects
  - population-level impact
  - counter-evidence

DO NOT:
- Say the answer
- Collapse multiple angles into one
- Bias toward a conclusion
- Reply with conversational explanation — only populate the schema fields.`;

/**
 * User turn after INPUT: (triple-quoted so newlines and quotes inside the text stay unambiguous).
 */
export function buildQueryDecompositionUserPrompt(userText: string): string {
  return `INPUT:\n"""${userText}"""`;
}

/**
 * Agent 1 — Query Decomposition: normalize user text into structured metadata (core_query + angles).
 * Returns a typed object; HTTP layers serialize with `JSON.stringify`.
 */
export async function decomposeQuery(rawInput: string): Promise<QueryDecomposition> {
  const input = rawInput.trim();
  if (!input) {
    throw new EmptyQueryError();
  }

  try {
    const model = createBedrockLanguageModel();
    const { object } = await generateObject({
      model,
      schema: queryDecompositionResultSchema,
      schemaName: "QueryDecompositionResult",
      schemaDescription:
        "success: single neutral investigable core_query, expanded keywords, 2–6 research-direction angles. invalid_input: error_message only.",
      system: QUERY_DECOMPOSITION_SYSTEM_PROMPT,
      prompt: buildQueryDecompositionUserPrompt(input),
      maxOutputTokens: 2048,
    });
    if (object.kind === "invalid_input") {
      const msg = object.error_message?.trim();
      throw new NoValidQueryError(msg && msg.length > 0 ? msg : "No valid query could be extracted.");
    }
    const { core_query, keywords, support_angles } = object;
    if (core_query === undefined || keywords === undefined || support_angles === undefined) {
      throw new QueryDecompositionModelError(
        "Model returned success without required fields despite schema validation.",
      );
    }
    return { core_query, keywords, support_angles };
  } catch (e) {
    if (e instanceof NoValidQueryError || e instanceof QueryDecompositionModelError) {
      throw e;
    }
    const message =
      NoObjectGeneratedError.isInstance(e)
        ? "The model did not return valid structured output."
        : e instanceof Error
          ? e.message
          : "Query decomposition failed.";
    throw new QueryDecompositionModelError(message, { cause: e });
  }
}
