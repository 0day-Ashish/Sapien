import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { Logo } from "./logo";

const REPO = "https://github.com/0day-Ashish/hackmatrix-26";

const links = [
  { href: "/#protection", label: "Protection" },
  { href: "/#safeguards", label: "Safeguards" },
  { href: "/#builders", label: "Builders" },
  { href: REPO, label: "Docs", external: true },
  { href: `${REPO}/issues`, label: "Contact", external: true },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 px-3 pt-3 md:px-5 md:pt-3">
      <div className="mx-auto flex h-[3.875rem] max-w-[90rem] items-center justify-between gap-4 rounded-full bg-gradient-to-b from-white/85 to-cream/80 pl-5 pr-3 shadow-[0_10px_40px_-18px_rgb(58_42_134_/_0.28),0_0_0_1px_rgb(255_255_255_/_0.6)] backdrop-blur-xl backdrop-saturate-150 md:pl-7">
        <div className="flex items-center gap-11">
          <Link href="/" aria-label={`${PRODUCT_NAME} home`}>
            <Logo />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-9 text-[0.9375rem] font-medium text-violet xl:flex">
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
        <div className="flex items-center">
          <div className="mr-6 hidden items-center gap-11 text-[0.9375rem] font-medium text-violet md:flex">
            <Link href="/#protection" className="hover:text-violet-ink">
              Read the pitch
            </Link>
            <Link href="/mandate" className="hover:text-violet-ink">
              Write a Mandate
            </Link>
          </div>
          <Link href="/mandate" className="btn btn-primary">
            Launch app
          </Link>
          <Link
            href="/mandate"
            aria-label="Connect wallet"
            className="ml-2 hidden size-[2.375rem] items-center justify-center rounded-full bg-violet-soft text-violet transition-colors hover:bg-violet-line/60 sm:flex"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-4">
              <path
                d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5V8M4 7.5v9A2.5 2.5 0 0 0 6.5 19h12a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 18.5 8H6.5A2.5 2.5 0 0 1 4 7.5Z"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinejoin="round"
              />
              <circle cx="16" cy="13.5" r="1.3" fill="currentColor" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}
