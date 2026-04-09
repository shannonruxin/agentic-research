import type Parallel from "parallel-web";
import type {
  Agent3EvidencePlan,
  AIAnswerOutput,
  ExtractBundle,
  RetrievedPage,
} from "@/lib/types";
import { createParallelClient } from "@/lib/parallelClient";

const URL_CHUNK_SIZE = 6;
const MAX_CHARS_PER_RESULT = 100_000;

export class Agent4ExtractError extends Error {
  override readonly name = "Agent4ExtractError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/** Canonical URL key for `ExtractBundle` (must match across collect + merge). */
export function normalizeExtractUrl(url: string): string {
  const t = url.trim();
  try {
    const u = new URL(t);
    u.hash = "";
    // Drop default ports; keep path for equality
    return u.toString();
  } catch {
    return t;
  }
}

/**
 * Union URLs from Agent 3 resources ∪ AIAnswer declared_sources; dedupe; stable order.
 */
export function collectExtractUrls(
  aiAnswer: AIAnswerOutput,
  agent3Plan: Agent3EvidencePlan,
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  function add(u: string) {
    const key = normalizeExtractUrl(u);
    if (!key) return;
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(key);
  }

  for (const row of agent3Plan.resources) {
    if (row.url?.trim()) {
      add(row.url);
    }
  }
  for (const s of aiAnswer.declared_sources) {
    if (s.url?.trim()) {
      add(s.url);
    }
  }
  return ordered;
}

function yearFromPublishDate(publishDate?: string | null): number | null {
  if (!publishDate?.trim()) return null;
  const y = Number.parseInt(publishDate.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

function mergeBodyText(hit: {
  excerpts?: Array<string> | null;
  full_content?: string | null;
}): string {
  const full = hit.full_content?.trim();
  if (full) return full;
  const excerpts = hit.excerpts;
  if (excerpts?.length) {
    return excerpts.filter(Boolean).join("\n\n");
  }
  return "";
}

function mapHitToPage(hit: {
  url: string;
  excerpts?: Array<string> | null;
  full_content?: string | null;
  publish_date?: string | null;
  title?: string | null;
}): RetrievedPage {
  const cleanText = mergeBodyText(hit);
  const publication = hit.title?.trim() || null;
  return {
    url: normalizeExtractUrl(hit.url),
    author: null,
    publication,
    year: yearFromPublishDate(hit.publish_date),
    cleanText,
    httpStatus: cleanText ? 200 : 204,
  };
}

function mapErrorToPage(err: {
  url: string;
  content: string | null;
  error_type: string;
  http_status_code: number | null;
}): RetrievedPage {
  return {
    url: normalizeExtractUrl(err.url),
    author: null,
    publication: null,
    year: null,
    cleanText: err.content?.trim() ?? "",
    httpStatus: err.http_status_code ?? 0,
    extract_error: [err.error_type, err.content].filter(Boolean).join(": ") || "extract_failed",
  };
}

async function extractChunk(
  client: Parallel,
  urls: string[],
): Promise<ExtractBundle> {
  const out: ExtractBundle = {};
  if (urls.length === 0) return out;

  const response = await client.beta.extract({
    urls,
    objective: null,
    excerpts: true,
    full_content: { max_chars_per_result: MAX_CHARS_PER_RESULT },
  });

  for (const hit of response.results) {
    const page = mapHitToPage(hit);
    out[page.url] = page;
  }
  for (const err of response.errors) {
    const page = mapErrorToPage(err);
    out[page.url] = page;
  }

  for (const u of urls) {
    const key = normalizeExtractUrl(u);
    if (!(key in out)) {
      out[key] = {
        url: key,
        author: null,
        publication: null,
        year: null,
        cleanText: "",
        httpStatus: 0,
        extract_error: "missing_from_parallel_response",
      };
    }
  }

  return out;
}

/**
 * Concurrent Parallel **`beta.extract`** over deduped URLs; chunked requests; full **`ExtractBundle`**.
 */
export async function buildExtractBundle(
  aiAnswer: AIAnswerOutput,
  agent3Plan: Agent3EvidencePlan,
): Promise<ExtractBundle> {
  if (!aiAnswer.answer_text?.trim()) {
    throw new Agent4ExtractError("aiAnswer.answer_text is required.");
  }
  const urls = collectExtractUrls(aiAnswer, agent3Plan);
  if (urls.length === 0) {
    return {};
  }

  let client: Parallel;
  try {
    client = createParallelClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Parallel client configuration error";
    throw new Agent4ExtractError(msg);
  }

  const bundle: ExtractBundle = {};
  for (let i = 0; i < urls.length; i += URL_CHUNK_SIZE) {
    const chunk = urls.slice(i, i + URL_CHUNK_SIZE);
    const part = await extractChunk(client, chunk);
    Object.assign(bundle, part);
  }
  return bundle;
}
