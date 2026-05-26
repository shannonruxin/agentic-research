import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";
import { createParallelClient } from "@/lib/parallelClient";
import {
  parallelSourcePolicyFromEnv,
  sourcePolicyForBetaSearch,
} from "@/lib/parallelSourcePolicy";
import type { ParallelSourcePolicy } from "@/lib/parallelSourcePolicy";
import type { ExtractedKeyDatum, PlannerResearchTask, WorkerOutput } from "@/lib/types";

const WORKER_SYSTEM = `You are a Research Worker. You have been assigned a specific research task. You have access to a webSearch tool to find information on the web.

Your process:
1. Read the task carefully: understand the goal, dimension, factor, and what data to find.
2. Use the webSearch tool with the provided search_guidance as a starting point. Adapt queries based on what you find.
3. After each search, evaluate: do you have enough evidence to answer the task's goal?
4. If not, search again with refined queries targeting specific gaps.
5. When you have sufficient evidence (or have exhausted your search budget), write your final output.

Rules:
- Do NOT fabricate URLs, quotes, or data points.
- Extract specific data: numbers, names, dates, mechanisms — not vague summaries.
- Track which URL each piece of information came from.
- If the task includes variables_to_find, prioritize finding those specific data points.
- If domain_manual guidance is provided, follow its process steps.
- Apply any user_preferences noted in your task context.
- Be efficient: 1-3 searches should suffice for most tasks. Do not search more than needed.

Your final message MUST be a JSON object with these fields:
{
  "task_id": "string",
  "dimension": "string",
  "factor": "string",
  "summary": "string (comprehensive findings summary, 200-500 words)",
  "sources": [{ "url": "string", "title": "string or null", "relevance": "string", "data_noted": "string" }],
  "extracted_data": [{ "entity": "string", "type": "string or null", "what_it_does": ["string"], "status": "found|partial|not_found", "source_url": "string or null" }],
  "confidence": number between 0 and 1,
  "gaps_remaining": ["string"],
  "search_queries_used": ["string"],
  "rabbithole_leads": ["string (0-5 items, optional)"]
}

After your main findings, identify 0-5 high-signal threads worth deeper investigation. These are specific leads (company names, patent numbers, regulatory filings, named datasets, niche competitors) that could unlock new search space if pursued. Only include genuinely promising leads, not restated gaps.

Output ONLY the JSON object. No markdown fences, no explanatory text before or after.`;

function buildWorkerPrompt(input: {
  task: PlannerResearchTask;
  domain_manual?: Record<string, unknown>;
  research_hygiene?: Record<string, unknown>;
  user_preferences_summary: string;
  profile_context?: string;
}): string {
  const parts: string[] = [
    "research_task:",
    JSON.stringify(input.task, null, 2),
    "",
  ];

  if (input.profile_context?.trim()) {
    parts.push("Company/subject profile (from prior phase):", input.profile_context.trim(), "");
  }

  if (input.domain_manual && Object.keys(input.domain_manual).length > 0) {
    parts.push("domain_manual:", JSON.stringify(input.domain_manual, null, 2), "");
  }

  if (input.research_hygiene && Object.keys(input.research_hygiene).length > 0) {
    parts.push("research_hygiene:", JSON.stringify(input.research_hygiene, null, 2), "");
  }

  if (input.user_preferences_summary.trim()) {
    parts.push("user_preferences:", input.user_preferences_summary, "");
  }

  parts.push(
    `Use webSearch with the search_guidance queries as your starting point: ${JSON.stringify(input.task.search_guidance)}`,
    "",
    "When done, output your findings as the JSON object specified in the system message.",
  );

  return parts.join("\n");
}

