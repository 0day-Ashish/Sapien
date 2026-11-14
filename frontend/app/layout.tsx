import type { Metadata, Viewport } from "next";
import { Geist_Mono, Instrument_Sans, Newsreader } from "next/font/google";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_URL, absoluteUrl } from "@/lib/site";
import "./globals.css";
import { Providers } from "./providers";
import { SmoothScroll } from "./ui/smooth-scroll";
import { VetoBanner } from "./ui/veto-banner";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  axes: ["opsz"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${PRODUCT_NAME}: ${PRODUCT_TAGLINE}`,
  description: SITE_DESCRIPTION,
  applicationName: PRODUCT_NAME,
  keywords: SITE_KEYWORDS,
  category: "finance",
  creator: PRODUCT_NAME,
  publisher: PRODUCT_NAME,
  authors: [
    { name: "Ashish", url: "https://github.com/0day-Ashish" },
    { name: "Aryadeep", url: "https://github.com/arya232006" },
    { name: "Sachindra", url: "https://github.com/SachPlayZ" },
  ],
  // No canonical here: it would be inherited by pages that don't set their own.
  alternates: { types: { "text/plain": "/llms.txt" } },
  openGraph: {
    type: "website",
    siteName: PRODUCT_NAME,
    title: `${PRODUCT_NAME}: ${PRODUCT_TAGLINE}`,
    description: SITE_DESCRIPTION,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: `${PRODUCT_NAME}: ${PRODUCT_TAGLINE}`, description: SITE_DESCRIPTION },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  themeColor: "#FBF8F3",
  colorScheme: "light",
};

// Structured data so search engines and agents can read what the site is without running it.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: PRODUCT_NAME,
      url: SITE_URL,
      logo: absoluteUrl("/brand/sapien-logo.svg"),
      sameAs: ["https://github.com/SachPlayZ/Sapien"],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#site`,
      name: PRODUCT_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#org` },
      inLanguage: "en",
    },
    {
      "@type": "WebApplication",
      name: PRODUCT_NAME,
      url: absoluteUrl("/mandate"),
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      description: PRODUCT_TAGLINE,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": `${SITE_URL}/#org` },
    },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${newsreader.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-dvh flex flex-col">
        <script
          type="application/ld+json"
          // Static, built from constants above: no user input reaches it.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }}
        />
        <SmoothScroll />
        <Providers>
          {children}
          <VetoBanner />
        </Providers>
      </body>
    </html>
  );
}
