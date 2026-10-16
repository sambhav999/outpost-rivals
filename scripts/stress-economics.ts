import { mkdirSync, writeFileSync } from "node:fs";
import { SHOP_ITEMS } from "../shared/economy";

const catalogUsd = SHOP_ITEMS.reduce((sum, item) => sum + item.priceCents, 0) / 100;
const exclusiveUsd = SHOP_ITEMS.filter(item => item.payment === "rival").reduce((sum, item) => sum + item.priceCents, 0) / 100;
const stress = [
  { name: "Growth, 1% payer", mau: 10000, payerRate: .01, spend: 8, rivalShare: .5, realizationHaircut: 0, cost: 3000 },
  { name: "Growth, base", mau: 10000, payerRate: .03, spend: 8, rivalShare: .5, realizationHaircut: 0, cost: 3000 },
  { name: "Growth, 15% token haircut", mau: 10000, payerRate: .03, spend: 8, rivalShare: .5, realizationHaircut: .15, cost: 3000 },
  { name: "Growth, 5% payer", mau: 10000, payerRate: .05, spend: 8, rivalShare: .5, realizationHaircut: 0, cost: 3000 },
  { name: "Growth, all USDG", mau: 10000, payerRate: .03, spend: 8, rivalShare: 0, realizationHaircut: 0, cost: 3000 },
  { name: "Growth, all RIVAL", mau: 10000, payerRate: .03, spend: 8, rivalShare: 1, realizationHaircut: 0, cost: 3000 },
  { name: "Established, 4% payer", mau: 50000, payerRate: .04, spend: 10, rivalShare: .5, realizationHaircut: 0, cost: 15000 },
].map(s => {
  const gross = s.mau*s.payerRate*s.spend;
  const retired = gross*s.rivalShare*.2;
  const treasuryRealized = gross*(1-s.rivalShare)+gross*s.rivalShare*.8*(1-s.realizationHaircut);
  const breakEvenRate = s.cost/(s.mau*s.spend*((1-s.rivalShare)+s.rivalShare*.8*(1-s.realizationHaircut)));
  return { ...s, grossUsdEquivalent:gross, retiredUsdEquivalentAtCheckout:retired,
    treasuryRealizedUsdAssumption:Math.round(treasuryRealized), monthlyNetUsdAssumption:Math.round(treasuryRealized-s.cost),
    breakEvenPayerRatePercent:Number((breakEvenRate*100).toFixed(2)) };
});
const result = {
  catalogUsd, exclusiveUsd, maxRetirementUsdEquivalentPerBuyer: catalogUsd*.2,
  stress,
  limitations: "Assumed cohort spend, payer share and token realization. One-time catalog caps repeat spend; users may use existing RIVAL, so token payments are not automatically new market purchases. No price or liquidity impact modeled.",
};
mkdirSync("reports",{recursive:true});
writeFileSync("reports/stress-economics.json",JSON.stringify(result,null,2));
console.table(stress.map(({name,grossUsdEquivalent,retiredUsdEquivalentAtCheckout,monthlyNetUsdAssumption,breakEvenPayerRatePercent})=>({name,grossUsdEquivalent,retiredUsdEquivalentAtCheckout,monthlyNetUsdAssumption,breakEvenPayerRatePercent})));
