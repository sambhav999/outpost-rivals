import { mkdirSync, writeFileSync } from "node:fs";
const scenarios = [
  { name: "Small", mau: 1000, conversion: 0.02, spend: 6, cost: 500 },
  { name: "Growing", mau: 10000, conversion: 0.03, spend: 8, cost: 3000 },
  { name: "Established", mau: 50000, conversion: 0.04, spend: 10, cost: 15000 },
].map((s) => {
  const gross = s.mau * s.conversion * s.spend,
    tokenShare = 0.5,
    retirement = gross * tokenShare * 0.2,
    treasury = gross - retirement;
  return {
    ...s,
    grossCosmeticRevenueUsdEquivalent: gross,
    tokenCheckoutShareAssumption: tokenShare,
    retiredUsdEquivalentAtCheckout: retirement,
    treasuryUsdEquivalent: treasury,
    monthlyCostAssumption: s.cost,
    netBeforeTaxesAndSlippage: treasury - s.cost,
    breakEvenPayingUsers: Math.ceil(s.cost / (s.spend * 0.9)),
  };
});
mkdirSync("reports", { recursive: true });
writeFileSync(
  "reports/economics.json",
  JSON.stringify(
    {
      warning:
        "Illustrative assumptions, not forecasts. Token receipts are volatile and not guaranteed realizable cash. No token price appreciation modeled. Launch fees excluded.",
      scenarios,
    },
    null,
    2,
  ),
);
console.table(scenarios);
