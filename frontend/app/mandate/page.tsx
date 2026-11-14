import type { Metadata } from "next";
import { routeMetadata } from "@/lib/site";
import { MandateComposer } from "./mandate-composer";

export const metadata: Metadata = routeMetadata("/mandate");

// Full-screen app view: no site nav, the dashboard frame fills the window.
export default function MandatePage() {
  return (
    <main className="flex h-dvh flex-col bg-cream">
      <h1 className="sr-only">Write your Mandate</h1>
      <MandateComposer />
    </main>
  );
}
