import { promises as fs } from "node:fs";
import path from "node:path";

const WORKSPACE_DIR = path.join(process.cwd(), "workspace");

// ---------------------------------------------------------------------------
// Top-level workspace directories
// ---------------------------------------------------------------------------

/** Global memory shared across all sessions. */
export const WORKSPACE_GLOBAL_DIR = path.join(WORKSPACE_DIR, "global");

/** All session folders live here: session/session0/, session/session1/, … */
export const WORKSPACE_SESSION_DIR = path.join(WORKSPACE_DIR, "session");

/**
 * Tracks which session is currently active.
 * Format: `{ "session_id": 0 }`
 * Defaults to session 0 when absent.
 */
export const SESSION_POINTER_FILE = path.join(WORKSPACE_DIR, "session-pointer.json");

// ---------------------------------------------------------------------------
// Per-session path helpers
// ---------------------------------------------------------------------------

/** Root folder for one session, e.g. `workspace/session/session0/`. */
export function getSessionDir(sessionId: number): string {
  return path.join(WORKSPACE_SESSION_DIR, `session${sessionId}`);
}

/**
 * Chat memory JSON for one session — same structure as the old flat `chat-memory.json`
 * but scoped to a single session folder.
 * e.g. `workspace/session/session0/chat-memory.json`
 */
export function getSessionChatHistoryFile(sessionId: number): string {
  return path.join(getSessionDir(sessionId), "chat-memory.json");
}

/**
 * Read `session-pointer.json` to get the active session id.
 * Returns 0 (session0) when the file does not exist yet.
 */
export async function getCurrentSessionId(): Promise<number> {
  try {
    const raw = await readWorkspaceText(SESSION_POINTER_FILE);
    if (!raw.trim()) return 0;
    const p = JSON.parse(raw) as { session_id?: number };
    return typeof p.session_id === "number" ? Math.max(0, p.session_id) : 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Legacy / compatibility paths (kept while old readers still reference them)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use `getSessionChatHistoryFile(sessionId)` instead.
 * Kept for compatibility with routes that have not yet been migrated.
 */
export const CHAT_MEMORY_FILE = path.join(WORKSPACE_DIR, "chat-memory.json");

export const USER_OUTPUT_FILE = path.join(WORKSPACE_DIR, "user-output.md");
/**
 * Authoritative domain manual JSON for the orchestrator and workers.
 * Lives under `workspace/global/` — shared across all sessions.
 * Edit on disk; APIs do not accept overrides.
 */
export const DOMAIN_MANUAL_FILE = path.join(WORKSPACE_GLOBAL_DIR, "domain-manuals", "domain-manual.json");

// ---------------------------------------------------------------------------
// Orchestrator state paths
// ---------------------------------------------------------------------------

/**
 * Global orchestrator system prompt — user edits this once, shared across all sessions.
 * Lives under `workspace/global/orchestrator-state/`.
 */
export const ORCHESTRATOR_SYSTEM_PROMPT_FILE = path.join(
  WORKSPACE_GLOBAL_DIR,
  "orchestrator-state",
  "orchestrator-system-prompt.md",
);

/**
 * Per-session orchestrator state directory.
 * Holds session-specific orchestrator files (accumulated context, dimension summaries, connections).
 * e.g. `workspace/session/session0/orchestrator-state/`
 */
export function getSessionOrchestratorStateDir(sessionId: number): string {
  return path.join(getSessionDir(sessionId), "orchestrator-state");
}

/**
 * Directory for concluded-dimension compact summaries.
 * e.g. `workspace/session/session0/orchestrator-state/dimension-summaries/`
 */
export function getSessionDimensionSummariesDir(sessionId: number): string {
  return path.join(getSessionOrchestratorStateDir(sessionId), "dimension-summaries");
}

/**
 * File for cross-dimension connection insights generated after each review.
 * e.g. `workspace/session/session0/orchestrator-state/connections.md`
 */
export function getSessionConnectionsFile(sessionId: number): string {
  return path.join(getSessionOrchestratorStateDir(sessionId), "connections.md");
}

/**
 * Append-only thesis evolution log for one session.
 * Written after each orchestrator PLAN round as JSON.
 * e.g. `workspace/session/session0/orchestrator-state/thesis-evolution.json`
 */
export function getSessionThesisEvolutionFile(sessionId: number): string {
  return path.join(getSessionOrchestratorStateDir(sessionId), "thesis-evolution.json");
}

/**
 * Current open questions for one session — overwritten after each review.
 * Contains the known_gaps that weren't addressed in the last round.
 * Injected into the orchestrator PLAN prompt on the next turn.
 * e.g. `workspace/session/session0/orchestrator-state/open-questions.md`
 */
export function getSessionOpenQuestionsFile(sessionId: number): string {
  return path.join(getSessionOrchestratorStateDir(sessionId), "open-questions.md");
}

/**
 * Global append-only log of generalizable analytical patterns learned across sessions.
 * Written by the learnedPatternsAgent after each successful deliver.
 * Injected as a service into the orchestrator PLAN prompt.
 * e.g. `workspace/global/orchestrator-state/learned-patterns.md`
 */
export const GLOBAL_LEARNED_PATTERNS_FILE = path.join(
  WORKSPACE_GLOBAL_DIR,
  "orchestrator-state",
  "learned-patterns.md",
);

/**
 * Read a JSON object from a workspace file; missing or invalid file yields `{}`.
 */
export async function readWorkspaceJsonObject(filePath: string): Promise<Record<string, unknown>> {
  const raw = (await readWorkspaceText(filePath)).trim();
  if (!raw) {
    return {};
  }
  try {
    const p = JSON.parse(raw) as unknown;
    if (p !== null && typeof p === "object" && !Array.isArray(p)) {
      return p as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

/**
 * If `explicit` is missing or an empty object, load the workspace file. Non-empty `explicit` is
 * reserved for tests (production routes always use the file).
 */
export async function loadWorkspaceDomainManualOrDefault(
  explicit?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (explicit && Object.keys(explicit).length > 0) {
    return explicit;
  }
  return readWorkspaceJsonObject(DOMAIN_MANUAL_FILE);
}

export async function readWorkspaceText(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return "";
    }
    throw e;
  }
}

export async function writeWorkspaceText(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}
