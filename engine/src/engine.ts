import { createHash, randomBytes } from "node:crypto";
import type { AgentId, Allocation, EngineEvent, FillUpdate, PriceTick, TradeProposal, VaultId } from "./events.js";
import type { Cloid, Mandate, PlacedOrder, Ports } from "./ports.js";

export type RejectionCode =
  | "invalid-proposal"
  /** Only the Vault's Lead Agent may propose (once the Allocator has assigned one). */
  | "not-lead-agent"
  /** A switch is pending: the outgoing Lead Agent may only reduce or close. */
  | "outgoing-lead-agent"
  /** The Vault's current Mandate Version couldn't be read, or its JSON didn't match the onchain hash or caps. */
  | "mandate-unavailable"
  | "kill-flag"
  | "blackout-window"
  /** Drawdown cap reached this month, or the oracle has strayed from its reference. New positions only. */
  | "automatic-kill"
  | "asset-not-allowed"
  | "leverage-over-cap"
  | "below-bond-minimum"
  | "commitment-failed"
  /** Committed onchain, then the exchange refused the order (e.g. outside the oracle band). Nothing was placed. */
  | "order-failed";

export type Rejection = { code: RejectionCode; message: string };

/** Everything the decision hash covers, kept for replay and the agent's-eye view. */
export type DecisionRecord = {
  proposal: TradeProposal;
  mandateVersion: number;
  markPrice: number;
  order: {
    limitPrice: number;
    entryCloid: Cloid;
    stopLoss?: { cloid: Cloid; triggerPrice: number };
  };
};

export type AutomaticKill =
  | { trigger: "drawdown-cap"; reason: string; since: number }
  | { trigger: "oracle-deviation"; asset: string; reason: string; since: number };

/** What the dashboard reads about a Vault's protection state. */
export type VaultStatus = {
  automaticKill?: AutomaticKill;
  leadAgent?: { agentId: AgentId | undefined; reason: string; pendingAgentId?: AgentId };
};

export type HandleResult =
  | { kind: "ignored" }
  | { kind: "handled" }
  | { kind: "rejected"; proposalId: string; rejection: Rejection }
  | {
      kind: "executed";
      proposalId: string;
      decision: DecisionRecord;
      decisionHash: string;
      commitmentTx: string;
      order: PlacedOrder;
      /** Logged for the Infrastructure Failure check: which stop was resting, and since when. */
      stopLoss?: { cloid: Cloid; triggerPrice: number; placedAt: number };
    };

export type Engine = {
  handle(event: EngineEvent): Promise<HandleResult>;
  vaultStatus(vaultId: VaultId): VaultStatus;
};

export type EngineOptions = {
  /** Worst entry price as a fraction past the mark (IOC limit). */
  entrySlippage?: number;
  newCloid?: () => Cloid;
  /** Clock in ms, injectable for tests. */
  now?: () => number;
};

const DEFAULT_ENTRY_SLIPPAGE = 0.01;
/** Automatic Kill fires when the oracle is more than this far from the reference... */
const ORACLE_DEVIATION = 0.02;
/** ...for longer than this. */
const ORACLE_DEVIATION_MS = 30_000;

