import { llmsFullTxt, textResponse } from "@/lib/llms";

// /llms-full.txt: the llms.txt header plus every docs page as Markdown.
export function GET() {
  return textResponse(llmsFullTxt());
}
