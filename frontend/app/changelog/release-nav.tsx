"use client";

import { useEffect, useState } from "react";

/** The releases rail: versions on a left rule; the release in view is marked as you scroll. */
export function ReleaseNav({ versions }: { versions: string[] }) {
  const [current, setCurrent] = useState(versions[0]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -65% 0px" },
    );
    versions.forEach((v) => {
      const el = document.getElementById(v);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [versions]);

  return (
    <nav aria-label="Releases">
      <p className="label-mono text-xs text-ink-faint">Releases</p>
      <ol className="mt-4 flex flex-col border-l border-line">
        {versions.map((v) => {
          const on = v === current;
          return (
            <li key={v}>
              <a
                href={`#${v}`}
                aria-current={on ? "location" : undefined}
                className={`relative -ml-px flex gap-3 border-l py-1.5 pl-4 text-[13px] leading-[18px] transition-colors duration-200 hover:text-ink ${
                  on ? "border-violet text-ink" : "border-transparent text-ink-soft"
                }`}
              >
                {v}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
