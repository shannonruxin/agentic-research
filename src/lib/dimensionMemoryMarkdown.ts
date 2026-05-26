import { promises as fs } from "node:fs";
import path from "node:path";
import {
  dimensionIdToFilename,
  normalizeDimensionId,
  resolveResearchTaskDimensionId,
} from "@/lib/dimensionId";
import { parseChatMemoryFile } from "@/lib/chatMemoryJson";
import { CHAT_DIMENSION_MEMORY_DIR, CHAT_MEMORY_FILE, writeWorkspaceText } from "@/lib/workspaceNode";

/** Persist chat log then update dimension markdown for **one new chrono turn** only (append). */
export async function writeChatMemoryJsonAndRebuildDimensions(
  content: string,
  appendedTurnKey: string,
): Promise<void> {
  await writeWorkspaceText(CHAT_MEMORY_FILE, content);
  const doc = parseChatMemoryFile(content);
  await appendSingleTurnToDimensionMarkdown(doc, appendedTurnKey);
}

const A7_KEY = /^agent7_iter(\d+)$/;
const A36_KEY = /^agent36_(\d+)_iter(\d+)$/;
const OBJECTIVE_SCOPE_ID = "objective-scope";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function jsonFence(obj: unknown): string {
  try {
    return ["```json", JSON.stringify(obj, null, 2), "```"].join("\n");
  } catch {
    return ["```", String(obj), "```"].join("\n");
  }
}

function dimensionLabelLookup(
  dimId: string,
  dims: unknown,
): string {
  if (!Array.isArray(dims)) return dimId;
  for (const d of dims) {
    if (!isPlainObject(d)) continue;
    const id = typeof d.id === "string" ? normalizeDimensionId(d.id) : "";
    const label = typeof d.label === "string" ? d.label : "";
    if (id === normalizeDimensionId(dimId) || normalizeDimensionId(label) === normalizeDimensionId(dimId)) {
      return label || dimId;
    }
  }
  return dimId;
}

function gatherDimensionIdsFromAgent7(a7: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const dims = a7.dimensions;
  if (Array.isArray(dims)) {
    for (const d of dims) {
      if (!isPlainObject(d)) continue;
      const idPart =
        typeof d.id === "string" && d.id.trim()
          ? String(d.id)
          : typeof d.label === "string"
            ? String(d.label)
            : "";
      if (idPart.trim()) {
        ids.add(normalizeDimensionId(idPart));
      }
    }
  }
  const assigns = a7.assignments;
  if (Array.isArray(assigns)) {
    for (const a of assigns) {
      if (!isPlainObject(a)) continue;
      const rt = a.research_task;
      if (isPlainObject(rt) && typeof rt.dimension === "string" && rt.dimension.trim()) {
        ids.add(normalizeDimensionId(rt.dimension));
      }
    }
  }
  const gaps = a7.known_gaps;
  if (Array.isArray(gaps)) {
    for (const g of gaps) {
      if (!isPlainObject(g)) continue;
      const di = g.dimension;
      if (typeof di === "string" && di.trim()) {
        ids.add(normalizeDimensionId(di));
      } else {
        ids.add(OBJECTIVE_SCOPE_ID);
      }
    }
  }
  return [...ids];
}

function sliceAgent7ForDimension(
  a7: Record<string, unknown>,
  dimId: string,
  dimensionRows: { id: string; label: string }[],
): Record<string, unknown> {
  const canon = normalizeDimensionId(dimId);
  const dims = Array.isArray(a7.dimensions) ? a7.dimensions : [];
  const dimRow = dims.find((d) => {
    if (!isPlainObject(d)) return false;
    const id = typeof d.id === "string" ? normalizeDimensionId(d.id) : "";
    const lab = typeof d.label === "string" ? normalizeDimensionId(d.label) : "";
    return id === canon || lab === canon;
  });

  const assignments = Array.isArray(a7.assignments)
    ? a7.assignments.filter((a) => {
        if (!isPlainObject(a)) return false;
        const rt = a.research_task;
        if (!isPlainObject(rt) || typeof rt.dimension !== "string") return false;
        const resolved = resolveResearchTaskDimensionId(rt.dimension, dimensionRows);
        return normalizeDimensionId(resolved) === canon;
      })
    : [];

  const known_gaps = Array.isArray(a7.known_gaps)
    ? a7.known_gaps.filter((g) => {
        if (!isPlainObject(g)) return false;
        const d = g.dimension;
        if (typeof d !== "string" || !d.trim()) {
          return canon === OBJECTIVE_SCOPE_ID;
        }
        return normalizeDimensionId(d) === canon;
      })
    : [];

  return {
    objective_understanding: a7.objective_understanding,
    orchestration: a7.orchestration,
    train_of_thought: a7.train_of_thought,
    confidence: a7.confidence,
    findings_summary: a7.findings_summary,
    key_findings: a7.key_findings,
    dimensions: dimRow ? [dimRow] : [],
    assignments,
    known_gaps,
  };
}

