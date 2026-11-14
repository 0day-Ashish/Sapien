"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, VaultBot } from "./art";

// A scripted replay of one decision in the agent's-eye view. Illustration only, not live data.
// `t` runs from 0 to LOOP seconds and every element derives its state from it.

const LOOP = 24;
const TICK_MS = 100;

const QUESTION = "Momentum wants to open 2× long BTC. Why, and is it inside my Mandate?";

const CHECKS = [
  { at: 3.6, text: "Read Mandate v3" },
  { at: 4.4, text: "Checked blackout windows: none until US CPI, Dec 10" },
  { at: 5.2, text: "Recorded Decision Commitment 0x7c1e…a94f" },
];

const REASONS = [
  { at: 7.2, text: "BTC is an allowed asset, and 2× is under your 3× leverage cap" },
  { at: 7.8, text: "Stop-loss rests 2% below entry, as your Mandate requires" },
  { at: 8.4, text: "640 USDC is above your veto threshold, so it waits 60s for you", mark: true },
];

const VETO_START = 9;
const ORDER_SENT = 21;

const DECISIONS = [
  { title: "ETH funding skew", when: "4m ago", c: "text-teal" },
  { title: "SOL rejected: not allowed", when: "12m ago", c: "text-orange", dot: true },
  { title: "Vetoed: BTC 5× long", when: "1h ago", c: "text-pink" },
  { title: "Stop-loss filled, ETH", when: "3h ago", c: "text-violet" },
  { title: "Overshoot paid by Bond", when: "5h ago", c: "text-gold" },
  { title: "Mandate v3 signed", when: "1d ago", c: "text-blue" },
  { title: "Lead Agent: Momentum", when: "1d ago", c: "text-green" },
  { title: "Deposit landed, 250 USDC", when: "2d ago", c: "text-teal" },
];

const SEGMENTS = [
  { end: 3, c: "bg-violet" },
  { end: 6, c: "bg-teal" },
  { end: 9, c: "bg-blue" },
  { end: 21, c: "bg-orange" },
  { end: 24, c: "bg-green" },
];

function phase(t: number) {
  if (t < 3) return { label: "Asking", tone: "!bg-violet" };
  if (t < 6) return { label: "Mandate check", tone: "!bg-teal" };
  if (t < VETO_START) return { label: "Agent's reasoning", tone: "!bg-blue" };
  if (t < ORDER_SENT) return { label: `Veto window ${vetoLeft(t)}s`, tone: "!bg-orange" };
  return { label: "Order sent", tone: "!bg-green" };
}

/** The 60s Veto Window, played back at 5× speed. */
const vetoLeft = (t: number) => Math.max(0, 60 - Math.floor((t - VETO_START) * 5));

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function shown(visible: boolean) {
  return `transition-all duration-500 ease-out ${visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`;
}

