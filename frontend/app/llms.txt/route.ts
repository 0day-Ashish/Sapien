import { llmsTxt, textResponse } from "@/lib/llms";

// /llms.txt: the site index for language models and agents (https://llmstxt.org).
export function GET() {
  return textResponse(llmsTxt());
}
