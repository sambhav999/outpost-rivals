# Deployment and operations

## Hosting

Build with Node24. Use `npm ci` and the committed lockfile. For Docker, copy `.env.example` to `.env`, set production `APP_ORIGIN=https://your-host`, keep secrets outside source control, then `docker compose -f deploy/compose.yaml up -d --build`. Point a TLS reverse proxy at private port3000; an example Caddyfile is included. Configure your domain and certificates. `/healthz` is liveness; `/readyz` checks the database.

Run exactly **one API process/replica**. SQLite WAL and its volume must be persistent. Multiple Node processes could run overlapping timers and are unsupported here. The reverse proxy should provide distributed/public rate limiting; the service's per-IP limit is an additional local bound. It intentionally does not trust arbitrary forwarded IP headers.

Do not expose `.env`, SQLite, backups, launch preparations or deployer keys. Dist is the only served static directory. The runtime user is non-root. The Docker image retains build/test packages for convenient developer operations; a hardened production supply-chain image can strip them after compiling runtime TS to JS. Never bake secrets into the image.

## Keys and roles

- Wallet user: signs an explicit login challenge; session is HttpOnly, SameSite=Lax, production Secure.
- Quote signer: dedicated server signing key, no permission to transfer a user's funds. It can issue prices and creator payout addresses, so compromise still affects merchant economics. Rotate via multisig owner and pause checkout during incidents.
- Contract owner: multisig recommended, can pause/unpause and rotate signer. Treasury and asset addresses are immutable; redeploy for a change.
- Deployer: offline/developer-run only; remove from production environment after deployment.
- o1 API key: developer launch preparation only, not needed by the running game.

## Receipt recovery

The browser saves submitted payment hash and order ID before waiting for confirmations. Retry confirmation from Armory after interruption. Server accepts only a successful canonical receipt, configured contract event, exact order/payer/asset/amount/SKU and configured confirmation count. Fulfilment is idempotent. Users should retain the hash independently. A receipt confirmed before a deep chain reorganization requires operator reconciliation; automatic deep-reorg rollback is not implemented.

## Backups and restore

Run `npm run backup` with the app environment. Copy the produced snapshot to encrypted off-host storage. Test restore by stopping the API, replacing the DB with a backup, preserving permissions, and restarting. SQLite online `VACUUM INTO` makes a consistent snapshot. Backup order inventory and receipts with the database; losing it loses cosmetic entitlement history unless reconstructed from chain and order metadata.

## Release checklist

- Full build/tests/simulations pass; inspect `reports/`.
- Test incognito guest, refresh/restart recovery, two browsers in one room, idle timeout, daily limit, wallet restoration.
- Desktop/mobile visual and WebGL QA, reduced-motion setting, keyboard controls, screen-reader labels, wallet rejection/chain switching. These need real browser testing before launch.
- Robinhood testnet mock lifecycle: transfer funds, approve exact amount, buy each asset, confirm, equip, retry duplicate confirmation, pause/reject.
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
