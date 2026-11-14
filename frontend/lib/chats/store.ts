import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { z } from "zod";
import { MAX_CHAT_BYTES, MAX_CHATS, type StoredChat } from "./merge";

// Mandate chat history in Postgres (Neon). Each browser holds a random history key; rows are filed under the key's
// hash, so the database never stores a value that could be replayed to read someone's history.
// Server only: import it from server actions, never from a client component.
// Without DATABASE_URL the store is off and the composer keeps history in the browser only.

const chatSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().max(4000).nullable(),
  form: z.unknown(),
  assumptions: z.array(z.string().max(500)).max(20),
  updatedAt: z.number().int().nonnegative(),
});
const keySchema = z.string().min(32).max(128);

export const chatStoreEnabled = () => Boolean(process.env.DATABASE_URL);

const sql = () => neon(process.env.DATABASE_URL!);
const ownerOf = (key: string) => createHash("sha256").update(keySchema.parse(key)).digest("hex");

let ready: Promise<unknown> | undefined;
/** Creates the table on first use. Safe to run on every cold start. */
function ensureTable() {
  ready ??= sql()`
    CREATE TABLE IF NOT EXISTS mandate_chats (
      owner_hash text NOT NULL,
      id text NOT NULL,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL,
      PRIMARY KEY (owner_hash, id)
    )`.catch((e) => {
    ready = undefined;
    throw e;
  });
  return ready;
}

export async function listChats(key: string): Promise<StoredChat[]> {
  await ensureTable();
  const rows = await sql()`
    SELECT data FROM mandate_chats WHERE owner_hash = ${ownerOf(key)} ORDER BY updated_at DESC LIMIT ${MAX_CHATS}`;
  return rows.flatMap((r) => {
    const parsed = chatSchema.safeParse(r.data);
    return parsed.success ? [parsed.data as StoredChat] : [];
  });
}

/** Saves a chat unless the stored copy is newer, then trims the owner's history to MAX_CHATS. */
export async function saveChat(key: string, chat: unknown): Promise<void> {
  const parsed = chatSchema.parse(chat);
  const json = JSON.stringify(parsed);
  if (Buffer.byteLength(json) > MAX_CHAT_BYTES) throw new Error("Chat is too large to store");
  const owner = ownerOf(key);
  await ensureTable();
  const db = sql();
  await db`
    INSERT INTO mandate_chats (owner_hash, id, data, updated_at)
    VALUES (${owner}, ${parsed.id}, ${json}::jsonb, to_timestamp(${parsed.updatedAt} / 1000.0))
    ON CONFLICT (owner_hash, id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
    WHERE mandate_chats.updated_at <= EXCLUDED.updated_at`;
  await db`
    DELETE FROM mandate_chats WHERE owner_hash = ${owner} AND id NOT IN (
      SELECT id FROM mandate_chats WHERE owner_hash = ${owner} ORDER BY updated_at DESC LIMIT ${MAX_CHATS}
    )`;
}

export async function removeChat(key: string, id: string): Promise<void> {
  await ensureTable();
  await sql()`DELETE FROM mandate_chats WHERE owner_hash = ${ownerOf(key)} AND id = ${z.string().min(1).max(64).parse(id)}`;
}
