// Gemini writes the agent's-eye-view rationale from the facts of a decision the rules already made (ADR-0005).
// The text is display-only: the agent copies it onto an unchanged proposal, and any failure keeps the template.

import { GoogleGenAI } from "@google/genai";
import type { RationaleWriter } from "./types.js";

/** Google's stable fast, low-cost text model; override with GEMINI_MODEL. */
export const DEFAULT_RATIONALE_MODEL = "gemini-3.5-flash-lite";

const SYSTEM = `You write one or two plain sentences for a trading dashboard's live feed, explaining a decision a rule-based trading agent has ALREADY made.
Use only the facts given. Don't add numbers, predictions, advice or hype, and don't change or second-guess the decision.
Write for a non-expert: say what the price did, what level it crossed, and what the agent is doing about it. No markdown.`;

export function geminiRationaleWriter(
  options: { apiKey?: string; model?: string; client?: GoogleGenAI } = {},
): RationaleWriter {
  const client = options.client ?? new GoogleGenAI({ apiKey: options.apiKey ?? process.env.GEMINI_API_KEY });
  const model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_RATIONALE_MODEL;
  return async (facts, template) => {
    const response = await client.models.generateContent({
      model,
      contents: `Decision facts (JSON): ${JSON.stringify(facts)}\nTemplate wording, for reference: ${template}`,
      config: { systemInstruction: SYSTEM, maxOutputTokens: 300 },
    });
    const text = response.text?.trim();
    if (!text) throw new Error("Empty rationale from Gemini");
    return text;
  };
}
