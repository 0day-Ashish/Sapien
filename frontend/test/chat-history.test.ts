import { describe, expect, it } from "vitest";
import { MAX_CHATS, MAX_CHAT_BYTES, MAX_MESSAGE_CHARS, MAX_STORED_MESSAGES, mergeChats, storedMessages, unsynced, type StoredChat } from "../lib/chats/merge";
import { MAX_TURNS } from "../lib/mandate/compile";

const chat = (id: string, updatedAt: number, text = id): StoredChat => ({ id, text, form: {}, assumptions: [], updatedAt });

describe("Mandate chat history", () => {
  it("merges the browser's chats with the server's, newest first", () => {
    const merged = mergeChats([chat("a", 10), chat("b", 30)], [chat("c", 20)]);
    expect(merged.map((c) => c.id)).toEqual(["b", "c", "a"]);
  });

  it("keeps the copy edited last when both sides hold a chat", () => {
    const merged = mergeChats([chat("a", 10, "old")], [chat("a", 20, "new")]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.text).toBe("new");
  });

  it("does not bring back a chat deleted in this browser", () => {
    const merged = mergeChats([chat("a", 10)], [chat("b", 20)], ["b"]);
    expect(merged.map((c) => c.id)).toEqual(["a"]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: MAX_CHATS + 5 }, (_, i) => chat(`c${i}`, i));
    const merged = mergeChats(many, []);
    expect(merged).toHaveLength(MAX_CHATS);
    expect(merged[0]!.id).toBe(`c${MAX_CHATS + 4}`);
  });

  it("stores no more of a conversation than the server accepts", () => {
    const long = Array.from({ length: 31 }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), text: `m${i}` }));
    const kept = storedMessages(long);
    expect(kept).toHaveLength(MAX_STORED_MESSAGES);
    expect(kept.at(-1)).toEqual(long.at(-1));
    // What is stored is what the assistant is sent.
    expect(MAX_STORED_MESSAGES).toBe(MAX_TURNS);
  });

  it("accepts, by size, the largest chat the stored shape allows", () => {
    // Worst case: every message at the character cap in a 3-byte script, plus a long title and assumptions.
    const messages = Array.from({ length: MAX_STORED_MESSAGES }, () => ({ role: "user" as const, text: "語".repeat(MAX_MESSAGE_CHARS) }));
    const biggest = { ...chat("a", 1, "語".repeat(4000)), messages, assumptions: Array.from({ length: 20 }, () => "語".repeat(500)) };
    expect(Buffer.byteLength(JSON.stringify(biggest))).toBeLessThan(MAX_CHAT_BYTES);
  });

  it("uploads only what the server lacks or holds an older copy of", () => {
    const local = [chat("a", 10), chat("b", 30), chat("c", 5)];
    const remote = [chat("a", 10), chat("b", 20)];
    expect(unsynced(local, remote).map((c) => c.id)).toEqual(["b", "c"]);
  });
});
