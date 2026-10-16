# Verification — Outpost Rivals 1.4.0 beta candidate

## Executed for this build

- `npm test`: **14/14 passed**, including local EVM checkout with compiled OutpostStore bytecode and mock tokens, valid/missing/forged/expired/moved price attestations, testnet price change requiring a new quote, stale/mismatched o1 pool data, snapshot history and no-data state, receipt fulfilment and the prior gameplay and wallet boundaries. o1 responses were mocked; no live API key was available.
- `npm run build`: PASS, TypeScript and production Vite bundle. The initial JS chunk is ~1.45 MB uncompressed / 415 KB gzip; mobile loading is unmeasured.
- `npm run launch:price-stress`: PASS, refreshes `launch-price-stress.json`. The same $8 RIVAL item costs 32,000 tokens at $0.00025, 8,000 at $0.001 or 2,000 at $0.004. A 4× market change **before** the signed second proof prevents the original order; a change **after** a valid proof can still expose the buyer or merchant until inclusion. This is scenario arithmetic, not a market forecast or real swap execution.
- Solidity compiles in the EVM tests for Shanghai via IR. The new EIP-712 version 2 is incompatible with a v1.3.1 store deployment; preflight checks `priceGuardVersion() = 1`.
- `npm run contracts:compile`: PASS. Same-process local HTTP smoke: `/`, `/healthz`, `/readyz` returned 200; an issued guest session read `/api/liquidity`, which correctly returned `unavailable` without a launched token and API key.
- Historical v1.3.1 gameplay review in `DEEP_SIMULATION.md`: 30,000 deterministic bot games, local burst tests and economics scenarios. Those unchanged components were not rerun for v1.4.

## Still needed before release

- No Robinhood testnet/mainnet transaction, explorer receipt, funded wallet run, hosted app, WalletConnect phone trial or live o1 token/pool/API response was available. Mainnet RIVAL quote fails closed until a canonical launched token, read key, bounded external feed and actual market depth exist. USDG checkout still requires deployed contracts and real wallet proof.
- The price proof relies on the merchant signer and external feed. It checks a signed observation within the time window, not the DEX price at inclusion. Pool liquidity is an indexer estimate, not guaranteed exit capacity; the $50k gate requires review against actual trade size and sell quotes.
- Contract audit, mobile/WebGL QA, production proxy/backup drill, player retention, payer conversion and repeat cosmetic demand remain unverified. The island is browser-local simulation; the separate tactical match and wallet identity persist on the server.

**Classification:** local developer beta candidate for funded Robinhood testnet acceptance, not evidence of a launched token or increased TVL. Follow `docs/BETA_TEST.md` and `reports/PRICE_TVL_UPDATE.md` before any public paid release.
