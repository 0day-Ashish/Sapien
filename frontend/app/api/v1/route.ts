import { json, preflight } from "@/lib/api";
import { openApi } from "@/lib/openapi";
import { SITE_URL } from "@/lib/site";

/** GET /api/v1: what this API offers, with a link to the full OpenAPI description. */
export function GET() {
  const spec = openApi();
  const endpoints = Object.entries(spec.paths).map(([path, ops]) => ({ path, method: "GET", summary: ops.get.summary, description: ops.get.description }));
  return json({ name: spec.info.title, description: spec.info.description, openapi: `${SITE_URL}/openapi.json`, docs: `${SITE_URL}/llms.txt`, endpoints }, { maxAge: 3600 });
}
export const OPTIONS = preflight;