function buildDimensionRowsFromAgent7(a7: Record<string, unknown>): { id: string; label: string }[] {
  const dims = Array.isArray(a7.dimensions) ? a7.dimensions : [];
  const out: { id: string; label: string }[] = [];
  for (const d of dims) {
    if (!isPlainObject(d)) continue;
    const label = typeof d.label === "string" ? d.label : "Dimension";
    const id =
      typeof d.id === "string" && d.id.trim()
        ? normalizeDimensionId(d.id)
        : normalizeDimensionId(label);
    out.push({ id, label });
  }
  return out;
}

function collectTurnDimensionIds(uo: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  for (const key of Object.keys(uo)) {
    const m7 = key.match(A7_KEY);
    if (m7 && isPlainObject(uo[key])) {
      for (const id of gatherDimensionIdsFromAgent7(uo[key] as Record<string, unknown>)) {
        ids.add(id);
      }
    }
    const m36 = key.match(A36_KEY);
    if (m36 && isPlainObject(uo[key])) {
      const block = uo[key] as Record<string, unknown>;
      const rt = block.research_task;
      if (isPlainObject(rt) && typeof rt.dimension === "string" && rt.dimension.trim()) {
        ids.add(normalizeDimensionId(rt.dimension));
      }
    }
    if (key === "pipeline_trace" && Array.isArray(uo[key])) {
      for (const step of uo[key] as unknown[]) {
        if (!isPlainObject(step)) continue;
        const dim = step.dimension;
        if (typeof dim === "string" && dim.trim()) {
          ids.add(normalizeDimensionId(dim));
        }
        if (step.step === "orchestrator_plan" && Array.isArray(step.tasks)) {
          for (const t of step.tasks as Record<string, unknown>[]) {
            if (isPlainObject(t) && typeof t.dimension === "string") {
              ids.add(normalizeDimensionId(t.dimension));
            }
          }
        }
        if (
          step.step === "worker" &&
          isPlainObject(step) &&
          typeof (step as { dimension?: string }).dimension === "string"
        ) {
          ids.add(normalizeDimensionId((step as { dimension: string }).dimension));
        }
      }
    }
  }
  return ids;
}

function addDimensionStringsDeep(v: unknown, into: Set<string>, depth: number): void {
  if (depth > 15) return;
  if (v === null || v === undefined) return;
  if (Array.isArray(v)) {
    for (const x of v) {
      addDimensionStringsDeep(x, into, depth + 1);
    }
    return;
  }
  if (isPlainObject(v)) {
    for (const [k, val] of Object.entries(v)) {
      if (k === "dimension" && typeof val === "string" && val.trim()) {
        into.add(normalizeDimensionId(val));
      }
      addDimensionStringsDeep(val, into, depth + 1);
    }
  }
}

/** Dimension ids referenced in this turn (structured keys + any nested `dimension` string, e.g. coverage_assessment). */
function collectAllTurnDimensionIdsForOneTurn(uo: Record<string, unknown>): Set<string> {
  const ids = collectTurnDimensionIds(uo);
  addDimensionStringsDeep(uo, ids, 0);
  ids.add(OBJECTIVE_SCOPE_ID);
  return ids;
}

