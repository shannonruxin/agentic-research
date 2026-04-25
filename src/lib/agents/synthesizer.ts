import { generateObject } from "ai";
import { z } from "zod";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";
import { agent7DimensionSchema, knownGapGroupSchema } from "@/lib/agents/agent7Orchestrate";
import type {
  Agent7Dimension,
  Agent7KnownGapGroup,
  SynthesizerOutput,
  WorkerOutput,
} from "@/lib/types";

const synthesizerOutputSchema = z.object({
  user_facing_document: z.string().min(1),
  key_findings: z.record(z.string(), z.unknown()),
  dimensions: z.array(agent7DimensionSchema).min(1).max(16),
  known_gaps: z.array(knownGapGroupSchema),
  findings_summary: z.object({
    key: z.string().min(1),
    value: z.unknown(),
  }),
});

const SYNTHESIZER_SYSTEM = `You are the Research Synthesizer. You receive results from multiple parallel research workers and produce a unified, high-quality Markdown report for the end user.

You receive:
- objective: the user's original request.
- subject_scope: binding subject constraints (if provided).
- domain_manual: domain process definitions and user preferences.
- worker_results: array of structured findings from each research worker, each covering one dimension/factor.
- user_preferences_summary: applicable user preferences.
- prior_key_findings: structured findings from earlier conversation turns (if multi-turn).

Your output:
1. user_facing_document: A complete Markdown report with:
   - Executive summary at the top
   - Clear headings per dimension/topic (## for major sections, ### for sub-sections)
   - Evidence-grounded analysis (cite specific data and sources)
   - Specific numbers, names, and data points (not vague summaries)
   - Explicit caveats for missing data or low-confidence areas
   - A conclusion/summary section
   - Source URLs referenced inline or at the end

2. key_findings: Structured JSON object capturing the most important findings by dimension.

3. dimensions: The final set of research dimensions covered.

4. known_gaps: What remains unknown or uncertain after this research.

5. findings_summary: Rolling summary with a dynamic key and value for persistence.

Do NOT fabricate URLs or data. If workers reported gaps, reflect those honestly. Apply user preferences to report structure. Merge and deduplicate information across workers — do not repeat the same data point in multiple sections.`;

function buildSynthesizerPrompt(input: {
  objective: string;
  subject_scope?: string;
  domain_manual: Record<string, unknown>;
  worker_results: WorkerOutput[];
  user_preferences_summary: string;
  research_hygiene?: Record<string, unknown>;
  prior_key_findings?: Record<string, unknown>;
  prior_dimensions?: Agent7Dimension[];
  prior_known_gaps?: Agent7KnownGapGroup[];
}): string {
  const parts: string[] = [
    `objective:\n"""${input.objective.trim()}"""`,
    "",
  ];

  if (input.subject_scope?.trim()) {
    parts.push(`subject_scope:\n${input.subject_scope.trim()}`, "");
  }

  parts.push(`domain_manual:\n${JSON.stringify(input.domain_manual, null, 2)}`, "");
  parts.push(`user_preferences:\n${input.user_preferences_summary}`, "");

  if (input.research_hygiene && Object.keys(input.research_hygiene).length > 0) {
    parts.push(`research_hygiene:\n${JSON.stringify(input.research_hygiene, null, 2)}`, "");
  }

  if (input.prior_key_findings && Object.keys(input.prior_key_findings).length > 0) {
    parts.push("Prior key_findings (merge with new):", JSON.stringify(input.prior_key_findings, null, 2), "");
  }

  if (input.prior_dimensions?.length) {
    parts.push("Prior dimensions:", JSON.stringify(input.prior_dimensions, null, 2), "");
  }

  if (input.prior_known_gaps?.length) {
    parts.push("Prior known_gaps:", JSON.stringify(input.prior_known_gaps, null, 2), "");
  }

  parts.push("Worker results (one per research task):");
  for (const wr of input.worker_results) {
    parts.push(
      `\n--- Task: ${wr.task_id} (${wr.dimension} / ${wr.factor}) [confidence: ${wr.confidence}] ---`,
      `Summary: ${wr.summary}`,
      `Sources: ${JSON.stringify(wr.sources, null, 2)}`,
      `Extracted data: ${JSON.stringify(wr.extracted_data, null, 2)}`,
      `Gaps remaining: ${JSON.stringify(wr.gaps_remaining)}`,
    );
  }

  parts.push("", "Produce the unified report and structured outputs per schema.");
  return parts.join("\n");
}

export async function runSynthesizer(input: {
  objective: string;
  subject_scope?: string;
  domain_manual: Record<string, unknown>;
  worker_results: WorkerOutput[];
  user_preferences_summary: string;
  research_hygiene?: Record<string, unknown>;
  prior_key_findings?: Record<string, unknown>;
  prior_dimensions?: Agent7Dimension[];
  prior_known_gaps?: Agent7KnownGapGroup[];
}): Promise<SynthesizerOutput> {
  const model = createBedrockLanguageModel();
  const prompt = buildSynthesizerPrompt(input);

  const { object } = await generateObject({
    model,
    schema: synthesizerOutputSchema,
    schemaName: "ResearchSynthesizer",
    system: SYNTHESIZER_SYSTEM,
    prompt,
    maxRetries: 2,
    temperature: 0.2,
    maxOutputTokens: 12_000,
  });

  return {
    user_facing_document: object.user_facing_document.trim(),
    key_findings: object.key_findings,
    dimensions: object.dimensions.map((d) => ({
      label: d.label.trim(),
      description: d.description?.trim() || undefined,
    })),
    known_gaps: object.known_gaps.map((g) => ({
      dimension: g.dimension?.trim() || undefined,
      gaps: g.gaps.map((x) => x.trim()).filter(Boolean),
    })),
    findings_summary: {
      key: object.findings_summary.key.trim(),
      value: object.findings_summary.value,
    },
  };
}
