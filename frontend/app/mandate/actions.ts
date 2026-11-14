"use server";

import { finalizeMandate, type FinalizeResult } from "@/lib/mandate/calendar";
import { compileMandate, MAX_TURNS, type CompileResult, type Turn } from "@/lib/mandate/compile";
import { MAX_MANDATE_TEXT_LENGTH } from "@/lib/mandate/limits";
import { validateMandateDraft } from "@/lib/mandate/schema";

/** Answers the chat: the conversation so far, oldest first, ending with the user's latest message. */
export async function compileMandateAction(input: unknown): Promise<CompileResult> {
  if (typeof input === "string") return compileMandate(input);
  // Server actions take any JSON from the browser: keep only well-formed turns, the latest few, each capped.
  const turns: Turn[] = Array.isArray(input)
    ? input
        .filter((t): t is Turn => !!t && (t.role === "user" || t.role === "assistant") && typeof t.text === "string")
        .slice(-MAX_TURNS)
        .map((t) => ({ role: t.role, text: t.text.slice(0, MAX_MANDATE_TEXT_LENGTH + 1) }))
    : [];
  if (turns.length === 0 || turns.at(-1)!.role !== "user") {
    return { ok: false, reason: "empty", message: "Describe your risk rules first." };
  }
  return compileMandate(turns);
}

/** Validates the confirmed draft again on the server, then looks up real blackout times. */
export async function finalizeMandateAction(draft: unknown): Promise<FinalizeResult> {
  const validation = validateMandateDraft(draft);
  if (!validation.ok) {
    return { ok: false, message: "Fix the highlighted fields before you can confirm." };
  }
  return finalizeMandate(validation.mandate);
}
