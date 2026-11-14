"use server";

import { finalizeMandate, type FinalizeResult } from "@/lib/mandate/calendar";
import { compileMandate, type CompileResult } from "@/lib/mandate/compile";
import { validateMandateDraft } from "@/lib/mandate/schema";

export async function compileMandateAction(text: string): Promise<CompileResult> {
  if (typeof text !== "string") {
    return { ok: false, reason: "empty", message: "Describe your risk rules first." };
  }
  return compileMandate(text);
}

/** Validates the confirmed draft again on the server, then looks up real blackout times. */
export async function finalizeMandateAction(draft: unknown): Promise<FinalizeResult> {
  const validation = validateMandateDraft(draft);
  if (!validation.ok) {
    return { ok: false, message: "Fix the highlighted fields before you can confirm." };
  }
  return finalizeMandate(validation.mandate);
}
