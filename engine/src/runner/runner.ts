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
  log: (r: RunnerRecord) => void;
  /** Called once when a trade enters its Veto Window, e.g. to alert the user. */
  onVetoWindow?: (vaultId: string, pending: PendingVeto) => void | Promise<void>;
  /** Wait before reading positions after a reduce/close, so the fill has landed. Default 3s. */
  fillDelayMs?: number;
  now?: () => number;
};

export function createRunner(c: RunnerConfig) {
  const now = c.now ?? Date.now;
  const executed = new Set<string>();
  /** Veto Windows whose end is already scheduled, by proposalId. */
  const windows = new Set<string>();

  /** At the window's end the engine checks again and sends or drops; the outcome is logged like any tick. */
  function scheduleWindowEnd(v: RunnerVault, proposal: TradeProposal, expiresAt: number) {
    windows.add(proposal.proposalId);
    setTimeout(async () => {
      const rec: RunnerRecord = { at: now(), vaultId: v.vaultId, asset: v.asset, proposal, note: "Veto Window ended" };
      try {
        rec.result = await c.engine.handle({ type: "veto-window-end", vaultId: v.vaultId, proposalId: proposal.proposalId });
        if (rec.result.kind === "executed") executed.add(proposal.proposalId);
      } catch (e) {
        rec.error = (e as Error).message;
      } finally {
        windows.delete(proposal.proposalId);
      }
      c.log(rec);
    }, Math.max(0, expiresAt - now()));
  }

  const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

  async function tickVault(v: RunnerVault): Promise<RunnerRecord> {
    const rec: RunnerRecord = { at: now(), vaultId: v.vaultId, asset: v.asset };
    const snap = await c.market.snapshot(v.asset);
    const reading = classifyRegime(snap);
    Object.assign(rec, { regime: reading.regime, metrics: reading.metrics, markPrice: snap.markPrice });

    const positions = await c.exchange.positions(v.vaultId);
    const position = positions.find((p) => p.asset === v.asset)?.size ?? 0;
    const current = c.engine.vaultStatus(v.vaultId).leadAgent;
    const alloc = await allocateWithJev(
      { regime: reading.regime, agents: c.roster, current: current?.agentId, vaultIsFlat: positions.every((p) => p.size === 0), market: { asset: v.asset, ...reading.metrics } },
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

    const decided = agent.decide(snap, { vaultId: v.vaultId, accountValue: await c.exchange.accountValue(v.vaultId), position });
    if (!decided) return rec;
    if (executed.has(decided.proposalId)) return { ...rec, note: `${decided.proposalId} already executed` };

    const explained: AgentProposal = c.write ? await agent.explain(decided, c.write) : decided;
    const { facts: _facts, ...proposal } = explained;
    rec.proposal = proposal;
    rec.result = await c.engine.handle(proposal);

    if (rec.result.kind === "veto-window" && !windows.has(proposal.proposalId)) {
      scheduleWindowEnd(v, proposal, rec.result.expiresAt);
      await Promise.resolve(c.onVetoWindow?.(v.vaultId, rec.result.pending)).catch(() => {});
    }
    if (rec.result.kind === "executed") {
      executed.add(proposal.proposalId);
      if (proposal.intent !== "open") {
        await sleep(c.fillDelayMs ?? 3_000);
        await c.engine.handle({ type: "fill", vaultId: v.vaultId, orderId: rec.result.order.entryCloid, cloid: rec.result.order.entryCloid, price: snap.markPrice, size: proposal.size, at: now() });
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
