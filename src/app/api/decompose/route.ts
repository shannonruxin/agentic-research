import { NextResponse } from "next/server";
import { z } from "zod";
import {
  decomposeQuery,
  EmptyQueryError,
  NoValidQueryError,
  QueryDecompositionModelError,
} from "@/lib/agents/queryDecomposition";

const bodySchema = z.object({
  query: z.string().min(1, "query is required"),
});

/**
 * POST JSON `{ "query": string }` → HTTP JSON body = serialized `QueryDecomposition`
 * (`core_query`, `keywords`, `support_angles`).
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
      { error: parsed.error.flatten().fieldErrors.query?.[0] ?? "Invalid body" },
      { status: 400 },
    );
  }

  try {
    const decomposition = await decomposeQuery(parsed.data.query);
    return NextResponse.json(decomposition);
  } catch (e) {
    if (e instanceof EmptyQueryError || e instanceof NoValidQueryError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof QueryDecompositionModelError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Decomposition failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
