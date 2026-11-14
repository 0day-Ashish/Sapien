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

/** A flat isometric disc (a short cylinder) with its top centred on (cx, cy). `accent` discs get a tinted fill. */
function Disc({ cx, cy, rx, h, color, accent = false }: { cx: number; cy: number; rx: number; h: number; color: string; accent?: boolean }) {
  const ry = rx / 2;
  const body = `M${cx - rx} ${cy}v${h}A${rx} ${ry} 0 0 0 ${cx + rx} ${cy + h}v${-h}`;
  const stroke = { stroke: color, strokeOpacity: accent ? 1 : 0.5, strokeWidth: accent ? 1.5 : 1.25, strokeLinejoin: "round" as const };
  return (
    <g>
      <path d={body} fill="var(--color-cream)" {...stroke} />
      {accent && <path d={body} fill={color} fillOpacity="0.16" />}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="var(--color-cream)" {...stroke} />
      {accent && <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={color} fillOpacity="0.16" />}
    </g>
  );
}

/**
 * The safeguards emblem, as isometric line art in the style of the pillar cards: a shield standing on a stepped
 * round pedestal, with three small pucks on the ring around it, one per kind of safeguard (rules, controls,
 * protection). The shield floats gently.
 */
export function SafeguardSeal({ className = "" }: { className?: string }) {
  const violet = "#6a4fd6";
  const soft = { fill: "none", stroke: violet, strokeOpacity: 0.5, strokeWidth: 1.25, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  // A heater shield, 44 wide and 54 tall, with its tip at (0, 0).
  const shield = "M0 -54L22 -46V-27C22 -13 12 -4 0 0C-12 -4 -22 -13 -22 -27V-46Z";
  const pucks = [
    { cx: 38, cy: 109, color: "#a3690e" },
    { cx: 162, cy: 109, color: "#c8561c" },
    { cx: 100, cy: 157, color: "#17805a" },
  ];
  return (
    <svg viewBox="8 40 184 140" aria-hidden="true" className={className}>
      {/* Pedestal: three stacked discs */}
      <Disc cx={100} cy={128} rx={86} h={6} color={violet} />
      <ellipse cx="100" cy="128" rx="68" ry="34" {...soft} strokeDasharray="3 4" />
      <Disc cx={100} cy={120} rx={48} h={8} color={violet} />

      {/* The two pucks behind the shield, then the top disc */}
      {pucks.slice(0, 2).map((p) => (
        <Disc key={p.cx} cx={p.cx} cy={p.cy} rx={12} h={5} color={p.color} accent />
      ))}
      <Disc cx={100} cy={110} rx={29} h={10} color={violet} accent />
      <ellipse cx="100" cy="110" rx="13" ry="6.5" {...soft} strokeDasharray="2 3" />

      {/* The shield: a soft copy set back a little gives it thickness */}
      <g className="garden-bob" style={{ animationDuration: "4.5s" }}>
        <g transform="translate(100 104)">
          <path d={shield} transform="translate(5 -2.5)" fill="var(--color-cream)" stroke={violet} strokeOpacity="0.5" strokeWidth="1.25" strokeLinejoin="round" />
          <path d={shield} fill="var(--color-cream)" />
          <path d={shield} fill={violet} fillOpacity="0.16" stroke={violet} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M-9 -29l6.5 7 12-14" fill="none" stroke={violet} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>

      {/* The puck in front */}
      <Disc cx={pucks[2]!.cx} cy={pucks[2]!.cy} rx={12} h={5} color={pucks[2]!.color} accent />
    </svg>
  );
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

/* ---------- Pillar illustrations: isometric line art ---------- */

type Pt = [number, number];

/** Isometric projection: x runs down-right, y down-left, z up. */
const iso = (x: number, y: number, z: number): Pt => [85 + (x - y) * 0.866, 62 + (x + y) * 0.5 - z];

const f = (n: number) => n.toFixed(1);

/** A closed polygon with its corners rounded by `r`, plus the mid-point of each rounded corner. */
function rounded(points: Pt[], r: number) {
  const corners = points.map((v, i) => {
    const prev = points[(i + points.length - 1) % points.length]!;
    const next = points[(i + 1) % points.length]!;
    const toward = (to: Pt): Pt => {
      const d = Math.hypot(to[0] - v[0], to[1] - v[1]);
      return [v[0] + ((to[0] - v[0]) / d) * r, v[1] + ((to[1] - v[1]) / d) * r];
    };
    const p1 = toward(prev);
    const p2 = toward(next);
    const mid: Pt = [(p1[0] + 2 * v[0] + p2[0]) / 4, (p1[1] + 2 * v[1] + p2[1]) / 4];
    return { v, p1, p2, mid };
  });
  const d = corners.map((c, i) => `${i ? "L" : "M"}${f(c.p1[0])} ${f(c.p1[1])}Q${f(c.v[0])} ${f(c.v[1])} ${f(c.p2[0])} ${f(c.p2[1])}`).join("") + "Z";
  return { d, mids: corners.map((c) => c.mid) };
}

const PAPER = "var(--color-cream)";

/**
 * A rounded isometric slab or box: centre (x, y), half-sizes a and b, standing on height z, h tall.
 * Neutral pieces are drawn in a soft line; `accent` pieces take the card's colour with a tinted fill.
 */
function Prism({ x, y, z, a, b, h, accent = false, r = 3 }: { x: number; y: number; z: number; a: number; b: number; h: number; accent?: boolean; r?: number }) {
  const face = (height: number) => rounded([iso(x - a, y - b, height), iso(x + a, y - b, height), iso(x + a, y + b, height), iso(x - a, y + b, height)], r);
  const top = face(z + h);
  const bottom = face(z);
  // Corner order is back, right, front, left.
  const [, tr, tf, tl] = top.mids as [Pt, Pt, Pt, Pt];
  const [, br, bf, bl] = bottom.mids as [Pt, Pt, Pt, Pt];
  const band = [tl, tf, tr, br, bf, bl].map((p, i) => `${i ? "L" : "M"}${f(p[0])} ${f(p[1])}`).join("") + "Z";
  const edges = [
    [tl, bl],
    [tf, bf],
    [tr, br],
  ]
    .map(([p, q]) => `M${f(p![0])} ${f(p![1])}L${f(q![0])} ${f(q![1])}`)
    .join("");
  const stroke = { stroke: "currentColor", strokeOpacity: accent ? 1 : 0.5, strokeWidth: accent ? 1.4 : 1.2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  const tint = accent ? { fill: "currentColor", fillOpacity: 0.16 } : { fill: "none" };
  return (
    <g>
      <path d={bottom.d} fill={PAPER} {...stroke} />
      <path d={band} fill={PAPER} />
      {accent && <path d={band} {...tint} />}
      <path d={edges} fill="none" {...stroke} />
      <path d={top.d} fill={PAPER} {...stroke} />
      {accent && <path d={top.d} {...tint} />}
    </g>
  );
}

/** A line drawn flat on a surface at height z, through the given (x, y) points. */
function flat(points: Pt[], z: number) {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${f(iso(x, y, z)[0])} ${f(iso(x, y, z)[1])}`).join("");
}

/**
 * Illustrations for the three pillar cards, as clean isometric line art on a shared base slab: a Mandate with its
 * seal, the engine taking an order, and the three layers of protection. Neutral lines are soft; the one accent
 * piece in each takes the card's colour (currentColor).
 */
export function PillarArt({ kind, className = "" }: { kind: "mandate" | "execute" | "protect"; className?: string }) {
  const soft = { fill: "none", stroke: "currentColor", strokeOpacity: 0.5, strokeWidth: 1.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const bold = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 170 120" aria-hidden="true" className={className}>
      <Prism x={0} y={0} z={-5} a={44} b={44} h={5} r={4} />

      {kind === "mandate" && (
        <>
          {/* The Mandate: a sheet with ruled lines, a dashed line to sign on, and its seal */}
          <Prism x={-2} y={0} z={0} a={22} b={32} h={3} />
          <path d={[-20, -11, -2].map((y) => flat([[-16, y], [10, y]], 3)).join("")} {...soft} />
          <path d={flat([[-16, 9], [-4, 9]], 3)} {...soft} strokeDasharray="2.5 2.5" />
          <Prism x={6} y={20} z={3} a={9} b={9} h={4} accent />
          <path d={flat([[3, 24], [7, 24], [7, 15]], 7)} {...bold} />
        </>
      )}

      {kind === "execute" && (
        <>
          {/* The engine: a box with a slot on top, and an order sitting ready to go in */}
          <Prism x={2} y={2} z={0} a={23} b={23} h={26} />
          <path d={rounded([iso(6, -6, 26), iso(18, -6, 26), iso(18, 16, 26), iso(6, 16, 26)], 3).d} {...soft} />
          {[1, 9].map((y) => {
            const [cx, cy] = iso(12, y, 26);
            return <ellipse key={y} cx={f(cx)} cy={f(cy)} rx="1.9" ry="1.2" fill="currentColor" />;
          })}
          <Prism x={-9} y={-9} z={26} a={9} b={9} h={4} accent />
        </>
      )}

      {kind === "protect" && (
        <>
          {/* Three layers of protection, stacked: the top one, the Bond, pays first */}
          <Prism x={0} y={0} z={0} a={31} b={31} h={7} />
          <Prism x={0} y={0} z={7} a={24} b={24} h={7} />
          <Prism x={0} y={0} z={14} a={17} b={17} h={7} accent />
          <path d={flat([[-5, 6], [1, 6], [1, -8]], 21)} {...bold} />
        </>
      )}
    </svg>
  );
}
