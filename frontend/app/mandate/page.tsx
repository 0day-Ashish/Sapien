import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/brand";
import { MandateComposer } from "./mandate-composer";

export const metadata: Metadata = { title: `Write your Mandate · ${PRODUCT_NAME}` };

// Full-screen app view: no site nav, the dashboard frame fills the window.
export default function MandatePage() {
  return (
    <main className="flex h-dvh flex-col bg-cream">
      <h1 className="sr-only">Write your Mandate</h1>
      <MandateComposer />
    </main>
  );
}
