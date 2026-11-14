import { describe, expect, it } from "vitest";
import { MAX_TURNS, compileMandate, currentDraftNote, fallbackDraft, geminiDraft, groqDraft, recentTurns, type DraftMandate, type Turn } from "../lib/mandate/compile";
import { MAX_MANDATE_TEXT_LENGTH } from "../lib/mandate/limits";
import { validateMandateDraft, type MandateDraft } from "../lib/mandate/schema";

const validMandate: MandateDraft = {
  allowedAssets: ["BTC", "ETH"],
  leverageCap: 2,
  stopLossPct: 2,
  drawdownCapPct: 8,
  blackoutWindows: [{ event: "US_CPI", minutesBefore: 60, minutesAfter: 60 }],
  vetoThresholdUsdc: 100,
};

const returns = (output: unknown): DraftMandate => async () => ({ refused: false, output });

describe("compileMandate", () => {
  it("returns the draft when the model output matches the Mandate schema", async () => {
    const result = await compileMandate(
      "Conservative, BTC and ETH only",
      returns({ mandate: validMandate, assumptions: ["Leverage cap of 2 chosen for a conservative profile."] }),
    );
    expect(result).toEqual({
      ok: true,
      kind: "draft",
      compiled: { mandate: validMandate, assumptions: ["Leverage cap of 2 chosen for a conservative profile."] },
    });
  });

  it("chats instead of drafting while no specific rule has been given", async () => {
    const result = await compileMandate(
      "hi, what is this?",
      returns({ action: "reply", reply: "Hi! I help you set the rules your trading agents follow. Which assets should they trade?", mandate: validMandate, assumptions: [] }),
    );
    expect(result).toEqual({ ok: true, kind: "reply", reply: "Hi! I help you set the rules your trading agents follow. Which assets should they trade?" });
  });

  it("drafts once a rule is given, keeping the model's one-line intro", async () => {
    const result = await compileMandate(
      "BTC only, conservative",
      returns({ action: "draft", reply: "Here's a draft from what you told me.", mandate: validMandate, assumptions: [] }),
    );
    expect(result).toEqual({ ok: true, kind: "draft", reply: "Here's a draft from what you told me.", compiled: { mandate: validMandate, assumptions: [] } });
  });

  it("sends the whole conversation, so rules from earlier messages count", async () => {
    let seen: unknown;
    const spy: DraftMandate = async (input) => {
      seen = input;
      return { refused: false, output: { action: "draft", reply: "", mandate: validMandate, assumptions: [] } };
    };
    const conversation = [
      { role: "user" as const, text: "I'm pretty cautious" },
      { role: "assistant" as const, text: "Got it. Which assets?" },
      { role: "user" as const, text: "  BTC and ETH  " },
    ];
    expect(await compileMandate(conversation, spy)).toMatchObject({ ok: true, kind: "draft" });
    expect(seen).toEqual([...conversation.slice(0, 2), { role: "user", text: "BTC and ETH" }]);
  });

  it("sends the draft on screen with the latest message, so hand edits survive a re-draft", async () => {
    let seen: unknown;
    const spy: DraftMandate = async (input) => {
      seen = input;
      return { refused: false, output: { action: "draft", reply: "", mandate: validMandate, assumptions: [] } };
    };
    const conversation: Turn[] = [
      { role: "user", text: "BTC and ETH, balanced" },
      { role: "assistant", text: "Here's a draft." },
      { role: "user", text: "also avoid FOMC" },
    ];
    await compileMandate(conversation, spy, validMandate);
    expect(seen).toEqual([...conversation.slice(0, 2), { role: "user", text: `also avoid FOMC\n\n${currentDraftNote(validMandate)}` }]);
    expect(currentDraftNote(validMandate)).toContain('"leverageCap":2');
  });

  it("checks the length of the user's own words, not of the note about the current draft", async () => {
    const longest = "x".repeat(MAX_MANDATE_TEXT_LENGTH);
    const draft = returns({ action: "draft", reply: "", mandate: validMandate, assumptions: [] });
    expect(await compileMandate([{ role: "user", text: longest }], draft, validMandate)).toMatchObject({ ok: true });
    expect(await compileMandate([{ role: "user", text: `${longest}x` }], draft, validMandate)).toMatchObject({ ok: false, reason: "too-long" });
  });

  it("never starts a trimmed conversation on an assistant turn", () => {
    // 11 exchanges and a new message: cutting to the newest 20 turns would start on the assistant's reply.
    const long: Turn[] = Array.from({ length: 23 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: `turn ${i}` }));
    const recent = recentTurns(long);
    expect(recent[0]!.role).toBe("user");
    expect(recent.at(-1)).toEqual(long.at(-1));
    expect(recent.length).toBeLessThanOrEqual(MAX_TURNS);
    expect(recentTurns(long.slice(0, 3))).toEqual(long.slice(0, 3));
  });

  it("treats an empty conversational answer as a failure, not a draft", async () => {
    const result = await compileMandate("hello", returns({ action: "reply", reply: "  ", mandate: validMandate, assumptions: [] }));
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("refuses a conversation that doesn't end with the user's message", async () => {
    const counting: DraftMandate = async () => {
      throw new Error("should not be called");
    };
    const result = await compileMandate([{ role: "assistant", text: "Hi" }], counting);
    expect(result).toMatchObject({ ok: false, reason: "empty" });
  });

  it.each([
    ["leverage above the cap", { ...validMandate, leverageCap: 50 }],
    ["an unsupported asset", { ...validMandate, allowedAssets: ["BTC", "DOGE"] }],
    ["no assets", { ...validMandate, allowedAssets: [] }],
    ["a negative stop-loss", { ...validMandate, stopLossPct: -1 }],
    ["a missing field", { ...validMandate, drawdownCapPct: undefined }],
    ["a string where a number belongs", { ...validMandate, vetoThresholdUsdc: "100" }],
    ["an unknown blackout event", { ...validMandate, blackoutWindows: [{ event: "MOON", minutesBefore: 1, minutesAfter: 1 }] }],
    ["an extra field such as a kill flag", { ...validMandate, killFlag: true }],
  ])("rejects model output with %s", async (_name, mandate) => {
    const result = await compileMandate("anything", returns({ mandate, assumptions: [] }));
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
  });

  it.each([null, undefined, "not json", 42, {}, { mandate: null, assumptions: [] }])(
    "rejects malformed model output %j",
    async (output) => {
      const result = await compileMandate("anything", returns(output));
      expect(result).toMatchObject({ ok: false, reason: "invalid" });
    },
  );

  it("reports a refusal without a draft", async () => {
    const result = await compileMandate("anything", async () => ({ refused: true, output: null }));
    expect(result).toMatchObject({ ok: false, reason: "refused" });
  });

  it("reports the compiler as unavailable when the model call throws", async () => {
    const result = await compileMandate("anything", async () => {
      throw new Error("network down");
    });
    expect(result).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("does not call the model for empty or oversized text", async () => {
    let calls = 0;
    const counting: DraftMandate = async () => {
      calls++;
      return { refused: false, output: null };
    };
    expect(await compileMandate("   ", counting)).toMatchObject({ ok: false, reason: "empty" });
    expect(await compileMandate("x".repeat(2001), counting)).toMatchObject({ ok: false, reason: "too-long" });
    expect(calls).toBe(0);
  });
});

describe("validateMandateDraft (gate in front of the signature step)", () => {
  it("accepts a valid Mandate", () => {
    expect(validateMandateDraft(validMandate)).toEqual({ ok: true, mandate: validMandate });
  });

  it("names each field a user edit broke", () => {
    const result = validateMandateDraft({ ...validMandate, leverageCap: 0, allowedAssets: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["allowedAssets", "leverageCap"]);
  });
});

describe("Gemini drafts, Groq takes over", () => {
  const json = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const draft = { mandate: { allowedAssets: ["BTC"] }, assumptions: [] };

  it("falls back to Groq when Gemini errors", async () => {
    const run = fallbackDraft([
      geminiDraft({ apiKey: "k", fetch: json({}, 503) }),
      groqDraft({ apiKey: "k", fetch: json({ choices: [{ message: { content: JSON.stringify(draft) } }] }) }),
    ]);
    expect(await run("x")).toEqual({ refused: false, output: draft });
  });

  it("a Gemini safety block is a refusal, not a fallback", async () => {
    const run = fallbackDraft([geminiDraft({ apiKey: "k", fetch: json({ promptFeedback: { blockReason: "SAFETY" } }) })]);
    expect(await run("x")).toEqual({ refused: true, output: null });
  });

  it("is unavailable when every provider fails", async () => {
    const result = await compileMandate("Conservative.", fallbackDraft([geminiDraft({ apiKey: "" }), groqDraft({ apiKey: "" })]));
    expect(result).toMatchObject({ ok: false, reason: "unavailable" });
  });
});
