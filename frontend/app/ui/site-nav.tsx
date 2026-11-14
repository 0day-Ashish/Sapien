import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { Logo } from "./logo";
import { NavWallet } from "./nav-wallet";

const REPO = "https://github.com/0day-Ashish/hackmatrix-26";

const links = [
  { href: "/blog", label: "Blog" },
  { href: REPO, label: "Docs", external: true },
  { href: `${REPO}/pulls?q=is%3Apr+is%3Amerged`, label: "Changelog", external: true },
  { href: `${REPO}/issues`, label: "Contact", external: true },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 px-3 pt-3 md:px-5">
      {/* Blurred fade behind the bar: content scrolling up softens before it reaches the nav. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-28 bg-gradient-to-b from-cream via-cream/70 to-transparent backdrop-blur-md [mask-image:linear-gradient(to_bottom,#000_45%,transparent)]"
      />
      <div className="mx-auto flex h-[3.875rem] max-w-[90rem] items-center justify-between gap-4 rounded-full bg-[#fbf8f4]/90 pl-5 pr-3 shadow-[0_12px_32px_-20px_rgb(58_42_134_/_0.35)] backdrop-blur-2xl backdrop-saturate-150 md:pl-7">
        <div className="flex items-center gap-11">
          <Link href="/" aria-label={`${PRODUCT_NAME} home`}>
            <Logo />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-9 text-[0.9375rem] font-normal text-violet xl:flex">
            {links.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="transition-colors hover:text-violet-ink"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <NavWallet />
          <Link href="/mandate" className="btn btn-primary">
            Chat
          </Link>
        </div>
      </div>
    </header>
  );
}
