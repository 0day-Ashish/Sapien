// Original decorative art for the marketing pages: clusters of candlesticks and coins, and a
// small vault-safe mascot. Everything is drawn here as SVG in the brand colours; coin faces carry
// real token logos (see token-icons.ts), tinted to match.

import { TOKEN_ICONS } from "./token-icons";

const PALETTE = [
  { fill: "#ece7fb", stroke: "#6a4fd6" },
  { fill: "#ffe3d0", stroke: "#c8561c" },
  { fill: "#e0f0e9", stroke: "#17805a" },
  { fill: "#fde4ef", stroke: "#d4508e" },
  { fill: "#e3ecfa", stroke: "#3d6fc4" },
  { fill: "#fbeccd", stroke: "#a3690e" },
  { fill: "#dcf1ef", stroke: "#0e7f7a" },
];

/** Small deterministic random generator, so server and client render the same art. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Shape = "mound" | "band" | "spray" | "heap";

type Piece =
  | { kind: "candle"; x: number; y: number; w: number; h: number; wick: number; c: number; rot: number }
  | { kind: "coin"; x: number; y: number; r: number; c: number; stack: number; logo: number }
  | { kind: "ring"; x: number; y: number; r: number; c: number; logo: number }
  | { kind: "spark"; x: number; y: number; r: number; c: number };

function cluster(seed: number, width: number, height: number, count: number, shape: Shape): Piece[] {
  const rand = random(seed);
  // Logos come from their own stream so adding them doesn't reshuffle the layout.
  const pickLogo = random(seed * 131 + 17);
  const pieces: Piece[] = [];
  for (let i = 0; i < count; i++) {
    const u = rand();
    let x = rand() * width;
    let y: number;
    if (shape === "mound") {
      // Taller in the middle, like a heap.
      const centre = 1 - Math.abs(x / width - 0.5) * 2;
      y = height - rand() * height * (0.25 + 0.75 * centre);
    } else if (shape === "heap") {
      // A broad, fairly level heap: a gently rolling top edge, packed tighter towards the bottom.
      const roll = 0.18 + 0.1 * Math.sin((x / width) * Math.PI * 3.2) + 0.06 * Math.sin((x / width) * Math.PI * 7.5);
      const edge = (1 - Math.pow(x / width, 6)) * (1 - roll);
      y = height - Math.pow(rand(), 0.7) * height * edge;
    } else if (shape === "spray") {
      y = rand() * height;
      x = width - Math.pow(rand(), 1.6) * width;
    } else {
      y = height * (0.15 + rand() * 0.85);
    }
    const c = Math.floor(rand() * PALETTE.length);
    if (u < 0.45) {
      const h = 26 + rand() * 54;
      pieces.push({ kind: "candle", x, y, w: 11 + rand() * 9, h, wick: 8 + rand() * 14, c, rot: (rand() - 0.5) * 50 });
    } else if (u < 0.75) {
      pieces.push({ kind: "coin", x, y, r: 12 + rand() * 16, c, stack: 1 + Math.floor(rand() * 3), logo: Math.floor(pickLogo() * TOKEN_ICONS.length) });
    } else if (u < 0.9) {
      pieces.push({ kind: "ring", x, y, r: 13 + rand() * 16, c, logo: Math.floor(pickLogo() * TOKEN_ICONS.length) });
    } else {
      pieces.push({ kind: "spark", x, y, r: 7 + rand() * 9, c });
    }
  }
  return pieces.sort((a, b) => a.y - b.y);
}

/** A token logo fitted into a `size` box centred on (cx, cy); `squash` flattens it onto a tilted coin. */
function TokenLogo({ logo, cx, cy, size, fill, squash = 1 }: { logo: number; cx: number; cy: number; size: number; fill: string; squash?: number }) {
  const icon = TOKEN_ICONS[logo]!;
  const [vx, vy, vw, vh] = icon.viewBox.split(" ").map(Number) as [number, number, number, number];
  const k = size / Math.max(vw, vh);
  const tx = cx - (vx + vw / 2) * k;
  const ty = cy - (vy + vh / 2) * k * squash;
  return (
    <path
      d={icon.d}
      fill={fill}
      fillRule="evenodd"
      transform={`translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(4)} ${(k * squash).toFixed(4)})`}
    />
  );
}

