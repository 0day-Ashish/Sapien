"use server";

import { compileMandate, type CompileResult } from "@/lib/mandate/compile";

export async function compileMandateAction(text: string): Promise<CompileResult> {
  if (typeof text !== "string") {
    return { ok: false, reason: "empty", message: "Describe your risk rules first." };
  }
  return compileMandate(text);
}
