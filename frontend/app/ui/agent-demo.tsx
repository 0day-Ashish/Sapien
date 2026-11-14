"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./art";
import { Logo } from "./logo";

// A scripted tour of the Mandate app, played in the hero: a cursor writes a Mandate, confirms it, opens Live trading,
// sits through a Veto Window and checks the Leaderboard. Illustration only, not live data.
// `t` runs from 0 to LOOP seconds and every element, the cursor included, derives its state from it.

const LOOP = 26;
const TICK_MS = 100;

const PROMPT = "Trade BTC and ETH at up to 3× leverage with a 2% stop-loss. Pause around US CPI.";

// When things happen, in seconds.
const TYPE_START = 1;
const TYPE_END = 4;
const SEND = 4.8;
const CONFIRM = 8.3;
const OPEN_TRADING = 10.2;
const VETO_START = 12;
const ORDER_SENT = 16;
const OPEN_LEADERBOARD = 19.3;
const NEW_MANDATE = 25.2;

type View = "mandate" | "trading" | "leaderboard";

const NAV: { id: View; target: string; label: string; icon: IconName }[] = [
  { id: "trading", target: "nav-trading", label: "Live trading", icon: "chart" },
  { id: "leaderboard", target: "nav-leaderboard", label: "Leaderboard", icon: "shield" },
];
const NAV_STATIC: { label: string; icon: IconName }[] = [
  { label: "Replay", icon: "replay" },
  { label: "Deposit & withdraw", icon: "vault" },
  { label: "Bonds", icon: "bond" },
];

/** Where the cursor heads from each moment on. A `click` waypoint presses the target when the cursor arrives. */
const WAYPOINTS: { at: number; target: string; click?: number }[] = [
  { at: 0, target: "composer", click: 0.9 },
  { at: 4.1, target: "send", click: SEND },
  { at: 7.4, target: "confirm", click: CONFIRM },
  { at: 9.2, target: "nav-trading", click: OPEN_TRADING },
  { at: 11, target: "chart" },
  { at: 12.6, target: "veto" },
  { at: 14.6, target: "chart" },
  { at: 18.4, target: "nav-leaderboard", click: OPEN_LEADERBOARD },
  { at: 20.5, target: "row-0" },
  { at: 24.2, target: "new-mandate", click: NEW_MANDATE },
];
const CLICKS = WAYPOINTS.flatMap((w) => (w.click === undefined ? [] : [w.click]));

const FIELDS = [
  { at: 5.4, label: "Allowed assets", value: "BTC, ETH", icon: "chart" as const },
  { at: 5.7, label: "Leverage cap", value: "3×", icon: "bond" as const },
  { at: 6.0, label: "Stop-loss", value: "2%", icon: "shield" as const },
  { at: 6.3, label: "Drawdown cap", value: "10%", icon: "power" as const },
  { at: 6.6, label: "Blackout windows", value: "US CPI", icon: "timer" as const },
  { at: 6.9, label: "Veto threshold", value: "500 USDC", icon: "mandate" as const },
];

const AGENTS = [
  { name: "Momentum", regime: "Trend", bond: "1,000", score: "1.42", vaults: 3, c: "bg-violet" },
  { name: "Mean-reversion", regime: "Chop", bond: "800", score: "1.08", vaults: 2, c: "bg-blue" },
  { name: "Funding-arb", regime: "Funding skew", bond: "600", score: "0.91", vaults: 1, c: "bg-teal" },
];

const SEGMENTS = [
  { end: SEND, c: "bg-violet" },
  { end: OPEN_TRADING, c: "bg-green" },
  { end: VETO_START, c: "bg-blue" },
  { end: ORDER_SENT, c: "bg-orange" },
  { end: OPEN_LEADERBOARD, c: "bg-teal" },
  { end: LOOP, c: "bg-gold" },
];

/** The 60s Veto Window, played back fast enough to fit its slot. */
const vetoLeft = (t: number) => Math.max(0, 60 - Math.floor(((t - VETO_START) / (ORDER_SENT - VETO_START)) * 60));