function parseWorkerOutput(text: string, task: PlannerResearchTask): WorkerOutput {
  let jsonStr = text.trim();

  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1]!.trim();
  }

  const braceStart = jsonStr.indexOf("{");
  const braceEnd = jsonStr.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    jsonStr = jsonStr.slice(braceStart, braceEnd + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    return {
      task_id: typeof parsed.task_id === "string" ? parsed.task_id : task.task_id,
      dimension: typeof parsed.dimension === "string" ? parsed.dimension : task.dimension,
      factor: typeof parsed.factor === "string" ? parsed.factor : task.factor,
      summary: typeof parsed.summary === "string" ? parsed.summary : "Worker did not produce a summary.",
      sources: Array.isArray(parsed.sources)
        ? (parsed.sources as Record<string, unknown>[]).map((s) => ({
            url: String(s.url ?? ""),
            title: typeof s.title === "string" ? s.title : undefined,
            relevance: String(s.relevance ?? ""),
            data_noted: String(s.data_noted ?? ""),
          }))
        : [],
      extracted_data: Array.isArray(parsed.extracted_data)
        ? (parsed.extracted_data as ExtractedKeyDatum[])
        : [],
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.3,
      gaps_remaining: Array.isArray(parsed.gaps_remaining)
        ? (parsed.gaps_remaining as string[])
        : [],
      search_queries_used: Array.isArray(parsed.search_queries_used)
        ? (parsed.search_queries_used as string[])
        : [],
      rabbithole_leads: Array.isArray(parsed.rabbithole_leads)
        ? (parsed.rabbithole_leads as string[]).filter((s) => typeof s === "string" && s.trim())
        : [],
    };
  } catch {
    return {
      task_id: task.task_id,
      dimension: task.dimension,
      factor: task.factor,
      summary: text.slice(0, 1000),
      sources: [],
      extracted_data: [],
      confidence: 0.1,
      gaps_remaining: ["Worker output was not valid JSON"],
      search_queries_used: [],
      rabbithole_leads: [],
    };
  }
}

export async function runResearchWorker(input: {
  task: PlannerResearchTask;
  domain_manual?: Record<string, unknown>;
  research_hygiene?: Record<string, unknown>;
  user_preferences_summary: string;
  profile_context?: string;
  /** Pipeline-merged policy (env ∪ request); falls back to env-only when null */
  search_source_policy?: ParallelSourcePolicy | null;
}): Promise<WorkerOutput> {
  const model = createBedrockLanguageModel();

  const policyForSearch = input.search_source_policy ?? parallelSourcePolicyFromEnv();

  const webSearch = tool({
    description: "Search the web for information. Returns search results with URLs, titles, and excerpts.",
    inputSchema: z.object({
      queries: z
        .array(z.string().min(1))
        .min(1)
        .max(8)
        .describe("Search queries to execute. Be specific and varied."),
      objective: z
        .string()
        .min(1)
        .describe("What you are trying to find with these queries."),
    }),
    execute: async ({ queries, objective }) => {
      const client = createParallelClient();
      const result = await client.beta.search({
        objective: objective || null,
        search_queries: queries.length > 0 ? queries : null,
        max_results: 10,
        mode: "one-shot",
        excerpts: { max_chars_per_result: 2500 },
        source_policy: sourcePolicyForBetaSearch(policyForSearch),
      });

      const hits = result.results ?? [];
      if (hits.length === 0) return "No results found.";

      return hits
        .map((h, i) => {
          const ex = (h.excerpts ?? []).join("\n---\n").slice(0, 2500);
          return `[${i + 1}] URL: ${h.url}\nTitle: ${h.title ?? "(no title)"}\nExcerpts:\n${ex || "(none)"}`;
        })
        .join("\n\n");
    },
  });

  const taskPrompt = buildWorkerPrompt(input);

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await generateText({
        model,
        tools: { webSearch },
        stopWhen: stepCountIs(5),
        system: WORKER_SYSTEM,
        prompt: taskPrompt,
        temperature: 0.2,
        maxOutputTokens: 4096,
      });
      return parseWorkerOutput(result.text, input.task);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.toLowerCase().includes("too many requests") && attempt < maxAttempts) {
        const backoff = attempt * 5000;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw e;
    }
  }
  throw new Error("Worker exhausted retries");
}

