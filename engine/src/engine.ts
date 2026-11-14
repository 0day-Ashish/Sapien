import { createHash, randomBytes } from "node:crypto";
import type { AgentId, Allocation, EngineEvent, EpochTick, FillUpdate, KillSwitch, PositionsSync, PriceTick, TradeProposal, VaultId, Veto, VetoWindowEnd } from "./events.js";
import type { Cloid, EpochSettlement, Mandate, OvershootClaim, PlacedOrder, Ports } from "./ports.js";
import { premiumRate } from "./premium.js";
import { isInfrastructureFailure, overshootUsdc, type StopRecord, stopExposureUsdc } from "./overshoot.js";

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
  /** Notional under Hyperliquid's $10 minimum (with a margin for size rounding): refused before the commitment. */
  | "below-minimum-order"
  /** Committed onchain, then the exchange refused the order (e.g. outside the oracle band). Nothing was placed. */
  | "order-failed"
  /** At the end of a Veto Window, the price had moved past the slippage cap since the proposal: dropped. */
  | "price-moved"
  /** The user hit the Kill Switch: the Lead Agent is frozen until a later Mandate Version clears the kill flag. */
  | "kill-switch";

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

/** A Trade Proposal above the Mandate's veto threshold, waiting out its Veto Window. */
export type PendingVeto = {
  proposalId: string;
  agentId: AgentId;
  asset: string;
  side: "long" | "short";
  size: number;
  leverage: number;
  /** USDC value at the mark price when the window opened. */
  notional: number;
  markPrice: number;
  rationale: string;
  openedAt: number;
  expiresAt: number;
};

/** What the dashboard reads about a Vault's protection state. */
export type VaultStatus = {
  automaticKill?: AutomaticKill;
  /** Trades waiting in their Veto Window, oldest first. */
  pendingVetoes?: PendingVeto[];
  leadAgent?: { agentId: AgentId | undefined; reason: string; pendingAgentId?: AgentId };
};

export type HandleResult =
  | { kind: "ignored" }
  | { kind: "handled" }
  | { kind: "rejected"; proposalId: string; rejection: Rejection }
  /** Above the veto threshold: nothing committed or sent yet. Send `veto-window-end` at `expiresAt`. */
  | { kind: "veto-window"; proposalId: string; vaultId: VaultId; expiresAt: number; pending: PendingVeto }
  | { kind: "vetoed"; proposalId: string }
  /** An Epoch tick: the Vaults settled, those that failed (retried next Epoch), and Lead Agent switches applied. */
  | { kind: "epoch-settled"; epoch: number; settled: EpochSettlement[]; failed: { vaultId: VaultId; error: string }[]; switched: VaultId[] }
  /** Kill Switch: every position got a reduce-only close; `flat` once none is left open. */
  | { kind: "killed"; vaultId: VaultId; closes: { asset: string; side: "long" | "short"; size: number; cloid: Cloid }[]; vetoed: string[]; flat: boolean }
  /** Kill Switch refused (e.g. the kill flag isn't set onchain yet); nothing was sent. */
  | { kind: "kill-refused"; vaultId: VaultId; reason: string }
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
  /** How long a trade above the veto threshold waits. Default 60s. */
  vetoWindowMs?: number;
  /** At the end of a Veto Window: the most the price may have moved since the proposal, and the order's slippage cap. */
  vetoSlippageCap?: number;
  /** Kill Switch closes: worst price as a fraction past the mark, wide so the IOC fills. Default 5%. */
  killSlippage?: number;
};

const DEFAULT_ENTRY_SLIPPAGE = 0.01;
const DEFAULT_VETO_WINDOW_MS = 60_000;
const DEFAULT_VETO_SLIPPAGE_CAP = 0.01;
/** Hyperliquid's minimum order value is $10; sizes get rounded down to the asset's lot, so keep a 2% margin. */
const MIN_ORDER_USD = 10.2;
const EPOCH_MS = 24 * 3600 * 1000;
/** Automatic Kill fires when the oracle is more than this far from the reference... */
const ORACLE_DEVIATION = 0.02;
/** ...for longer than this. */
const ORACLE_DEVIATION_MS = 30_000;

