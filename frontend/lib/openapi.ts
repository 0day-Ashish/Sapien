import { PRODUCT_NAME } from "./brand";
import { SITE_URL } from "./site";

// /openapi.json: the public read-only API under /api/v1, for agents and tools that import OpenAPI.

const str = { type: "string" } as const;
const int = { type: "integer" } as const;
const bool = { type: "boolean" } as const;
const usdc = { type: "string", description: "USDC in subunits (6 decimals), as a decimal string." } as const;
const e8 = { type: "string", description: "Fixed point with 8 decimals, as a decimal string." } as const;
const evm = { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" } as const;
const b32 = { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" } as const;
const anyObj = { type: "object", additionalProperties: true } as const;

const ok = (description: string, schema: object) => ({ description, content: { "application/json": { schema } } });
const errors = {
  "400": { $ref: "#/components/responses/Error" },
  "502": { $ref: "#/components/responses/Error" },
};
const q = (name: string, description: string, schema: object = str) => ({ name, in: "query", required: false, description, schema });
const p = (name: string, description: string, schema: object = str) => ({ name, in: "path", required: true, description, schema });

export function openApi() {
  return {
    openapi: "3.1.0",
    info: {
      title: `${PRODUCT_NAME} public API`,
      version: "1.0.0",
      summary: "Read-only data on agents, decisions, payouts and NEAR Vaults.",
      description:
        `${PRODUCT_NAME}: bonded AI agents trade perps on Hyperliquid for a user's Vault, under a Mandate the user signs. ` +
        "This API is read-only and needs no key. Anything that moves money or changes a Vault is signed by the user's own NEAR wallet " +
        "in the app (/funds, /mandate), never through this API. All networks are testnets.",
      license: { name: "MIT", identifier: "MIT" },
    },
    servers: [{ url: SITE_URL }],
    externalDocs: { description: "Docs index for language models", url: `${SITE_URL}/llms.txt` },
    tags: [
      { name: "Agents", description: "Specialist Agents and their decisions." },
      { name: "Verification", description: "Check any decision against its onchain Decision Commitment." },
      { name: "Protection", description: "Overshoot settlements from the ProtectionFund on HyperEVM." },
      { name: "NEAR", description: "The Sapien contract on NEAR testnet." },
    ],
    paths: {
      "/api/v1/feed": {
        get: {
          tags: ["Agents"],
          operationId: "getFeed",
          summary: "Latest agent decisions",
          description: "Each tick's market regime, Lead Agent, proposal, Mandate Check and result, newest first.",
          parameters: [q("vault", "Only this Vault (0x address).", evm), q("limit", "How many, up to 500. Default 50.", int)],
          responses: { "200": ok("Decisions", { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/FeedItem" } } } }), ...errors },
        },
      },
      "/api/v1/decisions": {
        get: {
          tags: ["Agents", "Verification"],
          operationId: "getDecisions",
          summary: "Executed decisions",
          description: "Decisions that became orders, with the Decision Commitment hash and the commitment transaction, newest first.",
          parameters: [q("vault", "Only this Vault.", evm), q("hash", "Only the decision with this hash.", b32), q("limit", "How many, up to 1000. Default 200.", int)],
          responses: { "200": ok("Decisions", { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/FeedItem" } } } }), ...errors },
        },
      },
      "/api/v1/decisions/verify": {
        get: {
          tags: ["Verification"],
          operationId: "verifyDecision",
          summary: "Verify a Decision Commitment",
          description: "Fetches the logged decision, re-hashes it the way the engine does, and checks that exact hash on the DecisionLog contract. `verified` is true only when both hold.",
          parameters: [{ ...q("hash", "The Decision Commitment hash.", b32), required: true }],
          responses: { "200": ok("Verification", { $ref: "#/components/schemas/Verification" }), ...errors },
        },
      },
      "/api/v1/leaderboard": {
        get: {
          tags: ["Agents"],
          operationId: "getLeaderboard",
          summary: "Agent leaderboard",
          description: "Specialist Agents with Bond, risk-adjusted return, proposals, fills and the Vaults they lead.",
          responses: { "200": ok("Rows", { type: "object", properties: { rows: { type: "array", items: anyObj }, at: { ...int, description: "Unix ms." } } }), ...errors },
        },
      },
      "/api/v1/vaults/{vault}/status": {
        get: {
          tags: ["Agents"],
          operationId: "getVaultStatus",
          summary: "Vault status",
          description: "The Vault's Lead Agent and any Automatic Kill.",
          parameters: [p("vault", "The Vault's HyperEVM address.", evm)],
          responses: { "200": ok("Status", anyObj), ...errors },
        },
      },
      "/api/v1/payouts": {
        get: {
          tags: ["Protection"],
          operationId: "listPayouts",
          summary: "Overshoot settlements",
          description: "Every settlement, newest first, with who paid (Bond, Protocol Reserve, Protection Fund), plus the Fund's live Coverage Ratio.",
          responses: {
            "200": ok("Payouts", {
              type: "object",
              properties: {
                protectionFund: evm,
                coverageRatioBps: { ...str, description: "Fund balance over open exposure, in basis points." },
                fundBalance: usdc,
                reserveBalance: usdc,
                openExposure: usdc,
                items: { type: "array", items: { $ref: "#/components/schemas/Settlement" } },
              },
            }),
            ...errors,
          },
        },
      },
      "/api/v1/payouts/{id}": {
        get: {
          tags: ["Protection"],
          operationId: "getPayout",
          summary: "One Overshoot settlement",
          description: "One settlement with its parsed evidence (the stop-loss, its fill and their sources).",
          parameters: [p("id", "Position id: the stop-loss cloid as bytes32.", b32)],
          responses: { "200": ok("Settlement", { $ref: "#/components/schemas/Settlement" }), "404": { $ref: "#/components/responses/Error" }, ...errors },
        },
      },
      "/api/v1/near/config": {
        get: {
          tags: ["NEAR"],
          operationId: "getNearConfig",
          summary: "Sapien contract config",
          description: "The contract's owner, the engine's account, the USDC token, the deposit/withdrawal/decision counters and each agent's payout account.",
          responses: { "200": ok("Config", anyObj), ...errors },
        },
      },
      "/api/v1/near/vaults/{account}": {
        get: {
          tags: ["NEAR"],
          operationId: "getNearVault",
          summary: "A NEAR account's Vault",
          description: "The HyperEVM Vault bound to this NEAR account, its committed Mandate hash, Kill Switch state and lifetime deposits and withdrawals.",
          parameters: [p("account", "NEAR account id, e.g. e2e.sapien-vault.testnet.")],
          responses: {
            "200": ok("Vault", {
              type: "object",
              properties: { account: str, contract: str, evm_vault: evm, mandate_hash: { type: ["string", "null"] }, killed: bool, deposited: usdc, withdrawn: usdc },
            }),
            "404": { $ref: "#/components/responses/Error" },
            ...errors,
          },
        },
      },
      "/api/intents/quote": {
        get: {
          tags: ["NEAR"],
          operationId: "getIntentsQuote",
          summary: "NEAR Intents deposit quote",
          description: "A live 1Click quote for NEAR USDC → HyperCore USDC, the mainnet deposit route. Requested with dry: true, so nothing moves.",
          parameters: [{ ...q("amount", "USDC, decimal, e.g. 5."), required: true }],
          responses: { "200": ok("Quote", { type: "object", properties: { amountIn: usdc, amountOut: usdc, fee: usdc, etaSeconds: int } }), ...errors },
        },
      },
    },
    components: {
      responses: { Error: ok("Error", { type: "object", properties: { error: str }, required: ["error"] }) },
      schemas: {
        FeedItem: {
          type: "object",
          additionalProperties: true,
          properties: {
            at: { ...int, description: "Unix ms." },
            vaultId: evm,
            asset: str,
            regime: { type: "string", enum: ["trend", "chop", "high-volatility", "funding-skew"] },
            allocation: anyObj,
            proposal: anyObj,
            result: { type: "object", additionalProperties: true, properties: { kind: str, decisionHash: b32, commitmentTx: b32 } },
          },
        },
        Verification: {
          type: "object",
          properties: {
            hash: b32,
            decisionLog: evm,
            decisionFound: bool,
            recomputed: b32,
            matchesLog: bool,
            onchain: { type: "object", properties: { committed: bool, at: { ...int, description: "Unix seconds." } } },
            verified: bool,
            decision: anyObj,
          },
        },
        Settlement: {
          type: "object",
          properties: {
            id: b32,
            vault: evm,
            agentId: str,
            epoch: str,
            settledAt: { ...str, description: "Unix seconds." },
            infrastructureFailure: bool,
            triggerPriceE8: e8,
            fillPriceE8: e8,
            sizeE8: e8,
            overshoot: usdc,
            fromBond: usdc,
            fromReserve: usdc,
            fromFund: usdc,
            evidenceHash: b32,
            evidenceRef: str,
            sources: { type: "array", items: { type: "object", properties: { key: { type: "string", enum: ["bond", "reserve", "fund", "unpaid"] }, label: str, amount: usdc, share: { type: "number" } } } },
            evidence: anyObj,
            evidenceMatches: { ...bool, description: "keccak256(evidenceRef) equals evidenceHash (single settlement only)." },
          },
        },
      },
    },
  };
}
