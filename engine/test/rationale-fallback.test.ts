import { describe, expect, it } from "vitest";
import { fallbackRationaleWriter, groqRationaleWriter } from "../src/index.js";
import type { RationaleWriter } from "../src/agents/types.js";

const facts = { asset: "ETH", side: "long" };
const failing: RationaleWriter = async () => {
  throw new Error("Gemini quota");
};

describe("rationale fallback (Gemini, then Groq)", () => {
  it("uses the first writer when it answers", async () => {
    const write = fallbackRationaleWriter([async () => "from gemini", async () => "from groq"]);
    expect(await write(facts, "template")).toBe("from gemini");
  });

  it("falls back to the next writer when one fails or answers empty, and reports it", async () => {
    const fellBack: number[] = [];
    const write = fallbackRationaleWriter([failing, async () => "  ", async () => "from groq"], (i) => fellBack.push(i));
    expect(await write(facts, "template")).toBe("from groq");
    expect(fellBack).toEqual([0, 1]);
  });

  it("throws when every writer fails, so the agent keeps its template wording", async () => {
    await expect(fallbackRationaleWriter([failing, failing])(facts, "template")).rejects.toThrow("Gemini quota");
    await expect(fallbackRationaleWriter([])(facts, "template")).rejects.toThrow();
  });

  it("Groq sends the facts with the shared system prompt and reads the first choice", async () => {
    let sent: { url: string; body: { model: string; messages: { role: string; content: string }[] }; auth: string } | undefined;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get("authorization") ?? "" };
      return new Response(JSON.stringify({ choices: [{ message: { content: " ETH broke out. " } }] }));
    }) as unknown as typeof fetch;
    const write = groqRationaleWriter({ apiKey: "k", model: "m", fetch: fakeFetch });
    expect(await write(facts, "template")).toBe("ETH broke out.");
    expect(sent!.url).toContain("api.groq.com");
    expect(sent!.auth).toBe("Bearer k");
    expect(sent!.body.model).toBe("m");
    expect(sent!.body.messages[0]!.content).toContain("ALREADY made");
    expect(sent!.body.messages[1]!.content).toContain('"asset":"ETH"');
  });

  it("Groq errors on a failed request", async () => {
    const fakeFetch = (async () => new Response("rate limited", { status: 429 })) as unknown as typeof fetch;
    await expect(groqRationaleWriter({ apiKey: "k", fetch: fakeFetch })(facts, "t")).rejects.toThrow("HTTP 429");
  });
});
