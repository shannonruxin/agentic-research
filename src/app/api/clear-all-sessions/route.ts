import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import {
  SESSION_POINTER_FILE,
  WORKSPACE_SESSION_DIR,
  writeWorkspaceText,
} from "@/lib/workspaceNode";

/**
 * Deletes all session folders under `workspace/session/` and resets
 * `session-pointer.json` back to session 0.
 */
export async function POST() {
  try {
    await fs.rm(WORKSPACE_SESSION_DIR, { recursive: true, force: true });
    await writeWorkspaceText(
      SESSION_POINTER_FILE,
      JSON.stringify({ session_id: 0 }, null, 2) + "\n",
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to clear sessions" },
      { status: 500 },
    );
  }
}