function phase(t: number) {
  if (t < SEND) return { label: "Writing a Mandate", tone: "!bg-violet" };
  if (t < OPEN_TRADING) return { label: "Confirm every field", tone: "!bg-green" };
  if (t < VETO_START) return { label: "Live trading", tone: "!bg-blue" };
  if (t < ORDER_SENT) return { label: `Veto window ${vetoLeft(t)}s`, tone: "!bg-orange" };
  if (t < OPEN_LEADERBOARD) return { label: "Order sent", tone: "!bg-teal" };
  return { label: "Leaderboard", tone: "!bg-gold" };
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function shown(visible: boolean) {
  return `transition-all duration-500 ease-out ${visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`;
}

/* ---------- Chart data: a fixed, made-up price series ---------- */

type Candle = { o: number; h: number; l: number; c: number };

const CANDLES: Candle[] = (() => {
  let seed = 20261114;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const out: Candle[] = [];
  let price = 65_900;
  for (let i = 0; i < 64; i++) {
    // A quiet range, then a breakout two thirds of the way along: what the momentum agent trades.
    const drift = i > 40 && i < 50 ? 55 : i >= 50 ? 12 : 2;
    const o = price;
    const c = o + drift + (rand() - 0.5) * 120;
    out.push({ o, c, h: Math.max(o, c) + rand() * 50, l: Math.min(o, c) - rand() * 50 });
    price = c;
  }
  return out;
})();

const ENTRY_INDEX = 50;
const ENTRY = CANDLES[ENTRY_INDEX]!.c;
const STOP = ENTRY * 0.98;
const SIZE = 0.01;

function Chart({ count, entered }: { count: number; entered: boolean }) {
  const W = 800;
  const H = 300;
  const visible = CANDLES.slice(0, count);
  const lows = [...CANDLES.map((c) => c.l), STOP];
  const highs = CANDLES.map((c) => c.h);
  const min = Math.min(...lows) - 60;
  const max = Math.max(...highs) + 60;
  const y = (p: number) => H - ((p - min) / (max - min)) * H;
  const step = (W - 70) / CANDLES.length;
  const last = visible[visible.length - 1]!;
  const ticks = [0.15, 0.4, 0.65, 0.9].map((f) => min + (max - min) * f);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none" aria-hidden="true">
      {ticks.map((p) => (
        <g key={p}>
          <line x1="0" x2={W - 62} y1={y(p)} y2={y(p)} stroke="#ece7fb" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <text x={W - 56} y={y(p) + 4} fontSize="11" fill="#8f89a6" fontFamily="var(--font-mono)">
            {Math.round(p).toLocaleString("en-US")}
          </text>
        </g>
      ))}
      {visible.map((c, i) => {
        const x = i * step + step / 2;
        const up = c.c >= c.o;
        const colour = up ? "#17805a" : "#c8561c";
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={colour} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            <rect x={x - step * 0.3} y={y(Math.max(c.o, c.c))} width={step * 0.6} height={Math.max(1.5, Math.abs(y(c.o) - y(c.c)))} fill={colour} rx="1" />
          </g>
        );
      })}
      {entered && (
        <g>
          <line x1="0" x2={W - 62} y1={y(ENTRY)} y2={y(ENTRY)} stroke="#6a4fd6" strokeWidth="1.4" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
          <line x1="0" x2={W - 62} y1={y(STOP)} y2={y(STOP)} stroke="#c8561c" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          <circle cx={ENTRY_INDEX * step + step / 2} cy={y(ENTRY)} r="6" fill="#17805a" stroke="#fff" strokeWidth="2" />
        </g>
      )}
      {/* Last price tag */}
      <line x1="0" x2={W - 62} y1={y(last.c)} y2={y(last.c)} stroke="#17805a" strokeWidth="1" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
      <rect x={W - 62} y={y(last.c) - 9} width="62" height="18" rx="3" fill="#17805a" />
      <text x={W - 56} y={y(last.c) + 4} fontSize="11" fill="#fff" fontFamily="var(--font-mono)">
        {Math.round(last.c).toLocaleString("en-US")}
      </text>
    </svg>
  );
}

