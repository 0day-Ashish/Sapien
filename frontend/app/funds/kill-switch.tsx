"use client";

import { useState } from "react";
import type { Address } from "viem";
import { hyperClient } from "@/lib/hyperevm";
import { nearTxUrl } from "@/lib/near/config";
import { setKilledTx, txHash } from "@/lib/near/tx";
import { requestKill } from "@/lib/vault/kill";
import { vaultAbi } from "@/lib/vault/funds";
import { useNearWallet } from "../near-wallet";
import { Steps, errorText, shortHash, sleep, type Step } from "./steps";

/**
 * Kill Switch: one confirmed click sets the kill flag on NEAR (signed in the wallet). The engine reads it, closes every
 * position, freezes the Lead Agent and reports the Vault Flat, which unlocks withdrawal. Turning it off lets agents trade again.
 */
export function KillSwitch({ evmVault, killed, refresh }: { evmVault: Address; killed: boolean; refresh: () => Promise<unknown> }) {
  const { send } = useNearWallet();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function kill() {
    setBusy(true);
    setError(null);
    const s: Step[] = [
      { label: "Kill Switch set on NEAR", state: "active" },
      { label: "Positions closed by the engine", state: "pending" },
      { label: "Vault Flat: withdrawal unlocked", state: "pending" },
    ];
    const show = () => setSteps(s.map((x) => ({ ...x })));
    show();
    try {
      const tx = txHash(await send(setKilledTx(true)));
      s[0] = { ...s[0], state: "done", detail: tx ? shortHash(tx) : undefined, href: tx ? nearTxUrl(tx) : undefined };
      s[1] = { ...s[1], state: "active" };
      show();
      void refresh();

      // The engine acts on the NEAR flag by itself; this asks it to act now, and a refusal just means it hasn't read the flag yet.
      const result = await requestKill(evmVault).catch(() => null);
      s[1] = {
        ...s[1],
        state: result?.kind === "killed" ? "done" : "active",
        detail:
          result?.kind === "killed"
            ? result.closes.length
              ? result.closes.map((c) => `${c.side} ${c.size} ${c.asset}`).join(", ")
              : "none were open"
            : "waiting for the engine to read the flag",
      };
      s[2] = { ...s[2], state: "active" };
      show();

      for (let i = 0; i < 60; i++) {
        const flat = await hyperClient.readContract({ address: evmVault, abi: vaultAbi, functionName: "isFlat" });
        if (flat) {
          s[1] = { ...s[1], state: "done", detail: s[1].detail === "waiting for the engine to read the flag" ? undefined : s[1].detail };
          s[2] = { ...s[2], state: "done" };
          show();
          await refresh();
          return;
        }
        await sleep(3000);
      }
      throw new Error("The Kill Switch is set, but the Vault isn't reported Flat yet. The engine keeps closing positions; check back in a moment.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  async function resume() {
    setBusy(true);
    setError(null);
    try {
      await send(setKilledTx(false));
      setSteps(null);
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-orange/40 bg-orange-soft/50 p-5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="display-3">Kill Switch</h2>
        {killed ? <span className="chip chip-clay">On</span> : <span className="chip chip-forest">Off</span>}
      </div>
      {killed ? (
        <>
          <p>
            The Kill Switch is on. The engine opens nothing and closes every position, and agents stay frozen until you turn it off.
          </p>
          <div>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void resume()}>
              {busy ? "Turning off…" : "Turn off Kill Switch"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            Closes all open positions at market, freezes the Lead Agent and unlocks withdrawal. It is recorded on NEAR in the
            contract, and signed in your wallet.
          </p>
          <div className="flex flex-wrap gap-3">
            {!confirming ? (
              <button type="button" className="btn border-orange bg-orange text-white hover:bg-orange/90" disabled={busy} onClick={() => setConfirming(true)}>
                Kill Switch
              </button>
            ) : (
              <>
                <button type="button" className="btn border-orange bg-orange text-white hover:bg-orange/90" disabled={busy} onClick={() => void kill()}>
                  {busy ? "Closing…" : "Close every position"}
                </button>
                {!busy && (
                  <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
                    Cancel
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
      {steps && <Steps steps={steps} />}
      {error && (
        <p role="alert" className="text-orange">
          {error}
        </p>
      )}
    </section>
  );
}
