/**
 * Stable dimension ids for file names and research_task.dimension (e.g. company-archetypes).
 * Lowercase, hyphen-separated; non-alphanumeric runs collapse to a single hyphen.
 */
export function normalizeDimensionId(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (!t) return "dimension";
  const slug = t.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "dimension";
}

/** Filename-safe basename (no path separators). */
export function dimensionIdToFilename(id: string): string {
  const n = normalizeDimensionId(id);
  return n.replace(/[/\\]/g, "-").slice(0, 120);
}

/**
 * Map a model-provided research_task.dimension string to the canonical dimension id
 * using the emitted dimensions list (match id, or slug(label), or slug(dimension field)).
 */
export function resolveResearchTaskDimensionId(
  taskDimension: string,
  dimensions: readonly { id: string; label: string }[],
): string {
  const raw = taskDimension.trim();
  if (!raw) return dimensions[0]?.id ?? normalizeDimensionId("general");
  const norm = normalizeDimensionId(raw);
  for (const d of dimensions) {
    if (raw === d.id || norm === normalizeDimensionId(d.id)) {
      return d.id;
    }
    if (norm === normalizeDimensionId(d.label)) {
      return d.id;
    }
  }
  return norm;
}
