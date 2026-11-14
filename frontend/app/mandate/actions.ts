"use server";

import { finalizeMandate, type FinalizeResult } from "@/lib/mandate/calendar";
import { compileMandate, recentTurns, type CompileResult, type Turn } from "@/lib/mandate/compile";
import { MAX_MANDATE_TEXT_LENGTH } from "@/lib/mandate/limits";
import { validateMandateDraft } from "@/lib/mandate/schema";

/**
 * Answers the chat: the conversation so far, oldest first, ending with the user's latest message.
 * `currentForm` is the draft on the user's screen, if there is one, so a new draft keeps their hand edits.
 */
export async function compileMandateAction(input: unknown, currentForm?: unknown): Promise<CompileResult> {
  // Only a draft that passes the same validation as the signature step is passed on as context.
  const checked = currentForm === undefined ? undefined : validateMandateDraft(currentForm);
  const current = checked?.ok ? checked.mandate : undefined;
  if (typeof input === "string") return compileMandate(input, undefined, current);
  // Server actions take any JSON from the browser: keep only well-formed turns, the latest few, each capped.
  const turns: Turn[] = Array.isArray(input)
    ? recentTurns(
        input.filter((t): t is Turn => !!t && (t.role === "user" || t.role === "assistant") && typeof t.text === "string"),
      ).map((t) => ({ role: t.role, text: t.text.slice(0, MAX_MANDATE_TEXT_LENGTH + 1) }))
    : [];
  if (turns.length === 0 || turns.at(-1)!.role !== "user") {
    return { ok: false, reason: "empty", message: "Describe your risk rules first." };
  }
  return compileMandate(turns, undefined, current);
}

/** Validates the confirmed draft again on the server, then looks up real blackout times. */
export async function finalizeMandateAction(draft: unknown): Promise<FinalizeResult> {
  const validation = validateMandateDraft(draft);
  if (!validation.ok) {
    return { ok: false, message: "Fix the highlighted fields before you can confirm." };
  }
  return finalizeMandate(validation.mandate);
}
