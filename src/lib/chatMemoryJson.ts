/** Keys that are chronological log entries (1, 2, 3, …). */
const CHR = /^\d+$/;

export function maxChronoIndex(doc: Record<string, unknown>): number {
  let m = 0;
  for (const k of Object.keys(doc)) {
    if (CHR.test(k)) m = Math.max(m, parseInt(k, 10));
  }
  return m;
}

export function extractChronoEntries(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(doc)) {
    if (CHR.test(k)) out[k] = doc[k]!;
  }
  return out;
}

/** First non-numeric key is the rolling findings summary. */
export function extractSummary(
  doc: Record<string, unknown>,
): { key: string; value: unknown } | null {
  for (const k of Object.keys(doc)) {
    if (!CHR.test(k)) return { key: k, value: doc[k]! };
  }
  return null;
}

/**
 * On disk: first property = summary (key is dynamic), then `"1"`, `"2"`, … in numeric order
 * (chrono outputs in order).
 */
export function buildChatMemoryObject(opts: {
  findings_summary: { key: string; value: unknown };
  chrono: Record<string, unknown>;
}): Record<string, unknown> {
  const { findings_summary, chrono } = opts;
  const nums = Object.keys(chrono)
    .filter((k) => CHR.test(k))
    .map((k) => parseInt(k, 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const out: Record<string, unknown> = { [findings_summary.key]: findings_summary.value };
  for (const n of nums) {
    const ks = String(n);
    if (Object.prototype.hasOwnProperty.call(chrono, ks) && chrono[ks] !== undefined) {
      out[ks] = chrono[ks] as unknown;
    }
  }
  return out;
}

export function parseChatMemoryFile(raw: string): Record<string, unknown> {
  const t = raw.trim();
  if (!t) return {};
  try {
    const p = JSON.parse(t) as unknown;
    if (p !== null && typeof p === "object" && !Array.isArray(p)) {
      return p as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return {};
}

/** Strips `undefined` and non-JSON; throws if still not serializable. */
export function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * After an Agent 7 turn: new rolling summary + append one chrono block with the full Agent 7 output.
 */
export function afterAgent7Round(
  previous: Record<string, unknown> | null,
  findings_summary: { key: string; value: unknown },
  agent7Output: unknown,
): Record<string, unknown> {
  const prev = previous ?? {};
  const chrono = extractChronoEntries(prev);
  const next = maxChronoIndex(chrono) + 1;
  chrono[String(next)] = toJsonSafe(agent7Output);
  return buildChatMemoryObject({ findings_summary, chrono });
}

/**
 * Append one or more Agent 3/6 run payloads (unified run output per task), in order.
 */
export function appendAgent36Runs(
  previous: Record<string, unknown>,
  runs: { output: unknown }[],
): Record<string, unknown> {
  const s = extractSummary(previous);
  const findings_summary = s ?? { key: "findings", value: { note: "no prior summary" } };
  const chrono = extractChronoEntries(previous);
  let n = maxChronoIndex(chrono) + 1;
  for (const r of runs) {
    chrono[String(n++)] = toJsonSafe(r.output);
  }
  return buildChatMemoryObject({ findings_summary, chrono });
}

/** After finalize: only replace the summary field; chrono list unchanged. */
export function afterFinalize(
  previous: Record<string, unknown>,
  findings_summary: { key: string; value: unknown },
): Record<string, unknown> {
  const chrono = extractChronoEntries(previous);
  return buildChatMemoryObject({ findings_summary, chrono });
}

export function formatChatMemoryJson(doc: Record<string, unknown>): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
