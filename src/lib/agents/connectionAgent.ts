/**
 * connectionAgent.ts
 *
 * Surfaces cross-dimension connections, patterns, and contradictions after each review round.
 * Writes findings to orchestrator-state/connections.md — injected into future review/deliver prompts.
 *
 * This is a supplementary sub-agent: its output enriches the orchestrator's synthesis
 * by highlighting non-obvious links that wouldn't be visible within a single dimension.
 */

import { generateText } from "ai";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";
import type { SessionWorkerFinding } from "@/lib/sessionStorage";

const SYSTEM = `You are a cross-dimension research analyst. Your role is to surface non-obvious connections, patterns, and contradictions across multiple research dimensions.

Focus on:
- Causal links between dimensions (e.g., technology debt correlating with customer churn)
- Convergent evidence where findings from different dimensions reinforce the same conclusion
- Contradictions between dimensions that need to be flagged for the orchestrator
- Emergent themes that only become visible when looking across dimensions
- Investment-relevant signals: risk amplifiers, opportunity multipliers, thesis validators or breakers

Rules:
- Be specific: cite dimension names and actual data points, not vague generalities
- Be concise: bullet points, no filler prose
- Only include connections with genuine signal; do not force connections that aren't there
- Group under short markdown headers by type (Convergent Evidence / Contradictions / Causal Links / Emerging Themes)

Output compact markdown only. No preamble.`;

export async function generateConnectionInsights(input: {
  objective: string;
  activeFindings: SessionWorkerFinding[];
  inactiveSummaries: { dimensionId: string; summary: string }[];
}): Promise<string> {
  const totalItems = input.activeFindings.length + input.inactiveSummaries.length;
  if (totalItems === 0) return "";

  // Not enough across dimensions to find connections yet
  const dimensionCount =
    new Set([
      ...input.activeFindings.map((f) => f.dimension),
      ...input.inactiveSummaries.map((s) => s.dimensionId),
    ]).size;
  if (dimensionCount < 2) return "";

  const model = createBedrockLanguageModel();

  const parts: string[] = [`Research objective: ${input.objective}`, ""];

  if (input.activeFindings.length > 0) {
    // Group by dimension for readability
    const byDim = new Map<string, SessionWorkerFinding[]>();
    for (const f of input.activeFindings) {
      const arr = byDim.get(f.dimension) ?? [];
      arr.push(f);
      byDim.set(f.dimension, arr);
    }
    parts.push("## Active dimension findings");
    for (const [dim, findings] of byDim) {
      parts.push(`### ${dim}`);
      for (const f of findings) {
        // Compact: first 500 chars of summary
        parts.push(`- [Round ${f.round}, factor: ${f.factor}, conf: ${f.confidence.toFixed(2)}] ${f.summary.slice(0, 500)}`);
      }
    }
    parts.push("");
  }

  if (input.inactiveSummaries.length > 0) {
    parts.push("## Concluded dimension summaries");
    for (const s of input.inactiveSummaries) {
      parts.push(`### ${s.dimensionId}`);
      // Max 600 chars per inactive summary in this context
      parts.push(s.summary.slice(0, 600));
    }
    parts.push("");
  }

  parts.push(
    "Identify cross-dimension connections, patterns, and contradictions relevant to the research objective.",
    "Output markdown bullets grouped by type.",
  );

  const { text } = await generateText({
    model,
    system: SYSTEM,
    prompt: parts.join("\n"),
    temperature: 0.2,
    maxOutputTokens: 1500,
  });

  return text.trim();
}
