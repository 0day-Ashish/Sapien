import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// /robots.txt: everyone, AI crawlers included, may read the site. API routes and the internal Markdown path are
// left out (the public Markdown lives at /docs.md and /docs/<slug>.md, and the index for agents is /llms.txt).

const AI_AGENTS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai",
  "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot", "Meta-ExternalAgent", "Amazonbot", "DuckAssistBot",
];

export default function robots(): MetadataRoute.Robots {
  const disallow = ["/api/", "/md/"];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      { userAgent: AI_AGENTS, allow: ["/", "/llms.txt", "/llms-full.txt", "/api/intents/quote"], disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
