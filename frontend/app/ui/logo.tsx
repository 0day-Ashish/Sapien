import { useId } from "react";
import { PRODUCT_NAME } from "@/lib/brand";

// The crossing arcs each ring is cut back around, so the other ring passes over it there.
const LEFT_OVER = "M26.21 28.00A10.5 10.5 0 0 1 20.70 33.62";
const RIGHT_OVER = "M21.79 20.00A10.5 10.5 0 0 1 27.30 14.38";

/**
 * The Sapien mark: two linked rings, a Vault and a bonded agent. Each passes over the other once.
 * The left ring uses currentColor; `accent` colours the right ring (pink by default, pass
 * "currentColor" for a one-colour mark). The gaps are masks, so it sits on any background.
 */
export function LogoMark({ className = "h-7 w-auto", accent = "var(--color-pink)" }: { className?: string; accent?: string }) {
  const id = useId();
  return (
    <svg viewBox="3 10.5 42 27" fill="none" aria-hidden="true" className={className}>
      <defs>
        <mask id={`${id}l`} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="#fff" />
          <path d={RIGHT_OVER} stroke="#000" strokeWidth="8" />
        </mask>
        <mask id={`${id}r`} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="#fff" />
          <path d={LEFT_OVER} stroke="#000" strokeWidth="8" />
        </mask>
      </defs>
      <circle cx="16.5" cy="24" r="10.5" stroke="currentColor" strokeWidth="5" mask={`url(#${id}l)`} />
      <circle cx="31.5" cy="24" r="10.5" stroke={accent} strokeWidth="5" mask={`url(#${id}r)`} />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap text-violet ${className}`}>
      <LogoMark />
      <span className="text-[1.5rem] font-medium leading-none tracking-[-0.045em] lowercase sm:text-[1.625rem]">
        {PRODUCT_NAME}
      </span>
    </span>
  );
}
