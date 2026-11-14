import { PAGE_MARKDOWN } from "@/lib/page-markdown";

// Serves /risk.md, /terms.md, /privacy.md and /changelog.md (rewritten here in next.config.ts).

export function generateStaticParams() {
  return Object.keys(PAGE_MARKDOWN).map((name) => ({ name }));
}

export async function GET(_req: Request, { params }: RouteContext<"/md/page/[name]">) {
  const { name } = await params;
  const build = PAGE_MARKDOWN[name];
  if (!build) return new Response("Not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(build(), { headers: { "content-type": "text/markdown; charset=utf-8", "x-robots-tag": "noindex" } });
}
