import { promises as fs } from "node:fs";
import path from "node:path";
import { isTempChatHistoryId } from "@/lib/tempChatHistoryId";

export const TEMP_CHAT_HISTORY_DIR = path.join(process.cwd(), "workspace", "temp-chat-history");

export async function ensureTempChatHistoryDir(): Promise<void> {
  await fs.mkdir(TEMP_CHAT_HISTORY_DIR, { recursive: true });
}

export function historyFilePathForId(id: string): string {
  return path.join(TEMP_CHAT_HISTORY_DIR, `${id}.json`);
}

/** True for `<uuid>.json` only (case-insensitive `.json` extension). */
export function isValidHistoryFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  if (!lower.endsWith(".json")) return false;
  const stem = filename.slice(0, -".json".length);
  return isTempChatHistoryId(stem);
}