/** Single-dimension slices from one persisted `orchestrator_plan` step (no plan-wide narrative fields). */
function extractOrchestratorPlanPartsForDimension(
  planStep: Record<string, unknown>,
  canon: string,
): {
  dimensionRow: Record<string, unknown> | null;
  knownGapGroup: Record<string, unknown> | null;
  tasks: unknown[];
} {
  const tasks: unknown[] = [];
  if (Array.isArray(planStep.tasks)) {
    for (const t of planStep.tasks) {
      if (isPlainObject(t) && normalizeDimensionId(String(t.dimension)) === canon) {
        tasks.push(t);
      }
    }
  }

  let dimensionRow: Record<string, unknown> | null = null;
  if (Array.isArray(planStep.dimensions)) {
    for (const d of planStep.dimensions) {
      if (!isPlainObject(d)) continue;
      const id = typeof d.id === "string" ? normalizeDimensionId(d.id) : "";
      const lab = typeof d.label === "string" ? normalizeDimensionId(d.label) : "";
      if (id === canon || lab === canon) {
        dimensionRow = d;
        break;
      }
    }
  }

  let knownGapGroup: Record<string, unknown> | null = null;
  if (Array.isArray(planStep.known_gaps)) {
    for (const g of planStep.known_gaps) {
      if (!isPlainObject(g)) continue;
      const di = g.dimension;
      if (typeof di === "string" && normalizeDimensionId(di) === canon) {
        knownGapGroup = g;
        break;
      }
    }
  }

  return { dimensionRow, knownGapGroup, tasks };
}

/** Coverage / gaps / dig_deeper tasks for one dimension (persisted review has no top-level `dimension`). */
function sliceOrchestratorReviewStepForDimension(
  reviewStep: Record<string, unknown>,
  canon: string,
): Record<string, unknown> | null {
  let dimensional = false;
  const out: Record<string, unknown> = {
    step: "orchestrator_review",
  };
  if (typeof reviewStep.round === "number") {
    out.round = reviewStep.round;
  }

  if (Array.isArray(reviewStep.coverage_assessment)) {
    const cov = reviewStep.coverage_assessment.filter(
      (c: unknown) =>
        isPlainObject(c) &&
        typeof (c as { dimension?: string }).dimension === "string" &&
        normalizeDimensionId((c as { dimension: string }).dimension) === canon,
    );
    if (cov.length > 0) {
      out.coverage_assessment = cov;
      dimensional = true;
    }
  }

  if (Array.isArray(reviewStep.dimensions)) {
    const dims = (reviewStep.dimensions as unknown[]).filter((d: unknown) => {
      if (!isPlainObject(d)) return false;
      const id = typeof d.id === "string" ? normalizeDimensionId(d.id) : "";
      const lab = typeof d.label === "string" ? normalizeDimensionId(d.label) : "";
      return id === canon || lab === canon;
    });
    if (dims.length > 0) {
      out.dimensions = dims;
      dimensional = true;
    }
  }

  if (Array.isArray(reviewStep.known_gaps)) {
    const gaps = reviewStep.known_gaps.filter(
      (g: unknown) =>
        isPlainObject(g) &&
        typeof (g as { dimension?: string }).dimension === "string" &&
        normalizeDimensionId((g as { dimension: string }).dimension) === canon,
    );
    if (gaps.length > 0) {
      out.known_gaps = gaps;
      dimensional = true;
    }
  }

  if (Array.isArray(reviewStep.dig_deeper_tasks)) {
    const ddt = reviewStep.dig_deeper_tasks.filter(
      (t: unknown) =>
        isPlainObject(t) &&
        typeof (t as { dimension?: string }).dimension === "string" &&
        normalizeDimensionId((t as { dimension: string }).dimension) === canon,
    );
    if (ddt.length > 0) {
      out.dig_deeper_tasks = ddt;
      dimensional = true;
    }
  }

  if (!dimensional) {
    return null;
  }

  if (typeof reviewStep.decision_action === "string") {
    out.decision_action = reviewStep.decision_action;
  }
  return out;
}