const MAX_CONCURRENT_WORKERS = 2;
const STAGGER_MS = 2000;

async function runWithConcurrencyLimit<T>(
  fns: (() => Promise<T>)[],
  limit: number,
  staggerMs: number,
  onItemComplete?: (result: T) => Promise<void>,
): Promise<T[]> {
  const results: T[] = new Array(fns.length);
  const queue = fns.map((fn, i) => ({ fn, i }));
  let launched = 0;

  async function next(): Promise<void> {
    while (queue.length > 0) {
      const item = queue.shift()!;
      const myLaunchIndex = launched++;
      if (myLaunchIndex > 0 && staggerMs > 0) {
        await new Promise((r) => setTimeout(r, staggerMs));
      }
      results[item.i] = await item.fn();
      if (onItemComplete) {
        await onItemComplete(results[item.i]!);
      }
    }
  }

  const slots = Array.from({ length: Math.min(limit, fns.length) }, () => next());
  await Promise.all(slots);
  return results;
}

export async function runWorkersParallel(input: {
  tasks: PlannerResearchTask[];
  domain_manual: Record<string, unknown>;
  research_hygiene?: Record<string, unknown>;
  user_preferences_summary: string;
  execution_strategy: "all_parallel" | "two_phase";
  profile_task_id?: string;
  max_concurrent?: number;
  stagger_ms?: number;
  search_source_policy?: ParallelSourcePolicy | null;
  /** Called immediately after each worker completes — used for live session storage writes. */
  onWorkerComplete?: (result: WorkerOutput) => Promise<void>;
}): Promise<WorkerOutput[]> {
  const {
    tasks,
    execution_strategy,
    profile_task_id,
    max_concurrent,
    stagger_ms,
    search_source_policy,
    onWorkerComplete,
    ...common
  } = input;
  const concurrency = max_concurrent ?? MAX_CONCURRENT_WORKERS;
  const stagger = stagger_ms ?? STAGGER_MS;

  if (execution_strategy === "two_phase" && profile_task_id) {
    const profileTask = tasks.find((t) => t.task_id === profile_task_id);
    if (!profileTask) throw new Error(`profile_task_id "${profile_task_id}" not found in tasks`);

    const domainManual = profileTask.follow_domain_manual !== false ? common.domain_manual : undefined;
    const profileResult = await runResearchWorker({
      task: profileTask,
      domain_manual: domainManual,
      research_hygiene: common.research_hygiene,
      user_preferences_summary: common.user_preferences_summary,
      search_source_policy,
    });
    if (onWorkerComplete) await onWorkerComplete(profileResult);

    const profileContext = [
      `Company/subject profile from initial research:`,
      profileResult.summary,
      "",
      `Key data: ${JSON.stringify(profileResult.extracted_data, null, 2)}`,
    ].join("\n");

    const remainingTasks = tasks.filter((t) => t.task_id !== profile_task_id);

    const fns = remainingTasks.map((task) => () =>
      runResearchWorker({
        task,
        domain_manual: task.follow_domain_manual !== false ? common.domain_manual : undefined,
        research_hygiene: common.research_hygiene,
        user_preferences_summary: common.user_preferences_summary,
        profile_context: profileContext,
        search_source_policy,
      }),
    );
    const remainingResults = await runWithConcurrencyLimit(fns, concurrency, stagger, onWorkerComplete);

    return [profileResult, ...remainingResults];
  }

  const fns = tasks.map((task) => () =>
    runResearchWorker({
      task,
      domain_manual: task.follow_domain_manual !== false ? common.domain_manual : undefined,
      research_hygiene: common.research_hygiene,
      user_preferences_summary: common.user_preferences_summary,
      search_source_policy,
    }),
  );
  return runWithConcurrencyLimit(fns, concurrency, stagger, onWorkerComplete);
}
