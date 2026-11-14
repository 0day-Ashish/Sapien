"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

export type SearchItem = { href: string; title: string; context: string; text: string };

/** The docs search box: filters pages and their sections as you type. ⌘K or Ctrl+K focuses it. */
export function DocsSearch({ items }: { items: SearchItem[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return items.filter((i) => !i.href.includes("#")).slice(0, 8);
    return items.filter((i) => words.every((w) => i.text.includes(w))).slice(0, 8);
  }, [items, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    input.current?.blur();
    window.location.assign(href);
  };

  return (
    <div ref={box} className="relative w-full max-w-xl">
      <label className="flex h-11 items-center gap-3 rounded-xl border border-line-strong bg-cream-raised/70 px-4 text-ink-soft transition-colors focus-within:border-violet">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-4 shrink-0">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          ref={input}
          type="search"
          value={query}
          placeholder="Search the docs..."
          aria-label="Search the docs"
          role="combobox"
          aria-expanded={open}
          aria-controls="docs-search-results"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && results[active]) {
              go(results[active].href);
            } else if (e.key === "Escape") {
              setOpen(false);
              input.current?.blur();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint [&::-webkit-search-cancel-button]:hidden"
        />
        <kbd className="hidden font-mono text-[12px] text-ink-faint sm:block">⌘K</kbd>
      </label>
      {open && (
        <ul id="docs-search-results" role="listbox" className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border border-line-strong bg-cream-raised p-1.5 shadow-card">
          {results.length === 0 && <li className="px-3 py-3 text-[14px] text-ink-soft">Nothing matches &ldquo;{query}&rdquo;.</li>}
          {results.map((r, i) => (
            <li key={r.href} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r.href)}
                className={`flex w-full items-baseline justify-between gap-4 rounded-lg px-3 py-2 text-left ${i === active ? "bg-violet-soft" : ""}`}
              >
                <span className="text-[14px] font-medium text-ink">{r.title}</span>
                <span className="shrink-0 text-[12px] text-ink-faint">{r.context}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "On this page": the section in view is marked as you scroll. */
export function DocToc({ items }: { items: { id: string; title: string }[] }) {
  const [current, setCurrent] = useState(items[0]?.id);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      { rootMargin: "-100px 0px -60% 0px" },
    );
    items.forEach((i) => {
      const el = document.getElementById(i.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label="On this page">
      <p className="text-[13px] font-medium text-ink">On this page</p>
      <ul className="mt-3 flex flex-col border-l border-line">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`#${item.id}`}
              aria-current={item.id === current ? "location" : undefined}
              className={`-ml-px block border-l py-1.5 pl-4 text-[13px] leading-snug transition-colors hover:text-ink ${
                item.id === current ? "border-violet text-violet" : "border-transparent text-ink-soft"
              }`}
            >
              {item.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
