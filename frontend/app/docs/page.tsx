import type { Metadata } from "next";
import { pageMetadata, routeFor } from "@/lib/site";
import { DOC_PAGES } from "./content";
import { DocsShell } from "./docs-shell";

const route = routeFor("/docs");
export const metadata: Metadata = pageMetadata({ ...route, markdown: "/docs.md" });

export default function DocsHome() {
  return <DocsShell page={DOC_PAGES[0]!} />;
}
