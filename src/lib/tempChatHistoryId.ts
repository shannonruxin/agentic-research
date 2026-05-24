/** UUID filenames for `workspace/temp-chat-history/<id>.json` */
export const TEMP_CHAT_HISTORY_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTempChatHistoryId(id: string): boolean {
  return TEMP_CHAT_HISTORY_ID_RE.test(id.trim());
}
