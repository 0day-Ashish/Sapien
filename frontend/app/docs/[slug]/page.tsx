import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PRODUCT_NAME } from "@/lib/brand";
import { DOC_PAGES } from "../content";
import { DocsShell } from "../docs-shell";

const find = (slug: string) => DOC_PAGES.find((p) => p.slug && p.slug === slug);

export function generateStaticParams() {
  return DOC_PAGES.filter((p) => p.slug).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/docs/[slug]">): Promise<Metadata> {
  const page = find((await params).slug);
  return { title: page ? `${page.nav} · ${PRODUCT_NAME} docs` : `Docs · ${PRODUCT_NAME}` };
}

export default async function DocPage({ params }: PageProps<"/docs/[slug]">) {
  const page = find((await params).slug);
  if (!page) notFound();
  return <DocsShell page={page} />;
}
