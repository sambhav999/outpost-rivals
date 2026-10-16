# RIVAL launchpad price and game economy — scenario stress

**Result:** A listing makes RIVAL tradable; it does not make the game profitable or force price appreciation. This is a sensitivity model, **not** a forecast of the o1 Uniswap v4 pool. It uses an **illustrative post-listing** reference price of $0.001 per RIVAL, not a real opening price or an available quote. o1 currently documents an opening FDV near **$4,000** for a USDG-paired Standard launch under its quote assumptions, far below the $1 million illustrative FDV at $0.001. Reproduce the numbers with `npm run launch:price-stress`; raw output is `reports/launch-price-stress.json`.

The planned o1 Standard/USDG launch creates **1 billion fixed-supply tokens**, all initially placed in permanent, single-sided Uniswap v4 liquidity. There is no free treasury allocation in this plan. Tokens enter wallets through market buys. Current Standard terms disclose a 1% normal trading fee and a 20-second opening period that begins at a 99% total fee on Robinhood Chain; verify live settings at launch. The fee, actual pool curve/depth, trading flows and slippage are **not** predicted here. [o1 launch planning](https://docs.o1.exchange/launchpad/launch-planning) · [o1 limits](https://docs.o1.exchange/launchpad/reference/limits)

## Fresh quotes as market price changes

The game posts an **$8 cosmetic** price and signs the equivalent RIVAL amount from a configured fresh external feed. The server cross-checks that feed against o1's indexed pool data, but does not execute or price against a live swap quote. Mainnet token checkout fails closed without a separately supplied and vetted price service, o1 read key, and launched pool.

| Illustrative RIVAL price | $8 cosmetic costs | Tokens sent to dead address (20%) | 10k-MAU cohort tokens retired* | Illustrative FDV† |
|---:|---:|---:|---:|---:|
| $0.00025 | 32,000 | 6,400 | 960,000 | $250k |
| $0.001 | 8,000 | 1,600 | 240,000 | $1m |
| $0.004 | 2,000 | 400 | 60,000 | $4m |
| $0.01 | 800 | 160 | 24,000 | $10m |

*Cohort: 10,000 monthly active players × 3% payers × $8 average spend × 50% choosing RIVAL = $1,200 token checkout; the 20% retirement is $240 **at quote time**. These purchases are **one-time** unless new cosmetics attract returning buyers. †FDV is price times issued supply, **not cash in the pool or realizable proceeds**. As price rises, fewer tokens are needed for the same cosmetic and fewer units are retired. Dead-address transfers do not decrement ERC-20 `totalSupply`.

## What market flow can the same game sales create?

At the $0.001 reference price, 150 token-paying buyers spend $1,200 equivalent; the contract routes $240 equivalent to a dead address and $960 equivalent to the treasury. Behavior changes the market flow:

| Buyer and treasury action | Fresh token purchases | Treasury token sales | Approximate net buy/sell at unchanged price* |
|---|---:|---:|---:|
| Buyers acquire token; treasury sells receipts | $1,200 | $960 | +$240 buy |
| Buyers spend existing holdings; treasury sells | $0 | $960 | −$960 sell |
| Buyers acquire token; treasury holds receipts | $1,200 | $0 | +$1,200 buy; treasury bears price risk |

*A **directional accounting identity**, not actual price impact. It excludes swap fees, slippage, other traders, liquidity distribution and routes outside the launch pool. One buyer may already hold RIVAL, so checkout does not prove a new market buy. Creator trading-fee claims, if any, are separate from the game sales and excluded.

If the treasury holds its 960,000 tokens after this cohort pays at $0.001, then liquidates later, its token receipts would be worth **$240** at $0.00025, **$960** at $0.001, and **$3,840** at $0.004 before trading costs/price impact. Adding the $1,200 stablecoin sales and deducting an assumed $3,000 monthly cost yields **−$1,560 / −$840 / +$2,040** respectively. The last is a hypothetical fully realized windfall, not recurring game revenue. A 3% payer rate and six one-time items cannot be assumed to repeat monthly for the same cohort.

## Signed-quote shock and the v1.4 price check

Suppose the feed quotes an $8 item at $0.001: the signed order requests **8,000 RIVAL**. The contract locks that quantity until expiry; it does **not** read the market price at purchase.

| Spot when transaction lands | Token value paid for nominal $8 item | Treasury value (80%) | Dead-address value (20%) |
|---:|---:|---:|---:|
| Falls to $0.00025 | $2.00 | $1.60 | $0.40 |
| Remains $0.001 | $8.00 | $6.40 | $1.60 |
| Rises to $0.004 | $32.00 | $25.60 | $6.40 |

In v1.4, the contract requires a second signed `PriceCheck` tied to the order. The signer issues it from a fresh feed only when its price is within **3%** of the original quote, and the contract checks the signature and a maximum **20-second** observation window. Thus a 4× rise or 75% fall **observed before proof issuance is rejected**. The table above applies if that price move occurs **after a valid proof** but before inclusion. The signer and feed remain trusted, the proof can expire during wallet confirmation, and the contract does not independently consult a DEX oracle. The o1 indexer's address/price/liquidity check also fails closed if the data is missing, stale, below a $50,000 estimated liquidity threshold or more than 2% from the external feed. This estimate is not guaranteed executable liquidity.

Protect both buyers and treasury: **use USDG checkout at initial listing and enable RIVAL checkout only after real market depth, mobile wallet timing QA and an independently reviewed pricing path**. Do not claim that the current proof catches a sudden move inside its 20-second validity interval.

## Decision

Keep the game economy in dollar units and quote a variable token quantity. Do not set an $8 item to a permanent 8,000 RIVAL: at 4× price it becomes a $32 cosmetic, and at ¼ price a $2 cosmetic. Do not add emissions or trading rewards to manufacture volume. Launchpad listing and cosmetic retirement are weak support for price on their own; prove player retention, repeated voluntary spending, fresh market acquisition, and net realized revenue before making token economics central to the game.
