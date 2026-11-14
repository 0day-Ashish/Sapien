// Step 4: the contract registers the Agent Wallet through CoreWriter action 9 (add API wallet).
// Primitive 2 of #4. CoreWriter returns nothing, so success is read back from HyperCore.
import { agent, contract, evm, info, ownerEvm, record, SPIKE_ABI, waitFor } from "./lib.ts";

const c = contract();
const a = agent().address;
const name = process.env.AGENT_NAME ?? "spike";

record("4a.extraAgentsBefore", await info.extraAgents({ user: c }));

const hash = await ownerEvm().writeContract({ address: c, abi: SPIKE_ABI, functionName: "addApiWallet", args: [a, name] });
const receipt = await evm.waitForTransactionReceipt({ hash });
console.log(`addApiWallet EVM tx ${hash} (${receipt.status}), gas ${receipt.gasUsed}`);

const t0 = Date.now();
const agents = await waitFor("agent to appear in extraAgents", async () => {
  const list = await info.extraAgents({ user: c });
  return list.some((x) => x.address.toLowerCase() === a.toLowerCase()) ? list : undefined;
});
record("4b.addApiWallet", {
  evmTx: hash,
  status: receipt.status,
  registered: Boolean(agents),
  secondsUntilVisible: agents ? Math.round((Date.now() - t0) / 1000) : null,
  extraAgents: agents ?? (await info.extraAgents({ user: c })),
});
record("4c.agentRoleAfter", await info.userRole({ user: a }));
