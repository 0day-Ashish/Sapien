import { ImageResponse } from "next/og";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";

// The link preview card for every page (Open Graph and Twitter), built once at build time.

export const alt = `${PRODUCT_NAME}: ${PRODUCT_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// app/icon.svg, inlined so the image needs no file read at request time (serverless bundles may not include it).
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="12" fill="#6a4fd6"/><defs><mask id="il" maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48"><rect width="48" height="48" fill="#fff"/><path d="M21.79 20.00A10.5 10.5 0 0 1 27.30 14.38" stroke="#000" stroke-width="8"/></mask><mask id="ir" maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48"><rect width="48" height="48" fill="#fff"/><path d="M26.21 28.00A10.5 10.5 0 0 1 20.70 33.62" stroke="#000" stroke-width="8"/></mask></defs><g transform="translate(24 24) scale(0.92) translate(-24 -24)"><circle cx="16.5" cy="24" r="10.5" stroke="#fff" stroke-width="5" mask="url(#il)"/><circle cx="31.5" cy="24" r="10.5" stroke="#ffb8d6" stroke-width="5" mask="url(#ir)"/></g></svg>`;

export default function OpengraphImage() {
  const src = `data:image/svg+xml;base64,${Buffer.from(ICON_SVG).toString("base64")}`;
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
