// Shared bits for the public read-only API under /api/v1 (described in /openapi.json). Every response is JSON, open
// to any origin, and bigints are sent as decimal strings so nothing loses precision.

/** The engine's base URL: NEXT_PUBLIC_ENGINE_URL unless it points at this machine, else the production engine. */
export function engineBase() {
  const env = process.env.NEXT_PUBLIC_ENGINE_URL;
  return env && !/127\.0\.0\.1|localhost/.test(env) ? env.replace(/\/$/, "") : "https://sapien.152-67-0-76.sslip.io";
}

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
};

export function json(body: unknown, init: { status?: number; maxAge?: number } = {}) {
  const text = JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  return new Response(text, {
    status: init.status ?? 200,
    headers: { ...HEADERS, "cache-control": `public, max-age=0, s-maxage=${init.maxAge ?? 15}, stale-while-revalidate=60` },
  });
}

export const apiError = (status: number, error: string) => json({ error }, { status, maxAge: 0 });

export const preflight = () => new Response(null, { status: 204, headers: HEADERS });

export const isEvmAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);
export const isBytes32 = (s: string) => /^0x[0-9a-fA-F]{64}$/.test(s);
export const isNearAccount = (s: string) => /^(?=.{2,64}$)([a-z0-9]+[-_])*[a-z0-9]+(\.([a-z0-9]+[-_])*[a-z0-9]+)*$/.test(s);

/** GET an engine route, forwarding only the named query parameters. */
export async function fromEngine(path: string, request: Request, allowed: string[] = []) {
  const incoming = new URL(request.url).searchParams;
  const q = new URLSearchParams();
  for (const k of allowed) {
    const v = incoming.get(k);
    if (v) q.set(k, v);
  }
  const url = `${engineBase()}${path}${q.size ? `?${q}` : ""}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    const body = await res.json().catch(() => ({ error: `Engine returned ${res.status}` }));
    return json(body, { status: res.status });
  } catch {
    return apiError(502, "The engine is unreachable right now");
  }
}
