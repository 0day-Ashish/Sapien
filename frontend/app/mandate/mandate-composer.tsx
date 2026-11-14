"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useConnection } from "wagmi";
import { SignMandate } from "../funds/vault-mandate";
import { MAX_CHATS, TOMBSTONES_KEY, mergeChats, storedMessages, unsynced } from "@/lib/chats/merge";
import { MAX_MANDATE_TEXT_LENGTH } from "@/lib/mandate/limits";
import { deleteChatAction, loadChatsAction, saveChatAction } from "./chat-actions";
import {
  BLACKOUT_EVENTS,
  LIMITS,
  SUPPORTED_ASSETS,
  blackoutEventIds,
  validateMandateDraft,
  type Mandate,
  type MandateDraft,
} from "@/lib/mandate/schema";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { Icon, type IconName } from "../ui/art";
import { Logo } from "../ui/logo";
import { WalletSlider } from "../ui/wallet-slider";
import { TradingChart } from "../ui/trading-chart";
import { VetoAlerts } from "../ui/veto-banner";
import { BondPanel } from "../builders/bond-panel";
import { FundsPanel } from "../funds/funds-panel";
import { SolanaProviders } from "../funds/solana-providers";
import { LeaderboardTable } from "../leaderboard/leaderboard-table";
import { ReplayView } from "../replay/replay-view";
import { BondsDemo, FundsDemo } from "./demo-views";
import type { Turn } from "@/lib/mandate/compile";
import { compileMandateAction, finalizeMandateAction } from "./actions";

const EXAMPLE =
  "Conservative, BTC and ETH only, never lose more than 8% a month, no trades during US CPI releases.";

// Form state keeps numbers as the strings the user typed, so a half-typed or empty
// field is visible as invalid instead of silently becoming 0.
type Form = {
  allowedAssets: string[];
  leverageCap: string;
  stopLossPct: string;
  drawdownCapPct: string;
  vetoThresholdUsdc: string;
  blackoutWindows: { event: string; minutesBefore: string; minutesAfter: string }[];
};

const BLANK_FORM: Form = {
  allowedAssets: [],
  leverageCap: "",
  stopLossPct: "",
  drawdownCapPct: "",
  vetoThresholdUsdc: "",
  blackoutWindows: [],
};

function toForm(mandate: MandateDraft): Form {
  return {
    allowedAssets: [...mandate.allowedAssets],
    leverageCap: String(mandate.leverageCap),
    stopLossPct: String(mandate.stopLossPct),
    drawdownCapPct: String(mandate.drawdownCapPct),
    vetoThresholdUsdc: String(mandate.vetoThresholdUsdc),
    blackoutWindows: mandate.blackoutWindows.map((w) => ({
      event: w.event,
      minutesBefore: String(w.minutesBefore),
      minutesAfter: String(w.minutesAfter),
    })),
  };
}

const num = (value: string) => (value.trim() === "" ? Number.NaN : Number(value));

function fromForm(form: Form): unknown {
  return {
    allowedAssets: form.allowedAssets,
    leverageCap: num(form.leverageCap),
    stopLossPct: num(form.stopLossPct),
    drawdownCapPct: num(form.drawdownCapPct),
    vetoThresholdUsdc: num(form.vetoThresholdUsdc),
    blackoutWindows: form.blackoutWindows.map((w) => ({
      event: w.event,
      minutesBefore: num(w.minutesBefore),
      minutesAfter: num(w.minutesAfter),
    })),
  };
}

const inputClass =
  "h-10 w-full rounded-lg border border-violet-line bg-white px-3 text-sm text-violet-ink transition-shadow focus:border-violet focus:outline-none focus:shadow-[0_0_0_4px_rgb(106_79_214/0.12)]";
const pill =
  "cursor-pointer rounded-full bg-violet-tint px-3 py-1.5 text-sm text-violet transition-all duration-200 hover:scale-[1.03] hover:bg-violet-soft disabled:pointer-events-none disabled:opacity-40";

// Recent chats: each drafting session. They are saved to the server under this browser's history key, and kept in
// the browser too, so the list shows at once and still works when the server store is off or unreachable.
/** A drafting session. `text` is the first thing the user wrote (the title); `messages` is the whole conversation. */
type Chat = { id: string; text: string | null; messages?: Turn[]; form: Form | null; assumptions: string[]; updatedAt: number };
const CHATS_KEY = "sapien.mandate.chats";
const HISTORY_KEY = "sapien.mandate.historyKey";
/** How long to wait after the last edit before saving a chat to the server. */
const SAVE_DELAY_MS = 800;

