import { parseUnits } from "ethers";
import type { Config } from "./config";
import type { DB } from "./db";

type FetchLike = typeof fetch;
export type PoolSnapshot = {
  status: "live" | "unavailable";
  source: "o1 indexed Uniswap v4 market";
  reason?: string;
  priceUsd?: string;
  priceUsd6?: string;
  liquidityUsd?: number;
  usdGPriceUsd?: number;
  asOf?: string;
  poolId?: string;
  observedBlock?: number;
  previousLiquidityUsd?: number;
  previousPriceUsd?: string;
  previousAsOf?: string;
};
const source = "o1 indexed Uniswap v4 market" as const;
const positive = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x > 0;

export function parsePoolSnapshot(raw: any, c: Config, now = Date.now()): PoolSnapshot {
  const d = raw?.data, m = d?.market_data;
  if (d?.chain_id !== 4663 || d.market !== "standard" ||
      d.token?.address?.toLowerCase() !== c.token.toLowerCase() ||
      d.launch?.quote?.address?.toLowerCase() !== c.stable.toLowerCase() ||
      !/^0x[0-9a-fA-F]{64}$/.test(d.launch?.pool_id || "") ||
      d.pool?.pool_id?.toLowerCase() !== d.launch.pool_id.toLowerCase())
    throw Error("o1 token, pair or launch pool mismatch");
  const at = Date.parse(m?.updated_at || "");
  if (m?.data_status !== "fresh" || !Number.isFinite(at) ||
      at > now + 2000 || now - at > 30000)
    throw Error("o1 market observation unavailable or stale");
  if (!positive(m?.price?.usd) || !positive(m?.price?.quote) ||
      !positive(m?.quote_price?.usd) ||
      typeof m?.liquidity?.usd !== "number" ||
      !Number.isFinite(m.liquidity.usd) || m.liquidity.usd < 0 ||
      !Number.isSafeInteger(m?.observed_block) || m.observed_block <= 0)
    throw Error("o1 market price, liquidity or coverage missing");
  const priceUsd6 = parseUnits(m.price.usd.toFixed(6), 6);
  if (priceUsd6 <= 0n) throw Error("o1 price below quote precision");
  return { status: "live", source, priceUsd: m.price.usd.toFixed(6),
    priceUsd6: priceUsd6.toString(), liquidityUsd: m.liquidity.usd,
    usdGPriceUsd: m.quote_price.usd, asOf: new Date(at).toISOString(),
    poolId: d.launch.pool_id, observedBlock: m.observed_block };
}

export function assertTradablePool(p: PoolSnapshot, c: Config, quotePriceUsd6: string) {
  if (p.status !== "live") throw Error("RIVAL market unavailable: " + p.reason);
  if (p.liquidityUsd! < c.minPoolLiquidityUsd)
    throw Error("RIVAL checkout waits for deeper verified pool liquidity");
  if (p.usdGPriceUsd! < 0.98 || p.usdGPriceUsd! > 1.02)
    throw Error("USDG reference is outside the checkout peg band");
  const feed = BigInt(quotePriceUsd6), indexed = BigInt(p.priceUsd6!);
  if (feed <= 0n || indexed * 10000n < feed * 9800n || indexed * 10000n > feed * 10200n)
    throw Error("Independent o1 pool price and quote feed disagree");
}

export function liquidity(db: DB, c: Config, fetcher: FetchLike = fetch) {
  let cached: PoolSnapshot | undefined, cachedAt = 0;
  let inFlight: Promise<PoolSnapshot> | undefined;
  async function load(): Promise<PoolSnapshot> {
    if (c.chainId !== 4663 || !c.o1ReadApiKey || !c.token || !c.stable)
      return { status: "unavailable", source, reason: "No mainnet o1 token and read API key configured" };
    try {
      const r = await fetcher(`https://api.launch.o1.exchange/v1/tokens/4663/${c.token}?include=pool,market`, {
        headers: { "x-api-key": c.o1ReadApiKey }, signal: AbortSignal.timeout(3500), cache: "no-store"
      });
      if (!r.ok) throw Error(`o1 API returned ${r.status}`);
      const snap = parsePoolSnapshot(await r.json(), c);
      const asOf = Date.parse(snap.asOf!), poolId = snap.poolId!;
      db.prepare("INSERT OR IGNORE INTO liquidity_observations(as_of,pool_id,price_usd,liquidity_usd) VALUES (?,?,?,?)")
        .run(asOf, poolId, snap.priceUsd!, snap.liquidityUsd!);
      const prev = db.prepare("SELECT as_of,price_usd,liquidity_usd FROM liquidity_observations WHERE pool_id=? AND as_of<? ORDER BY as_of DESC LIMIT 1")
        .get(poolId, asOf) as any;
      if (prev) {
        snap.previousLiquidityUsd = prev.liquidity_usd;
        snap.previousPriceUsd = prev.price_usd;
        snap.previousAsOf = new Date(prev.as_of).toISOString();
      }
      return snap;
    } catch (e: any) {
      return { status: "unavailable", source, reason: e.message || "o1 market observation failed" };
    }
  }
  async function get(force = false) {
    if (!force && cached && Date.now() - cachedAt < 10000 &&
        (cached.status !== "live" || Date.now() - Date.parse(cached.asOf!) <= 30000)) return cached;
    if (!inFlight) inFlight = load().finally(() => { inFlight = undefined; });
    const value = await inFlight;
    cached = value; cachedAt = Date.now();
    return value;
  }
  return { get };
}
