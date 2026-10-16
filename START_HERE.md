# Outpost Rivals — developer handoff

1. Read `README.md`, `reports/PRICE_TVL_UPDATE.md`, `docs/BETA_TEST.md`, then `reports/VERIFICATION.md` for the exact tested scope.
2. Install Node24. Run `npm ci`, copy `.env.example` to `.env`, `npm run build`, `npm start`. Open localhost:3000. The game runs without a wallet or API key.
3. Open the landing page and inspect the isometric island. Connect a Robinhood testnet EVM wallet through RainbowKit (configure your WalletConnect project ID for mobile QR), sign the account-link message, create a captain, refresh and reconnect to confirm restoration. Check the saved stats card and the local-world label. See `docs/WALLET_JOURNEY.md`.
4. Test solo, two-browser room, ranked, restart recovery and replay in the separate tactical match. Review both worlds on desktop/mobile.
5. Deploy mock assets + shop to Robinhood testnet using the documented deploy script. Configure server signer, addresses and treasury, run preflight, distribute test tokens with `npm run beta:fund`, then buy/equip test cosmetics with a real wallet.
6. Read `docs/ECONOMICS.md`. Canonical RIVAL is prepared through o1 Standard; no separate team/rewards allocation or paid battle advantages. Do not launch MockToken on mainnet.
7. Review and sign the fresh o1 launch plan yourself, deploy mainnet shop with multisig roles, complete a tiny mainnet purchase, configure HTTPS/persistent storage/backups, and finish the release checklist.

Frontend: `client/`. Backend: `server/`. Rules: `shared/game.ts`. Contracts: `contracts/`. Launch/deployment tooling: `scripts/`. The package contains no production keys or live deployment claims.

The v1.4 pass adds a fresh onchain-verified price attestation for RIVAL checkout and a sourced o1 pool-liquidity display that never invents TVL. The autonomous isometric island is still a local visual simulation; `docs/GAME_RULES.md` describes the authoritative tactical game. Browser, mobile, real wallet and network QA are required before a public paid launch.
