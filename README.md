# Outpost Rivals

**A small world. A long memory.** The front door is a 64×64 isometric island where three outposts and their agents act autonomously. RainbowKit wallet connection on Robinhood Chain leads to a saved captain and a separate, authoritative six-round tactical game. React, Three.js, Express, SQLite, EVM cosmetic checkout and o1 token launch preparation are included. This is the **v1.4 price-guard beta**.

## What this release actually does

- Explore the pixel-art living world: Emberhold, Tidewatch and Sunreach, agent memories, gathering, monsters, duels, capture, a feed and minimap. This island runs **locally in each browser**. Its decisions, PX and outcomes are **not** shared or saved by the server.
- Connect an installed EVM wallet or use RainbowKit's WalletConnect mobile/QR flow with your WalletConnect project ID, sign a one-use account-link message, create a named captain, choose one of the three outposts and a stance. Returning wallets restore their captain. The connected name and faction appear in the local island. A saved account card shows tactical matches, wins, XP and cosmetics.
- Play a distinct six-round tactical match against two autonomous agents, or create a room with up to three humans. Empty seats become agents. Orders resolve simultaneously; 40-second timeout holds absent players. The tactical game uses a Three.js hex board, server-owned rules, replay and SQLite persistence.
- Daily equal-start challenge, seven-day leaderboard, completed match replay with downloadable hash-chain receipts.
- Optional wallet identity, exact-allowance cosmetic checkout, signed expiring orders, persisted pending purchase recovery, canonical receipt confirmation and owned cosmetic equipment. RIVAL orders require a fresh signer-attested price within 3% of the original quote at submission, with a 20-second observation window. Mainnet token checkout also requires o1 indexed price/liquidity cross-checks and an independent feed. The Armory is unavailable until contracts, assets and signer pass live RPC checks; a new wallet must finish captain setup before a quote is issued.
- Cosmetic token payments split 80% treasury / 20% dead-address retirement. Two Season 01 RIVAL-only visual editions give optional direct token use; one requires three played tactical matches. Other cosmetics accept USDG. USDG payments go 100% treasury. Confirmed checkout totals appear on the Economy page. No combat boosts, yield, vaults or guaranteed appreciation.
- Optional Robinhood equity quote adapter for capped daily scenario costs. Defaults to explicit **scenario** mode. Stale/unavailable quotes produce neutral costs.

This is source for developer deployment and beta testing. **No Robinhood contracts, token, public app or o1 launch have been deployed by this package.** The isometric island is a browser simulation, not authoritative gameplay. Local tests are not a contract audit or proof of real network integration. Start with `reports/PRICE_TVL_UPDATE.md` and `reports/LAUNCH_PRICE_SIMULATION.md` for current price/liquidity behavior, then `reports/DEEP_SIMULATION.md`, `docs/BETA_TEST.md` and `docs/PRICING.md`. The v1.4 store has a new EIP-712 order shape and price guard; it must be freshly deployed before checkout tests.

## Run locally

Node **24** and npm required.

```sh
npm ci
cp .env.example .env
npm run build
npm start
```

Open `http://localhost:3000`. The living island and guest tactical game need no wallet, API key or blockchain. `APP_ORIGIN` defaults to `http://localhost:3000` for this path. The Armory is disabled until contract configuration passes RPC checks.

For development use two terminals: `npm run dev` and `npm run dev:ui`. Set `APP_ORIGIN=http://localhost:5173`. Production serves the Vite bundle and API from the same origin. `VITE_WALLETCONNECT_PROJECT_ID` enables mobile QR/wallet selection and is embedded at build time; without it, injected wallets and guest play still work.

```sh
npm test
npm run simulate
npm run economics
npm run launch:price-stress
npm run contracts:compile
```

## Developer launch order

1. Follow `docs/BETA_TEST.md`: run the local checks, then deploy gameplay on HTTPS with a persistent volume and one application replica.
2. On **Robinhood testnet 46630**, fund a deployer with test ETH, set owner/treasury/quote signer addresses, then run `npm run contracts:deploy -- --testnet-mocks` (dry run), followed by `--testnet-mocks --broadcast` when ready. Mock supply belongs to deployer; transfer test assets to QA wallets.
3. Set returned contract addresses plus server quote signer secret and a testnet merchant tariff. Restart. Run `npm run preflight`, fund beta wallets with `npm run beta:fund`, and complete wallet allowance → purchase → receipt → equip tests on desktop and mobile.
4. Review token economics, brand, terms, signer custody and contract security. Never market price appreciation or reward investment returns.
5. Prepare the canonical **o1 Standard / USDG / Robinhood mainnet 4663** token with `npm run launch:prepare`. This only saves an unsigned plan. Review fresh config, simulation, launch fees, expiry, supply and each wallet transaction. Developer signs the reviewed plan separately through the current o1 flow.
6. Use the resulting canonical token address; do **not** deploy MockToken on mainnet. USDG reference address is in `docs/INTEGRATIONS.md` and must be verified onchain.
7. Deploy OutpostStore on mainnet with a multisig owner and treasury and a dedicated low-balance quote signer. Configure assets and a **fresh, bounded live token price source** per `docs/PRICING.md`; the manual tariff is testnet-only. Run preflight, then complete a tiny real purchase before opening checkout.
8. Back up SQLite, monitor errors and RPC, set incident ownership, and perform the release checklist. Only then announce.

No server endpoint launches tokens or holds a player's private key. No production secret is included.

## Repository

| Path | Purpose |
|---|---|
| `shared/game.ts` | Pure deterministic game rules and fog projection |
| `server/app.ts` | Session/auth, authoritative rounds, rooms, ranked, replay API |
| `server/db.ts` | SQLite schema and transactions |
| `server/shop.ts` | Merchant quotes and verified purchase fulfilment |
| `server/market.ts` | Optional Robinhood price snapshot adapter |
| `public/observatory.html`, `public/observatory.js` | Isometric living island; independent browser simulation |
| `client/` | Wallet-to-captain journey, saved account, Armory, tactical Three.js world |
| `contracts/OutpostStore.sol` | Signed cosmetic payment split contract |
| `contracts/MockToken.sol` | Test fixture; not a mainnet token |
| `scripts/` | Compile, deploy, preflight, backup, simulation, economics, launch preparation |
| `client/wallet.ts` | RainbowKit/Wagmi Robinhood chain configuration |
| `test/` | Engine, HTTP service and EVM integration tests |

## Boundaries

Agents are rule-based policies, not LLM traders. The living island does not write world outcomes to the server; only captain identity and the separate tactical game are persisted. Human tactical orders are manually committed. No real equity ownership, prediction-market trading, RWA vault, bridging, staking, revenue share, mobile native app or creator publishing UI is included. Contract creator splits exist for a later separately reviewed creator marketplace. There is no transferable land or item NFT in this release: the server grants cosmetic access after a valid receipt.

Replay integrity proves that saved server receipts form a consistent hash chain; the server can rewrite its own history. It is not trustless gameplay execution, blockchain anchoring or independent anti-cheat proof. Ranked guest limits are not Sybil-resistant, so no money is awarded.

The code is a deployable MVP, not an audited financial product. Human playtesting, visual/browser QA, real Robinhood/o1 smoke tests, and operational security review are required before public paid launch. No token-price or virality guarantee is made.
