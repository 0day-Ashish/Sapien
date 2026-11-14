import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";

const REPO = "https://github.com/0day-Ashish/hackmatrix-26";

type FooterLink = { href: string; label: string; strong?: boolean; external?: boolean };

const columns: { title: string; groups: FooterLink[][] }[] = [
  {
    title: "Product",
    groups: [
      [
        { href: "/mandate", label: "Write a Mandate", strong: true },
        { href: "/#how-it-works", label: "How it works" },
        { href: "/#protection", label: "Protection" },
        { href: "/#control", label: "Control" },
      ],
    ],
  },
  {
    title: "Protocol",
    groups: [
      [
        { href: "/#safeguards", label: "Safeguards", strong: true },
        { href: "/#safeguards", label: "Veto Window" },
        { href: "/#safeguards", label: "Kill Switch" },
        { href: "/#safeguards", label: "Replay" },
      ],
    ],
  },
  {
    title: "Builders",
    groups: [
      [
        { href: "/#builders", label: "Bring an agent", strong: true },
        { href: "/#builders", label: "Bonds" },
        { href: "/#safeguards", label: "Leaderboard" },
      ],
    ],
  },
  {
    title: "Open source",
    groups: [
      [
        { href: REPO, label: "GitHub", strong: true, external: true },
        { href: `${REPO}/tree/main/docs/adr`, label: "Design decisions", external: true },
        { href: `${REPO}/blob/main/GLOSSARY.md`, label: "Glossary", external: true },
      ],
    ],
  },
  {
    title: "Risk",
    groups: [
      [
        { href: "/#protection", label: "Stop-loss protection", strong: true },
        { href: "/#protection", label: "Protection Fund" },
        { href: "/#protection", label: "Protocol Reserve" },
      ],
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="container-page pb-10 pt-24 text-violet">
      <div className="grid grid-cols-2 gap-x-8 gap-y-12 md:grid-cols-3 lg:grid-cols-5">
        {columns.map((column) => (
          <div key={column.title} className="flex flex-col gap-6">
            <p className="eyebrow !text-xs">{column.title}</p>
            {column.groups.map((group, i) => (
              <ul key={i} className="flex flex-col gap-2 text-[0.9375rem]">
                {group.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className={`hover:text-violet-ink ${link.strong ? "font-medium" : ""}`}
                    >
                      {link.label}
                      {link.external && <span aria-hidden="true"> ↗</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-20 flex flex-col items-start gap-4 text-[0.9375rem] md:flex-row md:items-center md:justify-between">
        <p className="font-medium">© 2026 {PRODUCT_NAME}</p>
        <p className="eyebrow rounded-full bg-violet-tint px-4 py-2 !text-[0.6875rem]">Testnet only · Not investment advice</p>
        <p className="font-medium">Stop-loss protected, never guaranteed</p>
      </div>
    </footer>
  );
}
