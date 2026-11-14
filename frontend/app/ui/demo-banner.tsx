import type { ReactNode } from "react";

/** Marks illustrative content, per the design rules: mock data is always labelled. */
export function DemoBanner({ children }: { children: ReactNode }) {
  return (
    <p role="note" className="flex flex-wrap items-center gap-2 rounded-xl border border-gold/40 bg-gold-soft/70 px-4 py-2.5 text-sm text-ink">
      <span className="chip chip-amber">Demo data</span>
      <span className="text-ink-soft">{children}</span>
    </p>
  );
}
