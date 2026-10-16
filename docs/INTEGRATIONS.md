# Integration reference

| Network | ID | Public RPC | Explorer |
|---|---:|---|---|
| Robinhood mainnet | 4663 | https://rpc.mainnet.chain.robinhood.com | https://robinhoodchain.blockscout.com |
| Robinhood testnet | 46630 | https://rpc.testnet.chain.robinhood.com | https://explorer.testnet.chain.robinhood.com |

Gas is ETH. Public RPCs are rate-limited; production should use a reliable private endpoint. Mainnet USDG reference: `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, expected 6 decimals. Verify deployment/code/decimals before use. Do not copy this address to testnet.

## o1

Base API `https://api.launch.o1.exchange/v1`, `x-api-key` header. The CLI reads `/config?chain_id=4663&market=standard`, saves the live configuration, then calls `/launches/prepare` with an idempotency key and the token metadata. **Preparation is not deployment.** It does not sign, submit, buy, or assert live eligibility. A developer must inspect the saved response's issues, simulation, steps, fees, supply and expiry. If config does not advertise the intended chain/pair/product, do not sign. Do not manually invent transaction calldata.

No automatic token swap integration is included: users obtain the canonical token through supported exchanges/launch interfaces after launch. The game accepts existing balances via ERC-20 allowance and OutpostStore. Never substitute a random similarly named token.

## Market adapter

`GET https://api.robinhood.com/rhj/prices/{symbol}` expects quotes containing tokenSymbol, bid, ask, generatedAt and isTradingHalt. This uses underlying equity quotes, not token-adjusted balances or ownership. It rejects invalid/stale/future/wide/halted quotes, stores the first valid daily snapshot, and freezes it for subsequent games that UTC day. The baseline is the previous successful captured price, which can span more than one day after outages. First valid sample is neutral. Daily challenge always uses neutral costs regardless of this feed.

A move above +1% adds 1 Supply to Develop; below -1% adds 1 to Scout; otherwise none. The choice is a transparent game scenario rule, not financial advice or a prediction model. Failed retrieval returns a neutral scenario and never fabricates a live quote. Historical frozen quotes show their snapshot label/time in the API; their status means sourced from a live feed at capture, not a continuously updating market price.

## API and authority

Guest session bootstrap: POST `/api/session`, then use returned CSRF on all mutations. Wallet authentication is a one-use domain/chain/address/nonce/expiry-bound EIP-191 challenge. First connect leads to one-time POST `/api/onboarding` (name, faction 0–2, stance). Saved details appear in `/api/bootstrap` and are projected into the local island by a same-origin message. A verified existing wallet restores its original profile; guest progress is not merged automatically. Checkout quotes are refused until the linked captain finishes onboarding.

The client submits only an order and expected round. The server owns board state, validation, deadlines, agents and outcomes. Clients cannot submit XP, supply, winners, inventory or a replay digest. Active opponent state is projected through fog. Finished replays are public by ID; users should not put sensitive information in captain names.

The server is the gameplay trust authority. SQLite hash chains detect inconsistent stored receipts but do not stop a malicious operator from rewriting the entire chain. Blockchain is used for cosmetic payments only.
