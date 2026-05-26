import { promises as fs } from "node:fs";
import path from "node:path";

const WORKSPACE_DIR = path.join(process.cwd(), "workspace");

/**
 * Research tab / multi-turn: turn blocks under `"1"`, `"2"`, … with `question` + `user-output`
 * (summary, document, `agent7_iter*`, `agent36_<set>_iter*` per parallel batch).
 */
export const CHAT_MEMORY_FILE = path.join(WORKSPACE_DIR, "chat-memory.json");
/** One markdown file per dimension under `workspace/chat-dimension-memory/` — derived from `chat-memory.json`. */
export const CHAT_DIMENSION_MEMORY_DIR = path.join(WORKSPACE_DIR, "chat-dimension-memory");
export const USER_OUTPUT_FILE = path.join(WORKSPACE_DIR, "user-output.md");
/**
 * Authoritative domain manual JSON for Agent 7 (orchestrator context) and optional Agent 3/6 (when
 * `research_task.follow_domain_manual` is not false). Edit on disk; APIs do not accept overrides.
 */
export const DOMAIN_MANUAL_FILE = path.join(WORKSPACE_DIR, "domain-manuals", "domain-manual.json");

/** Orchestrator phases (plan / review / deliver): `workspace/orchestrator-state/system-prompt.md`. */
export const ORCHESTRATOR_SYSTEM_PROMPT_FILE = path.join(
  WORKSPACE_DIR,
  "orchestrator-state",
  "orchestrator-system-prompt.md",
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
