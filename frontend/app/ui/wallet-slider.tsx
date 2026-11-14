"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useNearWallet } from "../near-wallet";

const KNOB = 40; // px
const PAD = 4; // px between knob and track edge
const COMMIT = 0.85; // fraction of the travel that counts as a completed swipe

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4H5a2 2 0 0 0 0 4h14a1 1 0 0 1 1 1v3" />
      <path d="M3 6v12a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3" />
      <path d="M21 12v4h-4a2 2 0 0 1 0-4z" />
    </svg>
  );
}

/**
 * Swipe-to-connect wallet control. Drag the knob to the right end to connect; once connected,
 * drag it back to the left end to disconnect. Enter or Space on the knob does the same.
 */
export function WalletSlider() {
  const { accountId, status, connect, disconnect } = useNearWallet();
  const isPending = status === "connecting";
  const connected = status === "connected" && Boolean(accountId);

  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startPos: number } | null>(null);
  const [travel, setTravel] = useState(0);
  // While dragging, the knob follows the pointer; otherwise it rests at the end that matches the
  // wallet's state, or the end it is heading to while a connection is pending.
  const [dragPos, setDragPos] = useState<number | null>(null);
  const [target, setTarget] = useState(0);
  const dragging = dragPos !== null;
  const pos = dragPos ?? (isPending ? target : connected ? 1 : 0); // 0 = left end, 1 = right end

  // Measure how far the knob can move.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => setTravel(Math.max(0, el.clientWidth - KNOB - PAD * 2));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function act() {
    if (connected) void disconnect();
    else void connect();
  }

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (isPending || travel === 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startPos: pos };
    setDragPos(pos);
  }

  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    if (!drag.current || travel === 0) return;
    const next = drag.current.startPos + (e.clientX - drag.current.startX) / travel;
    setDragPos(Math.min(1, Math.max(0, next)));
  }

  function onPointerUp() {
    if (!drag.current) return;
    drag.current = null;
    const completed = connected ? pos <= 1 - COMMIT : pos >= COMMIT;
    setDragPos(null);
    if (completed) {
      setTarget(connected ? 0 : 1);
      act();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!isPending) {
        setTarget(connected ? 0 : 1);
        act();
      }
    }
  }

  const short = accountId ?? "";
  const hint = isPending ? "Connecting…" : connected ? short : "Slide to connect Meteor";

  return (
    <div className="relative flex flex-col gap-1.5">
      <p className="flex items-center gap-1.5 px-3 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-violet/70">
        {connected ? "Swipe back to disconnect" : "Swipe to connect"}
        <span aria-hidden="true" className={connected ? "" : "animate-pulse"}>
          {connected ? "←" : "→"}
        </span>
      </p>
      <div
        ref={track}
        className={`relative h-12 overflow-hidden rounded-full transition-colors duration-300 ${
          connected ? "bg-green-soft" : "bg-white/70"
        }`}
      >
        {/* Fill that follows the knob */}
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 rounded-full ${connected ? "bg-green/15" : "bg-violet-soft"} ${
            dragging ? "" : "transition-[width] duration-300 ease-out"
          }`}
          style={{ width: PAD * 2 + KNOB + pos * travel }}
        />
        <span
          className={`pointer-events-none absolute inset-0 flex items-center text-sm transition-opacity duration-200 ${
            connected ? "justify-start pl-5 font-mono text-xs text-green" : "justify-end pr-5 text-violet/70"
          }`}
          style={{ opacity: connected ? Math.max(0, pos * 1.4 - 0.4) : Math.max(0, 1 - pos * 1.6) }}
        >
          {hint}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={connected}
          aria-label={connected ? `Wallet ${short} connected. Slide left or press Enter to disconnect.` : "Slide right or press Enter to connect your wallet"}
          disabled={isPending}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          className={`absolute top-1 flex touch-none select-none items-center justify-center rounded-full shadow-[0_4px_12px_-4px_rgb(58_42_134/0.45)] ${
            dragging ? "cursor-grabbing" : "cursor-grab transition-[left] duration-300 ease-out"
          } ${connected ? "bg-green text-white" : "bg-violet text-white"} disabled:opacity-60`}
          style={{ width: KNOB, height: KNOB, left: PAD + pos * travel }}
        >
          <WalletIcon className={`size-5 ${isPending ? "animate-pulse" : ""}`} />
        </button>
      </div>
    </div>
  );
}
