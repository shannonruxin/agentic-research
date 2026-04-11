import { NextResponse } from "next/server";
import { z } from "zod";
import { createParallelClient } from "@/lib/parallelClient";
import {
  PARALLEL_SOURCE_POLICY_MAX_DOMAINS,
  mergeParallelSourcePolicy,
  parallelSourcePolicyFromEnv,
  sourcePolicyForBetaSearch,
} from "@/lib/parallelSourcePolicy";

const sourcePolicyBodySchema = z
  .object({
    excludeDomains: z.array(z.string().max(256)).max(PARALLEL_SOURCE_POLICY_MAX_DOMAINS).optional(),
    includeDomains: z.array(z.string().max(256)).max(PARALLEL_SOURCE_POLICY_MAX_DOMAINS).optional(),
    afterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    beforeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .optional();

const bodySchema = z
  .object({
    objective: z.string().max(8000).optional(),
    searchQueries: z.array(z.string()).optional(),
    maxResults: z.number().int().min(1).max(50).optional(),
    mode: z.enum(["one-shot", "agentic", "fast"]).optional(),
    sourcePolicy: sourcePolicyBodySchema,
  })
  .superRefine((data, ctx) => {
    const obj = data.objective?.trim() ?? "";
    const queries = (data.searchQueries ?? []).map((q) => q.trim()).filter(Boolean);
    if (!obj && queries.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Provide a non-empty objective and/or at least one search query",
        path: ["objective"],
      });
    }
  });

export const maxDuration = 120;

/**
 * POST `{ objective?, searchQueries?, maxResults?, mode?, sourcePolicy? }` → Parallel Search API
 * (`search_id`, `results`, `warnings`, `usage`).
 *
 * Optional `sourcePolicy` merges with env defaults (`PARALLEL_SEARCH_*` — see `parallelSourcePolicy.ts`).
 */
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  let client;
  try {
    client = createParallelClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Parallel client configuration error";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const objectiveTrim = parsed.data.objective?.trim() ?? "";
  const queries = (parsed.data.searchQueries ?? []).map((q) => q.trim()).filter(Boolean);

  const sourcePolicy = mergeParallelSourcePolicy(
    parallelSourcePolicyFromEnv(),
    parsed.data.sourcePolicy ?? undefined,
  );

  try {
    const result = await client.beta.search({
      objective: objectiveTrim || null,
      search_queries: queries.length > 0 ? queries : null,
      max_results: parsed.data.maxResults ?? null,
      mode: parsed.data.mode ?? null,
      source_policy: sourcePolicyForBetaSearch(sourcePolicy),
    });

    return NextResponse.json({
      search_id: result.search_id,
      results: result.results,
      warnings: result.warnings ?? null,
      usage: result.usage ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Parallel search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