/** Markdown subsections for a single research dimension (not `objective-scope`). */
function appendPipelineStructuredSections(parts: string[], dimId: string, trace: unknown[]): boolean {
  const canon = normalizeDimensionId(dimId);
  let planParts: ReturnType<typeof extractOrchestratorPlanPartsForDimension> | null = null;
  for (const step of trace) {
    if (!isPlainObject(step) || step.step !== "orchestrator_plan") continue;
    planParts = extractOrchestratorPlanPartsForDimension(step, canon);
  }

  let added = false;
  if (planParts) {
    if (planParts.dimensionRow) {
      parts.push("### Dimension");
      parts.push(jsonFence(planParts.dimensionRow));
      parts.push("");
      added = true;
    }
    if (planParts.knownGapGroup) {
      parts.push("### Known gaps (this dimension)");
      parts.push(jsonFence(planParts.knownGapGroup));
      parts.push("");
      added = true;
    }
    if (planParts.tasks.length > 0) {
      parts.push("### Tasks (this dimension)");
      parts.push(jsonFence(planParts.tasks));
      parts.push("");
      added = true;
    }
  }

  for (const step of trace) {
    if (!isPlainObject(step)) continue;
    if (step.step === "worker") {
      if (
        typeof (step as { dimension?: string }).dimension === "string" &&
        normalizeDimensionId((step as { dimension: string }).dimension) === canon
      ) {
        parts.push("### Worker");
        parts.push(jsonFence(step));
        parts.push("");
        added = true;
      }
      continue;
    }
    if (step.step === "orchestrator_review") {
      const sliced = sliceOrchestratorReviewStepForDimension(step, canon);
      if (sliced) {
        parts.push("### Orchestrator review (this dimension)");
        parts.push(jsonFence(sliced));
        parts.push("");
        added = true;
      }
    }
  }

  return added;
}

/** Objective-scope: full cross-cutting slice; per-dimension files use `appendPipelineStructuredSections` instead. */
function slicePipelineTraceForDimension(trace: unknown[], dimId: string): unknown[] {
  const canon = normalizeDimensionId(dimId);
  const out: unknown[] = [];
  for (const step of trace) {
    if (!isPlainObject(step)) continue;
    if (step.step === "orchestrator_plan") {
      if (canon === OBJECTIVE_SCOPE_ID) {
        out.push(step);
      } else {
        const parts = extractOrchestratorPlanPartsForDimension(step, canon);
        const slice: Record<string, unknown> = {
          step: "orchestrator_plan",
        };
        slice.dimensions = parts.dimensionRow ? [parts.dimensionRow] : [];
        slice.tasks = parts.tasks;
        slice.known_gaps = parts.knownGapGroup ? [parts.knownGapGroup] : [];
        out.push(slice);
      }
      continue;
    }
    if (step.step === "worker") {
      if (
        typeof (step as { dimension?: string }).dimension === "string" &&
        normalizeDimensionId((step as { dimension: string }).dimension) === canon
      ) {
        out.push(step);
      }
      continue;
    }
    if (step.step === "orchestrator_review") {
      if (canon === OBJECTIVE_SCOPE_ID) {
        out.push(step);
      } else if (
        typeof (step as { dimension?: string }).dimension === "string" &&
        normalizeDimensionId((step as { dimension: string }).dimension) === canon
      ) {
        out.push(step);
      }
      continue;
    }
    if (step.step === "orchestrator_deliver") {
      if (canon === OBJECTIVE_SCOPE_ID) {
        out.push(step);
      }
      continue;
    }
    if (step.step === "intent_router" || step.step === "intent" || step.step === "preferences") {
      if (canon === OBJECTIVE_SCOPE_ID) {
        out.push(step);
      }
    }
  }
  return out;
}

