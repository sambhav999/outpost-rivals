# Deployment and operations

## Hosting

Build with Node24. Use `npm ci` and the committed lockfile. For Docker, copy `.env.example` to `.env`, set production `APP_ORIGIN=https://your-host`, keep secrets outside source control, then `docker compose --env-file .env -f deploy/compose.yaml up -d --build`. Compose passes `VITE_CHAIN_ID` and `VITE_WALLETCONNECT_PROJECT_ID` to the frontend build; changing these requires rebuilding. Point a TLS reverse proxy at private port3000; an example Caddyfile is included. Configure your domain and certificates. `/healthz` is liveness; `/readyz` checks the database.

Run exactly **one API process/replica**. SQLite WAL and its volume must be persistent. Multiple Node processes could run overlapping timers and are unsupported here. The service limits authenticated API traffic per account and unlinked session creation by socket peer. Behind a reverse proxy, all unlinked users can share that peer bucket, so the proxy must also enforce a trustworthy client-IP limit for session creation and abuse. Do not trust arbitrary forwarded IP headers from clients.

Do not expose `.env`, SQLite, backups, launch preparations or deployer keys. Dist is the only served static directory. The runtime user is non-root. The Docker image retains build/test packages for convenient developer operations; a hardened production supply-chain image can strip them after compiling runtime TS to JS. Never bake secrets into the image.

## Keys and roles

- Wallet user: signs an explicit login challenge; session is HttpOnly, SameSite=Lax, production Secure.
- Quote signer: dedicated server signing key, no permission to transfer a user's funds. It can issue prices and creator payout addresses, so compromise still affects merchant economics. Rotate via multisig owner and pause checkout during incidents.
- Contract owner: multisig recommended, can pause/unpause and rotate signer. Treasury and asset addresses are immutable; redeploy for a change.
- Deployer: offline/developer-run only; remove from production environment after deployment.
- o1 launch API key: developer launch preparation. The running game separately needs an `O1_READ_API_KEY` to display the indexed pool and allow mainnet RIVAL checkout. Keep both on the server.

## Receipt recovery

The browser saves submitted payment hash and order ID before waiting for confirmations. Retry confirmation from Armory after interruption. Server accepts only a successful canonical receipt, configured contract event, exact order/payer/asset/amount/SKU and configured confirmation count. Fulfilment is idempotent. Users should retain the hash independently. A receipt confirmed before a deep chain reorganization requires operator reconciliation; automatic deep-reorg rollback is not implemented.

## Backups and restore

Run `npm run backup` with the app environment. Copy the produced snapshot to encrypted off-host storage. Test restore by stopping the API, replacing the DB with a backup, preserving permissions, and restarting. SQLite online `VACUUM INTO` makes a consistent snapshot. The v1.3.1 startup creates an aggregate for prior confirmed receipts once; back up before upgrading and confirm that its totals match chain/accounting records after migration. Backup order inventory and receipts with the database; losing it loses cosmetic entitlement history unless reconstructed from chain and order metadata.

## Release checklist

- Full build/tests pass; inspect the v1.4 price stress report and the historical gameplay stress baseline in `reports/`.
- Test incognito guest, refresh/restart recovery, two browsers in one room, idle timeout, daily limit, wallet restoration.
- On Robinhood testnet, connect and sign; create an Emberhold, Tidewatch or Sunreach captain; verify its name and faction in the living island, persisted account stats after refresh, match gating before onboarding and checkout gating until onboarding. Reconnect an existing wallet and check its previous account is restored without merging guest progress.
- Desktop/mobile visual and WebGL QA, reduced-motion setting, keyboard controls, screen-reader labels, wallet rejection/chain switching. These need real browser testing before launch.
- Robinhood testnet mock lifecycle: deploy the **v1.4 store bytecode**, transfer funds, approve exact amount, request a fresh RIVAL price check, buy each asset, confirm, equip, retry duplicate confirmation, attempt a second paid order for the same SKU, test missing/stale/moved/forged price checks, pause/reject. Preflight checks `priceGuardVersion() = 1`.
- Validate o1 launch preparation against current live API, review chain/address/supply/fees and sign fresh unexpired plan separately.
- Mainnet contract review/audit, token-admin inspection, multisig roles, private RPC and alerting.
- Mainnet preflight, tiny purchase, explorer receipt, entitlement, accounting reconciliation.
- Privacy/terms, refund policy, trademark clearance for Outpost Rivals/RIVAL, jurisdiction-specific token and payment review.
- Keep checkout disabled if any payment integration is unverified; gameplay can launch separately.

## Sources used for integration design

- https://docs.robinhood.com/chain/connecting/
- https://docs.robinhood.com/chain/deploy-smart-contracts/
- https://docs.robinhood.com/chain/stock-token-apis/
- https://docs.o1.exchange/launchpad/api/quickstart
- https://docs.o1.exchange/launchpad/api/launches
- https://docs.o1.exchange/launchpad/reference/production-contracts

These external interfaces can change. Run preflight and review live o1 configuration at deployment time.
