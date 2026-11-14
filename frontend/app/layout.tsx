import type { Metadata } from "next";
import { Geist_Mono, Instrument_Sans, Newsreader } from "next/font/google";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
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
  title: PRODUCT_NAME,
  description: PRODUCT_TAGLINE,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${newsreader.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-dvh flex flex-col">
        <SmoothScroll />
        <Providers>
          {children}
          <VetoBanner />
        </Providers>
      </body>
    </html>
  );
}
