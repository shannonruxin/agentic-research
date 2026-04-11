/**
 * Parallel `beta.search` source_policy (see parallel-web `SourcePolicy`).
 *
 * Docs: https://docs.parallel.ai/resources/source-policy — **10 domains max** per `include_domains` and per
 * `exclude_domains` (Parallel validation). Longer lists are truncated to 10 when building `source_policy`.
 *
 * Configure defaults via env (Agent 3 + `/api/parallel-search` merge with request body):
 * - `PARALLEL_SEARCH_EXCLUDE_DOMAINS` — comma-separated hostnames (e.g. `wikipedia.org,reddit.com`)
 * - `PARALLEL_SEARCH_INCLUDE_DOMAINS` — optional comma list (maps to Parallel `include_domains` / Prioritized UI)
 * - `PARALLEL_SEARCH_AFTER_DATE` — optional `YYYY-MM-DD` (published on or after)
 * - `PARALLEL_SEARCH_BEFORE_DATE` — optional `YYYY-MM-DD` (published before; passed if the API accepts it — SDK types may only list `after_date`)
 */

/** Parallel Search `source_policy`: max domains per `include_domains` / `exclude_domains` list. */
export const PARALLEL_SOURCE_POLICY_MAX_DOMAINS = 10;

export type ParallelSourcePolicy = {
  exclude_domains?: string[];
  include_domains?: string[];
  after_date?: string | null;
  /** Upper bound on publish date when supported by Parallel Search. */
  before_date?: string | null;
};

/** JSON shape for API routes (camelCase body) — merged with env then normalized. */
export type ParallelSourcePolicyRequest = {
  excludeDomains?: string[];
  includeDomains?: string[];
  afterDate?: string;
  beforeDate?: string;
};

function parseDomainList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const parts = raw.split(/[,\n]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  return [...new Set(parts)];
}

/** RFC 3339 calendar date YYYY-MM-DD */
const CAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseCalDate(raw: string | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  if (!CAL_DATE_RE.test(t)) return undefined;
  return t;
}

export function parallelSourcePolicyFromEnv(): ParallelSourcePolicy | null {
  const exclude_domains = parseDomainList(process.env.PARALLEL_SEARCH_EXCLUDE_DOMAINS);
  const include_domains = parseDomainList(process.env.PARALLEL_SEARCH_INCLUDE_DOMAINS);
  const after = parseCalDate(process.env.PARALLEL_SEARCH_AFTER_DATE);
  const before = parseCalDate(process.env.PARALLEL_SEARCH_BEFORE_DATE);

  const policy: ParallelSourcePolicy = {};
  if (exclude_domains.length) policy.exclude_domains = exclude_domains;
  if (include_domains.length) policy.include_domains = include_domains;
  if (after !== undefined) policy.after_date = after;
  if (before !== undefined) policy.before_date = before;

  return normalizeParallelSourcePolicy(Object.keys(policy).length ? policy : null);
}

