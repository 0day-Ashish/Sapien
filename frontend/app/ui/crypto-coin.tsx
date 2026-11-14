import { TOKEN_ICONS } from "./token-icons";

const FACES = [
  { icon: TOKEN_ICONS[0]!, fill: "#fbeccd", rim: "#a3690e", mark: "#c8561c" }, // Bitcoin on a gold coin
  { icon: TOKEN_ICONS[1]!, fill: "#ece7fb", rim: "#4b35a8", mark: "#6a4fd6" }, // Ethereum on a lavender coin
];

function Face({ face, back = false }: { face: (typeof FACES)[number]; back?: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={`absolute inset-0 size-full [backface-visibility:hidden] ${back ? "[transform:rotateY(180deg)]" : ""}`}
    >
      <circle cx="50" cy="50" r="46" fill={face.rim} />
      <circle cx="50" cy="50" r="42" fill={face.fill} stroke={face.rim} strokeWidth="2.5" />
      <circle cx="50" cy="50" r="34" fill="none" stroke={face.rim} strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="2 4" />
      {/* Token mark, scaled into the coin's middle */}
      <svg x="27" y="27" width="46" height="46" viewBox={face.icon.viewBox}>
        <path d={face.icon.d} fill={face.mark} />
      </svg>
      {/* Shine */}
      <path d="M24 34a30 30 0 0 1 22-16" fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A two-sided crypto coin (Bitcoin front, Ethereum back) that turns in 3D and floats. `busy` spins it
 * faster, for "thinking" states. Static for reduced motion.
 */
export function CryptoCoin({ className = "", busy = false }: { className?: string; busy?: boolean }) {
  return (
    <span aria-hidden="true" className={`coin-float relative inline-block [perspective:600px] ${className}`}>
      <span className={`relative block size-full [transform-style:preserve-3d] ${busy ? "coin-spin-fast" : "coin-spin"}`}>
        <Face face={FACES[0]!} />
        <Face face={FACES[1]!} back />
      </span>
    </span>
  );
}
