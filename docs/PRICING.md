# RIVAL price quote boundary

The beta's `TOKEN_UNITS_PER_DOLLAR` is a disclosed **testnet mock-token tariff only**. It is ignored on chain 4663. No token swap is included in checkout. Mainnet RIVAL checkout fails closed until the operator supplies `RIVAL_PRICE_URL`, `RIVAL_MIN_PRICE_USD`, `RIVAL_MAX_PRICE_USD`, `O1_READ_API_KEY`, the canonical token and USDG addresses, and reviews the feed implementation independently. Default `MIN_POOL_LIQUIDITY_USD=50000` cannot be configured below $50,000; this is a conservative **indexed-liquidity gate**, not proof that a $50,000 sale will fill.

The configured HTTPS endpoint must return JSON similar to:

```json
{
  "chainId": 4663,
  "token": "0xCANONICAL_RIVAL_ADDRESS",
  "stable": "0xVERIFIED_USDG_ADDRESS",
  "priceUsd": "0.25",
  "spreadBps": 70,
  "asOf": "2026-10-16T10:00:00.000Z"
}
```

Use actual 42-character ERC-20 addresses. `priceUsd` is nominal USD per RIVAL, with at most six decimal places. The server checks network, both addresses, a timestamp no older than **10 seconds**, spread no greater than 200 bps and operator-configured min/max bounds. It independently reads o1 token details for the same chain, token, USDG pair and pool: indexed status must be fresh and no older than 30 seconds, indexed liquidity at least $50,000, USDG reference within $0.98–$1.02, and o1 USD price within 2% of the configured feed. Missing or stale data disables RIVAL checkout; the Economy panel displays no invented TVL. The o1 API's indexed liquidity estimate is not executable sell depth. This feed and cross-check do **not** independently verify the buyer's swap route or guarantee token availability. USDG checkout stays available when token pricing fails.

For the beta, use only `CHAIN_ID=46630`, deployed mock assets, and `TOKEN_UNITS_PER_DOLLAR=10` as an example. Label all test wallets, prices and purchases as testnet. The new store uses EIP-712 domain version **2** and an updated `Order` shape; the v1.3 store cannot accept these orders. Redeploy the v1.4 store before beta checkout.

**At purchase:** after wallet approval, the client requests a fresh server-signed `PriceCheck` tied to that order. The store verifies its signature and a maximum 20-second observation window and rejects a signed spot that moved over 3% from the original quote. A move larger than 3% requires a new quote and player review. A price change **after** the short signed observation is still possible before the transaction lands; the signer is trusted, and the contract does not read Uniswap spot or a third-party oracle itself. A proof can expire while the user confirms in a wallet, so an attempted transaction may revert and cost gas. Run live testnet and mobile timing QA before enabling real-money RIVAL checkout. `reports/LAUNCH_PRICE_SIMULATION.md` models the remaining gap.
