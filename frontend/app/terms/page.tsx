import type { Metadata } from "next";
import { routeMetadata } from "@/lib/site";
import { LegalPage } from "../legal/legal-page";
import { intro, sections, title } from "./content";

export const metadata: Metadata = routeMetadata("/terms");

export default function TermsPage() {
  return <LegalPage current="/terms" eyebrow="Legal" title={title} intro={intro} sections={sections} />;
}
