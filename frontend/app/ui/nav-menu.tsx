"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type NavLink = { href: string; label: string; external?: boolean };

/**
 * The site nav on small screens: a hamburger button that opens the links as a panel under the bar.
 * Closes on a link, on Escape, on a tap outside, and when the window grows wide enough to show the links inline.
 */
export function NavMenu({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const wide = window.matchMedia("(min-width: 80rem)");
    const onWide = () => wide.matches && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    wide.addEventListener("change", onWide);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <div ref={root} className="xl:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="site-menu"
        onClick={() => setOpen((o) => !o)}
        className="flex size-11 items-center justify-center rounded-full text-violet transition-colors hover:bg-violet-tint"
      >
        {/* Three bars that fold into a cross */}
        <span aria-hidden="true" className="relative block h-3.5 w-5">
          <span className={`absolute inset-x-0 h-0.5 rounded-full bg-current transition-all duration-300 ${open ? "top-1.5 rotate-45" : "top-0"}`} />
          <span className={`absolute inset-x-0 top-1.5 h-0.5 rounded-full bg-current transition-opacity duration-200 ${open ? "opacity-0" : "opacity-100"}`} />
          <span className={`absolute inset-x-0 h-0.5 rounded-full bg-current transition-all duration-300 ${open ? "top-1.5 -rotate-45" : "top-3"}`} />
        </span>
      </button>

      <nav
        id="site-menu"
        aria-label="Main"
        inert={!open}
        className={`absolute inset-x-3 top-[calc(100%+0.5rem)] origin-top rounded-[1.75rem] bg-[#fbf8f4] p-3 shadow-[0_24px_48px_-20px_rgb(58_42_134_/_0.45)] ring-1 ring-violet-line transition-all duration-200 ease-out md:inset-x-5 ${
          open ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none -translate-y-2 scale-[0.98] opacity-0"
        }`}
      >
        <ul className="flex flex-col">
          {links.map((link) => (
            <li key={link.label} className="border-b border-violet-line/60 last:border-b-0">
              <Link
                href={link.href}
                {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-2xl px-4 py-3.5 text-[1.125rem] text-violet transition-colors hover:bg-violet-tint"
              >
                {link.label}
                <span aria-hidden="true" className="text-violet/50">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {/* Only where the bar has no room for it. */}
        <Link href="/mandate" onClick={() => setOpen(false)} className="btn btn-primary mt-3 w-full !min-h-12 min-[26rem]:hidden">
          Launch app
        </Link>
      </nav>
    </div>
  );
}
