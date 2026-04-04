import { NextResponse } from "next/server";
import { z } from "zod";
import { bedrockChatReply, readBedrockEnv } from "@/lib/bedrockChat";

const turnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1),
});

const bodySchema = z
  .object({
    messages: z.array(turnSchema).min(1, "at least one message is required"),
  })
  .superRefine((data, ctx) => {
    if (data.messages[0]?.role !== "user") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "First message must be from the user",
      });
    }
    if (data.messages[data.messages.length - 1]?.role !== "user") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Last message must be from the user",
      });
    }
  });

export async function POST(req: Request) {
  if (!readBedrockEnv()) {
    return NextResponse.json(
      {
        error:
          "Bedrock environment variables are missing. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and BEDROCK_MODEL_ID in .env.local.",
      },
      { status: 503 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const err =
      parsed.error.flatten().formErrors[0] ??
      Object.values(parsed.error.flatten().fieldErrors).flat()[0] ??
      "Invalid body";
    return NextResponse.json({ error: err }, { status: 400 });
  }

  try {
    const reply = await bedrockChatReply(parsed.data.messages);
    return NextResponse.json({ reply });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bedrock request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
