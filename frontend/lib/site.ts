import type { Metadata, MetadataRoute } from "next";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "./brand";

// One list of the site's public pages. Page metadata, sitemap.xml, robots.txt and llms.txt all read it, so a new page
// only needs an entry here.

/** The canonical origin. Set NEXT_PUBLIC_SITE_URL for another deployment. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://sapien-omega.vercel.app").replace(/\/$/, "");

export const SITE_DESCRIPTION =
  `${PRODUCT_NAME} is an arena where bonded AI agents trade perpetual futures on Hyperliquid for your Vault. ` +
  "Every trade must fit the Mandate you sign in plain English, the agent's own Bond pays first when a stop-loss slips, " +
  "and your NEAR account holds the controls: deposits, withdrawals, the Mandate hash and the Kill Switch. Testnet only.";

export const SITE_KEYWORDS = [
  "AI trading agents",
  "perpetual futures",
  "perps vault",
  "Hyperliquid",
  "HyperEVM",
  "NEAR",
  "NEAR Intents",
  "Meteor Wallet",
  "stop-loss protection",
  "agent bonds",
  "Mandate",
  "DeFi",
  "testnet",
];

export type SiteRoute = {
  path: string;
  /** The page title without the product suffix. */
  title: string;
  description: string;
  /** Where the page sits in llms.txt. */
  section: "Product" | "App" | "Transparency" | "Legal";
  priority: number;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  /** Needs a connected wallet to do anything; agents should use the documented APIs instead. */
  wallet?: boolean;
};

export const SITE_ROUTES: SiteRoute[] = [
  { path: "/", title: PRODUCT_NAME, description: SITE_DESCRIPTION, section: "Product", priority: 1, changeFrequency: "weekly" },
  { path: "/docs", title: "Docs", description: "The guide to Vaults, Mandates, agents, stop-loss protection, controls and verification.", section: "Product", priority: 0.9, changeFrequency: "weekly" },
  { path: "/changelog", title: "Changelog", description: "Every Sapien release, newest first.", section: "Product", priority: 0.5, changeFrequency: "weekly" },
  { path: "/contact", title: "Contact", description: "The team behind Sapien and how to reach them.", section: "Product", priority: 0.4, changeFrequency: "monthly" },
  { path: "/mandate", title: "Write your Mandate", description: "Write your trading rules in plain English, confirm every field, then commit the Mandate's hash from your NEAR account.", section: "App", priority: 0.8, changeFrequency: "weekly", wallet: true },
  { path: "/funds", title: "Deposit and withdraw", description: "Connect Meteor Wallet, get test USDC, create your Vault, deposit and withdraw through NEAR, see the NEAR Intents quote and use the Kill Switch.", section: "App", priority: 0.8, changeFrequency: "weekly", wallet: true },
  { path: "/builders", title: "Bonds", description: "Register a Specialist Agent and post its Bond so it can compete to lead Vaults.", section: "App", priority: 0.6, changeFrequency: "weekly", wallet: true },
  { path: "/live", title: "Live agents", description: "Each agent decision as it happens: market regime, Lead Agent, proposal, Mandate Check and result.", section: "Transparency", priority: 0.7, changeFrequency: "always" },
  { path: "/leaderboard", title: "Leaderboard", description: "Specialist Agents ranked by risk-adjusted return, with Bond size and the Vaults they lead.", section: "Transparency", priority: 0.7, changeFrequency: "hourly" },
  { path: "/replay", title: "Replay", description: "Step through any past decision; its hash is recomputed in your browser and checked against the onchain DecisionLog.", section: "Transparency", priority: 0.7, changeFrequency: "hourly" },
  { path: "/payouts", title: "Overshoot payouts", description: "Every Overshoot settlement with its evidence, and the Protection Fund's live Coverage Ratio.", section: "Transparency", priority: 0.6, changeFrequency: "daily" },
  { path: "/risk", title: "Risk Disclosure", description: "What can go wrong, what stop-loss protection does and doesn't cover, and what lives on NEAR.", section: "Legal", priority: 0.4, changeFrequency: "monthly" },
  { path: "/terms", title: "Terms of Use", description: "The terms for using Sapien on testnet.", section: "Legal", priority: 0.2, changeFrequency: "yearly" },
  { path: "/privacy", title: "Privacy Policy", description: "What Sapien stores and why.", section: "Legal", priority: 0.2, changeFrequency: "yearly" },
];

export const routeFor = (path: string) => {
  const r = SITE_ROUTES.find((x) => x.path === path);
  if (!r) throw new Error(`No SITE_ROUTES entry for ${path}`);
  return r;
};

export const absoluteUrl = (path: string) => `${SITE_URL}${path === "/" ? "" : path}`;

/** Full metadata for one page: title, description, canonical, Open Graph and Twitter card. */
export function pageMetadata(
  input: { title: string; description: string; path: string; markdown?: string; noIndex?: boolean },
): Metadata {
  const title = input.path === "/" ? `${PRODUCT_NAME}: ${PRODUCT_TAGLINE}` : `${input.title} · ${PRODUCT_NAME}`;
  // Named explicitly: pages with generated metadata don't inherit app/opengraph-image.tsx.
  const image = { url: "/opengraph-image", width: 1200, height: 630, alt: `${PRODUCT_NAME}: ${PRODUCT_TAGLINE}` };
  return {
    title,
    description: input.description,
    alternates: {
      canonical: input.path,
      ...(input.markdown ? { types: { "text/markdown": input.markdown } } : {}),
    },
    openGraph: {
      type: "website",
      siteName: PRODUCT_NAME,
      url: input.path,
      title,
      description: input.description,
      locale: "en_US",
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description: input.description, images: [image] },
    ...(input.noIndex ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Metadata for a page listed in SITE_ROUTES. */
export const routeMetadata = (path: string) => {
  const r = routeFor(path);
  return pageMetadata({ title: r.title, description: r.description, path: r.path });
};
