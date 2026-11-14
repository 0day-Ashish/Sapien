import { describe, expect, it } from "vitest";
import { MAX_CHATS, mergeChats, unsynced, type StoredChat } from "../lib/chats/merge";

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

  it("uploads only what the server lacks or holds an older copy of", () => {
    const local = [chat("a", 10), chat("b", 30), chat("c", 5)];
    const remote = [chat("a", 10), chat("b", 20)];
    expect(unsynced(local, remote).map((c) => c.id)).toEqual(["b", "c"]);
  });
});
