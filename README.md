# Outpost Rivals

**A small world. A long memory.** An independent, six-round strategy game for Robinhood Chain. React + Three.js, authoritative Express service, SQLite persistence, deterministic agents, EVM cosmetic checkout, and an o1 token launch preparation tool.

## What this release actually does

- Play solo against two autonomous tactical agents, or create a room with up to three humans. Empty seats become agents. Orders resolve simultaneously; 40-second timeout holds absent players.
- Original isometric hex world, selectable terrain, fog of war, scout/capture/develop/convoy orders, three factions, captain stance, persistent memory and nontransferable XP.
- Daily equal-start challenge, seven-day leaderboard, completed match replay with downloadable hash-chain receipts.
- Optional wallet identity, exact-allowance cosmetic checkout, signed expiring orders, persisted pending purchase recovery, canonical receipt confirmation and owned cosmetic equipment.
- Cosmetic token payments split 80% treasury / 20% dead-address retirement. USDG payments go 100% treasury. No combat boosts, yield, vaults or guaranteed appreciation.
- Optional Robinhood equity quote adapter for capped daily scenario costs. Defaults to explicit **scenario** mode. Stale/unavailable quotes produce neutral costs.

This is source for developer deployment. **No Robinhood contracts, token, public app or o1 launch have been deployed by this package.** Local tests are not a contract audit or proof of real network integration. Read `reports/VERIFICATION.md` for exact validation scope.

## Run locally

Node **24** and npm required.

```sh
npm ci
cp .env.example .env
npm run build
npm start
```

Open `http://localhost:3000`. Guest gameplay needs no wallet, API key or blockchain. The armory is disabled until contract configuration passes RPC checks.

For development use two terminals: `npm run dev` and `npm run dev:ui`. Set `APP_ORIGIN=http://localhost:5173`. Production serves the Vite bundle and API from the same origin.

```sh
npm test
npm run simulate
npm run economics
npm run contracts:compile
```

## Developer launch order

1. Deploy gameplay on HTTPS with a persistent volume. Follow `docs/DEPLOYMENT.md`; one application replica only.
2. On **Robinhood testnet 46630**, fund a deployer with test ETH, set owner/treasury/quote signer addresses, then run `npm run contracts:deploy -- --testnet-mocks` (dry run), followed by `--testnet-mocks --broadcast` when ready. Mock supply belongs to deployer; transfer test assets to QA wallets.
3. Set returned contract addresses plus server quote signer secret. Restart. Run `npm run preflight`. Complete real wallet allowance → purchase → receipt → equip tests on desktop and mobile.
4. Review token economics, brand, terms, signer custody and contract security. Never market price appreciation or reward investment returns.
5. Prepare the canonical **o1 Standard / USDG / Robinhood mainnet 4663** token with `npm run launch:prepare`. This only saves an unsigned plan. Review fresh config, simulation, launch fees, expiry, supply and each wallet transaction. Developer signs the reviewed plan separately through the current o1 flow.
6. Use the resulting canonical token address; do **not** deploy MockToken on mainnet. USDG reference address is in `docs/INTEGRATIONS.md` and must be verified onchain.
7. Deploy OutpostStore on mainnet with a multisig owner and treasury and a dedicated low-balance quote signer. Configure assets/pricing, run preflight, then complete a tiny real purchase before opening checkout.
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
| `client/` | Responsive frontend and original Three.js world |
| `contracts/OutpostStore.sol` | Signed cosmetic payment split contract |
| `contracts/MockToken.sol` | Test fixture; not a mainnet token |
| `scripts/` | Compile, deploy, preflight, backup, simulation, economics, launch preparation |
| `test/` | Engine, HTTP service and EVM integration tests |

## Boundaries

Agents are rule-based policies, not LLM traders. Human captain actions are manually committed. No real equity ownership, prediction-market trading, RWA vault, bridging, staking, revenue share, mobile native app or creator publishing UI is included. Contract creator splits exist for a later separately reviewed creator marketplace. There is no transferable land or item NFT in this release: the server grants cosmetic access after a valid receipt.

Replay integrity proves that saved server receipts form a consistent hash chain; the server can rewrite its own history. It is not trustless gameplay execution, blockchain anchoring or independent anti-cheat proof. Ranked guest limits are not Sybil-resistant, so no money is awarded.

The code is a deployable MVP, not an audited financial product. Human playtesting, visual/browser QA, real Robinhood/o1 smoke tests, and operational security review are required before public paid launch. No token-price or virality guarantee is made.
