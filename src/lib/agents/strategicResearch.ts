import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import type { QueryDecomposition, SearchQueries, StrategyQueryItem } from "@/lib/types";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";

/** Configuration or `generateObject` failure (maps to HTTP 502 from API routes). */
export class StrategicResearchModelError extends Error {
  override readonly name = "StrategicResearchModelError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/** Post-parse validation: keys, year range in every `query`, duplicates, etc. */
export class StrategicResearchValidationError extends Error {
  override readonly name = "StrategicResearchValidationError";

  constructor(message: string) {
    super(message);
  }
}

const strategyItemSchema = z.object({
  type: z.string().min(1),
  query: z.string().min(1),
  reasoning: z.string().min(1),
});

/**
 * Bedrock-friendly single root object: dynamic angle ids as `by_angle[]` with `angle_id` + `items`
 * (avoids `z.record` keys in the tool schema).
 */
const strategicResearchResultSchema = z.object({
  by_angle: z
    .array(
      z.object({
        angle_id: z.string().min(1),
        items: z.array(strategyItemSchema).min(2),
      }),
    )
    .min(1),
});

export const STRATEGIC_RESEARCH_SYSTEM_PROMPT = `You are a Strategic Research Agent (Agent 2).

Your job is to plan high-quality WEB SEARCH queries for each support angle of an existing QueryDecomposition.

STRICT RULES:
- Do NOT browse the web, cite URLs, or answer the core_query.
- Do NOT assume valid user input is true or false; stay neutral.
- Prefer queries aimed at peer-reviewed research, major studies, meta-analyses, government or WHO/CDC-class institutions, and established medical or scientific literature.
- Avoid optimizing for blogs, opinion columns, or obvious low-authority SEO pages.

OUTPUT:
- Fill the schema only (no prose).
- by_angle: one entry per support angle from the input.
- angle_id must match the decomposition’s support_angles[].id EXACTLY (character-for-character).
- items: at least 2 per angle. Each item has:
  - type: short label for the query role (e.g. "baseline", "deep_dive", "meta_analysis").
  - query: a concise search string suitable for a web search API.
  - reasoning: one short sentence on why this query helps investigate that angle.

When YEAR_RANGE_CONSTRAINT is set in the user message, EVERY item.query MUST visibly include that year range text (users rely on it for filtering).`;

function normalizeDashes(s: string): string {
  return s.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

function queryContainsYearRange(query: string, yearRange: string): boolean {
  const q = normalizeDashes(query);
  const y = normalizeDashes(yearRange);
  return y.length > 0 && q.includes(y);
}

/** Exported for unit tests — enforces Requirement 3.4 after model output. */
export function assertYearRangeOnAllQueries(queries: SearchQueries, yearRange: string | undefined): void {
  const yr = yearRange?.trim();
  if (!yr) {
    return;
  }
  for (const [angleId, items] of Object.entries(queries)) {
    for (let i = 0; i < items.length; i++) {
      if (!queryContainsYearRange(items[i]!.query, yr)) {
        throw new StrategicResearchValidationError(
          `Year range "${yr}" missing from query for angle "${angleId}" item ${i}: "${items[i]!.query}"`,
        );
      }
    }
  }
}

export function mergeStrategicResearchRows(
  parsed: z.infer<typeof strategicResearchResultSchema>,
  expectedAngleIds: string[],
): SearchQueries {
  const expected = new Set(expectedAngleIds);
  const seen = new Set<string>();
  const out: SearchQueries = {};

  for (const row of parsed.by_angle) {
    if (!expected.has(row.angle_id)) {
      throw new StrategicResearchValidationError(`Unexpected angle_id: ${row.angle_id}`);
    }
    if (seen.has(row.angle_id)) {
      throw new StrategicResearchValidationError(`Duplicate angle_id: ${row.angle_id}`);
    }
    seen.add(row.angle_id);
    const items: StrategyQueryItem[] = row.items.map((it) => ({
      type: it.type.trim(),
      query: it.query.trim(),
      reasoning: it.reasoning.trim(),
    }));
    out[row.angle_id] = items;
  }

  const missing = expectedAngleIds.filter((id) => !seen.has(id));
  if (missing.length > 0) {
    throw new StrategicResearchValidationError(`Missing angles: ${missing.join(", ")}`);
  }

  return out;
}

export function buildStrategicResearchUserPrompt(
  decomposition: QueryDecomposition,
  yearRange?: string,
): string {
  const ids = decomposition.support_angles.map((a) => a.id).join(", ");
  const yr = yearRange?.trim();
  const yearBlock = yr
    ? `YEAR_RANGE_CONSTRAINT: Every StrategyQueryItem.query MUST contain this exact text (allow minor spacing): "${yr}"`
    : "YEAR_RANGE_CONSTRAINT: none — do not add a year filter unless the decomposition implies it.";

  return `ANGLE_IDS (use exactly these strings as by_angle[].angle_id, one row each): ${ids}

${yearBlock}

QUERY_DECOMPOSITION_JSON:
${JSON.stringify(decomposition, null, 2)}`;
}

/**
 * Agent 2 — Strategic Research: per-angle typed search plans for Agent 3.
 */
export async function generateStrategicResearch(
  decomposition: QueryDecomposition,
  yearRange?: string,
): Promise<SearchQueries> {
  try {
    const model = createBedrockLanguageModel();
    const { object } = await generateObject({
      model,
      schema: strategicResearchResultSchema,
      schemaName: "StrategicResearchResult",
      schemaDescription:
        "by_angle: one row per support angle id; each row has at least 2 strategy items (type, query, reasoning).",
      system: STRATEGIC_RESEARCH_SYSTEM_PROMPT,
      prompt: buildStrategicResearchUserPrompt(decomposition, yearRange),
      maxOutputTokens: 4096,
    });

    const expectedIds = decomposition.support_angles.map((a) => a.id);
    const queries = mergeStrategicResearchRows(object, expectedIds);
    assertYearRangeOnAllQueries(queries, yearRange);

    return queries;
  } catch (e) {
    if (e instanceof StrategicResearchValidationError) {
      throw e;
    }
    const message = NoObjectGeneratedError.isInstance(e)
      ? "The model did not return valid structured output."
      : e instanceof Error
        ? e.message
        : "Strategic research failed.";
    throw new StrategicResearchModelError(message, { cause: e });
  }
}
