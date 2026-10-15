import type { DB } from "./db";
import type { Config } from "./config";
import { scenario, type Market } from "../shared/game";
export async function market(db: DB, c: Config): Promise<Market> {
  const day = new Date().toISOString().slice(0, 10);
  if (c.marketMode !== "robinhood") return scenario(day);
  const cached = db
    .prepare("SELECT value FROM cache WHERE key=?")
    .get("market:" + day) as any;
  if (cached) return JSON.parse(cached.value);
  try {
    const r = await fetch(
      `https://api.robinhood.com/rhj/prices/${encodeURIComponent(c.symbol)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!r.ok) throw Error("Quote unavailable");
    const b: any = await r.json();
    const q = b.quotes?.find((x: any) => x.tokenSymbol === c.symbol);
    const bid = Number(q?.bid),
      ask = Number(q?.ask),
      stamp = Date.parse(q?.generatedAt);
    if (
      !q ||
      q.isTradingHalt ||
      !Number.isFinite(stamp) ||
      Date.now() - stamp > 120000 ||
      stamp > Date.now() + 30000 ||
      !Number.isFinite(bid) ||
      !Number.isFinite(ask) ||
      bid <= 0 ||
      ask < bid ||
      (ask - bid) / bid > 0.02
    )
      throw Error("Stale, halted or wide quote");
    const price = (bid + ask) / 2;
    const baseKey = "baseline:" + c.symbol;
    const prior = db
      .prepare("SELECT value FROM cache WHERE key=?")
      .get(baseKey) as any;
    const baseline = prior ? Number(prior.value) : price;
    const move = price / baseline - 1;
    const result: Market = {
      status: "live",
      label:
        move > 0.01
          ? "Materials in demand"
          : move < -0.01
            ? "Routes under pressure"
            : "Quiet markets",
      detail:
        "Robinhood underlying equity quote, frozen for this UTC day. At most one Supply surcharge; no asset ownership or yield.",
      source: `Robinhood ${c.symbol} underlying quote`,
      timestamp: stamp,
      affected: move > 0.01 ? "develop" : move < -0.01 ? "scout" : "none",
      surcharge: Math.abs(move) > 0.01 ? 1 : 0,
      price,
      baseline,
    };
    db.prepare("INSERT OR REPLACE INTO cache VALUES (?,?)").run(
      "market:" + day,
      JSON.stringify(result),
    );
    db.prepare("INSERT OR REPLACE INTO cache VALUES (?,?)").run(
      baseKey,
      String(price),
    );
    return result;
  } catch {
    return {
      status: "stale",
      label: "Neutral frontier",
      detail:
        "A fresh verified quote is unavailable. Market surcharge is disabled.",
      source: "Robinhood feed unavailable",
      timestamp: Date.now(),
      affected: "none",
      surcharge: 0,
    };
  }
}
