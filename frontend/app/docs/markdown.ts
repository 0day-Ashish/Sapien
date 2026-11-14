import { toMarkdown } from "@/lib/markdown";
import { SITE_URL, absoluteUrl } from "@/lib/site";
import { DOC_PAGES, docHref, type DocPage } from "./content";

// The docs as Markdown, for agents: /docs.md, /docs/<slug>.md and /llms-full.txt.

export const docMarkdownHref = (slug: string) => `${docHref(slug)}.md`;

export function docMarkdown(page: DocPage): string {
  const parts = [`# ${page.title}`, `> ${page.description}`, `Source: ${absoluteUrl(docHref(page.slug))}`];
  for (const s of page.sections) parts.push(`## ${s.title}`, toMarkdown(s.body, SITE_URL));
  return parts.join("\n\n") + "\n";
}

export const findDoc = (slug: string) => DOC_PAGES.find((p) => p.slug === slug);
