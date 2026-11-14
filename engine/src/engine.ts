import { createHash, randomBytes } from "node:crypto";
import type { EngineEvent, TradeProposal } from "./events.js";
import type { Cloid, Mandate, PlacedOrder, Ports } from "./ports.js";

export type RejectionCode =
  | "invalid-proposal"
  | "kill-flag"
  | "asset-not-allowed"
  | "leverage-over-cap"
  | "below-bond-minimum"
  | "commitment-failed";

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

export type HandleResult =
  | { kind: "ignored" }
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

export type Engine = { handle(event: EngineEvent): Promise<HandleResult> };

export type EngineOptions = {
  /** Worst entry price as a fraction past the mark (IOC limit). */
  entrySlippage?: number;
  newCloid?: () => Cloid;
};

const DEFAULT_ENTRY_SLIPPAGE = 0.01;

export function createEngine(ports: Ports, options: EngineOptions = {}): Engine {
  const { exchange, chain } = ports;
  const slippage = options.entrySlippage ?? DEFAULT_ENTRY_SLIPPAGE;
  const newCloid = options.newCloid ?? (() => `0x${randomBytes(16).toString("hex")}` as Cloid);

  async function handleProposal(p: TradeProposal): Promise<HandleResult> {
    const reject = (code: RejectionCode, message: string): HandleResult => ({
      kind: "rejected",
      proposalId: p.proposalId,
      rejection: { code, message },
    });

    const invalid = validate(p);
    if (invalid) return reject("invalid-proposal", invalid);

    const mandate = await chain.currentMandate(p.vaultId);
    const failed = mandateCheck(p, mandate);
    if (failed) return reject(failed.code, failed.message);

    const opens = p.intent === "open";
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
  }

  return {
    async handle(event) {
      switch (event.type) {
        case "trade-proposal":
          return handleProposal(event);
        default:
          // Veto Window (#10), Kill Switch (#9), Automatic Kill (#11), fills and Overshoot (#15), epochs (#17).
          return { kind: "ignored" };
      }
    },
  };
}

function validate(p: TradeProposal): string | undefined {
  if (!p.proposalId) return "proposalId is required";
  if (!(Number.isFinite(p.size) && p.size > 0)) return `size must be a positive number, got ${p.size}`;
  if (!(Number.isFinite(p.leverage) && p.leverage >= 1)) return `leverage must be at least 1, got ${p.leverage}`;
  return undefined;
}

/** Mandate Check rules shipped in #8. Blackout windows, Automatic Kill and Mandate Version effectiveness land in #11. */
function mandateCheck(p: TradeProposal, m: Mandate): Rejection | undefined {
  if (m.killFlag) return { code: "kill-flag", message: "The Vault's kill flag is set; no new trades" };
  if (!m.allowedAssets.includes(p.asset)) {
    return { code: "asset-not-allowed", message: `${p.asset} is not allowed by Mandate v${m.version} (allowed: ${m.allowedAssets.join(", ")})` };
  }
  if (p.intent === "open" && p.leverage > m.leverageCap) {
    return { code: "leverage-over-cap", message: `Leverage ${p.leverage}x is over the Mandate v${m.version} cap of ${m.leverageCap}x` };
  }
  return undefined;
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
