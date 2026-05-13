import { NextResponse } from "next/server";
import { clearDimensionMarkdownDir } from "@/lib/dimensionMemoryMarkdown";
import { CHAT_MEMORY_FILE, writeWorkspaceText } from "@/lib/workspaceNode";

/** Clears `workspace/chat-memory.json` and all `workspace/chat-dimension-memory/*.md`. */
export async function POST() {
  try {
    await writeWorkspaceText(CHAT_MEMORY_FILE, "{}\n");
    await clearDimensionMarkdownDir();
    return NextResponse.json({ ok: true, path: CHAT_MEMORY_FILE });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to clear chat memory" },
      { status: 500 },
    );
  }
}
