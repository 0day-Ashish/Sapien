// Mandate chat history: the shape stored, and how a browser's copy and the server's copy are combined.
// Kept free of server code so the client and the tests can import it.

/** One drafting session. `form` is the Mandate form as the composer holds it. */
export type StoredChat = { id: string; text: string | null; form: unknown; assumptions: string[]; updatedAt: number };

export const MAX_CHATS = 20;
/** The largest chat the server accepts, as JSON. A real draft is well under 5 KB. */
export const MAX_CHAT_BYTES = 20_000;

/**
 * Combines two lists of chats. For a chat in both, the one edited last wins. Newest first, capped at MAX_CHATS.
 * `deleted` are ids removed in this browser that the other list may still hold.
 */
export function mergeChats<T extends StoredChat>(a: T[], b: T[], deleted: Iterable<string> = []): T[] {
  const gone = new Set(deleted);
  const byId = new Map<string, T>();
  for (const chat of [...a, ...b]) {
    if (gone.has(chat.id)) continue;
    const seen = byId.get(chat.id);
    if (!seen || chat.updatedAt > seen.updatedAt) byId.set(chat.id, chat);
  }
  return [...byId.values()].sort((x, y) => y.updatedAt - x.updatedAt).slice(0, MAX_CHATS);
}

/** Chats in `local` that `remote` lacks or holds an older copy of: what this browser still has to upload. */
export function unsynced<T extends StoredChat>(local: T[], remote: T[]): T[] {
  const remoteAt = new Map(remote.map((c) => [c.id, c.updatedAt]));
  return local.filter((c) => (remoteAt.get(c.id) ?? -1) < c.updatedAt);
}
