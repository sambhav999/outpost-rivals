import { mkdirSync, writeFileSync } from "node:fs";
import { SHOP_ITEMS } from "../shared/economy";

// Sensitivities, not a Uniswap v4 pool simulation or a token-price forecast.
// The launch pool begins with single-sided liquidity; a constant-product
// reserve model would misrepresent its opening price and slippage.
const supply = 1_000_000_000;
const referencePriceUsd = 0.001;
const prices = [0.00025, 0.001, 0.004, 0.01];
const item = SHOP_ITEMS.find(i => i.id === "season-one-aurora");
if (!item) throw Error("RIVAL-only reference cosmetic missing");
const itemUsd = item.priceCents / 100;
const cohort = { mau: 10_000, payerRate: 0.03, spendUsd: 8, rivalShare: 0.5, monthlyCostUsd: 3_000 };
const grossUsd = cohort.mau * cohort.payerRate * cohort.spendUsd;
const rivalGrossUsd = grossUsd * cohort.rivalShare;
const stableGrossUsd = grossUsd - rivalGrossUsd;
const retirementUsdAtQuote = rivalGrossUsd * 0.2;
const treasuryRivalUsdAtQuote = rivalGrossUsd * 0.8;
const treasuryRivalTokens = treasuryRivalUsdAtQuote / referencePriceUsd;
const itemTokensAtReference = itemUsd / referencePriceUsd;

const atFreshQuote = prices.map(priceUsd => {
  const itemTokens = itemUsd / priceUsd;
  const retiredCohortTokens = retirementUsdAtQuote / priceUsd;
  return {
    priceUsd, illustrativeFdvUsd: priceUsd * supply,
    itemUsd, itemTokens, itemRetiredTokens: itemTokens * 0.2,
    cohortRivalCheckoutUsdAtQuote: rivalGrossUsd,
    cohortRetiredTokens: retiredCohortTokens,
    cohortRetiredPercentOfIssuedSupply: retiredCohortTokens / supply * 100,
  };
});
const signedQuoteShock = [0.25, 1, 4].map(factor => {
  const executionPriceUsd = referencePriceUsd * factor;
  return {
    factor, quotedPriceUsd: referencePriceUsd, executionPriceUsd,
    fixedSignedItemTokens: itemTokensAtReference,
    buyerTokenValueAtExecutionUsd: itemTokensAtReference * executionPriceUsd,
    merchantTreasuryValueAtExecutionUsd: itemTokensAtReference * 0.8 * executionPriceUsd,
    retirementValueAtExecutionUsd: itemTokensAtReference * 0.2 * executionPriceUsd,
    rejectsIfMoveObservedBeforeFreshProof: factor < 0.97 || factor > 1.03,
    rejectsIfMoveOccursAfterValidProof: false,
    proofMaximumAgeSeconds: 20,
  };
});
const treasuryMarkToMarket = prices.map(priceUsd => ({
  priceUsd,
  stableGrossUsd,
  treasuryRivalTokens,
  treasuryTokenValueIfRealizedUsd: treasuryRivalTokens * priceUsd,
  netIfFullyRealizedBeforeFeesSlippageAndTaxUsd:
    stableGrossUsd + treasuryRivalTokens * priceUsd - cohort.monthlyCostUsd,
}));
const flowPaths = [
  { scenario: "All token payers buy fresh; treasury immediately sells", freshMarketBuysUsd: rivalGrossUsd, treasuryMarketSellsUsd: treasuryRivalUsdAtQuote, netDirectionUsdAtQuote: retirementUsdAtQuote },
  { scenario: "Token payers use existing balances; treasury sells", freshMarketBuysUsd: 0, treasuryMarketSellsUsd: treasuryRivalUsdAtQuote, netDirectionUsdAtQuote: -treasuryRivalUsdAtQuote },
  { scenario: "All token payers buy fresh; treasury holds", freshMarketBuysUsd: rivalGrossUsd, treasuryMarketSellsUsd: 0, netDirectionUsdAtQuote: rivalGrossUsd },
];
const result = {
  kind: "illustrative price sensitivity; not a price or slippage prediction",
  assumptions: { issuedSupply: supply, referencePriceUsd, itemId: item.id, ...cohort,
    liveO1PoolStateUsed: false, feeAndSlippageExcluded: true,
    futureRepeatPurchasesAssumed: false },
  atFreshQuote, signedQuoteShock, treasuryMarkToMarket, flowPaths,
  limits: "Single-sided Uniswap v4 opening pool, trading fee, slippage, external trades, USDG depeg, creator-fee claims, gas and behavioral response are excluded. v1.4 requires a recent signer-attested price within 3% of the original quote; an actual spot move after attestation remains a risk for up to 20 seconds. Retirement transfers to dead address, but ERC-20 totalSupply does not fall.",
};
mkdirSync("reports", { recursive: true });
writeFileSync("reports/launch-price-stress.json", JSON.stringify(result, null, 2));
console.table(atFreshQuote);
console.table(signedQuoteShock);
console.table(flowPaths);
