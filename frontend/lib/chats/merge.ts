// Mandate chat history: the shape stored, and how a browser's copy and the server's copy are combined.
// Kept free of server code so the client and the tests can import it.

/** One drafting session. `form` is the Mandate form as the composer holds it. */
export type StoredChat = {
  id: string;
  text: string | null;
  /** The conversation with the Mandate assistant. Optional: chats saved before the assistant could chat have none. */
  messages?: { role: "user" | "assistant"; text: string }[];
  form: unknown;
  assumptions: string[];
  updatedAt: number;
};

export const MAX_CHATS = 20;
/** How many messages of a conversation are stored: the same number the assistant is sent. */
export const MAX_STORED_MESSAGES = 20;
/** The longest a stored message may be. User messages are capped at 2,000 characters and replies at 1,200. */
export const MAX_MESSAGE_CHARS = 2000;
/**
 * The largest chat the server accepts, as JSON. Sized so that any chat the schema allows fits: 20 messages of
 * 2,000 characters at up to 3 bytes each (120 KB), plus the title, the assumptions and the form (about 45 KB).
 */
export const MAX_CHAT_BYTES = 200_000;

/** The messages worth storing: the newest MAX_STORED_MESSAGES. */
export const storedMessages = <T,>(messages: T[]): T[] => messages.slice(-MAX_STORED_MESSAGES);

/** Ids deleted in this browser whose removal the server has not confirmed yet, so a reload can't bring them back. */
export const TOMBSTONES_KEY = "sapien.mandate.deletedChats";

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
