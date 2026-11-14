import type { NextConfig } from "next";

// An agent that asks for Markdown (Accept: text/markdown) gets the Markdown copy of a docs page at the same URL. The
// rewrite runs before any cache lookup, and the cache keys on the rewritten path, so HTML and Markdown never mix.
const wantsMarkdown = [{ type: "header" as const, key: "accept", value: ".*text/markdown.*" }];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/docs", has: wantsMarkdown, destination: "/md/docs" },
        { source: "/docs/:slug", has: wantsMarkdown, destination: "/md/docs/:slug" },
      ],
      afterFiles: [
        // Markdown copies of the docs for agents: /docs.md and /docs/<slug>.md.
        { source: "/docs.md", destination: "/md/docs" },
        { source: "/docs/:slug.md", destination: "/md/docs/:slug" },
      ],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        // Every response points agents at the site index and the API description (RFC 8288 links, RFC 8631 service-desc).
        source: "/:path*",
        headers: [
          {
            key: "Link",
            value: '</llms.txt>; rel="describedby"; type="text/plain", </openapi.json>; rel="service-desc"; type="application/openapi+json", </.well-known/api-catalog>; rel="api-catalog"',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
