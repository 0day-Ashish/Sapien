// Where the engine's HyperEVM work meets the Sapien Contract. `wrap` decorates a ChainPort so that
//   - a Vault whose NEAR account set the Kill Switch reads as having its kill flag set, which is what the engine's
//     existing Kill Switch path requires (a `kill-switch` event closes every position and freezes the Lead Agent);
//   - every Decision Commitment is also logged on NEAR with the same 32-byte hash (failure never stops trading);
//   - the Builder share an Epoch settlement paid out is also paid to the agent's NEAR account via `pay_agent`.
// Vaults with no NEAR account (bound before the pivot) pass through untouched.
//
// The Kill Switch is one-way for a session: the engine freezes a Vault until a later Mandate Version clears the kill
// flag, and `set_killed(false)` on NEAR doesn't make a new version. Restart the engine (or publish a new Mandate) to resume.

import type { NearPort } from "../adapters/near.js";
import type { ChainPort } from "../ports.js";

export type NearLinkConfig = {
  near: NearPort;
  /** The NEAR account that owns a HyperEVM Vault, if the engine knows it. */
  accountOf: (vaultId: string) => string | undefined;
  log?: (message: string) => void;
  /** How long a `killed` reading is reused. Default 5s: currentMandate is read several times per proposal. */
  killTtlMs?: number;
  now?: () => number;
};

export function createNearLink(c: NearLinkConfig) {
  const log = c.log ?? ((m: string) => console.warn(m));
  const now = c.now ?? Date.now;
  const ttl = c.killTtlMs ?? 5_000;
  const killed = new Map<string, { at: number; value: boolean }>();
  let agents: { at: number; ids: Set<string> } | undefined;

  /** The NEAR Kill Switch for a Vault. If NEAR can't be read, the last known value stands (false at first): an RPC blip shouldn't halt trading. */
  async function isKilled(vaultId: string): Promise<boolean> {
    const account = c.accountOf(vaultId);
    if (!account) return false;
    const key = vaultId.toLowerCase();
    const hit = killed.get(key);
    if (hit && now() - hit.at < ttl) return hit.value;
    try {
      const value = (await c.near.vaultOf(account))?.killed ?? false;
      killed.set(key, { at: now(), value });
      return value;
    } catch (e) {
      log(`NEAR vault_of(${account}) failed, keeping last Kill Switch reading: ${(e as Error).message}`);
      return hit?.value ?? false;
    }
  }

  async function nearAgents(): Promise<Set<string>> {
    if (!agents || now() - agents.at > 60_000) agents = { at: now(), ids: new Set((await c.near.agents()).map(([id]) => id)) };
    return agents.ids;
  }

  function wrap(inner: ChainPort): ChainPort {
    return {
      async currentMandate(vaultId) {
        const m = await inner.currentMandate(vaultId);
        return !m.killFlag && (await isKilled(vaultId)) ? { ...m, killFlag: true } : m;
      },
      async commitDecision(commitment) {
        const result = await inner.commitDecision(commitment);
        const account = c.accountOf(commitment.vaultId);
        if (account) {
          // Not awaited: the order waits for the HyperEVM commitment only. NEAR writes are queued in the adapter.
          void c.near.logDecision(account, commitment.agentId, commitment.decisionHash).catch((e) => log(`NEAR log_decision failed for ${commitment.decisionHash}: ${(e as Error).message}`));
        }
        return result;
      },
      isFlat: (v) => inner.isFlat(v),
      reportFlat: (v, flat) => inner.reportFlat(v, flat),
      submitOvershootClaim: (claim) => inner.submitOvershootClaim(claim),
      reportExposure: (t) => inner.reportExposure(t),
      meetsBondMinimum: (a) => inner.meetsBondMinimum(a),
      async settleEpoch(s) {
        const result = await inner.settleEpoch(s);
        const amount = result?.builderSubunits ?? 0n;
        if (s.agentId && amount > 0n) {
          try {
            if ((await nearAgents()).has(s.agentId)) await c.near.payAgent(s.agentId, amount, `epoch ${s.epoch}`);
          } catch (e) {
            log(`NEAR pay_agent(${s.agentId}, ${amount}) failed: ${(e as Error).message}`);
          }
        }
        return result;
      },
    };
  }

  return { isKilled, wrap };
}
