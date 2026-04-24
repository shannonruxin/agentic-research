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

const LIST_MAX = 48;

/** Normalize model output: string, single value, or array → trimmed string[] */
function toStringList(val: unknown): string[] {
  if (val === undefined || val === null) {
    return [];
  }
  if (Array.isArray(val)) {
    return val.flatMap((item) => {
      if (item === null || item === undefined) {
        return [];
      }
      const t = typeof item === "string" ? item.trim() : String(item).trim();
      return t ? [t] : [];
    });
  }
  if (typeof val === "string") {
    const t = val.trim();
    return t ? [t] : [];
  }
  const t = String(val).trim();
  return t ? [t] : [];
}

function optionalStringList() {
  return z.preprocess(
    (val) => {
      if (val === undefined || val === null) {
        return undefined;
      }
      const list = toStringList(val);
      return list.length ? list : undefined;
    },
    z.array(z.string()).max(LIST_MAX).optional(),
  );
}

const signalLevelEnum = z.enum(["high", "medium", "low"]);

function normalizeSignalLevel(val: unknown): "high" | "medium" | "low" | undefined {
  if (typeof val !== "string") {
    return undefined;
  }
  const s = val.trim().toLowerCase();
  if (s === "high" || s === "medium" || s === "low") {
    return s;
  }
  return undefined;
}

const signalsSchema = z.preprocess(
  (val) => {
    if (val === undefined || val === null) {
      return undefined;
    }
    if (typeof val !== "object" || Array.isArray(val)) {
      return undefined;
    }
    const o = val as Record<string, unknown>;
    const novelty = normalizeSignalLevel(o.novelty);
    const specificity = normalizeSignalLevel(o.specificity);
    const clarity = normalizeSignalLevel(o.clarity);
    if (novelty === undefined && specificity === undefined && clarity === undefined) {
      return undefined;
    }
    return { novelty, specificity, clarity };
  },
  z
    .object({
      novelty: signalLevelEnum.optional(),
      specificity: signalLevelEnum.optional(),
      clarity: signalLevelEnum.optional(),
    })
    .optional(),
);

const statusSchema = z.preprocess((val) => {
  if (typeof val !== "string") {
    return val;
  }
  const s = val.trim().toLowerCase().replace(/\s+/g, "_");
  if (s === "notfound") {
    return "not_found";
  }
  return s;
}, z.enum(["found", "partial", "not_found"]));

/**
 * Map legacy / sloppy model shapes before strict validation.
 * (Models often emit `variable` + `value_summary` or a string for `what_it_does`.)
 */
function migrateLegacyExtractedRow(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }
  const o = { ...(raw as Record<string, unknown>) };

  if (o.entity === undefined || o.entity === null || String(o.entity).trim() === "") {
    if (typeof o.variable === "string" && o.variable.trim()) {
      o.entity = o.variable.trim();
    } else if (o.variable != null && String(o.variable).trim()) {
      o.entity = String(o.variable).trim();
    }
  } else {
    o.entity = String(o.entity).trim();
  }

  const hasWhat = o.what_it_does !== undefined && o.what_it_does !== null;
  const whatArr = hasWhat ? toStringList(o.what_it_does) : [];
  if (whatArr.length === 0 && typeof o.value_summary === "string" && o.value_summary.trim()) {
    o.what_it_does = [o.value_summary.trim()];
  }

  if (typeof o.supporting_snippet === "string" && o.supporting_snippet.trim()) {
    const ex = toStringList(o.evidence_snippets);
    o.evidence_snippets = [...ex, o.supporting_snippet.trim()].slice(0, LIST_MAX);
  }

  delete o.variable;
  delete o.value_summary;
  delete o.supporting_snippet;

  if (!o.entity || String(o.entity).trim() === "") {
    o.entity = "Unnamed entity";
  }

  return o;
}

const extractedKeyDatumInner = z.object({
  entity: z.string().min(1),
  type: z.preprocess(
    (v) =>
      v === undefined || v === null ? undefined : String(v).trim() || undefined,
    z.string().optional(),
  ),
  what_it_does: z.preprocess((val) => toStringList(val), z.array(z.string()).max(LIST_MAX)),
  how_it_works: optionalStringList(),
  target_users: optionalStringList(),
  use_cases: optionalStringList(),
  differentiation_signals: optionalStringList(),
  key_features: optionalStringList(),
  evidence_snippets: optionalStringList(),
  signals: signalsSchema,
  status: statusSchema,
  source_url: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
    z.string().optional(),
  ),
});

/** Zod schema for one extracted entity row (shared with API validators). */
export const extractedKeyDatumZod = z.preprocess(
  migrateLegacyExtractedRow,
  extractedKeyDatumInner,
);

const extractionSchema = z.object({
  extracted_key_data: z.preprocess((v) => {
    if (v === undefined || v === null) {
      return [];
    }
    if (!Array.isArray(v)) {
      return [];
    }
    return v.filter((x) => x !== null && typeof x === "object" && !Array.isArray(x));
  }, z.array(extractedKeyDatumZod).max(32)),
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

const AGENT6_EXTRACT_SYSTEM = `You are Agent 6 — Phase 2 web research executor (search already ran).

You receive search hit snippets (URL, title, excerpt). Emit structured extracted_key_data: one object per distinct entity/signal worth tracking. Tie content to research_task (variables_to_find, goal, method_instructions) but preserve entity names from sources.

Rules:
- Do not compress into a single sentence. Use atomic bullet-like strings in the string array fields (what_it_does, how_it_works, use_cases, differentiation_signals, key_features, evidence_snippets).
- Do not summarize or generalize away concrete mechanisms, workflows, numbers, or phrasing from excerpts.
- Remove marketing fluff; keep technical or operational detail.
- Do not rank, filter, or judge importance in prose (no "most important").
- Preserve differentiation: do not merge distinct products/topics into one entity unless they are the same named thing.
- The same entity may appear in multiple rows if signals are distinct and splitting avoids lossy merging.
- status: found = direct support in excerpts; partial = weak/indirect; not_found = no support in hits.
- source_url: MUST match a hit URL exactly when you cite that hit; otherwise omit.
- what_it_does should usually be non-empty for found/partial; for not_found you may use an empty array or a single "No excerpt support" line.
- Optional signals.novelty | specificity | clarity are coarse hints only (high|medium|low).`;

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
      if (NoObjectGeneratedError.isInstance(e)) {
        const bits: string[] = [];
        if (e.cause instanceof Error) {
          bits.push(e.cause.message);
        }
        if (typeof e.text === "string" && e.text.length > 0) {
          bits.push(`model_output: ${e.text.length > 1200 ? `${e.text.slice(0, 1200)}…` : e.text}`);
        }
        if (e.finishReason) {
          bits.push(`finish_reason: ${e.finishReason}`);
        }
        const detail = bits.length ? ` ${bits.join(" | ")}` : "";
        throw new Agent6ResearchTaskError(
          `Agent 6 extraction did not return valid structured output.${detail}`,
          { cause: e },
        );
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