export function AgentDemo() {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [inView, setInView] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);

  // Zoom in as the dashboard scrolls into view.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry!.isIntersecting), { threshold: 0.15 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(media.matches);
      // With motion reduced, hold on the frame just after the order is sent.
      if (media.matches) setT(ORDER_SENT + 1.5);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!playing || reduced || !inView) return;
    const id = window.setInterval(() => setT((v) => (v + TICK_MS / 1000) % LOOP), TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, reduced, inView]);

  const view: View = t < OPEN_TRADING ? "mandate" : t < OPEN_LEADERBOARD ? "trading" : "leaderboard";
  const target = [...WAYPOINTS].reverse().find((w) => t >= w.at)!.target;
  const clicking = CLICKS.some((c) => t >= c && t < c + 0.35);
  const pressed = (id: string) => clicking && target === id;

  // Point the cursor at the current target. Positions are fractions of the frame, so they survive its zoom.
  useEffect(() => {
    const place = () => {
      const box = frame.current;
      const el = box?.querySelector<HTMLElement>(`[data-cursor="${target}"]`);
      if (!box || !el || el.offsetParent === null) return setCursor(null);
      const f = box.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setCursor({ x: ((r.left + r.width * 0.5 - f.left) / f.width) * 100, y: ((r.top + r.height * 0.55 - f.top) / f.height) * 100 });
    };
    const id = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", place);
    };
  }, [target, view]);

  // Mandate view
  const typedChars = Math.floor(Math.min(1, Math.max(0, (t - TYPE_START) / (TYPE_END - TYPE_START))) * PROMPT.length);
  const typed = PROMPT.slice(0, typedChars);
  const sentPrompt = t >= SEND;
  const drafting = t >= SEND && t < 5.4;
  const confirmed = t >= CONFIRM;

  // Trading view
  const candleCount = Math.min(CANDLES.length, Math.max(40, 40 + Math.floor((t - OPEN_TRADING) * 2.8)));
  const vetoOpen = t >= VETO_START && t < ORDER_SENT;
  const sent = t >= ORDER_SENT && view === "trading";
  const lastPrice = CANDLES[candleCount - 1]!.c;
  const pnl = (lastPrice - ENTRY) * SIZE * 2;
  const vetoFraction = Math.max(0, 1 - (t - VETO_START) / (ORDER_SENT - VETO_START));

  const progress = (t / LOOP) * 100;
  const now = phase(t);
  const title = view === "mandate" ? (confirmed ? "Draft" : "New Mandate") : view === "trading" ? "Live trading" : "Leaderboard";

  return (
    <div
      ref={frame}
      role="img"
      aria-label="A demo of the Sapien app: writing a Mandate, watching a trade wait out its Veto Window, and the agent Leaderboard."
      className={`relative z-10 origin-top transition-[transform,opacity] duration-1000 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transform-none motion-reduce:opacity-100 ${
        inView ? "scale-100 opacity-100" : "scale-[0.94] opacity-60"
      }`}
    >
      {/* App frame, laid out like the Mandate app */}
      <div className="relative z-10 grid overflow-hidden rounded-[1.25rem] border border-violet-line bg-violet-soft/70 p-3 text-left shadow-card md:grid-cols-[15.5rem_1fr]">
        <aside className="relative hidden flex-col gap-4 p-2 md:flex">
          <div className="flex items-center gap-2 px-1">
            <Logo className="[&>svg]:size-7 [&>span]:!text-[1.375rem]" />
            <span className="ml-auto flex size-8 items-center justify-center rounded-full text-violet">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-[1.125rem]">
                <rect x="3.5" y="4.5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
                <path d="M9.5 4.5v15M16 10l-2 2 2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>

          <span
            data-cursor="new-mandate"
            className={`flex items-center justify-center gap-2 rounded-full bg-white py-2 text-sm font-medium text-violet shadow-sm transition-transform duration-150 ${pressed("new-mandate") ? "scale-95" : ""}`}
          >
            <span className="text-base leading-none">+</span> New Mandate
          </span>

          <ul className="flex flex-col gap-0.5">
            {NAV.map((n) => (
              <li
                key={n.id}
                data-cursor={n.target}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[0.8125rem] text-violet-ink transition-all duration-200 ${
                  view === n.id ? "bg-white shadow-sm" : target === n.target ? "bg-white/70" : ""
                } ${pressed(n.target) ? "scale-[0.97]" : ""}`}
              >
                <Icon name={n.icon} className="size-4 shrink-0 text-violet" />
                <span className="flex-1">{n.label}</span>
                {n.id === "trading" && <span className="size-1.5 animate-pulse rounded-full bg-green" />}
              </li>
            ))}
            {NAV_STATIC.map((n) => (
              <li key={n.label} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[0.8125rem] text-violet-ink">
                <Icon name={n.icon} className="size-4 shrink-0 text-violet" />
                {n.label}
              </li>
            ))}
          </ul>

          <div>
            <p className="px-1 pb-1.5 text-xs text-violet/70">Recent</p>
            <ul className="flex flex-col gap-0.5">
              {/* The Mandate being written joins the list once it is confirmed */}
              <li className={`overflow-hidden transition-all duration-500 ease-out ${confirmed ? "max-h-14 opacity-100" : "max-h-0 opacity-0"}`}>
                <span className="flex items-start gap-2 rounded-lg bg-white px-2 py-1.5 text-[0.8125rem] text-violet-ink shadow-sm">
                  <Icon name="mandate" className="mt-0.5 size-4 shrink-0 text-violet" />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate">BTC, ETH at 3×</span>
                    <span className="block text-[0.6875rem] text-violet/60">2% stop-loss · just now</span>
                  </span>
                </span>
              </li>
              {[
                { title: "ETH only, 2×", sub: "1% stop-loss · 1d ago" },
                { title: "Majors at 5×", sub: "3% stop-loss · 3d ago" },
              ].map((c) => (
                <li key={c.title} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-[0.8125rem] text-violet-ink">
                  <Icon name="mandate" className="mt-0.5 size-4 shrink-0 text-violet/50" />
                  <span className="leading-tight">
                    {c.title}
                    <span className="block text-[0.6875rem] text-violet/60">{c.sub}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <span
            aria-hidden="true"
            className="demo-wash pointer-events-none absolute inset-x-0 bottom-12 h-56 bg-[radial-gradient(60%_50%_at_30%_70%,rgb(253_228_239/0.7),transparent),radial-gradient(55%_45%_at_70%_40%,rgb(203_191_244/0.7),transparent)] blur-xl"
          />
          <div className="relative mt-auto">
            <p className="label-mono px-2 pb-2 !text-[0.625rem] text-violet/70">Swipe to connect →</p>
            <div className="flex items-center gap-3 rounded-full bg-white/70 p-1 text-sm text-violet/80">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet text-white">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-4">
                  <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              Slide to connect wallet
            </div>
          </div>
        </aside>

        <div className="relative flex h-[34rem] flex-col overflow-hidden rounded-xl bg-white px-4 py-5 sm:px-5 sm:py-6 md:h-[42rem] md:px-10" aria-hidden="true">
          <div className="flex items-center justify-center gap-2">
            <span className="rounded-full bg-violet-tint px-3 py-0.5 text-xs text-violet/70">{title}</span>
          </div>

          {view === "mandate" && (
            <>
              <div className="mx-auto mt-6 flex w-full max-w-2xl flex-1 flex-col gap-5 overflow-hidden">
                {!sentPrompt && (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                    <p className="title-serif text-violet-ink">Tell me how careful to be with your money.</p>
                    <p className="max-w-md text-sm text-violet/70">
                      Describe your risk rules in plain English. You confirm or edit every field before you sign.
                    </p>
                  </div>
                )}
                {sentPrompt && <p className="max-w-[85%] self-end rounded-2xl bg-violet-tint px-4 py-2.5 text-sm text-violet-ink">{PROMPT}</p>}
                {drafting && (
                  <p className="flex items-center gap-2 text-[0.8125rem] text-violet/80">
                    <Icon name="timer" className="size-4 animate-spin [animation-duration:2s]" />
                    Drafting your Mandate…
                  </p>
                )}
                {t >= 5.4 && (
                  <>
                    <p className="text-sm text-violet-ink">This is a draft. Check every field: only what you confirm here is signed.</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {FIELDS.map((f) => (
                        <div key={f.label} className={`flex items-center gap-3 rounded-xl border border-violet-line/70 px-3 py-2.5 ${shown(t >= f.at)}`}>
                          <Icon name={f.icon} className="size-4 shrink-0 text-violet" />
                          <span className="flex-1 text-[0.8125rem] text-violet/80">{f.label}</span>
                          <span className="font-mono text-[0.8125rem] text-violet-ink">{f.value}</span>
                        </div>
                      ))}
                    </div>
                    <div className={`flex flex-wrap items-center gap-3 ${shown(t >= 7.1)}`}>
                      <span
                        data-cursor="confirm"
                        className={`rounded-full px-5 py-2 font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-white transition-all duration-150 ${
                          confirmed ? "bg-green" : "bg-violet"
                        } ${pressed("confirm") ? "scale-95" : ""}`}
                      >
                        {confirmed ? "✓ Mandate confirmed" : "Confirm Mandate"}
                      </span>
                      <span className={`chip chip-forest ${shown(confirmed)}`}>Ready to sign</span>
                    </div>
                  </>
                )}
              </div>

              {/* Composer */}
              <div className="mx-auto mt-4 w-full max-w-2xl rounded-2xl border border-violet-line/70 bg-violet-soft/70 p-1.5 pt-0">
                <p className="flex items-center gap-2 px-2.5 py-2.5 text-sm">
                  <span className="font-medium text-violet-ink">{confirmed ? "Mandate confirmed" : sentPrompt ? "Check the draft" : "Your rules, in your words"}</span>
                  <span className="text-violet/60">{confirmed ? "ready to sign" : ""}</span>
                </p>
                <div
                  data-cursor="composer"
                  className={`flex flex-col gap-6 rounded-xl border bg-white p-3.5 transition-shadow duration-200 ${
                    t >= 0.9 && !sentPrompt ? "border-violet shadow-[0_0_0_4px_rgb(106_79_214/0.12)]" : "border-violet-line"
                  }`}
                >
                  <p className="min-h-[2.5rem] text-sm">
                    {typed && !sentPrompt ? (
                      <span className="text-violet-ink">
                        {typed}
                        <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-violet" />
                      </span>
                    ) : (
                      <span className="text-violet/50">Trade only BTC and ETH, never more than 3× leverage…</span>
                    )}
                  </p>
                  <div className="flex items-center justify-between text-violet">
                    <span className="flex size-8 items-center justify-center rounded-full bg-violet-tint text-lg leading-none">+</span>
                    <span
                      data-cursor="send"
                      className={`flex size-8 items-center justify-center rounded-full transition-all duration-150 ${
                        typed && !sentPrompt ? "bg-violet text-white" : "bg-violet-tint"
                      } ${pressed("send") ? "scale-90" : ""}`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-4">
                        <path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {view === "trading" && (
            <div className="mt-6 flex min-h-0 flex-1 flex-col gap-4">
              {/* The Veto Window banner opens above the market, pushing it down */}
              <div
                className={`shrink-0 overflow-hidden rounded-2xl border bg-white transition-all duration-500 ease-out ${
                  t >= VETO_START && t < ORDER_SENT + 2.2 ? "max-h-28 p-4 opacity-100" : "-mb-4 max-h-0 border-transparent px-4 py-0 opacity-0"
                } ${sent ? "border-green/40" : "border-orange/40"}`}
              >
                <div className="flex items-center gap-4">
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${sent ? "bg-green-soft text-green" : "bg-orange-soft text-orange"}`}>
                    <Icon name={sent ? "shield" : "timer"} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">
                      {sent ? "Order sent with its stop-loss" : "Momentum wants to open a 2× long: 0.01 BTC, about 650 USDC."}
                    </p>
                    <p className="text-[0.8125rem] text-ink-soft">
                      {sent ? "Checked again at the current price. Decision Commitment 0x7c1e…a94f." : "It is above your veto threshold, so it waits for you."}
                    </p>
                  </div>
                  {!sent && (
                    <>
                      <span className="font-mono text-sm tabular-nums text-orange">{vetoOpen ? vetoLeft(t) : 60}s</span>
                      <span
                        data-cursor="veto"
                        className={`rounded-full px-4 py-1.5 font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-white transition-colors ${
                          target === "veto" ? "bg-orange" : "bg-orange/85"
                        }`}
                      >
                        Veto
                      </span>
                    </>
                  )}
                </div>
                {!sent && (
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-orange-soft">
                    <div className="h-full bg-orange transition-[width] duration-100 ease-linear" style={{ width: `${vetoFraction * 100}%` }} />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-1 rounded-full bg-violet-tint p-1 font-mono text-[0.6875rem] text-violet">
                  {["BTC-PERP", "ETH-PERP"].map((m, i) => (
                    <span key={m} className={`rounded-full px-3 py-1 ${i === 0 ? "bg-white text-violet-ink shadow-sm" : ""}`}>
                      {m}
                    </span>
                  ))}
                </div>
                <span className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-wider text-green">
                  <span className="size-1.5 animate-pulse rounded-full bg-green" /> Live
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl border border-violet-line bg-violet-tint/60 p-4 lg:grid-cols-4">
                {[
                  { k: "Last price", v: lastPrice.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 }), tone: "text-violet-ink" },
                  { k: "Position", v: sent ? "2× long · 0.01 BTC" : "–", tone: "text-violet-ink" },
                  { k: "Unrealised PnL", v: sent ? `${pnl >= 0 ? "+" : "−"}${Math.abs(pnl).toFixed(2)} USDC` : "–", tone: sent ? (pnl >= 0 ? "text-green" : "text-orange") : "text-violet-ink" },
                  { k: "Vault value", v: `${(250 + (sent ? pnl : 0)).toFixed(2)} USDC`, tone: "text-violet-ink" },
                ].map((s) => (
                  <div key={s.k}>
                    <dt className="label-mono !text-[0.625rem] text-violet/70">{s.k}</dt>
                    <dd className={`mt-1 text-[1.0625rem] tabular-nums ${s.tone}`}>{s.v}</dd>
                  </div>
                ))}
              </dl>

              <div data-cursor="chart" className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-violet-line">
                <Chart count={candleCount} entered={sent} />
              </div>

              <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem] text-violet/80">
                {[
                  { label: "Agent buy", c: "bg-green" },
                  { label: "Entry", c: "bg-violet" },
                  { label: "Stop-loss", c: "bg-orange" },
                ].map((l) => (
                  <li key={l.label} className="flex items-center gap-2">
                    <span className={`h-0.5 w-5 rounded-full ${l.c}`} />
                    {l.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {view === "leaderboard" && (
            <div className="mx-auto mt-6 flex w-full max-w-3xl flex-1 flex-col gap-4">
              <div>
                <p className="title-serif text-violet-ink">Specialist Agents</p>
                <p className="mt-1 text-sm text-violet/70">Ranked by risk-adjusted return, with the Bond each has at stake.</p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-violet-line">
                <div className="grid grid-cols-[2rem_1fr_5.5rem_5.5rem] gap-3 border-b border-violet-line bg-violet-tint/60 px-4 py-2.5 sm:grid-cols-[2rem_1fr_7rem_6rem_6rem_4.5rem]">
                  {["#", "Agent", "Regime", "Bond", "Return", "Vaults"].map((h, i) => (
                    <span key={h} className={`label-mono !text-[0.625rem] text-violet/70 ${i === 2 || i === 5 ? "hidden sm:block" : ""}`}>
                      {h}
                    </span>
                  ))}
                </div>
                {AGENTS.map((a, i) => (
                  <div
                    key={a.name}
                    data-cursor={`row-${i}`}
                    className={`grid grid-cols-[2rem_1fr_5.5rem_5.5rem] items-center gap-3 border-b border-violet-line px-4 py-3.5 text-sm last:border-b-0 sm:grid-cols-[2rem_1fr_7rem_6rem_6rem_4.5rem] ${shown(
                      t >= OPEN_LEADERBOARD + 0.3 + i * 0.25,
                    )} ${i === 0 && target === "row-0" ? "bg-violet-tint" : ""}`}
                  >
                    <span className="font-serif text-[1.25rem] text-violet">{i + 1}</span>
                    <span className="flex items-center gap-2.5 text-violet-ink">
                      <span className={`size-2.5 rounded-full ${a.c}`} />
                      {a.name}
                      {i === 0 && <span className="rounded-full bg-green-soft px-2 py-0.5 font-mono text-[0.625rem] uppercase tracking-wider text-green">Leads you</span>}
                    </span>
                    <span className="hidden text-violet/80 sm:block">{a.regime}</span>
                    <span className="font-mono text-[0.8125rem] tabular-nums text-violet-ink">{a.bond} USDC</span>
                    <span className="font-mono text-[0.8125rem] tabular-nums text-green">{a.score}</span>
                    <span className="hidden font-mono text-[0.8125rem] tabular-nums text-violet-ink sm:block">{a.vaults}</span>
                  </div>
                ))}
              </div>
              <p className={`flex items-center gap-2 text-[0.8125rem] text-violet/70 ${shown(t >= OPEN_LEADERBOARD + 1.4)}`}>
                <span className="size-1.5 animate-pulse rounded-full bg-green" /> Updates live from real testnet fills
              </p>
            </div>
          )}
        </div>

        {/* The demo's mouse pointer */}
        {cursor && !reduced && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute z-30 transition-[left,top] duration-[900ms] ease-[cubic-bezier(0.45,0.05,0.2,1)]"
            style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}
          >
            <span className={`absolute -left-3 -top-3 size-6 rounded-full bg-violet/30 transition-all duration-300 ${clicking ? "scale-[1.8] opacity-100" : "scale-50 opacity-0"}`} />
            <svg viewBox="0 0 24 24" className={`relative size-6 drop-shadow-[0_3px_4px_rgb(42_34_69/0.35)] transition-transform duration-150 ${clicking ? "scale-[0.82]" : ""}`}>
              <path d="M5 3l14 8-6.2 1.6L9.6 19z" fill="#2a2245" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </div>

      {/* Timeline bar */}
      <div className="relative z-10 rounded-b-[1.25rem] border border-t-0 border-violet-line bg-violet-tint/90 px-5 py-4 backdrop-blur md:mx-5">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            disabled={reduced}
            aria-label={playing ? "Pause the demo" : "Play the demo"}
            className="flex size-5 items-center justify-center text-violet-ink transition-transform hover:scale-125 disabled:opacity-40"
          >
            {playing && !reduced ? (
              <span aria-hidden="true" className="flex gap-[3px]">
                <span className="h-3 w-[3px] bg-current" />
                <span className="h-3 w-[3px] bg-current" />
              </span>
            ) : (
              <svg viewBox="0 0 12 12" aria-hidden="true" className="size-3">
                <path d="M2 1l9 5-9 5z" fill="currentColor" />
              </svg>
            )}
          </button>
          <div className="relative flex flex-1 items-center gap-1.5">
            {SEGMENTS.map((seg, i) => {
              const start = i === 0 ? 0 : SEGMENTS[i - 1]!.end;
              const width = ((seg.end - start) / LOOP) * 100;
              const fill = Math.min(1, Math.max(0, (t - start) / (seg.end - start))) * 100;
              return (
                <span key={i} className="relative h-[3px] overflow-hidden rounded-full bg-violet-line" style={{ width: `${width}%` }}>
                  <span className={`absolute inset-y-0 left-0 ${seg.c}`} style={{ width: `${fill}%` }} />
                </span>
              );
            })}
            {/* Playhead with the phase badge hanging below it */}
            <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink ring-2 ring-white" style={{ left: `${progress}%` }} />
            <span className="absolute top-[calc(50%+6px)] flex -translate-x-1/2 flex-col items-center" style={{ left: `clamp(4.5rem, ${progress}%, calc(100% - 4.5rem))` }}>
              <span className="h-5 w-[2px] bg-pink" />
              <span className={`chip chip-solid tabular-nums ${now.tone}`}>{now.label}</span>
            </span>
          </div>
          <span className="label-mono !text-xs tabular-nums text-violet-ink">
            {clock(t)} / {clock(LOOP)}
          </span>
        </div>
      </div>
    </div>
  );
}
