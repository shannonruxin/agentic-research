import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { agent7ResearchTaskSchema } from "@/lib/agents/agent7Orchestrate";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";
import { createParallelClient } from "@/lib/parallelClient";
import {
  parallelSourcePolicyFromEnv,
  sourcePolicyForBetaSearch,
} from "@/lib/parallelSourcePolicy";
import type {
  Agent6AssignmentFromAgent3,
  Agent6ResearchRunResult,
  Agent7ResearchTask,
  ExtractedKeyDatum,
} from "@/lib/types";

/** Parallel / LLM / validation failure for Agent 6 (Phase 2 research task). */
export class Agent6ResearchTaskError extends Error {
  override readonly name = "Agent6ResearchTaskError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const MAX_OBJECTIVE_LEN = 6000;
const MAX_QUERIES = 14;
const MAX_SEARCH_RESULTS = 14;

const keyDatumSchema = z.object({
  variable: z.string().min(1),
  status: z.enum(["found", "partial", "not_found"]),
  value_summary: z.string().min(1),
  supporting_snippet: z.string().optional(),
  source_url: z.string().optional(),
});

const extractionSchema = z.object({
  extracted_key_data: z.array(keyDatumSchema).max(24),
});

function normalizeUrl(u: string): string {
  return u.trim();
}

function buildObjective(
  task: Agent7ResearchTask,
  iteration?: { objective_suffix?: string },
): string {
  const lines: string[] = [
    `Goal: ${task.goal}`,
    `Dimension: ${task.dimension}; factor: ${task.factor}`,
  ];
  if (task.context && Object.keys(task.context).length > 0) {
    lines.push(`Context: ${JSON.stringify(task.context)}`);
  }
  if (task.method_instructions?.length) {
    lines.push("Method:");
    task.method_instructions.forEach((m, i) => lines.push(`  ${i + 1}. ${m}`));
  }
  if (task.calculation_logic?.trim()) {
    lines.push(`Calculation logic: ${task.calculation_logic.trim()}`);
  }
  if (task.validation_criteria?.length) {
    lines.push(`Validation criteria: ${task.validation_criteria.join(" | ")}`);
  }
  if (iteration?.objective_suffix?.trim()) {
    lines.push(`Follow-up: ${iteration.objective_suffix.trim()}`);
  }
  const text = lines.join("\n");
  return text.length > MAX_OBJECTIVE_LEN ? text.slice(0, MAX_OBJECTIVE_LEN) : text;
}

function buildQueryListFromAssignment(
  assignment: Agent6AssignmentFromAgent3,
  extra?: string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (q: string) => {
    const t = q.trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  for (const q of assignment.search_queries) {
    push(q);
  }
  for (const q of extra ?? []) {
    push(q);
  }
  return out.slice(0, MAX_QUERIES);
}

function buildObjectiveFromAssignment(
  task: Agent7ResearchTask,
  assignment: Agent6AssignmentFromAgent3,
  iteration?: { objective_suffix?: string },
): string {
  const lines: string[] = [assignment.search_objective.trim()];
  if (assignment.extraction_notes?.trim()) {
    lines.push(`Extraction focus: ${assignment.extraction_notes.trim()}`);
  }
  if (iteration?.objective_suffix?.trim()) {
    lines.push(`Follow-up: ${iteration.objective_suffix.trim()}`);
  }
  lines.push(`Task: [${task.dimension} / ${task.factor}] ${task.goal}`);
  const text = lines.join("\n\n");
  return text.length > MAX_OBJECTIVE_LEN ? text.slice(0, MAX_OBJECTIVE_LEN) : text;
}

function buildQueryList(task: Agent7ResearchTask, extra?: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (q: string) => {
    const t = q.trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  for (const g of task.search_guidance ?? []) {
    push(g);
  }
  for (const v of task.variables_to_find ?? []) {
    push(v);
    push(`"${v}" data evidence`);
  }
  for (const q of extra ?? []) {
    push(q);
  }
  return out.slice(0, MAX_QUERIES);
}

function clampDatumsToUrls(data: ExtractedKeyDatum[], allowed: Set<string>): ExtractedKeyDatum[] {
  return data.map((d) => {
    const u = d.source_url?.trim();
    if (!u || !allowed.has(u)) {
      const { source_url: _, ...rest } = d;
      return rest;
    }
    return { ...d, source_url: u };
  });
}

const AGENT6_EXTRACT_SYSTEM = `You are Agent 6 — Phase 2 web research executor.

You receive search hit snippets (URL, title, excerpt). Map findings to the task's variables_to_find.

Rules:
- extracted_key_data.variable should match or clearly correspond to a named variable from the task when possible.
- status: found = direct support; partial = weak or indirect; not_found = no support in the hits.
- value_summary: short factual statement (not a URL).
- supporting_snippet: quote or paraphrase grounded in the provided excerpt text only.
- source_url: MUST be copied exactly from the provided hit URLs list when you cite a source. If unsure, omit source_url.`;

function buildExtractionUserMessage(
  task: Agent7ResearchTask,
  hits: { url: string; title?: string | null; excerpts?: string[] | null }[],
  domainManual?: Record<string, unknown>,
  hygiene?: Record<string, unknown>,
  agent3ExtractionNotes?: string,
): string {
  const parts: string[] = [
    "research_task:",
    JSON.stringify(task, null, 2),
    "",
    "search_hits:",
    ...hits.map((h, i) => {
      const ex = (h.excerpts ?? []).join("\n---\n").slice(0, 2500);
      return `[${i + 1}] URL: ${h.url}\nTitle: ${h.title ?? ""}\nExcerpts:\n${ex || "(none)"}\n`;
    }),
  ];
  if (domainManual && Object.keys(domainManual).length > 0) {
    parts.push("", "domain_manual:", JSON.stringify(domainManual, null, 2));
  }
  if (hygiene && Object.keys(hygiene).length > 0) {
    parts.push("", "research_hygiene:", JSON.stringify(hygiene, null, 2));
  }
  if (agent3ExtractionNotes?.trim()) {
    parts.push("", "agent3_extraction_notes:", agent3ExtractionNotes.trim());
  }
  parts.push("", "Emit extracted_key_data per schema.");
  return parts.join("\n");
}

/**
 * Agent 6 (Phase 2) — **`beta.search`** + structured **`extracted_key_data`** for one **`research_task`**.
 *
 * When **`agent3_assignment`** is set (normal path after Agent 3 plan), search objective and queries come from Agent 3.
 * When omitted, falls back to **`research_task`** search_guidance / variables_to_find (legacy sandbox).
 */
export async function runAgent6ResearchTask(input: {
  research_task: Agent7ResearchTask;
  domain_manual?: Record<string, unknown>;
  research_hygiene?: Record<string, unknown>;
  /** From Agent 3 plan — drives beta.search when present. */
  agent3_assignment?: Agent6AssignmentFromAgent3;
  iteration_extension?: { additional_queries?: string[]; objective_suffix?: string };
}): Promise<Agent6ResearchRunResult> {
  const parsed = agent7ResearchTaskSchema.safeParse(input.research_task);
  if (!parsed.success) {
    throw new Agent6ResearchTaskError(parsed.error.issues[0]?.message ?? "Invalid research_task");
  }
  const task = parsed.data;

  let client: ReturnType<typeof createParallelClient>;
  try {
    client = createParallelClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Parallel client configuration error";
    throw new Agent6ResearchTaskError(msg);
  }

  const assign = input.agent3_assignment;
  const queries_used = assign
    ? buildQueryListFromAssignment(assign, input.iteration_extension?.additional_queries)
    : buildQueryList(task, input.iteration_extension?.additional_queries);
  const objective = assign
    ? buildObjectiveFromAssignment(task, assign, {
        objective_suffix: input.iteration_extension?.objective_suffix,
      })
    : buildObjective(task, {
        objective_suffix: input.iteration_extension?.objective_suffix,
      });
  const extractionNotes = assign?.extraction_notes?.trim() || undefined;

  let searchId: string | null | undefined;
  const hits: { url: string; title?: string | null; excerpts?: string[] | null }[] = [];

  try {
    const result = await client.beta.search({
      objective: objective || null,
      search_queries: queries_used.length > 0 ? queries_used : null,
      max_results: MAX_SEARCH_RESULTS,
      mode: "one-shot",
      excerpts: { max_chars_per_result: 2500 },
      source_policy: sourcePolicyForBetaSearch(parallelSourcePolicyFromEnv()),
    });
    searchId = result.search_id ?? null;
    for (const h of result.results ?? []) {
      const url = normalizeUrl(h.url);
      if (!url) continue;
      hits.push({
        url,
        title: h.title ?? null,
        excerpts: h.excerpts ?? null,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Parallel search failed";
    throw new Agent6ResearchTaskError(msg);
  }

  const source_urls = [...new Set(hits.map((h) => h.url))];
  const allowedUrls = new Set(source_urls);

  let extracted_key_data: ExtractedKeyDatum[] = [];
  if (hits.length > 0) {
    try {
      const model = createBedrockLanguageModel();
      const { object } = await generateObject({
        model,
        schema: extractionSchema,
        system: AGENT6_EXTRACT_SYSTEM,
        prompt: buildExtractionUserMessage(
          task,
          hits,
          input.domain_manual,
          input.research_hygiene,
          extractionNotes,
        ),
      });
      extracted_key_data = clampDatumsToUrls(object.extracted_key_data, allowedUrls);
    } catch (e) {
      if (e instanceof NoObjectGeneratedError) {
        throw new Agent6ResearchTaskError("Agent 6 extraction did not return valid structured output.", {
          cause: e,
        });
      }
      const msg = e instanceof Error ? e.message : "Agent 6 extraction failed";
      throw new Agent6ResearchTaskError(msg, e instanceof Error ? { cause: e } : undefined);
    }
  }

  return {
    queries_used,
    source_urls,
    extracted_key_data,
    parallel_search_id: searchId,
  };
}
