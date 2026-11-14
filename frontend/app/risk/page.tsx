import type { Metadata } from "next";
import { routeMetadata } from "@/lib/site";
import { LegalPage } from "../legal/legal-page";
import { intro, sections, title } from "./content";

export const metadata: Metadata = routeMetadata("/risk");

export default function RiskPage() {
  return <LegalPage current="/risk" eyebrow="Legal" title={title} intro={intro} sections={sections} />;
}
