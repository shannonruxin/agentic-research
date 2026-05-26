/** Keys that are chronological log entries (1, 2, 3, …). */
const CHR = /^\d+$/;

/** First non-numeric key is the rolling findings summary. */
export function extractSummary(
  doc: Record<string, unknown>,
): { key: string; value: unknown } | null {
  for (const k of Object.keys(doc)) {
    if (!CHR.test(k)) return { key: k, value: doc[k]! };
  }
  return null;
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

export function formatChatMemoryJson(doc: Record<string, unknown>): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
