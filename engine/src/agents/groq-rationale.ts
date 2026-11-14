// Groq writes the agent's-eye-view rationale when Gemini can't (ADR-0005: display-only, the decision is already made).
// Groq's chat completions API is OpenAI-compatible, so a plain fetch is enough: no extra dependency.

import { RATIONALE_SYSTEM_PROMPT } from "./gemini-rationale.js";
import type { RationaleWriter } from "./types.js";

/** A fast open-weight model on Groq; override with GROQ_MODEL. It reasons first, so effort is kept low. */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export function groqRationaleWriter(
  options: { apiKey?: string; model?: string; fetch?: typeof fetch; timeoutMs?: number } = {},
): RationaleWriter {
  const apiKey = options.apiKey ?? process.env.GROQ_API_KEY;
  const model = options.model ?? process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL;
  const doFetch = options.fetch ?? fetch;
  return async (facts, template) => {
    if (!apiKey) throw new Error("GROQ_API_KEY not set");
    const res = await doFetch(GROQ_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        temperature: 0.3,
        reasoning_effort: "low",
        messages: [
          { role: "system", content: RATIONALE_SYSTEM_PROMPT },
          { role: "user", content: `Decision facts (JSON): ${JSON.stringify(facts)}\nTemplate wording, for reference: ${template}` },
        ],
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
    if (!res.ok) throw new Error(`Groq: HTTP ${res.status}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Empty rationale from Groq");
    return text;
  };
}

/**
 * Tries each writer in order and returns the first rationale that comes back (Gemini, then Groq).
 * If all fail, it throws, and the agent keeps its template wording (explainProposal).
 */
export function fallbackRationaleWriter(
  writers: RationaleWriter[],
  onFallback?: (index: number, error: unknown) => void,
): RationaleWriter {
  return async (facts, template) => {
    let last: unknown = new Error("No rationale writers configured");
    for (const [i, write] of writers.entries()) {
      try {
        const text = (await write(facts, template)).trim();
        if (text) return text;
        last = new Error("Empty rationale");
      } catch (e) {
        last = e;
      }
      if (i < writers.length - 1) onFallback?.(i, last);
    }
    throw last;
  };
}
