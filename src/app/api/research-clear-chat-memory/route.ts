import { NextResponse } from "next/server";
import { CHAT_MEMORY_FILE, writeWorkspaceText } from "@/lib/workspaceNode";

/** Clears the legacy flat `workspace/chat-memory.json` if it exists. Session data is managed separately. */
export async function POST() {
  try {
    await writeWorkspaceText(CHAT_MEMORY_FILE, "{}\n");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to clear chat memory" },
      { status: 500 },
    );
  }
}