function dedupeStrings(a: string[]): string[] {
  return [...new Set(a.map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

function capParallelDomainList(list: string[] | undefined): string[] | undefined {
  if (!list?.length) return undefined;
  return list.slice(0, PARALLEL_SOURCE_POLICY_MAX_DOMAINS);
}

/**
 * Normalize policy: valid dates; include and exclude may both be present; domain lists capped per Parallel.
 */
export function normalizeParallelSourcePolicy(
  policy: ParallelSourcePolicy | null | undefined,
): ParallelSourcePolicy | null {
  if (!policy || Object.keys(policy).length === 0) return null;

  const include = capParallelDomainList(policy.include_domains);
  const exclude = capParallelDomainList(policy.exclude_domains);

  const out: ParallelSourcePolicy = {};
  if (include?.length) {
    out.include_domains = include;
  }
  if (exclude?.length) {
    out.exclude_domains = exclude;
  }
  if (policy.after_date && CAL_DATE_RE.test(policy.after_date)) {
    out.after_date = policy.after_date;
  }
  if (policy.before_date && CAL_DATE_RE.test(policy.before_date)) {
    out.before_date = policy.before_date;
  }

  return Object.keys(out).length ? out : null;
}

/**
 * Normalize user input into an apex-style hostname for Parallel (no scheme/path; lowercase).
 * Returns `null` if empty or unusable after stripping.
 */
export function normalizeDomainForPolicy(raw: string): string | null {
  let t = raw.trim().toLowerCase();
  if (!t) return null;
  if (t.length > 256) return null;

  try {
    if (/^[\w+.-]+:\/\//.test(t)) {
      t = new URL(t).hostname;
    } else {
      const pathless = t.split("/")[0] ?? t;
      t = (pathless.split(":")[0] ?? pathless).trim();
    }
  } catch {
    t = t.replace(/^https?:\/\//, "");
    t = (t.split("/")[0] ?? t).split(":")[0]?.trim() ?? "";
  }

  t = t.replace(/^www\./, "");
  if (!t) return null;
  if (!/^[\w.-]+$/.test(t)) return null;
  return t;
}

/**
 * Build a request payload from the home-page source policy UI (domain lists).
 * Include and exclude lists are both included when non-empty.
 */
export function parallelSourcePolicyRequestFromLists(input: {
  excludeDomains: string[];
  includeDomains: string[];
  publishedAfter: string;
  publishedBefore: string;
}): ParallelSourcePolicyRequest | undefined {
  const excludeDomains = capParallelDomainList(dedupeStrings(input.excludeDomains));
  const includeDomains = capParallelDomainList(dedupeStrings(input.includeDomains));
  const after = input.publishedAfter.trim();
  const afterDate = after && CAL_DATE_RE.test(after) ? after : undefined;
  const before = input.publishedBefore.trim();
  const beforeDate = before && CAL_DATE_RE.test(before) ? before : undefined;

  const req: ParallelSourcePolicyRequest = {};
  if (excludeDomains?.length) req.excludeDomains = excludeDomains;
  if (includeDomains?.length) req.includeDomains = includeDomains;
  if (afterDate) req.afterDate = afterDate;
  if (beforeDate) req.beforeDate = beforeDate;
  return Object.keys(req).length ? req : undefined;
}

/**
 * Merge env-derived policy with optional request overrides.
 * - exclude_domains: union (env ∪ request)
 * - include_domains: union if both sides specify lists; if only one side, use that side
 * - after_date / before_date: request wins when provided (valid string); else env
 */
export function mergeParallelSourcePolicy(
  envPolicy: ParallelSourcePolicy | null,
  request: ParallelSourcePolicyRequest | null | undefined,
): ParallelSourcePolicy | null {
  const req = request ?? {};
  const ex = dedupeStrings([
    ...(envPolicy?.exclude_domains ?? []),
    ...(req.excludeDomains ?? []),
  ]);

  const envIn = envPolicy?.include_domains ?? [];
  const reqIn = req.includeDomains ?? [];
  let include_domains: string[] | undefined;
  if (envIn.length && reqIn.length) {
    include_domains = dedupeStrings([...envIn, ...reqIn]);
  } else if (reqIn.length) {
    include_domains = dedupeStrings(reqIn);
  } else if (envIn.length) {
    include_domains = dedupeStrings(envIn);
  }

  let after_date: string | undefined;
  if (req.afterDate !== undefined) {
    const t = req.afterDate.trim();
    after_date = t && CAL_DATE_RE.test(t) ? t : undefined;
  } else if (envPolicy?.after_date) {
    after_date = envPolicy.after_date;
  }

  let before_date: string | undefined;
  if (req.beforeDate !== undefined) {
    const t = req.beforeDate.trim();
    before_date = t && CAL_DATE_RE.test(t) ? t : undefined;
  } else if (envPolicy?.before_date) {
    before_date = envPolicy.before_date;
  }

  const policy: ParallelSourcePolicy = {};
  if (ex.length) policy.exclude_domains = ex;
  if (include_domains?.length) policy.include_domains = include_domains;
  if (after_date) policy.after_date = after_date;
  if (before_date) policy.before_date = before_date;

  return normalizeParallelSourcePolicy(policy);
}

/**
 * Parallel SDK `SourcePolicy` typings may lag; this passes through optional `before_date`.
 */
export function sourcePolicyForBetaSearch(
  policy: ParallelSourcePolicy | null,
): import("parallel-web/resources/shared").SourcePolicy | null {
  if (!policy) return null;
  return policy as import("parallel-web/resources/shared").SourcePolicy;
}
