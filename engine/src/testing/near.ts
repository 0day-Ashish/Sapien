// In-memory fake of the NearPort (the Sapien Contract). Tests assert on what it recorded.

import type { NearConfig, NearDeposit, NearPort, NearVault, NearWithdrawal } from "../adapters/near.js";

export class FakeNear implements NearPort {
  deposits: (NearDeposit | null)[] = [];
  withdrawals: NearWithdrawal[] = [];
  vaults = new Map<string, NearVault>();
  agentList: [string, string][] = [["momentum", "momentum.agents.sapien-vault.testnet"]];
  registered: { account: string; evmVault: string }[] = [];
  paidWithdrawals: { id: number; amount: bigint }[] = [];
  decisions: { account: string; agentId: string; hash: string }[] = [];
  agentPayouts: { agentId: string; amount: bigint; memo: string }[] = [];
  /** Makes pay_withdraw report a failed transfer. */
  payWithdrawFails = false;
  failLogDecision = false;
  failPayAgent = false;
  vaultOfCalls = 0;

  async config(): Promise<NearConfig> {
    return { deposits: this.deposits.length, withdrawals: this.withdrawals.length, decisions: this.decisions.length, owner: "o", engine: "e", usdc: "u" };
  }
  async deposit(id: number) {
    return this.deposits[id] ?? null;
  }
  async withdrawal(id: number) {
    return this.withdrawals[id] ?? null;
  }
  async vaultOf(account: string) {
    this.vaultOfCalls++;
    return this.vaults.get(account) ?? null;
  }
  async agents() {
    return this.agentList;
  }
  async registerVault(account: string, evmVault: string) {
    this.registered.push({ account, evmVault });
    this.vaults.set(account, { evmVault, mandateHash: null, killed: false, deposited: 0n, withdrawn: 0n });
  }
  async payWithdraw(id: number, amount: bigint) {
    if (this.payWithdrawFails) return false;
    this.paidWithdrawals.push({ id, amount });
    this.withdrawals[id] = { ...this.withdrawals[id]!, status: "Paid", paid: amount };
    return true;
  }
  async logDecision(account: string, agentId: string, hash: string) {
    if (this.failLogDecision) throw new Error("near down");
    this.decisions.push({ account, agentId, hash });
  }
  async payAgent(agentId: string, amount: bigint, memo: string) {
    if (this.failPayAgent) throw new Error("near down");
    this.agentPayouts.push({ agentId, amount, memo });
  }
}
