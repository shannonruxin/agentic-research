import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import type { ClaimDecomposition } from "@/lib/types";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";

/** Thrown when input is empty or whitespace only (before any model call). Req 1.4 */
export class EmptyClaimError extends Error {
  override readonly name = "EmptyClaimError";

  constructor(message = "A non-empty claim is required.") {
    super(message);
  }
}

/** Thrown when configuration is wrong or `generateObject` fails. Req 2.5 */
export class ClaimDecompositionModelError extends Error {
  override readonly name = "ClaimDecompositionModelError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const supportAngleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});

const decompositionSchema = z
  .object({
    core_claim: z.string().min(1),
    keywords: z.array(z.string().min(1)).min(1),
    support_angles: z.array(supportAngleSchema).min(2).max(6),
  })
  .refine(
    (d) => new Set(d.support_angles.map((a) => a.id)).size === d.support_angles.length,
    { message: "support_angles ids must be distinct" },
  );

/** Exported for requirement-traceability tests (requirements.md — Claim Decomposition). */
export const CLAIM_DECOMPOSITION_SYSTEM_PROMPT = `You decompose factual claims for a research pipeline. Output must match the JSON schema exactly.
Rules:
- If the user gives a paragraph or multiple sentences, extract exactly ONE atomic factual claim as core_claim.
- If the user gives a single atomic claim, copy it verbatim into core_claim — do not rewrite.
- Expand the conceptual meaning of the claim when choosing keywords and support angles (broader retrieval terms and varied evidence types).
- keywords: distinct phrases useful for search (at least one).
- support_angles: between 2 and 6 distinct evidence perspectives. Each needs a stable unique id (e.g. angle_1), a short label, and a description of what kind of evidence would support the claim.
- Do not browse the web, retrieve URLs, or cite sources.`;

/**
 * Agent 1 — decompose user text into structured claim metadata (Bedrock + structured output).
 */
export async function decomposeClaim(rawInput: string): Promise<ClaimDecomposition> {
  const input = rawInput.trim();
  if (!input) {
    throw new EmptyClaimError();
  }

  try {
    const model = createBedrockLanguageModel();
    const { object } = await generateObject({
      model,
      schema: decompositionSchema,
      schemaName: "ClaimDecomposition",
      schemaDescription:
        "Single atomic core claim, keywords, and 2–6 support angles for targeted evidence retrieval.",
      system: CLAIM_DECOMPOSITION_SYSTEM_PROMPT,
      prompt: `User input:\n"""${input}"""`,
      maxOutputTokens: 2048,
    });
    return object;
  } catch (e) {
    if (e instanceof ClaimDecompositionModelError) {
      throw e;
    }
    const message =
      NoObjectGeneratedError.isInstance(e)
        ? "The model did not return valid structured output."
        : e instanceof Error
          ? e.message
          : "Claim decomposition failed.";
    throw new ClaimDecompositionModelError(message, { cause: e });
  }
}
