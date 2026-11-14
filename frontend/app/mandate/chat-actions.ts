"use server";

import type { StoredChat } from "@/lib/chats/merge";
import { chatStoreEnabled, listChats, removeChat, saveChat } from "@/lib/chats/store";

// Server actions for Mandate chat history. `key` is the browser's random history key. Every action reports failure
// instead of throwing, so the composer can carry on with the copy it keeps in the browser.

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; reason: "off" | "error" };

async function attempt<T>(run: () => Promise<T>): Promise<Result<T>> {
  if (!chatStoreEnabled()) return { ok: false, reason: "off" };
  try {
    return { ok: true, ...(await run()) };
  } catch (e) {
    console.error("chat history:", e instanceof Error ? e.message : e);
    return { ok: false, reason: "error" };
  }
}

export async function loadChatsAction(key: string): Promise<Result<{ chats: StoredChat[] }>> {
  return attempt(async () => ({ chats: await listChats(key) }));
}

export async function saveChatAction(key: string, chat: StoredChat): Promise<Result> {
  return attempt(async () => {
    await saveChat(key, chat);
    return {};
  });
}

export async function deleteChatAction(key: string, id: string): Promise<Result> {
  return attempt(async () => {
    await removeChat(key, id);
    return {};
  });
}
