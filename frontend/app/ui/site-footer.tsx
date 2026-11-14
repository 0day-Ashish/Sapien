import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { Logo } from "./logo";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#protection", label: "Protection" },
      { href: "/#control", label: "Control" },
    ],
  },
  {
    title: "App",
    links: [
      { href: "/mandate", label: "Write your Mandate" },
      { href: "/#builders", label: "For Builders" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-night text-on-night">
      <div className="container-page grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <Logo />
          <p className="max-w-sm text-[0.9375rem] text-on-night-soft">
            Bonded AI agents trade your Hyperliquid Vault under a Mandate you sign. Stop-loss protected.
          </p>
        </div>
        {columns.map((column) => (
          <div key={column.title} className="flex flex-col gap-3">
            <p className="eyebrow !text-on-night-soft">{column.title}</p>
            {column.links.map((link) => (
              <Link key={link.href} href={link.href} className="text-[0.9375rem] hover:underline">
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-2 py-6 text-[0.8125rem] text-on-night-soft md:flex-row md:justify-between">
          <p>{PRODUCT_NAME} runs on testnets only. Nothing here is investment advice.</p>
          <p>Stop-loss protection covers Overshoot up to stated limits. It is not a guarantee against loss.</p>
        </div>
      </div>
    </footer>
  );
}
