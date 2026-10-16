# Outpost Rivals — deep beta stress review

**Historical baseline:** 1.3.1-beta. This report records the gameplay/load review before the v1.4 price and liquidity changes. See `PRICE_TVL_UPDATE.md` and `VERIFICATION.md` for the current build. **Verdict:** viable for a controlled Robinhood **testnet** beta after funded, real-wallet acceptance; **not ready for a public real-money token launch**. This review ran local deterministic game, HTTP, SQLite and EVM tests. It did not broadcast transactions to Robinhood Chain or test a physical mobile wallet.

## Results

| Area | Run | Result | Limit of evidence |
|---|---|---|---|
| Game policies | 30,000 bot matches / ~170,812 resolved rounds | 0 tested supply/health invariant violations; wins 8,752 / 8,654 / 8,801; draws 3,793 (12.64%) | Bots follow implemented policies; no human retention, fairness or exploit proof |
| Shared proxy rate limit | 25 players × 25 polls + session creation | Old version: 600 success / 50 rate-limited; corrected version: 650 success / 0 rate-limited | Local burst, no public proxy or internet latency |
| Single account cap | One account × 650 polls | 600 account requests succeeded, 50 rejected with 429; account creation used a separate peer bucket | Intended API bound, proxy must also rate-limit abusive IPs |
| Poll-only burst | 100 players × 25 polls + sessions | 2,600 / 2,600 succeeded in 1.54 s; p95 34 ms; RSS 173 MB | In-memory DB; not a sustained production load test |
| Full match burst | 300 simultaneous player flows | 300 / 300 completed, 4,375 requests, no failed replays; p95 1.52 s, max 5.08 s, RSS 354 MB | Single local Node process/SQLite; burst is faster than real play; no TLS/WebGL/RPC |
| Confirmed-purchase ledger | 100,000 pre-existing receipts, ten bootstraps | Before change p95 190 ms/bootstrap; after migration p95 14 ms; one-time backfill 201 ms | Synthetic receipts, in-memory OS cache; backup/restore not load-tested |
| Contract checkout | Compiled store plus mocks on local chain ID 46630 | Signed order, 80/20 retirement, USDG 100% treasury, wrong payer/asset/expiry, pause, replay, duplicate SKU and concurrent receipt checks passed | No public testnet block, audit or fee-on-transfer adversary |
| Build/tests | TypeScript, Vite, Solidity and Node tests | 13/13 tests passed; production bundle compiled | Real browser wallet and phone UX unverified |

**Fixes made during this review:** per-account API limiting behind a reverse proxy; removal of static-asset throttling; idempotent receipt accounting and a one-time migration for old orders; onchain one-purchase-per-wallet-per-SKU; expired quote refresh after token approval; cleanup for expired sessions and wallet nonces. The current test suite checks migration, duplicate payment rejection and parallel receipt confirmation.

## Token/business stress — assumptions, not forecasts

| 10,000 MAU, $8 per payer, $3,000 monthly cost | Gross equivalent | RIVAL retirement at checkout | Net after operating cost |
|---|---:|---:|---:|
| 1% payers; 50% RIVAL checkout | $800 | $80 equivalent | −$2,280 |
| 3% payers; 50% RIVAL checkout | $2,400 | $240 equivalent | −$840 |
| Same, 15% haircut on realized treasury RIVAL | $2,400 | $240 equivalent | −$984 |
| 5% payers; 50% RIVAL checkout | $4,000 | $400 equivalent | +$600 |
| 3% payers; all USDG checkout | $2,400 | $0 | −$600 |
| 3% payers; all RIVAL checkout | $2,400 | $480 equivalent | −$1,080 |

At 50% token checkout and no haircut, payer conversion must reach about **4.17%** to cover the assumed $3,000 monthly cost; at a 15% haircut, **4.46%**. At 50,000 MAU, 4% payers and $10 spend, the model yields $20,000 gross and $3,000 net before extra costs, taxes and liquidity loss. These values depend entirely on unmeasured conversion, spend, retention, infrastructure cost and token realizability.

All six current cosmetics are one-time purchases worth $44 in total per buyer; $14 is RIVAL-only. The maximum value sent to the dead address per buyer who pays RIVAL for all six is $8.80 at checkout. Future repeat demand requires new visual editions players actually want. Existing token holders may spend without buying from a market, and the treasury receives 80% of RIVAL purchases and may need to sell to cover costs. Neither a launchpad pool nor retirement ensures price increases. The dead-address transfer does not lower ERC-20 `totalSupply`.

Reproduce assumptions with `npm run economics:stress`; raw cases are in `reports/stress-economics.json`.

## What does not hold yet

1. **The island is local.** Its agent decisions, PX, season and battles are browser simulations. Wallet-linked captain identity and the separate tactical game persist; a shared agentic world and an economically consequential game loop do not exist yet.
2. **Real network/wallet proof is absent.** There are no Robinhood testnet contract addresses, explorer receipts, WalletConnect QR/mobile trials, or a hosted purchase trace in this package. The price feed is a configurable trusted HTTPS response, not an independently verified swap route; mainnet RIVAL checkout stays disabled without one.
3. **The deployment shape is one server.** SQLite and round timers assume one API process. The load figures cannot be extrapolated to 10,000 simultaneous players. The initial main JavaScript is ~414 KB gzip; test actual startup and WebGL frame rate on midrange phones. Put a real client-IP limiter at the reverse proxy; unlinked session creation still shares a peer-IP bucket.
4. **The token loop is small.** A six-item one-time catalog has no recurring token demand. Measure D1/D7 return, matches per player, payer conversion, RIVAL checkout share and realized revenue before deciding on an o1 token launch.

## Decision

- **Controlled testnet beta:** proceed once the developer deploys the new mock token/store, supplies test ETH and a WalletConnect project ID, passes preflight, and records a real desktop + mobile allowance → purchase → receipt → equip run plus two-quote duplicate attempt. The source is a beta candidate, not evidence those steps have occurred.
- **Public paid game:** wait for real browser QA, backup/restore drill, incident controls, contract security review and production monitoring.
- **o1 mainnet token:** wait for measured repeat demand and a vetted price feed/liquidity path. Current code prepares an unsigned o1 launch plan only; it does not launch a token.
