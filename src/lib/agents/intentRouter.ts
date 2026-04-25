import { generateObject } from "ai";
import { z } from "zod";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";
import type { IntentClassification } from "@/lib/types";

const CHAT_PATTERNS = [
  /^(hi|hey|hello|thanks|thank you|ok|okay|sure|got it|sounds good|yo|sup)[\s!.?]*$/i,
  /^(good morning|good evening|good afternoon|good night)[\s!.?]*$/i,
  /^(what can you do|who are you|help me)[\s!.?]*$/i,
];

const RESEARCH_SIGNALS = [
  /\b(analy[sz]e|research|investigate|compare|evaluat|assessment|report on|look into|find out)\b/i,
  /\b(company|market|industry|valuation|competitor|technology|sector|revenue|financial)\b/i,
  /\b(\.com|\.io|\.ai|\.co)\b/i,
  /\b(how does .+ work|what is .+ worth|who are .+ competitors)\b/i,
  /\brun\s+(analysis|research|report)\b/i,
];

const PREFERENCE_SIGNALS = [
  /\b(always|never|from now on|going forward|in general)\b/i,
  /\b(prefer|prioritize|focus on|skip|exclude|include|don'?t)\b/i,
  /\b(more detail|less detail|shorter|longer|deeper|concise)\b/i,
  /\b(stop (using|including)|start (using|including))\b/i,
];

function classifyIntentHeuristic(message: string): IntentClassification | null {
  const trimmed = message.trim();

  const isShortChat = CHAT_PATTERNS.some((p) => p.test(trimmed));
  const hasResearch = RESEARCH_SIGNALS.some((p) => p.test(trimmed));
  const hasPref = PREFERENCE_SIGNALS.some((p) => p.test(trimmed));

  if (isShortChat && !hasResearch) {
    return {
      intent: "chat",
      has_preference_signal: hasPref,
      reasoning: "Short greeting/acknowledgment detected via heuristic.",
      chat_reply: generateSimpleChatReply(trimmed),
    };
  }

  if (hasResearch && !hasPref) {
    return {
      intent: "research",
      has_preference_signal: false,
      reasoning: "Research signals detected via heuristic.",
    };
  }

  return null;
}

function generateSimpleChatReply(message: string): string {
  const lower = message.toLowerCase().replace(/[!.?]+$/, "").trim();
  if (/^(hi|hey|hello|yo|sup)/.test(lower)) {
    return "Hello! What would you like me to research?";
  }
  if (/^(thanks|thank you)/.test(lower)) {
    return "You're welcome! Let me know if you need anything else.";
  }
  if (/^(good morning|good evening|good afternoon)/.test(lower)) {
    return "Hello! Ready to help with your research whenever you are.";
  }
  if (/^(what can you do|who are you|help)/.test(lower)) {
    return "I'm a research assistant — give me a company, market, or topic and I'll investigate it for you.";
  }
  return "Hello! How can I help with your research?";
}

const intentSchema = z.object({
  intent: z.enum(["chat", "research"]),
  has_preference_signal: z.boolean(),
  reasoning: z.string().min(1),
  chat_reply: z.string().optional(),
});

const INTENT_SYSTEM = `You classify user messages for a research system.

Determine:
1. intent: "chat" (greeting, small talk, simple question answerable without web search) or "research" (needs web investigation, analysis, data gathering).
2. has_preference_signal: true if the message contains a preference about HOW research should be done (e.g., "focus on profitability", "exclude Wikipedia", "always include revenue growth"). A message can be both "research" and have a preference signal.
3. reasoning: brief explanation.
4. chat_reply: when intent is "chat", provide a friendly direct reply.

Lean toward "research" when unsure. Preference signals include: always/never rules, focus directives, source preferences, metric preferences, format preferences.`;

export async function classifyIntent(
  message: string,
  conversationContext?: string,
): Promise<IntentClassification> {
  const heuristic = classifyIntentHeuristic(message);
  if (heuristic) return heuristic;

  const model = createBedrockLanguageModel();
  const prompt = conversationContext
    ? `User message: "${message}"\n\nConversation context (summary of prior turns):\n${conversationContext}`
    : `User message: "${message}"`;

  const { object } = await generateObject({
    model,
    schema: intentSchema,
    system: INTENT_SYSTEM,
    prompt,
    maxRetries: 1,
    temperature: 0.1,
    maxOutputTokens: 512,
  });

  return object;
}
