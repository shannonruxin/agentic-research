import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";

/**
 * Bedrock chat model for AI SDK (`generateObject`, etc.).
 * Uses `AWS_REGION`, `BEDROCK_MODEL_ID`, and standard AWS credential env vars.
 */
export function createBedrockLanguageModel() {
  const modelId = process.env.BEDROCK_MODEL_ID?.trim();
  const region = process.env.AWS_REGION?.trim();
  if (!modelId) {
    throw new Error("BEDROCK_MODEL_ID is not set");
  }
  if (!region) {
    throw new Error("AWS_REGION is not set");
  }

  const bedrock = createAmazonBedrock({
    region,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  });

  return bedrock(modelId);
}
