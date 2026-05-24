import { NextResponse } from "next/server";
import type { TempChatHistoryFileV1 } from "@/lib/persistedResearchChatState";
import { isTempChatHistoryId } from "@/lib/tempChatHistoryId";
import { historyFilePathForId } from "@/lib/tempChatHistoryPaths";
import { readWorkspaceText } from "@/lib/workspaceNode";

/** Load one saved chat snapshot. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isTempChatHistoryId(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const filePath = historyFilePathForId(id);
  const raw = (await readWorkspaceText(filePath)).trim();
  if (!raw) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const p = JSON.parse(raw) as unknown;
    if (
      p === null ||
      typeof p !== "object" ||
      Array.isArray(p) ||
      (p as { version?: unknown }).version !== 1
    ) {
      return NextResponse.json({ error: "Invalid save file" }, { status: 422 });
    }
    return NextResponse.json(p as TempChatHistoryFileV1);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 422 });
  }
}
