"use client";

import { useState } from "react";
import type { Mandate } from "@/lib/mandate/schema";
import { nearTxUrl } from "@/lib/near/config";
import { postNearMandate } from "@/lib/near/engine";
import { mandateHashOf, mandatePayload } from "@/lib/near/mandate";
import { commitMandateTx, txHash } from "@/lib/near/tx";
import type { VaultRecord } from "@/lib/near/view";
import { useNearWallet } from "../near-wallet";
import { useNearVault } from "../use-near-vault";

// Create a Vault, then commit the Mandate on NEAR: the user's wallet commits sha256 of the Mandate JSON to the contract,
// and the engine gets the same JSON (it refuses one whose hash differs from the committed one).

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/** Below a confirmed Mandate: create the Vault if there's none, then commit the Mandate with the NEAR wallet. */
export function SignMandate({ mandate }: { mandate: Mandate }) {
  const { accountId, send } = useNearWallet();
  const { vault, record, create, refresh } = useNearVault();
  const [busy, setBusy] = useState<"create" | "sign" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ label: string; tx?: string }[]>([]);

  async function run(kind: "create" | "sign", fn: () => Promise<{ label: string; tx?: string }>) {
    setBusy(kind);
    setError(null);
    try {
      const step = await fn();
      setDone((d) => [...d, step]);
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const createVault = () =>
    run("create", async () => {
      await create();
      return { label: "Vault created" };
    });

  const commit = () =>
    run("sign", async () => {
      if (!accountId) throw new Error("Connect your wallet first");
      // One object: hashed here, committed on NEAR, then sent to the engine as the very same JSON.
      const payload = mandatePayload(mandate);
      const hash = mandateHashOf(payload);
      const tx = txHash(await send(commitMandateTx(hash)));
      await postNearMandate(accountId, payload);
      return { label: "Mandate committed on NEAR", tx };
    });

  if (!accountId) return <p className="text-violet/70">Connect your Meteor Wallet to create your Vault and commit this Mandate.</p>;
  return (
    <div className="flex flex-col gap-3">
      <p>
        NEAR account: <span className="font-mono break-all">{accountId}</span>
      </p>
      {vault === undefined && <p className="text-violet/70">Looking up your Vault…</p>}
      {vault === null && (
        <button type="button" className="btn btn-primary self-start" disabled={busy !== null} onClick={createVault}>
          {busy === "create" ? "Creating your Vault…" : "Create Vault"}
        </button>
      )}
      {vault && (
        <>
          <p>
            Your Vault: <span className="font-mono break-all">{vault.evmVault}</span>
          </p>
          <button type="button" className="btn btn-primary self-start" disabled={busy !== null} onClick={commit}>
            {busy === "sign" ? "Committing…" : "Commit Mandate on NEAR"}
          </button>
        </>
      )}
      {done.map((d, i) => (
        <p key={i}>
          <span className="chip chip-forest">{d.label}</span>{" "}
          {d.tx && (
            <a className="font-mono text-xs underline" href={nearTxUrl(d.tx)} target="_blank" rel="noreferrer">
              {d.tx.slice(0, 10)}…
            </a>
          )}
        </p>
      ))}
      {error && (
        <p role="alert" className="text-orange">
          {error}
        </p>
      )}
      {record && <MandateOnNear record={record} />}
    </div>
  );
}

/** The Mandate hash the user committed on NEAR (each new Mandate replaces it), and the Kill Switch state. */
export function MandateOnNear({ record }: { record: VaultRecord }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="label-mono">Mandate on NEAR</p>
      {record.mandate_hash ? (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3 text-ink">
          <span className="chip chip-forest">Committed</span>
          <span className="w-full truncate font-mono text-xs text-ink-faint" title={record.mandate_hash}>
            sha256 {record.mandate_hash}
          </span>
        </p>
      ) : (
        <p className="text-ink-soft">No Mandate committed for this Vault yet.</p>
      )}
      {record.killed && <span className="chip chip-clay self-start">Kill Switch on</span>}
    </div>
  );
}