export function createEngine(ports: Ports, options: EngineOptions = {}): Engine {
  const { exchange, chain } = ports;
  const slippage = options.entrySlippage ?? DEFAULT_ENTRY_SLIPPAGE;
  const newCloid = options.newCloid ?? (() => `0x${randomBytes(16).toString("hex")}` as Cloid);
  const now = options.now ?? Date.now;
  const vetoWindowMs = options.vetoWindowMs ?? DEFAULT_VETO_WINDOW_MS;
  const vetoSlippageCap = options.vetoSlippageCap ?? DEFAULT_VETO_SLIPPAGE_CAP;
  /** Per proposalId: a trade waiting in its Veto Window. */
  const vetoWindows = new Map<string, { proposal: TradeProposal; pending: PendingVeto }>();
  const killSlippage = options.killSlippage ?? 0.05;
  /** Per Vault frozen by the Kill Switch: the Mandate Version it was killed under. A later version without the kill flag unfreezes it. */
  const killed = new Map<VaultId, number>();
  /** Trades the user vetoed, as `vaultId proposalId`. An agent proposes the same trade again every tick; a veto must hold. */
  const vetoedProposals = new Set<string>();
  const vetoKey = (vaultId: VaultId, proposalId: string) => `${vaultId} ${proposalId}`;
  /** Per Vault: what the Vault contract was last told about being Flat. Read from the chain on first use. */
  const flatOnchain = new Map<VaultId, boolean>();

  /** Tells the Vault contract it is Flat or not, unless that is what it already holds. */
  async function reportFlatIfChanged(vaultId: VaultId, flat: boolean) {
    if (!flatOnchain.has(vaultId)) flatOnchain.set(vaultId, await chain.isFlat(vaultId));
    if (flatOnchain.get(vaultId) === flat) return;
    await chain.reportFlat(vaultId, flat);
    flatOnchain.set(vaultId, flat);
  }
  /** Reports Flat whatever was reported before: the paths that have just seen the Vault go Flat. */
  async function reportFlatNow(vaultId: VaultId) {
    await chain.reportFlat(vaultId, true);
    flatOnchain.set(vaultId, true);
  }

  /**
   * Kill Switch. The owner first signs a Mandate Version with the kill flag (recorded onchain, and only the owner can).
   * The engine acts only once it reads that flag, so the trigger itself needs no other authentication.
   */
  async function onKillSwitch(k: KillSwitch): Promise<HandleResult> {
    let mandate: Mandate;
    try {
      mandate = await chain.currentMandate(k.vaultId);
    } catch (e) {
      return { kind: "kill-refused", vaultId: k.vaultId, reason: `Can't read the Vault's Mandate: ${(e as Error).message}` };
    }
    if (!mandate.killFlag) {
      return { kind: "kill-refused", vaultId: k.vaultId, reason: "The kill flag isn't set onchain: sign a Mandate Version with the kill flag first" };
    }
    killed.set(k.vaultId, mandate.version);

    // Trades waiting for a veto are dropped: the user has said stop.
    const vetoed = [...vetoWindows.values()].filter((w) => w.proposal.vaultId === k.vaultId).map((w) => w.proposal.proposalId);
    for (const id of vetoed) vetoWindows.delete(id);

    const closes: Extract<HandleResult, { kind: "killed" }>["closes"] = [];
    for (const pos of await exchange.positions(k.vaultId)) {
      if (pos.size === 0) continue;
      // The order's side is the position's side (as for any reduce); a long closes by selling below the mark.
      const side = pos.size > 0 ? "long" : "short";
      const mark = await exchange.markPrice(pos.asset);
      const cloid = newCloid();
      const size = Math.abs(pos.size);
      await exchange.placeReduceOnly({ vaultId: k.vaultId, asset: pos.asset, side, size, limitPrice: mark * (side === "long" ? 1 - killSlippage : 1 + killSlippage), cloid });
      closes.push({ asset: pos.asset, side, size, cloid });
    }

    const flat = (await exchange.positions(k.vaultId)).every((p) => p.size === 0);
    // If a close hasn't filled yet, the next positions-sync reports Flat once it has.
    if (flat) await reportFlatNow(k.vaultId);
    return { kind: "killed", vaultId: k.vaultId, closes, vetoed, flat };
  }

  /**
   * Per Vault: this calendar month's High-Water Mark, since when it has been tracked, and a drawdown kill that holds
   * until the month ends. Values are net of deposits and withdrawals since `since`, so moving money is never a gain
   * or a loss.
   */
  const drawdown = new Map<VaultId, { month: string; since: number; highWaterMark: number; kill?: AutomaticKill }>();
  /** Per Vault: the Allocator's latest decision. No entry means no allocation yet, and any agent may propose. */
  const leads = new Map<VaultId, { agentId: AgentId | undefined; reason: string; pendingAgentId?: AgentId }>();
  /** Open stop-losses the engine placed, by cloid: the evidence for Overshoot claims (#15). */
  const stops = new Map<Cloid, StopRecord>();
  /** Cloids of every order the engine placed: a fill outside this set (liquidation, manual close) wasn't the engine's. */
  const ownOrders = new Set<string>();
  /** Per Vault: when its last Epoch was settled. The first settlement looks back one Epoch. */
  const lastSettledAt = new Map<VaultId, number>();
  /** Per asset: since when the oracle has been out of range, and the kill once it has been for over 30s. */
  const oracle = new Map<string, { deviatingSince?: number; kill?: AutomaticKill }>();

  /** Reads the Vault's value, moves the month's High-Water Mark, and fires the drawdown kill at the cap. */
  async function checkDrawdown(vaultId: VaultId, capPct: number) {
    const month = monthKey(now());
    const raw = await exchange.accountValue(vaultId);
    let d = drawdown.get(vaultId);
    if (!d || d.month !== month) d = { month, since: now(), highWaterMark: raw };
    // A withdrawal lowers the account value without being a loss, and a deposit raises it without being a gain.
    // If the ledger can't be read, fall back to the raw value, which can only make the check stricter after a withdrawal.
    const flows = await exchange.netFlows(vaultId, d.since).catch(() => 0);
    const value = raw - flows;
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

  /**
   * Overshoot: the Vault's stop-loss filled past its trigger (a market gap), or a fill the engine didn't place closed
   * it past the trigger while the stop wasn't resting (Infrastructure Failure). Returns the claim, if any.
   */
  async function overshootClaim(f: FillUpdate): Promise<OvershootClaim | undefined> {
    let stop = f.cloid ? stops.get(f.cloid as Cloid) : undefined;
    if (!stop && f.asset && !(f.cloid && ownOrders.has(f.cloid))) {
      stop = [...stops.values()].find((s) => s.vaultId === f.vaultId && s.asset === f.asset);
    }
    if (!stop || stop.vaultId !== f.vaultId) return undefined;
    const overshoot = overshootUsdc(stop.side, stop.triggerPrice, f.price, f.size);
    if (overshoot <= 0) return undefined;
    const stopState = await exchange.orderStatus(stop.vaultId, stop.cloid);
    const infrastructureFailure = f.cloid === stop.cloid ? false : isInfrastructureFailure(stop, stopState, f.at);
    if (f.cloid !== stop.cloid && !infrastructureFailure) return undefined; // the stop rested; another close isn't Overshoot
    stops.delete(stop.cloid);
    const evidence = {
      stop: { cloid: stop.cloid, asset: stop.asset, side: stop.side, triggerPrice: stop.triggerPrice, placedAt: stop.placedAt, stateOnHyperCore: stopState },
      fill: { orderId: f.orderId, cloid: f.cloid ?? null, price: f.price, size: f.size, at: f.at },
      overshootUsdc: overshoot,
    };
    return {
      vaultId: f.vaultId,
      agentId: stop.agentId,
      positionId: stop.cloid,
      triggerPrice: stop.triggerPrice,
      fillPrice: f.price,
      size: f.size,
      infrastructureFailure,
      evidenceRef: JSON.stringify(evidence),
      vaultValueUsdc: await exchange.accountValue(f.vaultId),
    };
  }

  async function onFill(f: FillUpdate) {
    const claim = await overshootClaim(f);
    if (claim) {
      await chain.submitOvershootClaim(claim);
      await chain.reportExposure(stopExposureUsdc(stops.values()));
    }
    if (!(await exchange.positions(f.vaultId)).every((p) => p.size === 0)) return;
    // Flat: none of this Vault's stops protect anything any more.
    let dropped = false;
    for (const [cloid, s] of stops) if (s.vaultId === f.vaultId) dropped = stops.delete(cloid) || dropped;
    if (dropped) await chain.reportExposure(stopExposureUsdc(stops.values()));
    // Looser Mandate Versions take effect once the Vault is Flat; the chain side needs to hear it.
    await reportFlatNow(f.vaultId);
    completeLeadSwitch(f.vaultId);
  }

  /** A deferred Lead Agent switch completes once the Vault is Flat. */
  function completeLeadSwitch(vaultId: VaultId) {
    const lead = leads.get(vaultId);
    if (lead?.pendingAgentId) leads.set(vaultId, { agentId: lead.pendingAgentId, reason: lead.reason });
  }

  /**
   * Brings the Vault contract's Flat flag in line with the exchange. A stop-loss, a liquidation or a manual close can
   * empty a Vault with no fill event reaching the engine, and a restart forgets what was reported; without this the
   * contract would keep withdrawal locked (or, worse, unlocked while a position is open).
   * Stops are left alone here: they are the evidence for an Overshoot claim when the fill does arrive.
   */
  async function onPositionsSync(e: PositionsSync) {
    const flat = (await exchange.positions(e.vaultId)).every((p) => p.size === 0);
    await reportFlatIfChanged(e.vaultId, flat);
    if (flat) completeLeadSwitch(e.vaultId);
  }

  /**
   * Epoch (#17): settle each allocated Vault under the Lead Agent that led it, with its premium rate recalibrated from
   * its Mandate and the assets' volatility; then apply pending Lead Agent switches on Vaults that are Flat. One Vault
   * failing doesn't stop the others.
   */
  async function onEpochTick(e: EpochTick): Promise<HandleResult> {
    const at = now();
    const result = { kind: "epoch-settled" as const, epoch: e.epoch, settled: [] as EpochSettlement[], failed: [] as { vaultId: VaultId; error: string }[], switched: [] as VaultId[] };
    for (const [vaultId, lead] of leads) {
      try {
        const since = lastSettledAt.get(vaultId) ?? at - EPOCH_MS;
        const [mandate, valueUsdc, netFlowsUsdc, fills] = await Promise.all([
          chain.currentMandate(vaultId),
          exchange.accountValue(vaultId),
          exchange.netFlows(vaultId, since),
          exchange.fills(vaultId),
        ]);
        const settlement: EpochSettlement = {
          vaultId,
          epoch: e.epoch,
          valueUsdc,
          netFlowsUsdc,
          agentId: lead.agentId,
          premiumRate: premiumRate(mandate, e.dailyVolatility),
          tradedNotionalUsdc: fills.filter((f) => f.at > since && f.at <= at).reduce((n, f) => n + f.price * Math.abs(f.size), 0),
        };
        await chain.settleEpoch(settlement);
        lastSettledAt.set(vaultId, at);
        result.settled.push(settlement);
      } catch (err) {
        result.failed.push({ vaultId, error: (err as Error).message });
      }
      if (lead.pendingAgentId && (await isFlat(vaultId))) {
        leads.set(vaultId, { agentId: lead.pendingAgentId, reason: lead.reason });
        result.switched.push(vaultId);
      }
    }
    return result;
  }

  async function isFlat(vaultId: VaultId) {
    try {
      return (await exchange.positions(vaultId)).every((p) => p.size === 0);
    } catch {
      return false;
    }
  }

  function onVeto(v: Veto): HandleResult {
    const w = vetoWindows.get(v.proposalId);
    if (!w || w.proposal.vaultId !== v.vaultId) return { kind: "ignored" };
    vetoWindows.delete(v.proposalId);
    vetoedProposals.add(vetoKey(v.vaultId, v.proposalId));
    return { kind: "vetoed", proposalId: v.proposalId };
  }

  /** The window is over: check again at the current price, then send with the slippage cap or drop. */
  async function onVetoWindowEnd(e: VetoWindowEnd): Promise<HandleResult> {
    const w = vetoWindows.get(e.proposalId);
    if (!w || w.proposal.vaultId !== e.vaultId) return { kind: "ignored" };
    if (now() < w.pending.expiresAt) return windowResult(w.proposal.vaultId, w.pending);
    vetoWindows.delete(e.proposalId);
    return handleProposal(w.proposal, { markPrice: w.pending.markPrice });
  }

  function windowResult(vaultId: VaultId, pending: PendingVeto): HandleResult {
    return { kind: "veto-window", proposalId: pending.proposalId, vaultId, expiresAt: pending.expiresAt, pending };
  }

  /** `afterVeto` is set when the proposal comes back at the end of its Veto Window. */
  async function handleProposal(p: TradeProposal, afterVeto?: { markPrice: number }): Promise<HandleResult> {
    // Proposing the same trade again while it waits doesn't restart the window.
    const waiting = !afterVeto && vetoWindows.get(p.proposalId);
    if (waiting) return windowResult(p.vaultId, waiting.pending);
    // A vetoed trade stays vetoed, however often the agent proposes it again.
    if (vetoedProposals.has(vetoKey(p.vaultId, p.proposalId))) return { kind: "vetoed", proposalId: p.proposalId };

    const reject = (code: RejectionCode, message: string): HandleResult => ({
      kind: "rejected",
      proposalId: p.proposalId,
      rejection: { code, message },
    });

    const invalid = validate(p);
    if (invalid) return reject("invalid-proposal", invalid);

    const killedAt = killed.get(p.vaultId);
    if (killedAt !== undefined) {
      const m = await chain.currentMandate(p.vaultId).catch(() => undefined);
      if (m && m.version > killedAt && !m.killFlag) killed.delete(p.vaultId);
      else return reject("kill-switch", `The Kill Switch froze ${p.vaultId}: no trades until a new Mandate Version clears the kill flag`);
    }

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
    const notional = p.size * markPrice;
    // Checked on the size actually sent: the exchange rounds it down to the asset's size step, which can take an order
    // that looks big enough under the minimum after the Decision Commitment is already onchain.
    const sentNotional = (await exchange.orderSize(p.asset, p.size)) * markPrice;
    if (sentNotional < MIN_ORDER_USD) {
      return reject(
        "below-minimum-order",
        `Order value ${sentNotional.toFixed(2)} USDC (size rounded to the exchange's step) is under Hyperliquid's 10 USDC minimum (with rounding margin)`,
      );
    }

    // Above the veto threshold, a new position waits so the user can stop it. Reducing and closing never wait.
    if (!afterVeto && opens && notional > mandate.vetoThresholdUsdc) {
      const at = now();
      const pending: PendingVeto = {
        proposalId: p.proposalId,
        agentId: p.agentId,
        asset: p.asset,
        side: p.side,
        size: p.size,
        leverage: p.leverage,
        notional,
        markPrice,
        rationale: p.rationale,
        openedAt: at,
        expiresAt: at + vetoWindowMs,
      };
      vetoWindows.set(p.proposalId, { proposal: p, pending });
      return windowResult(p.vaultId, pending);
    }
    if (afterVeto) {
      const moved = Math.abs(markPrice / afterVeto.markPrice - 1);
      if (moved > vetoSlippageCap + 1e-12) {
        return reject(
          "price-moved",
          `${p.asset} moved ${(moved * 100).toFixed(2)}% during the Veto Window (cap ${(vetoSlippageCap * 100).toFixed(2)}%): dropped`,
        );
      }
    }

    const buying = (p.side === "long") === opens;
    const cap = afterVeto ? vetoSlippageCap : slippage;
    const limitPrice = markPrice * (buying ? 1 + cap : 1 - cap);
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
    if (stopLoss) {
      // The Vault is about to hold a position: lock withdrawal and make looser Mandate Versions wait, before the
      // order can fill. If the order then fails, the next positions-sync reports Flat again.
      try {
        await reportFlatIfChanged(p.vaultId, false);
      } catch (e) {
        return reject("order-failed", `Committed (${commitmentTx}) but the Vault couldn't be marked not-Flat onchain, so no order was sent: ${(e as Error).message}`);
      }
    }
    try {
      if (!stopLoss) {
        ownOrders.add(entryCloid);
        const order = await exchange.placeReduceOnly({ vaultId: p.vaultId, asset: p.asset, side: p.side, size: p.size, limitPrice, cloid: entryCloid });
        return { kind: "executed", proposalId: p.proposalId, decision, decisionHash, commitmentTx, order };
      }
      await exchange.setLeverage(p.vaultId, p.asset, p.leverage);
      ownOrders.add(entryCloid).add(stopLoss.cloid);
      const order = await exchange.placeOrderWithStopLoss({
        vaultId: p.vaultId,
        asset: p.asset,
        side: p.side,
        size: p.size,
        limitPrice,
        entryCloid,
        stopLoss,
      });
      stops.set(stopLoss.cloid, {
        vaultId: p.vaultId,
        agentId: p.agentId,
        asset: p.asset,
        side: p.side,
        size: p.size,
        triggerPrice: stopLoss.triggerPrice,
        cloid: stopLoss.cloid,
        placedAt: order.placedAt,
      });
      await chain.reportExposure(stopExposureUsdc(stops.values())).catch(() => {}); // Coverage Ratio only; never blocks a trade
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
        case "positions-sync":
          await onPositionsSync(event);
          return { kind: "handled" };
        case "price-tick":
          onPriceTick(event);
          return { kind: "handled" };
        case "fill":
          await onFill(event);
          return { kind: "handled" };
        case "allocation":
          onAllocation(event);
          return { kind: "handled" };
        case "veto":
          return onVeto(event);
        case "veto-window-end":
          return onVetoWindowEnd(event);
        case "epoch-tick":
          return onEpochTick(event);
        case "kill-switch":
          return onKillSwitch(event);
        default:
          return { kind: "ignored" };
      }
    },
    vaultStatus(vaultId) {
      const d = drawdown.get(vaultId);
      const ddKill = d && d.month === monthKey(now()) ? d.kill : undefined;
      const oracleKill = [...oracle.values()].find((o) => o.kill)?.kill;
      const automaticKill = ddKill ?? oracleKill;
      const leadAgent = leads.get(vaultId);
      const pendingVetoes = [...vetoWindows.values()].filter((w) => w.proposal.vaultId === vaultId).map((w) => w.pending);
      return {
        ...(automaticKill ? { automaticKill } : {}),
        ...(leadAgent ? { leadAgent } : {}),
        ...(pendingVetoes.length ? { pendingVetoes } : {}),
      };
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
  // Reducing and closing are always allowed: a tighter Mandate that drops an asset must not trap a position in it.
  if (p.intent === "open" && !m.allowedAssets.includes(p.asset)) {
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
