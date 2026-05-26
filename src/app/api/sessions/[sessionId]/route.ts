import { NextResponse } from "next/server";
import {
  getCurrentSessionId,
  getSessionChatHistoryFile,
  SESSION_POINTER_FILE,
  writeWorkspaceText,
} from "@/lib/workspaceNode";
import { parseChatMemoryFile } from "@/lib/chatMemoryJson";
import { readWorkspaceText } from "@/lib/workspaceNode";
import type { Agent7Dimension, Agent7KnownGapGroup } from "@/lib/types";

export type LoadedSession = {
  sessionId: number;
  messages: Array<
    | { role: "user"; content: string }
    | { role: "assistant"; content: string; preference_notification?: string }
  >;
  /** Seeds from the last deliver step — lets the next message continue the conversation. */
  keyFindings: Record<string, unknown>;
  dimensions: Agent7Dimension[];
  knownGaps: Agent7KnownGapGroup[];
};

/**
 * POST /api/sessions/[sessionId]
 * Switches the active session pointer to `sessionId` and returns the
 * reconstructed message history from that session's chat-memory.json.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId: raw } = await ctx.params;
  const sessionId = parseInt(raw, 10);
  if (!Number.isFinite(sessionId) || sessionId < 0) {
    return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
  }

  // Switch pointer.
  const current = await getCurrentSessionId();
  if (current !== sessionId) {
    await writeWorkspaceText(
      SESSION_POINTER_FILE,
      JSON.stringify({ session_id: sessionId }, null, 2) + "\n",
    );
  }

  // Read chat-memory.json for this session.
  const chatFile = getSessionChatHistoryFile(sessionId);
  const raw2 = await readWorkspaceText(chatFile);
  const doc = parseChatMemoryFile(raw2);

  const messages: LoadedSession["messages"] = [];
  let keyFindings: Record<string, unknown> = {};
  let dimensions: Agent7Dimension[] = [];
  let knownGaps: Agent7KnownGapGroup[] = [];

  const turnKeys = Object.keys(doc)
    .filter((k) => /^\d+$/.test(k))
    .map(Number)
    .sort((a, b) => a - b);

  for (const n of turnKeys) {
    const turn = doc[String(n)];
    if (turn === null || typeof turn !== "object" || Array.isArray(turn)) continue;
    const t = turn as Record<string, unknown>;
    const question = typeof t.question === "string" ? t.question : null;
    const uo = t["user-output"];
    if (!question || uo === null || typeof uo !== "object" || Array.isArray(uo)) continue;
    const uoObj = uo as Record<string, unknown>;

    // Skip in-progress stubs.
    if (uoObj.summary === "in_progress") continue;

    const document = typeof uoObj.document === "string" ? uoObj.document : "";
    if (!document) continue;

    messages.push({ role: "user", content: question });

    const prefNote =
      typeof uoObj.preference === "string" ? uoObj.preference : undefined;

    messages.push({
      role: "assistant",
      content: document,
      ...(prefNote ? { preference_notification: prefNote } : {}),
    });

    // Extract seeds from the orchestrator_deliver step in pipeline_trace.
    const trace = uoObj.pipeline_trace;
    if (Array.isArray(trace)) {
      for (const step of trace) {
        if (
          step !== null &&
          typeof step === "object" &&
          !Array.isArray(step) &&
          (step as Record<string, unknown>).step === "orchestrator_deliver"
        ) {
          const s = step as Record<string, unknown>;
          if (s.key_findings && typeof s.key_findings === "object")
            keyFindings = s.key_findings as Record<string, unknown>;
          if (Array.isArray(s.dimensions)) dimensions = s.dimensions as Agent7Dimension[];
          if (Array.isArray(s.known_gaps)) knownGaps = s.known_gaps as Agent7KnownGapGroup[];
        }
      }
    }
  }

  return NextResponse.json({
    sessionId,
    messages,
    keyFindings,
    dimensions,
    knownGaps,
  } satisfies LoadedSession);
}
