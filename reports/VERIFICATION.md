# Verification — developer candidate v1.1

## Executed in this environment

- `npm run build`: PASS. TypeScript check and production Vite bundle generated. Main JS ~219 KB gzip, optional wallet chunk ~93.5 KB gzip.
- `npm run contracts:compile`: PASS. OutpostStore and test-only MockToken compiled with optimizer and Shanghai EVM target; exact dependencies are in package-lock.json.
- `npm test`: **10 tests, 10 passed, 0 failed**. Tests include 600 seeded deterministic games; resource/health/position invariants; fog boundaries; order validation; diplomacy; stance cost; integer payment conservation; HTTP sessions/CSRF/origin checks; room host/participant authority; duplicate order rejection; replay tamper detection; wallet nonce replay rejection and account restoration; timeout handling; persisted SQLite results; daily ranked limit; stale/halted/nonfinite market inputs; EVM payment splits, replay/expiry/signer/chain/payer/asset boundaries and pausing; backend quote→onchain purchase→receipt fulfilment→idempotent inventory.
- `npm run simulate`: **1,200 completed agent matches**, zero tested invariant violations. Verdant wins365 (30.42%), Ember346 (28.83%), Tide351 (29.25%), draws138 (11.5%). Mean5.7125 rounds. Results in `simulation.json`.
- `npm run economics`: generated three explicit assumption scenarios. Small/growing cases lose money at the chosen costs. No price appreciation assumed.

The first simulation exposed a large visibility advantage. Equal opening vision, a cheaper Scout identity, and unbiased deterministic objective tie-breaking removed that observed skew. The final results are agent-policy outcomes, not evidence of human competitive balance or retention.

## Not executed / not proven

- No public app deployment or Robinhood testnet/mainnet broadcast.
- No o1 authenticated prepare call or live token creation; no supplied API key/deployer funds.
- No real Robinhood quote or wallet purchase smoke test. Adapter tests use controlled responses; payment tests use a local EVM.
- No interactive browser or mobile visual QA in this environment. The redesigned React/Three.js world compiles, but its presentation, touch UX, GPU frame rate and injected-wallet interactions require real browser review. See `UI_REVIEW.md`.
- No Docker image build/run, external load test, security audit, penetration test, human playtest, user acquisition or revenue validation.
- No independent gameplay verification, token-price claim, guaranteed yield or claim of guaranteed launchpad acceptance.

## Warnings observed

- Ganache's native uWebSockets binary does not match Node24; its JavaScript fallback ran the EVM tests successfully. This affects the local test harness, not the Express runtime.
- Vite reports a large main JavaScript chunk (~808 KB raw / ~219 KB gzip), including React and Three.js. The optional wallet chunk loads when needed (~252 KB raw / ~94 KB gzip). Measure actual load and frame rate on mobile before launch.
- A local npm proxy-configuration warning appears in logs; commands still completed.

## Release classification

**Deployable developer MVP / testnet candidate.** Gameplay, persistence, payment contract and integration tooling are implemented. Live-network, browser, operational and security checks listed in `docs/DEPLOYMENT.md` remain release gates for a paid public launch.
