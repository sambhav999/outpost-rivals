import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../server/config";
import { database } from "../server/db";
import { liquidity, parsePoolSnapshot, assertTradablePool } from "../server/liquidity";

test("o1 pool data is pair-bound, fresh and tracked without inventing liquidity", async () => {
  const token = "0x0000000000000000000000000000000000000001";
  const stable = "0x0000000000000000000000000000000000000002";
  const poolId = "0x" + "a".repeat(64);
  const c = { ...config, chainId: 4663, token, stable, o1ReadApiKey: "test-read-key", minPoolLiquidityUsd: 50000 };
  const now = Date.now();
  const raw = (time: number, amount: number, price = 0.001) => ({ data: {
    chain_id: 4663, market: "standard", token: { address: token },
    launch: { quote: { address: stable }, pool_id: poolId }, pool: { pool_id: poolId },
    market_data: { data_status: "fresh", updated_at: new Date(time).toISOString(),
      price: { usd: price, quote: price }, quote_price: { usd: 1 },
      liquidity: { usd: amount }, observed_block: 123 },
  } });
  assert.equal(parsePoolSnapshot(raw(now, 51000), c).priceUsd6, "1000");
  assert.throws(() => parsePoolSnapshot(raw(now - 60000, 51000), c), /stale/);
  const wrongPair = raw(now, 51000);
  wrongPair.data.launch.quote.address = token;
  assert.throws(() => parsePoolSnapshot(wrongPair, c), /mismatch/);
  assert.throws(() => assertTradablePool(parsePoolSnapshot(raw(now, 49000), c), c, "1000"), /deeper/);
  assert.throws(() => assertTradablePool(parsePoolSnapshot(raw(now, 51000, 0.002), c), c, "1000"), /disagree/);
  const depegged = raw(now, 51000);
  depegged.data.market_data.quote_price.usd = 0.9;
  assert.throws(() => assertTradablePool(parsePoolSnapshot(depegged, c), c, "1000"), /peg/);
  const db = database(":memory:");
  let response = raw(now - 2000, 51000);
  let requests = 0;
  const service = liquidity(db, c, async () => { requests++; return new Response(JSON.stringify(response)); });
  try {
    const first = await service.get(true);
    assert.equal(first.status, "live");
    assert.equal(first.previousLiquidityUsd, undefined);
    assert.equal((await service.get()).liquidityUsd, 51000);
    assert.equal(requests, 1);
    response = raw(now, 56000);
    const second = await service.get(true);
    assert.equal(second.previousLiquidityUsd, 51000);
    assert.equal(second.previousPriceUsd, "0.001000");
    assert.equal(second.liquidityUsd, 56000);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM liquidity_observations").get() as any).n, 2);
    response = raw(now - 60000, 999999);
    const stale = await service.get(true);
    assert.equal(stale.status, "unavailable");
    assert.equal(stale.liquidityUsd, undefined);
  } finally { db.close(); }
});
