import type { MetadataRoute } from "next";
import { SITE_ROUTES, absoluteUrl } from "@/lib/site";
import { DOC_PAGES, docHref } from "./docs/content";

// /sitemap.xml: every public page plus each docs page.

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = SITE_ROUTES.map((r) => ({ url: absoluteUrl(r.path), changeFrequency: r.changeFrequency, priority: r.priority }));
  const docs = DOC_PAGES.filter((p) => p.slug).map((p) => ({
    url: absoluteUrl(docHref(p.slug)),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));
  return [...pages, ...docs];
}
