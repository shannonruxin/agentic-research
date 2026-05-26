import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { WORKSPACE_SESSION_DIR, getSessionChatHistoryFile } from "@/lib/workspaceNode";
import { parseChatMemoryFile } from "@/lib/chatMemoryJson";

export type SessionListItem = {
  sessionId: number;
  title: string;
  savedAt: string;
  turnCount: number;
};

function titleFromChatMemory(doc: Record<string, unknown>): string {
  // Find the lowest numeric turn key and return its question.
  const keys = Object.keys(doc)
    .filter((k) => /^\d+$/.test(k))
    .map(Number)
    .sort((a, b) => a - b);
  for (const n of keys) {
    const turn = doc[String(n)];
    if (turn !== null && typeof turn === "object" && !Array.isArray(turn)) {
      const q = (turn as Record<string, unknown>).question;
      if (typeof q === "string" && q.trim()) {
        const s = q.trim();
        return s.length > 80 ? s.slice(0, 80) + "…" : s;
      }
    }
  }
  return "[untitled]";
}

/** Lists all sessions under `workspace/session/`, newest first. */
export async function GET() {
  let dirents;
  try {
    dirents = await fs.readdir(WORKSPACE_SESSION_DIR, { withFileTypes: true });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") return NextResponse.json({ sessions: [] });
    throw e;
  }

  const sessions: (SessionListItem & { _mtime: number })[] = [];

  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    const match = /^session(\d+)$/.exec(d.name);
    if (!match) continue;
    const sessionId = parseInt(match[1], 10);

    const chatFile = getSessionChatHistoryFile(sessionId);
    let raw = "";
    let mtime = 0;
    try {
      const st = await fs.stat(chatFile);
      mtime = st.mtimeMs;
      raw = await fs.readFile(chatFile, "utf8");
    } catch {
      continue; // session folder exists but no chat-memory.json yet — skip
    }

    const doc = parseChatMemoryFile(raw);
    const turnCount = Object.keys(doc).filter((k) => /^\d+$/.test(k)).length;
    if (turnCount === 0) continue; // no real turns yet — skip

    sessions.push({
      sessionId,
      title: titleFromChatMemory(doc),
      savedAt: new Date(mtime).toISOString(),
      turnCount,
      _mtime: mtime,
    });
  }

  sessions.sort((a, b) => b._mtime - a._mtime);
  const result: SessionListItem[] = sessions.map(({ _mtime: _, ...rest }) => rest);

  return NextResponse.json({ sessions: result });
}
