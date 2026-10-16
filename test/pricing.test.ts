import test from "node:test";
import assert from "node:assert/strict";
import { rivalAmount } from "../server/pricing";
import { config } from "../server/config";

test("testnet tariff is explicit; mainnet refuses missing, stale, wide or wrong-pair prices", async () => {
  const beta = { ...config, chainId: 46630, tokenUnitsPerDollar: "10", tokenDecimals: 18 };
  assert.equal((await rivalAmount(beta, 600)).amount, 60n * 10n ** 18n);
  await assert.rejects(() => rivalAmount({ ...beta, tokenUnitsPerDollar: "" }, 600));
  const live = {
    ...beta, chainId: 4663, token: "0x0000000000000000000000000000000000000001",
    stable: "0x0000000000000000000000000000000000000002",
    rivalPriceUrl: "https://example.test/quote", rivalMinPriceUsd: "0.01", rivalMaxPriceUsd: "10",
  };
  await assert.rejects(() => rivalAmount({ ...live, rivalPriceUrl: "" }, 600));
  const original = globalThis.fetch;
  const payload = { chainId: 4663, token: live.token, stable: live.stable, priceUsd: "0.25", spreadBps: 70, asOf: new Date().toISOString() };
  try {
    globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200 });
    assert.equal((await rivalAmount(live, 600)).amount, 24n * 10n ** 18n);
    globalThis.fetch = async () => new Response(JSON.stringify({ ...payload, asOf: new Date(Date.now() - 60000).toISOString() }));
    await assert.rejects(() => rivalAmount(live, 600), /stale/);
    globalThis.fetch = async () => new Response(JSON.stringify({ ...payload, spreadBps: 500 }));
    await assert.rejects(() => rivalAmount(live, 600), /spread/);
    globalThis.fetch = async () => new Response(JSON.stringify({ ...payload, token: beta.token }));
    await assert.rejects(() => rivalAmount(live, 600), /pair mismatch/);
  } finally { globalThis.fetch = original; }
});
