import { NextResponse } from "next/server";
import {
  getCurrentSessionId,
  SESSION_POINTER_FILE,
  writeWorkspaceText,
} from "@/lib/workspaceNode";

/**
 * Increments the active session ID in `workspace/session-pointer.json`.
 * The new session folder is created lazily on first write (appendChatHistoryTurn / appendWorkerFinding).
 */
export async function POST() {
  try {
    const current = await getCurrentSessionId();
    const next = current + 1;
    await writeWorkspaceText(SESSION_POINTER_FILE, JSON.stringify({ session_id: next }, null, 2) + "\n");
    return NextResponse.json({ ok: true, session_id: next });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create new session" },
      { status: 500 },
    );
  }
}
