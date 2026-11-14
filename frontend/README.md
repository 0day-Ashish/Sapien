This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## NEAR (Sapien)

The user's wallet is Meteor on NEAR testnet, through NEAR Connect (`@hot-labs/near-connect`). Money and controls (deposit, withdrawal, Mandate hash, Kill Switch) go through the Sapien NEAR contract; Hyperliquid and HyperEVM are read with viem public clients. Helpers live in `lib/near/`.

Environment (each has this default in code, so none is required):

| Variable | Default |
| --- | --- |
| `NEXT_PUBLIC_NEAR_NETWORK` | `testnet` |
| `NEXT_PUBLIC_NEAR_CONTRACT` | `sapien-vault.testnet` |
| `NEXT_PUBLIC_NEAR_USDC` | `usdc.sapien-vault.testnet` |
| `NEXT_PUBLIC_NEAR_RPC` | `https://rpc.testnet.near.org` |
| `NEXT_PUBLIC_ENGINE_URL` | `http://127.0.0.1:8787` (the engine's `/near/vaults` and `/near/mandate`) |

`GET /api/intents/quote?amount=5` returns a dry NEAR Intents quote (NEAR USDC to HyperCore USDC, no API key). It is shown beside the deposit and moves no funds.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
