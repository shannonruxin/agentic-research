/**
 * sessionStorage.ts
 *
 * Single reusable module for all session-scoped write operations.
 * Two responsibilities:
 *   1. Append a worker's findings to that dimension's JSON file (live, during pipeline).
 *   2. Append a completed turn to the session's chat-history.json (after deliver).
 *
 * Nothing in this file calls an LLM. All writes are pure data.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getSessionDir,
  getSessionChatHistoryFile,
  getSessionDimensionSummariesDir,
  getSessionConnectionsFile,
  getSessionThesisEvolutionFile,
  GLOBAL_LEARNED_PATTERNS_FILE,
  readWorkspaceText,
  writeWorkspaceText,
} from "@/lib/workspaceNode";
import { dimensionIdToFilename, normalizeDimensionId } from "@/lib/dimensionId";
import { mergeResearchTurn } from "@/lib/researchSessionMemory";
import type { ResearchUserOutput } from "@/lib/researchSessionMemory";
import type { WorkerOutput, ThesisEvolutionEntry, ThesisEvolutionFile } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One worker's findings for a dimension, stored verbatim — no summarization.
 * Appended to `session/sessionN/{dimension-id}.json` as the worker reports back.
 */
export type SessionWorkerFinding = {
  turn: number;
  round: number;
  task_id: string;
  dimension: string;
  factor: string;
  summary: string;
  confidence: number;
  sources: { url: string; title?: string; relevance: string; data_noted: string }[];
  extracted_data: WorkerOutput["extracted_data"];
  gaps_remaining: string[];
  search_queries_used: string[];
  rabbithole_leads: string[];
  /**
   * Whether this finding is still active for retrieval.
   * Set to true on write. Will be flipped to false when the dimension
   * is concluded and no longer relevant for future context retrieval.
   */
  active: boolean;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Ensure the session directory exists before any write. */
async function ensureSessionDir(sessionId: number): Promise<void> {
  await fs.mkdir(getSessionDir(sessionId), { recursive: true });
}

/** Full path to a dimension JSON file within a session. */
function getSessionDimensionFile(sessionId: number, dimensionId: string): string {
  const base = dimensionIdToFilename(normalizeDimensionId(dimensionId));
  return path.join(getSessionDir(sessionId), `${base}.json`);
}

// ---------------------------------------------------------------------------
// 1. Append worker finding to dimension JSON
//    Called immediately after each worker completes — live, during the pipeline.
// ---------------------------------------------------------------------------

export async function appendWorkerFinding(
  sessionId: number,
  result: WorkerOutput,
  turn: number,
  round: number,
): Promise<void> {
  await ensureSessionDir(sessionId);
  const filePath = getSessionDimensionFile(sessionId, result.dimension);

  // Read existing array — empty array if file doesn't exist yet.
  let existing: SessionWorkerFinding[] = [];
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) existing = parsed as SessionWorkerFinding[];
  } catch {
    existing = [];
  }

  // Build the finding entry directly from the worker result — no transformation.
  const finding: SessionWorkerFinding = {
    turn,
    round,
    task_id: result.task_id,
    dimension: result.dimension,
    factor: result.factor,
    summary: result.summary,
    confidence: result.confidence,
    sources: result.sources,
    extracted_data: result.extracted_data,
    gaps_remaining: result.gaps_remaining,
    search_queries_used: result.search_queries_used,
    rabbithole_leads: result.rabbithole_leads ?? [],
    active: true,
  };

  // Append — never truncate or rewrite existing entries.
  existing.push(finding);
  await fs.writeFile(filePath, JSON.stringify(existing, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// Storage helpers for orchestrator context retrieval
// ---------------------------------------------------------------------------

/**
 * Read all SessionWorkerFindings with active:true across all dimension files in a session.
 * Used by orchestrator review/deliver to build the active-findings context block.
 */
export async function readActiveFindings(sessionId: number): Promise<SessionWorkerFinding[]> {
  const sessionDir = getSessionDir(sessionId);
  let files: string[];
  try {
    files = await fs.readdir(sessionDir);
  } catch {
    return [];
  }

  const dimFiles = files.filter((f) => f.endsWith(".json") && f !== "chat-memory.json");
  const allActive: SessionWorkerFinding[] = [];

  for (const file of dimFiles) {
    const filePath = path.join(sessionDir, file);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const active = (parsed as SessionWorkerFinding[]).filter((f) => f.active);
        allActive.push(...active);
      }
    } catch {
      // skip corrupt/missing files
    }
  }

  return allActive;
}

/**
 * Mark all findings for a given dimension as inactive (dimension is concluded).
 * Called after a dimension summary has been generated.
 */
export async function markDimensionInactive(sessionId: number, dimensionId: string): Promise<void> {
  await ensureSessionDir(sessionId);
  const filePath = getSessionDimensionFile(sessionId, dimensionId);
  let existing: SessionWorkerFinding[] = [];
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) existing = parsed as SessionWorkerFinding[];
  } catch {
    return; // nothing to mark
  }

  const updated = existing.map((f) => ({ ...f, active: false }));
  await fs.writeFile(filePath, JSON.stringify(updated, null, 2), "utf8");
}

/**
 * Write a compact LLM-generated summary for a concluded dimension.
 * Stored at `orchestrator-state/dimension-summaries/{dim}.md`.
 */
export async function writeDimensionSummary(
  sessionId: number,
  dimensionId: string,
  summaryMd: string,
): Promise<void> {
  const dir = getSessionDimensionSummariesDir(sessionId);
  await fs.mkdir(dir, { recursive: true });
  const base = dimensionIdToFilename(normalizeDimensionId(dimensionId));
  const filePath = path.join(dir, `${base}.md`);
  await fs.writeFile(filePath, summaryMd, "utf8");
}

