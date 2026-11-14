// Original decorative art for the marketing pages: clusters of candlesticks and coins, and a
// small vault-safe mascot. Everything is drawn here as SVG in the brand colours.

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

type Piece =
  | { kind: "candle"; x: number; y: number; w: number; h: number; wick: number; c: number; rot: number }
  | { kind: "coin"; x: number; y: number; r: number; c: number; stack: number }
  | { kind: "ring"; x: number; y: number; r: number; c: number }
  | { kind: "spark"; x: number; y: number; r: number; c: number };

function cluster(seed: number, width: number, height: number, count: number, shape: "mound" | "band" | "spray"): Piece[] {
  const rand = random(seed);
  const pieces: Piece[] = [];
  for (let i = 0; i < count; i++) {
    const u = rand();
    let x = rand() * width;
    let y: number;
    if (shape === "mound") {
      // Taller in the middle, like a heap.
      const centre = 1 - Math.abs(x / width - 0.5) * 2;
      y = height - rand() * height * (0.25 + 0.75 * centre);
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
      pieces.push({ kind: "coin", x, y, r: 12 + rand() * 16, c, stack: 1 + Math.floor(rand() * 3) });
    } else if (u < 0.9) {
      pieces.push({ kind: "ring", x, y, r: 9 + rand() * 16, c });
    } else {
      pieces.push({ kind: "spark", x, y, r: 7 + rand() * 9, c });
    }
  }
  return pieces.sort((a, b) => a.y - b.y);
}

function PieceSvg({ piece }: { piece: Piece }) {
  const { fill, stroke } = PALETTE[piece.c]!;
  const common = { fill, stroke, strokeWidth: 2 };
  switch (piece.kind) {
    case "candle": {
      const { x, y, w, h, wick, rot } = piece;
      return (
        <g transform={`rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})`}>
          <line x1={x} y1={y - h / 2 - wick} x2={x} y2={y + h / 2 + wick} stroke={stroke} strokeWidth={2} strokeLinecap="round" />
          <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={3} {...common} />
          <line x1={x - w / 2 + 3} y1={y - h / 2 + h * 0.33} x2={x + w / 2 - 3} y2={y - h / 2 + h * 0.33} stroke={stroke} strokeWidth={1.2} />
        </g>
      );
    }
    case "coin": {
      const { x, y, r, stack } = piece;
      return (
        <g>
          {Array.from({ length: stack }, (_, i) => (
            <g key={i}>
              <ellipse cx={x} cy={y - i * r * 0.32} rx={r} ry={r * 0.42} {...common} />
              <ellipse cx={x} cy={y - i * r * 0.32} rx={r * 0.55} ry={r * 0.22} fill="none" stroke={stroke} strokeWidth={1.2} />
            </g>
          ))}
        </g>
      );
    }
    case "ring": {
      const { x, y, r } = piece;
      return (
        <g>
          <circle cx={x} cy={y} r={r} {...common} />
          <circle cx={x} cy={y} r={r * 0.45} fill="#fff" stroke={stroke} strokeWidth={1.5} />
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
  shape?: "mound" | "band" | "spray";
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
            <PieceSvg piece={piece} />
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
        {/* Orbiting coin */}
        {animated && (
          <g className="bot-orbit">
            <g transform="translate(70 74)">
              <ellipse cx="62" cy="0" rx="9" ry="4" fill="#fbeccd" stroke="#a3690e" strokeWidth="2" />
              <ellipse cx="62" cy="-3" rx="9" ry="4" fill="#fbeccd" stroke="#a3690e" strokeWidth="2" />
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
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {paths[name]}
    </svg>
  );
}

export type IconName = "mandate" | "timer" | "power" | "bond" | "replay" | "chart" | "shield";

/** Larger outline illustrations for the three pillar cards. */
export function PillarArt({ kind, className = "" }: { kind: "mandate" | "execute" | "protect"; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" className={className}>
      {kind === "mandate" && (
        <>
          <rect x="24" y="14" width="72" height="94" rx="8" {...p} fill="var(--color-violet-soft)" />
          <rect x="44" y="8" width="32" height="14" rx="4" {...p} fill="#fff" />
          <path d="M38 40h44M38 54h44M38 68h28" {...p} />
          <path d="M40 90c6-8 10 4 16-2s8-6 12 2 8-2 12-4" {...p} />
          <circle cx="86" cy="84" r="10" {...p} fill="#fff" />
          <path d="M81 84l3.5 3.5L91 80" {...p} />
        </>
      )}
      {kind === "execute" && (
        <>
          <ellipse cx="60" cy="58" rx="42" ry="34" {...p} fill="var(--color-orange-soft)" />
          <ellipse cx="60" cy="58" rx="30" ry="24" {...p} />
          <path d="M44 66l10-12 8 8 14-16" {...p} />
          <path d="M70 46h6v6" {...p} />
          <path d="M52 92l-6 18M68 92l6 18M40 110h40M60 24V10M54 10h12" {...p} />
        </>
      )}
      {kind === "protect" && (
        <>
          <path d="M60 10l38 14v26c0 26-16 46-38 58-22-12-38-32-38-58V24z" {...p} fill="var(--color-green-soft)" />
          <path d="M60 24l26 10v18c0 18-11 32-26 41-15-9-26-23-26-41V34z" {...p} />
          <ellipse cx="60" cy="58" rx="12" ry="5" {...p} fill="#fff" />
          <path d="M48 58v8c0 2.8 5.4 5 12 5s12-2.2 12-5v-8" {...p} />
        </>
      )}
    </svg>
  );
}
