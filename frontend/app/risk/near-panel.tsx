"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NEAR_CONTRACT, nearAccountUrl } from "@/lib/near/config";
import { agentAccounts, contractConfig, vaultOf, type ContractConfig, type VaultRecord } from "@/lib/near/view";
import { useNearWallet } from "../near-wallet";

const ENGINE_METHODS = ["register_vault", "pay_withdraw", "log_decision", "pay_agent"];

const link = (account: string) => (
  <a className="font-mono text-xs text-violet underline break-all" href={nearAccountUrl(account)} target="_blank" rel="noreferrer">
    {account}
  </a>
);

/** What lives on NEAR: the engine's limited key, your Mandate hash and Kill Switch, and the agents' payout accounts. */
export function OnNear() {
  const { accountId } = useNearWallet();
  const [config, setConfig] = useState<ContractConfig | null>(null);
  const [agents, setAgents] = useState<[string, string][] | null>(null);
  const [mine, setMine] = useState<{ account: string; record: VaultRecord | null } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      void contractConfig().then(setConfig, () => {});
      void agentAccounts().then(setAgents, () => {});
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!accountId) return;
    let live = true;
    void vaultOf(accountId).then(
      (record) => live && setMine({ account: accountId, record }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [accountId]);

  const record = accountId && mine?.account === accountId ? mine.record : undefined;

  return (
    <div className="flex flex-col gap-4">
      <p>
        On testnet, the money and the controls you hold sit in a contract on NEAR, {link(NEAR_CONTRACT)}. This is what it does and
        who can touch it.
      </p>
      <dl className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <dt className="font-medium text-ink">The engine&apos;s key is limited</dt>
          <dd>
            The Execution Engine signs with a function-call key, not a full-access key. It can call only {ENGINE_METHODS.length} methods on
            the contract ({ENGINE_METHODS.map((m, i) => (
              <span key={m}>
                {i > 0 && ", "}
                <code className="font-mono text-xs">{m}</code>
              </span>
            ))}
            ). It cannot move your wallet&apos;s USDC or change your Mandate or Kill Switch.
            {config && <> Engine account: {link(config.engine)}.</>}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="font-medium text-ink">Your Mandate hash is on NEAR</dt>
          <dd>
            When you commit a Mandate, its sha256 is stored on the contract, and the engine refuses a Mandate that doesn&apos;t match it.
            {accountId ? (
              record === undefined ? (
                <> Reading yours…</>
              ) : record?.mandate_hash ? (
                <>
                  {" "}
                  Yours: <span className="font-mono text-xs break-all">{record.mandate_hash}</span>
                </>
              ) : (
                <> You haven&apos;t committed one yet.</>
              )
            ) : (
              <> Connect your wallet to see yours.</>
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="font-medium text-ink">The Kill Switch is on NEAR</dt>
          <dd>
            You set it in your own wallet (<code className="font-mono text-xs">set_killed</code>). While it is on, the engine opens nothing and
            closes every position.
            {accountId && record !== undefined && (
              <>
                {" "}
                Yours is currently{" "}
                <strong>{record ? (record.killed ? "on" : "off") : "not set up (no Vault yet)"}</strong>. Flip it on the{" "}
                <Link className="text-violet underline" href="/funds">
                  funds page
                </Link>
                .
              </>
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="font-medium text-ink">Agents are paid on NEAR</dt>
          <dd>
            {agents === null ? (
              "Reading the payout accounts…"
            ) : agents.length === 0 ? (
              "No agent payout accounts are registered yet."
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {agents.map(([id, account]) => (
                  <li key={id} className="flex flex-wrap items-center gap-2">
                    <span className="chip">{id}</span>
                    {link(account)}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
