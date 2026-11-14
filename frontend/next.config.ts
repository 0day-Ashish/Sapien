import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Markdown copies of the docs for agents: /docs.md and /docs/<slug>.md.
  async rewrites() {
    return [
      { source: "/docs.md", destination: "/md/docs" },
      { source: "/docs/:slug.md", destination: "/md/docs/:slug" },
    ];
  },
};

export default nextConfig;
