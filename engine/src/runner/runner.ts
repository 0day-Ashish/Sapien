// The engine's loop: for each Vault, read the market, classify the Regime, let the Allocator (Jev, rules-bounded)
// choose the Lead Agent, let that agent decide by its rules, have the rationale written, and pass the Trade Proposal
// through handle(event). Every tick is logged: the record is the track record, the replay source and the feed.

import { allocateWithJev, type JevAllocationDecision, type LeadSelector } from "../agents/jev-allocator.js";
import type { AgentProfile } from "../agents/allocator.js";
import { classifyRegime, REGIME_LOOKBACK, realizedVol, type RegimeReading } from "../agents/regime.js";
import type { AgentProposal, SpecialistAgent } from "../agents/specialist.js";
import type { MarketSnapshot, RationaleWriter } from "../agents/types.js";
import type { Engine, HandleResult, PendingVeto } from "../engine.js";
import type { TradeProposal } from "../events.js";
import type { ExchangePort } from "../ports.js";

export type MarketSource = { snapshot(asset: string): Promise<MarketSnapshot> };
export type RunnerVault = { vaultId: string; asset: string };

export type RunnerRecord = {
  at: number;
  vaultId: string;
  asset: string;
  regime?: RegimeReading["regime"];
  metrics?: RegimeReading["metrics"];
  markPrice?: number;
  allocation?: Pick<JevAllocationDecision, "leadAgentId" | "pendingLeadAgentId" | "reason" | "source" | "probabilities" | "confidence">;
  proposal?: TradeProposal;
  result?: HandleResult;
  note?: string;
  error?: string;
};

export type RunnerConfig = {
  engine: Engine;
  exchange: ExchangePort;
  market: MarketSource;
  vaults: RunnerVault[];
  roster: AgentProfile[];
  agents: SpecialistAgent[];
  select: LeadSelector;
  write?: RationaleWriter;
  /** The Vault's Mandate leverage cap, so agents size within it. Without it, agents use their own target. */
  leverageCap?: (vaultId: string) => Promise<number | undefined>;
  /** Which of these agents are below their Bond Minimum, so the Allocator doesn't hand them a Vault. */
  belowBondMinimum?: (agentIds: string[]) => Promise<Set<string>>;
  /** Whether the Vault's owner has set the Kill Switch elsewhere (NEAR). True sends the engine's `kill-switch` event: positions closed, trading frozen. */
  isKilled?: (vaultId: string) => Promise<boolean>;
  log: (r: RunnerRecord) => void;
  /** Called once when a trade enters its Veto Window, e.g. to alert the user. */
  onVetoWindow?: (vaultId: string, pending: PendingVeto) => void | Promise<void>;
  /** Wait before reading positions after a reduce/close, so the fill has landed. Default 3s. */
  fillDelayMs?: number;
  now?: () => number;
};

