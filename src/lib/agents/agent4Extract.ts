import type Parallel from "parallel-web";
import type { ExtractBundle, RetrievedPage, WorkerOutput } from "@/lib/types";
import { createParallelClient } from "@/lib/parallelClient";

const URL_CHUNK_SIZE = 6;
const MAX_CHARS_PER_RESULT = 100_000;

function normalizeExtractUrl(url: string): string {
  const t = url.trim();
  try {
    const u = new URL(t);
    u.hash = "";
    return u.toString();
  } catch {
    return t;
  }
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

async function buildExtractBundleFromUrls(urls: string[]): Promise<ExtractBundle> {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const u of urls) {
    const key = normalizeExtractUrl(u);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ordered.push(key);
  }
  if (ordered.length === 0) return {};

  let client: Parallel;
  try {
    client = createParallelClient();
  } catch {
    return {};
  }

  const bundle: ExtractBundle = {};
  for (let i = 0; i < ordered.length; i += URL_CHUNK_SIZE) {
    const chunk = ordered.slice(i, i + URL_CHUNK_SIZE);
    try {
      const part = await extractChunk(client, chunk);
      Object.assign(bundle, part);
    } catch {
      // best-effort per chunk
    }
  }
  return bundle;
}

const VERBATIM_EXTRACT_MAX_CHARS = 16_000;

/**
 * Attach **`verbatim_extract`** to each worker source row via Parallel extract (Agent 4). Non-fatal on errors or missing API key.
 */
export async function enrichWorkerOutputWithAgent4Extract(output: WorkerOutput): Promise<WorkerOutput> {
  const urlKeys = output.sources
    .map((s) => normalizeExtractUrl(s.url))
    .filter((k) => Boolean(k.trim()));
  if (urlKeys.length === 0) return output;

  let bundle: ExtractBundle;
  try {
    bundle = await buildExtractBundleFromUrls(urlKeys);
  } catch {
    return output;
  }

  const sources = output.sources.map((s) => {
    const key = normalizeExtractUrl(s.url);
    const page = key ? bundle[key] : undefined;
    let verbatim = page?.cleanText?.trim() ?? "";
    if (verbatim.length > VERBATIM_EXTRACT_MAX_CHARS) {
      verbatim = `${verbatim.slice(0, VERBATIM_EXTRACT_MAX_CHARS)}\n\n…`;
    }
    return { ...s, verbatim_extract: verbatim ? verbatim : undefined };
  });

  return { ...output, sources };
}
