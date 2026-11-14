import type { ReactNode } from "react";
import { RELEASES } from "@/app/changelog/releases";
import { intro as privacyIntro, sections as privacySections, title as privacyTitle } from "@/app/privacy/content";
import { intro as riskIntro, sections as riskSections, title as riskTitle } from "@/app/risk/content";
import { intro as termsIntro, sections as termsSections, title as termsTitle } from "@/app/terms/content";
import { LEGAL_UPDATED } from "@/app/legal/legal-page";
import { toMarkdown } from "./markdown";
import { SITE_URL, absoluteUrl, routeFor } from "./site";

// Markdown copies of the non-docs pages whose content is data: the legal pages and the changelog (/risk.md, /terms.md,
// /privacy.md, /changelog.md). The docs have their own in app/docs/markdown.ts.

type Legal = { title: string; intro: ReactNode; sections: { title: string; body: ReactNode }[] };

function legal(path: string, page: Legal): string {
  const parts = [`# ${page.title}`, `> ${routeFor(path).description}`, `Source: ${absoluteUrl(path)} · Last updated ${LEGAL_UPDATED}`, toMarkdown(page.intro, SITE_URL)];
  page.sections.forEach((s, i) => parts.push(`## ${i + 1}. ${s.title}`, toMarkdown(s.body, SITE_URL)));
  return parts.join("\n\n") + "\n";
}

function changelog(): string {
  const parts = ["# Changelog", `> ${routeFor("/changelog").description}`, `Source: ${absoluteUrl("/changelog")}`];
  for (const r of RELEASES) {
    parts.push(`## ${r.version} · ${r.date}`, r.summary);
    for (const [label, items] of [["New", r.added], ["Improved", r.improved], ["Fixed", r.fixed]] as const) {
      if (items.length) parts.push(`### ${label}`, items.map((it) => `- ${it.title ? `**${it.title}**: ` : ""}${it.body}`).join("\n"));
    }
    if (r.learnMore.length) parts.push(`Learn more: ${r.learnMore.map((l) => `[${l.label}](${l.href.startsWith("/") ? absoluteUrl(l.href) : l.href})`).join(", ")}`);
  }
  return parts.join("\n\n") + "\n";
}

export const PAGE_MARKDOWN: Record<string, () => string> = {
  risk: () => legal("/risk", { title: riskTitle, intro: riskIntro, sections: riskSections }),
  terms: () => legal("/terms", { title: termsTitle, intro: termsIntro, sections: termsSections }),
  privacy: () => legal("/privacy", { title: privacyTitle, intro: privacyIntro, sections: privacySections }),
  changelog,
};
