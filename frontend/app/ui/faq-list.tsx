"use client";

import { useState, type ReactNode } from "react";

/**
 * The FAQ accordion. Answers stay in the page and slide open: the row animates from 0fr to 1fr, which a native
 * <details> element can't do in every browser.
 */
export function FaqList({ items }: { items: { q: string; a: ReactNode }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="border-t border-violet-line">
      {items.map((f, i) => {
        const on = open === i;
        return (
          <div key={f.q} className="border-b border-violet-line">
            <h3>
              <button
                type="button"
                id={`faq-q-${i}`}
                aria-expanded={on}
                aria-controls={`faq-a-${i}`}
                onClick={() => setOpen(on ? null : i)}
                className="flex w-full cursor-pointer items-center justify-between gap-6 py-5 text-left text-[1.1875rem] font-medium text-violet-ink transition-colors hover:text-violet"
              >
                {f.q}
                <span
                  aria-hidden="true"
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full border border-violet-line text-violet transition-all duration-300 ease-out ${on ? "rotate-45 bg-violet-soft" : ""}`}
                >
                  <svg viewBox="0 0 24 24" fill="none" className="size-4">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
              </button>
            </h3>
            <div
              id={`faq-a-${i}`}
              role="region"
              aria-labelledby={`faq-q-${i}`}
              inert={!on}
              className={`grid transition-[grid-template-rows,opacity] duration-[400ms] ease-[cubic-bezier(0.3,0.7,0.2,1)] motion-reduce:transition-none ${
                on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                <p className="max-w-2xl pb-6 pr-12 text-[1.0625rem] leading-relaxed text-ink-soft [&_a]:text-violet [&_a]:underline [&_a]:decoration-violet/30 [&_a]:underline-offset-[3px]">
                  {f.a}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
