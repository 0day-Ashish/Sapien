import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";

// The link preview card for every page (Open Graph and Twitter), built once at build time.

export const alt = `${PRODUCT_NAME}: ${PRODUCT_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const icon = await readFile(join(process.cwd(), "app/icon.svg"), "utf8");
  const src = `data:image/svg+xml;base64,${Buffer.from(icon).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#FBF8F3", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <img src={src} width={72} height={72} alt="" />
          <span style={{ fontSize: 44, fontWeight: 600, color: "#3A2A86" }}>{PRODUCT_NAME}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 68, fontWeight: 600, lineHeight: 1.08, letterSpacing: -2, color: "#6A4FD6" }}>
            <span>AI agents can trade your perps.</span>
            <span style={{ color: "#C23F7D" }}>Make them put their money first.</span>
          </div>
          <span style={{ fontSize: 30, color: "#4D4766" }}>Bonded agents · Signed Mandates · Hyperliquid + NEAR</span>
        </div>
      </div>
    ),
    size,
  );
}
