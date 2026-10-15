import "../server/config";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { getAddress } from "ethers";
const api = "https://api.launch.o1.exchange/v1",
  key = process.env.O1_API_KEY;
if (!key) throw Error("O1_API_KEY required");
const creator = getAddress(process.env.LAUNCH_CREATOR || ""),
  website = process.env.PUBLIC_WEBSITE;
if (!website?.startsWith("https://"))
  throw Error("Public HTTPS website required");
const headers = { "x-api-key": key, "Content-Type": "application/json" };
async function call(path: string, body?: any) {
  const r = await fetch(api + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...headers,
      ...(body ? { "Idempotency-Key": randomUUID() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const data = await r.json();
  if (!r.ok) throw Error(JSON.stringify(data));
  return data;
}
const live = await call("/config?chain_id=4663&market=standard");
writeFileSync("launch-config.json", JSON.stringify(live, null, 2));
// Prepare only. Configuration/fees/availability are reviewed by developer before signing.
const prepared = await call("/launches/prepare", {
  chain_id: 4663,
  creator,
  market: "standard",
  quote_address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  token: {
    name: "Outpost Rivals",
    symbol: "RIVAL",
    description:
      "Cosmetic utility for Outpost Rivals, a compact agent-led strategy game. No yield or price promise.",
    website,
    editable_metadata: false,
    extra_metadata: [],
    image_base64: readFileSync(
      process.env.TOKEN_IMAGE || "public/token.png",
    ).toString("base64"),
    image_type: "image/png",
  },
});
writeFileSync("launch-prepared.json", JSON.stringify(prepared, null, 2));
console.log(
  "Unsigned plan saved. Inspect simulation, fees, expiry, predicted token, allocations and every transaction before developer signs. No token was launched.",
);
