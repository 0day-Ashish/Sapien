import type { Metadata } from "next";
import { routeMetadata } from "@/lib/site";
import { LegalPage } from "../legal/legal-page";
import { intro, sections, title } from "./content";

export const metadata: Metadata = routeMetadata("/privacy");

export default function PrivacyPage() {
  return <LegalPage current="/privacy" eyebrow="Legal" title={title} intro={intro} sections={sections} />;
}
