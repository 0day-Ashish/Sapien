import { PRODUCT_NAME } from "@/lib/brand";

/**
 * The Sapien mark: a bold "S" inside a ring, drawn as a single line in brand violet.
 * Uses currentColor, so it follows the text colour around it.
 */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <circle cx="16" cy="16" r="13.4" stroke="currentColor" strokeWidth="2.8" />
      <path
        d="M21.4 11.4a5.2 3.6 0 0 0-5.4-2.3c-3.1 0-5.4 1.5-5.4 3.5 0 4.8 10.8 2.1 10.8 6.9 0 2-2.4 3.5-5.4 3.5a5.6 3.8 0 0 1-5.7-2.5"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
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
