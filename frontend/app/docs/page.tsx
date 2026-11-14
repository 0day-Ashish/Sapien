import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/brand";
import { DOC_PAGES } from "./content";
import { DocsShell } from "./docs-shell";

export const metadata: Metadata = { title: `Docs · ${PRODUCT_NAME}` };

export default function DocsHome() {
  return <DocsShell page={DOC_PAGES[0]!} />;
}
