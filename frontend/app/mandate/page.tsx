import type { Metadata } from "next";
import { MandateComposer } from "./mandate-composer";

export const metadata: Metadata = { title: "Write your Mandate · Agentic Perps Vault" };

export default function MandatePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Write your Mandate</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Describe your risk rules in plain English. You confirm or edit every field before you
          sign, and agents trade only inside what you sign.
        </p>
      </div>
      <MandateComposer />
    </main>
  );
}