/**
 * Read all concluded dimension summaries.
 * Returns array of { dimensionId, summary } — one entry per *.md file.
 */
export async function readDimensionSummaries(
  sessionId: number,
): Promise<{ dimensionId: string; summary: string }[]> {
  const dir = getSessionDimensionSummariesDir(sessionId);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }

  const summaries: { dimensionId: string; summary: string }[] = [];
  for (const file of files.filter((f) => f.endsWith(".md"))) {
    const dimensionId = file.replace(/\.md$/, "");
    try {
      const summary = await fs.readFile(path.join(dir, file), "utf8");
      summaries.push({ dimensionId, summary: summary.trim() });
    } catch {
      // skip
    }
  }
  return summaries;
}

/**
 * Overwrite the cross-dimension connections file for this session.
 * Called after each connectionAgent run.
 */
export async function writeConnectionInsights(sessionId: number, content: string): Promise<void> {
  await writeWorkspaceText(getSessionConnectionsFile(sessionId), content);
}

/**
 * Read the cross-dimension connections file for this session.
 * Returns empty string if none yet.
 */
export async function readConnectionInsights(sessionId: number): Promise<string> {
  return readWorkspaceText(getSessionConnectionsFile(sessionId));
}

// ---------------------------------------------------------------------------
// Thesis evolution — JSON append-only log of orchestrator thinking per session
// ---------------------------------------------------------------------------

/**
 * Read the thesis evolution JSON file for this session.
 * Returns { rounds: [] } if no entries yet.
 */
export async function readThesisEvolution(sessionId: number): Promise<ThesisEvolutionFile> {
  const filePath = getSessionThesisEvolutionFile(sessionId);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as ThesisEvolutionFile;
    if (parsed && Array.isArray(parsed.rounds)) return parsed;
  } catch {
    // missing or corrupt
  }
  return { rounds: [] };
}

/**
 * Append one entry to the thesis evolution JSON file.
 * Called after each PLAN round.
 */
export async function appendThesisEvolutionEntry(
  sessionId: number,
  entry: ThesisEvolutionEntry,
): Promise<void> {
  const filePath = getSessionThesisEvolutionFile(sessionId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const existing = await readThesisEvolution(sessionId);
  existing.rounds.push(entry);
  await fs.writeFile(filePath, JSON.stringify(existing, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// Active findings grouped helpers
// ---------------------------------------------------------------------------

/**
 * Read all active findings grouped by dimension ID.
 * Used to build the active_dimension_files input for PLAN.
 */
export async function readActiveFindingsByDimension(
  sessionId: number,
): Promise<Record<string, SessionWorkerFinding[]>> {
  const allActive = await readActiveFindings(sessionId);
  const grouped: Record<string, SessionWorkerFinding[]> = {};
  for (const f of allActive) {
    if (!grouped[f.dimension]) grouped[f.dimension] = [];
    grouped[f.dimension]!.push(f);
  }
  return grouped;
}

/**
 * Build a dimension status map: active/inactive per known dimension ID.
 * Derives status from which dimension files have active findings and which have summaries.
 */
export async function readDimensionStatus(
  sessionId: number,
): Promise<Record<string, "active" | "inactive">> {
  const [activeFindings, summaries] = await Promise.all([
    readActiveFindings(sessionId),
    readDimensionSummaries(sessionId),
  ]);

  const status: Record<string, "active" | "inactive"> = {};

  // Dimensions with active findings are active
  for (const f of activeFindings) {
    status[f.dimension] = "active";
  }

  // Dimensions with summaries but no active findings are inactive
  for (const s of summaries) {
    if (!status[s.dimensionId]) {
      status[s.dimensionId] = "inactive";
    }
  }

  return status;
}

// ---------------------------------------------------------------------------
// Learned patterns — global, append-only, cross-session
// ---------------------------------------------------------------------------

/**
 * Append a new entry to the global learned-patterns.md file.
 * Called after each successful deliver by the learnedPatternsAgent.
 *
 * `patternsMarkdown` should be a formatted markdown block ready to append,
 * prefixed with a date + subject header by the caller.
 */
export async function appendLearnedPatterns(patternsMarkdown: string): Promise<void> {
  const existing = (await readWorkspaceText(GLOBAL_LEARNED_PATTERNS_FILE)).trimEnd();
  const updated = existing ? `${existing}\n\n${patternsMarkdown.trim()}\n` : `${patternsMarkdown.trim()}\n`;
  await writeWorkspaceText(GLOBAL_LEARNED_PATTERNS_FILE, updated);
}

/**
 * Read the global learned-patterns file.
 * Returns empty string if none yet.
 */
export async function readLearnedPatterns(): Promise<string> {
  return readWorkspaceText(GLOBAL_LEARNED_PATTERNS_FILE);
}

// ---------------------------------------------------------------------------
// 2. Append completed turn to session chat history
//    Called once after deliver — mirrors what the old chat-memory.json did,
//    but scoped to the active session folder.
// ---------------------------------------------------------------------------

export async function appendChatHistoryTurn(
  sessionId: number,
  turnKey: string,
  block: { question: string; "user-output": ResearchUserOutput },
): Promise<void> {
  await ensureSessionDir(sessionId);
  const filePath = getSessionChatHistoryFile(sessionId);

  // Read existing history (empty object if first turn).
  const raw = await readWorkspaceText(filePath);

  // mergeResearchTurn handles inserting the turn in correct numeric order.
  const merged = mergeResearchTurn(raw, turnKey, block);
  await writeWorkspaceText(filePath, merged);
}
