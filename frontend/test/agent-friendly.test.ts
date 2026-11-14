import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement as h, Fragment, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { toMarkdown } from "../lib/markdown";
import { SITE_ROUTES, absoluteUrl, pageMetadata } from "../lib/site";

const BASE = "https://example.test";

describe("toMarkdown", () => {
  it("turns paragraphs, lists and emphasis into Markdown", () => {
    const md = toMarkdown(
      h(Fragment, null, h("p", null, "A ", h("strong", null, "Vault"), " holds capital."), h("ul", null, h("li", null, "one"), h("li", null, "two"))),
      BASE,
    );
    expect(md).toBe("A **Vault** holds capital.\n\n- one\n- two");
  });

  it("makes site links absolute and drops decorative parts", () => {
    const md = toMarkdown(
      h("p", null, h("span", { "aria-hidden": "true" }, "★"), "Read the ", h("a", { href: "/risk" }, "Risk Disclosure"), h("svg", null), "."),
      BASE,
    );
    expect(md).toBe("Read the [Risk Disclosure](https://example.test/risk).");
  });

  it("keeps one link when a component renders its own anchor", () => {
    const Card = ({ href, title }: { href: string; title: string }): ReactNode => h("a", { href }, h("span", null, title));
    expect(toMarkdown(h(Card, { href: "/docs/quickstart", title: "Quickstart" }), BASE)).toBe("[Quickstart](https://example.test/docs/quickstart)");
  });

  it("falls back to children and href for components that can't run outside React", () => {
    const Hooked = (): ReactNode => {
      throw new Error("hooks");
    };
    expect(toMarkdown(h(Hooked, { href: "/funds" } as object, "Funds"), BASE)).toBe("[Funds](https://example.test/funds)");
  });
});

describe("site routes", () => {
  // Every page.tsx outside dynamic segments should be listed, so the sitemap and llms.txt don't miss it.
  const pages = (dir: string, prefix = ""): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (!statSync(full).isDirectory()) return name === "page.tsx" ? [prefix || "/"] : [];
      if (name.startsWith("[") || name.startsWith("(") || name.startsWith("_") || name === "api" || name === "md") return [];
      return pages(full, `${prefix}/${name}`);
    });

  it("lists every static page", () => {
    const listed = new Set(SITE_ROUTES.map((r) => r.path));
    expect(pages(join(__dirname, "../app")).filter((p) => !listed.has(p))).toEqual([]);
  });

  it("uses each listed page's metadata", () => {
    for (const r of SITE_ROUTES.filter((x) => x.path !== "/")) {
      const src = readFileSync(join(__dirname, "../app", r.path, "page.tsx"), "utf8");
      expect(src, r.path).toMatch(/routeMetadata|routeFor/);
    }
  });

  it("builds canonical, Open Graph and Markdown alternates", () => {
    const m = pageMetadata({ title: "Docs", description: "d", path: "/docs", markdown: "/docs.md" });
    expect(m.title).toBe("Docs · Sapien");
    expect(m.alternates).toEqual({ canonical: "/docs", types: { "text/plain": "/llms.txt", "text/markdown": "/docs.md" } });
    expect(absoluteUrl("/")).not.toMatch(/\/$/);
  });
});

describe("public API", () => {
  it("has a route file for every OpenAPI path", async () => {
    const { openApi } = await import("../lib/openapi");
    const { existsSync } = await import("node:fs");
    for (const path of Object.keys(openApi().paths)) {
      const dir = path.replace(/\{(\w+)\}/g, "[$1]");
      expect(existsSync(join(__dirname, "../app", dir, "route.ts")), path).toBe(true);
    }
  });

  it("validates ids before calling out", async () => {
    const { isBytes32, isEvmAddress, isNearAccount } = await import("../lib/api");
    expect(isEvmAddress("0xB80e19cf8d85E1996b14DC95E7B6B9B716E074ED")).toBe(true);
    expect(isEvmAddress("0x123")).toBe(false);
    expect(isBytes32(`0x${"ab".repeat(32)}`)).toBe(true);
    expect(isBytes32("0xab")).toBe(false);
    expect(isNearAccount("e2e.sapien-vault.testnet")).toBe(true);
    expect(isNearAccount("Bad Account")).toBe(false);
    expect(isNearAccount("../etc")).toBe(false);
  });

  it("sends bigints as strings, open to any origin", async () => {
    const { json } = await import("../lib/api");
    const res = json({ n: BigInt("12345678901234567890") });
    expect(await res.json()).toEqual({ n: "12345678901234567890" });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("preview image", () => {
  it("inlines the same icon as app/icon.svg", () => {
    const icon = readFileSync(join(__dirname, "../app/icon.svg"), "utf8").trim();
    expect(readFileSync(join(__dirname, "../app/opengraph-image.tsx"), "utf8")).toContain(icon);
  });
});
