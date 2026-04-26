import { generateText } from "ai";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";
import type { IntentClassification } from "@/lib/types";

const CHAT_PATTERNS = [
  /^(hi|hey|hello|thanks|thank you|ok|okay|sure|got it|sounds good|yo|sup)[\s!.?]*$/i,
  /^(good morning|good evening|good afternoon|good night)[\s!.?]*$/i,
  /^(what can you do|who are you|help me)[\s!.?]*$/i,
];

const META_QUESTION_PATTERNS = [
  /\bwhat (kind|type|sort)s?\s+of\s+(research|analysis|report)/i,
  /\bwhat\s+(can|do) (you|u)\s+(do|research|analy[sz]e|help with)/i,
  /\b(your|ur)\s+(capabilities|features|functions)/i,
  /\bhow\s+do(es)?\s+(you|u|this|the system|it)\s+(work|research|analy[sz]e)/i,
  /\bwhat\s+(are|r)\s+(you|ur)\s+(capabilities|features|able to)/i,
  /\btell\s+me\s+about\s+(yourself|your\s*(capabilities|features))/i,
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
  const isMetaQuestion = META_QUESTION_PATTERNS.some((p) => p.test(trimmed));
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

  if (isMetaQuestion) {
    return {
      intent: "chat",
      has_preference_signal: hasPref,
      reasoning: "Meta-question about system capabilities detected via heuristic.",
      chat_reply: generateMetaChatReply(),
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

function generateMetaChatReply(): string {
  return [
    "I can run two kinds of deep research for you:",
    "",
    "**Capital Intelligence** — company analysis, comparable public companies, valuation multiples (PE, EV/Revenue), market positioning, and financial benchmarking.",
    "",
    "**Technology Intelligence** — patent landscape analysis, technology novelty assessment, competitive tech positioning, and innovation timeline mapping.",
    "",
    "Just give me a company name, market, or topic and I'll get started. For example: \"run analysis on stripe.com\" or \"patent landscape for solid-state batteries\".",
  ].join("\n");
}

const INTENT_SYSTEM = `You classify user messages for a research system.

Determine:
1. intent: "chat" (greeting, small talk, simple question answerable without web search) or "research" (needs web investigation, analysis, data gathering).
2. has_preference_signal: true if the message contains a preference about HOW research should be done (e.g., "focus on profitability", "exclude Wikipedia", "always include revenue growth"). A message can be both "research" and have a preference signal.
3. reasoning: brief explanation.
4. chat_reply: when intent is "chat", provide a friendly direct reply.

Meta-questions about the system itself ("what can you do", "what kind of research", "how does this work") are "chat" — answer them directly, do not trigger research.

Lean toward "research" when unsure. Preference signals include: always/never rules, focus directives, source preferences, metric preferences, format preferences.

IMPORTANT: Your response MUST be a single valid JSON object with these fields:
{
  "intent": "chat" or "research",
  "has_preference_signal": true or false,
  "reasoning": "string",
  "chat_reply": "string (only when intent is chat)"
}
Output ONLY the JSON object. No markdown fences, no text before or after.`;

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

  const { text } = await generateText({
    model,
    system: INTENT_SYSTEM,
    prompt,
    maxRetries: 1,
    temperature: 0.1,
    maxOutputTokens: 512,
  });

  try {
    let str = text.trim();
    const fence = str.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) str = fence[1]!.trim();
    const start = str.indexOf("{");
    const end = str.lastIndexOf("}");
    if (start !== -1 && end > start) str = str.slice(start, end + 1);

    const parsed = JSON.parse(str) as Record<string, unknown>;
    return {
      intent: parsed.intent === "chat" ? "chat" : "research",
      has_preference_signal: parsed.has_preference_signal === true,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "LLM classification",
      chat_reply: typeof parsed.chat_reply === "string" ? parsed.chat_reply : undefined,
    };
  } catch {
    return {
      intent: "research",
      has_preference_signal: false,
      reasoning: "LLM output parse failed, defaulting to research",
    };
  }
}
