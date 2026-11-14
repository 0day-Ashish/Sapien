import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// /robots.txt: everyone, AI crawlers included, may read the site and the public API. The app's own API routes and the
// internal Markdown path are left out (the public Markdown lives at /docs.md and /docs/<slug>.md).

const AI_AGENTS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai",
  "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot", "Meta-ExternalAgent", "Amazonbot", "DuckAssistBot",
];

export default function robots(): MetadataRoute.Robots {
  // /api/v1 is the public read-only API (see /openapi.json); other API routes are the app's own.
  const allow = ["/", "/api/v1/", "/api/intents/quote", "/openapi.json", "/llms.txt", "/llms-full.txt"];
  const disallow = ["/api/", "/md/"];
  return {
    rules: [
      { userAgent: "*", allow, disallow },
      { userAgent: AI_AGENTS, allow, disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
