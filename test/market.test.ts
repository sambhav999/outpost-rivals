import test from "node:test";
import assert from "node:assert/strict";
import { database } from "../server/db";
import { market } from "../server/market";
import { config } from "../server/config";
test("market adapter freezes valid daily quotes and rejects stale or halted data", async () => {
  const original = globalThis.fetch,
    db = database(":memory:");
  const c = { ...config, marketMode: "robinhood", symbol: "NVDA" };
  let calls = 0;
  const response = (extra: any = {}) =>
    new Response(
      JSON.stringify({
        quotes: [
          {
            tokenSymbol: "NVDA",
            bid: "102",
            ask: "102.1",
            isTradingHalt: false,
            generatedAt: new Date().toISOString(),
            ...extra,
          },
        ],
      }),
    );
  try {
    db.prepare("INSERT INTO cache VALUES (?,?)").run("baseline:NVDA", "100");
    globalThis.fetch = async () => {
      calls++;
      return response();
    };
    const m = await market(db, c);
    assert.equal(m.status, "live");
    assert.equal(m.affected, "develop");
    assert.equal(m.surcharge, 1);
    await market(db, c);
    assert.equal(calls, 1);
    db.prepare("DELETE FROM cache WHERE key LIKE 'market:%'").run();
    globalThis.fetch = async () => response({ isTradingHalt: true });
    assert.equal((await market(db, c)).status, "stale");
    globalThis.fetch = async () =>
      response({ generatedAt: "2020-01-01T00:00:00Z" });
    assert.equal((await market(db, c)).surcharge, 0);
    globalThis.fetch = async () => response({ bid: "NaN" });
    assert.equal((await market(db, c)).status, "stale");
  } finally {
    globalThis.fetch = original;
    db.close();
  }
});
