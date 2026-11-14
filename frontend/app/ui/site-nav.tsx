import Link from "next/link";
import { Logo } from "./logo";

const links = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#protection", label: "Protection" },
  { href: "/#control", label: "Control" },
  { href: "/#builders", label: "Builders" },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-3">
        <Link href="/" aria-label="Home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-8 text-[0.9375rem] text-ink-soft lg:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-ink">
              {link.label}
            </Link>
          ))}
        </nav>
        <Link href="/mandate" className="btn btn-primary">
          Launch app
        </Link>
      </div>
    </header>
  );
}
