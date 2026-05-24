import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { TempChatHistoryFileV1, TempChatHistoryListItemV1 } from "@/lib/persistedResearchChatState";
import { isTempChatHistoryId } from "@/lib/tempChatHistoryId";
import {
  ensureTempChatHistoryDir,
  historyFilePathForId,
  isValidHistoryFilename,
  TEMP_CHAT_HISTORY_DIR,
} from "@/lib/tempChatHistoryPaths";
import { readWorkspaceText, writeWorkspaceText } from "@/lib/workspaceNode";

const sessionPreferenceSchema = z.object({
  rule: z.string(),
  source: z.string(),
  added: z.string(),
});

const persistedStateSchema = z.object({
  messages: z.array(z.unknown()),
  draft: z.string(),
  subjectScopeText: z.string(),
  researchHygieneText: z.string(),
  memoryText: z.string(),
  knownGapsText: z.string(),
  dimensionsText: z.string(),
  keyFindingsText: z.string(),
  keyFindingsSeed: z.record(z.string(), z.unknown()).optional().nullable(),
  dimensionsSeed: z.array(z.unknown()).optional().nullable(),
  knownGapsSeed: z.array(z.unknown()).optional().nullable(),
  sessionPreferences: z.array(sessionPreferenceSchema),
  maxRounds: z.string(),
  maxWorkersConcurrent: z.string(),
  workerStaggerMs: z.string(),
  maxWorkerSteps: z.string(),
  maxTasksPerRound: z.string(),
  orchestratorTemp: z.string(),
  workerTemp: z.string(),
  deliverMaxTokens: z.string(),
});

const postBodySchema = z.object({
  chatId: z.string().trim().refine(isTempChatHistoryId, "chatId must be a UUID"),
  state: persistedStateSchema,
});

function titleFromFirstUserMessage(messages: unknown[]): string {
  for (const m of messages) {
    if (m !== null && typeof m === "object" && !Array.isArray(m) && "role" in m && m.role === "user") {
      const c = "content" in m && typeof m.content === "string" ? m.content.trim() : "";
      if (c) return c.length > 80 ? c.slice(0, 80) : c;
    }
  }
  return "[untitled]";
}

function parseListDoc(raw: string): Pick<TempChatHistoryFileV1, "savedAt" | "title"> | null {
  try {
    const p = JSON.parse(raw) as unknown;
    if (
      p !== null &&
      typeof p === "object" &&
      !Array.isArray(p) &&
      (p as { version?: unknown }).version === 1 &&
      typeof (p as { id?: unknown }).id === "string"
    ) {
      const savedAt = (p as { savedAt?: unknown }).savedAt;
      const title = (p as { title?: unknown }).title;
      return {
        savedAt: typeof savedAt === "string" ? savedAt : "",
        title: typeof title === "string" ? title : "[untitled]",
      };
    }
  } catch {
    return null;
  }
  return null;
}

/** Lists saved chats under `workspace/temp-chat-history/` (newest file mtime first). */
export async function GET() {
  await ensureTempChatHistoryDir();

  let dirents;
  try {
    dirents = await fs.readdir(TEMP_CHAT_HISTORY_DIR, { withFileTypes: true });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return NextResponse.json({ items: [] satisfies TempChatHistoryListItemV1[] });
    }
    throw e;
  }

  const rows: (TempChatHistoryListItemV1 & { mtimeMs: number })[] = [];

  for (const d of dirents) {
    if (!d.isFile()) continue;
    const baseName = String(d.name);
    if (!isValidHistoryFilename(baseName)) continue;
    const id = baseName.slice(0, -".json".length);
    const full = historyFilePathForId(id);
    let st;
    try {
      st = await fs.stat(full);
    } catch {
      continue;
    }
    const raw = (await readWorkspaceText(full)).trim();
    if (!raw) continue;
    const meta = parseListDoc(raw);
    if (!meta) continue;
    const mtimeIso = new Date(st.mtimeMs).toISOString();
    const savedAt = meta.savedAt.trim() ? meta.savedAt : mtimeIso;
    rows.push({
      id,
      title: meta.title,
      savedAt,
      mtimeMs: st.mtimeMs,
    });
  }

  rows.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const items: TempChatHistoryListItemV1[] = rows.map(({ mtimeMs: _m, ...rest }) => rest);

  return NextResponse.json({ items });
}

/** Upserts `workspace/temp-chat-history/<chatId>.json` (one file per chat session). */
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = postBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { chatId: id, state } = parsed.data;
  const messages = state.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Nothing to save (messages is empty)" }, { status: 400 });
  }

  const savedAt = new Date().toISOString();
  const title = titleFromFirstUserMessage(messages);

  const file: TempChatHistoryFileV1 = {
    version: 1,
    id,
    savedAt,
    title,
    state: {
      ...state,
      messages: messages as TempChatHistoryFileV1["state"]["messages"],
      keyFindingsSeed: state.keyFindingsSeed ?? undefined,
      dimensionsSeed: (state.dimensionsSeed as TempChatHistoryFileV1["state"]["dimensionsSeed"]) ?? undefined,
      knownGapsSeed: (state.knownGapsSeed as TempChatHistoryFileV1["state"]["knownGapsSeed"]) ?? undefined,
    },
  };

  const filePath = historyFilePathForId(id);
  await writeWorkspaceText(filePath, `${JSON.stringify(file, null, 2)}\n`);

  return NextResponse.json({ id, savedAt, title });
}
