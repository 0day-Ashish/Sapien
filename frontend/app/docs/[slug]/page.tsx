import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/site";
import { DOC_PAGES } from "../content";
import { DocsShell } from "../docs-shell";
import { docMarkdownHref } from "../markdown";

const find = (slug: string) => DOC_PAGES.find((p) => p.slug && p.slug === slug);

export function generateStaticParams() {
  return DOC_PAGES.filter((p) => p.slug).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/docs/[slug]">): Promise<Metadata> {
  const page = find((await params).slug);
  if (!page) return { title: "Docs" };
  return pageMetadata({ title: `${page.nav} · Docs`, description: page.description, path: `/docs/${page.slug}`, markdown: docMarkdownHref(page.slug) });
}

export default async function DocPage({ params }: PageProps<"/docs/[slug]">) {
  const page = find((await params).slug);
  if (!page) notFound();
  return <DocsShell page={page} />;
}