export function createRunner(c: RunnerConfig) {
  const now = c.now ?? Date.now;
  /** Trades already executed, as `vaultId proposalId`: an agent proposes the same trade every tick of its candle. */
  const executed = new Set<string>();
  /** Trades the user vetoed, likewise: skipped quietly after the first record. */
  const vetoed = new Set<string>();
  /** Veto Windows whose end is already scheduled, likewise. */
  const windows = new Set<string>();
  const key = (vaultId: string, proposalId: string) => `${vaultId} ${proposalId}`;

  /** At the window's end the engine checks again and sends or drops; the outcome is logged like any tick. */
  function scheduleWindowEnd(v: RunnerVault, proposal: TradeProposal, expiresAt: number) {
    const id = key(v.vaultId, proposal.proposalId);
    windows.add(id);
    setTimeout(async () => {
      const rec: RunnerRecord = { at: now(), vaultId: v.vaultId, asset: v.asset, proposal, note: "Veto Window ended" };
      try {
        rec.result = await c.engine.handle({ type: "veto-window-end", vaultId: v.vaultId, proposalId: proposal.proposalId });
        if (rec.result.kind === "executed") executed.add(id);
      } catch (e) {
        rec.error = (e as Error).message;
      } finally {
        windows.delete(id);
      }
      // "ignored" means the window was already closed by a veto or the Kill Switch, which logged it themselves.
      if (rec.result?.kind !== "ignored") c.log(rec);
    }, Math.max(0, expiresAt - now()));
  }

  const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

  /** Vaults whose Kill Switch closes went through; a refused one is tried again next tick. */
  const killHandled = new Set<string>();

  async function tickVault(v: RunnerVault): Promise<RunnerRecord> {
    const rec: RunnerRecord = { at: now(), vaultId: v.vaultId, asset: v.asset };
    if (c.isKilled) {
      if (await c.isKilled(v.vaultId).catch(() => false)) {
        if (killHandled.has(v.vaultId)) return { ...rec, note: "Kill Switch is set: trading frozen" };
        const result = await c.engine.handle({ type: "kill-switch", vaultId: v.vaultId });
        if (result.kind === "killed") killHandled.add(v.vaultId);
        return { ...rec, result, note: result.kind === "killed" ? "Kill Switch (set on NEAR)" : `Kill Switch refused: ${result.kind === "kill-refused" ? result.reason : result.kind}` };
      }
      killHandled.delete(v.vaultId);
    }
    const snap = await c.market.snapshot(v.asset);
    const reading = classifyRegime(snap);
    Object.assign(rec, { regime: reading.regime, metrics: reading.metrics, markPrice: snap.markPrice });

    // Keep the Vault contract's Flat flag true to the exchange: a stop-loss can empty the Vault between ticks.
    // A failure here (an RPC error, say) must not stop the tick; the next one tries again.
    await c.engine.handle({ type: "positions-sync", vaultId: v.vaultId }).catch((e) => {
      rec.note = `Flat flag not synced: ${(e as Error).message}`;
    });

    const positions = await c.exchange.positions(v.vaultId);
    const position = positions.find((p) => p.asset === v.asset)?.size ?? 0;
    const current = c.engine.vaultStatus(v.vaultId).leadAgent;
    const below = await c.belowBondMinimum?.(c.roster.map((a) => a.agentId)).catch(() => undefined);
    const alloc = await allocateWithJev(
      {
        regime: reading.regime,
        agents: c.roster,
        current: current?.agentId,
        vaultIsFlat: positions.every((p) => p.size === 0),
        ...(below ? { belowBondMinimum: below } : {}),
        market: { asset: v.asset, ...reading.metrics },
      },
      c.select,
    );
    rec.allocation = {
      leadAgentId: alloc.leadAgentId,
      reason: alloc.reason,
      source: alloc.source,
      ...(alloc.pendingLeadAgentId ? { pendingLeadAgentId: alloc.pendingLeadAgentId } : {}),
      ...(alloc.probabilities ? { probabilities: alloc.probabilities, confidence: alloc.confidence! } : {}),
    };
    if (alloc.leadAgentId !== current?.agentId || alloc.pendingLeadAgentId !== current?.pendingAgentId) {
      await c.engine.handle({ type: "allocation", vaultId: v.vaultId, leadAgentId: alloc.leadAgentId, reason: alloc.reason, ...(alloc.pendingLeadAgentId ? { pendingLeadAgentId: alloc.pendingLeadAgentId } : {}) });
    }

    const leadId = c.engine.vaultStatus(v.vaultId).leadAgent?.agentId;
    const agent = c.agents.find((a) => a.agentId === leadId);
    if (!agent) return { ...rec, note: leadId ? `Lead Agent ${leadId} isn't running here` : "No Lead Agent for this Regime" };

    const leverageCap = await c.leverageCap?.(v.vaultId).catch(() => undefined);
    const decided = agent.decide(snap, {
      vaultId: v.vaultId,
      accountValue: await c.exchange.accountValue(v.vaultId),
      position,
      ...(leverageCap !== undefined ? { leverageCap } : {}),
    });
    if (!decided) return rec;
    const id = key(v.vaultId, decided.proposalId);
    if (executed.has(id)) return { ...rec, note: `${decided.proposalId} already executed` };
    if (vetoed.has(id)) return { ...rec, note: `${decided.proposalId} was vetoed` };

    const explained: AgentProposal = c.write ? await agent.explain(decided, c.write) : decided;
    const { facts: _facts, ...proposal } = explained;
    rec.proposal = proposal;
    rec.result = await c.engine.handle(proposal);

    if (rec.result.kind === "veto-window" && !windows.has(id)) {
      scheduleWindowEnd(v, proposal, rec.result.expiresAt);
      await Promise.resolve(c.onVetoWindow?.(v.vaultId, rec.result.pending)).catch(() => {});
    }
    // The veto itself came in over HTTP and was logged there; from now on this trade is skipped without a record.
    if (rec.result.kind === "vetoed") vetoed.add(id);
    if (rec.result.kind === "executed") {
      executed.add(id);
      if (proposal.intent !== "open") {
        await sleep(c.fillDelayMs ?? 3_000);
        // The order is already placed and recorded as executed. If the follow-up (Flat report, exposure) fails, keep
        // the record and say so; the next tick's positions-sync reports Flat.
        try {
          await c.engine.handle({ type: "fill", vaultId: v.vaultId, orderId: rec.result.order.entryCloid, cloid: rec.result.order.entryCloid, price: snap.markPrice, size: proposal.size, at: now() });
        } catch (e) {
          rec.note = `Executed, but the follow-up after the fill failed: ${(e as Error).message}`;
        }
      }
    }
    return rec;
  }

  /** Realized daily volatility per Vault asset: stdev of 4h log returns, scaled to a day (x sqrt 6). */
  async function dailyVolatility() {
    const out: Record<string, number> = {};
    for (const asset of new Set(c.vaults.map((v) => v.asset))) {
      const closes = (await c.market.snapshot(asset)).candles4h.slice(-REGIME_LOOKBACK).map((k) => k.c);
      if (closes.length >= 2) out[asset] = realizedVol(closes) * Math.sqrt(6);
    }
    return out;
  }

  return {
    /** Epoch (#17): settle fees and premiums, recalibrate premiums, apply pending switches. One record per Vault. */
    async epoch(epoch: number) {
      try {
        const result = await c.engine.handle({ type: "epoch-tick", epoch, dailyVolatility: await dailyVolatility() });
        if (result.kind !== "epoch-settled") return;
        for (const v of c.vaults) {
          const failed = result.failed.find((f) => f.vaultId === v.vaultId);
          const settled = result.settled.find((s) => s.vaultId === v.vaultId);
          const switched = result.switched.includes(v.vaultId) ? `, Lead Agent switched to ${c.engine.vaultStatus(v.vaultId).leadAgent?.agentId}` : "";
          c.log({
            at: now(),
            vaultId: v.vaultId,
            asset: v.asset,
            result,
            note: `Epoch ${epoch} ${settled ? `settled at ${settled.valueUsdc} USDC, premium ${(settled.premiumRate * 1e4).toFixed(2)} bps` : "not settled"}${switched}`,
            ...(failed ? { error: failed.error } : {}),
          });
        }
      } catch (e) {
        for (const v of c.vaults) c.log({ at: now(), vaultId: v.vaultId, asset: v.asset, note: `Epoch ${epoch}`, error: (e as Error).message });
      }
    },
    async tick() {
      for (const v of c.vaults) {
        try {
          c.log(await tickVault(v));
        } catch (e) {
          c.log({ at: now(), vaultId: v.vaultId, asset: v.asset, error: (e as Error).message });
        }
      }
    },
  };
}