export function createEngine(ports: Ports, options: EngineOptions = {}): Engine {
  const { exchange, chain } = ports;
  const slippage = options.entrySlippage ?? DEFAULT_ENTRY_SLIPPAGE;
  const newCloid = options.newCloid ?? (() => `0x${randomBytes(16).toString("hex")}` as Cloid);
  const now = options.now ?? Date.now;

  /** Per Vault: this calendar month's High-Water Mark, and a drawdown kill that holds until the month ends. */
  const drawdown = new Map<VaultId, { month: string; highWaterMark: number; kill?: AutomaticKill }>();
  /** Per Vault: the Allocator's latest decision. No entry means no allocation yet, and any agent may propose. */
  const leads = new Map<VaultId, { agentId: AgentId | undefined; reason: string; pendingAgentId?: AgentId }>();
  /** Per asset: since when the oracle has been out of range, and the kill once it has been for over 30s. */
  const oracle = new Map<string, { deviatingSince?: number; kill?: AutomaticKill }>();

  /** Reads the Vault's value, moves the month's High-Water Mark, and fires the drawdown kill at the cap. */
  async function checkDrawdown(vaultId: VaultId, capPct: number) {
    const month = monthKey(now());
    const value = await exchange.accountValue(vaultId);
    let d = drawdown.get(vaultId);
    if (!d || d.month !== month) d = { month, highWaterMark: value };
    d.highWaterMark = Math.max(d.highWaterMark, value);
    const ddPct = d.highWaterMark > 0 ? ((d.highWaterMark - value) / d.highWaterMark) * 100 : 0;
    if (!d.kill && ddPct >= capPct - 1e-9) {
      d.kill = {
        trigger: "drawdown-cap",
        reason: `Drawdown ${ddPct.toFixed(1)}% from this month's High-Water Mark (${d.highWaterMark}) reached the Mandate cap of ${capPct}%`,
        since: now(),
      };
    }
    drawdown.set(vaultId, d);
    return d.kill;
  }

  function onPriceTick(t: PriceTick) {
    const o = oracle.get(t.asset) ?? {};
    const deviation = Math.abs(t.oraclePrice / t.referencePrice - 1);
    if (deviation > ORACLE_DEVIATION + 1e-9) {
      o.deviatingSince ??= t.at;
      if (!o.kill && t.at - o.deviatingSince > ORACLE_DEVIATION_MS) {
        o.kill = {
          trigger: "oracle-deviation",
          asset: t.asset,
          reason: `${t.asset} oracle ${t.oraclePrice} is ${(deviation * 100).toFixed(2)}% from the reference ${t.referencePrice} for over ${ORACLE_DEVIATION_MS / 1000}s`,
          since: t.at,
        };
      }
    } else {
      // Back in range: the 30s restarts and the oracle kill clears. (The drawdown kill holds for the month.)
      delete o.deviatingSince;
      delete o.kill;
    }
    oracle.set(t.asset, o);
  }

  function onAllocation(a: Allocation) {
    leads.set(a.vaultId, {
      agentId: a.leadAgentId,
      reason: a.reason,
      ...(a.pendingLeadAgentId && a.pendingLeadAgentId !== a.leadAgentId ? { pendingAgentId: a.pendingLeadAgentId } : {}),
    });
  }

  async function onFill(f: FillUpdate) {
    if (!(await exchange.positions(f.vaultId)).every((p) => p.size === 0)) return;
    // Looser Mandate Versions take effect once the Vault is Flat; the chain side needs to hear it.
    await chain.reportFlat(f.vaultId);
    // A deferred Lead Agent switch completes now.
    const lead = leads.get(f.vaultId);
    if (lead?.pendingAgentId) leads.set(f.vaultId, { agentId: lead.pendingAgentId, reason: lead.reason });
  }

  async function handleProposal(p: TradeProposal): Promise<HandleResult> {
    const reject = (code: RejectionCode, message: string): HandleResult => ({
      kind: "rejected",
      proposalId: p.proposalId,
      rejection: { code, message },
    });

    const invalid = validate(p);
    if (invalid) return reject("invalid-proposal", invalid);

    const lead = leads.get(p.vaultId);
    if (lead && lead.agentId !== p.agentId) {
      return reject("not-lead-agent", `${p.agentId} is not the Lead Agent of ${p.vaultId} (${lead.agentId ?? "none assigned"})`);
    }
    if (lead?.pendingAgentId && p.intent === "open") {
      return reject("outgoing-lead-agent", `${p.agentId} is handing over to ${lead.pendingAgentId} once the Vault is Flat; it may only reduce or close`);
    }

    let mandate: Mandate;
    try {
      mandate = await chain.currentMandate(p.vaultId);
    } catch (e) {
      return reject("mandate-unavailable", `Can't read a verified Mandate for ${p.vaultId}: ${(e as Error).message}`);
    }
    const failed = mandateCheck(p, mandate, now());
    if (failed) return reject(failed.code, failed.message);

    const opens = p.intent === "open";
    // Automatic Kill blocks new positions only: reducing and closing go on, and resting stop-losses are never touched.
    const ddKill = await checkDrawdown(p.vaultId, mandate.drawdownCapPct);
    const oracleKill = oracle.get(p.asset)?.kill;
    if (opens && (ddKill || oracleKill)) return reject("automatic-kill", `Automatic Kill: ${(ddKill ?? oracleKill)!.reason}`);
    if (opens && !(await chain.meetsBondMinimum(p.agentId))) {
      return reject("below-bond-minimum", `${p.agentId} is below its Bond Minimum and may only reduce or close`);
    }

    const markPrice = await exchange.markPrice(p.asset);
    const buying = (p.side === "long") === opens;
    const limitPrice = markPrice * (buying ? 1 + slippage : 1 - slippage);
    const decision: DecisionRecord = {
      proposal: p,
      mandateVersion: mandate.version,
      markPrice,
      order: {
        limitPrice,
        entryCloid: newCloid(),
        ...(opens ? { stopLoss: { cloid: newCloid(), triggerPrice: stopTrigger(p.side, markPrice, mandate.stopLossPct) } } : {}),
      },
    };
    const decisionHash = hashDecision(decision);

    // Decision Commitment first, awaited until included. No commitment, no order.
    let commitmentTx: string;
    try {
      ({ txHash: commitmentTx } = await chain.commitDecision({ vaultId: p.vaultId, agentId: p.agentId, decisionHash }));
    } catch (e) {
      return reject("commitment-failed", `Decision Commitment failed, no order sent: ${(e as Error).message}`);
    }

    const { entryCloid, stopLoss } = decision.order;
    try {
      if (!stopLoss) {
        const order = await exchange.placeReduceOnly({ vaultId: p.vaultId, asset: p.asset, side: p.side, size: p.size, limitPrice, cloid: entryCloid });
        return { kind: "executed", proposalId: p.proposalId, decision, decisionHash, commitmentTx, order };
      }
      await exchange.setLeverage(p.vaultId, p.asset, p.leverage);
      const order = await exchange.placeOrderWithStopLoss({
        vaultId: p.vaultId,
        asset: p.asset,
        side: p.side,
        size: p.size,
        limitPrice,
        entryCloid,
        stopLoss,
      });
      return {
        kind: "executed",
        proposalId: p.proposalId,
        decision,
        decisionHash,
        commitmentTx,
        order,
        stopLoss: { ...stopLoss, placedAt: order.placedAt },
      };
    } catch (e) {
      return reject("order-failed", `Committed (${commitmentTx}) but the exchange refused the order: ${(e as Error).message}`);
    }
  }

  return {
    async handle(event) {
      switch (event.type) {
        case "trade-proposal":
          return handleProposal(event);
        case "price-tick":
          onPriceTick(event);
          return { kind: "handled" };
        case "fill":
          await onFill(event);
          return { kind: "handled" };
        case "allocation":
          onAllocation(event);
          return { kind: "handled" };
        default:
          // Veto Window (#10), Kill Switch (#9), Overshoot (#15), epochs (#17).
          return { kind: "ignored" };
      }
    },
    vaultStatus(vaultId) {
      const d = drawdown.get(vaultId);
      const ddKill = d && d.month === monthKey(now()) ? d.kill : undefined;
      const oracleKill = [...oracle.values()].find((o) => o.kill)?.kill;
      const automaticKill = ddKill ?? oracleKill;
      const leadAgent = leads.get(vaultId);
      return { ...(automaticKill ? { automaticKill } : {}), ...(leadAgent ? { leadAgent } : {}) };
    },
  };
}