function PieceSvg({ piece }: { piece: Piece }) {
  const { fill, stroke } = PALETTE[piece.c]!;
  const common = { fill, stroke, strokeWidth: 2 };
  switch (piece.kind) {
    case "candle": {
      const { x, y, w, h, wick, rot } = piece;
      const top = y - h / 2;
      const bottom = y + h / 2;
      const left = x - w / 2;
      // Alternate solid "up" candles and hollow "down" candles, fixed per position.
      const up = Math.round(x * 7 + y * 3) % 2 === 0;
      const upperWick = wick * (up ? 1 : 0.6);
      const lowerWick = wick * (up ? 0.6 : 1);
      return (
        <g transform={`rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})`} strokeLinecap="round" strokeLinejoin="round">
          {/* Wicks stop at the body, with small caps */}
          <path
            d={`M${x} ${top}V${top - upperWick}M${x - 2.5} ${top - upperWick}H${x + 2.5}M${x} ${bottom}V${bottom + lowerWick}M${x - 2.5} ${bottom + lowerWick}H${x + 2.5}`}
            fill="none"
            stroke={stroke}
            strokeWidth={1.8}
          />
          {/* Body */}
          <rect x={left} y={top} width={w} height={h} rx={Math.min(4, w / 3)} fill={up ? stroke : fill} stroke={stroke} strokeWidth={2} />
          {/* Highlight stripe down the left side */}
          <path
            d={`M${left + w * 0.3} ${top + 4}V${bottom - 4}`}
            fill="none"
            stroke={up ? fill : "#ffffff"}
            strokeOpacity={up ? 0.7 : 0.9}
            strokeWidth={Math.max(1.5, w * 0.16)}
          />
          {/* Open and close ticks */}
          <path
            d={`M${left - 3} ${up ? bottom - 3 : top + 3}H${left}M${left + w} ${up ? top + 3 : bottom - 3}H${left + w + 3}`}
            fill="none"
            stroke={stroke}
            strokeWidth={1.6}
          />
        </g>
      );
    }
    case "coin": {
      const { x, y, r, stack, logo } = piece;
      return (
        <g>
          {Array.from({ length: stack }, (_, i) => {
            const cy = y - i * r * 0.32;
            const top = i === stack - 1;
            return (
              <g key={i}>
                <ellipse cx={x} cy={cy} rx={r} ry={r * 0.42} {...common} />
                <ellipse cx={x} cy={cy} rx={r * 0.72} ry={r * 0.3} fill="none" stroke={stroke} strokeWidth={1.2} />
                {top && <TokenLogo logo={logo} cx={x} cy={cy} size={r * 0.95} fill={stroke} squash={0.42} />}
              </g>
            );
          })}
        </g>
      );
    }
    case "ring": {
      const { x, y, r, logo } = piece;
      return (
        <g>
          <circle cx={x} cy={y} r={r} {...common} />
          <circle cx={x} cy={y} r={r * 0.78} fill="#fff" stroke={stroke} strokeWidth={1.5} />
          <TokenLogo logo={logo} cx={x} cy={y} size={r * 1.05} fill={stroke} />
        </g>
      );
    }
    case "spark": {
      const { x, y, r } = piece;
      const d = `M${x} ${y - r}L${x + r * 0.28} ${y - r * 0.28}L${x + r} ${y}L${x + r * 0.28} ${y + r * 0.28}L${x} ${y + r}L${x - r * 0.28} ${y + r * 0.28}L${x - r} ${y}L${x - r * 0.28} ${y - r * 0.28}Z`;
      return <path d={d} {...common} strokeLinejoin="round" />;
    }
  }
}

const MOTION: Record<Piece["kind"], string> = {
  candle: "garden-sway",
  coin: "garden-bob",
  ring: "garden-bob",
  spark: "garden-twinkle",
};

