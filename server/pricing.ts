import { formatUnits, parseUnits } from "ethers";
import type { Config } from "./config";

// A beta merchant tariff is allowed only for worthless testnet tokens. A
// mainnet token order needs a fresh independently operated market-price feed.
export async function rivalAmount(c: Config, cents: number) {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw Error("Invalid price");
  if (c.chainId === 46630) {
    if (!c.tokenUnitsPerDollar) throw Error("Testnet RIVAL tariff is not configured");
    const units = parseUnits(c.tokenUnitsPerDollar, c.tokenDecimals);
    if (units <= 0n) throw Error("Invalid testnet RIVAL tariff");
    const amount = (units * BigInt(cents) + 99n) / 100n;
    const priceUsd6 = (10n ** BigInt(c.tokenDecimals) * 1000000n) / units;
    if (priceUsd6 <= 0n) throw Error("Testnet tariff exceeds price precision");
    return { amount, priceUsd6: priceUsd6.toString(), observedAt: Math.floor(Date.now() / 1000),
      display: formatUnits(amount, c.tokenDecimals) + " tRIVAL", source: "testnet merchant tariff" };
  }
  if (!c.rivalPriceUrl || !c.rivalMinPriceUsd || !c.rivalMaxPriceUsd ||
      !c.rivalPriceUrl.startsWith("https://"))
    throw Error("RIVAL live pricing is not configured");
  const response = await fetch(c.rivalPriceUrl, { signal: AbortSignal.timeout(3500), cache: "no-store" });
  if (!response.ok) throw Error("RIVAL price service unavailable");
  const q = await response.json() as Record<string, unknown>;
  if (q.chainId !== c.chainId || String(q.token).toLowerCase() !== c.token.toLowerCase() ||
      String(q.stable).toLowerCase() !== c.stable.toLowerCase())
    throw Error("RIVAL price pair mismatch");
  const asOf = Date.parse(String(q.asOf));
  if (!Number.isFinite(asOf) || asOf > Date.now() || Date.now() - asOf > 10000)
    throw Error("RIVAL price is stale");
  if (!Number.isInteger(q.spreadBps) || Number(q.spreadBps) < 0 || Number(q.spreadBps) > 200)
    throw Error("RIVAL spread is too wide");
  const price = parseUnits(String(q.priceUsd), 6);
  const min = parseUnits(c.rivalMinPriceUsd, 6);
  const max = parseUnits(c.rivalMaxPriceUsd, 6);
  if (min <= 0n || min >= max || price < min || price > max)
    throw Error("RIVAL market price outside operator bounds");
  const numerator = BigInt(cents) * 10n ** BigInt(c.tokenDecimals) * 1000000n;
  const denominator = price * 100n;
  const amount = (numerator + denominator - 1n) / denominator;
  if (amount <= 0n) throw Error("RIVAL price too high");
  return { amount, priceUsd6: price.toString(), observedAt: Math.floor(asOf / 1000),
    display: formatUnits(amount, c.tokenDecimals) + " RIVAL", source: "live external market price" };
}
