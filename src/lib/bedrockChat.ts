import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
} from "@aws-sdk/client-bedrock-runtime";

export type BedrockEnv = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  modelId: string;
};

export function readBedrockEnv(): BedrockEnv | null {
  const region = process.env.AWS_REGION?.trim();
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const modelId = process.env.BEDROCK_MODEL_ID?.trim();
  const sessionToken = process.env.AWS_SESSION_TOKEN?.trim();

  if (!region || !accessKeyId || !secretAccessKey || !modelId) {
    return null;
  }

  return {
    region,
    accessKeyId,
    secretAccessKey,
    modelId,
    ...(sessionToken ? { sessionToken } : {}),
  };
}

function textFromContent(content: ContentBlock[] | undefined): string {
  if (!content?.length) {
    return "";
  }
  const parts: string[] = [];
  for (const block of content) {
    if ("text" in block && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("");
}

/** One turn for Bedrock Converse (must alternate user / assistant; last turn is always user). */
export type ChatTurn = { role: "user" | "assistant"; text: string };

/**
 * Calls Bedrock **Converse** with the full thread so the model sees prior turns.
 * Same env as chat UI: `readBedrockEnv()` / `AWS_*` / `BEDROCK_MODEL_ID`.
 *
 * `messages`: non-empty, first role `user`, last role `user` (matches `POST /api/chat` body).
 */
export async function bedrockChatReply(messages: ChatTurn[]): Promise<string> {
  const env = readBedrockEnv();
  if (!env) {
    throw new Error(
      "Bedrock is not configured. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and BEDROCK_MODEL_ID in .env.local.",
    );
  }

  if (messages.length === 0) {
    throw new Error("messages must not be empty");
  }
  if (messages[0]?.role !== "user") {
    throw new Error("Conversation must start with a user message");
  }
  if (messages[messages.length - 1]?.role !== "user") {
    throw new Error("Last message must be from the user");
  }

  const client = new BedrockRuntimeClient({
    region: env.region,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
      ...(env.sessionToken ? { sessionToken: env.sessionToken } : {}),
    },
  });

  const command = new ConverseCommand({
    modelId: env.modelId,
    messages: messages.map((m) => ({
      role: m.role,
      content: [{ text: m.text }],
    })),
    inferenceConfig: {
      maxTokens: 1024,
      temperature: 0.5,
    },
  });

  const response = await client.send(command);

  if (response.stopReason === "guardrail_intervened") {
    throw new Error("Bedrock guardrail blocked the response.");
  }

  const reply = textFromContent(response.output?.message?.content);
  if (!reply) {
    throw new Error("Model returned no text content.");
  }

  return reply;
}
