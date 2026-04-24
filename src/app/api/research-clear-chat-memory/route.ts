import { NextResponse } from "next/server";
import { CHAT_MEMORY_FILE, writeWorkspaceText } from "@/lib/workspaceNode";

/** Clears Research session file `workspace/chat-memory.json` (empty JSON object). */
export async function POST() {
  try {
    await writeWorkspaceText(CHAT_MEMORY_FILE, "{}\n");
    return NextResponse.json({ ok: true, path: CHAT_MEMORY_FILE });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to clear chat memory" },
      { status: 500 },
    );
  }
}