/** A heap of candlesticks and coins. Purely decorative. Each piece moves on its own timing. */
export function MarketGarden({
  seed = 7,
  width = 600,
  height = 260,
  count = 70,
  shape = "mound",
  className = "",
  animated = true,
}: {
  seed?: number;
  width?: number;
  height?: number;
  count?: number;
  shape?: Shape;
  className?: string;
  animated?: boolean;
}) {
  const pieces = cluster(seed, width, height, count, shape);
  const timing = random(seed * 31 + 5);
  return (
    <svg viewBox={`-30 -40 ${width + 60} ${height + 80}`} aria-hidden="true" className={className} overflow="visible">
      {pieces.map((piece, i) => {
        const delay = (-timing() * 6).toFixed(2);
        const duration = (2.6 + timing() * 2.8).toFixed(2);
        return (
          <g
            key={i}
            className={animated ? MOTION[piece.kind] : undefined}
            style={animated ? { animationDelay: `${delay}s`, animationDuration: `${duration}s` } : undefined}
          >
            <g className="garden-hover">
              <PieceSvg piece={piece} />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The mascot: a small vault safe with a dial face, an antenna and stubby legs. When `animated`,
 * it hovers, blinks, spins its dial, swings its legs and has a coin in orbit (see globals.css).
 */
export function VaultBot({ className = "", animated = false }: { className?: string; animated?: boolean }) {
  const a = (name: string) => (animated ? name : undefined);
  return (
    <svg viewBox="0 0 140 160" aria-hidden="true" className={className} overflow="visible">
      {/* Shadow on the ground, shrinking as the bot rises */}
      <ellipse cx="70" cy="152" rx="34" ry="5" fill="#3a2a86" opacity="0.12" className={a("bot-shadow")} />
      <g className={a("bot-hover")}>
        <g className={a("bot-tilt")}>
          {/* Antenna */}
          <g className={a("bot-antenna")}>
            <line x1="70" y1="12" x2="70" y2="32" stroke="#3a2a86" strokeWidth="3" strokeLinecap="round" />
            <circle cx="70" cy="11" r="6.5" fill="#ffe3d0" stroke="#c8561c" strokeWidth="2.5" />
          </g>
          {/* Legs */}
          <g className={a("bot-leg-left")}>
            <path d="M47 112v16" stroke="#3a2a86" strokeWidth="5" strokeLinecap="round" />
            <path d="M39 130h16" stroke="#3a2a86" strokeWidth="5" strokeLinecap="round" />
          </g>
          <g className={a("bot-leg-right")}>
            <path d="M93 112v16" stroke="#3a2a86" strokeWidth="5" strokeLinecap="round" />
            <path d="M85 130h16" stroke="#3a2a86" strokeWidth="5" strokeLinecap="round" />
          </g>
          {/* Body */}
          <rect x="26" y="32" width="88" height="84" rx="19" fill="#ece7fb" stroke="#3a2a86" strokeWidth="3" />
          <rect x="35" y="41" width="70" height="66" rx="13" fill="#ffffff" stroke="#6a4fd6" strokeWidth="2.5" />
          {/* Handle */}
          <rect x="111" y="58" width="10" height="32" rx="4.5" fill="#fbeccd" stroke="#a3690e" strokeWidth="2.5" className={a("bot-handle")} />
          {/* Dial face */}
          <circle cx="70" cy="74" r="21" fill="#e0f0e9" stroke="#17805a" strokeWidth="2.5" />
          <g className={a("bot-dial")}>
            {Array.from({ length: 8 }, (_, i) => {
              const angle = (i * Math.PI) / 4;
              return (
                <line
                  key={i}
                  x1={70 + Math.cos(angle) * 15}
                  y1={74 + Math.sin(angle) * 15}
                  x2={70 + Math.cos(angle) * 19}
                  y2={74 + Math.sin(angle) * 19}
                  stroke="#17805a"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              );
            })}
          </g>
          <g className={a("bot-blink")}>
            <circle cx="63" cy="70" r="3.2" fill="#3a2a86" />
            <circle cx="77" cy="70" r="3.2" fill="#3a2a86" />
          </g>
          <path d="M62.5 80q7.5 6.5 15 0" fill="none" stroke="#3a2a86" strokeWidth="2.5" strokeLinecap="round" />
        </g>
        {/* Orbiting token: a Bitcoin coin that circles the bot and counter-spins so its logo stays upright */}
        {animated && (
          <g className="bot-orbit">
            <g className="bot-orbit-counter">
              <circle cx="132" cy="75.5" r="11" fill="#a3690e" />
              <circle cx="132" cy="74" r="11" fill="#fbeccd" stroke="#a3690e" strokeWidth="2" />
              <svg x="123" y="65" width="18" height="18" viewBox={TOKEN_ICONS[0]!.viewBox}>
                <path d={TOKEN_ICONS[0]!.d} fill="#a3690e" />
              </svg>
            </g>
          </g>
        )}
      </g>
    </svg>
  );
}

/** Three vault doors joined by a cable: the illustration for "one Vault per user". */
export function VaultRow({ className = "" }: { className?: string }) {
  const doors = [
    { x: 90, y: 150, s: 1, c: PALETTE[0]! },
    { x: 290, y: 90, s: 1.25, c: PALETTE[2]! },
    { x: 500, y: 160, s: 1.05, c: PALETTE[1]! },
  ];
  return (
    <svg viewBox="0 0 620 300" aria-hidden="true" className={className}>
      <path
        d="M90 230C140 300 230 290 290 200S440 120 500 240"
        fill="none"
        stroke="#17805a"
        strokeWidth="4"
        strokeDasharray="2 10"
        strokeLinecap="round"
      />
      {doors.map(({ x, y, s, c }, i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <rect x="-62" y="-62" width="124" height="124" rx="22" fill={c.fill} stroke={c.stroke} strokeWidth="3" />
          <rect x="-50" y="-50" width="100" height="100" rx="16" fill="#fff" stroke={c.stroke} strokeWidth="2" />
          <circle r="30" fill={c.fill} stroke={c.stroke} strokeWidth="2.5" />
          <circle r="9" fill="#fff" stroke={c.stroke} strokeWidth="2.5" />
          {Array.from({ length: 6 }, (_, k) => {
            const a = (k * Math.PI) / 3 + i;
            return (
              <line
                key={k}
                x1={Math.cos(a) * 9}
                y1={Math.sin(a) * 9}
                x2={Math.cos(a) * 30}
                y2={Math.sin(a) * 30}
                stroke={c.stroke}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            );
          })}
          <path d="M-62 -30h-8M-62 0h-8M-62 30h-8" stroke={c.stroke} strokeWidth="4" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}

/**
 * A cluster of vault doors of different sizes, joined by cables: one Vault per user, all on one
 * protocol. Fills a wide right-hand column. Dials turn slowly when `animated`.
 */
export function VaultCluster({ className = "", animated = true }: { className?: string; animated?: boolean }) {
  // The last door sits past the right edge of the view box, so the cluster runs off the screen.
  const doors = [
    { x: 150, y: 400, s: 0.95, c: PALETTE[0]!, knob: "antenna" },
    { x: 350, y: 300, s: 1.15, c: PALETTE[2]!, knob: "dish" },
    { x: 560, y: 200, s: 1.1, c: PALETTE[0]!, knob: "antenna" },
    { x: 690, y: 175, s: 0.55, c: PALETTE[5]!, knob: "" },
    { x: 520, y: 430, s: 0.8, c: PALETTE[1]!, knob: "" },
    { x: 740, y: 470, s: 0.95, c: PALETTE[2]!, knob: "spark" },
    { x: 820, y: 300, s: 0.7, c: PALETTE[6]!, knob: "" },
    { x: 1010, y: 290, s: 1.45, c: PALETTE[3]!, knob: "spark" },
  ];
  // Each pipe joins the stands under two doors, sagging deeper the further apart they are.
  const links: [number, number][] = [
    [0, 1],
    [1, 4],
    [0, 5],
    [4, 5],
    [2, 4],
    [2, 3],
    [5, 7],
    [6, 7],
  ];
  const stand = (k: number) => {
    const d = doors[k]!;
    return { x: d.x, y: d.y + 94 * d.s };
  };
  const pipes = links.map(([from, to]) => {
    const a = stand(from);
    const b = stand(to);
    const sag = 70 + Math.abs(b.x - a.x) * 0.35;
    const low = Math.max(a.y, b.y) + sag;
    return `M${a.x} ${a.y}C${a.x} ${low} ${b.x} ${low} ${b.x} ${b.y}`;
  });
  return (
    <svg viewBox="60 20 940 680" aria-hidden="true" className={className} overflow="visible">
      {pipes.map((d, i) => (
        <g key={i} fill="none" strokeLinecap="round">
          <path d={d} stroke="#6a4fd6" strokeWidth="16" />
          <path d={d} stroke="#f5f2fd" strokeWidth="11" />
          <path d={d} stroke="#a3690e" strokeWidth="6" strokeDasharray="0.1 34" />
          <path d={d} stroke="#fbeccd" strokeWidth="3.5" strokeDasharray="0.1 34" />
        </g>
      ))}
      {doors.map(({ x, y, s, c, knob }, i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          {knob === "antenna" && (
            <g stroke={c.stroke} strokeWidth="3" fill={c.fill}>
              <path d="M-14 -86h28v-12h-28z" />
              <path d="M0 -98v-14" fill="none" />
              <circle cy="-120" r="9" />
            </g>
          )}
          {knob === "dish" && (
            <g stroke="#17805a" strokeWidth="2.5" fill="#e0f0e9" transform="translate(-20 -92) rotate(-25)">
              <path d="M-16 0a16 16 0 0 0 32 0z" />
              <path d="M0 0l10-18M-6 2l-6 12h24" fill="none" />
            </g>
          )}
          {knob === "spark" && (
            <path
              d="M0 -112l4 9 9 4-9 4-4 9-4-9-9-4 9-4z"
              fill={c.fill}
              stroke={c.stroke}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          )}
          <rect x="-60" y="-86" width="120" height="14" rx="7" fill={c.fill} stroke={c.stroke} strokeWidth="2.5" />
          <rect x="-80" y="-74" width="160" height="148" rx="24" fill="#fff" stroke={c.stroke} strokeWidth="3" />
          <rect x="-68" y="-62" width="136" height="124" rx="16" fill={c.fill} stroke={c.stroke} strokeWidth="2" />
          <rect x="-70" y="74" width="140" height="10" rx="3" fill={c.stroke} />
          <rect x="-16" y="84" width="32" height="10" rx="3" fill="#f5f2fd" stroke={c.stroke} strokeWidth="2" />
          <g
            className={animated ? "vault-dial" : undefined}
            style={animated ? { animationDuration: `${14 + i * 3}s`, animationDirection: i % 2 ? "reverse" : "normal" } : undefined}
          >
            {[44, 32, 20].map((r, k) => (
              <path
                key={k}
                d={wavyRing(r, 9 + k * 2, 3.2 - k * 0.6)}
                fill="none"
                stroke={[c.stroke, "#d4508e", "#6a4fd6"][k]}
                strokeWidth="2"
                strokeLinejoin="round"
              />
            ))}
            <circle r="7" fill="#fff" stroke={c.stroke} strokeWidth="2" />
          </g>
          <path d="M-80 -30h-10M-80 0h-10M-80 30h-10" stroke={c.stroke} strokeWidth="5" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}

/** A closed wavy ring: radius r, n waves, amplitude a. */
function wavyRing(r: number, n: number, a: number) {
  const points: string[] = [];
  for (let k = 0; k <= 96; k++) {
    const t = (k / 96) * Math.PI * 2;
    const rr = r + Math.sin(t * n) * a;
    points.push(`${(Math.cos(t) * rr).toFixed(1)} ${(Math.sin(t) * rr).toFixed(1)}`);
  }
  return `M${points.join("L")}Z`;
}

/** Line icons for cards. All 1.75 stroke, 24 grid. */
export function Icon({ name, className = "size-6" }: { name: IconName; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<IconName, React.ReactNode> = {
    mandate: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" {...p} />
        <path d="M9 8h6M9 12h6M9 16h3" {...p} />
      </>
    ),
    timer: (
      <>
        <circle cx="12" cy="13" r="8" {...p} />
        <path d="M12 9v4l3 2M9 2h6" {...p} />
      </>
    ),
    power: (
      <>
        <path d="M12 3v8" {...p} />
        <path d="M7 6.5a8 8 0 1 0 10 0" {...p} />
      </>
    ),
    bond: (
      <>
        <ellipse cx="12" cy="7" rx="7" ry="3" {...p} />
        <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" {...p} />
      </>
    ),
    replay: (
      <>
        <path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5" {...p} />
        <path d="M4 4v4.5h4.5M12 8v4l3 2" {...p} />
      </>
    ),
    chart: (
      <>
        <path d="M4 20h16" {...p} />
        <rect x="6" y="11" width="3" height="6" rx="0.5" {...p} />
        <rect x="11" y="6" width="3" height="11" rx="0.5" {...p} />
        <rect x="16" y="9" width="3" height="8" rx="0.5" {...p} />
      </>
    ),
    shield: <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z M9 12l2 2 4-4" {...p} />,
    vault: (
      <>
        {/* Safe body with feet, a round door and a spoked handle wheel */}
        <rect x="3" y="3" width="18" height="16" rx="2.5" {...p} />
        <path d="M6.5 19v2M17.5 19v2M19 9v4" {...p} />
        <circle cx="11" cy="11" r="5" {...p} />
        <circle cx="11" cy="11" r="1.2" {...p} />
        <path d="M11 6v3.8M11 12.2V16M6 11h3.8M12.2 11H16" {...p} />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {paths[name]}
    </svg>
  );
}

export type IconName = "mandate" | "timer" | "power" | "bond" | "replay" | "chart" | "shield" | "vault";

/**
 * Illustrations for the three pillar cards: a sealed Mandate, a trading terminal and a vault door.
 * Line work in the card's colour (currentColor) over soft pattern fills.
 */
export function PillarArt({ kind, className = "" }: { kind: "mandate" | "execute" | "protect"; className?: string }) {
  const line = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const id = `pillar-${kind}`;
  return (
    <svg viewBox="0 0 140 140" aria-hidden="true" className={className}>
      <defs>
        <pattern id={`${id}-grid`} width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M8 0H0V8" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
        </pattern>
        <pattern id={`${id}-dots`} width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="3.5" cy="3.5" r="1" fill="currentColor" fillOpacity="0.3" />
        </pattern>
      </defs>

      {kind === "mandate" && (
        <>
          {/* Document with a ruled checklist, a signature and a scalloped wax seal */}
          <rect x="22" y="12" width="84" height="114" rx="8" {...line} fill="var(--color-violet-soft)" />
          <rect x="30" y="20" width="68" height="98" rx="4" {...line} fill={`url(#${id}-grid)`} strokeWidth="1.5" />
          {[38, 54, 70].map((y, k) => (
            <g key={y}>
              <rect x="36" y={y - 5} width="10" height="10" rx="2" {...line} fill="#fff" strokeWidth="1.6" />
              <path d={`M38 ${y}l2.5 2.5 4-5`} {...line} strokeWidth="1.6" />
              <path d={`M52 ${y}h${k === 2 ? 26 : 38}`} {...line} strokeWidth="2.4" />
            </g>
          ))}
          <path d="M36 98c5-9 9 5 14-1s7-8 11 0 6-3 9-5" {...line} />
          <path d="M34 106h40" {...line} strokeWidth="1.2" strokeDasharray="2 3" />
          <g transform="translate(100 98)">
            <path
              d={Array.from({ length: 16 }, (_, k) => {
                const a = (k / 16) * Math.PI * 2;
                const r = k % 2 ? 15 : 18;
                return `${k ? "L" : "M"}${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
              }).join("") + "Z"}
              {...line}
              fill="var(--color-violet-line)"
             
            />
            <circle r="9.5" {...line} fill="#fff" strokeWidth="1.6" />
            <path d="M-4.5 0l3 3 6-6.5" {...line} strokeWidth="2" />
            <path d="M-7 16l-5 16 7-4 4 6 3-15M7 16l5 16-7-4-4 6" {...line} fill="var(--color-violet-soft)" strokeWidth="1.6" />
          </g>
        </>
      )}

      {kind === "execute" && (
        <>
          {/* Trading terminal on a stand: candlesticks, a rising line and a lightning bolt */}
          <path d="M70 14v10M62 14h16" {...line} />
          <circle cx="70" cy="11" r="3.5" {...line} fill="var(--color-orange-soft)" strokeWidth="1.6" />
          <rect x="14" y="24" width="112" height="78" rx="12" {...line} fill="var(--color-orange-soft)" />
          <rect x="22" y="32" width="96" height="62" rx="6" {...line} fill={`url(#${id}-dots)`} strokeWidth="1.6" />
          {[
            [34, 58, 76, 52, 84],
            [46, 52, 68, 46, 74],
            [58, 60, 78, 54, 84],
            [70, 46, 62, 40, 68],
            [82, 40, 56, 34, 62],
          ].map(([x, top, bottom, wickTop, wickBottom], k) => (
            <g key={k}>
              <path d={`M${x} ${wickTop}V${wickBottom}`} {...line} strokeWidth="1.6" />
              <rect x={x! - 3.5} y={top} width="7" height={bottom! - top!} rx="1.5" {...line} fill={k % 2 ? "#fff" : "currentColor"} strokeWidth="1.6" />
            </g>
          ))}
          <path d="M28 86l14-10 12 4 14-14 14 2 14-16 12-6" {...line} strokeDasharray="1 4" />
          <path d="M106 40l-8 14h7l-4 12 11-17h-7l5-9z" {...line} fill="#fff" strokeWidth="1.8" />
          <path d="M58 102l-10 26M82 102l10 26M42 128h56" {...line} />
          <path d="M60 114h20" {...line} strokeWidth="1.4" />
        </>
      )}

      {kind === "protect" && (
        <>
          {/* Vault door front-on: bolts, a spoked wheel and a shield at the hub */}
          <rect x="12" y="12" width="116" height="116" rx="18" {...line} fill="var(--color-green-soft)" />
          <circle cx="70" cy="70" r="46" {...line} fill={`url(#${id}-grid)`} />
          <circle cx="70" cy="70" r="46" {...line} fill="none" />
          {Array.from({ length: 12 }, (_, k) => {
            const a = (k / 12) * Math.PI * 2;
            return (
              <circle
                key={k}
                cx={70 + Math.cos(a) * 39}
                cy={70 + Math.sin(a) * 39}
                r="2.6"
                {...line}
                fill="#fff"
                strokeWidth="1.4"
              />
            );
          })}
          <circle cx="70" cy="70" r="28" {...line} fill="#fff" />
          {Array.from({ length: 6 }, (_, k) => {
            const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
            return (
              <path
                key={k}
                d={`M${70 + Math.cos(a) * 17} ${70 + Math.sin(a) * 17}L${70 + Math.cos(a) * 28} ${70 + Math.sin(a) * 28}`}
                {...line}
                strokeWidth="3"
              />
            );
          })}
          <path d="M70 55l13 5v8c0 8-5 13-13 17-8-4-13-9-13-17v-8z" {...line} fill="var(--color-green-soft)" />
          <path d="M64 70l4 4 8-9" {...line} />
          <path d="M12 40h-4M12 70h-4M12 100h-4" {...line} strokeWidth="4" />
          <rect x="112" y="58" width="8" height="24" rx="3" {...line} fill="#fff" strokeWidth="1.6" />
        </>
      )}
    </svg>
  );
}