export function AgentDemo() {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [inView, setInView] = useState(false);
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
      if (media.matches) setT(14);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!playing || reduced) return;
    const id = window.setInterval(() => setT((v) => (v + TICK_MS / 1000) % LOOP), TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, reduced]);

  const typed = QUESTION.slice(0, Math.floor(Math.min(1, t / 2.5) * QUESTION.length));
  const checking = t >= 3;
  const checked = t >= 6;
  const reasoning = t >= 6.5;
  const vetoOpen = t >= VETO_START && t < ORDER_SENT;
  const sent = t >= ORDER_SENT;
  const progress = (t / LOOP) * 100;
  const now = phase(t);

  let composer: { title: string; detail: string };
  if (t < 3) composer = { title: "Waiting for you", detail: "" };
  else if (!checked) composer = { title: "Momentum is thinking", detail: `${(t - 3).toFixed(1)}s` };
  else if (!sent) composer = { title: "Waiting for your veto", detail: t >= VETO_START ? `${vetoLeft(t)}s left` : "" };
  else composer = { title: "Order sent with its stop-loss", detail: "0x4b9d…c201" };

  return (
    <div
      ref={frame}
      className={`relative z-10 origin-top transition-[transform,opacity] duration-1000 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transform-none motion-reduce:opacity-100 ${
        inView ? "scale-100 opacity-100" : "scale-[0.94] opacity-60"
      }`}
    >
      {/* App frame */}
      <div className="relative z-10 grid overflow-hidden rounded-[1.25rem] border border-violet-line bg-violet-soft/70 p-3 shadow-card transition-shadow duration-300 hover:shadow-[0_40px_80px_-40px_rgb(58_42_134/0.45)] md:grid-cols-[15rem_1fr]">
        <aside className="relative hidden flex-col gap-3 p-2 md:flex">
          <div className="grid grid-cols-2 rounded-full bg-white/70 p-1 text-sm text-violet">
            <span className="cursor-pointer rounded-full py-1 text-center transition-colors hover:bg-white/60">Vaults</span>
            <span className="cursor-pointer rounded-full bg-white py-1 text-center shadow-sm transition-transform hover:scale-105">Feed</span>
          </div>
          <span className="cursor-pointer rounded-full bg-white/70 py-1.5 text-center text-sm text-violet transition-all duration-200 hover:scale-[1.03] hover:bg-white hover:shadow-sm">+ New Mandate</span>
          <p className="mt-2 px-1 text-xs text-violet/70">Recent decisions</p>
          <ul className="flex flex-col gap-1">
            {/* The current decision: appears when the order is sent */}
            <li
              className={`grid transition-all duration-500 ease-out ${sent ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
            >
              <span className="flex items-start gap-2 overflow-hidden rounded-lg bg-white/80 px-2 py-1.5 text-[0.8125rem] text-violet-ink">
                <Icon name="chart" className="mt-0.5 size-4 shrink-0 text-green" />
                <span className="flex-1 leading-tight">
                  BTC 2× long, filled
                  <span className="block text-[0.6875rem] text-violet/60">just now</span>
                </span>
                <span className="mt-1.5 size-1.5 animate-pulse rounded-full bg-green" />
              </span>
            </li>
            {DECISIONS.map((d) => (
              <li key={d.title} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-[0.8125rem] text-violet-ink transition-all duration-200 hover:translate-x-1 hover:bg-white/80 hover:shadow-sm">
                <Icon name="chart" className={`mt-0.5 size-4 shrink-0 ${d.c}`} />
                <span className="flex-1 leading-tight">
                  {d.title}
                  <span className="block text-[0.6875rem] text-violet/60">{d.when}</span>
                </span>
                {d.dot && <span className="mt-1.5 size-1.5 rounded-full bg-orange" />}
              </li>
            ))}
          </ul>
          <span
            aria-hidden="true"
            className="demo-wash pointer-events-none absolute inset-x-0 bottom-12 h-56 bg-[radial-gradient(60%_50%_at_30%_70%,rgb(253_228_239/0.7),transparent),radial-gradient(55%_45%_at_70%_40%,rgb(203_191_244/0.7),transparent)] blur-xl"
          />
          <div className="relative mt-auto flex items-center gap-2 pt-6">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal text-[0.6875rem] font-medium text-white">
              AR
            </span>
            <span className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-white/70 py-1.5 text-sm text-violet transition-all duration-200 hover:scale-[1.03] hover:bg-white">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-3.5">
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
                <path d="M16 16l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Search
            </span>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-violet-line">
              <span className="size-2 animate-pulse rounded-full bg-green" />
            </span>
          </div>
        </aside>

        <div className="flex min-h-[44rem] flex-col rounded-xl bg-white px-5 py-6 md:px-10" aria-live="off">
          <span className="mx-auto rounded-full bg-violet-tint px-3 py-0.5 text-xs text-violet/70">Today</span>
          <div className="mx-auto mt-6 flex w-full max-w-2xl flex-col gap-6">
            <p
              className={`min-h-[2.75rem] self-end rounded-2xl bg-violet-tint px-4 py-2.5 text-sm text-violet-ink transition-opacity duration-300 ${typed ? "opacity-100" : "opacity-0"}`}
            >
              {typed}
              {t < 2.5 && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-violet" />}
            </p>

            <div className={`flex flex-col gap-2 text-[0.8125rem] text-violet/80 ${shown(checking)}`}>
              <p className="flex items-center gap-2">
                <Icon name="timer" className={`size-4 ${checked ? "" : "animate-spin [animation-duration:2s]"}`} />
                {checked ? "Checked in 3s" : `Checking your Mandate… ${(t - 3).toFixed(1)}s`}
              </p>
              <ul className="ml-2 flex flex-col gap-1.5 border-l border-violet-line pl-4">
                {CHECKS.map((c) => (
                  <li key={c.text} className={`-mx-1 flex items-center gap-2 rounded px-1 hover:bg-violet-tint ${shown(t >= c.at)}`}>
                    <span className="text-green">✓</span>
                    {c.text}
                  </li>
                ))}
              </ul>
            </div>

            <div className={`flex flex-col gap-2 text-sm text-violet-ink ${shown(reasoning)}`}>
              <p>Momentum sees BTC breaking its 4h range with funding neutral. Confidence 72%.</p>
              <ul className="ml-5 list-disc space-y-1 marker:text-violet">
                {REASONS.map((r) => (
                  <li key={r.text} className={`rounded px-1 -mx-1 hover:bg-violet-tint ${shown(t >= r.at)}`}>
                    {r.mark ? <span className="bg-violet-soft px-0.5">{r.text}</span> : r.text}
                  </li>
                ))}
              </ul>
            </div>

            <div className={`flex flex-wrap gap-2 ${shown(t >= VETO_START)}`}>
              <span className="chip chip-forest transition-transform duration-200 hover:scale-110">Mandate check passed</span>
              {sent ? (
                <span className="chip chip-forest transition-transform duration-200 hover:scale-110">Order sent · stop-loss resting</span>
              ) : (
                <span className="chip chip-amber tabular-nums transition-transform duration-200 hover:scale-110">Veto window {vetoOpen ? vetoLeft(t) : 60}s</span>
              )}
            </div>
          </div>

          {/* Composer */}
          <div className="mx-auto mt-auto w-full max-w-2xl rounded-2xl border border-violet-line/70 bg-violet-soft/70 p-1.5 pt-0">
            <p className="flex items-center gap-2 px-2.5 py-2.5 text-sm">
              <VaultBot className="size-6" animated={checking && !checked} />
              <span className="font-medium text-violet-ink">{composer.title}</span>
              <span className="tabular-nums text-violet/60">{composer.detail}</span>
            </p>
            <div className="flex cursor-text flex-col gap-8 rounded-xl border border-violet-line bg-white p-3.5 transition-shadow duration-200 hover:border-violet hover:shadow-[0_0_0_4px_rgb(106_79_214/0.12)]">
              <p className="text-sm text-violet/50">Why did the agent do that? Or type / for Veto, Kill Switch, Replay…</p>
              <div className="flex items-center justify-between text-violet">
                <span className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-violet-tint text-lg leading-none transition-all duration-200 hover:scale-110 hover:bg-violet-soft">+</span>
                <span className="flex items-center gap-3">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-4">
                    <rect x="9" y="3.5" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.9" />
                    <path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V21" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  </svg>
                  <span className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-violet-tint transition-all duration-200 hover:scale-110 hover:bg-violet-soft">
                    <span className={`size-2.5 rounded-[3px] bg-violet ${checking && !checked ? "animate-pulse" : ""}`} />
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline bar */}
      <div className="relative z-10 rounded-b-[1.25rem] border border-t-0 border-violet-line bg-violet-tint/90 px-5 py-4 backdrop-blur md:mx-5">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            disabled={reduced}
            aria-label={playing ? "Pause the replay" : "Play the replay"}
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
            <span
              className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink ring-2 ring-white"
              style={{ left: `${progress}%` }}
            />
            <span
              className="absolute top-[calc(50%+6px)] flex -translate-x-1/2 flex-col items-center"
              style={{ left: `clamp(4rem, ${progress}%, calc(100% - 4rem))` }}
            >
              <span className="h-5 w-[2px] bg-pink" />
              <span className={`chip chip-solid tabular-nums ${now.tone}`}>{now.label}</span>
            </span>
          </div>
          <span className="label-mono !text-xs tabular-nums text-violet-ink">
            {clock(t * (130 / LOOP))} / 2:10
          </span>
        </div>
      </div>
    </div>
  );
}