/** This browser's random history key, created on first use. Null if browser storage is unavailable. */
function historyKey(): string | null {
  try {
    let key = localStorage.getItem(HISTORY_KEY);
    if (!key) {
      key = `${crypto.randomUUID()}${crypto.randomUUID()}`;
      localStorage.setItem(HISTORY_KEY, key);
    }
    return key;
  } catch {
    return null;
  }
}

function loadChats(): Chat[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    return raw ? (JSON.parse(raw) as Chat[]) : [];
  } catch {
    return [];
  }
}

function storeChats(chats: Chat[]) {
  try {
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
  } catch {}
}

/** Ids deleted here whose removal the server hasn't confirmed. Kept across reloads so they can't come back. */
function loadTombstones(): string[] {
  try {
    const raw = localStorage.getItem(TOMBSTONES_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string").slice(-200) : [];
  } catch {
    return [];
  }
}

function storeTombstones(ids: Iterable<string>) {
  try {
    localStorage.setItem(TOMBSTONES_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {}
}

const chatTitle = (c: Chat) => (c.text ? c.text : "Filled in by hand");
const chatSubtitle = (c: Chat) =>
  c.form
    ? [c.form.allowedAssets.join(", "), c.form.leverageCap && `${c.form.leverageCap}×`, c.form.stopLossPct && `SL ${c.form.stopLossPct}%`]
        .filter(Boolean)
        .join(" · ")
    : "Conversation";

function ago(at: number) {
  const m = Math.floor((Date.now() - at) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const SIDEBAR_KEY = "sapien.mandate.sidebarCollapsed";

/** The views of the Mandate app. Each opens in the main panel; the URL keeps it (?view=) so it can be linked. */
type View = "mandate" | "trading" | "leaderboard" | "replay" | "funds" | "bonds";
const VIEWS: { id: Exclude<View, "mandate">; label: string; icon: IconName }[] = [
  { id: "trading", label: "Live trading", icon: "chart" },
  { id: "leaderboard", label: "Leaderboard", icon: "shield" },
  { id: "replay", label: "Replay", icon: "replay" },
  { id: "funds", label: "Deposit & withdraw", icon: "vault" },
  { id: "bonds", label: "Bonds", icon: "bond" },
];
const isView = (v: string | null): v is View => v === "mandate" || VIEWS.some((x) => x.id === v);

/** Opens and closes the sidebar (a panel icon). */
function SidebarToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-expanded={!collapsed}
      title={label}
      className={`flex shrink-0 ${collapsed ? "size-11" : "size-9"} items-center justify-center rounded-full text-violet transition-all duration-200 hover:bg-white/70`}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={collapsed ? "size-6" : "size-[1.125rem]"}>
        <rect x="3.5" y="4.5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9.5 4.5v15" stroke="currentColor" strokeWidth="1.8" />
        <path d={collapsed ? "M13.5 10l2 2-2 2" : "M16 10l-2 2 2 2"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function MandateComposer() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [view, setViewState] = useState<View>("mandate");
  const { status: walletStatus } = useConnection();
  const walletConnected = walletStatus === "connected";

  /** Switches the main panel and records it in the URL, without leaving the page. */
  function setView(v: View) {
    setMenuOpen(false);
    setViewState(v);
    const url = new URL(window.location.href);
    if (v === "mandate") url.searchParams.delete("view");
    else url.searchParams.set("view", v);
    window.history.replaceState(null, "", url);
  }
  const [collapsed, setCollapsed] = useState(false);
  /** Small screens: whether the sidebar drawer is open. */
  const [menuOpen, setMenuOpen] = useState(false);
  // The icon rail is a desktop choice; the drawer always shows the full sidebar.
  const narrow = collapsed && !menuOpen;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [text, setText] = useState("");
  /** The conversation with the Mandate assistant, oldest first. */
  const [messages, setMessages] = useState<Turn[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ mandate: Mandate; coveredUntil: number } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isCompiling, startCompile] = useTransition();
  const [isConfirming, startConfirm] = useTransition();

  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const deletedIds = useRef(new Set<string>());
  // A reply or a confirmation can arrive after the user has moved on. `chatToken` changes when the chat on screen
  // changes; `formToken` also changes on every form edit. A result is applied to the screen only if its token still
  // matches the one read when the request was sent.
  const chatToken = useRef(0);
  const formToken = useRef(0);
  const leaveChat = () => {
    chatToken.current++;
    formToken.current++;
  };

  /** Removes a chat on the server. The id stays a tombstone until the server confirms, and is retried on load. */
  function deleteOnServer(key: string, id: string) {
    void deleteChatAction(key, id)
      .then((res) => {
        // "off" means there is no server store, so there is nothing left to remove.
        if (res.ok || res.reason === "off") storeTombstones(loadTombstones().filter((t) => t !== id));
      })
      .catch(() => {});
  }

  /** Saves a chat to the server shortly after its last edit. Failures are ignored: the browser copy remains. */
  function saveSoon(chat: Chat) {
    const key = historyKey();
    if (!key) return;
    clearTimeout(saveTimers.current.get(chat.id));
    saveTimers.current.set(
      chat.id,
      setTimeout(() => {
        saveTimers.current.delete(chat.id);
        void saveChatAction(key, chat).catch(() => {});
      }, SAVE_DELAY_MS),
    );
  }

  // Bring in the server's history once: merge it with this browser's, and upload whatever the server lacks.
  useEffect(() => {
    const key = historyKey();
    if (!key) return;
    let cancelled = false;
    // Deletions the server never confirmed (it was unreachable, or the tab closed first): keep them out, and retry.
    for (const id of loadTombstones()) {
      deletedIds.current.add(id);
      deleteOnServer(key, id);
    }
    loadChatsAction(key)
      .then((res) => {
        if (cancelled || !res.ok) return;
        const remote = res.chats as Chat[];
        const local = loadChats();
        const merged = mergeChats(local, remote, deletedIds.current);
        setChats((current) => {
          const next = mergeChats(current, merged, deletedIds.current);
          storeChats(next);
          return next;
        });
        for (const chat of unsynced(merged, remote)) void saveChatAction(key, chat).catch(() => {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setChats(loadChats());
      const fromUrl = new URLSearchParams(window.location.search).get("view");
      if (isView(fromUrl)) setViewState(fromUrl);
      try {
        setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);

  /** Creates or updates a chat in Recent, newest first. */
  function persist(id: string, patch: Partial<Chat>) {
    setChats((current) => {
      const prev = current.find((c) => c.id === id);
      const chat: Chat = { id, text: null, form: null, assumptions: [], ...prev, ...patch, updatedAt: Date.now() };
      const next = [chat, ...current.filter((c) => c.id !== id)].slice(0, MAX_CHATS);
      storeChats(next);
      saveSoon(chat);
      return next;
    });
  }

  function toggleSidebar() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  }

  function openChat(c: Chat) {
    setMenuOpen(false);
    leaveChat();
    setActiveId(c.id);
    setText("");
    setMessages(c.messages ?? (c.text ? [{ role: "user", text: c.text }] : []));
    setForm(c.form);
    setAssumptions(c.assumptions);
    setNotice(null);
    setConfirmed(null);
    setConfirmError(null);
  }

  function deleteChat(id: string) {
    setChats((current) => {
      const next = current.filter((c) => c.id !== id);
      storeChats(next);
      return next;
    });
    if (id === activeId) startOver();
    // Remember the deletion so a server copy still in flight can't bring the chat back, then remove it there too.
    deletedIds.current.add(id);
    storeTombstones(new Set([...loadTombstones(), id]));
    clearTimeout(saveTimers.current.get(id));
    saveTimers.current.delete(id);
    const key = historyKey();
    if (key) deleteOnServer(key, id);
  }

  const validation = form ? validateMandateDraft(fromForm(form)) : null;
  const errors = validation && !validation.ok ? validation.errors : {};

  function update(patch: Partial<Form>) {
    if (!form) return;
    const next = { ...form, ...patch };
    setForm(next);
    if (activeId) persist(activeId, { form: next });
    formToken.current++;
    setConfirmed(null);
    setConfirmError(null);
  }

  function confirm(draft: MandateDraft) {
    setConfirmError(null);
    const token = formToken.current;
    startConfirm(async () => {
      let result: Awaited<ReturnType<typeof finalizeMandateAction>>;
      try {
        result = await finalizeMandateAction(draft);
      } catch {
        result = { ok: false, message: "Couldn't reach the server to confirm. Check your connection and try again." };
      }
      // The form was edited, or another chat opened, while the release dates were looked up: this result is for a
      // Mandate that is no longer on screen, so it must not be offered for signing.
      if (formToken.current !== token) return;
      if (result.ok) setConfirmed({ mandate: result.mandate, coveredUntil: result.coveredUntil });
      else setConfirmError(result.message);
    });
  }

  /** Sends the user's message. The assistant chats until a specific rule is given, then drafts the Mandate. */
  function compile() {
    const sent = text.trim();
    if (!sent || isCompiling) return;
    setNotice(null);
    setConfirmed(null);
    const conversation: Turn[] = [...messages, { role: "user", text: sent }];
    setMessages(conversation);
    setText("");
    formToken.current++;
    const token = chatToken.current;
    const id = activeId ?? crypto.randomUUID();
    startCompile(async () => {
      let result: Awaited<ReturnType<typeof compileMandateAction>>;
      try {
        // The form goes along, so a new draft keeps what the user edited by hand.
        result = await compileMandateAction(conversation, form ? fromForm(form) : undefined);
      } catch {
        result = { ok: false, reason: "unavailable", message: "Couldn't reach the assistant. Check your connection and try again." };
      }
      // While waiting, the user may have opened another chat, started a new one, or deleted this one.
      const onScreen = chatToken.current === token;
      if (!result.ok) {
        if (!onScreen) return;
        // Take the message back so it can be sent again.
        setMessages(messages);
        setText(sent);
        setNotice(result.message);
        return;
      }
      if (deletedIds.current.has(id)) return;
      const title = conversation.find((t) => t.role === "user")?.text ?? sent;
      const reply = result.kind === "reply" ? result.reply : result.reply || "Here's a draft from what you've told me. Check every field below before you confirm.";
      const next = storedMessages<Turn>([...conversation, { role: "assistant", text: reply }]);
      if (result.kind === "reply") {
        // No form in the patch: the chat keeps whatever form it has now, including edits made while waiting.
        persist(id, { text: title, messages: next });
        if (onScreen) {
          setActiveId(id);
          setMessages(next);
        }
        return;
      }
      const drafted = toForm(result.compiled.mandate);
      persist(id, { text: title, messages: next, form: drafted, assumptions: result.compiled.assumptions });
      if (!onScreen) return;
      setActiveId(id);
      setMessages(next);
      setForm(drafted);
      setAssumptions(result.compiled.assumptions);
      formToken.current++;
    });
  }

  function fillByHand() {
    leaveChat();
    setNotice(null);
    setAssumptions([]);
    setConfirmed(null);
    setMessages([]);
    setForm(BLANK_FORM);
    const id = crypto.randomUUID();
    setActiveId(id);
    persist(id, { text: null, form: BLANK_FORM, assumptions: [] });
  }

  function startOver() {
    leaveChat();
    setActiveId(null);
    setText("");
    setMessages([]);
    setForm(null);
    setAssumptions([]);
    setNotice(null);
    setConfirmed(null);
    setConfirmError(null);
  }

  const status_ = confirmed
    ? { title: "Mandate confirmed", detail: "ready to sign" }
    : isConfirming
      ? { title: "Looking up release dates", detail: "" }
      : isCompiling
        ? { title: "Thinking", detail: "" }
        : form
          ? { title: "Check every field", detail: validation?.ok ? "all fields valid" : "some fields need fixing" }
          : messages.length
            ? { title: "Chatting", detail: "a draft appears once you name a rule" }
            : { title: "Waiting for your rules", detail: "" };

  const summary: { icon: IconName; c: string; label: string; value: string }[] = form
    ? [
        { icon: "mandate", c: "text-green", label: "Assets", value: form.allowedAssets.join(", ") || "none yet" },
        { icon: "chart", c: "text-violet", label: "Leverage cap", value: form.leverageCap ? `${form.leverageCap}×` : "–" },
        { icon: "shield", c: "text-orange", label: "Stop-loss", value: form.stopLossPct ? `${form.stopLossPct}%` : "–" },
        { icon: "power", c: "text-pink", label: "Drawdown cap", value: form.drawdownCapPct ? `${form.drawdownCapPct}% / mo` : "–" },
        { icon: "timer", c: "text-gold", label: "Veto", value: form.vetoThresholdUsdc ? `${form.vetoThresholdUsdc} USDC` : "–" },
        {
          icon: "replay",
          c: "text-teal",
          label: "Blackouts",
          value: form.blackoutWindows.length ? String(form.blackoutWindows.length) : "none",
        },
      ]
    : [];

  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col">
      {/* App frame */}
      <div className={`relative z-10 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden bg-violet-soft/70 p-3 transition-[grid-template-columns] duration-300 ${collapsed ? "md:grid-cols-[4.25rem_1fr]" : "md:grid-cols-[16rem_1fr]"}`}>
        {/* On small screens the sidebar is a drawer, opened from the header's menu button. */}
        {menuOpen && <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-30 bg-violet-ink/30 md:hidden" />}
        <aside
          id="app-menu"
          className={`fixed inset-y-0 left-0 z-40 flex min-h-0 w-[17.5rem] max-w-[85vw] flex-col gap-4 bg-violet-soft shadow-2xl transition-transform duration-300 ease-out md:visible md:relative md:inset-auto md:z-auto md:w-auto md:max-w-none md:translate-x-0 md:bg-transparent md:shadow-none md:transition-none ${
            menuOpen ? "visible translate-x-0" : "invisible -translate-x-full"
          } ${narrow ? "items-center px-0 py-2" : "p-3 md:p-2"}`}
        >
          <div className={`flex items-center gap-2 ${narrow ? "flex-col" : ""}`}>
            {!narrow && (
              <Link href="/" aria-label={`${PRODUCT_NAME} home`} className="px-1">
                <Logo />
              </Link>
            )}
            <span className={`hidden md:block ${narrow ? "" : "ml-auto"}`}>
              <SidebarToggle collapsed={narrow} onToggle={toggleSidebar} />
            </span>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="ml-auto flex size-10 items-center justify-center rounded-full text-violet transition-colors hover:bg-white/70 md:hidden"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-5">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              startOver();
              setView("mandate");
            }}
            aria-label="New Mandate"
            title="New Mandate"
            className={`flex items-center justify-center gap-2 rounded-full bg-white text-sm font-medium text-violet shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow ${
              narrow ? "size-12" : "py-2"
            }`}
          >
            <span className={`leading-none ${narrow ? "text-2xl" : "text-base"}`}>+</span>
            {!narrow && "New Mandate"}
          </button>

          <nav aria-label="App" className={`flex flex-col gap-0.5 ${narrow ? "items-center" : ""}`}>
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                title={v.label}
                aria-current={view === v.id ? "page" : undefined}
                className={`flex items-center gap-2 rounded-lg text-[0.8125rem] text-violet-ink transition-all duration-200 hover:bg-white/70 ${
                  narrow ? "relative size-11 justify-center rounded-xl" : "px-2 py-1.5 text-left"
                } ${view === v.id ? "bg-white shadow-sm" : ""}`}
              >
                <Icon name={v.icon} className={`shrink-0 text-violet ${narrow ? "size-5" : "size-4"}`} />
                <span className={narrow ? "sr-only" : "flex-1"}>{v.label}</span>
                {v.id === "trading" && (
                  <span className={`size-1.5 animate-pulse rounded-full bg-green ${narrow ? "absolute right-2 top-2" : ""}`} aria-hidden="true" />
                )}
              </button>
            ))}
          </nav>

          <div className={`-mx-2 min-h-0 flex-1 flex-col overflow-y-auto px-2 ${narrow ? "hidden" : "flex"}`}>
            <p className="px-1 pb-1.5 text-xs text-violet/70">Recent</p>
            {chats.length === 0 ? (
              <p className="px-1 text-[0.8125rem] leading-snug text-violet/50">Your Mandate drafts appear here, so you can come back to them.</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {chats.map((c) => (
                  <li key={c.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => openChat(c)}
                      className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 pr-7 text-left text-[0.8125rem] text-violet-ink transition-all duration-200 ${
                        c.id === activeId ? "bg-white shadow-sm" : "hover:bg-white/70"
                      }`}
                    >
                      <Icon name="mandate" className={`mt-0.5 size-4 shrink-0 ${c.id === activeId ? "text-violet" : "text-violet/50"}`} />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate">{chatTitle(c)}</span>
                        <span className="block truncate text-[0.6875rem] text-violet/60">
                          {[chatSubtitle(c), ago(c.updatedAt)].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete "${chatTitle(c)}"`}
                      onClick={() => deleteChat(c.id)}
                      className="absolute right-1.5 top-1.5 hidden size-5 items-center justify-center rounded-full text-violet/50 hover:bg-violet-soft hover:text-violet group-hover:flex focus-visible:flex"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {form && (
              <>
                <p className="px-1 pb-1.5 pt-5 text-xs text-violet/70">This Mandate</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-xl bg-white/60 p-3 text-[0.75rem]">
                  {summary.map((row) => (
                    <div key={row.label} className="contents">
                      <dt className="flex items-center gap-1.5 text-violet/70">
                        <Icon name={row.icon} className={`size-3.5 ${row.c}`} />
                        {row.label}
                      </dt>
                      <dd className="truncate text-right text-violet-ink">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </div>

          <span
            aria-hidden="true"
            className="demo-wash pointer-events-none absolute inset-x-0 bottom-12 h-56 bg-[radial-gradient(60%_50%_at_30%_70%,rgb(253_228_239/0.7),transparent),radial-gradient(55%_45%_at_70%_40%,rgb(203_191_244/0.7),transparent)] blur-xl"
          />
          {narrow ? <div className="flex-1" /> : <WalletSlider />}
        </aside>

        <div className="flex min-h-0 flex-col rounded-xl bg-white px-5 py-6 md:px-10">
          <div className="relative flex items-center justify-between md:justify-center">
            <Link
              href="/"
              className="group absolute left-0 hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-violet/70 transition-colors hover:bg-violet-tint hover:text-violet md:flex"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-3.5 transition-transform duration-200 group-hover:-translate-x-0.5">
                <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back to home
            </Link>
            <span className="flex items-center gap-1 md:hidden">
              <button
                type="button"
                aria-label="Open menu"
                aria-expanded={menuOpen}
                aria-controls="app-menu"
                onClick={() => setMenuOpen(true)}
                className="-ml-2 flex size-11 items-center justify-center rounded-full text-violet transition-colors hover:bg-violet-tint"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-5">
                  <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <Link href="/" aria-label={`${PRODUCT_NAME} home`} className="text-violet">
                <Logo />
              </Link>
            </span>
            <span className="rounded-full bg-violet-tint px-3 py-0.5 text-xs text-violet/70">
              {view === "mandate" ? (activeId ? "Draft" : "New Mandate") : VIEWS.find((v) => v.id === view)!.label}
            </span>
          </div>

          {view === "trading" ? (
            <div className="mt-6 flex min-h-0 flex-1 flex-col">
              <TradingChart assets={form?.allowedAssets.length ? form.allowedAssets : []} />
            </div>
          ) : view !== "mandate" ? (
            <div className="-mx-5 mt-6 min-h-0 flex-1 overflow-y-auto px-5 md:-mx-10 md:px-10">
              <div className={`mx-auto flex w-full flex-col gap-6 pb-6 ${view === "funds" || view === "bonds" ? "max-w-2xl" : "max-w-6xl"}`}>
                {view === "leaderboard" && <LeaderboardTable />}
                {view === "replay" && <ReplayView />}
                {view === "funds" && !walletConnected && <FundsDemo />}
                {view === "funds" && walletConnected && (
                  <>
                    <SolanaProviders>
                      <FundsPanel />
                    </SolanaProviders>
                    <VetoAlerts />
                  </>
                )}
                {view === "bonds" && (walletConnected ? <BondPanel /> : <BondsDemo />)}
              </div>
            </div>
          ) : (
          <>
          <div className="-mx-5 mt-6 flex min-h-0 flex-1 flex-col overflow-y-auto px-5 md:-mx-10 md:px-10">
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
            {messages.length === 0 && !form && (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
                <p className="title-serif text-violet-ink">Tell me how careful to be with your money.</p>
                <p className="max-w-md text-sm text-violet/70">
                  Describe your risk rules in plain English. You confirm or edit every field before you sign, and agents
                  trade only inside what you sign.
                </p>
              </div>
            )}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <p key={i} className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl bg-violet-tint px-4 py-2.5 text-sm text-violet-ink">
                  {m.text}
                </p>
              ) : (
                <div key={i} className="flex max-w-[90%] items-start gap-2.5 self-start">
                  <span aria-hidden="true" className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-violet-soft text-violet">
                    <Icon name="mandate" className="size-4" />
                  </span>
                  <p className="whitespace-pre-wrap rounded-2xl border border-violet-line/70 bg-white px-4 py-2.5 text-sm text-violet-ink">{m.text}</p>
                </div>
              ),
            )}

            {isCompiling && (
              <p className="flex items-center gap-2 text-[0.8125rem] text-violet/80">
                <Icon name="timer" className="size-4 animate-spin [animation-duration:2s]" />
                Thinking…
              </p>
            )}

            {notice && (
              <p role="alert" className="rounded-xl border border-orange/30 bg-orange-soft px-4 py-2.5 text-sm text-orange">
                {notice}
              </p>
            )}

            {form && (
              <section className="flex flex-col gap-6">
                {assumptions.length > 0 && (
                  <div className="flex flex-col gap-2 text-[0.8125rem] text-violet/80">
                    <p className="flex items-center gap-2">
                      <Icon name="mandate" className="size-4" />
                      The draft assumed
                    </p>
                    <ul className="ml-2 flex flex-col gap-1.5 border-l border-violet-line pl-4">
                      {assumptions.map((a) => (
                        <li key={a} className="-mx-1 flex items-start gap-2 rounded px-1 hover:bg-violet-tint">
                          <span className="text-gold">•</span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="text-sm text-violet-ink">
                  This is a draft. Check every field: only what you confirm here is signed.
                </p>

                <Field label="Allowed assets" error={errors.allowedAssets}>
                  <div className="flex flex-wrap gap-2">
                    {SUPPORTED_ASSETS.map((asset) => {
                      const on = form.allowedAssets.includes(asset);
                      return (
                        <button
                          key={asset}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            update({
                              allowedAssets: on
                                ? form.allowedAssets.filter((a) => a !== asset)
                                : SUPPORTED_ASSETS.filter((a) => a === asset || form.allowedAssets.includes(a)),
                            })
                          }
                          className={`rounded-full border px-3.5 py-1 font-mono text-xs font-bold transition-all duration-200 hover:scale-105 ${
                            on ? "border-violet bg-violet text-white" : "border-violet-line bg-white text-violet hover:bg-violet-tint"
                          }`}
                        >
                          {asset}
                        </button>
                      );
                    })}
                  </div>
                </Field>

                <div className="grid gap-5 sm:grid-cols-2">
                  <NumberField
                    label="Leverage cap (×)"
                    hint={`${LIMITS.leverageCap.min} to ${LIMITS.leverageCap.max}`}
                    value={form.leverageCap}
                    error={errors.leverageCap}
                    onChange={(leverageCap) => update({ leverageCap })}
                  />
                  <NumberField
                    label="Stop-loss (% from entry)"
                    hint={`${LIMITS.stopLossPct.min} to ${LIMITS.stopLossPct.max}`}
                    value={form.stopLossPct}
                    error={errors.stopLossPct}
                    onChange={(stopLossPct) => update({ stopLossPct })}
                  />
                  <NumberField
                    label="Drawdown cap (% per month)"
                    hint={`${LIMITS.drawdownCapPct.min} to ${LIMITS.drawdownCapPct.max}. New positions stop when it is hit.`}
                    value={form.drawdownCapPct}
                    error={errors.drawdownCapPct}
                    onChange={(drawdownCapPct) => update({ drawdownCapPct })}
                  />
                  <NumberField
                    label="Veto threshold (USDC)"
                    hint={`${LIMITS.vetoThresholdUsdc.min} to ${LIMITS.vetoThresholdUsdc.max}. Larger trades wait 60s for your veto.`}
                    value={form.vetoThresholdUsdc}
                    error={errors.vetoThresholdUsdc}
                    onChange={(vetoThresholdUsdc) => update({ vetoThresholdUsdc })}
                  />
                </div>

                <Field label="Blackout windows" error={errors.blackoutWindows}>
                  <div className="flex flex-col gap-3">
                    {form.blackoutWindows.length === 0 && (
                      <p className="text-sm text-violet/60">None. Agents may open positions at any time.</p>
                    )}
                    {form.blackoutWindows.map((w, i) => {
                      const patch = (change: Partial<Form["blackoutWindows"][number]>) =>
                        update({
                          blackoutWindows: form.blackoutWindows.map((x, j) => (j === i ? { ...x, ...change } : x)),
                        });
                      return (
                        <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-violet-tint p-2 text-sm text-violet-ink">
                          <select aria-label="Event" className={`${inputClass} w-auto`} value={w.event} onChange={(e) => patch({ event: e.target.value })}>
                            {blackoutEventIds.map((id) => (
                              <option key={id} value={id}>
                                {BLACKOUT_EVENTS[id]}
                              </option>
                            ))}
                          </select>
                          <input
                            aria-label="Minutes before"
                            type="number"
                            className={`${inputClass} w-20`}
                            value={w.minutesBefore}
                            onChange={(e) => patch({ minutesBefore: e.target.value })}
                          />
                          <span>min before,</span>
                          <input
                            aria-label="Minutes after"
                            type="number"
                            className={`${inputClass} w-20`}
                            value={w.minutesAfter}
                            onChange={(e) => patch({ minutesAfter: e.target.value })}
                          />
                          <span>min after</span>
                          <button
                            type="button"
                            className="ml-auto px-2 text-sm text-violet underline-offset-2 hover:underline"
                            onClick={() => update({ blackoutWindows: form.blackoutWindows.filter((_, j) => j !== i) })}
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                    {form.blackoutWindows.length < blackoutEventIds.length && (
                      <button
                        type="button"
                        className={`${pill} self-start`}
                        onClick={() => {
                          const used = new Set(form.blackoutWindows.map((w) => w.event));
                          const event = blackoutEventIds.find((id) => !used.has(id)) ?? blackoutEventIds[0];
                          update({
                            blackoutWindows: [...form.blackoutWindows, { event, minutesBefore: "60", minutesAfter: "60" }],
                          });
                        }}
                      >
                        + Add a blackout window
                      </button>
                    )}
                  </div>
                </Field>

                <div className="flex flex-wrap items-center gap-2">
                  {validation?.ok ? (
                    <span className="chip chip-forest">All fields valid</span>
                  ) : (
                    <span className="chip chip-clay">Fix the highlighted fields</span>
                  )}
                  {confirmed ? <span className="chip chip-forest">Mandate confirmed</span> : <span className="chip chip-amber">Not confirmed yet</span>}
                </div>

                {confirmError && (
                  <p role="alert" className="text-sm text-orange">
                    {confirmError}
                  </p>
                )}

                {confirmed && (
                  <div className="flex flex-col gap-3 rounded-xl border border-violet-line bg-violet-tint p-4 text-sm text-violet-ink">
                    <p className="font-medium">This is exactly what you will sign:</p>
                    {confirmed.mandate.blackoutWindows.length > 0 && (
                      <div>
                        <p>No new positions open during these {confirmed.mandate.blackoutWindows.length} windows (your local time):</p>
                        <ul className="mt-2 max-h-48 list-disc overflow-y-auto pl-5 marker:text-violet">
                          {confirmed.mandate.blackoutWindows.map((w) => (
                            <li key={`${w.event}-${w.start}`}>
                              {BLACKOUT_EVENTS[w.event]}: {formatTime(w.start)} to {formatTime(w.end)}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 text-violet/70">
                          Release dates are listed through {formatDay(confirmed.coveredUntil)}. To stay covered after that, sign a new
                          Mandate Version.
                        </p>
                      </div>
                    )}
                    <pre className="max-h-64 overflow-auto rounded-lg bg-white p-3 font-mono text-xs">{JSON.stringify(confirmed.mandate, null, 2)}</pre>
                    <SignMandate mandate={confirmed.mandate} />
                  </div>
                )}

                <div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!validation?.ok || isConfirming}
                    onClick={() => validation?.ok && confirm(validation.mandate)}
                  >
                    {isConfirming ? "Looking up release dates…" : "Confirm Mandate"}
                  </button>
                </div>
              </section>
            )}
          </div>
          </div>

          {/* Composer */}
          <div className="mx-auto mt-6 w-full shrink-0 max-w-2xl rounded-2xl border border-violet-line/70 bg-violet-soft/70 p-1.5 pt-0">
            <p className="flex items-center gap-2 px-2.5 py-2.5 text-sm">
              <span className="font-medium text-violet-ink">{status_.title}</span>
              <span className="text-violet/60">{status_.detail}</span>
            </p>
            <div className="flex flex-col gap-3 rounded-xl border border-violet-line bg-white p-3.5 transition-shadow duration-200 focus-within:border-violet focus-within:shadow-[0_0_0_4px_rgb(106_79_214/0.12)]">
              <label htmlFor="mandate-text" className="sr-only">
                Your risk rules
              </label>
              <textarea
                id="mandate-text"
                className="min-h-20 resize-none bg-transparent text-sm text-violet-ink placeholder:text-violet/50 outline-none!"
                placeholder={EXAMPLE}
                maxLength={MAX_MANDATE_TEXT_LENGTH}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter adds a line (and IME composition is left alone).
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    compile();
                  }
                }}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-violet">
                <span className="flex flex-wrap gap-2">
                  <button type="button" className={pill} onClick={() => setText(EXAMPLE)}>
                    Use the example
                  </button>
                  {!form && (
                    <button type="button" className={pill} onClick={fillByHand}>
                      Fill in by hand
                    </button>
                  )}
                </span>
                <button
                  type="button"
                  aria-label="Send"
                  title="Send (Enter)"
                  disabled={isCompiling || !text.trim()}
                  onClick={compile}
                  className="flex h-9 items-center gap-2 rounded-full bg-violet px-4 font-mono text-xs font-bold uppercase text-white transition-all duration-200 hover:scale-105 hover:bg-violet-deep disabled:pointer-events-none disabled:opacity-40"
                >
                  {isCompiling ? "Sending…" : "Send"}
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-3.5">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          </>
          )}
        </div>
      </div>

    </div>
  );
}

const formatTime = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const formatDay = (unixSeconds: number) => new Date(unixSeconds * 1000).toLocaleDateString(undefined, { dateStyle: "medium" });

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="label-mono text-violet">{label}</span>
      {children}
      {error && <p className="text-sm text-orange">{error}</p>}
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  error,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="label-mono text-violet">{label}</span>
      <input
        type="number"
        step="any"
        className={`${inputClass} ${error ? "border-orange!" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className={`text-xs ${error ? "text-orange" : "text-violet/60"}`}>{error ?? hint}</span>
    </label>
  );
}
