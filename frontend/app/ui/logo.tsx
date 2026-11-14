import { PRODUCT_NAME } from "@/lib/brand";

/**
 * The mark: a Vault dial (the ring, open at the top right where the bolt slides) holding a
 * check stroke, for "checked before it trades". Drawn in currentColor so it works on paper and night.
 */
export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <path
        d="M27.2 10.2A13 13 0 1 1 21.8 4.8"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M10.4 16.6l4 4.2 8.4-10"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="26" cy="5.6" r="1.9" fill="var(--color-forest)" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap ${className}`}>
      <LogoMark />
      <span className="font-display text-lg leading-none sm:text-[1.3125rem] tracking-[-0.01em]">{PRODUCT_NAME}</span>
    </span>
  );
}
