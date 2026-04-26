import { NextResponse } from "next/server";
import { z } from "zod";
import { classifyIntent } from "@/lib/agents/intentRouter";

const bodySchema = z.object({
  message: z.string().min(1),
  conversation_context: z.string().optional(),
});

export const maxDuration = 30;

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
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await classifyIntent(
      parsed.data.message,
      parsed.data.conversation_context || undefined,
    );
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Intent classification failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
