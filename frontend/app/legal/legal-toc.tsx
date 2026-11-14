"use client";

import { useEffect, useState } from "react";

type Item = { id: string; title: string };

const num = (i: number) => String(i + 1).padStart(2, "0");

/** "On this page": a numbered list on a left rule; the section in view is marked as you scroll. */
export function LegalToc({ items }: { items: Item[] }) {
  const [current, setCurrent] = useState(items[0]?.id);

  useEffect(() => {
    const sections = items.map((i) => document.getElementById(i.id)).filter((el): el is HTMLElement => !!el);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      // A band near the top of the viewport: the section crossing it is the one being read.
      { rootMargin: "-96px 0px -65% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label="On this page">
      <p className="label-mono text-xs text-ink-faint">On this page</p>
      <ol className="mt-4 flex flex-col border-l border-line">
        {items.map((item, i) => {
          const on = item.id === current;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={on ? "location" : undefined}
                className={`relative -ml-px flex gap-3 border-l py-1.5 pl-4 text-[13px] leading-[18px] transition-colors duration-200 hover:text-ink ${
                  on ? "border-violet text-ink" : "border-transparent text-ink-soft"
                }`}
              >
                <span className="w-4 shrink-0 font-mono text-[11px] leading-[18px] text-ink-faint">{num(i)}</span>
                {item.title}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
