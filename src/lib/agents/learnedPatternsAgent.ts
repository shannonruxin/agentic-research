/**
 * learnedPatternsAgent.ts
 *
 * Extracts generalizable analytical patterns from a completed research session.
 * These are NOT company-specific facts — they are methodology and domain insights
 * that apply broadly to future research of the same type.
 *
 * Output is appended to workspace/global/orchestrator-state/learned-patterns.md
 * and injected into future orchestrator PLAN prompts as a service.
 */

import { generateText } from "ai";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";

const SYSTEM = `You are a research methodology analyst. Given the results of a completed investment research session, extract 2-5 generalizable analytical patterns.

A pattern is a reusable insight about HOW to research a topic — not a fact about the specific company or deal studied. It should help a future analyst approach similar research more effectively.

Good pattern examples:
- "When researching drone companies, regulatory approval timelines in key markets are almost always the primary investment risk — prioritise this dimension before others"
- "For dual-use technology (defense + commercial), separate the revenue streams in the model; blended multiples produce misleading valuations"
- "SaaS companies with NRR above 115% but slowing ARR growth are usually mid-market saturation cases — check enterprise segment performance separately"

Bad patterns (too specific, not generalizable):
- "Aerodyne has strong drone fleet management capabilities" — this is a company fact, not a pattern
- "The CEO is experienced" — not generalizable

Format: output markdown only. For each pattern use:
### Pattern: [short descriptive title]
[2-4 sentences explaining the pattern and when to apply it]

No preamble, no closing remarks.`;

export async function generateLearnedPatterns(input: {
  objective: string;
  subject: string;
  investment_thesis: string;
  dimensions: { id: string; label: string }[];
  key_findings: Record<string, unknown>;
  connections: string[];
  contradictions: string[];
  final_notes: string;
}): Promise<string> {
  const model = createBedrockLanguageModel();

  const prompt = [
    `Research subject: ${input.subject}`,
    `Objective: ${input.objective}`,
    "",
    `Investment thesis reached: ${input.investment_thesis}`,
    "",
    `Dimensions researched: ${input.dimensions.map((d) => d.label).join(", ")}`,
    "",
    `Key findings by dimension:`,
    JSON.stringify(input.key_findings, null, 2),
    "",
    input.connections.length > 0
      ? `Cross-dimension connections identified:\n${input.connections.map((c) => `- ${c}`).join("\n")}`
      : "",
    "",
    input.contradictions.length > 0
      ? `Contradictions encountered:\n${input.contradictions.map((c) => `- ${c}`).join("\n")}`
      : "",
    "",
    `Orchestrator final notes: ${input.final_notes}`,
    "",
    "Extract 2-5 generalizable analytical patterns from this session.",
  ]
    .filter(Boolean)
    .join("\n");

  const { text } = await generateText({
    model,
    system: SYSTEM,
    prompt,
    temperature: 0.3,
    maxOutputTokens: 1500,
  });

  return text.trim();
}
