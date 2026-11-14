import { json } from "@/lib/api";
import { openApi } from "@/lib/openapi";

// /openapi.json: the OpenAPI 3.1 description of the read-only API under /api/v1.
export function GET() {
  return json(openApi(), { maxAge: 3600 });
}