function turnContentForDimension(
  dimId: string,
  turnKey: string,
  question: unknown,
  uo: Record<string, unknown>,
): string | null {
  const parts: string[] = [];
  parts.push(`## Turn ${turnKey}`);
  parts.push("");
  parts.push("### Question");
  parts.push(typeof question === "string" ? question : jsonFence(question));
  parts.push("");

  const rowsFallback = buildDimensionRowsFromAgent7(
    (() => {
      for (const k of Object.keys(uo)) {
        const m = k.match(A7_KEY);
        if (m && isPlainObject(uo[k])) {
          return uo[k] as Record<string, unknown>;
        }
      }
      return {};
    })(),
  );

  let any = false;
  for (const k of Object.keys(uo).sort()) {
    const m7 = k.match(A7_KEY);
    if (m7 && isPlainObject(uo[k])) {
      const a7 = uo[k] as Record<string, unknown>;
      const rows = buildDimensionRowsFromAgent7(a7).length ? buildDimensionRowsFromAgent7(a7) : rowsFallback;
      const sliced = sliceAgent7ForDimension(a7, dimId, rows);
      const empty =
        (!Array.isArray(sliced.assignments) || sliced.assignments.length === 0) &&
        (!Array.isArray(sliced.known_gaps) || sliced.known_gaps.length === 0) &&
        (!Array.isArray(sliced.dimensions) || sliced.dimensions.length === 0);
      if (!empty || dimId === OBJECTIVE_SCOPE_ID) {
        parts.push(`### Agent 7 — ${k} (sliced)`);
        parts.push(jsonFence(sliced));
        parts.push("");
        any = true;
      }
    }

    const m36 = k.match(A36_KEY);
    if (m36 && isPlainObject(uo[k])) {
      const block = uo[k] as Record<string, unknown>;
      const rt = block.research_task;
      let dimMatch = false;
      if (isPlainObject(rt) && typeof rt.dimension === "string") {
        const d = resolveResearchTaskDimensionId(rt.dimension, rowsFallback);
        dimMatch = normalizeDimensionId(d) === normalizeDimensionId(dimId);
      }
      if (dimMatch) {
        parts.push(`### Agent 3/6 — ${k}`);
        parts.push(jsonFence(block));
        parts.push("");
        any = true;
      }
    }

    if (k.startsWith("finalize_") && isPlainObject(uo[k])) {
      if (dimId === OBJECTIVE_SCOPE_ID) {
        parts.push(`### ${k}`);
        parts.push(jsonFence(uo[k]));
        parts.push("");
        any = true;
      }
    }
  }

  if (Array.isArray(uo.pipeline_trace)) {
    const trace = uo.pipeline_trace as unknown[];
    if (dimId === OBJECTIVE_SCOPE_ID) {
      const sliced = slicePipelineTraceForDimension(trace, dimId);
      if (sliced.length > 0) {
        parts.push("### Pipeline trace (sliced)");
        parts.push(jsonFence(sliced));
        parts.push("");
        any = true;
      }
    } else if (appendPipelineStructuredSections(parts, dimId, trace)) {
      any = true;
    }
  }

  if (!any) {
    return null;
  }
  return parts.join("\n");
}

/**
 * Append markdown for **one** chrono turn only. Idempotent: skips a file if it already contains `## Turn N`.
 */
export async function appendSingleTurnToDimensionMarkdown(
  doc: Record<string, unknown>,
  turnKey: string,
): Promise<void> {
  if (!/^\d+$/.test(turnKey)) {
    return;
  }

  await fs.mkdir(CHAT_DIMENSION_MEMORY_DIR, { recursive: true });

  const turn = doc[turnKey];
  if (!isPlainObject(turn)) {
    return;
  }
  const uo = turn["user-output"];
  if (!isPlainObject(uo)) {
    return;
  }

  const candidateIds = collectAllTurnDimensionIdsForOneTurn(uo);

  for (const dimId of candidateIds) {
    const chunk = turnContentForDimension(dimId, turnKey, turn.question, uo);
    if (!chunk) {
      continue;
    }

    const base = dimensionIdToFilename(dimId);
    const filePath = path.join(CHAT_DIMENSION_MEMORY_DIR, `${base}.md`);

    let existing = "";
    try {
      existing = await fs.readFile(filePath, "utf8");
    } catch {
      existing = "";
    }

    const turnHeading = `## Turn ${turnKey}`;
    if (existing.includes(turnHeading)) {
      continue;
    }

    let titleLabel = dimId;
    for (const k of Object.keys(uo)) {
      const m = k.match(A7_KEY);
      if (m && isPlainObject(uo[k])) {
        titleLabel = dimensionLabelLookup(dimId, (uo[k] as Record<string, unknown>).dimensions);
        break;
      }
    }

    let out = existing.trimEnd();
    if (!out) {
      out = [
        `# ${titleLabel}`,
        "",
        `Dimension id: \`${dimId}\``,
        "",
        "*Auto-generated under `workspace/chat-dimension-memory/` from `workspace/chat-memory.json` (no LLM). Each persist appends only the new chrono turn.*",
        "",
      ].join("\n");
    }
    out += "\n\n" + chunk + "\n";
    await fs.writeFile(filePath, out, "utf8");
  }
}

