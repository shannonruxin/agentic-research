/**
 * dimensionSummaryAgent.ts
 *
 * Generates a compact LLM summary for a concluded research dimension.
 * Called when a dimension reaches sufficient coverage and is marked inactive.
 * The summary is stored in orchestrator-state/dimension-summaries/{dim}.md
 * and injected into future orchestrator review/deliver prompts as context.
 */

import { generateText } from "ai";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";
import type { SessionWorkerFinding } from "@/lib/sessionStorage";

const SYSTEM = `You are a research synthesis specialist. Given all worker findings collected for a single research dimension, produce a compact but comprehensive summary.

This summary will be stored as an "inactive dimension record" and fed to the orchestrator in future rounds to:
- Prevent redundant research on concluded dimensions
- Allow cross-dimension reasoning to build on completed work
- Inform planning of follow-up turns

Requirements:
- Comprehensive: capture all key findings, data points, and evidence
- Compact: no repetition, no padding, no filler sentences
- Specific: include actual numbers, company names, dates, mechanisms where found
- Structured: use short markdown sub-headers if multiple distinct sub-themes

Output only the summary markdown. No preamble, no commentary.`;

export async function generateDimensionSummary(input: {
  dimensionId: string;
  dimensionLabel: string;
  findings: SessionWorkerFinding[];
}): Promise<string> {
  if (input.findings.length === 0) {
    return `*(No findings collected for ${input.dimensionLabel})*`;
  }

  const model = createBedrockLanguageModel();

  // Sort by round then format each finding compactly
  const findingsText = input.findings
    .sort((a, b) => a.round - b.round || a.task_id.localeCompare(b.task_id))
    .map((f) => {
      const lines = [
        `### Round ${f.round} — factor: ${f.factor} (confidence: ${f.confidence.toFixed(2)})`,
        f.summary,
      ];
      if (f.gaps_remaining.length > 0) {
        lines.push(`Gaps: ${f.gaps_remaining.join("; ")}`);
      }
      if (f.rabbithole_leads.length > 0) {
        lines.push(`Notable leads: ${f.rabbithole_leads.join("; ")}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");

  const prompt = [
    `Dimension: **${input.dimensionLabel}** (id: \`${input.dimensionId}\`)`,
    "",
    "All worker findings collected for this dimension:",
    "",
    findingsText,
    "",
    "Generate a compact summary capturing all key insights from the above findings.",
  ].join("\n");

  const { text } = await generateText({
    model,
    system: SYSTEM,
    prompt,
    temperature: 0.1,
    maxOutputTokens: 2000,
  });

  return text.trim();
}
