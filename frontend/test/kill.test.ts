import { describe, expect, it } from "vitest";
import { requestKill } from "../lib/vault/kill";
import { setKilledTx } from "../lib/near/tx";

const vault = "0x00000000000000000000000000000000000000aa";

describe("Kill Switch", () => {
  it("is set_killed on the Sapien contract, with no deposit", () => {
    const tx = setKilledTx(true);
    expect(tx.receiverId).toBe("sapien-vault.testnet");
    expect(tx.actions[0].params).toMatchObject({ methodName: "set_killed", args: { killed: true }, deposit: "0" });
  });

  it("returns the engine's refusal instead of throwing", async () => {
    const reply = (async () =>
      new Response(JSON.stringify({ kind: "kill-refused", reason: "flag not set" }), { status: 409 })) as unknown as typeof fetch;
    expect(await requestKill(vault, reply)).toEqual({ kind: "kill-refused", reason: "flag not set" });
  });

  it("throws on other engine errors", async () => {
    const reply = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    await expect(requestKill(vault, reply)).rejects.toThrow("Engine 500");
  });
});
