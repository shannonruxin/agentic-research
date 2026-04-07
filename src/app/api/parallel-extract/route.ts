import { NextResponse } from "next/server";
import { z } from "zod";
import { createParallelClient } from "@/lib/parallelClient";

const bodySchema = z
  .object({
    url: z.string().url("Must be a valid http(s) URL"),
    objective: z.string().max(4000).optional(),
    excerpts: z.boolean().optional(),
    fullContent: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const excerpts = data.excerpts ?? true;
    const fullContent = data.fullContent ?? false;
    if (!excerpts && !fullContent) {
      ctx.addIssue({
        code: "custom",
        message: "At least one of excerpts or fullContent must be true",
        path: ["excerpts"],
      });
    }
  });

/** Allow time for live URL fetches. */
export const maxDuration = 120;

/**
 * POST `{ url, objective?, excerpts?, fullContent? }` → Parallel Extract API response subset
 * (`extract_id`, `results`, `errors`, `warnings`, `usage`).
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

  const { url, objective, excerpts, fullContent } = parsed.data;
  const excerptsVal = excerpts ?? true;
  const fullContentVal = fullContent ?? false;

  try {
    const extract = await client.beta.extract({
      urls: [url],
      objective: objective?.trim() ? objective.trim() : null,
      excerpts: excerptsVal,
      full_content: fullContentVal,
    });

    return NextResponse.json({
      extract_id: extract.extract_id,
      results: extract.results,
      errors: extract.errors,
      warnings: extract.warnings ?? null,
      usage: extract.usage ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Parallel extract failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
