# Outpost Rivals — developer handoff

1. Read `README.md`, then `reports/VERIFICATION.md` for the exact tested scope.
2. Install Node24. Run `npm ci`, copy `.env.example` to `.env`, `npm run build`, `npm start`. Open localhost:3000. The game runs without a wallet or API key.
3. Test solo, two-browser room, ranked, restart recovery and replay. Review original Three.js world on desktop/mobile.
4. Deploy mock assets + shop to Robinhood testnet using the documented deploy script. Configure server signer, addresses and treasury, run preflight, then buy/equip test cosmetics with a real wallet.
5. Read `docs/ECONOMICS.md`. Canonical RIVAL is prepared through o1 Standard; no separate team/rewards allocation or paid battle advantages. Do not launch MockToken on mainnet.
6. Review and sign the fresh o1 launch plan yourself, deploy mainnet shop with multisig roles, complete a tiny mainnet purchase, configure HTTPS/persistent storage/backups, and finish the release checklist.

Frontend: `client/`. Backend: `server/`. Rules: `shared/game.ts`. Contracts: `contracts/`. Launch/deployment tooling: `scripts/`. The package contains no production keys or live deployment claims.

The v1.1 visual pass adds orbit/zoom, tactical highlights, map inspection, route preview, terrain landmarks and squad movement. It compiles and needs actual mobile and desktop visual QA. Original design uses compact territory-strategy references while keeping its own world, art and rules. Current game scope is specified in `docs/GAME_RULES.md`. Speculative future features are not represented as shipped.