/**
 * Full rebuild of `workspace/chat-dimension-memory/*.md` from the current chat-memory.json object.
 * One markdown file per dimension id; global / unscoped content goes to objective-scope.md.
 * Not called in the normal pipeline (which uses append-only); useful for one-off repairs.
 */
async function rebuildDimensionMarkdownFiles(doc: Record<string, unknown>): Promise<void> {
  await fs.mkdir(CHAT_DIMENSION_MEMORY_DIR, { recursive: true });

  const dimIds = new Set<string>();
  dimIds.add(OBJECTIVE_SCOPE_ID);

  const turnKeys = Object.keys(doc)
    .filter((k) => /^\d+$/.test(k))
    .map((k) => parseInt(k, 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
    .map(String);

  for (const tk of turnKeys) {
    const turn = doc[tk];
    if (!isPlainObject(turn)) continue;
    const uo = turn["user-output"];
    if (!isPlainObject(uo)) continue;
    const q = turn.question;
    for (const id of collectAllTurnDimensionIdsForOneTurn(uo)) {
      dimIds.add(id);
    }
    void q;
  }

  const idList = [...dimIds].sort();

  for (const dimId of idList) {
    const sections: string[] = [];
    let titleLabel = dimId;
    for (const tk of turnKeys) {
      const turn = doc[tk];
      if (!isPlainObject(turn)) continue;
      const uo = turn["user-output"];
      if (!isPlainObject(uo)) continue;
      for (const k of Object.keys(uo)) {
        const m = k.match(A7_KEY);
        if (m && isPlainObject(uo[k])) {
          titleLabel = dimensionLabelLookup(dimId, (uo[k] as Record<string, unknown>).dimensions);
          break;
        }
      }
    }

    sections.push(`# ${titleLabel}`);
    sections.push("");
    sections.push(`Dimension id: \`${dimId}\``);
    sections.push("");
    sections.push(
      "*Auto-generated under `workspace/chat-dimension-memory/` from `workspace/chat-memory.json` (no LLM).*",
    );
    sections.push("");

    for (const tk of turnKeys) {
      const turn = doc[tk];
      if (!isPlainObject(turn)) continue;
      const uo = turn["user-output"];
      if (!isPlainObject(uo)) continue;
      const chunk = turnContentForDimension(dimId, tk, turn.question, uo);
      if (chunk) {
        sections.push(chunk);
        sections.push("");
      }
    }

    const base = dimensionIdToFilename(dimId);
    const filePath = path.join(CHAT_DIMENSION_MEMORY_DIR, `${base}.md`);
    await fs.writeFile(filePath, sections.join("\n").trim() + "\n", "utf8");
  }

  /** Remove stale dimension files that are no longer in the id set. */
  let existing: string[] = [];
  try {
    existing = await fs.readdir(CHAT_DIMENSION_MEMORY_DIR);
  } catch {
    existing = [];
  }
  const keep = new Set(idList.map((id) => `${dimensionIdToFilename(id)}.md`));
  for (const name of existing) {
    if (!name.endsWith(".md")) continue;
    if (!keep.has(name)) {
      await fs.unlink(path.join(CHAT_DIMENSION_MEMORY_DIR, name)).catch(() => {});
    }
  }
}

async function rebuildDimensionMarkdownFromJsonString(raw: string): Promise<void> {
  const doc = parseChatMemoryFile(raw);
  await rebuildDimensionMarkdownFiles(doc);
}


export async function clearDimensionMarkdownDir(): Promise<void> {
  await fs.mkdir(CHAT_DIMENSION_MEMORY_DIR, { recursive: true });
  let names: string[] = [];
  try {
    names = await fs.readdir(CHAT_DIMENSION_MEMORY_DIR);
  } catch {
    return;
  }
  for (const name of names) {
    if (name.endsWith(".md")) {
      await fs.unlink(path.join(CHAT_DIMENSION_MEMORY_DIR, name)).catch(() => {});
    }
  }
}
