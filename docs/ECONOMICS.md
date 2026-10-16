# Economy and launch specification

## Separation of systems

**Supply** is a match-only strategic resource: start 5, normal per-round income 3, two paid income upgrades maximum, captured supply posts add income, total round income capped 6 and carried supply capped 15. It cannot be bought, transferred or redeemed. **XP** is nontransferable reputation. **RIVAL** is optional external cosmetic payment; holding more never changes combat.

Cosmetic prices start at 4/6/8/12 USDG equivalent. Two Season 01 visual editions accept **RIVAL only**, and the captain edition also requires three completed tactical matches. Purchases grant permanent server inventory for the SKU and change tactical cosmetics, not stats. New seasons require new authored items and measured player demand; these two one-time SKUs alone do not make repeat token demand. Other cosmetics accept USDG. Testnet mock RIVAL uses an explicitly set `TOKEN_UNITS_PER_DOLLAR` merchant tariff; this is **not** a market price. Mainnet RIVAL quotes require a fresh external price feed, bounds and pair checks; they are disabled without configuration. See `docs/PRICING.md`. USDG is a payment asset, not a guarantee against depeg. Gas is additional.

## Canonical launch

Planned token: Outpost Rivals / RIVAL. Robinhood Chain mainnet 4663, o1 Standard with USDG quote asset. The o1 Standard launch model uses a fixed 1 billion token supply into the launch liquidity pool. This design does not reserve a team, treasury, rewards or airdrop allocation. Do not publish an allocation pie chart that contradicts the actual launch. Read current configuration and the prepared plan; if the launch product changes, stop and revise the documents before signing.

No developer buy is included in preparation. Creator trading-fee income, if paid by the launchpad, is a separate contingent revenue source; the game does not depend on that income. Opening launch fees can differ drastically from normal trading fees. Review current o1 disclosure and avoid implying a flat fee during the opening period.

## Contract-enforced splits

| Checkout | Creator | Treasury | Dead address |
|---|---:|---:|---:|
| First-party RIVAL | 0% | 80% | 20% |
| First-party USDG | 0% | 100% | 0% |
| Future creator RIVAL | 90% | 8% | 2% |
| Future creator USDG | 90% | 10% | 0% |

Integer rounding remainder goes to treasury. Retirement destination: `0x000000000000000000000000000000000000dEaD`. These transfers do not decrement token `totalSupply`; use **retirement**, not claims of native supply burning. Transfers are atomic and fee-on-transfer incoming assets are rejected. The contract does not control the external token's admin powers; inspect them separately.

## Business model

Revenue comes from voluntarily purchased visual identity. A match is fully playable for free, including ranked. No paid retry, supply top-up, loss insurance, withdrawal penalty or required daily streak. Monetization is cosmetics, future curated creator sales, and optional separately negotiated sponsorship; sponsorship and creator publishing are not implemented.

`npm run economics` produces assumption-based scenarios. Example: 10,000 monthly players × 3% paying × $8 spend = $2,400 gross equivalent. If half pays RIVAL, 20% retirement on that half leaves $2,160 treasury equivalent before costs. Against $3,000 operating cost, the scenario loses $840. Token receipts may realize less after volatility and liquidity costs. This deliberately does not assume token appreciation subsidizes operations.

Demand must come from players who want the visual editions. The six current one-time SKUs total **$44** of USDG-equivalent catalog value per buyer, only **$14** of which is RIVAL-only. Buying the entire catalog in RIVAL would send $8.80 equivalent to the dead address at the quoted amounts; this is a per-buyer one-time ceiling until new releases. The amount paid in RIVAL is not necessarily the amount newly bought on a market; players may spend existing balances. A retirement rule creates a usage-linked sink, but it cannot ensure token price increases. USDG purchases do not create RIVAL demand; this release has no revenue-funded token buyback. No emissions are used to disguise negative retention or economics. The Economy screen reports confirmed checkouts in the server database and estimated contract retirement amounts, not external exchange volume or exhaustive chain history. Run `npm run economics:stress` and read `reports/DEEP_SIMULATION.md` before projecting revenue.

The post-listing sensitivity and the signed-quote volatility gap are modeled in `reports/LAUNCH_PRICE_SIMULATION.md` (`npm run launch:price-stress`). Prices and FDV there are illustrative, with no Uniswap v4 price-impact forecast.

**Pool liquidity is an observed market outcome.** o1's permanent single-sided launch position starts with the 1 billion tokens and no creator-provided USDG. Buyers add USDG to the pool; sellers take it out. Outside accounts cannot add liquidity to that locked position. The Economy page reads the o1 indexed price and USD liquidity estimate with pool/address/freshness validation and compares it to the previous recorded observation. Missing data displays as unavailable, never $0 or invented growth. This estimate is not executable sell depth, game treasury cash, FDV or a promise of higher TVL. Game receipts do not automatically buy RIVAL, add LP, or compound the o1 pool. A separate pool or staking product would require new funding, security review and its own economics; neither is implemented here. See `reports/PRICE_TVL_UPDATE.md`.

## Launch measurement

Measure first-match completion, D1/D7 player return, repeat matches, invitation-to-first-game conversion, payer conversion, net realized revenue, support burden and cost per active player. Instrument with a privacy-reviewed analytics provider before a public growth campaign; this release stores account match results and purchase receipts, not a full analytics warehouse.

Proposed product gates, not measured results: observe enough playtests to find repeated reasons to return, resolve dominant strategies and mobile friction, validate actual cosmetic willingness to pay, and demonstrate purchases without support intervention. A launchpad listing is distribution infrastructure, not evidence the game is fun.
