import { PRODUCT_NAME } from "@/lib/brand";

/**
 * The Sapien mark: a geometric "S" made of two linked arcs, read both as the initial and as a
 * market curve, on a violet tile. The orange dot is the spark of the agent's decision.
 */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="9" fill="var(--color-violet, #6a4fd6)" />
      <path
        d="M21.2 8.4A5.8 5.8 0 1 0 16 16.2A5.8 5.8 0 1 1 10.8 24"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <circle cx="24.6" cy="7.4" r="2.3" fill="var(--color-orange, #c8561c)" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap text-violet ${className}`}>
      <LogoMark />
      <span className="text-[1.5rem] font-semibold leading-none tracking-[-0.045em] lowercase sm:text-[1.625rem]">
        {PRODUCT_NAME}
      </span>
    </span>
  );
}