function validate(p: TradeProposal): string | undefined {
  if (!p.proposalId) return "proposalId is required";
  if (!(Number.isFinite(p.size) && p.size > 0)) return `size must be a positive number, got ${p.size}`;
  if (!(Number.isFinite(p.leverage) && p.leverage >= 1)) return `leverage must be at least 1, got ${p.leverage}`;
  return undefined;
}

/**
 * Static Mandate Check rules. Mandate Version effectiveness (tighter now, looser once Flat) is decided chain-side:
 * the engine checks every proposal against whatever version `currentMandate` returns at that moment.
 */
function mandateCheck(p: TradeProposal, m: Mandate, at: number): Rejection | undefined {
  if (m.killFlag) return { code: "kill-flag", message: "The Vault's kill flag is set; no new trades" };
  const blackout = m.blackoutWindows.find((w) => at >= w.start && at < w.end);
  if (p.intent === "open" && blackout) {
    return { code: "blackout-window", message: `Blackout window until ${new Date(blackout.end).toISOString()}: no new positions` };
  }
  if (!m.allowedAssets.includes(p.asset)) {
    return { code: "asset-not-allowed", message: `${p.asset} is not allowed by Mandate v${m.version} (allowed: ${m.allowedAssets.join(", ")})` };
  }
  if (p.intent === "open" && p.leverage > m.leverageCap) {
    return { code: "leverage-over-cap", message: `Leverage ${p.leverage}x is over the Mandate v${m.version} cap of ${m.leverageCap}x` };
  }
  return undefined;
}

function monthKey(at: number) {
  const d = new Date(at);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
}

function stopTrigger(side: "long" | "short", markPrice: number, stopLossPct: number) {
  return markPrice * (side === "long" ? 1 - stopLossPct / 100 : 1 + stopLossPct / 100);
}

/** sha256 over canonical JSON (sorted keys), as 0x-hex: fits the DecisionLog's bytes32 and reproduces in replay. */
export function hashDecision(decision: DecisionRecord): string {
  return `0x${createHash("sha256").update(canonicalJson(decision)).digest("hex")}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
