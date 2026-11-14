import { DOC_PAGES } from "../../../docs/content";
import { docMarkdown, findDoc } from "../../../docs/markdown";

// Serves /docs.md and /docs/<slug>.md (rewritten here in next.config.ts).

export function generateStaticParams() {
  return DOC_PAGES.map((p) => ({ slug: p.slug ? [p.slug] : [] }));
}

export async function GET(_req: Request, { params }: RouteContext<"/md/docs/[[...slug]]">) {
  const { slug } = await params;
  const page = findDoc(slug?.join("/") ?? "");
  if (!page) return new Response("Not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(docMarkdown(page), {
    headers: { "content-type": "text/markdown; charset=utf-8", "x-robots-tag": "noindex" },
  });
}
